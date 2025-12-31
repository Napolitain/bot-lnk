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
async function _isCastleBuildingMenuOpen(page: Page): Promise<boolean> {
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
 * Navigate to Keep menu for trading (uses per-castle buildings sidebar).
 * Path: Buildings button → Keep in sidebar
 */
export async function navigateToCastleKeep(
  page: Page,
  _castleIndex: number,
): Promise<boolean> {
  await dismissPopups(page);

  // If already in Keep menu, we're done
  if (await isKeepMenuOpen(page)) {
    return true;
  }

  // First click the "Buildings" button to ensure we're in buildings context
  const buildingsBtn = page.getByText('Buildings');
  if (await buildingsBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await buildingsBtn.click();
    await page.waitForTimeout(500);
    await dismissPopups(page);
  }

  // Click "Keep" in the per-castle buildings sidebar
  const keepBtn = page
    .locator('#menu-section-general-container')
    .getByText('Keep');
  if (!(await keepBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
    console.warn('[navigateToCastleKeep] Keep button not found in sidebar');
    return false;
  }

  await keepBtn.click();
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
 * Navigate to Tavern menu for missions (uses per-castle buildings sidebar).
 * Path: Buildings button → Tavern in sidebar
 */
export async function navigateToCastleTavern(
  page: Page,
  _castleIndex: number,
): Promise<boolean> {
  await dismissPopups(page);

  // If already in Tavern menu, we're done
  if (await isTavernMenuOpen(page)) {
    return true;
  }

  // First click the "Buildings" button to ensure we're in buildings context
  const buildingsBtn = page.getByText('Buildings');
  if (await buildingsBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await buildingsBtn.click();
    await page.waitForTimeout(500);
    await dismissPopups(page);
  }

  // Click "Tavern" in the per-castle buildings sidebar
  const tavernBtn = page
    .locator('#menu-section-general-container')
    .getByText('Tavern');
  if (!(await tavernBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
    console.warn('[navigateToCastleTavern] Tavern button not found in sidebar');
    return false;
  }

  await tavernBtn.click();
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

/** Check if Library menu is open (shows research technologies) */
async function isLibraryMenuOpen(page: Page): Promise<boolean> {
  try {
    // Look for any technology name to confirm Library menu is open
    const techSection = page.locator(
      '.menu-list-title-basic, .menu-list-element-basic',
    );
    return await techSection.first().isVisible({ timeout: 500 });
  } catch {
    return false;
  }
}

/**
 * Navigate to Library menu for research (uses global buildings sidebar).
 * Path: Buildings button → Library in sidebar
 */
export async function navigateToCastleLibrary(
  page: Page,
  _castleIndex: number,
): Promise<boolean> {
  await dismissPopups(page);

  // If already in Library menu, we're done
  if (await isLibraryMenuOpen(page)) {
    return true;
  }

  // First click the "Buildings" button to ensure we're in buildings context
  const buildingsBtn = page.getByText('Buildings');
  if (await buildingsBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await buildingsBtn.click();
    await page.waitForTimeout(500);
    await dismissPopups(page);
  }

  // Click "Library" in the global buildings sidebar
  const libraryBtn = page
    .locator('#menu-section-general-container')
    .getByText('Library');
  if (!(await libraryBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
    console.warn(
      '[navigateToCastleLibrary] Library button not found in sidebar',
    );
    return false;
  }

  await libraryBtn.click();
  await page.waitForTimeout(500);
  await dismissPopups(page);

  // Wait for Library menu to open
  const libraryOpened = await pollUntil(
    async () => {
      await dismissPopups(page);
      return await isLibraryMenuOpen(page);
    },
    { timeout: 5000, interval: 500, description: 'library menu' },
  );

  if (!libraryOpened) {
    console.warn('[navigateToCastleLibrary] Library menu did not open');
    return false;
  }

  return true;
}
