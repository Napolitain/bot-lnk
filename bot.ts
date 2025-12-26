import { chromium, Page, Locator } from 'playwright';

interface Resources {
  wood: number;
  stone: number;
  ore: number;
  copper: number;
}

interface Building {
  name: string;
  level: number;
  canUpgrade: boolean;
  upgradeCost?: Resources;
  upgradeDuration?: string;
}

interface Castle {
  name: string;
  resources: Resources;
  buildings: Building[];
}

// Building types from header, in column order
const BUILDING_TYPES = [
  'Keep', 'Arsenal', 'Tavern', 'Library', 'Fortifications', 
  'Market', 'Farm', 'Lumberjack', 'Wood store', 'Quarry', 
  'Stone store', 'Ore mine', 'Ore store'
];

async function getCastles(page: Page): Promise<Castle[]> {
  const castles: Castle[] = [];
  
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
    const resources: Resources = {
      wood: parseInt(await resourceAmounts.nth(0).textContent() || '0', 10),
      stone: parseInt(await resourceAmounts.nth(1).textContent() || '0', 10),
      ore: parseInt(await resourceAmounts.nth(2).textContent() || '0', 10),
      copper: parseInt(await resourceAmounts.nth(3).textContent() || '0', 10),
    };
    
    // Get buildings (each cell after the first is a building)
    const buildingCells = row.locator('.tabular-cell--upgrade-building');
    const buildingCount = await buildingCells.count();
    const buildings: Building[] = [];
    
    for (let j = 0; j < buildingCount && j < BUILDING_TYPES.length; j++) {
      const cell = buildingCells.nth(j);
      const upgradeCell = cell.locator('.upgrade-building--cell');
      
      // Level is the first div text
      const levelText = await upgradeCell.locator('> div').first().textContent();
      const level = parseInt(levelText || '0', 10);
      
      // Check if upgrade button exists and is enabled
      const upgradeBtn = upgradeCell.locator('button.button--action');
      const canUpgrade = await upgradeBtn.count() > 0 && await upgradeBtn.isEnabled();
      
      buildings.push({
        name: BUILDING_TYPES[j],
        level,
        canUpgrade
      });
    }
    
    castles.push({
      name: castleName.trim(),
      resources,
      buildings
    });
  }
  
  return castles;
}

async function upgradeBuilding(page: Page, castleIndex: number, buildingIndex: number): Promise<boolean> {
  try {
    const castleRows = page.locator('.table--global-overview--buildings .tabular-row:not(.global-overview--table--header)');
    const row = castleRows.nth(castleIndex);
    const buildingCells = row.locator('.tabular-cell--upgrade-building');
    const cell = buildingCells.nth(buildingIndex);
    
    const upgradeBtn = cell.locator('button.button--action');
    
    if (await upgradeBtn.isEnabled()) {
      await upgradeBtn.click();
      await page.waitForTimeout(500);
      
      // Check for confirmation dialog
      const confirmBtn = page.locator('.dialog button.button--action, div:nth-child(2) > .button');
      if (await confirmBtn.count() > 0) {
        await confirmBtn.first().click();
      }
      
      console.log(`Upgraded ${BUILDING_TYPES[buildingIndex]} in castle ${castleIndex}`);
      return true;
    }
  } catch (e) {
    console.log(`Failed to upgrade:`, e);
  }
  return false;
}

async function main() {
  // Launch browser with persistent context to reuse login session
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();
  
  await page.goto('https://lordsandknights.com/');
  
  // Wait for user to login and get past tutorial manually
  console.log('Please login and get past the tutorial...');
  console.log('Press Enter in the terminal when ready to start the bot.');
  
  await new Promise<void>(resolve => {
    process.stdin.once('data', () => resolve());
  });
  
  console.log('Starting bot...');
  
  // Main bot loop
  while (true) {
    try {
      // Read all castles with resources and buildings
      const castles = await getCastles(page);
      
      console.log('\n=== Castle Status ===');
      for (const castle of castles) {
        console.log(`\n${castle.name}:`);
        console.log(`  Resources: Wood=${castle.resources.wood}, Stone=${castle.resources.stone}, Ore=${castle.resources.ore}, Copper=${castle.resources.copper}`);
        console.log(`  Buildings:`);
        for (const building of castle.buildings) {
          const status = building.canUpgrade ? '[CAN UPGRADE]' : '';
          console.log(`    - ${building.name}: Lv ${building.level} ${status}`);
        }
      }
      
      // Try to upgrade first available building
      let upgraded = false;
      for (let ci = 0; ci < castles.length && !upgraded; ci++) {
        for (let bi = 0; bi < castles[ci].buildings.length && !upgraded; bi++) {
          if (castles[ci].buildings[bi].canUpgrade) {
            console.log(`\nUpgrading ${castles[ci].buildings[bi].name} in ${castles[ci].name}...`);
            upgraded = await upgradeBuilding(page, ci, bi);
          }
        }
      }
      
      if (!upgraded) {
        console.log('\nNo buildings available to upgrade.');
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
