import { Page } from 'playwright';
import {
  BuildingType,
  Technology,
  UnitType,
  buildingTypeToJSON,
  unitTypeToJSON,
} from '../generated/proto/config.js';
import { config } from '../config.js';
import { BUILDING_TYPE_TO_INDEX, TECHNOLOGY_TO_NAME, UNIT_TYPE_TO_INDEX } from '../game/mappings.js';
import { dismissPopups } from './popups.js';
import { checkPageHealth } from './health.js';

/** Get current upgrade queue count for a castle */
async function getUpgradeQueueCount(page: Page, castleIndex: number): Promise<number> {
  try {
    const castleRows = page.locator('.table--global-overview--buildings .tabular-row:not(.global-overview--table--header)');
    const row = castleRows.nth(castleIndex);
    // Count cells that have upgrading status (timer visible)
    const upgradingCells = row.locator('.tabular-cell--upgrade-building .upgrade-status--timer');
    return await upgradingCells.count();
  } catch {
    return -1;
  }
}

/** Get current unit count for a specific unit type in a castle */
async function getUnitCount(page: Page, castleIndex: number, unitIndex: number): Promise<number> {
  try {
    const castleRows = page.locator('.table--global-overview--recruitment .tabular-row:not(.global-overview--table--header)');
    const row = castleRows.nth(castleIndex);
    const unitCells = row.locator('.tabular-cell--recruitment');
    const cell = unitCells.nth(unitIndex);
    const countDiv = cell.locator('.recruitment--cell .tabular-cell--input-container .centered.last');
    const countText = await countDiv.textContent() || '0';
    return parseInt(countText, 10) || 0;
  } catch {
    return -1;
  }
}

/** Verify page is still healthy after an action */
async function verifyPostAction(page: Page, actionName: string): Promise<boolean> {
  await page.waitForTimeout(300);
  const health = await checkPageHealth(page);
  if (!health.healthy) {
    console.error(`[${actionName}] Page unhealthy after action: ${health.issues.join(', ')}`);
    return false;
  }
  return true;
}

