import { Page } from 'playwright';
import { dismissPopups } from './popups.js';

async function isOnBuildingsView(page: Page): Promise<boolean> {
  try {
    // Check if we can see the buildings table
    const buildingsTable = page.locator('.table--global-overview--buildings');
    return await buildingsTable.isVisible({ timeout: 2000 });
  } catch {
    return false;
  }
}

export async function navigateToBuildingsView(page: Page): Promise<boolean> {
  // Dismiss popups first
  await dismissPopups(page);

  // Check if already on buildings view
  if (await isOnBuildingsView(page)) {
    return true;
  }

  // Try to click the buildings button
  try {
    await dismissPopups(page);
    const buildingsBtn = page.getByRole('button', { name: 'Current building upgrades' });
    if (await buildingsBtn.isVisible({ timeout: 5000 })) {
      await buildingsBtn.click();
      await page.waitForTimeout(1000);
      await dismissPopups(page);
      return await isOnBuildingsView(page);
    }
  } catch {
    // Button not found
  }

  return false;
}

