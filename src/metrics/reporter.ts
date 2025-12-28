import type {
  MetricsSnapshot,
  MetricsSummary,
  ResourceMetrics,
} from './types.js';

/**
 * Format metrics snapshots into a human-readable summary
 */
export function generateSummary(snapshots: MetricsSnapshot[]): MetricsSummary {
  if (snapshots.length === 0) {
    return {
      totalDuration: 0,
      avgMemoryUsedMB: 0,
      peakMemoryUsedMB: 0,
      totalTransferSizeMB: 0,
      totalRequestCount: 0,
      avgTaskDurationMs: 0,
      avgScriptDurationMs: 0,
      avgLayoutDurationMs: 0,
      topResourcesBySize: [],
      topResourcesByDuration: [],
      transferByType: new Map(),
    };
  }

  // Aggregate metrics
  let totalDuration = 0;
  let totalMemoryUsed = 0;
  let peakMemoryUsed = 0;
  let totalTransferSize = 0;
  let totalRequests = 0;
  let totalTaskDuration = 0;
  let totalScriptDuration = 0;
  let totalLayoutDuration = 0;
  const allResources: ResourceMetrics[] = [];
  const transferByType = new Map<string, number>();

  for (const snapshot of snapshots) {
    totalDuration += snapshot.duration;
    totalMemoryUsed += snapshot.memory.usedJSHeapSize;
    peakMemoryUsed = Math.max(peakMemoryUsed, snapshot.memory.usedJSHeapSize);
    totalTransferSize += snapshot.network.totalTransferSize;
    totalRequests += snapshot.network.totalRequests;
    totalTaskDuration += snapshot.performance.taskDuration;
    totalScriptDuration += snapshot.performance.scriptDuration;
    totalLayoutDuration += snapshot.performance.layoutDuration;

    allResources.push(...snapshot.resources);

    // Aggregate transfer by type
    for (const [type, size] of snapshot.network.transferByType.entries()) {
      const current = transferByType.get(type) || 0;
      transferByType.set(type, current + size);
    }
  }

  const avgMemoryUsedMB = totalMemoryUsed / snapshots.length / (1024 * 1024);
  const peakMemoryUsedMB = peakMemoryUsed / (1024 * 1024);
  const totalTransferSizeMB = totalTransferSize / (1024 * 1024);
  const avgTaskDurationMs = totalTaskDuration / snapshots.length;
  const avgScriptDurationMs = totalScriptDuration / snapshots.length;
  const avgLayoutDurationMs = totalLayoutDuration / snapshots.length;

  // Top 10 resources by size
  const topResourcesBySize = [...allResources]
    .sort((a, b) => b.transferSize - a.transferSize)
    .slice(0, 10);

  // Top 10 resources by duration
  const topResourcesByDuration = [...allResources]
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 10);

  return {
    totalDuration,
    avgMemoryUsedMB,
    peakMemoryUsedMB,
    totalTransferSizeMB,
    totalRequestCount: totalRequests,
    avgTaskDurationMs,
    avgScriptDurationMs,
    avgLayoutDurationMs,
    topResourcesBySize,
    topResourcesByDuration,
    transferByType,
  };
}

/**
 * Print a formatted summary to console
 */
export function printSummary(summary: MetricsSummary): void {
  console.log('\n========== Performance Metrics Summary ==========');
  console.log(`Total Duration: ${(summary.totalDuration / 1000).toFixed(2)}s`);
  console.log(
    `Memory: Avg ${summary.avgMemoryUsedMB.toFixed(2)} MB, Peak ${summary.peakMemoryUsedMB.toFixed(2)} MB`,
  );
  console.log(
    `CPU: Avg task ${summary.avgTaskDurationMs.toFixed(2)}ms, script ${summary.avgScriptDurationMs.toFixed(2)}ms, layout ${summary.avgLayoutDurationMs.toFixed(2)}ms`,
  );
  console.log(
    `Network: ${summary.totalRequestCount} requests, ${summary.totalTransferSizeMB.toFixed(2)} MB total`,
  );

  // Transfer by type
  if (summary.transferByType.size > 0) {
    console.log('\nTransfer by Resource Type:');
    const sortedTypes = Array.from(summary.transferByType.entries()).sort(
      (a, b) => b[1] - a[1],
    );
    for (const [type, size] of sortedTypes) {
      const sizeMB = size / (1024 * 1024);
      console.log(`  ${type}: ${sizeMB.toFixed(2)} MB`);
    }
  }

  // Top resources by size
  if (summary.topResourcesBySize.length > 0) {
    console.log('\nTop 10 Resources by Size:');
    for (const resource of summary.topResourcesBySize) {
      const sizeMB = resource.transferSize / (1024 * 1024);
      const url = truncateUrl(resource.url, 80);
      console.log(`  ${sizeMB.toFixed(2)} MB - ${resource.type} - ${url}`);
    }
  }

  // Top resources by duration
  if (summary.topResourcesByDuration.length > 0) {
    console.log('\nTop 10 Resources by Duration:');
    for (const resource of summary.topResourcesByDuration) {
      const url = truncateUrl(resource.url, 80);
      console.log(
        `  ${resource.duration.toFixed(0)}ms - ${resource.type} - ${url}`,
      );
    }
  }

  console.log('================================================\n');
}

/**
 * Print individual snapshots to console
 */
export function printSnapshots(snapshots: MetricsSnapshot[]): void {
  console.log('\n========== Detailed Metrics by Phase ==========');
  for (const snapshot of snapshots) {
    const memoryMB = snapshot.memory.usedJSHeapSize / (1024 * 1024);
    const transferMB = snapshot.network.totalTransferSize / (1024 * 1024);

    console.log(`\n[${snapshot.label}] (${snapshot.duration}ms)`);
    console.log(`  Memory: ${memoryMB.toFixed(2)} MB`);
    console.log(
      `  CPU: task ${snapshot.performance.taskDuration.toFixed(2)}ms, script ${snapshot.performance.scriptDuration.toFixed(2)}ms, layout ${snapshot.performance.layoutDuration.toFixed(2)}ms`,
    );
    console.log(
      `  Layouts: ${snapshot.performance.layoutCount}, Style recalcs: ${snapshot.performance.recalcStyleCount}`,
    );
    console.log(
      `  Network: ${snapshot.network.totalRequests} requests, ${transferMB.toFixed(2)} MB`,
    );

    // Top resource types for this phase
    const topTypes = Array.from(snapshot.network.transferByType.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    if (topTypes.length > 0) {
      console.log('  Top types:');
      for (const [type, size] of topTypes) {
        const count = snapshot.network.requestsByType.get(type) || 0;
        const sizeMB = size / (1024 * 1024);
        console.log(`    ${type}: ${count} requests, ${sizeMB.toFixed(2)} MB`);
      }
    }
  }
  console.log('===============================================\n');
}

/**
 * Truncate URL for display
 */
function truncateUrl(url: string, maxLength: number): string {
  if (url.length <= maxLength) return url;
  const half = Math.floor((maxLength - 3) / 2);
  return `${url.slice(0, half)}...${url.slice(-half)}`;
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`;
}

/**
 * Format milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
