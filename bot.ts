import { chromium, Page, BrowserContext } from 'playwright';
import 'dotenv/config';
import { createChannel, createClient } from 'nice-grpc';
import * as path from 'path';
import * as os from 'os';

// Dry run mode - prints actions instead of clicking
const DRY_RUN = process.env.DRY_RUN === 'true';

// Persistent session directory
const USER_DATA_DIR = process.env.USER_DATA_DIR || path.join(os.homedir(), '.bot-lnk-session');
import {
  BuildingType,
  ResourceType,
  Technology,
  CastleConfig,
  SolveRequest,
  SolveResponse,
  BuildingAction,
  ResearchAction,
  CastleSolverServiceDefinition,
  CastleSolverServiceClient,
  buildingTypeToJSON,
  technologyToJSON,
} from './src/generated/proto/config';

// Map DOM building names to proto BuildingType
const BUILDING_NAME_TO_TYPE: Record<string, BuildingType> = {
  'Keep': BuildingType.KEEP,
  'Arsenal': BuildingType.ARSENAL,
  'Tavern': BuildingType.TAVERN,
  'Library': BuildingType.LIBRARY,
  'Fortifications': BuildingType.FORTIFICATIONS,
  'Market': BuildingType.MARKET,
  'Farm': BuildingType.FARM,
  'Lumberjack': BuildingType.LUMBERJACK,
  'Wood store': BuildingType.WOOD_STORE,
  'Quarry': BuildingType.QUARRY,
  'Stone store': BuildingType.STONE_STORE,
  'Ore mine': BuildingType.ORE_MINE,
  'Ore store': BuildingType.ORE_STORE,
};

// Building types from header, in column order (for DOM parsing)
const BUILDING_TYPES = [
  'Keep', 'Arsenal', 'Tavern', 'Library', 'Fortifications',
  'Market', 'Farm', 'Lumberjack', 'Wood store', 'Quarry',
  'Stone store', 'Ore mine', 'Ore store'
];

// Map BuildingType enum to column index
const BUILDING_TYPE_TO_INDEX: Record<BuildingType, number> = {
  [BuildingType.KEEP]: 0,
  [BuildingType.ARSENAL]: 1,
  [BuildingType.TAVERN]: 2,
  [BuildingType.LIBRARY]: 3,
  [BuildingType.FORTIFICATIONS]: 4,
  [BuildingType.MARKET]: 5,
  [BuildingType.FARM]: 6,
  [BuildingType.LUMBERJACK]: 7,
  [BuildingType.WOOD_STORE]: 8,
  [BuildingType.QUARRY]: 9,
  [BuildingType.STONE_STORE]: 10,
  [BuildingType.ORE_MINE]: 11,
  [BuildingType.ORE_STORE]: 12,
  [BuildingType.BUILDING_UNKNOWN]: -1,
  [BuildingType.UNRECOGNIZED]: -1,
};

// Map Technology enum to display name for clicking
const TECHNOLOGY_TO_NAME: Record<Technology, string> = {
  [Technology.LONGBOW]: 'Longbow',
  [Technology.CROP_ROTATION]: 'Crop rotation',
  [Technology.YOKE]: 'Yoke',
  [Technology.CELLAR_STOREROOM]: 'Cellar storeroom',
  [Technology.STIRRUP]: 'Stirrup',
  [Technology.CROSSBOW]: 'Crossbow',
  [Technology.SWORDSMITH]: 'Swordsmith',
  [Technology.HORSE_ARMOUR]: 'Horse armour',
  [Technology.TECH_UNKNOWN]: '',
  [Technology.UNRECOGNIZED]: '',
};

interface CastleState {
  name: string;
  config: CastleConfig;
  buildingCanUpgrade: Map<BuildingType, boolean>;
}

async function navigateToBuildingsView(page: Page): Promise<boolean> {
  try {
    const buildingsBtn = page.getByRole('button', { name: 'Current building upgrades' });
    if (await buildingsBtn.isVisible({ timeout: 5000 })) {
      await buildingsBtn.click();
      await page.waitForTimeout(1000);
      return true;
    }
  } catch {
    // Button not found
  }
  return false;
}

