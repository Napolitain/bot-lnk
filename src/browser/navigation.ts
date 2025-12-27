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

async function isOnRecruitmentView(page: Page): Promise<boolean> {
  try {
    const recruitmentTable = page.locator('.table--global-overview--recruitment');
    return await recruitmentTable.isVisible({ timeout: 2000 });
  } catch {
    return false;
  }
}

async function isOnTradingView(page: Page): Promise<boolean> {
  try {
    const tradingTable = page.locator('.table--global-overview--trading');
    return await tradingTable.isVisible({ timeout: 2000 });
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

export async function navigateToRecruitmentView(page: Page): Promise<boolean> {
  await dismissPopups(page);

  // Check if already on recruitment view
  if (await isOnRecruitmentView(page)) {
    return true;
  }

  // Try to click the recruitment button
  try {
    await dismissPopups(page);
    const recruitmentBtn = page.getByRole('button', { name: 'Recruitment list' });
    if (await recruitmentBtn.isVisible({ timeout: 5000 })) {
      await recruitmentBtn.click();
      await page.waitForTimeout(1000);
      await dismissPopups(page);
      return await isOnRecruitmentView(page);
    }
  } catch {
    // Button not found
  }

  return false;
}

export async function navigateToTradingView(page: Page): Promise<boolean> {
  await dismissPopups(page);

  // Check if already on trading view
  if (await isOnTradingView(page)) {
    return true;
  }

  // Try to click the trading button
  try {
    await dismissPopups(page);
    const tradingBtn = page.getByRole('button', { name: 'Trading list' });
    if (await tradingBtn.isVisible({ timeout: 5000 })) {
      await tradingBtn.click();
      await page.waitForTimeout(1000);
      await dismissPopups(page);
      return await isOnTradingView(page);
    }
  } catch {
    // Button not found
  }

  return false;
}
