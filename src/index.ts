import { chromium } from 'playwright';
import { config, validateConfig } from './config.js';
import { runBotLoop } from './bot.js';
import { createSolverClient } from './client/solver.js';

async function main() {
  // Validate config
  validateConfig();

  // Launch browser with persistent context to reuse login session
  console.log(`Using persistent session at: ${config.userDataDir}`);
  const context = await chromium.launchPersistentContext(config.userDataDir, {
    headless: config.headless,
    viewport: { width: 1920, height: 1080 },
  });

  const page = context.pages()[0] || await context.newPage();

  // Create gRPC client
  const solverClient = createSolverClient();

  console.log(`Starting bot...${config.dryRun ? ' [DRY RUN MODE]' : ''}`);

  // Main bot loop
  let consecutiveErrors = 0;

  while (true) {
    try {
      await runBotLoop(page, solverClient);
      consecutiveErrors = 0; // Reset on success

      // In dry run mode, exit after one iteration
      if (config.dryRun) {
        console.log('\n[DRY RUN] Completed single iteration. Exiting.');
        break;
      }

      // Wait before next iteration
      console.log(`\nWaiting ${config.loopIntervalMs / 1000} seconds before next check...`);
      await page.waitForTimeout(config.loopIntervalMs);

    } catch (e) {
      consecutiveErrors++;
      console.error(`\nError in bot loop (${consecutiveErrors}/${config.maxConsecutiveErrors}):`, e);

      if (consecutiveErrors >= config.maxConsecutiveErrors) {
        console.log(`\nToo many consecutive errors. Waiting ${config.longRetryDelayMs / 1000} seconds before retry...`);
        await page.waitForTimeout(config.longRetryDelayMs);
        consecutiveErrors = 0; // Reset after long wait

        // Try to recover by navigating to home
        try {
          await page.goto('https://lordsandknights.com/');
          await page.waitForTimeout(3000);
        } catch {
          console.error('Failed to navigate to home page');
        }
      } else {
        console.log(`\nRetrying in ${config.retryDelayMs / 1000} seconds...`);
        await page.waitForTimeout(config.retryDelayMs);
      }
    }
  }

  await context.close();
}

main().catch(console.error);
