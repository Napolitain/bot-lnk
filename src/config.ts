import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import 'dotenv/config';
import { BuildingType } from './generated/proto/config.js';

/** Blocklist configuration for resource filtering */
export interface BlocklistConfig {
  /** Block by resource type (image, font, media, stylesheet, script) */
  resourceTypes: string[];
  /** Block URLs matching these patterns (substring match) */
  urlPatterns: string[];
  /** Never block URLs matching these patterns (takes precedence) */
  allowPatterns: string[];
}

export const config = {
  // Dry run mode - prints actions instead of clicking
  dryRun: process.env.DRY_RUN === 'true',

  // Headless mode - run browser without visible window
  headless: process.env.HEADLESS === 'true',

  // Block media routes (images, fonts, media) for RAM savings
  blockMedia: process.env.BLOCK_MEDIA === 'true',

  // Enable performance metrics collection
  enableMetrics: process.env.ENABLE_METRICS === 'true',

  // Blocklist configuration - loaded from BLOCKLIST_FILE or uses defaults
  blocklist: loadBlocklist(),

  // Persistent session directory
  userDataDir:
    process.env.USER_DATA_DIR || path.join(os.homedir(), '.bot-lnk-session'),

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
    minMs: 30 * 1000, // 30 seconds minimum
    maxMs: 10 * 60 * 1000, // 10 minutes max
    freeFinishThresholdMs: 5 * 60 * 1000, // 5 minutes - builds under this can be finished for free
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

/**
 * Load blocklist from JSON file or return defaults
 */
function loadBlocklist(): BlocklistConfig {
  const defaultBlocklist: BlocklistConfig = {
    // Default: only block tracking/analytics - NOT images/fonts (breaks game UI)
    resourceTypes: ['media'], // Only block video/audio
    urlPatterns: [
      // Common tracking/analytics
      'googletagmanager.com',
      'google-analytics.com',
      'analytics.',
      'facebook.net',
      'doubleclick.net',
      'adsystem',
      'adservice',
      'tracking.',
      'pixel.',
    ],
    allowPatterns: [],
  };

  const blocklistFile = process.env.BLOCKLIST_FILE;
  if (!blocklistFile) {
    return defaultBlocklist;
  }

  try {
    const content = fs.readFileSync(blocklistFile, 'utf-8');
    const loaded = JSON.parse(content) as Partial<BlocklistConfig>;
    return {
      resourceTypes: loaded.resourceTypes ?? defaultBlocklist.resourceTypes,
      urlPatterns: loaded.urlPatterns ?? defaultBlocklist.urlPatterns,
      allowPatterns: loaded.allowPatterns ?? defaultBlocklist.allowPatterns,
    };
  } catch (error) {
    console.warn(`[Config] Failed to load blocklist from ${blocklistFile}:`, error);
    return defaultBlocklist;
  }
}

export function validateConfig(): void {
  if (!config.email || !config.password || !config.server) {
    throw new Error('Missing EMAIL, PASSWORD, or SERVER in .env file');
  }
}
