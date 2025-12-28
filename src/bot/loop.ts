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
  navigateToRecruitmentView,
  navigateToTradingView,
} from '../browser/navigation.js';
import { dismissPopups } from '../browser/popups.js';
import {
  getNextActionsForCastle,
  type SolverActions,
} from '../client/solver.js';
import { config } from '../config.js';
import { determineCastlePhase } from '../domain/index.js';
import { type CastleState, getCastles } from '../game/castle.js';
import { getUnits } from '../game/units.js';
import {
  type CastleSolverServiceClient,
  Technology,
  technologyToJSON,
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

  // Read all castles
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
    return {
      success: false,
      sleepMs: config.retryDelayMs,
      error: 'No castles found',
    };
  }

  console.log('\n=== Castle Status ===');
  for (const castle of castles) {
    printCastleStatus(castle);
  }

  // Click any free finish buttons (non-critical)
  try {
    await clickFreeFinishButtons(page);
  } catch (_error) {
    console.warn('[Loop] Free finish buttons failed, continuing...');
  }

  // Track results
  let totalUpgrades = 0;
  let totalRecruits = 0;
  let totalTrades = 0;
  let minTimeRemainingMs: number | null = null;

  // Castles that completed building and need further phases
  const castlesForRecruitment: {
    castle: CastleState;
    castleIndex: number;
    unitsRecommendation: UnitsRecommendation;
  }[] = [];

  // ==================== PHASE 1: BUILDINGS (all castles) ====================
  // Already on buildings view, process all castles
  metricsCollector?.startPeriod('buildings_phase');

  for (let castleIndex = 0; castleIndex < castles.length; castleIndex++) {
    const castle = castles[castleIndex];

    let solverActions: SolverActions;
    try {
      solverActions = await getNextActionsForCastle(solverClient, castle);
    } catch (_error) {
      console.warn(
        `[${castle.name}] Failed to get solver data, skipping castle`,
      );
      continue;
    }

    const { nextAction, nextResearchAction, unitsRecommendation } =
      solverActions;

    // Check if research should be done first (only for first castle)
    if (castleIndex === 0 && nextResearchAction) {
      try {
        const shouldResearch =
          nextResearchAction.technology !== Technology.TECH_UNKNOWN &&
          (!nextAction ||
            nextResearchAction.startTimeSeconds <= nextAction.startTimeSeconds);

        if (shouldResearch) {
          console.log(
            `\nSolver recommends research first: ${technologyToJSON(nextResearchAction.technology)}`,
          );
          await researchTechnology(page, nextResearchAction.technology);
        }
      } catch (_error) {
        console.warn('[Loop] Research failed, continuing...');
      }
    }

    // Check if building phase is complete
    if (unitsRecommendation?.buildOrderComplete) {
      // Building done - queue for recruitment phase
      castlesForRecruitment.push({ castle, castleIndex, unitsRecommendation });
    } else {
      // Still building
      try {
        const result = await handleBuildingPhase(
          page,
          castle,
          castleIndex,
          nextAction,
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
      } catch (_error) {
        console.warn(`[${castle.name}] Building phase failed, continuing...`);
      }
    }
  }

  await metricsCollector?.endPeriod();

  // ==================== PHASE 2: RECRUITMENT (castles with complete buildings) ====================
  if (castlesForRecruitment.length > 0) {
    metricsCollector?.startPeriod('recruitment_phase');

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
        console.warn(
          `[Health] Recruitment view issues: ${recruitHealth.issues.join(', ')}`,
        );
      }

      const allCastleUnits = await withRecovery(
        page,
        () => getUnits(page),
        gameRecoveryActions,
        [],
      );
      const castlesForTrading: {
        castle: CastleState;
        castleIndex: number;
        unitsRecommendation: UnitsRecommendation;
      }[] = [];

      for (const {
        castle,
        castleIndex,
        unitsRecommendation,
      } of castlesForRecruitment) {
        const castleUnits = allCastleUnits.find(
          (cu) => cu.name === castle.name,
        );
        const currentUnits = castleUnits?.units.map((u) => ({
          type: u.type,
          count: u.count,
        }));
        const { missingUnits } = determineCastlePhase(
          unitsRecommendation,
          currentUnits,
        );

        if (missingUnits.size > 0) {
          // Need to recruit
          printUnitComparison(castle.name, currentUnits, unitsRecommendation);

          try {
            const result = await handleRecruitingPhase(
              page,
              castle.name,
              castleIndex,
              missingUnits,
            );
            if (result.recruited) totalRecruits++;
          } catch (_error) {
            console.warn(
              `[${castle.name}] Recruiting phase failed, continuing...`,
            );
          }
        } else {
          // Units complete - queue for trading
          castlesForTrading.push({ castle, castleIndex, unitsRecommendation });
        }
      }

      // ==================== PHASE 3: TRADING (castles with complete units) ====================
      if (castlesForTrading.length > 0) {
        await metricsCollector?.endPeriod();
        metricsCollector?.startPeriod('trading_phase');

        const onTrading = await withRecovery(
          page,
          () => navigateToTradingView(page),
          gameRecoveryActions,
          false,
        );

        if (onTrading) {
          const tradingHealth = await waitForHealthy(
            page,
            createGameHealthChecker('trading'),
            { maxAttempts: 2, delayMs: 1000 },
          );
          if (!tradingHealth.healthy) {
            console.warn(
              `[Health] Trading view issues: ${tradingHealth.issues.join(', ')}`,
            );
          }

          for (const {
            castle,
            castleIndex,
            unitsRecommendation,
          } of castlesForTrading) {
            printUnitsRecommendation(castle.name, unitsRecommendation);

            try {
              const result = await handleTradingPhase(
                page,
                castle.name,
                castleIndex,
              );
              if (result.traded) totalTrades++;
            } catch (_error) {
              console.warn(
                `[${castle.name}] Trading phase failed, continuing...`,
              );
            }
          }
        }

        await metricsCollector?.endPeriod();
      } else {
        await metricsCollector?.endPeriod();
      }
    } else {
      await metricsCollector?.endPeriod();
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
