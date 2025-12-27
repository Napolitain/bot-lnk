import { Page } from 'playwright';
import {
  ResourceType,
  Technology,
  UnitType,
  buildingTypeToJSON,
  technologyToJSON,
  unitTypeToJSON,
  CastleSolverServiceClient,
  UnitsRecommendation,
  UnitCount,
} from './generated/proto/config.js';
import { dismissPopups } from './browser/popups.js';
import { navigateToBuildingsView, navigateToRecruitmentView, navigateToTradingView } from './browser/navigation.js';
import { login } from './browser/login.js';
import { upgradeBuilding, researchTechnology, clickFreeFinishButtons, recruitUnits, executeTrade } from './browser/actions.js';
import { getCastles, CastleState } from './game/castle.js';
import { getUnits, CastleUnits } from './game/units.js';
import { getNextActionsForCastle } from './client/solver.js';

/** Castle phase: what should we do for this castle */
enum CastlePhase {
  BUILDING = 'building',
  RECRUITING = 'recruiting', 
  TRADING = 'trading',
}

/** Determine what phase a castle is in based on solver response and current units */
function determineCastlePhase(
  unitsRecommendation: UnitsRecommendation | undefined,
  currentUnits: UnitCount[] | undefined
): { phase: CastlePhase; missingUnits: Map<UnitType, number> } {
  const missingUnits = new Map<UnitType, number>();

  // If build order not complete, we're in building phase
  if (!unitsRecommendation?.buildOrderComplete) {
    return { phase: CastlePhase.BUILDING, missingUnits };
  }

  // Build order complete - check if units match recommendation
  const recommendedCounts = new Map<UnitType, number>();
  for (const uc of unitsRecommendation.unitCounts) {
    recommendedCounts.set(uc.type, uc.count);
  }

  const currentCounts = new Map<UnitType, number>();
  if (currentUnits) {
    for (const uc of currentUnits) {
      currentCounts.set(uc.type, uc.count);
    }
  }

  // Check if any unit type is below recommended
  for (const [unitType, recommendedCount] of recommendedCounts) {
    const currentCount = currentCounts.get(unitType) || 0;
    if (currentCount < recommendedCount) {
      missingUnits.set(unitType, recommendedCount - currentCount);
    }
  }

  if (missingUnits.size > 0) {
    return { phase: CastlePhase.RECRUITING, missingUnits };
  }

  // All conditions met - ready for trading
  return { phase: CastlePhase.TRADING, missingUnits };
}

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

