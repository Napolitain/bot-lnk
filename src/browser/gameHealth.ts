/**
 * Game-specific resilience - implements recovery and health checks for Lords & Knights
 */

import { Page } from 'playwright';
import { RecoveryAction, HealthChecker, HealthCheckResult, StateSnapshot } from '../resilience/index.js';
import { dismissPopups } from './popups.js';
import { saveDebugContext } from '../utils/index.js';

/** Game URL patterns */
const GAME_URL_PATTERNS = [
  /lordsandknights\.com/,
  /lnk\./,
];

/** Overlay selectors that block interaction */
const OVERLAY_SELECTORS = [
  '.dialog:visible',
  '.modal:visible',
  '[class*="overlay"]:visible',
  '.loading-screen:visible',
  '.error-dialog:visible',
];

/** Error state selectors */
const ERROR_SELECTORS = [
  { selector: '.error-message', type: 'error' },
  { selector: '[class*="error"]', type: 'error' },
  { selector: '.connection-lost', type: 'connection' },
  { selector: '.session-expired', type: 'session' },
];

/** View selectors */
const VIEW_SELECTORS: Record<string, string> = {
  buildings: '.table--global-overview--buildings',
  recruitment: '.table--global-overview--recruitment',
  trading: '.table--global-overview--trading',
};

// ==================== Health Checkers ====================

/** Check if on valid game URL */
async function isOnGamePage(page: Page): Promise<boolean> {
  const url = page.url();
  return GAME_URL_PATTERNS.some(pattern => pattern.test(url));
}

/** Check for blocking overlays */
async function hasBlockingOverlay(page: Page): Promise<boolean> {
  for (const selector of OVERLAY_SELECTORS) {
    try {
      const element = page.locator(selector);
      if (await element.isVisible({ timeout: 500 }).catch(() => false)) {
        return true;
      }
    } catch {
      // Ignore
    }
  }
  return false;
}

/** Check for error states */
async function hasErrorState(page: Page): Promise<{ hasError: boolean; message?: string }> {
  for (const { selector, type } of ERROR_SELECTORS) {
    try {
      const element = page.locator(selector);
      if (await element.isVisible({ timeout: 500 }).catch(() => false)) {
        const text = await element.textContent().catch(() => '');
        return { hasError: true, message: `${type}: ${text}` };
      }
    } catch {
      // Ignore
    }
  }
  return { hasError: false };
}

/** Check if expected view is visible */
async function hasExpectedView(page: Page, view: string): Promise<boolean> {
  const selector = VIEW_SELECTORS[view];
  if (!selector) return true;

  try {
    const element = page.locator(selector);
    return await element.isVisible({ timeout: 2000 }).catch(() => false);
  } catch {
    return false;
  }
}

/** Create a health checker for the game page */
export function createGameHealthChecker(expectedView?: string): HealthChecker<Page> {
  return async (page: Page): Promise<HealthCheckResult> => {
    const issues: string[] = [];

    if (!await isOnGamePage(page)) {
      issues.push(`Not on game page (URL: ${page.url()})`);
    }

    if (await hasBlockingOverlay(page)) {
      issues.push('Blocking overlay detected');
    }

    if (expectedView && !await hasExpectedView(page, expectedView)) {
      issues.push(`Expected ${expectedView} view not found`);
    }

    const errorState = await hasErrorState(page);
    if (errorState.hasError) {
      issues.push(`Error state: ${errorState.message}`);
    }

    return {
      healthy: issues.length === 0,
      issues,
      context: { url: page.url() },
    };
  };
}

// ==================== Recovery Actions ====================

/** Create game-specific recovery actions */
export function createGameRecoveryActions(): RecoveryAction<Page>[] {
  return [
    {
      name: 'dismiss_popups',
      execute: async (page: Page) => {
        await dismissPopups(page);
        await page.waitForTimeout(1000);
        return true;
      },
    },
    {
      name: 'wait_and_retry',
      execute: async (page: Page) => {
        await page.waitForTimeout(3000);
        await dismissPopups(page);
        return true;
      },
    },
    {
      name: 'reload_page',
      execute: async (page: Page) => {
        await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(3000);
        await dismissPopups(page);
        return true;
      },
    },
    {
      name: 'navigate_home',
      execute: async (page: Page) => {
        await page.goto('https://lordsandknights.com/', { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(3000);
        await dismissPopups(page);
        return true;
      },
    },
    {
      name: 'full_reset',
      execute: async (page: Page) => {
        const browserContext = page.context();
        await browserContext.clearCookies();
        await page.goto('https://lordsandknights.com/', { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(3000);
        return true;
      },
    },
  ];
}

/** Create debug-saving failure handler */
export function createDebugOnFailure(): (action: RecoveryAction<Page>, error: string) => Promise<void> {
  return async (action, _error) => {
    // Note: We can't easily get the page here, so debug saving should be done at call site
    console.log(`[Recovery] Would save debug for: ${action.name}`);
  };
}

// ==================== State Snapshots ====================

/** Create a state snapshot from time remaining */
export function createTimeSnapshot(timeRemainingMs: number | null): StateSnapshot {
  return {
    timestamp: Date.now(),
    signature: timeRemainingMs !== null ? String(timeRemainingMs) : 'null',
  };
}

// ==================== Convenience Wrappers ====================

/** Quick health check with optional view */
export async function checkGameHealth(page: Page, expectedView?: string): Promise<HealthCheckResult> {
  const checker = createGameHealthChecker(expectedView);
  return checker(page);
}

/** Try to dismiss overlay if detected */
export async function dismissIfOverlay(page: Page): Promise<boolean> {
  if (await hasBlockingOverlay(page)) {
    console.log('[Health] Overlay detected, dismissing...');
    await dismissPopups(page);
    await page.waitForTimeout(500);
    return !await hasBlockingOverlay(page);
  }
  return true;
}

/** Force page refresh */
export async function forceRefresh(page: Page): Promise<void> {
  console.log('[Recovery] Forcing page refresh');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  await dismissPopups(page);
}
