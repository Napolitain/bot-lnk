import { chromium, Page } from 'playwright';
import 'dotenv/config';
import { createChannel, createClient } from 'nice-grpc';

// Dry run mode - prints actions instead of clicking
const DRY_RUN = process.env.DRY_RUN === 'true';
import {
  BuildingType,
  ResourceType,
  CastleConfig,
  SolveRequest,
  SolveResponse,
  BuildingAction,
  CastleSolverServiceDefinition,
  CastleSolverServiceClient,
  buildingTypeToJSON,
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

interface CastleState {
  name: string;
  config: CastleConfig;
  buildingCanUpgrade: Map<BuildingType, boolean>;
}

async function navigateToBuildingsView(page: Page) {
  await page.getByRole('button', { name: 'Current building upgrades' }).click();
  await page.waitForTimeout(1000);
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

      // Check if upgrade button exists and is enabled
      const upgradeBtn = upgradeCell.locator('button.button--action');
      const canUpgrade = await upgradeBtn.count() > 0 && await upgradeBtn.isEnabled();

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

    const upgradeBtn = cell.locator('button.button--action');

    if (await upgradeBtn.isEnabled()) {
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

async function login(page: Page) {
  console.log('Logging in...');
  
  const email = process.env.EMAIL;
  const password = process.env.PASSWORD;
  const server = process.env.SERVER;
  
  if (!email || !password || !server) {
    throw new Error('Missing EMAIL, PASSWORD, or SERVER in .env file');
  }
  
  await page.goto('https://lordsandknights.com/');
  
  // Fill login form
  await page.getByRole('textbox', { name: 'Email' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).click();
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  
  // Handle OK dialog if it appears
  const okButton = page.getByRole('button', { name: 'OK' });
  if (await okButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await okButton.click();
    await page.getByRole('button', { name: 'Log in' }).click();
  }
  
  // Select server
  await page.getByText(server).click();
  
  console.log('Logged in successfully!');
  
  // Wait for game to load
  await page.waitForTimeout(3000);
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

async function getNextActionForCastle(
  client: CastleSolverServiceClient,
  castle: CastleState
): Promise<BuildingAction | undefined> {
  const request: SolveRequest = {
    castleConfig: castle.config,
    targetLevels: { targets: DEFAULT_TARGETS },
  };

  try {
    const response = await client.solve(request);
    return response.nextAction;
  } catch (e) {
    console.error(`Failed to get next action for ${castle.name}:`, e);
    return undefined;
  }
}

async function main() {
  // Launch browser with persistent context to reuse login session
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  await login(page);

  // Navigate to buildings view
  await navigateToBuildingsView(page);

  // Create gRPC client
  const solverClient = createSolverClient();

  console.log(`Starting bot...${DRY_RUN ? ' [DRY RUN MODE]' : ''}`);

  // Main bot loop - run once in dry run mode
  const maxIterations = DRY_RUN ? 1 : Infinity;

  // Main bot loop
  let iteration = 0;
  while (iteration < maxIterations) {
    iteration++;
    try {
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

      // For each castle, get next action from solver and execute if possible
      let upgraded = false;
      for (let ci = 0; ci < castles.length && !upgraded; ci++) {
        const castle = castles[ci];

        // Try to get next action from solver
        const nextAction = await getNextActionForCastle(solverClient, castle);

        if (nextAction && castle.buildingCanUpgrade.get(nextAction.buildingType)) {
          console.log(`\nSolver recommends: ${buildingTypeToJSON(nextAction.buildingType)} Lv ${nextAction.fromLevel} → ${nextAction.toLevel} for ${castle.name}`);
          upgraded = await upgradeBuilding(page, ci, nextAction.buildingType);
        } else if (nextAction) {
          console.log(`\nSolver recommends ${buildingTypeToJSON(nextAction.buildingType)} but cannot upgrade yet (waiting for resources)`);
        }
      }

      if (!upgraded) {
        // Fallback: try to upgrade any available building
        for (let ci = 0; ci < castles.length && !upgraded; ci++) {
          for (const [buildingType, canUpgrade] of castles[ci].buildingCanUpgrade) {
            if (canUpgrade) {
              console.log(`\nFallback: Upgrading ${buildingTypeToJSON(buildingType)} in ${castles[ci].name}...`);
              upgraded = await upgradeBuilding(page, ci, buildingType);
              if (upgraded) break;
            }
          }
        }
      }

      if (!upgraded) {
        console.log('\nNo buildings available to upgrade.');
      }

      // In dry run mode, exit after one iteration
      if (DRY_RUN) {
        console.log('\n[DRY RUN] Completed single iteration. Exiting.');
        break;
      }

      // Wait before next iteration
      console.log('\nWaiting 30 seconds before next check...');
      await page.waitForTimeout(30000);

    } catch (e) {
      console.error('Error in bot loop:', e);
      await page.waitForTimeout(5000);
    }
  }
}

main().catch(console.error);