async function getCastles(page: Page): Promise<CastleState[]> {
  const castles: CastleState[] = [];

  // Get all castle rows (exclude header row)
  const castleRows = page.locator('.table--global-overview--buildings .tabular-row:not(.global-overview--table--header)');
  const rowCount = await castleRows.count();

  console.log(`Found ${rowCount} castle rows`);

  for (let i = 0; i < rowCount; i++) {
    const row = castleRows.nth(i);

    // Get castle name
    const nameElement = row.locator('.tabular-habitat-title-cell--habitat-title');
    const castleName = await nameElement.textContent() || `Castle ${i + 1}`;

    // Get castle resources from the resource row
    const resourceAmounts = row.locator('.tabular-habitat-title-cell--resource-row .icon-amount--widget .amount');
    const wood = parseInt(await resourceAmounts.nth(0).textContent() || '0', 10);
    const stone = parseInt(await resourceAmounts.nth(1).textContent() || '0', 10);
    const ore = parseInt(await resourceAmounts.nth(2).textContent() || '0', 10);
    const food = parseInt(await resourceAmounts.nth(3).textContent() || '0', 10);

    // Get buildings (each cell after the first is a building)
    const buildingCells = row.locator('.tabular-cell--upgrade-building');
    const buildingCount = await buildingCells.count();

    const buildingLevels: { type: BuildingType; level: number }[] = [];
    const buildingCanUpgrade = new Map<BuildingType, boolean>();

    for (let j = 0; j < buildingCount && j < BUILDING_TYPES.length; j++) {
      const cell = buildingCells.nth(j);
      const upgradeCell = cell.locator('.upgrade-building--cell');

      // Level is the first div text
      const levelText = await upgradeCell.locator('> div').first().textContent();
      const level = parseInt(levelText || '0', 10);

      // Check if upgrade button exists and is enabled (use first() to avoid strict mode with multiple buttons)
      const upgradeBtn = upgradeCell.locator('button.button--action').first();
      const canUpgrade = await upgradeBtn.count() > 0 && await upgradeBtn.isEnabled().catch(() => false);

      const buildingType = BUILDING_NAME_TO_TYPE[BUILDING_TYPES[j]];
      buildingLevels.push({ type: buildingType, level });
      buildingCanUpgrade.set(buildingType, canUpgrade);
    }

    const config: CastleConfig = {
      buildingLevels,
      resources: [
        { type: ResourceType.WOOD, amount: wood },
        { type: ResourceType.STONE, amount: stone },
        { type: ResourceType.IRON, amount: ore },
        { type: ResourceType.FOOD, amount: food },
      ],
      researchedTechnologies: [], // TODO: Read from game
    };

    castles.push({
      name: castleName.trim(),
      config,
      buildingCanUpgrade,
    });
  }

  return castles;
}

async function upgradeBuilding(page: Page, castleIndex: number, buildingType: BuildingType): Promise<boolean> {
  const buildingIndex = BUILDING_TYPE_TO_INDEX[buildingType];
  if (buildingIndex < 0) {
    console.log(`Unknown building type: ${buildingType}`);
    return false;
  }

  try {
    const castleRows = page.locator('.table--global-overview--buildings .tabular-row:not(.global-overview--table--header)');
    const row = castleRows.nth(castleIndex);
    const buildingCells = row.locator('.tabular-cell--upgrade-building');
    const cell = buildingCells.nth(buildingIndex);

    // Use first() to handle cells with multiple buttons (e.g., upgrade + cancel)
    const upgradeBtn = cell.locator('button.button--action').first();

    if (await upgradeBtn.isEnabled().catch(() => false)) {
      if (DRY_RUN) {
        console.log(`[DRY RUN] Would click upgrade button for ${buildingTypeToJSON(buildingType)} in castle ${castleIndex}`);
        return true;
      }

      await upgradeBtn.click();
      await page.waitForTimeout(500);

      // Check for confirmation dialog
      const confirmBtn = page.locator('.dialog button.button--action, div:nth-child(2) > .button');
      if (await confirmBtn.count() > 0) {
        await confirmBtn.first().click();
      }

      console.log(`Upgraded ${buildingTypeToJSON(buildingType)} in castle ${castleIndex}`);
      return true;
    }
  } catch (e) {
    console.log(`Failed to upgrade:`, e);
  }
  return false;
}

