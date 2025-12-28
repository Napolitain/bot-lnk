# Performance Metrics Module

The performance metrics module provides fine-grained monitoring of bot runtime performance using the Chrome DevTools Protocol (CDP). This allows you to collect detailed metrics about memory usage, CPU time, and network activity to make informed decisions about resource optimization.

## Features

- **Memory Metrics**: Track JavaScript heap usage, DOM nodes, and event listeners
- **CPU Metrics**: Monitor script execution time, layout, and style recalculation
- **Network Metrics**: Per-resource timing and transfer sizes
- **Phase-Level Tracking**: Separate metrics for login, buildings, recruitment, and trading phases
- **Summary Reports**: Aggregate metrics across multiple cycles
- **Media Resource Identification**: Automatically categorize images, fonts, videos, and stylesheets for easy blocking decisions
- **Heavy Resource Detection**: Identify resources above size threshold (default 1 MB)

## Usage

### Enable Metrics

Set the environment variable in your `.env` file:

```bash
ENABLE_METRICS=true
```

### Metrics Collection

Metrics are automatically collected when enabled:

1. **Per-Cycle Metrics**: Each bot cycle is tracked as a single measurement period
2. **Per-Phase Metrics**: Individual phases (login, buildings, recruitment, trading) are tracked separately
3. **Periodic Summaries**: Every 50 cycles, a summary report is printed with aggregate statistics

### Output

When metrics are enabled, you'll see console output like:

```
[Metrics] login (1234ms):
  Memory: 45.23 MB
  CPU: 123.45ms script, 23.45ms layout
  Network: 15 requests, 2.34 MB
  Top types:
    script: 1.50 MB
    document: 0.50 MB
    stylesheet: 0.34 MB
```

Every 50 cycles, a summary report is generated:

```
========== Performance Metrics Summary ==========
Total Duration: 125.50s
Memory: Avg 45.23 MB, Peak 67.89 MB
CPU: Avg task 234.56ms, script 123.45ms, layout 23.45ms
Network: 1500 requests, 234.56 MB total

Transfer by Resource Type:
  script: 123.45 MB
  document: 45.67 MB
  stylesheet: 23.45 MB
  image: 12.34 MB

Top 10 Resources by Size:
  12.34 MB - script - https://example.com/large-bundle.js
  5.67 MB - script - https://example.com/vendor.js
  ...

Top 10 Resources by Duration:
  1234ms - script - https://example.com/slow-script.js
  567ms - document - https://example.com/page.html
  ...

========== Media Resources (Blocking Candidates) ==========

Images: 15 resources, 8.45 MB total
  3.21 MB - https://example.com/hero-image.jpg
  2.15 MB - https://example.com/background.png
  1.87 MB - https://example.com/banner.jpg
  0.65 MB - https://example.com/icon-large.png
  0.42 MB - https://example.com/thumbnail.jpg
  ... and 10 more

Fonts: 3 resources, 2.15 MB total
  1.20 MB - https://example.com/fonts/custom-bold.woff2
  0.85 MB - https://example.com/fonts/custom-regular.woff2
  0.10 MB - https://example.com/fonts/icons.woff2

Stylesheets: 5 resources, 1.23 MB total
  0.65 MB - https://example.com/styles/main.css
  0.35 MB - https://example.com/styles/theme.css
  ...

============================================================

⚠️  Heavy Resources (>= 1 MB): 8 found
  12.34 MB - script - https://example.com/large-bundle.js
  5.67 MB - script - https://example.com/vendor.js
  3.21 MB - image - https://example.com/hero-image.jpg
  2.15 MB - image - https://example.com/background.png
  ...
================================================
```

## Configuration

The metrics collector supports the following configuration options (see `src/metrics/index.ts`):

```typescript
interface MetricsConfig {
  enabled: boolean;                  // Enable/disable metrics collection
  collectResources: boolean;         // Collect per-resource metrics
  collectMemory: boolean;            // Collect memory metrics
  collectPerformance: boolean;       // Collect CPU/rendering metrics
  logToConsole: boolean;             // Print metrics to console
  maxResourcesPerSnapshot: number;   // Limit resources per snapshot
  heavyResourceThresholdMB: number;  // Threshold for identifying heavy resources (default: 1 MB)
}
  collectMemory: boolean;            // Collect memory metrics
  collectPerformance: boolean;       // Collect CPU/rendering metrics
  logToConsole: boolean;             // Print metrics to console
  maxResourcesPerSnapshot: number;   // Limit resources per snapshot
}
```

