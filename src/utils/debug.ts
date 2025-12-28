import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Locator, Page } from 'playwright';
import { config } from '../config.js';

/** Get HTML of element with parent and children context */
async function getElementContext(locator: Locator): Promise<string> {
  try {
    // Get the element's outer HTML
    const elementHtml = await locator.evaluate((el) => {
      // Get parent HTML (limited depth)
      const parent = el.parentElement;
      const parentInfo = parent
        ? `<!-- PARENT: ${parent.tagName}.${parent.className} -->\n`
        : '';

      // Get element with all children
      return parentInfo + el.outerHTML;
    });
    return elementHtml;
  } catch (e) {
    return `<!-- Failed to get element HTML: ${e} -->`;
  }
}

/** Dump element context to file for debugging */
export async function dumpElementContext(
  page: Page,
  selector: string,
  prefix: string,
): Promise<string | null> {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const debugDir = path.join(config.userDataDir, 'debug-dumps');
    fs.mkdirSync(debugDir, { recursive: true });

    const locator = page.locator(selector).first();
    const exists = (await locator.count()) > 0;

    let content = `<!-- Debug dump: ${prefix} -->\n`;
    content += `<!-- Timestamp: ${new Date().toISOString()} -->\n`;
    content += `<!-- URL: ${page.url()} -->\n`;
    content += `<!-- Selector: ${selector} -->\n\n`;

    if (exists) {
      content += await getElementContext(locator);
    } else {
      content += `<!-- Element not found with selector: ${selector} -->\n`;
      // Dump page body as fallback
      const bodyHtml = await page
        .locator('body')
        .innerHTML()
        .catch(() => 'Failed to get body');
      content += `<!-- Page body (truncated to 5000 chars): -->\n`;
      content += bodyHtml.substring(0, 5000);
    }

    const filePath = path.join(debugDir, `${timestamp}-${prefix}.html`);
    fs.writeFileSync(filePath, content);
    console.log(`[Debug] HTML dump saved: ${filePath}`);
    return filePath;
  } catch (e) {
    console.error('[Debug] Failed to dump element context:', e);
    return null;
  }
}

/** Save full debug context: screenshot + HTML dump */
export async function saveDebugContext(
  page: Page,
  actionName: string,
  selector?: string,
): Promise<{ screenshot: string | null; htmlDump: string | null }> {
  const { saveScreenshot } = await import('./screenshot.js');

  const screenshot = await saveScreenshot(page, actionName);
  const htmlDump = selector
    ? await dumpElementContext(page, selector, actionName)
    : await dumpElementContext(page, 'body', actionName);

  return { screenshot, htmlDump };
}
