import type { Page } from 'playwright';
import { pollUntil } from '../utils/index.js';
import { dismissPopups } from './popups.js';

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
    const recruitmentTable = page.locator(
      '.table--global-overview--recruitment',
    );
    return await recruitmentTable.isVisible({ timeout: 500 });
  } catch {
    return false;
  }
}

/** Check if castle building menu is open (per-castle view with Keep, Arsenal, etc.) */
async function isCastleBuildingMenuOpen(page: Page): Promise<boolean> {
  try {
    const keepIcon = page.locator('.icon-building--keep');
    return await keepIcon.isVisible({ timeout: 500 });
  } catch {
    return false;
  }
}

/** Check if Keep menu is open (shows "Trade for Silver" option) */
async function isKeepMenuOpen(page: Page): Promise<boolean> {
  try {
    // Look for the trade button in Keep menu
    const tradeBtn = page.locator('button.button--in-building-list--trade');
    return await tradeBtn.isVisible({ timeout: 500 });
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
      const buildingsBtn = page.getByRole('button', {
        name: 'Current building upgrades',
      });
      if (await buildingsBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await buildingsBtn.click();
        await new Promise((resolve) => setTimeout(resolve, 500));
        return await isOnBuildingsView(page);
      }
      return false;
    },
    { timeout: 15000, interval: 1000, description: 'buildings view' },
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
      const recruitmentBtn = page.getByRole('button', {
        name: 'Recruitment list',
      });
      if (await recruitmentBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await recruitmentBtn.click();
        await new Promise((resolve) => setTimeout(resolve, 500));
        return await isOnRecruitmentView(page);
      }
      return false;
    },
    { timeout: 15000, interval: 1000, description: 'recruitment view' },
  );

  return success;
}

/**
 * Navigate to a castle's Keep menu for trading.
 * Path: Global buildings view → Castle row → Buildings menu → Keep
 */
export async function navigateToCastleKeep(
  page: Page,
  castleIndex: number,
): Promise<boolean> {
  await dismissPopups(page);

  // If already in Keep menu, we're done
  if (await isKeepMenuOpen(page)) {
    return true;
  }

  // First ensure we're on the global buildings view
  if (!(await isOnBuildingsView(page))) {
    const navSuccess = await navigateToBuildingsView(page);
    if (!navSuccess) {
      console.warn('[navigateToCastleKeep] Could not navigate to buildings view');
      return false;
    }
  }

  // Click on the castle row to open the per-castle menu
  const castleRows = page.locator(
    '.table--global-overview--buildings .tabular-row:not(.global-overview--table--header)',
  );
  const row = castleRows.nth(castleIndex);

  // Click on the castle name cell to open per-castle building menu
  const castleNameCell = row.locator('.tabular-cell--upgrade-building').first();
  if (!(await castleNameCell.isVisible({ timeout: 2000 }).catch(() => false))) {
    console.warn(`[navigateToCastleKeep] Castle row ${castleIndex} not visible`);
    return false;
  }

  await castleNameCell.click();
  await page.waitForTimeout(500);
  await dismissPopups(page);

  // Wait for castle building menu to appear
  const menuOpened = await pollUntil(
    async () => {
      await dismissPopups(page);
      return await isCastleBuildingMenuOpen(page);
    },
    { timeout: 5000, interval: 500, description: 'castle building menu' },
  );

  if (!menuOpened) {
    console.warn('[navigateToCastleKeep] Castle building menu did not open');
    return false;
  }

  // Click on Keep building row
  const keepRow = page.locator('.menu-list-element-basic.clickable').filter({
    has: page.locator('.icon-building--keep'),
  });

  if (!(await keepRow.isVisible({ timeout: 2000 }).catch(() => false))) {
    console.warn('[navigateToCastleKeep] Keep building not found in menu');
    return false;
  }

  await keepRow.click();
  await page.waitForTimeout(500);
  await dismissPopups(page);

  // Wait for Keep menu to open
  const keepOpened = await pollUntil(
    async () => {
      await dismissPopups(page);
      return await isKeepMenuOpen(page);
    },
    { timeout: 5000, interval: 500, description: 'keep menu' },
  );

  if (!keepOpened) {
    console.warn('[navigateToCastleKeep] Keep menu did not open');
    return false;
  }

  return true;
}

/** Check if Tavern menu is open (shows "Available missions" section) */
async function isTavernMenuOpen(page: Page): Promise<boolean> {
  try {
    const missionsSection = page.locator('.menu-list-title-basic').filter({
      hasText: 'Available missions',
    });
    return await missionsSection.isVisible({ timeout: 500 });
  } catch {
    return false;
  }
}

/**
 * Navigate to a castle's Tavern menu for missions.
 * Path: Global buildings view → Castle row → Buildings menu → Tavern
 */
export async function navigateToCastleTavern(
  page: Page,
  castleIndex: number,
): Promise<boolean> {
  await dismissPopups(page);

  // If already in Tavern menu, we're done
  if (await isTavernMenuOpen(page)) {
    return true;
  }

  // First ensure we're on the global buildings view
  if (!(await isOnBuildingsView(page))) {
    const navSuccess = await navigateToBuildingsView(page);
    if (!navSuccess) {
      console.warn('[navigateToCastleTavern] Could not navigate to buildings view');
      return false;
    }
  }

  // Click on the castle row to open the per-castle menu
  const castleRows = page.locator(
    '.table--global-overview--buildings .tabular-row:not(.global-overview--table--header)',
  );
  const row = castleRows.nth(castleIndex);

  // Click on the castle name cell to open per-castle building menu
  const castleNameCell = row.locator('.tabular-cell--upgrade-building').first();
  if (!(await castleNameCell.isVisible({ timeout: 2000 }).catch(() => false))) {
    console.warn(`[navigateToCastleTavern] Castle row ${castleIndex} not visible`);
    return false;
  }

  await castleNameCell.click();
  await page.waitForTimeout(500);
  await dismissPopups(page);

  // Wait for castle building menu to appear
  const menuOpened = await pollUntil(
    async () => {
      await dismissPopups(page);
      return await isCastleBuildingMenuOpen(page);
    },
    { timeout: 5000, interval: 500, description: 'castle building menu' },
  );

  if (!menuOpened) {
    console.warn('[navigateToCastleTavern] Castle building menu did not open');
    return false;
  }

  // Click on Tavern building row
  const tavernRow = page.locator('.menu-list-element-basic.clickable').filter({
    has: page.locator('.icon-building--tavern'),
  });

  if (!(await tavernRow.isVisible({ timeout: 2000 }).catch(() => false))) {
    console.warn('[navigateToCastleTavern] Tavern building not found in menu');
    return false;
  }

  await tavernRow.click();
  await page.waitForTimeout(500);
  await dismissPopups(page);

  // Wait for Tavern menu to open
  const tavernOpened = await pollUntil(
    async () => {
      await dismissPopups(page);
      return await isTavernMenuOpen(page);
    },
    { timeout: 5000, interval: 500, description: 'tavern menu' },
  );

  if (!tavernOpened) {
    console.warn('[navigateToCastleTavern] Tavern menu did not open');
    return false;
  }

  return true;
}
