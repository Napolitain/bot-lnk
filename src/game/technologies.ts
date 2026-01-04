import type { Page } from 'playwright';
import { navigateToCastleLibrary } from '../browser/navigation.js';
import { dismissPopups } from '../browser/popups.js';
import type { Technology } from '../generated/proto/config.js';
import { TECHNOLOGY_TO_NAME } from './mappings.js';

// Reverse map: name -> Technology enum
const NAME_TO_TECHNOLOGY: Record<string, Technology> = {};
for (const [tech, name] of Object.entries(TECHNOLOGY_TO_NAME)) {
  if (name) {
    NAME_TO_TECHNOLOGY[name.toLowerCase()] = parseInt(tech, 10) as Technology;
  }
}

/**
 * Read researched technologies from the Library menu.
 *
 * Logic:
 * - Technologies with a visible research button (with-icon-right class) = NOT researched
 * - Technologies visible but WITHOUT a button = ALREADY researched
 *
 * @param page Playwright page
 * @param castleIndex Castle index for navigation
 * @returns Array of researched Technology enums
 */
export async function getResearchedTechnologies(
  page: Page,
  castleIndex: number,
): Promise<Technology[]> {
  const researched: Technology[] = [];

  try {
    await dismissPopups(page);

    // Navigate to Library menu
    const navSuccess = await navigateToCastleLibrary(page, castleIndex);
    if (!navSuccess) {
      console.warn(`[getResearchedTechnologies] Failed to navigate to Library`);
      return [];
    }

    // Get all technology rows
    const techRows = page.locator(
      '.menu-list-element-basic.clickable.with-icon-left',
    );
    const rowCount = await techRows.count();

    for (let i = 0; i < rowCount; i++) {
      const row = techRows.nth(i);

      // Get technology name
      const titleEl = row.locator('.menu-list-element-basic--title');
      const techName = await titleEl.textContent();
      if (!techName) continue;

      const normalizedName = techName.trim().toLowerCase();
      const techEnum = NAME_TO_TECHNOLOGY[normalizedName];
      if (techEnum === undefined) {
        console.log(
          `[getResearchedTechnologies] Unknown technology: ${techName}`,
        );
        continue;
      }

      // Check if row has a research button (with-icon-right class)
      const hasButton = await row.evaluate((el) =>
        el.classList.contains('with-icon-right'),
      );

      // If no button, the technology is already researched
      if (!hasButton) {
        researched.push(techEnum);
        console.log(
          `[getResearchedTechnologies] Already researched: ${techName}`,
        );
      }
    }

    console.log(
      `[getResearchedTechnologies] Found ${researched.length} researched technologies`,
    );
  } catch (e) {
    console.error('[getResearchedTechnologies] Error:', e);
  }

  return researched;
}