Default configuration:
```typescript
{
  enabled: process.env.ENABLE_METRICS === 'true',
  collectResources: true,
  collectMemory: true,
  collectPerformance: true,
  logToConsole: true,
  maxResourcesPerSnapshot: 100,
}
```

## Architecture

The metrics module is organized into three main components:

### 1. Types (`src/metrics/types.ts`)

Defines TypeScript interfaces for all metric types:
- `ResourceMetrics`: Per-resource network timings
- `MemoryMetrics`: Heap usage and DOM statistics
- `PerformanceMetrics`: CPU and rendering metrics
- `NetworkMetrics`: Aggregate network statistics
- `MetricsSnapshot`: Complete snapshot for a time period
- `MetricsSummary`: Aggregate summary across snapshots

### 2. Collector (`src/metrics/collector.ts`)

`MetricsCollector` class that:
- Initializes CDP session with the browser
- Enables Performance, Memory, and Network domains
- Collects metrics at start/end of measurement periods
- Stores snapshots for later analysis

Key methods:
- `initialize(page)`: Set up CDP connection
- `startPeriod(label)`: Begin tracking a labeled period
- `endPeriod()`: Finish tracking and capture snapshot
- `getSnapshots()`: Retrieve all collected snapshots
- `cleanup()`: Clean up CDP session

### 3. Reporter (`src/metrics/reporter.ts`)

Formatting and reporting functions:
- `generateSummary(snapshots)`: Aggregate snapshots into summary
- `printSummary(summary)`: Print formatted summary to console
- `printSnapshots(snapshots)`: Print detailed per-snapshot report
- `formatBytes(bytes)`: Format bytes to human-readable string
- `formatDuration(ms)`: Format milliseconds to human-readable string

## Integration Points

### Main Loop (`src/index.ts`)

```typescript
// Create collector
const metricsCollector = createMetricsCollector();
await metricsCollector.initialize(page);

// Track each cycle
metricsCollector.startPeriod(`cycle_${cycleCount}`);
await runBotLoop(page, solverClient, metricsCollector);
await metricsCollector.endPeriod();

// Periodic summaries
if (cycleCount % 50 === 0) {
  const summary = generateSummary(metricsCollector.getSnapshots());
  printSummary(summary);
  metricsCollector.clearSnapshots();
}
```

### Bot Loop (`src/bot/loop.ts`)

Phase-level tracking:

```typescript
// Login phase
metricsCollector?.startPeriod('login');
await login(page);
await metricsCollector?.endPeriod();

// Buildings phase
metricsCollector?.startPeriod('buildings_phase');
// ... building logic ...
await metricsCollector?.endPeriod();

// Recruitment phase
metricsCollector?.startPeriod('recruitment_phase');
// ... recruitment logic ...
await metricsCollector?.endPeriod();

// Trading phase
metricsCollector?.startPeriod('trading_phase');
// ... trading logic ...
await metricsCollector?.endPeriod();
```

## Performance Impact

The metrics collection itself has minimal performance impact:

- **CDP Overhead**: ~1-2ms per metric collection call
- **Memory**: Snapshots are stored in memory but cleared every 50 cycles
- **Network**: No additional network requests (uses CDP protocol over existing connection)

For production use where performance is critical, consider:
- Disabling resource collection: `collectResources: false`
- Increasing collection intervals
- Collecting only on specific phases

## Use Cases

### 1. Identifying Media Resources for Blocking

The metrics module automatically categorizes media resources (images, fonts, videos, stylesheets) making it easy to decide what to block:

```typescript
import { generateSummary, categorizeMediaResources } from './src/metrics';

// Get metrics after some cycles
const snapshots = metricsCollector.getSnapshots();
const summary = generateSummary(snapshots);

// Media resources are automatically categorized
const { mediaResources } = summary;

console.log(`Images: ${mediaResources.images.length} files, ${mediaResources.totalImageSize / (1024*1024)} MB`);
console.log(`Fonts: ${mediaResources.fonts.length} files, ${mediaResources.totalFontSize / (1024*1024)} MB`);

// Block large images based on metrics
if (config.blockMedia) {
  await context.route('**/*', (route) => {
    const url = route.request().url();
    const resourceType = route.request().resourceType();
    
    // Block all images if they're heavy
    if (resourceType === 'image' && mediaResources.totalImageSize > 5 * 1024 * 1024) {
      route.abort();
      return;
    }
    
    // Block specific heavy fonts
    const heavyFonts = mediaResources.fonts
      .filter(f => f.transferSize > 500 * 1024)
      .map(f => f.url);
    
    if (heavyFonts.some(font => url.includes(font))) {
      route.abort();
      return;
    }
    
    route.continue();
  });
}
```

