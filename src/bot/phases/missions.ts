import type { Page } from 'playwright';
import { startMission } from '../../browser/actions.js';
import { navigateToCastleTavern } from '../../browser/navigation.js';
import { getAvailableMissions } from '../../game/missions.js';

export interface MissionPhaseResult {
  missionsStarted: number;
}

/**
 * Execute all available missions for a castle.
 * Strategy: Start as many missions as possible without worrying about which specific missions.
 * The solver already calculated that we should run missions, so any mission is beneficial.
 *
 * @param page Playwright page
 * @param castleName Castle name for logging
 * @param castleIndex Castle index for navigation
 * @returns Number of missions started
 */
export async function handleMissionPhase(
  page: Page,
  castleName: string,
  castleIndex: number,
): Promise<MissionPhaseResult> {
  console.log(`\n[${castleName}] === Mission Phase ===`);

  // Navigate to Tavern menu
  const navSuccess = await navigateToCastleTavern(page, castleIndex);
  if (!navSuccess) {
    console.warn(`[${castleName}] Failed to navigate to Tavern, skipping missions`);
    return { missionsStarted: 0 };
  }

  // Read available missions from DOM
  const availableMissions = await getAvailableMissions(page);
  
  if (availableMissions.length === 0) {
    console.log(`[${castleName}] No missions available`);
    return { missionsStarted: 0 };
  }

  console.log(`[${castleName}] Found ${availableMissions.length} available missions`);

  // Try to start each mission
  let missionsStarted = 0;
  for (const mission of availableMissions) {
    try {
      const started = await startMission(
        page,
        mission.buttonSelector,
        mission.name,
      );
      if (started) {
        missionsStarted++;
        console.log(`[${castleName}] ✅ Started: ${mission.name}`);
      }
    } catch (error) {
      console.warn(
        `[${castleName}] Failed to start mission ${mission.name}:`,
        error,
      );
      // Continue trying other missions
    }
  }

  console.log(`[${castleName}] Started ${missionsStarted}/${availableMissions.length} missions`);
  return { missionsStarted };
}