/** Print current vs recommended units */
function printUnitComparison(
  castleName: string, 
  currentUnits: UnitCount[] | undefined,
  rec: UnitsRecommendation
): void {
  console.log(`\n=== ${castleName}: UNIT STATUS ===`);
  const currentMap = new Map<UnitType, number>();
  if (currentUnits) {
    for (const uc of currentUnits) {
      currentMap.set(uc.type, uc.count);
    }
  }
  for (const uc of rec.unitCounts) {
    const current = currentMap.get(uc.type) || 0;
    const status = current >= uc.count ? '✓' : `need ${uc.count - current} more`;
    console.log(`  ${unitTypeToJSON(uc.type)}: ${current}/${uc.count} ${status}`);
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
  if (castles.length > 0) {
    const { nextAction, nextResearchAction } = await getNextActionsForCastle(solverClient, castles[0]);

    const shouldResearch = nextResearchAction &&
      nextResearchAction.technology !== Technology.TECH_UNKNOWN &&
      (!nextAction || nextResearchAction.startTimeSeconds <= nextAction.startTimeSeconds);

    if (shouldResearch && nextResearchAction) {
      console.log(`\nSolver recommends research first: ${technologyToJSON(nextResearchAction.technology)}`);
      await researchTechnology(page, nextResearchAction.technology);
    }
  }

  // Determine phase for each castle
  const castlePhases: { castle: CastleState; phase: CastlePhase; missingUnits: Map<UnitType, number>; unitsRec?: UnitsRecommendation }[] = [];
  
  for (const castle of castles) {
    const { unitsRecommendation } = await getNextActionsForCastle(solverClient, castle);
    // We'll get current units later if needed
    const { phase, missingUnits } = determineCastlePhase(unitsRecommendation, undefined);
    castlePhases.push({ castle, phase, missingUnits, unitsRec: unitsRecommendation });
  }

  // Check if any castle needs recruitment - if so, read current units
  const needsRecruitmentCheck = castlePhases.some(cp => cp.phase !== CastlePhase.BUILDING);
  let allCastleUnits: CastleUnits[] = [];
  
  if (needsRecruitmentCheck) {
    await navigateToRecruitmentView(page);
    allCastleUnits = await getUnits(page);
    
    // Re-determine phases with actual unit counts
    for (let i = 0; i < castlePhases.length; i++) {
      const cp = castlePhases[i];
      if (cp.unitsRec?.buildOrderComplete) {
        const castleUnits = allCastleUnits.find(cu => cu.name === cp.castle.name);
        const currentUnits = castleUnits?.units.map(u => ({ type: u.type, count: u.count }));
        const { phase, missingUnits } = determineCastlePhase(cp.unitsRec, currentUnits);
        castlePhases[i].phase = phase;
        castlePhases[i].missingUnits = missingUnits;
      }
    }
  }

  // Process each castle based on its phase
  let totalUpgrades = 0;
  let totalRecruits = 0;
  let totalTrades = 0;
  let minTimeRemainingMs: number | null = null;

  // PHASE 1: Handle building upgrades
  await navigateToBuildingsView(page);
  
  for (let ci = 0; ci < castles.length; ci++) {
    const castle = castles[ci];
    const cp = castlePhases[ci];

    if (cp.phase !== CastlePhase.BUILDING) {
      continue;
    }

    // Skip if queue is full
    if (castle.upgradeQueueCount >= 2) {
      console.log(`\n[${castle.name}] Queue full (${castle.upgradeQueueCount}/2), skipping upgrades`);
      for (const status of castle.buildingUpgradeStatus.values()) {
        if (status.isUpgrading && status.timeRemainingMs) {
          if (minTimeRemainingMs === null || status.timeRemainingMs < minTimeRemainingMs) {
            minTimeRemainingMs = status.timeRemainingMs;
          }
        }
      }
      continue;
    }

    const { nextAction } = await getNextActionsForCastle(solverClient, castle);

    let upgraded = false;
    if (nextAction && castle.buildingCanUpgrade.get(nextAction.buildingType)) {
      console.log(`\nSolver recommends: ${buildingTypeToJSON(nextAction.buildingType)} Lv ${nextAction.fromLevel} → ${nextAction.toLevel} for ${castle.name}`);
      upgraded = await upgradeBuilding(page, ci, nextAction.buildingType);
    } else if (nextAction) {
      console.log(`\n[${castle.name}] Solver recommends ${buildingTypeToJSON(nextAction.buildingType)} but cannot upgrade yet (waiting for resources)`);
    }

    // Fallback: try to upgrade any available building
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
      for (const status of castle.buildingUpgradeStatus.values()) {
        if (status.isUpgrading && status.timeRemainingMs) {
          if (minTimeRemainingMs === null || status.timeRemainingMs < minTimeRemainingMs) {
            minTimeRemainingMs = status.timeRemainingMs;
          }
        }
      }
    }
  }

  // PHASE 2: Handle recruitment
  const recruitingCastles = castlePhases.filter(cp => cp.phase === CastlePhase.RECRUITING);
  if (recruitingCastles.length > 0) {
    await navigateToRecruitmentView(page);
    
    for (const cp of recruitingCastles) {
      const ci = castles.findIndex(c => c.name === cp.castle.name);
      if (ci < 0) continue;

      console.log(`\n[${cp.castle.name}] RECRUITING PHASE`);
      if (cp.unitsRec) {
        const castleUnits = allCastleUnits.find(cu => cu.name === cp.castle.name);
        printUnitComparison(cp.castle.name, castleUnits?.units.map(u => ({ type: u.type, count: u.count })), cp.unitsRec);
      }

      // Recruit missing units
      for (const [unitType, missing] of cp.missingUnits) {
        console.log(`  Recruiting ${missing}x ${unitTypeToJSON(unitType)}...`);
        const recruited = await recruitUnits(page, ci, unitType, missing);
        if (recruited) {
          totalRecruits++;
        }
      }
    }
  }

  // PHASE 3: Handle trading
  const tradingCastles = castlePhases.filter(cp => cp.phase === CastlePhase.TRADING);
  if (tradingCastles.length > 0) {
    await navigateToTradingView(page);
    
    for (const cp of tradingCastles) {
      const ci = castles.findIndex(c => c.name === cp.castle.name);
      if (ci < 0) continue;

      console.log(`\n[${cp.castle.name}] TRADING PHASE - Ready for silver trading!`);
      if (cp.unitsRec) {
        printUnitsRecommendation(cp.castle.name, cp.unitsRec);
      }

      const traded = await executeTrade(page, ci);
      if (traded) {
        totalTrades++;
      }
    }
  }

  // Summary
  console.log(`\n=== Cycle Summary ===`);
  console.log(`  Building upgrades: ${totalUpgrades}`);
  console.log(`  Unit recruitments: ${totalRecruits}`);
  console.log(`  Trades executed: ${totalTrades}`);
  
  // Calculate optimal sleep time
  if (minTimeRemainingMs !== null) {
    const freeFinishThresholdMs = 5 * 60 * 1000;
    const minSleepMs = 30 * 1000;
    const maxSleepMs = 10 * 60 * 1000;

    let sleepMs: number;
    if (minTimeRemainingMs > freeFinishThresholdMs) {
      sleepMs = minTimeRemainingMs - freeFinishThresholdMs;
      console.log(`\nSleeping ${Math.round(sleepMs / 1000)}s until free finish available (${Math.round(minTimeRemainingMs / 1000)}s remaining)`);
    } else {
      sleepMs = minSleepMs;
      console.log(`\nBuild already under 5min (${Math.round(minTimeRemainingMs / 1000)}s), checking again in ${sleepMs / 1000}s`);
    }
    
    sleepMs = Math.min(Math.max(sleepMs, minSleepMs), maxSleepMs);
    return sleepMs;
  }
  
  return null;
}
