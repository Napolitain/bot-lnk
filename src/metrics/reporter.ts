import type {
  MediaResourcesSummary,
  MetricsSnapshot,
  MetricsSummary,
  ResourceMetrics,
} from './types.js';

/**
 * Categorize resources by media type for easy blocking decisions
 */
export function categorizeMediaResources(
  resources: ResourceMetrics[],
): MediaResourcesSummary {
  const images: ResourceMetrics[] = [];
  const fonts: ResourceMetrics[] = [];
  const media: ResourceMetrics[] = [];
  const stylesheets: ResourceMetrics[] = [];

  let totalImageSize = 0;
  let totalFontSize = 0;
  let totalMediaSize = 0;
  let totalStylesheetSize = 0;

  for (const resource of resources) {
    const type = resource.type.toLowerCase();

    if (
      type === 'image' ||
      type === 'img' ||
      type === 'png' ||
      type === 'jpeg' ||
      type === 'jpg' ||
      type === 'gif' ||
      type === 'webp' ||
      type === 'svg'
    ) {
      images.push(resource);
      totalImageSize += resource.transferSize;
    } else if (
      type === 'font' ||
      type === 'woff' ||
      type === 'woff2' ||
      type === 'ttf' ||
      type === 'otf'
    ) {
      fonts.push(resource);
      totalFontSize += resource.transferSize;
    } else if (type === 'media' || type === 'video' || type === 'audio') {
      media.push(resource);
      totalMediaSize += resource.transferSize;
    } else if (type === 'stylesheet' || type === 'css') {
      stylesheets.push(resource);
      totalStylesheetSize += resource.transferSize;
    }
  }

  // Sort by size (largest first)
  images.sort((a, b) => b.transferSize - a.transferSize);
  fonts.sort((a, b) => b.transferSize - a.transferSize);
  media.sort((a, b) => b.transferSize - a.transferSize);
  stylesheets.sort((a, b) => b.transferSize - a.transferSize);

  return {
    images,
    fonts,
    media,
    stylesheets,
    totalImageSize,
    totalFontSize,
    totalMediaSize,
    totalStylesheetSize,
  };
}

/**
 * Identify heavy resources above a threshold
 */
export function identifyHeavyResources(
  resources: ResourceMetrics[],
  thresholdMB: number = 1,
): ResourceMetrics[] {
  const thresholdBytes = thresholdMB * 1024 * 1024;
  return resources
    .filter((r) => r.transferSize >= thresholdBytes)
    .sort((a, b) => b.transferSize - a.transferSize);
}

/**
 * Format metrics snapshots into a human-readable summary
 */
export function generateSummary(
  snapshots: MetricsSnapshot[],
  heavyThresholdMB: number = 1,
): MetricsSummary {
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
      mediaResources: {
        images: [],
        fonts: [],
        media: [],
        stylesheets: [],
        totalImageSize: 0,
        totalFontSize: 0,
        totalMediaSize: 0,
        totalStylesheetSize: 0,
      },
      heavyResources: [],
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

  // Categorize media resources
  const mediaResources = categorizeMediaResources(allResources);

  // Identify heavy resources
  const heavyResources = identifyHeavyResources(allResources, heavyThresholdMB);

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
    mediaResources,
    heavyResources,
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

  // Media resources summary (for blocking decisions)
  const { mediaResources } = summary;
  const hasMedia =
    mediaResources.images.length > 0 ||
    mediaResources.fonts.length > 0 ||
    mediaResources.media.length > 0 ||
    mediaResources.stylesheets.length > 0;

  if (hasMedia) {
    console.log(
      '\n========== Media Resources (Blocking Candidates) ==========',
    );

    if (mediaResources.images.length > 0) {
      const sizeMB = mediaResources.totalImageSize / (1024 * 1024);
      console.log(
        `\nImages: ${mediaResources.images.length} resources, ${sizeMB.toFixed(2)} MB total`,
      );
      const topImages = mediaResources.images.slice(0, 5);
      for (const img of topImages) {
        const imgSizeMB = img.transferSize / (1024 * 1024);
        const url = truncateUrl(img.url, 70);
        console.log(`  ${imgSizeMB.toFixed(2)} MB - ${url}`);
      }
      if (mediaResources.images.length > 5) {
        console.log(`  ... and ${mediaResources.images.length - 5} more`);
      }
    }

    if (mediaResources.fonts.length > 0) {
      const sizeMB = mediaResources.totalFontSize / (1024 * 1024);
      console.log(
        `\nFonts: ${mediaResources.fonts.length} resources, ${sizeMB.toFixed(2)} MB total`,
      );
      const topFonts = mediaResources.fonts.slice(0, 5);
      for (const font of topFonts) {
        const fontSizeMB = font.transferSize / (1024 * 1024);
        const url = truncateUrl(font.url, 70);
        console.log(`  ${fontSizeMB.toFixed(2)} MB - ${url}`);
      }
      if (mediaResources.fonts.length > 5) {
        console.log(`  ... and ${mediaResources.fonts.length - 5} more`);
      }
    }

    if (mediaResources.media.length > 0) {
      const sizeMB = mediaResources.totalMediaSize / (1024 * 1024);
      console.log(
        `\nMedia (Video/Audio): ${mediaResources.media.length} resources, ${sizeMB.toFixed(2)} MB total`,
      );
      for (const m of mediaResources.media) {
        const mSizeMB = m.transferSize / (1024 * 1024);
        const url = truncateUrl(m.url, 70);
        console.log(`  ${mSizeMB.toFixed(2)} MB - ${url}`);
      }
    }

    if (mediaResources.stylesheets.length > 0) {
      const sizeMB = mediaResources.totalStylesheetSize / (1024 * 1024);
      console.log(
        `\nStylesheets: ${mediaResources.stylesheets.length} resources, ${sizeMB.toFixed(2)} MB total`,
      );
      const topCSS = mediaResources.stylesheets.slice(0, 5);
      for (const css of topCSS) {
        const cssSizeMB = css.transferSize / (1024 * 1024);
        const url = truncateUrl(css.url, 70);
        console.log(`  ${cssSizeMB.toFixed(2)} MB - ${url}`);
      }
      if (mediaResources.stylesheets.length > 5) {
        console.log(`  ... and ${mediaResources.stylesheets.length - 5} more`);
      }
    }

    console.log('============================================================');
  }

  // Heavy resources
  if (summary.heavyResources.length > 0) {
    console.log(
      `\n⚠️  Heavy Resources (>= 1 MB): ${summary.heavyResources.length} found`,
    );
    for (const resource of summary.heavyResources.slice(0, 10)) {
      const sizeMB = resource.transferSize / (1024 * 1024);
      const url = truncateUrl(resource.url, 70);
      console.log(`  ${sizeMB.toFixed(2)} MB - ${resource.type} - ${url}`);
    }
    if (summary.heavyResources.length > 10) {
      console.log(`  ... and ${summary.heavyResources.length - 10} more`);
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
