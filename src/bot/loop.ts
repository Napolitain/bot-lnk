import { Page } from 'playwright';
import { Technology, technologyToJSON, CastleSolverServiceClient, UnitsRecommendation, UnitCount } from '../generated/proto/config.js';
import { dismissPopups } from '../browser/popups.js';
import { navigateToBuildingsView, navigateToRecruitmentView, navigateToTradingView } from '../browser/navigation.js';
import { login } from '../browser/login.js';
import { researchTechnology, clickFreeFinishButtons } from '../browser/actions.js';
import { getCastles, CastleState } from '../game/castle.js';
import { getUnits, CastleUnits } from '../game/units.js';
import { getNextActionsForCastle } from '../client/solver.js';
import { config } from '../config.js';
import { LoginError, NavigationError } from '../errors/index.js';
import { CastlePhase, determineCastlePhase } from '../domain/index.js';
import { handleBuildingPhase, handleRecruitingPhase, handleTradingPhase } from './phases/index.js';
import { printCastleStatus, printUnitsRecommendation, printUnitComparison, printCycleSummary, printSleepInfo } from './display.js';

/** Castle with its determined phase and metadata */
interface CastlePhaseInfo {
  castle: CastleState;
  castleIndex: number;
  phase: CastlePhase;
  missingUnits: Map<number, number>;
  unitsRec?: UnitsRecommendation;
}

/** Calculate sleep time based on minimum time remaining */
function calculateSleepTime(minTimeRemainingMs: number): number {
  const { minMs, maxMs, freeFinishThresholdMs } = config.sleep;

  let sleepMs: number;
  const freeFinishAvailable = minTimeRemainingMs <= freeFinishThresholdMs;

  if (freeFinishAvailable) {
    sleepMs = minMs;
  } else {
    sleepMs = minTimeRemainingMs - freeFinishThresholdMs;
  }

  sleepMs = Math.min(Math.max(sleepMs, minMs), maxMs);
  printSleepInfo(sleepMs, minTimeRemainingMs, freeFinishAvailable);

  return sleepMs;
}

/** Main bot loop */
export async function runBotLoop(page: Page, solverClient: CastleSolverServiceClient): Promise<number | null> {
  // Reload page to get fresh resource values
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Dismiss any popups first
  await dismissPopups(page);

  // Ensure we're logged in
  const loggedIn = await login(page);
  if (!loggedIn) {
    throw new LoginError();
  }

  // Navigate to buildings view
  const onBuildings = await navigateToBuildingsView(page);
  if (!onBuildings) {
    throw new NavigationError('buildings');
  }

  // Read all castles
  const castles = await getCastles(page);

  console.log('\n=== Castle Status ===');
  for (const castle of castles) {
    printCastleStatus(castle);
  }

  // Click any free finish buttons
  await clickFreeFinishButtons(page);

  // Check if there's research to do
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
  const castlePhases: CastlePhaseInfo[] = [];

  for (let i = 0; i < castles.length; i++) {
    const castle = castles[i];
    const { unitsRecommendation } = await getNextActionsForCastle(solverClient, castle);
    const { phase, missingUnits } = determineCastlePhase(unitsRecommendation, undefined);
    castlePhases.push({
      castle,
      castleIndex: i,
      phase,
      missingUnits,
      unitsRec: unitsRecommendation,
    });
  }

  // Check if any castle needs recruitment - if so, read current units
  const needsRecruitmentCheck = castlePhases.some(cp => cp.phase !== CastlePhase.BUILDING);
  let allCastleUnits: CastleUnits[] = [];

  if (needsRecruitmentCheck) {
    await navigateToRecruitmentView(page);
    allCastleUnits = await getUnits(page);

    // Re-determine phases with actual unit counts
    for (const cp of castlePhases) {
      if (cp.unitsRec?.buildOrderComplete) {
        const castleUnits = allCastleUnits.find(cu => cu.name === cp.castle.name);
        const currentUnits = castleUnits?.units.map(u => ({ type: u.type, count: u.count }));
        const { phase, missingUnits } = determineCastlePhase(cp.unitsRec, currentUnits);
        cp.phase = phase;
        cp.missingUnits = missingUnits;
      }
    }
  }

  // Process each phase
  let totalUpgrades = 0;
  let totalRecruits = 0;
  let totalTrades = 0;
  let minTimeRemainingMs: number | null = null;

  // PHASE 1: Building
  const buildingCastles = castlePhases.filter(cp => cp.phase === CastlePhase.BUILDING);
  if (buildingCastles.length > 0) {
    await navigateToBuildingsView(page);

    for (const cp of buildingCastles) {
      const result = await handleBuildingPhase(page, solverClient, cp.castle, cp.castleIndex);
      if (result.upgraded) totalUpgrades++;
      if (result.minTimeRemainingMs !== null) {
        if (minTimeRemainingMs === null || result.minTimeRemainingMs < minTimeRemainingMs) {
          minTimeRemainingMs = result.minTimeRemainingMs;
        }
      }
    }
  }

  // PHASE 2: Recruiting
  const recruitingCastles = castlePhases.filter(cp => cp.phase === CastlePhase.RECRUITING);
  if (recruitingCastles.length > 0) {
    await navigateToRecruitmentView(page);

    for (const cp of recruitingCastles) {
      if (cp.unitsRec) {
        const castleUnits = allCastleUnits.find(cu => cu.name === cp.castle.name);
        printUnitComparison(cp.castle.name, castleUnits?.units.map(u => ({ type: u.type, count: u.count })), cp.unitsRec);
      }

      const result = await handleRecruitingPhase(page, cp.castle.name, cp.castleIndex, cp.missingUnits);
      if (result.recruited) totalRecruits++;
    }
  }

  // PHASE 3: Trading
  const tradingCastles = castlePhases.filter(cp => cp.phase === CastlePhase.TRADING);
  if (tradingCastles.length > 0) {
    await navigateToTradingView(page);

    for (const cp of tradingCastles) {
      if (cp.unitsRec) {
        printUnitsRecommendation(cp.castle.name, cp.unitsRec);
      }

      const result = await handleTradingPhase(page, cp.castle.name, cp.castleIndex);
      if (result.traded) totalTrades++;
    }
  }

  // Summary
  printCycleSummary(totalUpgrades, totalRecruits, totalTrades);

  // Calculate sleep time
  if (minTimeRemainingMs !== null) {
    return calculateSleepTime(minTimeRemainingMs);
  }

  return null;
}
