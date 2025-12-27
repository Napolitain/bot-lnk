import { Page } from 'playwright';

/** Expected game URLs */
const GAME_URL_PATTERNS = [
  /lordsandknights\.com/,
  /lnk\./,
];

/** Check if we're on a valid game page */
async function isOnGamePage(page: Page): Promise<boolean> {
  const url = page.url();
  return GAME_URL_PATTERNS.some(pattern => pattern.test(url));
}

/** Check if there's a blocking overlay/dialog */
async function hasBlockingOverlay(page: Page): Promise<boolean> {
  const overlaySelectors = [
    '.dialog:visible',
    '.modal:visible', 
    '[class*="overlay"]:visible',
    '.loading-screen:visible',
    '.error-dialog:visible',
  ];

  for (const selector of overlaySelectors) {
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

/** Check if main game UI elements are visible */
async function hasExpectedElements(page: Page, view: 'buildings' | 'recruitment' | 'trading'): Promise<boolean> {
  const viewSelectors: Record<string, string> = {
    buildings: '.table--global-overview--buildings',
    recruitment: '.table--global-overview--recruitment',
    trading: '.table--global-overview--trading',
  };

  const selector = viewSelectors[view];
  if (!selector) return true;

  try {
    const element = page.locator(selector);
    return await element.isVisible({ timeout: 2000 }).catch(() => false);
  } catch {
    return false;
  }
}

/** Check if page appears to be in an error state */
async function hasErrorState(page: Page): Promise<{ hasError: boolean; message?: string }> {
  const errorSelectors = [
    { selector: '.error-message', type: 'error' },
    { selector: '[class*="error"]', type: 'error' },
    { selector: '.connection-lost', type: 'connection' },
    { selector: '.session-expired', type: 'session' },
  ];

  for (const { selector, type } of errorSelectors) {
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

export interface HealthCheckResult {
  healthy: boolean;
  issues: string[];
  url: string;
}

/** Perform comprehensive health check on page */
export async function checkPageHealth(
  page: Page, 
  expectedView?: 'buildings' | 'recruitment' | 'trading'
): Promise<HealthCheckResult> {
  const issues: string[] = [];
  const url = page.url();

  // Check 1: Valid game URL
  if (!await isOnGamePage(page)) {
    issues.push(`Not on game page (URL: ${url})`);
  }

  // Check 2: No blocking overlays
  if (await hasBlockingOverlay(page)) {
    issues.push('Blocking overlay detected');
  }

  // Check 3: Expected view elements present
  if (expectedView && !await hasExpectedElements(page, expectedView)) {
    issues.push(`Expected ${expectedView} view elements not found`);
  }

  // Check 4: No error states
  const errorState = await hasErrorState(page);
  if (errorState.hasError) {
    issues.push(`Error state: ${errorState.message}`);
  }

  return {
    healthy: issues.length === 0,
    issues,
    url,
  };
}

/** Wait for page to become healthy, with retries */
export async function waitForHealthyPage(
  page: Page,
  expectedView?: 'buildings' | 'recruitment' | 'trading',
  maxAttempts = 3,
  delayMs = 1000
): Promise<HealthCheckResult> {
  let lastResult: HealthCheckResult = { healthy: false, issues: ['Not checked'], url: '' };

  for (let i = 0; i < maxAttempts; i++) {
    lastResult = await checkPageHealth(page, expectedView);
    
    if (lastResult.healthy) {
      return lastResult;
    }

    if (i < maxAttempts - 1) {
      console.log(`[Health] Unhealthy (attempt ${i + 1}/${maxAttempts}): ${lastResult.issues.join(', ')}`);
      await page.waitForTimeout(delayMs);
    }
  }

  return lastResult;
}
