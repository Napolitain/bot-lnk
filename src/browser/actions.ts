import { Page } from 'playwright';
import {
  BuildingType,
  Technology,
  buildingTypeToJSON,
} from '../generated/proto/config.js';
import { config } from '../config.js';
import { BUILDING_TYPE_TO_INDEX, TECHNOLOGY_TO_NAME } from '../game/mappings.js';

export async function upgradeBuilding(page: Page, castleIndex: number, buildingType: BuildingType): Promise<boolean> {
  const buildingIndex = BUILDING_TYPE_TO_INDEX[buildingType];
  if (buildingIndex < 0) {
    console.log(`Unknown building type: ${buildingType}`);
    return false;
  }

  try {
    const castleRows = page.locator('.table--global-overview--buildings .tabular-row:not(.global-overview--table--header)');
    const row = castleRows.nth(castleIndex);
    const buildingCells = row.locator('.tabular-cell--upgrade-building');
    const cell = buildingCells.nth(buildingIndex);

    // Use first() to handle cells with multiple buttons (e.g., upgrade + cancel)
    const upgradeBtn = cell.locator('button.button--action').first();

    if (await upgradeBtn.isEnabled().catch(() => false)) {
      if (config.dryRun) {
        console.log(`[DRY RUN] Would click upgrade button for ${buildingTypeToJSON(buildingType)} in castle ${castleIndex}`);
        return true;
      }

      await upgradeBtn.click();
      await page.waitForTimeout(500);

      // Check for confirmation dialog
      const confirmBtn = page.locator('.dialog button.button--action, div:nth-child(2) > .button');
      if (await confirmBtn.count() > 0) {
        await confirmBtn.first().click();
      }

      console.log(`Upgraded ${buildingTypeToJSON(buildingType)} in castle ${castleIndex}`);
      return true;
    }
  } catch (e) {
    console.log(`Failed to upgrade:`, e);
  }
  return false;
}

export async function researchTechnology(page: Page, technology: Technology): Promise<boolean> {
  const techName = TECHNOLOGY_TO_NAME[technology];
  if (!techName) {
    console.log(`Unknown technology: ${technology}`);
    return false;
  }

  try {
    if (config.dryRun) {
      console.log(`[DRY RUN] Would research ${techName}`);
      return true;
    }

    // Click on Library button to open research menu
    const libraryBtn = page.getByRole('button', { name: 'Library' });
    if (await libraryBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await libraryBtn.click();
      await page.waitForTimeout(500);
    }

    // Click on the technology name
    const techBtn = page.getByText(techName, { exact: true });
    if (await techBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await techBtn.click();
      await page.waitForTimeout(500);
      console.log(`Started research: ${techName}`);
      return true;
    } else {
      console.log(`Technology ${techName} not visible (may already be researched or not available)`);
    }
  } catch (e) {
    console.log(`Failed to research ${techName}:`, e);
  }
  return false;
}

export async function clickFreeFinishButtons(page: Page): Promise<number> {
  // Find and click all free finish buttons (instant complete for short builds)
  const freeFinishBtns = page.locator('.icon-build-finish-free-2').locator('..');
  const count = await freeFinishBtns.count();

  if (count > 0) {
    console.log(`Found ${count} free finish button(s), clicking...`);
    for (let i = 0; i < count; i++) {
      try {
        const btn = freeFinishBtns.nth(i);
        if (await btn.isVisible()) {
          if (config.dryRun) {
            console.log(`[DRY RUN] Would click free finish button ${i + 1}`);
          } else {
            await btn.click();
            await page.waitForTimeout(500);
            console.log(`Clicked free finish button ${i + 1}`);
          }
        }
      } catch (e) {
        console.log(`Failed to click free finish button ${i + 1}:`, e);
      }
    }
  }

  return count;
}
