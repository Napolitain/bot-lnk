import { Page } from 'playwright';

export async function navigateToBuildingsView(page: Page): Promise<boolean> {
  try {
    const buildingsBtn = page.getByRole('button', { name: 'Current building upgrades' });
    if (await buildingsBtn.isVisible({ timeout: 5000 })) {
      await buildingsBtn.click();
      await page.waitForTimeout(1000);
      return true;
    }
  } catch {
    // Button not found
  }
  return false;
}
