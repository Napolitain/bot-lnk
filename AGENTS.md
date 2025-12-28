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

## Bot Flow
1. Start on buildings view (read all castle state)
2. Process all castles for building upgrades
3. Switch to recruitment view (if any castle needs units)
4. Process all castles for recruiting
5. Switch to trading view (if any castle ready)
6. Process castles for trading

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
