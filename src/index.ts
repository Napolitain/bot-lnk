import { chromium } from 'playwright';
import { config, validateConfig } from './config.js';
import { runBotLoop } from './bot/index.js';
import { createSolverClient } from './client/solver.js';
import { formatError } from './utils/index.js';
import { forceRefreshPage } from './browser/navigation.js';

/** Track state between cycles to detect staleness */
interface CycleState {
  lastMinTimeRemainingMs: number | null;
  lastCycleTime: number;
}

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
  const headfulArgs = [
    '--disable-blink-features=AutomationControlled',
  ];

  const context = await chromium.launchPersistentContext(config.userDataDir, {
    headless: config.headless,
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'en-US',
    colorScheme: 'light',
    args: config.headless ? headlessArgs : headfulArgs,
  });

  const page = context.pages()[0] || await context.newPage();

  // Hide automation markers
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  // Block media routes if enabled (saves RAM)
  if (config.blockMedia) {
    await page.route('**/*', (route) => {
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

  console.log(`Starting bot...${config.dryRun ? ' [DRY RUN MODE]' : ''}`);

  // State tracking for stale detection
  let cycleState: CycleState = {
    lastMinTimeRemainingMs: null,
    lastCycleTime: Date.now(),
  };

  // Main bot loop - NEVER exits unless dry run or context closes
  while (true) {
    const cycleStartTime = Date.now();
    const result = await runBotLoop(page, solverClient);

    if (!result.success) {
      console.warn(`[Main] Cycle completed with issues: ${result.error || 'unknown'}`);
    }

    // Detect stale data: if sleepMs is identical and significant time has passed
    if (result.sleepMs !== null && cycleState.lastMinTimeRemainingMs !== null) {
      const timePassed = cycleStartTime - cycleState.lastCycleTime;
      const expectedDecrease = timePassed; // Time should decrease by roughly the wait time
      const actualDecrease = cycleState.lastMinTimeRemainingMs - result.sleepMs;
      
      // If time remaining didn't decrease as expected (within 10% tolerance), data might be stale
      if (timePassed > 60000 && actualDecrease < expectedDecrease * 0.5) {
        console.warn(`[Main] Stale data detected: expected ~${Math.round(expectedDecrease/1000)}s decrease, got ${Math.round(actualDecrease/1000)}s`);
        await forceRefreshPage(page);
      }
    }

    // Update state tracking
    cycleState = {
      lastMinTimeRemainingMs: result.sleepMs,
      lastCycleTime: cycleStartTime,
    };

    // In dry run mode, exit after one iteration
    if (config.dryRun) {
      console.log('\n[DRY RUN] Completed single iteration. Exiting.');
      break;
    }

    // Use suggested sleep time if available, otherwise use default interval
    const sleepMs = result.sleepMs ?? config.loopIntervalMs;
    console.log(`\nWaiting ${Math.round(sleepMs / 1000)} seconds before next check...`);
    
    try {
      await page.waitForTimeout(sleepMs);
    } catch (error) {
      // Page might be closed, try to recover
      console.warn('[Main] Sleep interrupted, attempting to continue...');
    }
  }

  await context.close();
}

// Top-level error handler - should almost never trigger now
main().catch((e) => {
  console.error('[FATAL] Unhandled error in main:', formatError(e));
  console.error('[FATAL] This should not happen - please report this bug');
  process.exit(1);
});
