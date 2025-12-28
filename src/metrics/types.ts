/**
 * Performance metrics types
 * These metrics are collected via Chrome DevTools Protocol (CDP)
 */

/** Resource timing metrics for individual requests */
export interface ResourceMetrics {
  url: string;
  type: string; // document, script, stylesheet, image, font, etc.
  method: string; // GET, POST, etc.
  status: number;
  startTime: number; // milliseconds since navigation
  duration: number; // milliseconds
  encodedBodySize: number; // bytes
  decodedBodySize: number; // bytes
  transferSize: number; // bytes (includes headers)
}

/** Browser memory usage metrics */
export interface MemoryMetrics {
  timestamp: number;
  usedJSHeapSize: number; // bytes
  totalJSHeapSize: number; // bytes
  jsHeapSizeLimit: number; // bytes
  documents: number;
  nodes: number;
  jsEventListeners: number;
}

/** CPU and rendering performance metrics */
export interface PerformanceMetrics {
  timestamp: number;
  taskDuration: number; // milliseconds
  scriptDuration: number; // milliseconds
  layoutDuration: number; // milliseconds
  recalcStyleDuration: number; // milliseconds
  layoutCount: number;
  recalcStyleCount: number;
}

/** Network performance metrics */
export interface NetworkMetrics {
  timestamp: number;
  totalRequests: number;
  totalTransferSize: number; // bytes
  totalEncodedBodySize: number; // bytes
  totalDecodedBodySize: number; // bytes
  requestsByType: Map<string, number>;
  transferByType: Map<string, number>; // bytes per resource type
}

/** Aggregated metrics for a time period */
export interface MetricsSnapshot {
  timestamp: number;
  label: string; // e.g., "login", "buildings_phase", "recruitment_phase"
  duration: number; // milliseconds
  memory: MemoryMetrics;
  performance: PerformanceMetrics;
  network: NetworkMetrics;
  resources: ResourceMetrics[];
}

/** Summary of metrics across multiple snapshots */
export interface MetricsSummary {
  totalDuration: number; // milliseconds
  avgMemoryUsedMB: number;
  peakMemoryUsedMB: number;
  totalTransferSizeMB: number;
  totalRequestCount: number;
  avgTaskDurationMs: number;
  avgScriptDurationMs: number;
  avgLayoutDurationMs: number;
  topResourcesBySize: ResourceMetrics[]; // Top 10 by transfer size
  topResourcesByDuration: ResourceMetrics[]; // Top 10 by duration
  transferByType: Map<string, number>; // bytes per resource type
  mediaResources: MediaResourcesSummary; // Summary of media resources
  heavyResources: ResourceMetrics[]; // Resources above heavy threshold
}

/** Summary of media resources for easy blocking decisions */
export interface MediaResourcesSummary {
  images: ResourceMetrics[]; // All image resources
  fonts: ResourceMetrics[]; // All font resources
  media: ResourceMetrics[]; // All media resources (video, audio)
  stylesheets: ResourceMetrics[]; // All stylesheet resources
  totalImageSize: number; // bytes
  totalFontSize: number; // bytes
  totalMediaSize: number; // bytes
  totalStylesheetSize: number; // bytes
}

/** Configuration for metrics collection */
export interface MetricsConfig {
  enabled: boolean;
  collectResources: boolean; // Collect individual resource metrics
  collectMemory: boolean; // Collect memory metrics
  collectPerformance: boolean; // Collect CPU/rendering metrics
  logToConsole: boolean; // Print metrics to console
  maxResourcesPerSnapshot: number; // Limit resources collected per snapshot
  heavyResourceThresholdMB: number; // Threshold for identifying heavy resources (MB)
}
