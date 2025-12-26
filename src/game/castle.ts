import { Page } from 'playwright';
import {
  BuildingType,
  ResourceType,
  CastleConfig,
} from '../generated/proto/config.js';
import { BUILDING_NAME_TO_TYPE, BUILDING_TYPES } from './mappings.js';
import { dismissPopups } from '../browser/popups.js';

export interface CastleState {
  name: string;
  config: CastleConfig;
  buildingCanUpgrade: Map<BuildingType, boolean>;
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

    for (let j = 0; j < buildingCount && j < BUILDING_TYPES.length; j++) {
      const cell = buildingCells.nth(j);
      const upgradeCell = cell.locator('.upgrade-building--cell');

      // Level is the first div text
      const levelText = await upgradeCell.locator('> div').first().textContent();
      const level = parseInt(levelText || '0', 10);

      // Check if upgrade button exists and is enabled (use first() to avoid strict mode with multiple buttons)
      const upgradeBtn = upgradeCell.locator('button.button--action').first();
      const canUpgrade = await upgradeBtn.count() > 0 && await upgradeBtn.isEnabled().catch(() => false);

      const buildingType = BUILDING_NAME_TO_TYPE[BUILDING_TYPES[j]];
      buildingLevels.push({ type: buildingType, level });
      buildingCanUpgrade.set(buildingType, canUpgrade);
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
    });
  }

  return castles;
}
