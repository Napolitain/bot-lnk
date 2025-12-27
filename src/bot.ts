import { Page } from 'playwright';
import {
  ResourceType,
  Technology,
  buildingTypeToJSON,
  technologyToJSON,
  unitTypeToJSON,
  CastleSolverServiceClient,
  UnitsRecommendation,
} from './generated/proto/config.js';
import { dismissPopups } from './browser/popups.js';
import { navigateToBuildingsView } from './browser/navigation.js';
import { login } from './browser/login.js';
import { upgradeBuilding, researchTechnology, clickFreeFinishButtons } from './browser/actions.js';
import { getCastles } from './game/castle.js';
import { getNextActionsForCastle } from './client/solver.js';

/** Print units recommendation to console */
function printUnitsRecommendation(castleName: string, rec: UnitsRecommendation): void {
  console.log(`\n=== ${castleName}: BUILD ORDER COMPLETE ===`);
  console.log(`Recommended Army Composition:`);
  console.log(`  Food: ${rec.totalFood}`);
  console.log(`  Trading throughput: ${rec.totalThroughput?.toFixed(0)} resources/hour`);
  console.log(`  Silver income: ${rec.silverPerHour?.toFixed(2)}/hour`);
  console.log(`  Defense vs Cavalry: ${rec.defenseVsCavalry}`);
  console.log(`  Defense vs Infantry: ${rec.defenseVsInfantry}`);
  console.log(`  Defense vs Artillery: ${rec.defenseVsArtillery}`);
  console.log(`  Units:`);
  for (const uc of rec.unitCounts) {
    console.log(`    - ${unitTypeToJSON(uc.type)}: ${uc.count}`);
  }
}

