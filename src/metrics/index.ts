/**
 * Performance Metrics Module
 *
 * Collects fine-grained performance metrics via Chrome DevTools Protocol (CDP):
 * - Memory usage (heap size, DOM nodes, event listeners)
 * - CPU time (script execution, layout, style recalculation)
 * - Network performance (per-resource timing and transfer sizes)
 *
 * Usage:
 * 1. Enable via ENABLE_METRICS=true in .env
 * 2. Import and create collector: const collector = createMetricsCollector();
 * 3. Initialize: await collector.initialize(page);
 * 4. Start period: collector.startPeriod('label');
 * 5. End period: await collector.endPeriod();
 * 6. Get summary: const summary = generateSummary(collector.getSnapshots());
 */

export { MetricsCollector } from './collector.js';
export {
  categorizeMediaResources,
  formatBytes,
  formatDuration,
  generateSummary,
  identifyHeavyResources,
  printSnapshots,
  printSummary,
} from './reporter.js';
export * from './types.js';

import { MetricsCollector } from './collector.js';
import type { MetricsConfig } from './types.js';

/**
 * Create a metrics collector with default configuration
 */
export function createMetricsCollector(
  overrides?: Partial<MetricsConfig>,
): MetricsCollector {
  const defaultConfig: MetricsConfig = {
    enabled: process.env.ENABLE_METRICS === 'true',
    collectResources: true,
    collectMemory: true,
    collectPerformance: true,
    logToConsole: true,
    maxResourcesPerSnapshot: 100,
    heavyResourceThresholdMB: 1, // 1 MB threshold for heavy resources
  };

  return new MetricsCollector({ ...defaultConfig, ...overrides });
}
