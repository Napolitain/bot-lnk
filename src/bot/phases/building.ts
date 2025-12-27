import { Page } from 'playwright';
import { buildingTypeToJSON } from '../../generated/proto/config.js';
import { CastleState } from '../../game/castle.js';
import { upgradeBuilding } from '../../browser/actions.js';
import { getNextActionsForCastle, SolverActions } from '../../client/solver.js';
import { CastleSolverServiceClient } from '../../generated/proto/config.js';
import { config } from '../../config.js';

export interface BuildingPhaseResult {
  upgraded: boolean;
  minTimeRemainingMs: number | null;
}

/** Handle building phase for a single castle */
export async function handleBuildingPhase(
  page: Page,
  solverClient: CastleSolverServiceClient,
  castle: CastleState,
  castleIndex: number
): Promise<BuildingPhaseResult> {
  let minTimeRemainingMs: number | null = null;

  // Skip if queue is full
  if (castle.upgradeQueueCount >= config.maxBuildingQueue) {
    console.log(`\n[${castle.name}] Queue full (${castle.upgradeQueueCount}/${config.maxBuildingQueue}), skipping upgrades`);
    minTimeRemainingMs = getMinTimeRemaining(castle);
    return { upgraded: false, minTimeRemainingMs };
  }

  const { nextAction } = await getNextActionsForCastle(solverClient, castle);

  let upgraded = false;
  if (nextAction && castle.buildingCanUpgrade.get(nextAction.buildingType)) {
    console.log(`\nSolver recommends: ${buildingTypeToJSON(nextAction.buildingType)} Lv ${nextAction.fromLevel} → ${nextAction.toLevel} for ${castle.name}`);
    upgraded = await upgradeBuilding(page, castleIndex, nextAction.buildingType);
  } else if (nextAction) {
    console.log(`\n[${castle.name}] Solver recommends ${buildingTypeToJSON(nextAction.buildingType)} but cannot upgrade yet (waiting for resources)`);
  }

  // Fallback: try to upgrade any available building
  if (!upgraded) {
    for (const [buildingType, canUpgrade] of castle.buildingCanUpgrade) {
      if (canUpgrade) {
        console.log(`\n[${castle.name}] Fallback: Upgrading ${buildingTypeToJSON(buildingType)}...`);
        upgraded = await upgradeBuilding(page, castleIndex, buildingType);
        if (upgraded) break;
      }
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
