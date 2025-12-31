# Systemd Watchdog Support

## Overview

The bot now includes **optional** systemd watchdog support for automatic recovery from hangs/crashes when running as a systemd service.

## Features

- ✅ **Auto-detection** - Automatically enabled when running under systemd with watchdog
- ✅ **Zero overhead** - Complete no-op when not running under systemd
- ✅ **No configuration** - Works out of the box
- ✅ **Graceful shutdown** - Notifies systemd on clean exit

## Running WITHOUT Systemd (Default)

```bash
# Works exactly as before - no changes needed
npm start
npm run start:keep-logs

# Watchdog is silently disabled (no logs)
```

## Running WITH Systemd

### 1. Update Service File

The `systemd/bot-lnk.service` file has been updated with watchdog support:

```ini
[Service]
Type=notify              # Changed from 'simple'
NotifyAccess=main

# Watchdog: restart if no ping for 5 minutes
WatchdogSec=300
Restart=on-watchdog
RestartSec=30
```

### 2. Install Service

```bash
# Copy service file (adjust paths first!)
sudo cp systemd/bot-lnk.service /etc/systemd/system/

# Edit paths in the file
sudo nano /etc/systemd/system/bot-lnk.service

# Reload systemd
sudo systemctl daemon-reload

# Start service
sudo systemctl start bot-lnk

# Check status
systemctl status bot-lnk --no-pager
```

### 3. Monitor Logs

```bash
# Follow logs
journalctl -u bot-lnk -f

# You should see:
# [Watchdog] Enabled - pinging every 150s (timeout: 300s)
```

## How It Works

### Normal Operation

```
Bot → Watchdog Ping (every 2.5 min)
      ↓
Systemd ← "I'm alive"
```

### Hang/Crash Detection

```
Bot hangs (no ping for 5 min)
      ↓
Systemd detects timeout
      ↓
Kills process (SIGABRT)
      ↓
Automatic restart (Restart=on-watchdog)
```

## Configuration

### Adjusting Timeout

Edit `/etc/systemd/system/bot-lnk.service`:

```ini
# Shorter timeout (1 minute)
WatchdogSec=60

# Longer timeout (10 minutes)
WatchdogSec=600
```

Then reload:
```bash
sudo systemctl daemon-reload
sudo systemctl restart bot-lnk
```

### Disable Watchdog

```ini
# Remove or comment out these lines:
# WatchdogSec=300
# Restart=on-watchdog

# Or set Type=simple instead of Type=notify
Type=simple
```

## Testing

### Test 1: Normal Operation

```bash
sudo systemctl restart bot-lnk
journalctl -u bot-lnk -f

# Should see:
# [Watchdog] Enabled - pinging every 150s (timeout: 300s)
# ... bot runs normally ...
```

### Test 2: Watchdog Timeout (requires code change)

Temporarily disable pings to test restart:

```typescript
// In src/index.ts, comment out:
// await watchdog.notify();
```

Rebuild and restart:
```bash
npm run build
sudo systemctl restart bot-lnk

# After 5 minutes:
journalctl -u bot-lnk | grep -i watchdog
# Should see: "Watchdog timeout" and automatic restart
```

### Test 3: Graceful Shutdown

```bash
sudo systemctl stop bot-lnk

# Should see:
# 🛑 Received SIGTERM, shutting down gracefully...
```

## Troubleshooting

### "systemd-notify: command not found"

Install systemd (should already be present on systemd-based distros):
```bash
# Ubuntu/Debian
sudo apt install systemd

# Fedora/RHEL
sudo dnf install systemd
```

### Watchdog not enabling

Check environment variables:
```bash
systemctl show bot-lnk | grep WATCHDOG
# Should show: Environment=WATCHDOG_USEC=...
```

If not present, ensure service file has:
```ini
Type=notify
WatchdogSec=300
```

### Bot keeps restarting

If bot restarts every 5 minutes, watchdog pings may be failing:

1. Check logs for watchdog errors:
   ```bash
   journalctl -u bot-lnk | grep Watchdog
   ```

2. Increase timeout temporarily:
   ```ini
   WatchdogSec=600  # 10 minutes
   ```

3. Check if bot loop is actually hanging (add debug logs)

## Implementation Details

### Files Changed

- `src/systemd/watchdog.ts` - Watchdog implementation (new)
- `src/index.ts` - Integration into main loop
- `systemd/bot-lnk.service` - Updated service configuration

### Ping Frequency

- **Timeout:** `WatchdogSec` (e.g., 300s = 5 minutes)
- **Ping interval:** `WatchdogSec / 2` (e.g., 150s = 2.5 minutes)
- Follows systemd's recommendation of pinging at half the timeout

### When Pings Happen

```typescript
// After each successful bot cycle
await runBotLoop(...);
await watchdog.notify(); // ← Ping sent here

// Even after errors (bot still alive, just had issue)
catch (e) {
  await watchdog.notify(); // ← Still ping
  // ... error handling ...
}
```

## Benefits

1. **Automatic recovery** from hangs/deadlocks
2. **No manual intervention** needed for crashes
3. **Systemd integration** - standard service management
4. **Zero impact** when not using systemd
5. **Production-ready** - used by many long-running daemons

## Alternative: Manual Restart

If you don't want watchdog, you can still use systemd with auto-restart on crash:

```ini
[Service]
Type=simple  # Not 'notify'
Restart=on-failure
RestartSec=30
# No WatchdogSec
```

This restarts on crash but won't detect hangs.
