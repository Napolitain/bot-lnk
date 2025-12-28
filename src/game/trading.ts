import type { Page } from 'playwright';
import { dismissPopups } from '../browser/popups.js';
import { ResourceType, UnitType } from '../generated/proto/config.js';

export interface TransportUnitSlider {
  unitType: UnitType;
  currentAmount: number;
  maxAvailable: number;
}

export interface ResourceSlider {
  resourceType: ResourceType;
  currentAmount: number;
  maxAvailable: number;
}

export interface TradeDialogState {
  silverCost: number;
  transportUnits: TransportUnitSlider[];
  transportTime: string | null; // e.g., "08:53:20"
  returnTime: string | null; // e.g., "12/27/2025, 10:33:47 PM"
  capacityUsed: number;
  capacityMax: number;
  availableResources: ResourceSlider[];
  targetSilver: number;
  targetSilverMax: number;
}

// Map icon class suffix to UnitType
const ICON_TO_UNIT_TYPE: Record<string, UnitType> = {
  '1': UnitType.SPEARMAN,
  '2': UnitType.SWORDSMAN,
  '101': UnitType.ARCHER,
  '102': UnitType.CROSSBOWMAN,
  '201': UnitType.HORSEMAN,
  '202': UnitType.LANCER,
  '10001': UnitType.HANDCART,
  '10002': UnitType.OXCART,
};

// Map icon class suffix to ResourceType
const ICON_TO_RESOURCE_TYPE: Record<string, ResourceType> = {
  '1': ResourceType.WOOD,
  '2': ResourceType.STONE,
  '3': ResourceType.IRON,
  '4': ResourceType.FOOD,
};

/** Parse capacity string like "180/1,276" to { used, max } */
function parseCapacity(text: string): { used: number; max: number } {
  const match = text.match(/(\d[\d,]*)\s*\/\s*(\d[\d,]*)/);
  if (!match) return { used: 0, max: 0 };
  return {
    used: parseInt(match[1].replace(/,/g, ''), 10),
    max: parseInt(match[2].replace(/,/g, ''), 10),
  };
}

/** Read the current state of a trade/transport dialog */
export async function readTradeDialogState(
  page: Page,
): Promise<TradeDialogState | null> {
  await dismissPopups(page);

  try {
    const dialog = page.locator('.menu--content-section');
    if ((await dialog.count()) === 0) {
      return null;
    }

    // Read silver cost
    let silverCost = 0;
    const silverElement = dialog
      .locator('.icon-resource--6')
      .first()
      .locator('..')
      .locator('.menu-list-element-basic--value');
    if ((await silverElement.count()) > 0) {
      const silverText = (await silverElement.textContent()) || '0';
      silverCost = parseInt(silverText.replace(/[^\d]/g, ''), 10);
    }

    // Read transport units from sliders
    const transportUnits: TransportUnitSlider[] = [];
    const unitSliders = dialog.locator('.widget-seek-bar-wrapper').filter({
      has: page.locator('[class*="icon-unit-"]'),
    });
    const unitSliderCount = await unitSliders.count();

    for (let i = 0; i < unitSliderCount; i++) {
      const slider = unitSliders.nth(i);

      // Get unit type from icon class
      const iconElement = slider.locator('[class*="icon-unit-"]').first();
      const iconClass = (await iconElement.getAttribute('class')) || '';
      const unitMatch = iconClass.match(/icon-unit-(\d+)/);
      if (!unitMatch) continue;

      const unitType = ICON_TO_UNIT_TYPE[unitMatch[1]] || UnitType.UNIT_UNKNOWN;

      // Get current amount from input
      const input = slider.locator('input.component--input');
      const currentAmount = parseInt((await input.inputValue()) || '0', 10);

      // Get max available from the increase button text
      const maxBtn = slider.locator('.seek-bar-increase-value--button');
      const maxText = (await maxBtn.textContent()) || '0';
      const maxAvailable = parseInt(maxText, 10);

      transportUnits.push({ unitType, currentAmount, maxAvailable });
    }

    // Read transport time
    let transportTime: string | null = null;
    const transportTimeElement = dialog
      .locator('.icon-duration')
      .locator('..')
      .locator('.menu-list-element-basic--value');
    if ((await transportTimeElement.count()) > 0) {
      transportTime =
        (await transportTimeElement.textContent())?.trim() || null;
    }

    // Read return time
    let returnTime: string | null = null;
    const returnTimeElement = dialog
      .locator('.icon-day-icon')
      .locator('..')
      .locator('.menu-list-element-basic--value');
    if ((await returnTimeElement.count()) > 0) {
      returnTime = (await returnTimeElement.textContent())?.trim() || null;
    }

    // Read capacity
    let capacityUsed = 0;
    let capacityMax = 0;
    const capacityElement = dialog
      .locator('.icon-capacity')
      .locator('..')
      .locator('.menu-list-element-basic--value');
    if ((await capacityElement.count()) > 0) {
      const capacityText = (await capacityElement.textContent()) || '';
      const parsed = parseCapacity(capacityText);
      capacityUsed = parsed.used;
      capacityMax = parsed.max;
    }

    // Read available resources from sliders
    const availableResources: ResourceSlider[] = [];
    const resourceSliders = dialog.locator('.widget-seek-bar-wrapper').filter({
      has: page.locator('[class*="icon-resource--"]'),
    });
    const resourceSliderCount = await resourceSliders.count();

    for (let i = 0; i < resourceSliderCount; i++) {
      const slider = resourceSliders.nth(i);

      // Get resource type from icon class
      const iconElement = slider.locator('[class*="icon-resource--"]').first();
      const iconClass = (await iconElement.getAttribute('class')) || '';
      const resourceMatch = iconClass.match(/icon-resource--(\d+)/);
      if (!resourceMatch) continue;

      const resourceType =
        ICON_TO_RESOURCE_TYPE[resourceMatch[1]] ||
        ResourceType.RESOURCE_UNKNOWN;

      // Get current amount from input
      const input = slider.locator('input.component--input');
      const currentAmount = parseInt((await input.inputValue()) || '0', 10);

      // Get max available from the increase button text
      const maxBtn = slider.locator('.seek-bar-increase-value--button');
      const maxText = (await maxBtn.textContent()) || '0';
      const maxAvailable = parseInt(maxText, 10);

      availableResources.push({ resourceType, currentAmount, maxAvailable });
    }

    // Read target silver (e.g., "704/2,000")
    let targetSilver = 0;
    let targetSilverMax = 0;
    const targetSilverElement = dialog
      .locator('.menu-list-element-basic')
      .filter({
        hasText: 'Silver',
      })
      .last()
      .locator('.menu-list-element-basic--value');
    if ((await targetSilverElement.count()) > 0) {
      const targetText = (await targetSilverElement.textContent()) || '';
      const parsed = parseCapacity(targetText);
      targetSilver = parsed.used;
      targetSilverMax = parsed.max;
    }

    return {
      silverCost,
      transportUnits,
      transportTime,
      returnTime,
      capacityUsed,
      capacityMax,
      availableResources,
      targetSilver,
      targetSilverMax,
    };
  } catch (e) {
    console.log('Failed to read trade dialog state:', e);
    return null;
  }
}