async function researchTechnology(page: Page, technology: Technology): Promise<boolean> {
  const techName = TECHNOLOGY_TO_NAME[technology];
  if (!techName) {
    console.log(`Unknown technology: ${technology}`);
    return false;
  }

  try {
    if (DRY_RUN) {
      console.log(`[DRY RUN] Would research ${techName}`);
      return true;
    }

    // Click on Library button to open research menu
    const libraryBtn = page.getByRole('button', { name: 'Library' });
    if (await libraryBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await libraryBtn.click();
      await page.waitForTimeout(500);
    }

    // Click on the technology name
    const techBtn = page.getByText(techName, { exact: true });
    if (await techBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await techBtn.click();
      await page.waitForTimeout(500);
      console.log(`Started research: ${techName}`);
      return true;
    } else {
      console.log(`Technology ${techName} not visible (may already be researched or not available)`);
    }
  } catch (e) {
    console.log(`Failed to research ${techName}:`, e);
  }
  return false;
}

async function isLoggedIn(page: Page): Promise<boolean> {
  // Check if we're already in the game (buildings button visible)
  try {
    const buildingsBtn = page.getByRole('button', { name: 'Current building upgrades' });
    return await buildingsBtn.isVisible({ timeout: 3000 });
  } catch {
    return false;
  }
}

async function isOnLoginPage(page: Page): Promise<boolean> {
  try {
    const emailField = page.getByRole('textbox', { name: 'Email' });
    return await emailField.isVisible({ timeout: 3000 });
  } catch {
    return false;
  }
}

async function isOnServerSelect(page: Page): Promise<boolean> {
  const server = process.env.SERVER || '';
  try {
    const serverBtn = page.getByText(server);
    return await serverBtn.isVisible({ timeout: 3000 });
  } catch {
    return false;
  }
}

async function login(page: Page, retryCount = 0): Promise<boolean> {
  const MAX_LOGIN_RETRIES = 3;
  
  if (retryCount >= MAX_LOGIN_RETRIES) {
    console.error(`Login failed after ${MAX_LOGIN_RETRIES} attempts`);
    return false;
  }

  console.log('Checking login state...');
  
  const email = process.env.EMAIL;
  const password = process.env.PASSWORD;
  const server = process.env.SERVER;
  
  if (!email || !password || !server) {
    throw new Error('Missing EMAIL, PASSWORD, or SERVER in .env file');
  }

  // Navigate to game if not already there
  const currentUrl = page.url();
  if (!currentUrl.includes('lordsandknights.com')) {
    await page.goto('https://lordsandknights.com/');
    await page.waitForTimeout(2000);
  }

  // Check if already logged in
  if (await isLoggedIn(page)) {
    console.log('Already logged in!');
    return true;
  }

  // Check if on server select screen
  if (await isOnServerSelect(page)) {
    console.log('On server select, choosing server...');
    await page.getByText(server).click();
    await page.waitForTimeout(3000);
    return await isLoggedIn(page);
  }

  // Check if on login page
  if (await isOnLoginPage(page)) {
    console.log('On login page, logging in...');
    
    // Fill login form
    await page.getByRole('textbox', { name: 'Email' }).click();
    await page.getByRole('textbox', { name: 'Email' }).fill(email);
    await page.getByRole('textbox', { name: 'Password' }).click();
    await page.getByRole('textbox', { name: 'Password' }).fill(password);
    await page.getByRole('button', { name: 'Log in' }).click();
    
    await page.waitForTimeout(2000);

    // Handle OK dialog if it appears
    const okButton = page.getByRole('button', { name: 'OK' });
    if (await okButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await okButton.click();
      await page.getByRole('button', { name: 'Log in' }).click();
      await page.waitForTimeout(2000);
    }
    
    // Select server if visible
    if (await isOnServerSelect(page)) {
      await page.getByText(server).click();
      await page.waitForTimeout(3000);
    }
    
    console.log('Login completed!');
    return await isLoggedIn(page);
  }

  console.log(`Unknown page state (attempt ${retryCount + 1}/${MAX_LOGIN_RETRIES}), navigating to login...`);
  await page.goto('https://lordsandknights.com/');
  await page.waitForTimeout(3000);
  return await login(page, retryCount + 1);
}

// Default target levels (same as solver defaults)
const DEFAULT_TARGETS = [
  { type: BuildingType.LUMBERJACK, level: 30 },
  { type: BuildingType.QUARRY, level: 30 },
  { type: BuildingType.ORE_MINE, level: 30 },
  { type: BuildingType.FARM, level: 30 },
  { type: BuildingType.WOOD_STORE, level: 20 },
  { type: BuildingType.STONE_STORE, level: 20 },
  { type: BuildingType.ORE_STORE, level: 20 },
  { type: BuildingType.KEEP, level: 10 },
  { type: BuildingType.ARSENAL, level: 30 },
  { type: BuildingType.LIBRARY, level: 10 },
  { type: BuildingType.TAVERN, level: 10 },
  { type: BuildingType.MARKET, level: 8 },
  { type: BuildingType.FORTIFICATIONS, level: 20 },
];

