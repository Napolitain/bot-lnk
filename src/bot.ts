import { Page } from 'playwright';
import {
  ResourceType,
  Technology,
  buildingTypeToJSON,
  technologyToJSON,
  CastleSolverServiceClient,
} from './generated/proto/config.js';
import { dismissPopups } from './browser/popups.js';
import { navigateToBuildingsView } from './browser/navigation.js';
import { login } from './browser/login.js';
import { upgradeBuilding, researchTechnology, clickFreeFinishButtons } from './browser/actions.js';
import { getCastles } from './game/castle.js';
import { getNextActionsForCastle } from './client/solver.js';

export async function runBotLoop(page: Page, solverClient: CastleSolverServiceClient): Promise<void> {
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

    console.log(`\n${castle.name}:`);
    console.log(`  Resources: Wood=${wood}, Stone=${stone}, Iron=${iron}, Food=${food}`);
    console.log(`  Buildings:`);
    for (const bl of castle.config.buildingLevels) {
      const canUpgrade = castle.buildingCanUpgrade.get(bl.type) ? '[CAN UPGRADE]' : '';
      console.log(`    - ${buildingTypeToJSON(bl.type)}: Lv ${bl.level} ${canUpgrade}`);
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
  for (let ci = 0; ci < castles.length; ci++) {
    const castle = castles[ci];

    // Try to get next action from solver
    const { nextAction } = await getNextActionsForCastle(solverClient, castle);

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
    }
  }

  console.log(`\nTotal upgrades this cycle: ${totalUpgrades}/${castles.length} castles`);
}
