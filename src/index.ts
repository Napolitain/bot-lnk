import { type BrowserContext, type Page, chromium } from 'playwright';
import { runBotLoop } from './bot/index.js';
import { createTimeSnapshot, forceRefresh } from './browser/gameHealth.js';
import { closeSolverClient, createSolverClient } from './client/solver.js';
import { config, validateConfig } from './config.js';
import {
  type MetricsCollector,
  createMetricsCollector,
  generateSummary,
  printSummary,
} from './metrics/index.js';
import { checkStale, type StateSnapshot } from './resilience/index.js';
import {
  cleanupDebugDumps,
  formatError,
  logMemoryStatus,
  shouldRestartForMemory,
} from './utils/index.js';

// Browser launch options
const headlessArgs = [
  '--disable-blink-features=AutomationControlled',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
];
const headfulArgs = ['--disable-blink-features=AutomationControlled'];

/**
 * Create a new browser context and page with all required setup
 */
async function createBrowserContext(): Promise<{
  context: BrowserContext;
  page: Page;
}> {
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

  // Block resources if enabled (saves RAM)
  if (config.blockMedia) {
    const { blocklist } = config;
    await context.route('**/*', (route) => {
      const url = route.request().url();
      const resourceType = route.request().resourceType();

      // Check allowlist first (never block these)
      for (const pattern of blocklist.allowPatterns) {
        if (url.includes(pattern)) {
          route.continue();
          return;
        }
      }

      // Block by resource type
      if (blocklist.resourceTypes.includes(resourceType)) {
        route.abort();
        return;
      }

      // Block by URL pattern
      for (const pattern of blocklist.urlPatterns) {
        if (url.includes(pattern)) {
          route.abort();
          return;
        }
      }

      route.continue();
    });
    console.log(
      `[Browser] Resource blocking enabled (types: ${blocklist.resourceTypes.join(', ')}, ` +
        `patterns: ${blocklist.urlPatterns.length}, allow: ${blocklist.allowPatterns.length})`,
    );
  }

  return { context, page };
}

/**
 * Initialize metrics collector for a page
 */
async function initializeMetrics(
  page: Page,
  collector: MetricsCollector,
): Promise<void> {
  if (config.enableMetrics) {
    await collector.initialize(page);
    console.log('[Metrics] Performance metrics enabled');
  }
}

async function main() {
  // Validate config
  validateConfig();

  console.log(`Using persistent session at: ${config.userDataDir}`);

  // Create initial browser context
  let { context, page } = await createBrowserContext();

  // Create gRPC client (persists across restarts)
  const solverClient = createSolverClient();

  // Create metrics collector
  const metricsCollector = createMetricsCollector();
  await initializeMetrics(page, metricsCollector);

  console.log(`Starting bot...${config.dryRun ? ' [DRY RUN MODE]' : ''}`);
  logMemoryStatus();

  // State tracking
  let lastSnapshot: StateSnapshot | null = null;
  let cycleCount = 0;
  let contextRestartCount = 0;

  // Main bot loop - NEVER exits unless dry run or context closes
  while (true) {
    cycleCount++;

    // Check system memory before each cycle
    const memCheck = shouldRestartForMemory();
    if (memCheck.shouldRestart && memCheck.reason) {
      console.warn(`[Memory] ${memCheck.reason}`);
      console.log('[Memory] Restarting browser context to free memory...');

      // Cleanup current context
      if (config.enableMetrics) {
        await metricsCollector.cleanup();
      }
      await context.close();

      // Small delay to let OS reclaim memory
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Create fresh context
      ({ context, page } = await createBrowserContext());
      await initializeMetrics(page, metricsCollector);

      contextRestartCount++;
      lastSnapshot = null; // Reset stale detection
      console.log(
        `[Memory] Context restarted (total restarts: ${contextRestartCount})`,
      );
      logMemoryStatus();
    }

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

    // Periodic maintenance every 50 cycles
    if (cycleCount % 50 === 0) {
      console.log('[Main] Running periodic maintenance...');
      logMemoryStatus();

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

      // Print metrics summary
      if (config.enableMetrics) {
        const snapshots = metricsCollector.getSnapshots();
        if (snapshots.length > 0) {
          const summary = generateSummary(snapshots);
          printSummary(summary);
          metricsCollector.clearSnapshots();
        }
      }
    }

    // In dry run mode, exit after one iteration
    if (config.dryRun) {
      console.log('\n[DRY RUN] Completed single iteration. Exiting.');

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
