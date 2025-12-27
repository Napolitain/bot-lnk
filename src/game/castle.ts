import { Page } from 'playwright';
import {
  BuildingType,
  ResourceType,
  CastleConfig,
} from '../generated/proto/config.js';
import { BUILDING_NAME_TO_TYPE, BUILDING_TYPES } from './mappings.js';
import { dismissPopups } from '../browser/popups.js';

export interface BuildingUpgradeStatus {
  isUpgrading: boolean;
  targetLevel: number | null;
  timeRemaining: string | null;  // e.g., "2 minutes"
  timeRemainingMs: number | null;  // parsed milliseconds
}

export interface CastleState {
  name: string;
  config: CastleConfig;
  buildingCanUpgrade: Map<BuildingType, boolean>;
  buildingUpgradeStatus: Map<BuildingType, BuildingUpgradeStatus>;
  upgradeQueueCount: number;  // number of buildings currently upgrading
}

/** Parse time string like "2 minutes", "5 seconds", "1 hour" to milliseconds */
function parseTimeToMs(timeStr: string): number | null {
  const match = timeStr.match(/(\d+)\s*(second|minute|hour|day)s?/i);
  if (!match) return null;
  
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  
  switch (unit) {
    case 'second': return value * 1000;
    case 'minute': return value * 60 * 1000;
    case 'hour': return value * 60 * 60 * 1000;
    case 'day': return value * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

export async function getCastles(page: Page): Promise<CastleState[]> {
  // Dismiss popups before reading
  await dismissPopups(page);

  const castles: CastleState[] = [];

  // Get all castle rows (exclude header row)
  const castleRows = page.locator('.table--global-overview--buildings .tabular-row:not(.global-overview--table--header)');
  const rowCount = await castleRows.count();

  console.log(`Found ${rowCount} castle rows`);

  for (let i = 0; i < rowCount; i++) {
    const row = castleRows.nth(i);

    // Get castle name
    const nameElement = row.locator('.tabular-habitat-title-cell--habitat-title');
    const castleName = await nameElement.textContent() || `Castle ${i + 1}`;

    // Get castle resources from the resource row
    const resourceAmounts = row.locator('.tabular-habitat-title-cell--resource-row .icon-amount--widget .amount');
    const wood = parseInt(await resourceAmounts.nth(0).textContent() || '0', 10);
    const stone = parseInt(await resourceAmounts.nth(1).textContent() || '0', 10);
    const ore = parseInt(await resourceAmounts.nth(2).textContent() || '0', 10);
    const food = parseInt(await resourceAmounts.nth(3).textContent() || '0', 10);

    // Get buildings (each cell after the first is a building)
    const buildingCells = row.locator('.tabular-cell--upgrade-building');
    const buildingCount = await buildingCells.count();

    const buildingLevels: { type: BuildingType; level: number }[] = [];
    const buildingCanUpgrade = new Map<BuildingType, boolean>();
    const buildingUpgradeStatus = new Map<BuildingType, BuildingUpgradeStatus>();
    let upgradeQueueCount = 0;

    for (let j = 0; j < buildingCount && j < BUILDING_TYPES.length; j++) {
      const cell = buildingCells.nth(j);
      const upgradeCells = cell.locator('.upgrade-building--cell');
      const upgradeCellCount = await upgradeCells.count();

      const firstCell = upgradeCells.first();
      const buildingType = BUILDING_NAME_TO_TYPE[BUILDING_TYPES[j]];

      // Check if building is currently upgrading (has a second .upgrade-building--cell)
      let isUpgrading = false;
      let targetLevel: number | null = null;
      let timeRemaining: string | null = null;
      let timeRemainingMs: number | null = null;

      if (upgradeCellCount > 1) {
        // Building is upgrading - second cell has construction info
        isUpgrading = true;
        upgradeQueueCount++;

        const constructionCell = upgradeCells.nth(1);
        
        // Get time remaining from .complete div
        const completeDiv = constructionCell.locator('.complete');
        if (await completeDiv.count() > 0) {
          timeRemaining = await completeDiv.textContent() || null;
          if (timeRemaining) {
            timeRemainingMs = parseTimeToMs(timeRemaining);
          }
        }

        // Get target level - it's in a div that's not .complete
        const levelDivs = constructionCell.locator('> div:not(.complete)');
        if (await levelDivs.count() > 0) {
          const targetLevelText = await levelDivs.first().textContent();
          targetLevel = parseInt(targetLevelText || '0', 10);
        }
      }

      // Get current level from first cell
      const levelText = await firstCell.locator('> div').first().textContent();
      const currentLevel = parseInt(levelText || '0', 10);

      // Use target level if upgrading, otherwise current level
      const effectiveLevel = isUpgrading && targetLevel ? targetLevel : currentLevel;

      // Check if upgrade button exists and is enabled (use first() to avoid strict mode with multiple buttons)
      const upgradeBtn = firstCell.locator('button.button--action').first();
      const canUpgrade = await upgradeBtn.count() > 0 && await upgradeBtn.isEnabled().catch(() => false);

      buildingLevels.push({ type: buildingType, level: effectiveLevel });
      buildingCanUpgrade.set(buildingType, canUpgrade);
      buildingUpgradeStatus.set(buildingType, {
        isUpgrading,
        targetLevel,
        timeRemaining,
        timeRemainingMs,
      });
    }

    const config: CastleConfig = {
      buildingLevels,
      resources: [
        { type: ResourceType.WOOD, amount: wood },
        { type: ResourceType.STONE, amount: stone },
        { type: ResourceType.IRON, amount: ore },
        { type: ResourceType.FOOD, amount: food },
      ],
      researchedTechnologies: [], // TODO: Read from game
    };

    castles.push({
      name: castleName.trim(),
      config,
      buildingCanUpgrade,
      buildingUpgradeStatus,
      upgradeQueueCount,
    });
  }

  return castles;
}
