import type { Page } from 'playwright';
import { startMission } from '../../browser/actions.js';
import { navigateToCastleTavern } from '../../browser/navigation.js';
import { getAvailableMissions } from '../../game/missions.js';

export interface MissionPhaseResult {
  missionsStarted: number;
  minTimeRemainingMs: number | null;
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
    return { missionsStarted: 0, minTimeRemainingMs: null };
  }

  // Read available missions from DOM
  const availableMissions = await getAvailableMissions(page);
  
  if (availableMissions.length === 0) {
    console.log(`[${castleName}] No missions found in Tavern menu`);
    return { missionsStarted: 0, minTimeRemainingMs: null };
  }

  // Find minimum time remaining from running missions
  let minTimeRemainingMs: number | null = null;
  const runningMissions = availableMissions.filter((m) => m.state === 'running');
  for (const mission of runningMissions) {
    if (mission.timeRemainingMs !== undefined) {
      if (minTimeRemainingMs === null || mission.timeRemainingMs < minTimeRemainingMs) {
        minTimeRemainingMs = mission.timeRemainingMs;
      }
    }
  }

  // Filter to only missions that can be started (not disabled or running)
  const readyMissions = availableMissions.filter((m) => m.canStart);

  if (readyMissions.length === 0) {
    const runningCount = runningMissions.length;
    const disabledCount = availableMissions.filter((m) => m.state === 'disabled').length;
    console.log(
      `[${castleName}] No missions ready to start (${runningCount} running, ${disabledCount} disabled)`,
    );
    return { missionsStarted: 0, minTimeRemainingMs };
  }

  console.log(
    `[${castleName}] Found ${readyMissions.length}/${availableMissions.length} missions ready to start`,
  );

  // Try to start each ready mission
  let missionsStarted = 0;
  for (const mission of readyMissions) {
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

  // Re-read missions to get timers for newly started missions
  if (missionsStarted > 0) {
    console.log(`[${castleName}] Re-reading mission timers...`);
    const updatedMissions = await getAvailableMissions(page);
    const nowRunningMissions = updatedMissions.filter((m) => m.state === 'running');
    
    for (const mission of nowRunningMissions) {
      if (mission.timeRemainingMs !== undefined) {
        if (minTimeRemainingMs === null || mission.timeRemainingMs < minTimeRemainingMs) {
          minTimeRemainingMs = mission.timeRemainingMs;
        }
      }
    }
  }

  if (missionsStarted > 0) {
    console.log(
      `[${castleName}] ✅ Successfully started ${missionsStarted}/${readyMissions.length} missions`,
    );
  } else {
    console.log(
      `[${castleName}] ⚠️  Failed to start any missions (${readyMissions.length} were ready)`,
    );
  }

  return { missionsStarted, minTimeRemainingMs };
}