export async function upgradeBuilding(page: Page, castleIndex: number, buildingType: BuildingType): Promise<boolean> {
  const buildingIndex = BUILDING_TYPE_TO_INDEX[buildingType];
  if (buildingIndex < 0) {
    console.log(`Unknown building type: ${buildingType}`);
    return false;
  }

  try {
    // Dismiss popups before action
    await dismissPopups(page);

    // Get queue count before action for verification
    const queueBefore = await getUpgradeQueueCount(page, castleIndex);

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
      await dismissPopups(page);
      const confirmBtn = page.locator('.dialog button.button--action, div:nth-child(2) > .button');
      if (await confirmBtn.count() > 0) {
        await confirmBtn.first().click();
        await page.waitForTimeout(500);
      }

      // Verify: page still healthy
      if (!await verifyPostAction(page, 'upgradeBuilding')) {
        return false;
      }

      // Verify: queue count increased (or building started upgrading)
      const queueAfter = await getUpgradeQueueCount(page, castleIndex);
      if (queueBefore >= 0 && queueAfter >= 0 && queueAfter <= queueBefore) {
        console.warn(`[upgradeBuilding] Queue did not increase (${queueBefore} -> ${queueAfter}) - action may have failed`);
        // Don't return false - the upgrade might have finished instantly or we misread
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
    // Dismiss popups before action
    await dismissPopups(page);

    if (config.dryRun) {
      console.log(`[DRY RUN] Would research ${techName}`);
      return true;
    }

    // Click on Library button to open research menu
    const libraryBtn = page.getByRole('button', { name: 'Library' });
    if (await libraryBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await libraryBtn.click();
      await page.waitForTimeout(500);
      await dismissPopups(page);
    }

    // Click on the technology name
    const techBtn = page.getByText(techName, { exact: true });
    if (await techBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await techBtn.click();
      await page.waitForTimeout(500);
      await dismissPopups(page);

      // Verify page health
      if (!await verifyPostAction(page, 'researchTechnology')) {
        return false;
      }

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
  // Dismiss popups before action
  await dismissPopups(page);

  // Find and click all free finish buttons (instant complete for short builds)
  const freeFinishBtns = page.locator('.icon-build-finish-free-2').locator('..');
  const count = await freeFinishBtns.count();

  let clicked = 0;
  if (count > 0) {
    console.log(`Found ${count} free finish button(s), clicking...`);
    for (let i = 0; i < count; i++) {
      try {
        await dismissPopups(page);
        const btn = freeFinishBtns.nth(i);
        if (await btn.isVisible()) {
          if (config.dryRun) {
            console.log(`[DRY RUN] Would click free finish button ${i + 1}`);
            clicked++;
          } else {
            await btn.click();
            await page.waitForTimeout(500);
            
            // Verify page health after each click
            const health = await checkPageHealth(page);
            if (!health.healthy) {
              console.warn(`[freeFinish] Page unhealthy after click ${i + 1}: ${health.issues.join(', ')}`);
              break;
            }
            
            console.log(`Clicked free finish button ${i + 1}`);
            clicked++;
          }
        }
      } catch (e) {
        console.log(`Failed to click free finish button ${i + 1}:`, e);
      }
    }
  }

  return clicked;
}

export async function recruitUnits(page: Page, castleIndex: number, unitType: UnitType, amount: number): Promise<boolean> {
  const unitIndex = UNIT_TYPE_TO_INDEX[unitType];
  if (unitIndex < 0) {
    console.log(`Unknown unit type: ${unitType}`);
    return false;
  }

  if (amount <= 0) {
    console.log(`Invalid recruit amount: ${amount}`);
    return false;
  }

  try {
    await dismissPopups(page);

    // Get unit count before for verification
    const countBefore = await getUnitCount(page, castleIndex, unitIndex);

    const castleRows = page.locator('.table--global-overview--recruitment .tabular-row:not(.global-overview--table--header)');
    const row = castleRows.nth(castleIndex);
    const unitCells = row.locator('.tabular-cell--recruitment');
    const cell = unitCells.nth(unitIndex);
    const recruitmentCell = cell.locator('.recruitment--cell');

    // Set the amount in the input field
    const input = recruitmentCell.locator('input.component--input');
    if (await input.count() === 0) {
      console.log(`Input field not found for ${unitTypeToJSON(unitType)}`);
      return false;
    }

    // Check if recruit button is enabled
    const recruitBtn = recruitmentCell.locator('button.button--action').last();
    const isDisabled = await recruitBtn.evaluate(el => el.classList.contains('disabled'));
    if (isDisabled) {
      console.log(`Cannot recruit ${unitTypeToJSON(unitType)} - button disabled`);
      return false;
    }

    if (config.dryRun) {
      console.log(`[DRY RUN] Would recruit ${amount}x ${unitTypeToJSON(unitType)} in castle ${castleIndex}`);
      return true;
    }

    // Clear input and type the amount
    await input.fill(String(amount));
    await page.waitForTimeout(200);

    // Click recruit button
    await recruitBtn.click();
    await page.waitForTimeout(500);

    // Verify page health
    if (!await verifyPostAction(page, 'recruitUnits')) {
      return false;
    }

    // Verify: unit count increased or recruitment queue started
    // Note: units might be queued, not instantly added, so we just check health
    console.log(`Recruited ${amount}x ${unitTypeToJSON(unitType)} in castle ${castleIndex}`);
    return true;
  } catch (e) {
    console.log(`Failed to recruit ${unitTypeToJSON(unitType)}:`, e);
  }
  return false;
}

export async function executeTrade(page: Page, castleIndex: number): Promise<boolean> {
  try {
    await dismissPopups(page);

    // Find the castle row in trading view
    const castleRows = page.locator('.table--global-overview--trading .tabular-row:not(.global-overview--table--header)');
    const row = castleRows.nth(castleIndex);

    // Click the trade button for this castle (usually "Trade" or similar)
    const tradeBtn = row.locator('button.button--action').first();
    if (await tradeBtn.count() === 0) {
      console.log(`No trade button found for castle ${castleIndex}`);
      return false;
    }

    if (config.dryRun) {
      console.log(`[DRY RUN] Would open trade dialog for castle ${castleIndex}`);
      return true;
    }

    await tradeBtn.click();
    await page.waitForTimeout(1000);
    await dismissPopups(page);

    // Verify dialog opened (look for trade dialog elements)
    const dialogVisible = await page.locator('.menu--content-section').isVisible({ timeout: 2000 }).catch(() => false);
    if (!dialogVisible) {
      console.warn(`[executeTrade] Trade dialog did not open for castle ${castleIndex}`);
      return false;
    }

    // Now we should be in the trade dialog
    // Click "Max" buttons to maximize transport units
    const maxButtons = page.locator('.seek-bar-increase-value--button');
    const maxCount = await maxButtons.count();
    for (let i = 0; i < maxCount; i++) {
      try {
        await maxButtons.nth(i).click();
        await page.waitForTimeout(100);
      } catch {
        // Some max buttons may not be clickable
      }
    }

    await page.waitForTimeout(500);

    // Click the confirm/send button
    const confirmBtn = page.locator('.menu--content-section button.button--action').filter({ hasText: /send|trade|confirm/i }).first();
    if (await confirmBtn.count() > 0 && await confirmBtn.isEnabled()) {
      await confirmBtn.click();
      await page.waitForTimeout(500);

      // Verify page health after trade
      if (!await verifyPostAction(page, 'executeTrade')) {
        return false;
      }

      console.log(`Executed trade for castle ${castleIndex}`);
      return true;
    } else {
      // Try any action button in the dialog
      const anyConfirmBtn = page.locator('.menu--content-section button.button--action').last();
      if (await anyConfirmBtn.count() > 0 && await anyConfirmBtn.isEnabled()) {
        await anyConfirmBtn.click();
        await page.waitForTimeout(500);

        if (!await verifyPostAction(page, 'executeTrade')) {
          return false;
        }

        console.log(`Executed trade for castle ${castleIndex}`);
        return true;
      }
    }

    console.log(`Could not find confirm button for trade`);
    return false;
  } catch (e) {
    console.log(`Failed to execute trade for castle ${castleIndex}:`, e);
  }
  return false;
}
