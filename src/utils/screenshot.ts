import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Page } from 'playwright';
import { config } from '../config.js';

/** Save a screenshot for debugging */
export async function saveScreenshot(
  page: Page,
  prefix: string,
): Promise<string | null> {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotDir = path.join(config.userDataDir, 'error-screenshots');
    fs.mkdirSync(screenshotDir, { recursive: true });
    const screenshotPath = path.join(
      screenshotDir,
      `${timestamp}-${prefix}.png`,
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`[Screenshot] Saved: ${screenshotPath}`);
    return screenshotPath;
  } catch (e) {
    console.error('[Screenshot] Failed to save:', e);
    return null;
  }
}

/** Format error for logging */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}
