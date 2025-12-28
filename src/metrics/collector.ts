import type { CDPSession, Page } from 'playwright';
import type {
  MemoryMetrics,
  MetricsConfig,
  MetricsSnapshot,
  NetworkMetrics,
  PerformanceMetrics,
  ResourceMetrics,
} from './types.js';

/**
 * MetricsCollector uses Chrome DevTools Protocol (CDP) to collect
 * fine-grained performance metrics including CPU time, memory usage,
 * and per-resource network timings.
 */
export class MetricsCollector {
  private cdpSession: CDPSession | null = null;
  private config: MetricsConfig;
  private snapshots: MetricsSnapshot[] = [];
  private currentLabel: string | null = null;
  private startTime: number = 0;
  private resourceTimings: ResourceMetrics[] = [];

  constructor(config: MetricsConfig) {
    this.config = config;
  }

  /**
   * Initialize CDP session and enable required domains
   */
  async initialize(page: Page): Promise<void> {
    if (!this.config.enabled) return;

    try {
      this.cdpSession = await page.context().newCDPSession(page);

      // Enable Performance domain for CPU/rendering metrics
      if (this.config.collectPerformance) {
        await this.cdpSession.send('Performance.enable');
      }

      // Enable Network domain for resource metrics
      if (this.config.collectResources) {
        await this.cdpSession.send('Network.enable');
      }

      console.log('[Metrics] CDP session initialized');
    } catch (error) {
      console.warn('[Metrics] Failed to initialize CDP:', error);
      this.config.enabled = false;
    }
  }

  /**
   * Start collecting metrics for a labeled period
   */
  startPeriod(label: string): void {
    if (!this.config.enabled) return;

    this.currentLabel = label;
    this.startTime = Date.now();
    this.resourceTimings = [];

    if (this.config.logToConsole) {
      console.log(`[Metrics] Started period: ${label}`);
    }
  }

  /**
   * End the current period and capture a snapshot
   */
  async endPeriod(): Promise<MetricsSnapshot | null> {
    if (!this.config.enabled || !this.currentLabel) return null;

    const timestamp = Date.now();
    const duration = timestamp - this.startTime;
    const label = this.currentLabel;

    try {
      const [memory, performance, network] = await Promise.all([
        this.collectMemoryMetrics(),
        this.collectPerformanceMetrics(),
        this.collectNetworkMetrics(),
      ]);

      const snapshot: MetricsSnapshot = {
        timestamp,
        label,
        duration,
        memory,
        performance,
        network,
        resources: this.config.collectResources
          ? this.resourceTimings.slice(-this.config.maxResourcesPerSnapshot)
          : [],
      };

      this.snapshots.push(snapshot);
      this.currentLabel = null;
      this.startTime = 0;

      if (this.config.logToConsole) {
        this.logSnapshot(snapshot);
      }

      return snapshot;
    } catch (error) {
      console.warn(`[Metrics] Failed to collect snapshot for ${label}:`, error);
      return null;
    }
  }

  /**
   * Collect memory usage metrics
   */
  private async collectMemoryMetrics(): Promise<MemoryMetrics> {
    const timestamp = Date.now();

    if (!this.config.collectMemory || !this.cdpSession) {
      return {
        timestamp,
        usedJSHeapSize: 0,
        totalJSHeapSize: 0,
        jsHeapSizeLimit: 0,
        documents: 0,
        nodes: 0,
        jsEventListeners: 0,
      };
    }

    try {
      // Get heap usage
      const heapUsage = await this.cdpSession.send('Runtime.getHeapUsage');

      // Get DOM node count and other stats
      let domStats = { documents: 0, nodes: 0, jsEventListeners: 0 };
      try {
        const _dom = await this.cdpSession.send('DOM.getDocument');
        const domCounters = await this.cdpSession.send('Memory.getDOMCounters');
        domStats = {
          documents: domCounters.documents || 0,
          nodes: domCounters.nodes || 0,
          jsEventListeners: domCounters.jsEventListeners || 0,
        };
      } catch {
        // DOM methods might not be available, use defaults
      }

      return {
        timestamp,
        usedJSHeapSize: heapUsage.usedSize,
        totalJSHeapSize: heapUsage.totalSize,
        jsHeapSizeLimit: heapUsage.usedSize * 2, // estimate
        ...domStats,
      };
    } catch (error) {
      console.warn('[Metrics] Failed to collect memory metrics:', error);
      return {
        timestamp,
        usedJSHeapSize: 0,
        totalJSHeapSize: 0,
        jsHeapSizeLimit: 0,
        documents: 0,
        nodes: 0,
        jsEventListeners: 0,
      };
    }
  }