### 2. Identifying Heavy Resources

Use the `heavyResources` array to find all resources above the threshold (default 1 MB):

```typescript
const summary = generateSummary(snapshots);

// Heavy resources are already identified
for (const resource of summary.heavyResources) {
  const sizeMB = resource.transferSize / (1024 * 1024);
  console.log(`Heavy: ${sizeMB.toFixed(2)} MB - ${resource.type} - ${resource.url}`);
  
  // Block in your route handler
  if (config.blockMedia) {
    // Add to blocklist
  }
}

// Or use the helper function directly
import { identifyHeavyResources } from './src/metrics';

const allResources = snapshots.flatMap(s => s.resources);
const heavy = identifyHeavyResources(allResources, 2); // 2 MB threshold
```

### 3. Programmatic Media Analysis

Use helper functions for custom analysis:

```typescript
import { categorizeMediaResources, identifyHeavyResources } from './src/metrics';

const allResources = snapshots.flatMap(s => s.resources);

// Categorize by media type
const media = categorizeMediaResources(allResources);

// Find what's consuming bandwidth
if (media.totalImageSize > media.totalFontSize + media.totalStylesheetSize) {
  console.log('Images are the biggest bandwidth consumer - consider blocking');
}

// Identify heavy resources with custom threshold
const veryHeavy = identifyHeavyResources(allResources, 5); // 5 MB threshold
console.log(`Found ${veryHeavy.length} resources over 5 MB`);
```

### 4. Monitoring Memory Leaks
    }
    // ... rest of logic
  });
}
```

### 2. Monitoring Memory Leaks

Track peak memory usage over time:

```bash
# Look for increasing peak memory in summaries
Memory: Avg 45.23 MB, Peak 67.89 MB  # Cycle 50
Memory: Avg 52.34 MB, Peak 89.12 MB  # Cycle 100
Memory: Avg 61.45 MB, Peak 112.34 MB # Cycle 150 - Potential leak!
```

### 3. Optimizing Phase Performance

Compare phase durations to find bottlenecks:

```
[login] (1234ms)          - Fast
[buildings_phase] (5678ms) - Slow - investigate DOM operations
[recruitment_phase] (2345ms) - OK
[trading_phase] (1234ms)   - Fast
```

## Troubleshooting

### Metrics not appearing

1. Check that `ENABLE_METRICS=true` in `.env`
2. Verify CDP is available: Check for "[Metrics] CDP session initialized" log
3. Some environments may not support CDP - check browser compatibility

### High memory usage

1. Reduce `maxResourcesPerSnapshot` in config
2. Increase snapshot clearing frequency (default: every 50 cycles)
3. Disable resource collection: `collectResources: false`

### Inaccurate measurements

1. Ensure sufficient time between `startPeriod()` and `endPeriod()`
2. CDP metrics are cumulative - some values represent totals since page load
3. First measurement may be less accurate due to initialization

## API Reference

See TypeScript definitions in `src/metrics/types.ts` for complete API documentation.

### Key Interfaces

```typescript
// Create collector
function createMetricsCollector(overrides?: Partial<MetricsConfig>): MetricsCollector

// Generate summary from snapshots
function generateSummary(snapshots: MetricsSnapshot[]): MetricsSummary

// Print formatted summary
function printSummary(summary: MetricsSummary): void

// Print detailed snapshots
function printSnapshots(snapshots: MetricsSnapshot[]): void
```

## Future Enhancements

Potential improvements to the metrics module:

- [ ] Export metrics to JSON/CSV for external analysis
- [ ] Real-time metrics dashboard (web UI)
- [ ] Alerts/thresholds for anomalies
- [ ] Historical trending and comparison
- [ ] Automated resource blocking recommendations
- [ ] Integration with external monitoring services (Prometheus, DataDog, etc.)
