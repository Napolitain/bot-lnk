/**
 * Core resilience primitives - generic, reusable patterns
 * No dependencies on Playwright or game-specific code
 */

import type {
  HealthChecker,
  HealthCheckResult,
  PollOptions,
  RecoveryAction,
  RecoveryResult,
  RetryOptions,
  StaleCheckResult,
  StateSnapshot,
} from './types.js';

/**
 * Poll until a condition returns true or timeout
 */
export async function pollUntil(
  condition: () => Promise<boolean>,
  options: PollOptions,
): Promise<boolean> {
  const { timeoutMs, intervalMs, description = 'condition' } = options;
  const startTime = Date.now();
  let attempts = 0;

  while (Date.now() - startTime < timeoutMs) {
    attempts++;
    try {
      if (await condition()) {
        return true;
      }
    } catch {
      // Condition threw, treat as false
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  console.warn(
    `[Poll] ${description} not met after ${timeoutMs}ms (${attempts} attempts)`,
  );
  return false;
}

/**
 * Poll until getter returns a truthy value
 */
export async function pollFor<T>(
  getter: () => Promise<T | null | undefined>,
  options: PollOptions,
): Promise<T | undefined> {
  const { timeoutMs, intervalMs, description = 'value' } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const value = await getter();
      if (value !== null && value !== undefined) {
        return value;
      }
    } catch {
      // Continue
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  console.warn(`[Poll] ${description} not found after ${timeoutMs}ms`);
  return undefined;
}

/**
 * Retry an action with configurable backoff
 */
export async function retry<T>(
  action: () => Promise<T>,
  options: RetryOptions,
): Promise<{ success: boolean; result?: T; error?: string; attempts: number }> {
  const {
    maxAttempts,
    delayMs,
    backoffMultiplier = 1,
    maxDelayMs = 60000,
  } = options;
  let currentDelay = delayMs;
  let lastError = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await action();
      return { success: true, result, attempts: attempt };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, currentDelay));
        currentDelay = Math.min(currentDelay * backoffMultiplier, maxDelayMs);
      }
    }
  }

  return { success: false, error: lastError, attempts: maxAttempts };
}

/**
 * Execute recovery actions in order until one succeeds
 */
export async function escalatingRecovery<TContext>(
  ctx: TContext,
  actions: RecoveryAction<TContext>[],
  onFailure?: (
    action: RecoveryAction<TContext>,
    error: string,
  ) => Promise<void>,
): Promise<RecoveryResult> {
  for (const action of actions) {
    console.log(`[Recovery] Attempting: ${action.name}`);
    try {
      const success = await action.execute(ctx);
      if (success) {
        return {
          success: true,
          strategyUsed: action.name,
          message: 'Recovery successful',
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[Recovery] ${action.name} failed: ${errorMsg}`);
      if (onFailure) {
        await onFailure(action, errorMsg);
      }
    }
  }

  return {
    success: false,
    strategyUsed: 'none',
    message: 'All recovery strategies exhausted',
  };
}

/**
 * Wait for healthy state with retries
 */
export async function waitForHealthy<TContext>(
  ctx: TContext,
  checker: HealthChecker<TContext>,
  options: RetryOptions,
): Promise<HealthCheckResult> {
  const { maxAttempts, delayMs } = options;
  let lastResult: HealthCheckResult = {
    healthy: false,
    issues: ['Not checked'],
  };

  for (let i = 0; i < maxAttempts; i++) {
    try {
      lastResult = await checker(ctx);
      if (lastResult.healthy) {
        return lastResult;
      }
    } catch {
      lastResult = { healthy: false, issues: ['Health check threw'] };
    }

    if (i < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return lastResult;
}

/**
 * Check if state is stale by comparing snapshots
 */
export function checkStale(
  previous: StateSnapshot | null,
  current: StateSnapshot,
  expectedChangeMs: number,
  tolerance = 0.5,
): StaleCheckResult {
  if (!previous) {
    return { isStale: false };
  }

  const timePassed = current.timestamp - previous.timestamp;

  // If same signature after significant time, data is stale
  if (
    previous.signature === current.signature &&
    timePassed > expectedChangeMs * tolerance
  ) {
    return {
      isStale: true,
      reason: `State unchanged after ${Math.round(timePassed / 1000)}s (expected change after ${Math.round(expectedChangeMs / 1000)}s)`,
    };
  }

  return { isStale: false };
}

/**
 * Wrap an action with automatic recovery on failure
 */
export async function withRecovery<TContext, T>(
  ctx: TContext,
  action: () => Promise<T>,
  recoveryActions: RecoveryAction<TContext>[],
  defaultValue: T,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn(`[withRecovery] Action failed: ${errorMsg}`);

    const recovery = await escalatingRecovery(ctx, recoveryActions);

    if (recovery.success) {
      // Retry action after recovery
      try {
        return await action();
      } catch (_retryError) {
        console.warn(`[withRecovery] Retry after recovery failed`);
      }
    }

    return defaultValue;
  }
}
