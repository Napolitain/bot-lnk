import type { Page } from 'playwright';
import { upgradeBuilding } from '../../browser/actions.js';
import { config } from '../../config.js';
import type { CastleState } from '../../game/castle.js';
import {
  type BuildingAction,
  buildingTypeToJSON,
} from '../../generated/proto/config.js';

export interface BuildingPhaseResult {
  upgraded: boolean;
  minTimeRemainingMs: number | null;
}

/** Handle building phase for a single castle */
export async function handleBuildingPhase(
  page: Page,
  castle: CastleState,
  castleIndex: number,
  nextAction?: BuildingAction,
): Promise<BuildingPhaseResult> {
  let minTimeRemainingMs: number | null = null;

  // Skip if queue is full
  if (castle.upgradeQueueCount >= config.maxBuildingQueue) {
    console.log(
      `\n[${castle.name}] Queue full (${castle.upgradeQueueCount}/${config.maxBuildingQueue}), skipping upgrades`,
    );
    minTimeRemainingMs = getMinTimeRemaining(castle);
    return { upgraded: false, minTimeRemainingMs };
  }

  let upgraded = false;
  if (nextAction && castle.buildingCanUpgrade.get(nextAction.buildingType)) {
    console.log(
      `\nSolver recommends: ${buildingTypeToJSON(nextAction.buildingType)} Lv ${nextAction.fromLevel} → ${nextAction.toLevel} for ${castle.name}`,
    );
    upgraded = await upgradeBuilding(
      page,
      castleIndex,
      nextAction.buildingType,
    );
  } else if (nextAction) {
    console.log(
      `\n[${castle.name}] Solver recommends ${buildingTypeToJSON(nextAction.buildingType)} but cannot upgrade yet (waiting for resources)`,
    );
  }

  // Log warning if solver didn't recommend anything but buildings are available
  if (!upgraded && !nextAction) {
    const availableBuildings = [...castle.buildingCanUpgrade.entries()]
      .filter(([, canUpgrade]) => canUpgrade)
      .map(([type]) => buildingTypeToJSON(type));
    if (availableBuildings.length > 0) {
      console.warn(
        `\n[${castle.name}] WARNING: Solver did not recommend any building, but ${availableBuildings.length} buildings can be upgraded: ${availableBuildings.join(', ')}`,
      );
    }
  }

  if (!upgraded) {
    minTimeRemainingMs = getMinTimeRemaining(castle);
  }

  return { upgraded, minTimeRemainingMs };
}

/** Get minimum time remaining from upgrading buildings */
function getMinTimeRemaining(castle: CastleState): number | null {
  let min: number | null = null;
  for (const status of castle.buildingUpgradeStatus.values()) {
    if (status.isUpgrading && status.timeRemainingMs) {
      if (min === null || status.timeRemainingMs < min) {
        min = status.timeRemainingMs;
      }
    }
  }
  return min;
}