function createSolverClient(): CastleSolverServiceClient {
  const solverAddress = process.env.SOLVER_ADDRESS || 'localhost:50051';
  const channel = createChannel(solverAddress);
  return createClient(CastleSolverServiceDefinition, channel);
}

interface SolverActions {
  nextAction?: BuildingAction;
  nextResearchAction?: ResearchAction;
}

async function getNextActionsForCastle(
  client: CastleSolverServiceClient,
  castle: CastleState
): Promise<SolverActions> {
  const request: SolveRequest = {
    castleConfig: castle.config,
    targetLevels: { targets: DEFAULT_TARGETS },
  };

  try {
    const response = await client.solve(request);
    return {
      nextAction: response.nextAction,
      nextResearchAction: response.nextResearchAction,
    };
  } catch (e) {
    console.error(`Failed to get next action for ${castle.name}:`, e);
    return {};
  }
}

async function clickFreeFinishButtons(page: Page): Promise<number> {
  // Find and click all free finish buttons (instant complete for short builds)
  const freeFinishBtns = page.locator('.icon-build-finish-free-2').locator('..');
  const count = await freeFinishBtns.count();
  
  if (count > 0) {
    console.log(`Found ${count} free finish button(s), clicking...`);
    for (let i = 0; i < count; i++) {
      try {
        const btn = freeFinishBtns.nth(i);
        if (await btn.isVisible()) {
          if (DRY_RUN) {
            console.log(`[DRY RUN] Would click free finish button ${i + 1}`);
          } else {
            await btn.click();
            await page.waitForTimeout(500);
            console.log(`Clicked free finish button ${i + 1}`);
          }
        }
      } catch (e) {
        console.log(`Failed to click free finish button ${i + 1}:`, e);
      }
    }
  }
  
  return count;
}

async function runBotLoop(page: Page, solverClient: CastleSolverServiceClient): Promise<void> {
  // Ensure we're logged in and on buildings view
  const loggedIn = await login(page);
  if (!loggedIn) {
    throw new Error('Failed to login');
  }

  // Navigate to buildings view
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
  // We only need to check once since research queue is global
  if (castles.length > 0) {
    const { nextResearchAction } = await getNextActionsForCastle(solverClient, castles[0]);
    if (nextResearchAction && nextResearchAction.technology !== Technology.TECH_UNKNOWN) {
      console.log(`\nSolver recommends research: ${technologyToJSON(nextResearchAction.technology)}`);
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

async function main() {
  // Launch browser with persistent context to reuse login session
  console.log(`Using persistent session at: ${USER_DATA_DIR}`);
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1920, height: 1080 },
  });

  const page = context.pages()[0] || await context.newPage();

  // Create gRPC client
  const solverClient = createSolverClient();

  console.log(`Starting bot...${DRY_RUN ? ' [DRY RUN MODE]' : ''}`);

  // Main bot loop
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 3;

  while (true) {
    try {
      await runBotLoop(page, solverClient);
      consecutiveErrors = 0; // Reset on success

      // In dry run mode, exit after one iteration
      if (DRY_RUN) {
        console.log('\n[DRY RUN] Completed single iteration. Exiting.');
        break;
      }

      // Wait before next iteration
      console.log('\nWaiting 30 seconds before next check...');
      await page.waitForTimeout(30000);

    } catch (e) {
      consecutiveErrors++;
      console.error(`\nError in bot loop (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, e);

      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.log('\nToo many consecutive errors. Waiting 1 minute before retry...');
        await page.waitForTimeout(60000);
        consecutiveErrors = 0; // Reset after long wait
        
        // Try to recover by navigating to home
        try {
          await page.goto('https://lordsandknights.com/');
          await page.waitForTimeout(3000);
        } catch {
          console.error('Failed to navigate to home page');
        }
      } else {
        console.log('\nRetrying in 5 seconds...');
        await page.waitForTimeout(5000);
      }
    }
  }

  await context.close();
}

main().catch(console.error);
