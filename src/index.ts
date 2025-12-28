import { chromium } from 'playwright';
import { runBotLoop } from './bot/index.js';
import { createTimeSnapshot, forceRefresh } from './browser/gameHealth.js';
import { closeSolverClient, createSolverClient } from './client/solver.js';
import { config, validateConfig } from './config.js';
import {
  createMetricsCollector,
  generateSummary,
  printSummary,
} from './metrics/index.js';
import { checkStale, type StateSnapshot } from './resilience/index.js';
import { cleanupDebugDumps, formatError } from './utils/index.js';

async function main() {
  // Validate config
  validateConfig();

  // Launch browser with persistent context to reuse login session
  console.log(`Using persistent session at: ${config.userDataDir}`);

  // Anti-detection args for headless mode
  const headlessArgs = [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
  ];

  // Minimal args for headful mode (more natural)
  const headfulArgs = ['--disable-blink-features=AutomationControlled'];

  const context = await chromium.launchPersistentContext(config.userDataDir, {
    headless: config.headless,
    viewport: { width: 1920, height: 1080 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'en-US',
    colorScheme: 'light',
    args: config.headless ? headlessArgs : headfulArgs,
  });

  const page = context.pages()[0] || (await context.newPage());

  // Hide automation markers
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  // Block media routes if enabled (saves RAM)
  // Note: Route is registered once on the context, not per-page, to avoid accumulation
  if (config.blockMedia) {
    await context.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      if (['image', 'media', 'font'].includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });
    console.log('Media blocking enabled (images, fonts, media)');
  }

  // Create gRPC client
  const solverClient = createSolverClient();

  // Create metrics collector
  const metricsCollector = createMetricsCollector();
  if (config.enableMetrics) {
    await metricsCollector.initialize(page);
    console.log('[Metrics] Performance metrics enabled');
  }

  console.log(`Starting bot...${config.dryRun ? ' [DRY RUN MODE]' : ''}`);

  // State tracking for stale detection
  let lastSnapshot: StateSnapshot | null = null;
  let cycleCount = 0;

  // Main bot loop - NEVER exits unless dry run or context closes
  while (true) {
    cycleCount++;

    // Start metrics collection for this cycle
    if (config.enableMetrics) {
      metricsCollector.startPeriod(`cycle_${cycleCount}`);
    }

    const result = await runBotLoop(page, solverClient, metricsCollector);

    if (!result.success) {
      console.warn(
        `[Main] Cycle completed with issues: ${result.error || 'unknown'}`,
      );
    }

    // Create snapshot and check for stale data
    const currentSnapshot = createTimeSnapshot(result.sleepMs);
    const staleCheck = checkStale(
      lastSnapshot,
      currentSnapshot,
      result.sleepMs ?? 60000,
    );

    if (staleCheck.isStale) {
      console.warn(`[Main] ${staleCheck.reason}`);
      await forceRefresh(page);
    }

    lastSnapshot = currentSnapshot;

    // End metrics collection for this cycle
    if (config.enableMetrics) {
      await metricsCollector.endPeriod();
    }

    // Periodic memory maintenance every 50 cycles
    if (cycleCount % 50 === 0) {
      console.log('[Main] Running periodic memory maintenance...');
      // Clean up old debug dumps (keep last 20)
      cleanupDebugDumps(20);
      // Clear browser caches
      try {
        const client = await page.context().newCDPSession(page);
        await client.send('Network.clearBrowserCache');
        await client.detach();
        console.log('[Main] Browser cache cleared');
      } catch {
        // CDP might not be available, ignore
      }

      // Print metrics summary every 50 cycles
      if (config.enableMetrics) {
        const snapshots = metricsCollector.getSnapshots();
        if (snapshots.length > 0) {
          const summary = generateSummary(snapshots);
          printSummary(summary);
          // Clear old snapshots after printing to avoid memory buildup
          metricsCollector.clearSnapshots();
        }
      }
    }

    // In dry run mode, exit after one iteration
    if (config.dryRun) {
      console.log('\n[DRY RUN] Completed single iteration. Exiting.');

      // Print final metrics in dry run mode
      if (config.enableMetrics) {
        const snapshots = metricsCollector.getSnapshots();
        if (snapshots.length > 0) {
          const summary = generateSummary(snapshots);
          printSummary(summary);
        }
      }

      break;
    }

    // Use suggested sleep time if available, otherwise use default interval
    const sleepMs = result.sleepMs ?? config.loopIntervalMs;
    console.log(
      `\nWaiting ${Math.round(sleepMs / 1000)} seconds before next check...`,
    );

    try {
      await page.waitForTimeout(sleepMs);
    } catch (_error) {
      // Page might be closed, try to recover
      console.warn('[Main] Sleep interrupted, attempting to continue...');
    }
  }

  // Cleanup
  if (config.enableMetrics) {
    await metricsCollector.cleanup();
  }
  closeSolverClient();
  await context.close();
}

// Top-level error handler - should almost never trigger now
main().catch((e) => {
  console.error('[FATAL] Unhandled error in main:', formatError(e));
  console.error('[FATAL] This should not happen - please report this bug');
  process.exit(1);
});
