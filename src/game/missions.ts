import type { Page } from 'playwright';
import { dismissPopups } from '../browser/popups.js';

/** Mission types based on icon class patterns */
export enum MissionType {
  UNKNOWN = 'unknown',
  MANDATORY_OVERTIME = 'MandatoryOvertime',
  FORGING_TOOLS = 'ForgingTools',
  MARKET_DAY = 'MarketDay',
  FEED_MINERS = 'FeedMiners',
  OVERTIME_LUMBERJACK = 'OvertimeLumberjack',
  OVERTIME_QUARRY = 'OvertimeQuarry',
  OVERTIME_ORE_MINE = 'OvertimeOremine',
}

/** Map icon class to mission type */
const ICON_CLASS_TO_MISSION: Record<string, MissionType> = {
  MandatoryOvertime: MissionType.MANDATORY_OVERTIME,
  ForgingTools: MissionType.FORGING_TOOLS,
  MarketDay: MissionType.MARKET_DAY,
  FeedMiners: MissionType.FEED_MINERS,
  OvertimeLumberjack: MissionType.OVERTIME_LUMBERJACK,
  OvertimeQuarry: MissionType.OVERTIME_QUARRY,
  OvertimeOremine: MissionType.OVERTIME_ORE_MINE,
};

/** Map mission type to display name */
export const MISSION_TYPE_TO_NAME: Record<MissionType, string> = {
  [MissionType.UNKNOWN]: 'Unknown',
  [MissionType.MANDATORY_OVERTIME]: 'Mandatory overtime',
  [MissionType.FORGING_TOOLS]: 'Forging tools',
  [MissionType.MARKET_DAY]: 'Market day',
  [MissionType.FEED_MINERS]: 'Feed miners',
  [MissionType.OVERTIME_LUMBERJACK]: 'Overtime wood',
  [MissionType.OVERTIME_QUARRY]: 'Overtime stone',
  [MissionType.OVERTIME_ORE_MINE]: 'Overtime ore',
};

export interface AvailableMission {
  type: MissionType;
  name: string;
  /** Button selector to start this mission */
  buttonSelector: string;
  /** Whether the start button is enabled */
  canStart: boolean;
}

/** Check if Tavern menu is open (shows "Available missions" section) */
export async function isTavernMenuOpen(page: Page): Promise<boolean> {
  try {
    const missionsSection = page.locator('.menu-list-title-basic').filter({
      hasText: 'Available missions',
    });
    return await missionsSection.isVisible({ timeout: 500 });
  } catch {
    return false;
  }
}

/** Read available missions from open Tavern menu */
export async function getAvailableMissions(
  page: Page,
): Promise<AvailableMission[]> {
  await dismissPopups(page);

  if (!(await isTavernMenuOpen(page))) {
    console.warn('[getMissions] Tavern menu not open');
    return [];
  }

  const missions: AvailableMission[] = [];

  try {
    // Find all mission rows (clickable elements with mission icon)
    // Note: This will include the "Switch to group selection" row which we filter out below
    const missionRows = page
      .locator('.menu-list-element-basic.clickable')
      .filter({
        has: page.locator('.icon-mission'),
      });

    const count = await missionRows.count();
    console.log(`[getMissions] Found ${count} potential mission rows`);

    for (let i = 0; i < count; i++) {
      const row = missionRows.nth(i);

      // Get mission name first to filter out non-missions
      const nameElement = row.locator('.menu-list-element-basic--title');
      const name = (await nameElement.textContent())?.trim() || 'Unknown';

      // Skip non-mission rows (like "Switch to group selection")
      if (name === 'Switch to group selection') {
        console.log(`[getMissions] Skipping non-mission row: ${name}`);
        continue;
      }

      // Get mission type from icon class
      const iconElement = row.locator('.icon-mission').first();
      const iconClass = (await iconElement.getAttribute('class')) || '';

      // Extract mission type from class (e.g., "icon icon-left icon-mission MandatoryOvertime")
      let missionType = MissionType.UNKNOWN;
      for (const [iconPattern, type] of Object.entries(ICON_CLASS_TO_MISSION)) {
        if (iconClass.includes(iconPattern)) {
          missionType = type;
          break;
        }
      }

      // Get start button
      const startBtn = row.locator('button.button--action');
      const buttonExists = (await startBtn.count()) > 0;

      let canStart = false;
      let buttonSelector = '';

      if (buttonExists) {
        // Build selector from button class
        const btnClass = (await startBtn.getAttribute('class')) || '';
        // Extract the mission-specific class (e.g., "mandatoryovertime--mission-start--button")
        const missionBtnMatch = btnClass.match(/(\w+--mission-start--button)/);
        if (missionBtnMatch) {
          buttonSelector = `.${missionBtnMatch[1]}`;
        }

        // Check if button is disabled
        const isDisabled = await startBtn
          .evaluate((el) => el.classList.contains('disabled'))
          .catch(() => false);
        canStart = !isDisabled;
        
        console.log(
          `[getMissions] Mission "${name}": ${canStart ? 'READY' : 'DISABLED'} (${buttonSelector})`,
        );
      } else {
        console.log(`[getMissions] Mission "${name}": No button found`);
      }

      missions.push({
        type: missionType,
        name,
        buttonSelector,
        canStart,
      });
    }
  } catch (e) {
    console.error('[getMissions] Failed to read missions:', e);
  }

  console.log(
    `[getMissions] Total missions: ${missions.length}, Ready to start: ${missions.filter((m) => m.canStart).length}`,
  );
  return missions;
}
