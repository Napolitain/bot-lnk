import type { Page } from 'playwright';
import {
  clickFreeFinishButtons,
  researchTechnology,
} from '../browser/actions.js';
import {
  checkGameHealth,
  createGameHealthChecker,
  createGameRecoveryActions,
} from '../browser/gameHealth.js';
import { login } from '../browser/login.js';
import {
  navigateToBuildingsView,
  navigateToCastleKeep,
  navigateToRecruitmentView,
} from '../browser/navigation.js';
import { dismissPopups } from '../browser/popups.js';
import {
  getNextActionsForCastle,
  type SolverActions,
} from '../client/solver.js';
import { config } from '../config.js';
import { determineCastlePhase } from '../domain/index.js';
import { type CastleState, getCastles } from '../game/castle.js';
import { getResearchedTechnologies } from '../game/technologies.js';
import { getUnits } from '../game/units.js';
import {
  ActionType,
  type CastleSolverServiceClient,
  type UnitsRecommendation,
} from '../generated/proto/config.js';
import type { MetricsCollector } from '../metrics/index.js';
import {
  escalatingRecovery,
  waitForHealthy,
  withRecovery,
} from '../resilience/index.js';
import {
  printCastleStatus,
  printCycleSummary,
  printSleepInfo,
  printUnitComparison,
  printUnitsRecommendation,
} from './display.js';
import {
  handleBuildingPhase,
  handleMissionPhase,
  handleRecruitingPhase,
  handleTradingPhase,
} from './phases/index.js';

