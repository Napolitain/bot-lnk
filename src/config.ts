import * as path from 'path';
import * as os from 'os';
import 'dotenv/config';

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
};

export function validateConfig(): void {
  if (!config.email || !config.password || !config.server) {
    throw new Error('Missing EMAIL, PASSWORD, or SERVER in .env file');
  }
}