  /**
   * Collect CPU and rendering performance metrics
   */
  private async collectPerformanceMetrics(): Promise<PerformanceMetrics> {
    const timestamp = Date.now();

    if (!this.config.collectPerformance || !this.cdpSession) {
      return {
        timestamp,
        taskDuration: 0,
        scriptDuration: 0,
        layoutDuration: 0,
        recalcStyleDuration: 0,
        layoutCount: 0,
        recalcStyleCount: 0,
      };
    }

    try {
      const metrics = await this.cdpSession.send('Performance.getMetrics');

      // Extract relevant metrics from the array
      const metricMap = new Map(
        metrics.metrics.map((m: { name: string; value: number }) => [
          m.name,
          m.value,
        ]),
      );

      return {
        timestamp,
        taskDuration: (metricMap.get('TaskDuration') as number) || 0,
        scriptDuration: (metricMap.get('ScriptDuration') as number) || 0,
        layoutDuration: (metricMap.get('LayoutDuration') as number) || 0,
        recalcStyleDuration:
          (metricMap.get('RecalcStyleDuration') as number) || 0,
        layoutCount: (metricMap.get('LayoutCount') as number) || 0,
        recalcStyleCount: (metricMap.get('RecalcStyleCount') as number) || 0,
      };
    } catch (error) {
      console.warn('[Metrics] Failed to collect performance metrics:', error);
      return {
        timestamp,
        taskDuration: 0,
        scriptDuration: 0,
        layoutDuration: 0,
        recalcStyleDuration: 0,
        layoutCount: 0,
        recalcStyleCount: 0,
      };
    }
  }

  /**
   * Collect network performance metrics
   */
  private async collectNetworkMetrics(): Promise<NetworkMetrics> {
    const timestamp = Date.now();

    const requestsByType = new Map<string, number>();
    const transferByType = new Map<string, number>();
    let totalTransferSize = 0;
    let totalEncodedBodySize = 0;
    let totalDecodedBodySize = 0;

    for (const resource of this.resourceTimings) {
      const count = requestsByType.get(resource.type) || 0;
      requestsByType.set(resource.type, count + 1);

      const transfer = transferByType.get(resource.type) || 0;
      transferByType.set(resource.type, transfer + resource.transferSize);

      totalTransferSize += resource.transferSize;
      totalEncodedBodySize += resource.encodedBodySize;
      totalDecodedBodySize += resource.decodedBodySize;
    }

    return {
      timestamp,
      totalRequests: this.resourceTimings.length,
      totalTransferSize,
      totalEncodedBodySize,
      totalDecodedBodySize,
      requestsByType,
      transferByType,
    };
  }

  /**
   * Record a resource timing (called from network listeners)
   */
  recordResource(resource: ResourceMetrics): void {
    if (!this.config.enabled || !this.config.collectResources) return;
    this.resourceTimings.push(resource);
  }

  /**
   * Get all collected snapshots
   */
  getSnapshots(): MetricsSnapshot[] {
    return [...this.snapshots];
  }

  /**
   * Clear all snapshots
   */
  clearSnapshots(): void {
    this.snapshots = [];
  }

  /**
   * Log a snapshot to console
   */
  private logSnapshot(snapshot: MetricsSnapshot): void {
    const memoryMB = snapshot.memory.usedJSHeapSize / (1024 * 1024);
    const transferMB = snapshot.network.totalTransferSize / (1024 * 1024);

    console.log(`[Metrics] ${snapshot.label} (${snapshot.duration}ms):`);
    console.log(`  Memory: ${memoryMB.toFixed(2)} MB`);
    console.log(
      `  CPU: ${snapshot.performance.scriptDuration.toFixed(2)}ms script, ${snapshot.performance.layoutDuration.toFixed(2)}ms layout`,
    );
    console.log(
      `  Network: ${snapshot.network.totalRequests} requests, ${transferMB.toFixed(2)} MB`,
    );

    // Show top resource types by transfer size
    const topTypes = Array.from(snapshot.network.transferByType.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    if (topTypes.length > 0) {
      console.log('  Top types:');
      for (const [type, size] of topTypes) {
        const sizeMB = size / (1024 * 1024);
        console.log(`    ${type}: ${sizeMB.toFixed(2)} MB`);
      }
    }
  }

  /**
   * Cleanup CDP session
   */
  async cleanup(): Promise<void> {
    if (this.cdpSession) {
      try {
        await this.cdpSession.detach();
      } catch {
        // Ignore cleanup errors
      }
      this.cdpSession = null;
    }
  }
}
