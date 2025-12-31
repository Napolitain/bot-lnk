import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface SystemdWatchdog {
  enabled: boolean;
  intervalMs: number | null;
  notify: () => Promise<void>;
  start: () => void;
  stop: () => void;
}

/**
 * Create a systemd watchdog notifier.
 *
 * Auto-detects systemd environment via WATCHDOG_USEC env var.
 * When not running under systemd, all methods become no-ops.
 *
 * Usage:
 *   const watchdog = createSystemdWatchdog();
 *   watchdog.start();  // Starts periodic pings if systemd detected
 *
 *   // In your main loop:
 *   await watchdog.notify();  // Send "I'm alive" ping
 *
 *   // On shutdown:
 *   watchdog.stop();
 */
export function createSystemdWatchdog(): SystemdWatchdog {
  // Check if running under systemd with watchdog enabled
  const watchdogUsec = process.env.WATCHDOG_USEC;
  const watchdogPid = process.env.WATCHDOG_PID;

  // Enabled if WATCHDOG_USEC is set and either:
  // - WATCHDOG_PID is not set (applies to all processes), or
  // - WATCHDOG_PID matches our PID
  const enabled = !!(
    watchdogUsec &&
    (!watchdogPid || watchdogPid === process.pid.toString())
  );

  // Calculate ping interval (systemd recommends half the timeout)
  const intervalMs = enabled
    ? Math.floor(Number.parseInt(watchdogUsec, 10) / 2000) // usec -> ms, then half
    : null;

  let timer: NodeJS.Timeout | null = null;

  const notify = async () => {
    if (!enabled) return;

    try {
      // Send watchdog ping via systemd-notify
      // Note: This requires systemd-notify to be available (part of systemd package)
      await execAsync('systemd-notify WATCHDOG=1');
    } catch (e) {
      // Don't log on every failure - systemd-notify might not be available
      // Only warn if we're definitely running under systemd
      if (process.env.NOTIFY_SOCKET) {
        console.warn('[Watchdog] Failed to send ping:', e);
      }
    }
  };

  const start = () => {
    if (!enabled || !intervalMs) {
      // Silent when not running under systemd - this is expected
      return;
    }

    console.log(
      `[Watchdog] Enabled - pinging every ${Math.floor(intervalMs / 1000)}s (timeout: ${Math.floor((intervalMs * 2) / 1000)}s)`,
    );

    // Start periodic pings
    timer = setInterval(notify, intervalMs);

    // Send initial ready notification
    execAsync('systemd-notify --ready').catch(() => {
      // Ignore errors on ready notification
    });
  };

  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }

    if (enabled) {
      // Notify systemd we're stopping gracefully
      execAsync('systemd-notify --stopping').catch(() => {
        // Ignore errors on stopping notification
      });
    }
  };

  return { enabled, intervalMs, notify, start, stop };
}
