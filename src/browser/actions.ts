import type { Page } from 'playwright';
import { config } from '../config.js';
import {
  BUILDING_TYPE_TO_INDEX,
  TECHNOLOGY_TO_NAME,
  UNIT_TYPE_TO_INDEX,
} from '../game/mappings.js';
import {
  type BuildingType,
  buildingTypeToJSON,
  type Technology,
  type UnitType,
  unitTypeToJSON,
} from '../generated/proto/config.js';
import { saveDebugContext } from '../utils/index.js';
import { checkGameHealth, dismissIfOverlay } from './gameHealth.js';
import { navigateToCastleLibrary } from './navigation.js';
import { dismissPopups } from './popups.js';

/** Get current upgrade queue count for a castle by counting buildings with multiple cells */
async function _getUpgradeQueueCount(
  page: Page,
  castleIndex: number,
): Promise<number> {
  try {
    const castleRows = page.locator(
      '.table--global-overview--buildings .tabular-row:not(.global-overview--table--header)',
    );
    const row = castleRows.nth(castleIndex);
    const buildingCells = row.locator('.tabular-cell--upgrade-building');
    const cellCount = await buildingCells.count();

    let upgradingCount = 0;
    for (let i = 0; i < cellCount; i++) {
      const cell = buildingCells.nth(i);
      // A building is upgrading if it has more than one .upgrade-building--cell
      const upgradeCells = cell.locator('.upgrade-building--cell');
      if ((await upgradeCells.count()) > 1) {
        upgradingCount++;
      }
    }
    return upgradingCount;
  } catch {
    return -1;
  }
}

/** Check if a specific building is currently upgrading */
async function isBuildingUpgrading(
  page: Page,
  castleIndex: number,
  buildingIndex: number,
): Promise<boolean> {
  try {
    const castleRows = page.locator(
      '.table--global-overview--buildings .tabular-row:not(.global-overview--table--header)',
    );
    const row = castleRows.nth(castleIndex);
    const buildingCells = row.locator('.tabular-cell--upgrade-building');
    const cell = buildingCells.nth(buildingIndex);
    const upgradeCells = cell.locator('.upgrade-building--cell');
    return (await upgradeCells.count()) > 1;
  } catch {
    return false;
  }
}

/** Get current unit count for a specific unit type in a castle */
async function getUnitCount(
  page: Page,
  castleIndex: number,
  unitIndex: number,
): Promise<number> {
  try {
    const castleRows = page.locator(
      '.table--global-overview--recruitment .tabular-row:not(.global-overview--table--header)',
    );
    const row = castleRows.nth(castleIndex);
    const unitCells = row.locator('.tabular-cell--recruitment');
    const cell = unitCells.nth(unitIndex);
    const countDiv = cell.locator(
      '.recruitment--cell .tabular-cell--input-container .centered.last',
    );
    const countText = (await countDiv.textContent()) || '0';
    return parseInt(countText, 10) || 0;
  } catch {
    return -1;
  }
}

/** Verify page is still healthy after an action. If overlay detected, dismiss and retry. */
async function verifyPostAction(
  page: Page,
  actionName: string,
  selector?: string,
): Promise<boolean> {
  await page.waitForTimeout(300);

  // First check
  const health = await checkGameHealth(page);
  if (health.healthy) {
    return true;
  }

  // If overlay detected, try to dismiss it
  if (
    health.issues.some((i) => i.includes('overlay') || i.includes('Overlay'))
  ) {
    console.log(`[${actionName}] Overlay detected, attempting to dismiss...`);
    const dismissed = await dismissIfOverlay(page);
    if (dismissed) {
      console.log(`[${actionName}] Overlay dismissed successfully`);
      return true;
    }
  }

  // Re-check health after any recovery attempt
  const finalHealth = await checkGameHealth(page);
  if (!finalHealth.healthy) {
    console.error(
      `[${actionName}] Page unhealthy after action: ${finalHealth.issues.join(', ')}`,
    );
    await saveDebugContext(page, `unhealthy-${actionName}`, selector);
    return false;
  }

  return true;
}

