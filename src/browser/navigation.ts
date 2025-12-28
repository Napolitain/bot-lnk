import { Page } from 'playwright';
import { dismissPopups } from './popups.js';
import { pollUntil } from '../utils/index.js';

async function isOnBuildingsView(page: Page): Promise<boolean> {
  try {
    const buildingsTable = page.locator('.table--global-overview--buildings');
    return await buildingsTable.isVisible({ timeout: 500 });
  } catch {
    return false;
  }
}

async function isOnRecruitmentView(page: Page): Promise<boolean> {
  try {
    const recruitmentTable = page.locator('.table--global-overview--recruitment');
    return await recruitmentTable.isVisible({ timeout: 500 });
  } catch {
    return false;
  }
}

async function isOnTradingView(page: Page): Promise<boolean> {
  try {
    const tradingTable = page.locator('.table--global-overview--trading');
    return await tradingTable.isVisible({ timeout: 500 });
  } catch {
    return false;
  }
}

export async function navigateToBuildingsView(page: Page): Promise<boolean> {
  await dismissPopups(page);

  // Check if already on buildings view
  if (await isOnBuildingsView(page)) {
    return true;
  }

  // Try to click the buildings button with polling
  const success = await pollUntil(
    async () => {
      await dismissPopups(page);
      const buildingsBtn = page.getByRole('button', { name: 'Current building upgrades' });
      if (await buildingsBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await buildingsBtn.click();
        await new Promise(resolve => setTimeout(resolve, 500));
        return await isOnBuildingsView(page);
      }
      return false;
    },
    { timeout: 15000, interval: 1000, description: 'buildings view' }
  );

  return success;
}

export async function navigateToRecruitmentView(page: Page): Promise<boolean> {
  await dismissPopups(page);

  if (await isOnRecruitmentView(page)) {
    return true;
  }

  const success = await pollUntil(
    async () => {
      await dismissPopups(page);
      const recruitmentBtn = page.getByRole('button', { name: 'Recruitment list' });
      if (await recruitmentBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await recruitmentBtn.click();
        await new Promise(resolve => setTimeout(resolve, 500));
        return await isOnRecruitmentView(page);
      }
      return false;
    },
    { timeout: 15000, interval: 1000, description: 'recruitment view' }
  );

  return success;
}

export async function navigateToTradingView(page: Page): Promise<boolean> {
  await dismissPopups(page);

  if (await isOnTradingView(page)) {
    return true;
  }

  const success = await pollUntil(
    async () => {
      await dismissPopups(page);
      const tradingBtn = page.getByRole('button', { name: 'Trading list' });
      if (await tradingBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await tradingBtn.click();
        await new Promise(resolve => setTimeout(resolve, 500));
        return await isOnTradingView(page);
      }
      return false;
    },
    { timeout: 15000, interval: 1000, description: 'trading view' }
  );

  return success;
}
