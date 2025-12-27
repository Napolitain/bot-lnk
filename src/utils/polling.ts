/**
 * Polling utilities - avoid passive sleeps, actively check conditions
 */

export interface PollOptions {
  /** Maximum time to wait in ms (default: 30000) */
  timeout?: number;
  /** Interval between checks in ms (default: 1000) */
  interval?: number;
  /** Description for logging */
  description?: string;
}

/**
 * Poll a condition until it returns true or timeout
 * @returns true if condition was met, false if timeout
 */
export async function pollUntil(
  condition: () => Promise<boolean>,
  options: PollOptions = {}
): Promise<boolean> {
  const {
    timeout = 30000,
    interval = 1000,
    description = 'condition',
  } = options;

  const startTime = Date.now();
  let attempts = 0;

  while (Date.now() - startTime < timeout) {
    attempts++;
    try {
      if (await condition()) {
        if (attempts > 1) {
          console.log(`[Poll] ${description} met after ${attempts} attempts (${Date.now() - startTime}ms)`);
        }
        return true;
      }
    } catch (error) {
      // Condition threw, treat as false
    }

    // Wait before next check
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  console.warn(`[Poll] ${description} not met after ${timeout}ms (${attempts} attempts)`);
  return false;
}

/**
 * Poll until a condition returns a truthy value
 * @returns the value if found, undefined if timeout
 */
export async function pollFor<T>(
  getter: () => Promise<T | null | undefined>,
  options: PollOptions = {}
): Promise<T | undefined> {
  const {
    timeout = 30000,
    interval = 1000,
    description = 'value',
  } = options;

  const startTime = Date.now();
  let attempts = 0;

  while (Date.now() - startTime < timeout) {
    attempts++;
    try {
      const value = await getter();
      if (value !== null && value !== undefined) {
        if (attempts > 1) {
          console.log(`[Poll] ${description} found after ${attempts} attempts (${Date.now() - startTime}ms)`);
        }
        return value;
      }
    } catch (error) {
      // Getter threw, treat as not found
    }

    await new Promise(resolve => setTimeout(resolve, interval));
  }

  console.warn(`[Poll] ${description} not found after ${timeout}ms (${attempts} attempts)`);
  return undefined;
}

/**
 * Wait with early exit - waits up to maxWait but checks condition every interval
 * @returns remaining time that was not waited
 */
export async function waitWithEarlyExit(
  shouldExit: () => Promise<boolean>,
  maxWaitMs: number,
  intervalMs: number = 3000
): Promise<{ exited: boolean; waitedMs: number }> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    try {
      if (await shouldExit()) {
        return { exited: true, waitedMs: Date.now() - startTime };
      }
    } catch {
      // Continue waiting
    }

    const remaining = maxWaitMs - (Date.now() - startTime);
    const waitTime = Math.min(intervalMs, remaining);
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  return { exited: false, waitedMs: maxWaitMs };
}