/** Game-specific recovery actions */
const gameRecoveryActions = createGameRecoveryActions();

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
export async function runBotLoop(
  page: Page,
  solverClient: CastleSolverServiceClient,
  metricsCollector?: MetricsCollector,
): Promise<BotLoopResult> {
  try {
    return await runBotLoopInternal(page, solverClient, metricsCollector);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Loop] Unexpected error: ${errorMsg}`);

    // Try to recover
    await escalatingRecovery(page, gameRecoveryActions);

    return {
      success: false,
      sleepMs: config.retryDelayMs,
      error: errorMsg,
    };
  }
}

/** Internal bot loop implementation */
async function runBotLoopInternal(
  page: Page,
  solverClient: CastleSolverServiceClient,
  metricsCollector?: MetricsCollector,
): Promise<BotLoopResult> {
  // Always ensure we're on the game site first
  const currentUrl = page.url();
  console.log(`[Loop] Current URL: ${currentUrl}`);

  if (
    currentUrl === 'about:blank' ||
    !currentUrl.includes('lordsandknights.com')
  ) {
    console.log('[Loop] Not on game site, navigating...');
    try {
      await page.goto('https://lordsandknights.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      // Wait for page to stabilize
      await page.waitForTimeout(5000);
      console.log(`[Loop] Navigated to: ${page.url()}`);
    } catch (_error) {
      console.warn('[Loop] Navigation failed, attempting recovery...');
      await escalatingRecovery(page, gameRecoveryActions);
      // Give it another moment after recovery
      await page.waitForTimeout(3000);
    }
  }

  // Dismiss any popups first
  await dismissPopups(page);

  // Ensure we're logged in (this handles navigation and server selection)
  metricsCollector?.startPeriod('login');
  const loggedIn = await withRecovery(
    page,
    () => login(page),
    gameRecoveryActions,
    false,
  );
  await metricsCollector?.endPeriod();

  if (!loggedIn) {
    console.warn('[Loop] Login failed, dumping debug...');
    const { saveDebugContext } = await import('../utils/debug.js');
    await saveDebugContext(page, 'login-failed-in-loop');
    return {
      success: false,
      sleepMs: config.retryDelayMs,
      error: 'Login failed',
    };
  }

  // Health check after login (non-blocking)
  const initialHealth = await checkGameHealth(page);
  if (!initialHealth.healthy) {
    console.warn(
      `[Health] Issues detected: ${initialHealth.issues.join(', ')}`,
    );
    await dismissPopups(page);
    // Don't fail, just continue
  }

  // Navigate to buildings view
  const onBuildings = await withRecovery(
    page,
    () => navigateToBuildingsView(page),
    gameRecoveryActions,
    false,
  );

  if (!onBuildings) {
    console.warn('[Loop] Could not navigate to buildings, dumping debug...');
    const { saveDebugContext } = await import('../utils/debug.js');
    await saveDebugContext(page, 'buildings-navigation-failed');
    return {
      success: false,
      sleepMs: config.retryDelayMs,
      error: 'Navigation failed',
    };
  }

  // Health check after navigation (non-blocking)
  const buildingsHealth = await waitForHealthy(
    page,
    createGameHealthChecker('buildings'),
    { maxAttempts: 2, delayMs: 1000 },
  );
  if (!buildingsHealth.healthy) {
    console.warn(
      `[Health] Buildings view issues: ${buildingsHealth.issues.join(', ')}`,
    );
  }

  // ==================== PHASE 1: READ (collect complete game state) ====================
  console.log('\n=== Phase 1: Reading Game State ===');
  metricsCollector?.startPeriod('read_phase');

  // 1. Read all castles from buildings view
  const castles = await withRecovery(
    page,
    () => getCastles(page),
    gameRecoveryActions,
    [],
  );

  if (castles.length === 0) {
    console.warn('[Loop] No castles found, dumping debug...');
    const { saveDebugContext } = await import('../utils/debug.js');
    await saveDebugContext(page, 'no-castles-found');
    await metricsCollector?.endPeriod();
    return {
      success: false,
      sleepMs: config.retryDelayMs,
      error: 'No castles found',
    };
  }

  console.log(`[Read] Found ${castles.length} castles`);
  for (const castle of castles) {
    printCastleStatus(castle);
  }

  // 2. Read researched technologies (library is shared across all castles)
  if (castles.length > 0) {
    try {
      console.log('[Read] Reading researched technologies...');
      const researchedTechs = await getResearchedTechnologies(page, 0);
      // Apply to all castles (library is shared)
      for (const castle of castles) {
        castle.config.researchedTechnologies = researchedTechs;
      }
      console.log(`[Read] Found ${researchedTechs.length} researched technologies`);
    } catch (e) {
      console.warn('[Read] Failed to read researched technologies:', e);
    }
  }

  // 3. Navigate to recruitment view and read all unit counts
  console.log('[Read] Reading unit counts...');
  const onRecruitment = await withRecovery(
    page,
    () => navigateToRecruitmentView(page),
    gameRecoveryActions,
    false,
  );

  let allCastleUnits: Awaited<ReturnType<typeof getUnits>> = [];
  if (onRecruitment) {
    const recruitHealth = await waitForHealthy(
      page,
      createGameHealthChecker('recruitment'),
      { maxAttempts: 2, delayMs: 1000 },
    );
    if (!recruitHealth.healthy) {
      console.warn(`[Health] Recruitment view issues: ${recruitHealth.issues.join(', ')}`);
    }

    allCastleUnits = await withRecovery(
      page,
      () => getUnits(page),
      gameRecoveryActions,
      [],
    );
    console.log(`[Read] Read units for ${allCastleUnits.length} castles`);
  } else {
    console.warn('[Read] Could not navigate to recruitment view, units will be empty');
  }

  // Navigate back to buildings view for actions
  await navigateToBuildingsView(page);

  // Click any free finish buttons (non-critical)
  try {
    await clickFreeFinishButtons(page);
  } catch (_error) {
    console.warn('[Loop] Free finish buttons failed, continuing...');
  }

  await metricsCollector?.endPeriod();

  // ==================== PHASE 2: SOLVE (get action plans for all castles) ====================
  console.log('\n=== Phase 2: Calculating Actions ===');
  metricsCollector?.startPeriod('solve_phase');

  interface CastleActionPlan {
    castle: CastleState;
    castleIndex: number;
    solverActions: SolverActions;
    currentUnits: { type: number; count: number }[];
  }

  const actionPlans: CastleActionPlan[] = [];

  for (let castleIndex = 0; castleIndex < castles.length; castleIndex++) {
    const castle = castles[castleIndex];

    try {
      const solverActions = await getNextActionsForCastle(solverClient, castle);
      
      // Get current units for this castle
      const castleUnits = allCastleUnits.find((cu) => cu.name === castle.name);
      const currentUnits = castleUnits?.units.map((u) => ({
        type: u.type,
        count: u.count,
      })) || [];

      actionPlans.push({
        castle,
        castleIndex,
        solverActions,
        currentUnits,
      });

      console.log(`[Solve] ${castle.name}: Got action plan (${solverActions.nextAction?.type || 'none'})`);
    } catch (error) {
      console.warn(`[Solve] ${castle.name}: Failed to get solver actions, skipping`);
    }
  }

  await metricsCollector?.endPeriod();

  // Track results
  let totalUpgrades = 0;
  let totalRecruits = 0;
  let totalTrades = 0;
  let totalMissions = 0;
  let minTimeRemainingMs: number | null = null;

  // ==================== PHASE 3: EXECUTE (apply all actions) ====================
  console.log('\n=== Phase 3: Executing Actions ===');

  // 3A. BUILDINGS & RESEARCH - Already on buildings view
  metricsCollector?.startPeriod('buildings_execution');
  console.log('[Execute] Processing building and research actions...');

  for (const plan of actionPlans) {
    const { castle, castleIndex, solverActions } = plan;
    const { nextAction } = solverActions;

    if (!nextAction) continue;

    try {
      switch (nextAction.type) {
        case ActionType.ACTION_RESEARCH:
          // Research is only done from first castle (library is shared)
          if (castleIndex === 0 && nextAction.research) {
            console.log(
              `[Execute] ${castle.name}: Research ${nextAction.research.technologyName || 'Unknown'}`,
            );
            await researchTechnology(
              page,
              nextAction.research.technology,
              castleIndex,
            );
          }
          break;

        case ActionType.ACTION_BUILDING:
          if (nextAction.building) {
            const result = await handleBuildingPhase(
              page,
              castle,
              castleIndex,
              nextAction.building,
            );
            if (result.upgraded) totalUpgrades++;
            if (result.minTimeRemainingMs !== null) {
              if (
                minTimeRemainingMs === null ||
                result.minTimeRemainingMs < minTimeRemainingMs
              ) {
                minTimeRemainingMs = result.minTimeRemainingMs;
              }
            }
          }
          break;

        case ActionType.ACTION_UNIT_TRAINING:
          // Will handle in recruitment execution below
          break;

        default:
          console.warn(`[Execute] ${castle.name}: Unknown action type ${nextAction.type}`);
      }
    } catch (error) {
      console.warn(`[Execute] ${castle.name}: Action failed, continuing...`);
    }
  }

  await metricsCollector?.endPeriod();

  // 3B. RECRUITMENT - Navigate to recruitment view
  metricsCollector?.startPeriod('recruitment_execution');
  console.log('[Execute] Processing recruitment actions...');

  const castlesNeedingRecruitment = actionPlans.filter(plan => {
    const { solverActions, currentUnits } = plan;
    const { unitsRecommendation } = solverActions;
    
    if (!unitsRecommendation) return false;
    
    const { missingUnits } = determineCastlePhase(unitsRecommendation, currentUnits);
    return missingUnits.size > 0;
  });

  if (castlesNeedingRecruitment.length > 0) {
    const onRecruitment = await withRecovery(
      page,
      () => navigateToRecruitmentView(page),
      gameRecoveryActions,
      false,
    );

    if (onRecruitment) {
      const recruitHealth = await waitForHealthy(
        page,
        createGameHealthChecker('recruitment'),
        { maxAttempts: 2, delayMs: 1000 },
      );
      if (!recruitHealth.healthy) {
        console.warn(`[Health] Recruitment view issues: ${recruitHealth.issues.join(', ')}`);
      }

      for (const plan of castlesNeedingRecruitment) {
        const { castle, castleIndex, solverActions, currentUnits } = plan;
        const { unitsRecommendation } = solverActions;

        if (!unitsRecommendation) continue;

        const { missingUnits } = determineCastlePhase(unitsRecommendation, currentUnits);

        if (missingUnits.size > 0) {
          printUnitComparison(castle.name, currentUnits, unitsRecommendation);

          try {
            const result = await handleRecruitingPhase(
              page,
              castle.name,
              castleIndex,
              missingUnits,
            );
            if (result.recruited) totalRecruits++;
          } catch (error) {
            console.warn(`[Execute] ${castle.name}: Recruiting failed, continuing...`);
          }
        }
      }
    } else {
      console.warn('[Execute] Could not navigate to recruitment view, skipping recruitment');
    }
  }

  await metricsCollector?.endPeriod();

  // 3C. TRADING - Navigate to each castle's Keep individually
  metricsCollector?.startPeriod('trading_execution');
  console.log('[Execute] Processing trading actions...');

  const castlesReadyForTrading = actionPlans.filter(plan => {
    const { solverActions, currentUnits } = plan;
    const { unitsRecommendation } = solverActions;
    
    if (!unitsRecommendation || !unitsRecommendation.buildOrderComplete) return false;
    
    const { missingUnits } = determineCastlePhase(unitsRecommendation, currentUnits);
    return missingUnits.size === 0;
  });

  for (const plan of castlesReadyForTrading) {
    const { castle, castleIndex, solverActions } = plan;
    const { unitsRecommendation } = solverActions;

    if (!unitsRecommendation) continue;

    printUnitsRecommendation(castle.name, unitsRecommendation);

    // Navigate to this castle's Keep menu
    const onKeep = await withRecovery(
      page,
      () => navigateToCastleKeep(page, castleIndex),
      gameRecoveryActions,
      false,
    );

    if (onKeep) {
      try {
        const result = await handleTradingPhase(page, castle.name, castleIndex);
        if (result.traded) totalTrades++;
      } catch (error) {
        console.warn(`[Execute] ${castle.name}: Trading failed, continuing...`);
      }
    } else {
      console.warn(`[Execute] ${castle.name}: Could not navigate to Keep, skipping trade`);
    }
  }

  await metricsCollector?.endPeriod();

  // 3D. MISSIONS - Navigate to each castle's Tavern individually
  metricsCollector?.startPeriod('missions_execution');
  console.log('[Execute] Processing mission actions...');

  // Missions run for castles that are ready for trading (same criteria)
  for (const plan of castlesReadyForTrading) {
    const { castle, castleIndex } = plan;

    try {
      const result = await handleMissionPhase(page, castle.name, castleIndex);
      totalMissions += result.missionsStarted;
    } catch (error) {
      console.warn(`[Execute] ${castle.name}: Mission phase failed:`, error);
    }
  }

  await metricsCollector?.endPeriod();

  // Summary
  printCycleSummary(totalUpgrades, totalRecruits, totalTrades, totalMissions);

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