export async function upgradeBuilding(
  page: Page,
  castleIndex: number,
  buildingType: BuildingType,
): Promise<boolean> {
  const buildingIndex = BUILDING_TYPE_TO_INDEX[buildingType];
  if (buildingIndex < 0) {
    console.log(`Unknown building type: ${buildingType}`);
    return false;
  }

  const cellSelector = `.table--global-overview--buildings .tabular-row:not(.global-overview--table--header):nth-child(${castleIndex + 2}) .tabular-cell--upgrade-building:nth-child(${buildingIndex + 2})`;

  try {
    // Dismiss popups before action
    await dismissPopups(page);

    // Check if building is already upgrading before we start
    const wasUpgradingBefore = await isBuildingUpgrading(
      page,
      castleIndex,
      buildingIndex,
    );

    const castleRows = page.locator(
      '.table--global-overview--buildings .tabular-row:not(.global-overview--table--header)',
    );
    const row = castleRows.nth(castleIndex);
    const buildingCells = row.locator('.tabular-cell--upgrade-building');
    const cell = buildingCells.nth(buildingIndex);

    // Use first() to handle cells with multiple buttons (e.g., upgrade + cancel)
    const upgradeBtn = cell.locator('button.button--action').first();

    // Check for CSS 'disabled' class (not enough resources) - this is different from HTML disabled attribute
    const hasDisabledClass = await upgradeBtn
      .evaluate((el) => el.classList.contains('disabled'))
      .catch(() => false);
    if (hasDisabledClass) {
      console.warn(
        `[upgradeBuilding] ${buildingTypeToJSON(buildingType)} button disabled (insufficient resources) - skipping castle ${castleIndex}`,
      );
      return false;
    }

    if (await upgradeBtn.isEnabled().catch(() => false)) {
      if (config.dryRun) {
        console.log(
          `[DRY RUN] Would click upgrade button for ${buildingTypeToJSON(buildingType)} in castle ${castleIndex}`,
        );
        return true;
      }

      await upgradeBtn.click();
      await page.waitForTimeout(500);

      // Check for confirmation dialog
      await dismissPopups(page);
      const confirmBtn = page.locator(
        '.dialog button.button--action, div:nth-child(2) > .button',
      );
      if ((await confirmBtn.count()) > 0) {
        await confirmBtn.first().click();
        await page.waitForTimeout(500);
      }

      // Verify: page still healthy
      if (!(await verifyPostAction(page, 'upgradeBuilding', cellSelector))) {
        return false;
      }

      // Verify: this specific building is now upgrading (if it wasn't before)
      if (!wasUpgradingBefore) {
        const isUpgradingNow = await isBuildingUpgrading(
          page,
          castleIndex,
          buildingIndex,
        );
        if (!isUpgradingNow) {
          console.warn(
            `[upgradeBuilding] ${buildingTypeToJSON(buildingType)} doesn't appear to be upgrading - action may have failed`,
          );
          await saveDebugContext(
            page,
            'upgrade-verification-failed',
            cellSelector,
          );
          // Don't return false - might be a detection issue
        }
      }

      console.log(
        `Upgraded ${buildingTypeToJSON(buildingType)} in castle ${castleIndex}`,
      );
      return true;
    }
  } catch (e) {
    console.error(`Failed to upgrade:`, e);
    await saveDebugContext(page, 'upgrade-failed', cellSelector);
  }
  return false;
}

