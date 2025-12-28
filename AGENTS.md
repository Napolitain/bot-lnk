# Bot-LNK Agent Notes

## Architecture

```
src/
├── index.ts              # Entry point, browser setup, main loop, stale detection
├── config.ts             # Configuration from env
│
├── resilience/           # Generic recovery primitives (no game/Playwright deps)
│   ├── types.ts          # Interfaces: HealthCheckResult, RecoveryAction, etc.
│   ├── core.ts           # Generic functions: pollUntil, retry, escalatingRecovery
│   └── index.ts          # Exports
│
├── bot/                  # Core game logic (orchestration)
│   ├── loop.ts           # Main bot cycle
│   ├── display.ts        # Console output
│   └── phases/           # Phase handlers (building, recruiting, trading)
│
├── browser/              # Playwright interactions
│   ├── actions.ts        # Game actions (upgrade, recruit, etc.)
│   ├── gameHealth.ts     # Game-specific health checks & recovery actions
│   ├── navigation.ts     # View switching
│   ├── popups.ts         # Popup dismissal
│   └── login.ts          # Login flow
│
├── game/                 # DOM scraping → typed state
│   ├── castle.ts         # Castle/building state
│   ├── units.ts          # Unit counts
│   └── mappings.ts       # Game constants
│
├── domain/               # Pure game logic (no I/O)
│   └── phase.ts          # Phase determination
│
├── client/               # External services
│   └── solver.ts         # gRPC client
│
└── utils/                # General utilities
```

## Separation of Concerns

| Layer | Responsibility | Dependencies |
|-------|---------------|--------------|
| `resilience/` | Generic retry/poll/recovery patterns | None (pure) |
| `browser/gameHealth.ts` | Game-specific health & recovery | resilience, Playwright |
| `bot/` | Game flow orchestration | browser, game, domain |
| `game/` | Scrape DOM → typed state | Playwright |
| `domain/` | Pure game decisions | None |

## Game Views

### Buildings View (Global)
- Shows **all castles** with resources, buildings, upgrade status
- Best starting point for reading game state
- Selector: `.table--global-overview--buildings`

### Recruitment View (Global)
- Shows **all castles** with unit counts and recruit buttons
- Selector: `.table--global-overview--recruitment`

### Trading View (Per-Castle Dialog)
- **Not global** - opens a dialog per castle
- Selector: `.menu--content-section`

---

## Current Bot Flow (Detailed)

### Main Loop (`bot/loop.ts`)

```
1. STARTUP
   ├── Check URL, navigate to lordsandknights.com if needed
   ├── Dismiss popups
   ├── Login (handles server selection)
   └── Health check (non-blocking)

2. BUILDINGS PHASE (all castles first)
   ├── Navigate to buildings view
   ├── Read all castle states (getCastles)
   ├── Click free finish buttons
   │
   └── For each castle:
       ├── Call solver (getNextActionsForCastle)
       ├── If buildOrderComplete → queue for recruitment
       └── Else → try upgrade (handleBuildingPhase)
           ├── Skip if queue full (maxBuildingQueue)
           ├── Check if building canUpgrade
           ├── Check button not disabled (CSS class)
           ├── Click upgrade button
           ├── Handle confirmation dialog
           └── Verify upgrade started

3. RECRUITMENT PHASE (only castles with complete buildings)
   ├── Navigate to recruitment view
   ├── Read all unit counts (getUnits)
   │
   └── For each castle needing units:
       ├── Compare current vs recommended units
       ├── If missingUnits → recruit (handleRecruitingPhase)
       │   ├── For each missing unit type:
       │   │   ├── Fill input with amount
       │   │   ├── Check button not disabled
       │   │   └── Click recruit
       └── Else → queue for trading

4. TRADING PHASE (only castles with complete units)
   ├── Navigate to trading view
   │
   └── For each castle ready for trading:
       ├── Click castle's trade button
       ├── Wait for dialog
       ├── Click "Max" buttons
       └── Click confirm/send

5. SLEEP
   ├── Calculate based on min upgrade time remaining
   └── Wait for free finish threshold
```

### What Works ✅

| Feature | Status | Notes |
|---------|--------|-------|
| Login | ✅ Works | Handles server selection, remember-me |
| Buildings view scraping | ✅ Works | All castles, resources, levels, upgrade status |
| Solver integration | ✅ Works | gRPC client, deterministic results |
| Building upgrades | ✅ Works | Clicks upgrade, handles confirmation |
| Disabled button detection | ✅ Works | Checks CSS `disabled` class |
| Free finish buttons | ✅ Works | Clicks available free finishes |
| Popup dismissal | ✅ Works | Tutorial overlays, close buttons |
| Health checks | ✅ Works | Overlay detection, page state |
| Recovery | ✅ Works | Escalating: popups → reload → reset |
| Research | ✅ Works | Technology research in library |

### What Partially Works ⚠️

| Feature | Status | Notes |
|---------|--------|-------|
| Recruitment | ⚠️ Partial | Clicks work, but input filling may be flaky |
| Unit count reading | ⚠️ Partial | Works but verification after recruit is minimal |
| Stale detection | ⚠️ Partial | Implemented but may need tuning |

### What Doesn't Work / Not Implemented ❌

| Feature | Status | Notes |
|---------|--------|-------|
| Trading | ❌ Untested | Dialog interaction may be incomplete |
| Multi-castle trading | ❌ Unknown | Trading view is per-castle dialog |
| Attack/Defense | ❌ Not implemented | No combat features |
| Alliance features | ❌ Not implemented | |
| Map interactions | ❌ Not implemented | |

---

## Key Implementation Details

### Button Click Pattern
```typescript
// 1. Check CSS disabled class (game uses class, not attribute)
const hasDisabledClass = await btn.evaluate(el => el.classList.contains('disabled'));
if (hasDisabledClass) {
  console.warn('Button disabled - skipping');
  return false;
}

// 2. Check HTML disabled attribute
if (!await btn.isEnabled()) {
  return false;
}

// 3. Click
await btn.click();
```

### Popup Detection
```typescript
// Tutorial overlays
'.icon-tutorial.icon-close-button'

// Generic close buttons
'.icon-close-button'

// Blocking overlays (health check)
'.overlay, .modal, .dialog'
```

### Sleep Calculation
```typescript
// Sleep until free finish is available
sleepMs = minTimeRemainingMs - freeFinishThresholdMs;
sleepMs = clamp(sleepMs, minMs, maxMs);
```

---

## Recovery Guidelines

### Principle: Keep core logic clean
- Core loop focuses on game logic only
- Recovery happens via `withRecovery()` wrapper
- Health checks use `waitForHealthy()` with game-specific checkers

### Recovery Actions (in order)
1. `dismiss_popups` - Try dismissing overlays
2. `wait_and_retry` - Wait 3s, dismiss popups
3. `reload_page` - Full page reload
4. `navigate_home` - Go to game homepage
5. `full_reset` - Clear cookies, start fresh

### Stale Data Detection
- Tracked at main loop level using `checkStale()`
- Compares state snapshots between cycles
- Triggers `forceRefresh()` if state unchanged after expected time

---

## Known Issues / TODOs

1. **Trading not fully tested** - Dialog flow may need adjustment
2. **Recruitment verification** - Only checks health, not actual unit increase
3. **Multi-castle coordination** - Currently sequential, could be smarter
4. **Resource waiting** - Bot skips if disabled, could wait for resources
5. **Research timing** - Only researches for first castle
