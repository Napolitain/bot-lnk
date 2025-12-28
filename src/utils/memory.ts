import * as fs from 'node:fs';

export interface SystemMemory {
  totalMB: number;
  availableMB: number;
  swapTotalMB: number;
  swapFreeMB: number;
  usedPercent: number;
}

/**
 * Get system memory info from /proc/meminfo (Linux only)
 * Returns null on non-Linux systems
 */
export function getSystemMemory(): SystemMemory | null {
  try {
    const meminfo = fs.readFileSync('/proc/meminfo', 'utf-8');

    const getValue = (key: string): number => {
      const match = meminfo.match(new RegExp(`${key}:\\s+(\\d+)`));
      return match ? parseInt(match[1], 10) / 1024 : 0; // Convert KB to MB
    };

    const total = getValue('MemTotal');
    const available = getValue('MemAvailable');
    const swapTotal = getValue('SwapTotal');
    const swapFree = getValue('SwapFree');

    return {
      totalMB: total,
      availableMB: available,
      swapTotalMB: swapTotal,
      swapFreeMB: swapFree,
      usedPercent: ((total - available) / total) * 100,
    };
  } catch {
    // Not Linux or /proc not available
    return null;
  }
}

export interface MemoryThresholds {
  /** Minimum available RAM in MB before triggering restart */
  minAvailableMB: number;
  /** Minimum available swap in MB (when swap is used) before triggering restart */
  minSwapFreeMB: number;
  /** Maximum memory usage percentage before triggering restart */
  maxUsedPercent: number;
}

const DEFAULT_THRESHOLDS: MemoryThresholds = {
  minAvailableMB: 500, // Restart if less than 500MB RAM available
  minSwapFreeMB: 200, // Restart if less than 200MB swap free (when swap exists)
  maxUsedPercent: 90, // Restart if >90% memory used
};

/**
 * Check if browser context should be restarted due to memory pressure
 */
export function shouldRestartForMemory(
  thresholds: MemoryThresholds = DEFAULT_THRESHOLDS,
): { shouldRestart: boolean; reason: string | null; memory: SystemMemory | null } {
  const memory = getSystemMemory();

  if (!memory) {
    return { shouldRestart: false, reason: null, memory: null };
  }

  // Check available RAM
  if (memory.availableMB < thresholds.minAvailableMB) {
    return {
      shouldRestart: true,
      reason: `Low RAM: ${memory.availableMB.toFixed(0)}MB available (threshold: ${thresholds.minAvailableMB}MB)`,
      memory,
    };
  }

  // Check swap usage (only if swap exists and is being used)
  if (memory.swapTotalMB > 0) {
    const swapUsed = memory.swapTotalMB - memory.swapFreeMB;
    if (swapUsed > 0 && memory.swapFreeMB < thresholds.minSwapFreeMB) {
      return {
        shouldRestart: true,
        reason: `Low swap: ${memory.swapFreeMB.toFixed(0)}MB free (threshold: ${thresholds.minSwapFreeMB}MB)`,
        memory,
      };
    }
  }

  // Check overall usage percentage
  if (memory.usedPercent > thresholds.maxUsedPercent) {
    return {
      shouldRestart: true,
      reason: `High memory usage: ${memory.usedPercent.toFixed(1)}% (threshold: ${thresholds.maxUsedPercent}%)`,
      memory,
    };
  }

  return { shouldRestart: false, reason: null, memory };
}

/**
 * Log current memory status
 */
export function logMemoryStatus(): void {
  const memory = getSystemMemory();
  if (!memory) {
    console.log('[Memory] System memory monitoring not available (non-Linux)');
    return;
  }

  const swapInfo =
    memory.swapTotalMB > 0
      ? `, Swap: ${memory.swapFreeMB.toFixed(0)}/${memory.swapTotalMB.toFixed(0)}MB free`
      : '';

  console.log(
    `[Memory] RAM: ${memory.availableMB.toFixed(0)}/${memory.totalMB.toFixed(0)}MB available (${memory.usedPercent.toFixed(1)}% used)${swapInfo}`,
  );
}