export async function runBotLoop(page: Page, solverClient: CastleSolverServiceClient): Promise<number | null> {
  // Reload page to get fresh resource values
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Dismiss any popups first
  await dismissPopups(page);

  // Ensure we're logged in
  const loggedIn = await login(page);
  if (!loggedIn) {
    throw new Error('Failed to login');
  }

  // Navigate to buildings view (handles popups and checks if already there)
  const onBuildings = await navigateToBuildingsView(page);
  if (!onBuildings) {
    throw new Error('Failed to navigate to buildings view');
  }

  // Read all castles with resources and buildings
  const castles = await getCastles(page);

  console.log('\n=== Castle Status ===');
  for (const castle of castles) {
    const wood = castle.config.resources.find(r => r.type === ResourceType.WOOD)?.amount || 0;
    const stone = castle.config.resources.find(r => r.type === ResourceType.STONE)?.amount || 0;
    const iron = castle.config.resources.find(r => r.type === ResourceType.IRON)?.amount || 0;
    const food = castle.config.resources.find(r => r.type === ResourceType.FOOD)?.amount || 0;

    console.log(`\n${castle.name}: (${castle.upgradeQueueCount} building(s) in queue)`);
    console.log(`  Resources: Wood=${wood}, Stone=${stone}, Iron=${iron}, Food=${food}`);
    console.log(`  Buildings:`);
    for (const bl of castle.config.buildingLevels) {
      const canUpgrade = castle.buildingCanUpgrade.get(bl.type) ? '[CAN UPGRADE]' : '';
      const status = castle.buildingUpgradeStatus.get(bl.type);
      const upgrading = status?.isUpgrading ? `[UPGRADING → Lv ${status.targetLevel}, ${status.timeRemaining}]` : '';
      console.log(`    - ${buildingTypeToJSON(bl.type)}: Lv ${bl.level} ${canUpgrade} ${upgrading}`);
    }
  }

  // Click any free finish buttons before performing actions
  await clickFreeFinishButtons(page);

  // Check if there's research to do (shared across all castles - one research queue)
  // Research should be done if its start time is before the next building action
  if (castles.length > 0) {
    const { nextAction, nextResearchAction } = await getNextActionsForCastle(solverClient, castles[0]);

    // Do research if:
    // 1. There's a research action AND
    // 2. Either no building action, OR research starts before/at same time as building
    const shouldResearch = nextResearchAction &&
      nextResearchAction.technology !== Technology.TECH_UNKNOWN &&
      (!nextAction || nextResearchAction.startTimeSeconds <= nextAction.startTimeSeconds);

    if (shouldResearch && nextResearchAction) {
      console.log(`\nSolver recommends research first: ${technologyToJSON(nextResearchAction.technology)}`);
      await researchTechnology(page, nextResearchAction.technology);
    }
  }

  // For each castle, try to upgrade one building (each castle has its own queue)
  let totalUpgrades = 0;
  let minTimeRemainingMs: number | null = null;

  for (let ci = 0; ci < castles.length; ci++) {
    const castle = castles[ci];

    // Skip if queue is full (2 or more upgrades in progress)
    if (castle.upgradeQueueCount >= 2) {
      console.log(`\n[${castle.name}] Queue full (${castle.upgradeQueueCount}/2), skipping upgrades`);
      
      // Track minimum time remaining for sleep calculation
      for (const status of castle.buildingUpgradeStatus.values()) {
        if (status.isUpgrading && status.timeRemainingMs) {
          if (minTimeRemainingMs === null || status.timeRemainingMs < minTimeRemainingMs) {
            minTimeRemainingMs = status.timeRemainingMs;
          }
        }
      }
      continue;
    }

    // Try to get next action from solver
    const { nextAction, unitsRecommendation } = await getNextActionsForCastle(solverClient, castle);

    // Check if build order is complete for this castle
    if (unitsRecommendation?.buildOrderComplete) {
      printUnitsRecommendation(castle.name, unitsRecommendation);
      continue;
    }

    let upgraded = false;
    if (nextAction && castle.buildingCanUpgrade.get(nextAction.buildingType)) {
      console.log(`\nSolver recommends: ${buildingTypeToJSON(nextAction.buildingType)} Lv ${nextAction.fromLevel} → ${nextAction.toLevel} for ${castle.name}`);
      upgraded = await upgradeBuilding(page, ci, nextAction.buildingType);
    } else if (nextAction) {
      console.log(`\n[${castle.name}] Solver recommends ${buildingTypeToJSON(nextAction.buildingType)} but cannot upgrade yet (waiting for resources)`);
    }

    // Fallback: try to upgrade any available building for this castle
    if (!upgraded) {
      for (const [buildingType, canUpgrade] of castle.buildingCanUpgrade) {
        if (canUpgrade) {
          console.log(`\n[${castle.name}] Fallback: Upgrading ${buildingTypeToJSON(buildingType)}...`);
          upgraded = await upgradeBuilding(page, ci, buildingType);
          if (upgraded) break;
        }
      }
    }

    if (upgraded) {
      totalUpgrades++;
    } else {
      console.log(`\n[${castle.name}] No buildings available to upgrade.`);
      
      // Track minimum time remaining for sleep calculation
      for (const status of castle.buildingUpgradeStatus.values()) {
        if (status.isUpgrading && status.timeRemainingMs) {
          if (minTimeRemainingMs === null || status.timeRemainingMs < minTimeRemainingMs) {
            minTimeRemainingMs = status.timeRemainingMs;
          }
        }
      }
    }
  }

  console.log(`\nTotal upgrades this cycle: ${totalUpgrades}/${castles.length} castles`);
  
  // Calculate optimal sleep time based on free finish threshold
  if (minTimeRemainingMs !== null) {
    const freeFinishThresholdMs = 5 * 60 * 1000; // 5 minutes - builds under this can be finished for free
    const minSleepMs = 30 * 1000; // 30 seconds minimum
    const maxSleepMs = 10 * 60 * 1000; // 10 minutes max

    let sleepMs: number;
    if (minTimeRemainingMs > freeFinishThresholdMs) {
      // Wake up when free finish becomes available
      sleepMs = minTimeRemainingMs - freeFinishThresholdMs;
      console.log(`\nSleeping ${Math.round(sleepMs / 1000)}s until free finish available (${Math.round(minTimeRemainingMs / 1000)}s remaining)`);
    } else {
      // Already eligible for free finish, check again soon
      sleepMs = minSleepMs;
      console.log(`\nBuild already under 5min (${Math.round(minTimeRemainingMs / 1000)}s), checking again in ${sleepMs / 1000}s`);
    }
    
    sleepMs = Math.min(Math.max(sleepMs, minSleepMs), maxSleepMs);
    return sleepMs;
  }
  
  return null;  // No suggested sleep time
}
