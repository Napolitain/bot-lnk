# Performance Metrics Module

The performance metrics module provides fine-grained monitoring of bot runtime performance using the Chrome DevTools Protocol (CDP). This allows you to collect detailed metrics about memory usage, CPU time, and network activity to make informed decisions about resource optimization.

## Features

- **Memory Metrics**: Track JavaScript heap usage, DOM nodes, and event listeners
- **CPU Metrics**: Monitor script execution time, layout, and style recalculation
- **Network Metrics**: Per-resource timing and transfer sizes
- **Phase-Level Tracking**: Separate metrics for login, buildings, recruitment, and trading phases
- **Summary Reports**: Aggregate metrics across multiple cycles

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

### 1. Identifying Heavy Resources

Use the "Top Resources by Size" and "Top Resources by Duration" reports to find resources that could be blocked:

```typescript
// In src/index.ts, add to blockMedia logic:
if (config.blockMedia) {
  await context.route('**/*', (route) => {
    const url = route.request().url();
    // Block specific heavy resources identified from metrics
    if (url.includes('heavy-script.js')) {
      route.abort();
      return;
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

## Resource Blocking

The bot supports configurable resource blocking to reduce RAM and bandwidth usage. This works in conjunction with metrics collection to enable a profiling-guided approach.

### Enable Blocking

```bash
# Basic blocking (uses default blocklist)
BLOCK_MEDIA=true

# Custom blocklist file
BLOCK_MEDIA=true
BLOCKLIST_FILE=./blocklist.json
```

### Blocklist Configuration

Create a `blocklist.json` file (see `blocklist.example.json`):

```json
{
  "resourceTypes": ["image", "media", "font"],
  "urlPatterns": [
    "googletagmanager.com",
    "google-analytics.com",
    "facebook.net"
  ],
  "allowPatterns": [
    "lordsandknights",
    "lnk-"
  ]
}
```

| Field | Description |
|-------|-------------|
| `resourceTypes` | Block by Playwright resource type (image, media, font, stylesheet, script) |
| `urlPatterns` | Block URLs containing these substrings |
| `allowPatterns` | Never block URLs containing these (takes precedence) |

### Profiling-Guided Blocking Workflow

1. **Collect baseline metrics**:
   ```bash
   ENABLE_METRICS=true npm start
   ```

2. **Identify heavy resources** from the "Top Resources by Size" report

3. **Add candidates to blocklist** in `blocklist.json`

4. **Test in dry-run mode**:
   ```bash
   DRY_RUN=true BLOCK_MEDIA=true npm start
   ```

5. **Verify bot still functions** - check for errors or broken game state

6. **Graduate to production** once verified safe

### Safe Defaults

The default blocklist is conservative:
- Blocks: `image`, `media`, `font` resource types
- Allows: Any URL containing `lordsandknights` or `lnk-`

This ensures game-critical resources are never blocked.

## Future Enhancements

Potential improvements to the metrics module:

- [ ] Export metrics to JSON/CSV for external analysis
- [ ] Real-time metrics dashboard (web UI)
- [ ] Alerts/thresholds for anomalies
- [ ] Historical trending and comparison
- [ ] Automated resource blocking recommendations
- [ ] Integration with external monitoring services (Prometheus, DataDog, etc.)
