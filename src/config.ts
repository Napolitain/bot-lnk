import * as path from 'path';
import * as os from 'os';
import 'dotenv/config';
import { BuildingType } from './generated/proto/config.js';

export const config = {
  // Dry run mode - prints actions instead of clicking
  dryRun: process.env.DRY_RUN === 'true',

  // Headless mode - run browser without visible window
  headless: process.env.HEADLESS === 'true',

  // Block media routes (images, fonts, media) for RAM savings
  blockMedia: process.env.BLOCK_MEDIA === 'true',

  // Persistent session directory
  userDataDir: process.env.USER_DATA_DIR || path.join(os.homedir(), '.bot-lnk-session'),

  // Solver gRPC address
  solverAddress: process.env.SOLVER_ADDRESS || 'localhost:50051',

  // Credentials
  email: process.env.EMAIL || '',
  password: process.env.PASSWORD || '',
  server: process.env.SERVER || '',

  // Timing
  loopIntervalMs: 30000,
  retryDelayMs: 5000,
  longRetryDelayMs: 60000,
  maxConsecutiveErrors: 3,
  maxLoginRetries: 3,

  // Sleep timing
  sleep: {
    minMs: 30 * 1000,           // 30 seconds minimum
    maxMs: 10 * 60 * 1000,      // 10 minutes max
    freeFinishThresholdMs: 5 * 60 * 1000,  // 5 minutes - builds under this can be finished for free
  },

  // Building queue
  maxBuildingQueue: 2,

  // Target building levels (end of build order)
  targets: [
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
  ],
};

export function validateConfig(): void {
  if (!config.email || !config.password || !config.server) {
    throw new Error('Missing EMAIL, PASSWORD, or SERVER in .env file');
  }
}
