import { Page } from 'playwright';
import { Technology, technologyToJSON, CastleSolverServiceClient, UnitsRecommendation, UnitCount } from '../generated/proto/config.js';
import { dismissPopups } from '../browser/popups.js';
import { navigateToBuildingsView, navigateToRecruitmentView, navigateToTradingView } from '../browser/navigation.js';
import { login } from '../browser/login.js';
import { researchTechnology, clickFreeFinishButtons } from '../browser/actions.js';
import { checkPageHealth, waitForHealthyPage } from '../browser/health.js';
import { escalatingRecovery, withRecovery } from '../browser/recovery.js';
import { getCastles, CastleState } from '../game/castle.js';
import { getUnits, CastleUnits } from '../game/units.js';
import { getNextActionsForCastle } from '../client/solver.js';
import { config } from '../config.js';
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

/** Result of a bot loop iteration */
export interface BotLoopResult {
  success: boolean;
  sleepMs: number | null;
  error?: string;
}

/** Main bot loop - NEVER throws, always returns a result */
export async function runBotLoop(page: Page, solverClient: CastleSolverServiceClient): Promise<BotLoopResult> {
  try {
    return await runBotLoopInternal(page, solverClient);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Loop] Unexpected error: ${errorMsg}`);
    
    // Try to recover
    await escalatingRecovery(page, 'bot-loop-error');
    
    return {
      success: false,
      sleepMs: config.retryDelayMs,
      error: errorMsg,
    };
  }
}

/** Internal bot loop implementation */
async function runBotLoopInternal(page: Page, solverClient: CastleSolverServiceClient): Promise<BotLoopResult> {
  // Always ensure we're on the game site first
  const currentUrl = page.url();
  console.log(`[Loop] Current URL: ${currentUrl}`);
  
  if (currentUrl === 'about:blank' || !currentUrl.includes('lordsandknights.com')) {
    console.log('[Loop] Not on game site, navigating...');
    try {
      await page.goto('https://lordsandknights.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      // Wait for page to stabilize
      await page.waitForTimeout(5000);
      console.log(`[Loop] Navigated to: ${page.url()}`);
    } catch (error) {
      console.warn('[Loop] Navigation failed, attempting recovery...');
      await escalatingRecovery(page, 'initial-navigation');
      // Give it another moment after recovery
      await page.waitForTimeout(3000);
    }
  }

  // Dismiss any popups first
  await dismissPopups(page);

  // Ensure we're logged in (this handles navigation and server selection)
  const loggedIn = await withRecovery(page, 'login', () => login(page), false);
  if (!loggedIn) {
    console.warn('[Loop] Login failed, dumping debug...');
    const { saveDebugContext } = await import('../utils/debug.js');
    await saveDebugContext(page, 'login-failed-in-loop');
    return { success: false, sleepMs: config.retryDelayMs, error: 'Login failed' };
  }

  // Health check after login (non-blocking)
  const initialHealth = await checkPageHealth(page);
  if (!initialHealth.healthy) {
    console.warn(`[Health] Issues detected: ${initialHealth.issues.join(', ')}`);
    await dismissPopups(page);
    // Don't fail, just continue
  }

  // Navigate to buildings view
  const onBuildings = await withRecovery(
    page,
    'navigate-buildings',
    () => navigateToBuildingsView(page),
    false
  );
  
  if (!onBuildings) {
    console.warn('[Loop] Could not navigate to buildings, dumping debug...');
    const { saveDebugContext } = await import('../utils/debug.js');
    await saveDebugContext(page, 'buildings-navigation-failed');
    return { success: false, sleepMs: config.retryDelayMs, error: 'Navigation failed' };
  }

  // Health check after navigation (non-blocking)
  const buildingsHealth = await waitForHealthyPage(page, 'buildings');
  if (!buildingsHealth.healthy) {
    console.warn(`[Health] Buildings view issues: ${buildingsHealth.issues.join(', ')}`);
  }

  // Read all castles
  const castles = await withRecovery(page, 'get-castles', () => getCastles(page), []);
  
  if (castles.length === 0) {
    console.warn('[Loop] No castles found, dumping debug...');
    const { saveDebugContext } = await import('../utils/debug.js');
    await saveDebugContext(page, 'no-castles-found');
    return { success: false, sleepMs: config.retryDelayMs, error: 'No castles found' };
  }

  console.log('\n=== Castle Status ===');
  for (const castle of castles) {
    printCastleStatus(castle);
  }

  // Click any free finish buttons (non-critical)
  try {
    await clickFreeFinishButtons(page);
  } catch (error) {
    console.warn('[Loop] Free finish buttons failed, continuing...');
  }

  // Check if there's research to do (non-critical)
  try {
    const { nextAction, nextResearchAction } = await getNextActionsForCastle(solverClient, castles[0]);

    const shouldResearch = nextResearchAction &&
      nextResearchAction.technology !== Technology.TECH_UNKNOWN &&
      (!nextAction || nextResearchAction.startTimeSeconds <= nextAction.startTimeSeconds);

    if (shouldResearch && nextResearchAction) {
      console.log(`\nSolver recommends research first: ${technologyToJSON(nextResearchAction.technology)}`);
      await researchTechnology(page, nextResearchAction.technology);
    }
  } catch (error) {
    console.warn('[Loop] Research check failed, continuing...');
  }

  // Determine phase for each castle
  const castlePhases: CastlePhaseInfo[] = [];

  for (let i = 0; i < castles.length; i++) {
    const castle = castles[i];
    try {
      const { unitsRecommendation } = await getNextActionsForCastle(solverClient, castle);
      const { phase, missingUnits } = determineCastlePhase(unitsRecommendation, undefined);
      castlePhases.push({
        castle,
        castleIndex: i,
        phase,
        missingUnits,
        unitsRec: unitsRecommendation,
      });
    } catch (error) {
      console.warn(`[Loop] Failed to get phase for castle ${castle.name}, defaulting to BUILDING`);
      castlePhases.push({
        castle,
        castleIndex: i,
        phase: CastlePhase.BUILDING,
        missingUnits: new Map(),
      });
    }
  }

  // Check if any castle needs recruitment - if so, read current units
  const needsRecruitmentCheck = castlePhases.some(cp => cp.phase !== CastlePhase.BUILDING);
  let allCastleUnits: CastleUnits[] = [];

  if (needsRecruitmentCheck) {
    const onRecruitment = await withRecovery(
      page,
      'navigate-recruitment',
      () => navigateToRecruitmentView(page),
      false
    );
    
    if (onRecruitment) {
      // Health check after navigation (non-blocking)
      const recruitHealth = await waitForHealthyPage(page, 'recruitment');
      if (!recruitHealth.healthy) {
        console.warn(`[Health] Recruitment view issues: ${recruitHealth.issues.join(', ')}`);
      }
      
      allCastleUnits = await withRecovery(page, 'get-units', () => getUnits(page), []);

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
  }

  // Process each phase
  let totalUpgrades = 0;
  let totalRecruits = 0;
  let totalTrades = 0;
  let minTimeRemainingMs: number | null = null;

  // PHASE 1: Building
  const buildingCastles = castlePhases.filter(cp => cp.phase === CastlePhase.BUILDING);
  if (buildingCastles.length > 0) {
    await withRecovery(page, 'navigate-buildings-phase', () => navigateToBuildingsView(page), false);

    for (const cp of buildingCastles) {
      try {
        const result = await handleBuildingPhase(page, solverClient, cp.castle, cp.castleIndex);
        if (result.upgraded) totalUpgrades++;
        if (result.minTimeRemainingMs !== null) {
          if (minTimeRemainingMs === null || result.minTimeRemainingMs < minTimeRemainingMs) {
            minTimeRemainingMs = result.minTimeRemainingMs;
          }
        }
      } catch (error) {
        console.warn(`[Loop] Building phase failed for ${cp.castle.name}, continuing...`);
      }
    }
  }

  // PHASE 2: Recruiting
  const recruitingCastles = castlePhases.filter(cp => cp.phase === CastlePhase.RECRUITING);
  if (recruitingCastles.length > 0) {
    await withRecovery(page, 'navigate-recruitment-phase', () => navigateToRecruitmentView(page), false);

    for (const cp of recruitingCastles) {
      try {
        if (cp.unitsRec) {
          const castleUnits = allCastleUnits.find(cu => cu.name === cp.castle.name);
          printUnitComparison(cp.castle.name, castleUnits?.units.map(u => ({ type: u.type, count: u.count })), cp.unitsRec);
        }

        const result = await handleRecruitingPhase(page, cp.castle.name, cp.castleIndex, cp.missingUnits);
        if (result.recruited) totalRecruits++;
      } catch (error) {
        console.warn(`[Loop] Recruiting phase failed for ${cp.castle.name}, continuing...`);
      }
    }
  }

  // PHASE 3: Trading
  const tradingCastles = castlePhases.filter(cp => cp.phase === CastlePhase.TRADING);
  if (tradingCastles.length > 0) {
    const onTrading = await withRecovery(
      page,
      'navigate-trading',
      () => navigateToTradingView(page),
      false
    );
    
    if (onTrading) {
      // Health check after navigation (non-blocking)
      const tradingHealth = await waitForHealthyPage(page, 'trading');
      if (!tradingHealth.healthy) {
        console.warn(`[Health] Trading view issues: ${tradingHealth.issues.join(', ')}`);
      }

      for (const cp of tradingCastles) {
        try {
          if (cp.unitsRec) {
            printUnitsRecommendation(cp.castle.name, cp.unitsRec);
          }

          const result = await handleTradingPhase(page, cp.castle.name, cp.castleIndex);
          if (result.traded) totalTrades++;
        } catch (error) {
          console.warn(`[Loop] Trading phase failed for ${cp.castle.name}, continuing...`);
        }
      }
    }
  }

  // Summary
  printCycleSummary(totalUpgrades, totalRecruits, totalTrades);

  // Calculate sleep time
  if (minTimeRemainingMs !== null) {
    return {
      success: true,
      sleepMs: calculateSleepTime(minTimeRemainingMs),
    };
  }

  return {
    success: true,
    sleepMs: null,
  };
}
