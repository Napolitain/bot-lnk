/**
 * Resilience types - generic interfaces for recovery and health checking
 * These are abstract and don't depend on Playwright or game-specific code
 */

/** Result of a health check */
export interface HealthCheckResult {
  healthy: boolean;
  issues: string[];
  context?: Record<string, unknown>;
}

/** A health checker function */
export type HealthChecker<TContext> = (
  ctx: TContext,
) => Promise<HealthCheckResult>;

/** Result of a recovery attempt */
export interface RecoveryResult {
  success: boolean;
  strategyUsed: string;
  message: string;
}

/** A recovery action */
export interface RecoveryAction<TContext> {
  name: string;
  execute: (ctx: TContext) => Promise<boolean>;
}

/** Options for retry logic */
export interface RetryOptions {
  maxAttempts: number;
  delayMs: number;
  backoffMultiplier?: number;
  maxDelayMs?: number;
}

/** Options for polling */
export interface PollOptions {
  timeoutMs: number;
  intervalMs: number;
  description?: string;
}

/** Result of a stale check */
export interface StaleCheckResult {
  isStale: boolean;
  reason?: string;
}

/** State tracker for detecting staleness */
export interface StateSnapshot {
  timestamp: number;
  signature: string; // Hash or key value to compare
}
