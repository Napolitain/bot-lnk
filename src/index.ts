import { chromium, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { config, validateConfig } from './config.js';
import { runBotLoop } from './bot.js';
import { createSolverClient } from './client/solver.js';

async function saveErrorScreenshot(page: Page, errorType: string): Promise<string | null> {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotDir = path.join(config.userDataDir, 'error-screenshots');
    fs.mkdirSync(screenshotDir, { recursive: true });
    const screenshotPath = path.join(screenshotDir, `${errorType}-${timestamp}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return screenshotPath;
  } catch (screenshotError) {
    console.error('[ERROR] Failed to save screenshot:', screenshotError);
    return null;
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack || ''}`;
  }
  return String(error);
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

  // Main bot loop
  let consecutiveErrors = 0;

  while (true) {
    try {
      const suggestedSleepMs = await runBotLoop(page, solverClient);
      consecutiveErrors = 0; // Reset on success

      // In dry run mode, exit after one iteration
      if (config.dryRun) {
        console.log('\n[DRY RUN] Completed single iteration. Exiting.');
        break;
      }

      // Use suggested sleep time if available, otherwise use default interval
      const sleepMs = suggestedSleepMs ?? config.loopIntervalMs;
      console.log(`\nWaiting ${Math.round(sleepMs / 1000)} seconds before next check...`);
      await page.waitForTimeout(sleepMs);

    } catch (e) {
      consecutiveErrors++;
      const errorMsg = formatError(e);
      
      // Save screenshot for debugging
      const screenshotPath = await saveErrorScreenshot(page, 'bot-loop-error');
      
      console.error(`\n[ERROR] Bot loop failed (${consecutiveErrors}/${config.maxConsecutiveErrors})`);
      console.error(`[ERROR] ${errorMsg}`);
      if (screenshotPath) {
        console.error(`[ERROR] Screenshot saved: ${screenshotPath}`);
      }
      console.error(`[ERROR] Page URL: ${page.url()}`);

      if (consecutiveErrors >= config.maxConsecutiveErrors) {
        console.warn(`\n[WARN] Too many consecutive errors. Waiting ${config.longRetryDelayMs / 1000} seconds before retry...`);
        await page.waitForTimeout(config.longRetryDelayMs);
        consecutiveErrors = 0; // Reset after long wait

        // Try to recover by navigating to home
        try {
          console.log('[INFO] Attempting recovery - navigating to home page...');
          await page.goto('https://lordsandknights.com/');
          await page.waitForTimeout(3000);
          console.log('[INFO] Recovery navigation completed');
        } catch (recoveryError) {
          console.error('[ERROR] Recovery failed:', formatError(recoveryError));
          await saveErrorScreenshot(page, 'recovery-error');
        }
      } else {
        console.warn(`\n[WARN] Retrying in ${config.retryDelayMs / 1000} seconds...`);
        await page.waitForTimeout(config.retryDelayMs);
      }
    }
  }

  await context.close();
}

main().catch((e) => {
  console.error('[FATAL] Unhandled error in main:', formatError(e));
  process.exit(1);
});
