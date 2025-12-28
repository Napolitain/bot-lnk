import type { CDPSession, Page } from 'playwright';
import type {
  MemoryMetrics,
  MetricsConfig,
  MetricsSnapshot,
  NetworkMetrics,
  PerformanceMetrics,
  ResourceMetrics,
} from './types.js';

/** Track in-flight requests */
interface PendingRequest {
  url: string;
  type: string;
  method: string;
  startTime: number;
}

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
  private pendingRequests: Map<string, PendingRequest> = new Map();

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
        this.setupNetworkListeners();
      }

      console.log('[Metrics] CDP session initialized');
    } catch (error) {
      console.warn('[Metrics] Failed to initialize CDP:', error);
      this.config.enabled = false;
    }
  }

  /**
   * Setup CDP network event listeners to track resource timings
   */
  private setupNetworkListeners(): void {
    if (!this.cdpSession) return;

    // Track request start
    this.cdpSession.on('Network.requestWillBeSent', (params) => {
      this.pendingRequests.set(params.requestId, {
        url: params.request.url,
        type: params.type || 'Other',
        method: params.request.method,
        startTime: Date.now(),
      });
    });

    // Track request completion
    this.cdpSession.on('Network.loadingFinished', (params) => {
      const pending = this.pendingRequests.get(params.requestId);
      if (pending && this.currentLabel) {
        const resource: ResourceMetrics = {
          url: pending.url,
          type: pending.type,
          method: pending.method,
          status: 200, // Will be updated by responseReceived if available
          startTime: pending.startTime - this.startTime,
          duration: Date.now() - pending.startTime,
          encodedBodySize: params.encodedDataLength || 0,
          decodedBodySize: params.encodedDataLength || 0, // CDP doesn't always provide decoded
          transferSize: params.encodedDataLength || 0,
        };
        this.resourceTimings.push(resource);
      }
      this.pendingRequests.delete(params.requestId);
    });

    // Track response status
    this.cdpSession.on('Network.responseReceived', (params) => {
      // Update pending request with status info if needed
      const pending = this.pendingRequests.get(params.requestId);
      if (pending) {
        // Status will be captured when loadingFinished fires
        // For now, store it on the pending object
        (pending as PendingRequest & { status?: number }).status =
          params.response.status;
      }
    });

    // Track failed requests
    this.cdpSession.on('Network.loadingFailed', (params) => {
      const pending = this.pendingRequests.get(params.requestId);
      if (pending && this.currentLabel) {
        const resource: ResourceMetrics = {
          url: pending.url,
          type: pending.type,
          method: pending.method,
          status: 0, // Failed
          startTime: pending.startTime - this.startTime,
          duration: Date.now() - pending.startTime,
          encodedBodySize: 0,
          decodedBodySize: 0,
          transferSize: 0,
        };
        this.resourceTimings.push(resource);
      }
      this.pendingRequests.delete(params.requestId);
    });
  }

  /**
   * Start collecting metrics for a labeled period
   */
  startPeriod(label: string): void {
    if (!this.config.enabled) return;

    this.currentLabel = label;
    this.startTime = Date.now();
    this.resourceTimings = [];
    this.pendingRequests.clear();

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
        // Note: CDP doesn't provide heap limit directly. Using totalSize as a reasonable proxy.
        // For precise limits, consider using performance.memory API if available.
        jsHeapSizeLimit: heapUsage.totalSize,
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
    const totalHeapMB = snapshot.memory.totalJSHeapSize / (1024 * 1024);
    const transferMB = snapshot.network.totalTransferSize / (1024 * 1024);

    console.log(`\n[Metrics] ═══ ${snapshot.label} (${snapshot.duration}ms) ═══`);
    
    // Memory details
    console.log(`  Memory:`);
    console.log(`    JS Heap: ${memoryMB.toFixed(2)} MB used / ${totalHeapMB.toFixed(2)} MB total`);
    console.log(`    DOM: ${snapshot.memory.nodes} nodes, ${snapshot.memory.documents} documents, ${snapshot.memory.jsEventListeners} listeners`);
    
    // CPU details
    console.log(`  CPU:`);
    console.log(`    Script: ${snapshot.performance.scriptDuration.toFixed(2)}ms, Layout: ${snapshot.performance.layoutDuration.toFixed(2)}ms`);
    console.log(`    Task: ${snapshot.performance.taskDuration.toFixed(2)}ms, Style recalc: ${snapshot.performance.recalcStyleDuration.toFixed(2)}ms`);
    console.log(`    Layout count: ${snapshot.performance.layoutCount}, Style recalc count: ${snapshot.performance.recalcStyleCount}`);
    
    // Network summary
    console.log(`  Network: ${snapshot.network.totalRequests} requests, ${transferMB.toFixed(2)} MB transfer`);

    // All resource types by transfer size
    const allTypes = Array.from(snapshot.network.transferByType.entries())
      .sort((a, b) => b[1] - a[1]);
    if (allTypes.length > 0) {
      console.log('  By type:');
      for (const [type, size] of allTypes) {
        const count = snapshot.network.requestsByType.get(type) || 0;
        const sizeMB = size / (1024 * 1024);
        const sizeKB = size / 1024;
        const sizeStr = sizeMB >= 0.1 ? `${sizeMB.toFixed(2)} MB` : `${sizeKB.toFixed(1)} KB`;
        console.log(`    ${type}: ${count} req, ${sizeStr}`);
      }
    }

    // Top 10 individual resources by size
    if (snapshot.resources.length > 0) {
      const topBySize = [...snapshot.resources]
        .sort((a, b) => b.transferSize - a.transferSize)
        .slice(0, 10);
      console.log('  Top resources by size:');
      for (const res of topBySize) {
        const sizeKB = res.transferSize / 1024;
        const url = this.truncateUrl(res.url, 60);
        console.log(`    ${sizeKB.toFixed(1)} KB | ${res.type} | ${url}`);
      }
    }

    // Top 5 slowest resources
    if (snapshot.resources.length > 0) {
      const topByDuration = [...snapshot.resources]
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 5);
      console.log('  Slowest resources:');
      for (const res of topByDuration) {
        const url = this.truncateUrl(res.url, 60);
        console.log(`    ${res.duration}ms | ${res.type} | ${url}`);
      }
    }
  }

  /**
   * Truncate URL for display
   */
  private truncateUrl(url: string, maxLength: number): string {
    if (url.length <= maxLength) return url;
    const half = Math.floor((maxLength - 3) / 2);
    return `${url.slice(0, half)}...${url.slice(-half)}`;
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
