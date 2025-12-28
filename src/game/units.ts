import type { Page } from 'playwright';
import { dismissPopups } from '../browser/popups.js';
import type { UnitType } from '../generated/proto/config.js';
import { UNIT_TYPES } from './mappings.js';

export interface UnitCount {
  type: UnitType;
  count: number;
  canRecruit: boolean;
}

export interface CastleUnits {
  name: string;
  units: UnitCount[];
}

export async function getUnits(page: Page): Promise<CastleUnits[]> {
  await dismissPopups(page);

  const castleUnits: CastleUnits[] = [];

  // Get all castle rows (exclude header row)
  const castleRows = page.locator(
    '.table--global-overview--recruitment .tabular-row:not(.global-overview--table--header)',
  );
  const rowCount = await castleRows.count();

  console.log(`Found ${rowCount} castle rows for recruitment`);

  for (let i = 0; i < rowCount; i++) {
    const row = castleRows.nth(i);

    // Get castle name
    const nameElement = row.locator(
      '.tabular-habitat-title-cell--habitat-title',
    );
    const castleName = (await nameElement.textContent()) || `Castle ${i + 1}`;

    // Get unit cells
    const unitCells = row.locator('.tabular-cell--recruitment');
    const unitCellCount = await unitCells.count();

    const units: UnitCount[] = [];

    for (let j = 0; j < unitCellCount && j < UNIT_TYPES.length; j++) {
      const cell = unitCells.nth(j);
      const recruitmentCell = cell.locator('.recruitment--cell');

      // Get current unit count from .centered.last div
      const countDiv = recruitmentCell.locator(
        '.tabular-cell--input-container .centered.last',
      );
      const countText = (await countDiv.textContent()) || '0';
      const count = parseInt(countText, 10);

      // Check if recruit button is enabled
      const recruitBtn = recruitmentCell
        .locator('button.button--action')
        .last();
      const canRecruit =
        (await recruitBtn.count()) > 0 &&
        !(await recruitBtn.evaluate((el) => el.classList.contains('disabled')));

      units.push({
        type: UNIT_TYPES[j],
        count,
        canRecruit,
      });
    }

    castleUnits.push({
      name: castleName.trim(),
      units,
    });
  }

  return castleUnits;
}
