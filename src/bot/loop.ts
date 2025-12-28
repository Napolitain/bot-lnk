import { Page } from 'playwright';
import { Technology, technologyToJSON, CastleSolverServiceClient } from '../generated/proto/config.js';
import { dismissPopups } from '../browser/popups.js';
import { navigateToBuildingsView, navigateToRecruitmentView, navigateToTradingView } from '../browser/navigation.js';
import { login } from '../browser/login.js';
import { researchTechnology, clickFreeFinishButtons } from '../browser/actions.js';
import { checkPageHealth, waitForHealthyPage } from '../browser/health.js';
import { escalatingRecovery, withRecovery } from '../browser/recovery.js';
import { getCastles, CastleState } from '../game/castle.js';
import { getUnits } from '../game/units.js';
import { getNextActionsForCastle } from '../client/solver.js';
import { config } from '../config.js';
import { determineCastlePhase } from '../domain/index.js';
import { handleBuildingPhase, handleRecruitingPhase, handleTradingPhase } from './phases/index.js';
import { printCastleStatus, printUnitsRecommendation, printUnitComparison, printCycleSummary, printSleepInfo } from './display.js';

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

  // Track results
  let totalUpgrades = 0;
  let totalRecruits = 0;
  let totalTrades = 0;
  let minTimeRemainingMs: number | null = null;

  // Castles that completed building and need further phases
  const castlesForRecruitment: { castle: CastleState; castleIndex: number; unitsRecommendation: any }[] = [];

  // ==================== PHASE 1: BUILDINGS (all castles) ====================
  // Already on buildings view, process all castles
  for (let castleIndex = 0; castleIndex < castles.length; castleIndex++) {
    const castle = castles[castleIndex];
    
    let solverActions;
    try {
      solverActions = await getNextActionsForCastle(solverClient, castle);
    } catch (error) {
      console.warn(`[${castle.name}] Failed to get solver data, skipping castle`);
      continue;
    }

    const { nextAction, nextResearchAction, unitsRecommendation } = solverActions;

    // Check if research should be done first (only for first castle)
    if (castleIndex === 0 && nextResearchAction) {
      try {
        const shouldResearch = nextResearchAction.technology !== Technology.TECH_UNKNOWN &&
          (!nextAction || nextResearchAction.startTimeSeconds <= nextAction.startTimeSeconds);

        if (shouldResearch) {
          console.log(`\nSolver recommends research first: ${technologyToJSON(nextResearchAction.technology)}`);
          await researchTechnology(page, nextResearchAction.technology);
        }
      } catch (error) {
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
        const result = await handleBuildingPhase(page, castle, castleIndex, nextAction);
        if (result.upgraded) totalUpgrades++;
        if (result.minTimeRemainingMs !== null) {
          if (minTimeRemainingMs === null || result.minTimeRemainingMs < minTimeRemainingMs) {
            minTimeRemainingMs = result.minTimeRemainingMs;
          }
        }
      } catch (error) {
        console.warn(`[${castle.name}] Building phase failed, continuing...`);
      }
    }
  }

  // ==================== PHASE 2: RECRUITMENT (castles with complete buildings) ====================
  if (castlesForRecruitment.length > 0) {
    const onRecruitment = await withRecovery(
      page,
      'navigate-recruitment',
      () => navigateToRecruitmentView(page),
      false
    );

    if (onRecruitment) {
      const recruitHealth = await waitForHealthyPage(page, 'recruitment');
      if (!recruitHealth.healthy) {
        console.warn(`[Health] Recruitment view issues: ${recruitHealth.issues.join(', ')}`);
      }

      const allCastleUnits = await withRecovery(page, 'get-units', () => getUnits(page), []);
      const castlesForTrading: { castle: CastleState; castleIndex: number; unitsRecommendation: any }[] = [];

      for (const { castle, castleIndex, unitsRecommendation } of castlesForRecruitment) {
        const castleUnits = allCastleUnits.find(cu => cu.name === castle.name);
        const currentUnits = castleUnits?.units.map(u => ({ type: u.type, count: u.count }));
        const { missingUnits } = determineCastlePhase(unitsRecommendation, currentUnits);

        if (missingUnits.size > 0) {
          // Need to recruit
          printUnitComparison(castle.name, currentUnits, unitsRecommendation);
          
          try {
            const result = await handleRecruitingPhase(page, castle.name, castleIndex, missingUnits);
            if (result.recruited) totalRecruits++;
          } catch (error) {
            console.warn(`[${castle.name}] Recruiting phase failed, continuing...`);
          }
        } else {
          // Units complete - queue for trading
          castlesForTrading.push({ castle, castleIndex, unitsRecommendation });
        }
      }

      // ==================== PHASE 3: TRADING (castles with complete units) ====================
      if (castlesForTrading.length > 0) {
        const onTrading = await withRecovery(
          page,
          'navigate-trading',
          () => navigateToTradingView(page),
          false
        );

        if (onTrading) {
          const tradingHealth = await waitForHealthyPage(page, 'trading');
          if (!tradingHealth.healthy) {
            console.warn(`[Health] Trading view issues: ${tradingHealth.issues.join(', ')}`);
          }

          for (const { castle, castleIndex, unitsRecommendation } of castlesForTrading) {
            printUnitsRecommendation(castle.name, unitsRecommendation);
            
            try {
              const result = await handleTradingPhase(page, castle.name, castleIndex);
              if (result.traded) totalTrades++;
            } catch (error) {
              console.warn(`[${castle.name}] Trading phase failed, continuing...`);
            }
          }
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
