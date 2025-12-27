import { Page } from 'playwright';
import { dismissPopups } from './popups.js';
import { saveDebugContext } from '../utils/index.js';

/** Recovery strategies in order of escalation */
export enum RecoveryStrategy {
  DISMISS_POPUPS = 'dismiss_popups',
  WAIT_AND_RETRY = 'wait_and_retry',
  RELOAD_PAGE = 'reload_page',
  NAVIGATE_HOME = 'navigate_home',
  FULL_RESET = 'full_reset',
}

export interface RecoveryResult {
  success: boolean;
  strategy: RecoveryStrategy;
  message: string;
}

/** Attempt to recover from an error state */
export async function attemptRecovery(
  page: Page,
  context: string,
  currentStrategy: RecoveryStrategy = RecoveryStrategy.DISMISS_POPUPS
): Promise<RecoveryResult> {
  console.log(`[Recovery] Attempting ${currentStrategy} for: ${context}`);

  try {
    switch (currentStrategy) {
      case RecoveryStrategy.DISMISS_POPUPS:
        await dismissPopups(page);
        await page.waitForTimeout(1000);
        return { success: true, strategy: currentStrategy, message: 'Dismissed popups' };

      case RecoveryStrategy.WAIT_AND_RETRY:
        await page.waitForTimeout(3000);
        await dismissPopups(page);
        return { success: true, strategy: currentStrategy, message: 'Waited and dismissed popups' };

      case RecoveryStrategy.RELOAD_PAGE:
        await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(3000);
        await dismissPopups(page);
        return { success: true, strategy: currentStrategy, message: 'Reloaded page' };

      case RecoveryStrategy.NAVIGATE_HOME:
        await page.goto('https://lordsandknights.com/', { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(3000);
        await dismissPopups(page);
        return { success: true, strategy: currentStrategy, message: 'Navigated to home' };

      case RecoveryStrategy.FULL_RESET:
        // Clear cookies and start fresh
        const browserContext = page.context();
        await browserContext.clearCookies();
        await page.goto('https://lordsandknights.com/', { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(3000);
        return { success: true, strategy: currentStrategy, message: 'Full reset completed' };

      default:
        return { success: false, strategy: currentStrategy, message: 'Unknown strategy' };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Recovery] ${currentStrategy} failed: ${errorMsg}`);
    return { success: false, strategy: currentStrategy, message: errorMsg };
  }
}

/** Get the next escalation strategy */
export function getNextStrategy(current: RecoveryStrategy): RecoveryStrategy | null {
  const strategies = [
    RecoveryStrategy.DISMISS_POPUPS,
    RecoveryStrategy.WAIT_AND_RETRY,
    RecoveryStrategy.RELOAD_PAGE,
    RecoveryStrategy.NAVIGATE_HOME,
    RecoveryStrategy.FULL_RESET,
  ];

  const currentIndex = strategies.indexOf(current);
  if (currentIndex < strategies.length - 1) {
    return strategies[currentIndex + 1];
  }
  return null; // No more strategies
}

/** Try all recovery strategies in order until one works */
export async function escalatingRecovery(
  page: Page,
  context: string
): Promise<RecoveryResult> {
  let strategy: RecoveryStrategy | null = RecoveryStrategy.DISMISS_POPUPS;

  while (strategy !== null) {
    const result = await attemptRecovery(page, context, strategy);
    
    if (result.success) {
      console.log(`[Recovery] Success with ${strategy}: ${result.message}`);
      return result;
    }

    // Save debug context before escalating
    await saveDebugContext(page, `recovery-failed-${strategy}`);
    
    strategy = getNextStrategy(strategy);
    if (strategy) {
      console.log(`[Recovery] Escalating to ${strategy}`);
    }
  }

  // All strategies exhausted
  console.error('[Recovery] All recovery strategies exhausted');
  await saveDebugContext(page, 'recovery-exhausted');
  
  return {
    success: false,
    strategy: RecoveryStrategy.FULL_RESET,
    message: 'All recovery strategies exhausted',
  };
}

/** Wrap an async action with automatic recovery */
export async function withRecovery<T>(
  page: Page,
  actionName: string,
  action: () => Promise<T>,
  defaultValue: T
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn(`[${actionName}] Failed: ${errorMsg}`);
    
    // Save debug context BEFORE recovery attempt
    await saveDebugContext(page, `${actionName}-failed`);
    
    // Try to recover
    const recovery = await escalatingRecovery(page, actionName);
    
    if (recovery.success) {
      // Try action one more time after recovery
      try {
        return await action();
      } catch (retryError) {
        const retryMsg = retryError instanceof Error ? retryError.message : String(retryError);
        console.warn(`[${actionName}] Failed after recovery: ${retryMsg}, using default value`);
        await saveDebugContext(page, `${actionName}-retry-failed`);
        return defaultValue;
      }
    }
    
    console.warn(`[${actionName}] Recovery failed, using default value`);
    return defaultValue;
  }
}