export async function researchTechnology(
  page: Page,
  technology: Technology,
  castleIndex: number,
): Promise<boolean> {
  const techName = TECHNOLOGY_TO_NAME[technology];
  if (!techName) {
    console.log(`Unknown technology: ${technology}`);
    return false;
  }

  const techSelector = `text="${techName}"`;

  try {
    // Dismiss popups before action
    await dismissPopups(page);

    if (config.dryRun) {
      console.log(`[DRY RUN] Would research ${techName}`);
      return true;
    }

    // Navigate to Library menu
    const navSuccess = await navigateToCastleLibrary(page, castleIndex);
    if (!navSuccess) {
      console.warn(`Failed to navigate to Library for castle ${castleIndex}`);
      return false;
    }

    // Find the technology row by name, then click the button within it
    const techRow = page.locator('.menu-list-element-basic').filter({
      hasText: techName,
    });

    if (!(await techRow.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log(
        `Technology ${techName} not visible (may already be researched or not available)`,
      );
      return false;
    }

    // Click the button within the technology row
    const researchBtn = techRow.locator('button.button');
    if (!(await researchBtn.isVisible({ timeout: 1000 }).catch(() => false))) {
      console.log(`Research button not found for ${techName}`);
      return false;
    }

    // Check if button is disabled
    const isDisabled = await researchBtn.evaluate((el) =>
      el.classList.contains('disabled'),
    );
    if (isDisabled) {
      console.log(
        `Research button disabled for ${techName} (insufficient resources or already researching)`,
      );
      return false;
    }

    await researchBtn.click();
    await page.waitForTimeout(500);
    await dismissPopups(page);

    // Verify page health
    if (!(await verifyPostAction(page, 'researchTechnology', techSelector))) {
      return false;
    }

    console.log(`Started research: ${techName}`);
    return true;
  } catch (e) {
    console.error(`Failed to research ${techName}:`, e);
    await saveDebugContext(page, 'research-failed', techSelector);
  }
  return false;
}

export async function clickFreeFinishButtons(page: Page): Promise<number> {
  // Dismiss popups before action
  await dismissPopups(page);

  // Find and click all free finish buttons (instant complete for short builds)
  const freeFinishBtns = page
    .locator('.icon-build-finish-free-2')
    .locator('..');
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
            const health = await checkGameHealth(page);
            if (!health.healthy) {
              console.warn(
                `[freeFinish] Page unhealthy after click ${i + 1}: ${health.issues.join(', ')}`,
              );
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

export async function recruitUnits(
  page: Page,
  castleIndex: number,
  unitType: UnitType,
  amount: number,
): Promise<boolean> {
  const unitIndex = UNIT_TYPE_TO_INDEX[unitType];
  if (unitIndex < 0) {
    console.log(`Unknown unit type: ${unitType}`);
    return false;
  }

  if (amount <= 0) {
    console.log(`Invalid recruit amount: ${amount}`);
    return false;
  }

  const cellSelector = `.table--global-overview--recruitment .tabular-row:not(.global-overview--table--header):nth-child(${castleIndex + 2}) .tabular-cell--recruitment:nth-child(${unitIndex + 2})`;

  try {
    await dismissPopups(page);

    // Get unit count before for verification
    const _countBefore = await getUnitCount(page, castleIndex, unitIndex);

    const castleRows = page.locator(
      '.table--global-overview--recruitment .tabular-row:not(.global-overview--table--header)',
    );
    const row = castleRows.nth(castleIndex);
    const unitCells = row.locator('.tabular-cell--recruitment');
    const cell = unitCells.nth(unitIndex);
    const recruitmentCell = cell.locator('.recruitment--cell');

    // Set the amount in the input field
    const input = recruitmentCell.locator('input.component--input');
    if ((await input.count()) === 0) {
      console.log(`Input field not found for ${unitTypeToJSON(unitType)}`);
      return false;
    }

    // Check if recruit button is enabled
    const recruitBtn = recruitmentCell.locator('button.button--action').last();
    const isDisabled = await recruitBtn.evaluate((el) =>
      el.classList.contains('disabled'),
    );
    if (isDisabled) {
      console.log(
        `Cannot recruit ${unitTypeToJSON(unitType)} - button disabled`,
      );
      return false;
    }

    if (config.dryRun) {
      console.log(
        `[DRY RUN] Would recruit ${amount}x ${unitTypeToJSON(unitType)} in castle ${castleIndex}`,
      );
      return true;
    }

    // Clear input and type the amount
    await input.fill(String(amount));
    await page.waitForTimeout(200);

    // Click recruit button
    await recruitBtn.click();
    await page.waitForTimeout(500);

    // Verify page health
    if (!(await verifyPostAction(page, 'recruitUnits', cellSelector))) {
      return false;
    }

    // Verify: unit count increased or recruitment queue started
    // Note: units might be queued, not instantly added, so we just check health
    console.log(
      `Recruited ${amount}x ${unitTypeToJSON(unitType)} in castle ${castleIndex}`,
    );
    return true;
  } catch (e) {
    console.error(`Failed to recruit ${unitTypeToJSON(unitType)}:`, e);
    await saveDebugContext(page, 'recruit-failed', cellSelector);
  }
  return false;
}

export async function executeTrade(
  page: Page,
  castleIndex: number,
): Promise<boolean> {
  try {
    await dismissPopups(page);

    // Click "Trade for Silver" button in Keep menu
    // The button has class pattern: button--in-building-list--trade
    const tradeBtn = page.locator('button.button--in-building-list--trade');

    if (!(await tradeBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
      console.warn(
        `[executeTrade] Trade button not found for castle ${castleIndex} - Keep menu may not be open`,
      );
      return false;
    }

    // Check if button is disabled
    const isDisabled = await tradeBtn
      .evaluate((el) => el.classList.contains('disabled'))
      .catch(() => false);
    if (isDisabled) {
      console.log(
        `[executeTrade] Trade button disabled for castle ${castleIndex}`,
      );
      return false;
    }

    if (config.dryRun) {
      console.log(
        `[DRY RUN] Would click trade button for castle ${castleIndex}`,
      );
      return true;
    }

    await tradeBtn.click();
    await page.waitForTimeout(1000);
    await dismissPopups(page);

    // Verify trade dialog opened (look for trade dialog elements)
    const dialogVisible = await page
      .locator('.menu--content-section')
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    if (!dialogVisible) {
      console.warn(
        `[executeTrade] Trade dialog did not open for castle ${castleIndex}`,
      );
      await saveDebugContext(page, 'trade-dialog-failed');
      return false;
    }

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
    const confirmBtn = page
      .locator('.menu--content-section button.button--action')
      .filter({ hasText: /send|trade|confirm/i })
      .first();
    if ((await confirmBtn.count()) > 0 && (await confirmBtn.isEnabled())) {
      await confirmBtn.click();
      await page.waitForTimeout(500);

      // Verify page health after trade
      if (
        !(await verifyPostAction(
          page,
          'executeTrade',
          '.menu--content-section',
        ))
      ) {
        return false;
      }

      console.log(`Executed trade for castle ${castleIndex}`);
      return true;
    }

    // Try any action button in the dialog
    const anyConfirmBtn = page
      .locator('.menu--content-section button.button--action')
      .last();
    if (
      (await anyConfirmBtn.count()) > 0 &&
      (await anyConfirmBtn.isEnabled())
    ) {
      await anyConfirmBtn.click();
      await page.waitForTimeout(500);

      if (
        !(await verifyPostAction(
          page,
          'executeTrade',
          '.menu--content-section',
        ))
      ) {
        return false;
      }

      console.log(`Executed trade for castle ${castleIndex}`);
      return true;
    }

    console.log(`Could not find confirm button for trade`);
    await saveDebugContext(page, 'trade-confirm-not-found');
    return false;
  } catch (e) {
    console.error(`Failed to execute trade for castle ${castleIndex}:`, e);
    await saveDebugContext(page, 'trade-failed');
  }
  return false;
}

/**
 * Start a mission from the Tavern menu.
 * Requires Tavern menu to be open (use navigateToCastleTavern first).
 * @param buttonSelector - The mission-specific button selector (e.g., ".overtimelumberjack--mission-start--button")
 */
export async function startMission(
  page: Page,
  buttonSelector: string,
  missionName: string,
): Promise<boolean> {
  try {
    await dismissPopups(page);

    const startBtn = page.locator(buttonSelector);

    if (!(await startBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
      console.warn(`[startMission] Button not found: ${buttonSelector}`);
      return false;
    }

    // Check if button is disabled
    const isDisabled = await startBtn
      .evaluate((el) => el.classList.contains('disabled'))
      .catch(() => false);
    if (isDisabled) {
      console.log(`[startMission] Mission "${missionName}" button is disabled`);
      return false;
    }

    if (config.dryRun) {
      console.log(`[DRY RUN] Would start mission: ${missionName}`);
      return true;
    }

    await startBtn.click();
    await page.waitForTimeout(500);

    // Verify page health after action
    if (!(await verifyPostAction(page, 'startMission', buttonSelector))) {
      return false;
    }

    console.log(`Started mission: ${missionName}`);
    return true;
  } catch (e) {
    console.error(`Failed to start mission "${missionName}":`, e);
    await saveDebugContext(page, 'mission-start-failed');
  }
  return false;
}
