# Performance Metrics Example

This example demonstrates how to use the metrics module programmatically.

## Basic Usage

```typescript
import { chromium } from 'playwright';
import { createMetricsCollector, generateSummary, printSummary } from './src/metrics/index.js';

async function example() {
  // Launch browser
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Create and initialize metrics collector
  const collector = createMetricsCollector({
    enabled: true,
    collectResources: true,
    collectMemory: true,
    collectPerformance: true,
    logToConsole: true,
    maxResourcesPerSnapshot: 100,
  });

  await collector.initialize(page);

  // Track navigation
  collector.startPeriod('navigation');
  await page.goto('https://example.com');
  await collector.endPeriod();

  // Track user interaction
  collector.startPeriod('interaction');
  await page.click('button');
  await page.waitForSelector('.result');
  await collector.endPeriod();

  // Generate and print summary
  const snapshots = collector.getSnapshots();
  const summary = generateSummary(snapshots);
  printSummary(summary);

  // Cleanup
  await collector.cleanup();
  await browser.close();
}

example();
```

## Custom Configuration

```typescript
// Minimal overhead - only memory tracking
const lightweightCollector = createMetricsCollector({
  enabled: true,
  collectResources: false,  // Disable resource tracking
  collectMemory: true,      // Enable memory only
  collectPerformance: false, // Disable CPU metrics
  logToConsole: false,      // Don't log to console
  maxResourcesPerSnapshot: 0,
});

// Full tracking with all features
const fullCollector = createMetricsCollector({
  enabled: true,
  collectResources: true,
  collectMemory: true,
  collectPerformance: true,
  logToConsole: true,
  maxResourcesPerSnapshot: 200, // Track more resources
});
```

## Analyzing Results

```typescript
const snapshots = collector.getSnapshots();

// Find slowest phase
const slowest = snapshots.reduce((max, snap) => 
  snap.duration > max.duration ? snap : max
);
console.log(`Slowest phase: ${slowest.label} (${slowest.duration}ms)`);

// Find phase with most memory
const mostMemory = snapshots.reduce((max, snap) =>
  snap.memory.usedJSHeapSize > max.memory.usedJSHeapSize ? snap : max
);
console.log(`Most memory: ${mostMemory.label} (${mostMemory.memory.usedJSHeapSize / (1024*1024)}MB)`);

// Find highest network usage
const mostNetwork = snapshots.reduce((max, snap) =>
  snap.network.totalTransferSize > max.network.totalTransferSize ? snap : max
);
console.log(`Most network: ${mostNetwork.label} (${mostNetwork.network.totalTransferSize / (1024*1024)}MB)`);
```

## Conditional Tracking

```typescript
// Only track specific scenarios
if (needsMetrics) {
  collector.startPeriod('expensive_operation');
}

await performExpensiveOperation();

if (needsMetrics) {
  await collector.endPeriod();
}
```

## Integration with Bot

The bot automatically integrates metrics when `ENABLE_METRICS=true`:

```typescript
// In main loop (src/index.ts)
const metricsCollector = createMetricsCollector();
if (config.enableMetrics) {
  await metricsCollector.initialize(page);
}

// Track bot cycles
if (config.enableMetrics) {
  metricsCollector.startPeriod(`cycle_${cycleCount}`);
}
const result = await runBotLoop(page, solverClient, metricsCollector);
if (config.enableMetrics) {
  await metricsCollector.endPeriod();
}
```

## Exporting Data

You can export metrics to JSON for external analysis:

```typescript
const snapshots = collector.getSnapshots();
const json = JSON.stringify(snapshots, (key, value) => {
  // Convert Maps to objects for JSON serialization
  if (value instanceof Map) {
    return Object.fromEntries(value);
  }
  return value;
}, 2);

// Save to file
import fs from 'fs';
fs.writeFileSync('metrics.json', json);
```

## Real-time Monitoring

```typescript
// Log metrics after each period
collector.startPeriod('phase1');
await doWork();
const snapshot = await collector.endPeriod();

if (snapshot) {
  console.log(`Memory: ${snapshot.memory.usedJSHeapSize / (1024*1024)} MB`);
  console.log(`Duration: ${snapshot.duration} ms`);
  console.log(`Requests: ${snapshot.network.totalRequests}`);
}
```
