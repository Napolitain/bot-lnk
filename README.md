# Bot-LNK

A Playwright-based automation bot for **Lords and Knights** browser game. Integrates with solver-lnk for intelligent build order optimization.

## Features

- **Browser Automation**: Playwright-based, headful or headless
- **Smart Building**: Uses gRPC solver for optimal build order
- **Multi-Castle Support**: Handles multiple castles efficiently
- **Resilient**: Auto-recovery from errors, popup dismissal, health checks
- **Session Persistence**: Maintains login across restarts
- **Performance Metrics**: Optional CDP-based metrics collection for memory, CPU, and network monitoring

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Protocol Buffers compiler (`protoc`)
- solver-lnk gRPC server running

### Installation

```bash
# Clone with submodules
git clone --recursive git@github.com:Napolitain/bot-lnk.git
cd bot-lnk

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Generate protobuf TypeScript code
npm run proto:generate

# Build
npm run build
```

### Configuration

Create `.env` file or set environment variables:

```bash
# Required
EMAIL=your-game-email
PASSWORD=your-game-password

# Optional
SOLVER_HOST=localhost:50051    # gRPC solver address
HEADLESS=false                 # Run browser headless
DRY_RUN=false                  # Don't perform actions, just log
BLOCK_MEDIA=false              # Block images/fonts/media for RAM savings
ENABLE_METRICS=false           # Collect performance metrics (memory, CPU, network)
MAX_BUILDING_QUEUE=1           # Max buildings in queue
```

For detailed metrics documentation, see [docs/METRICS.md](docs/METRICS.md).

### Running

```bash
# Start solver-lnk server first (in another terminal)
cd ../solver-lnk && ./server

# Run the bot
npm start

# Run with existing logs (don't clean)
npm run start:keep-logs

# Build only
npm run build
```

## Project Structure

```
bot-lnk/
├── src/
│   ├── index.ts              # Entry point, main loop
│   ├── config.ts             # Configuration from env
│   │
│   ├── bot/                  # Core bot logic
│   │   ├── loop.ts           # Main game loop
│   │   ├── display.ts        # Console output
│   │   └── phases/           # Phase handlers
│   │       ├── building.ts   # Building upgrades
│   │       ├── recruiting.ts # Unit recruitment
│   │       └── trading.ts    # Trading
│   │
│   ├── browser/              # Playwright interactions
│   │   ├── actions.ts        # Game actions (upgrade, recruit)
│   │   ├── gameHealth.ts     # Health checks & recovery
│   │   ├── navigation.ts     # View switching
│   │   ├── popups.ts         # Popup dismissal
│   │   └── login.ts          # Login flow
│   │
│   ├── game/                 # DOM scraping
│   │   ├── castle.ts         # Castle/building state
│   │   ├── units.ts          # Unit counts
│   │   └── mappings.ts       # Game constants
│   │
│   ├── domain/               # Pure game logic
│   │   └── castle.ts         # Phase determination
│   │
│   ├── client/               # External services
│   │   └── solver.ts         # gRPC client
│   │
│   ├── metrics/              # Performance monitoring
│   │   ├── types.ts          # Metric interfaces
│   │   ├── collector.ts      # CDP-based collector
│   │   ├── reporter.ts       # Formatting & reporting
│   │   └── index.ts          # Main exports
│   │
│   ├── resilience/           # Recovery utilities
│   │   ├── core.ts           # Retry, polling
│   │   └── types.ts          # Interfaces
│   │
│   └── utils/                # General utilities
│
├── proto/                    # Submodule → proto-lnk
├── docs/                     # Documentation
│   └── METRICS.md            # Performance metrics guide
├── package.json
└── tsconfig.json
```

## Bot Flow

1. **Login** → Handle server selection, remember-me
2. **Buildings View** → Read all castle states
3. **Building Phase** → Upgrade recommended buildings (all castles)
4. **Recruitment View** → Read unit counts
5. **Recruiting Phase** → Recruit missing units (if buildings complete)
6. **Trading View** → Execute trades (if units complete)
7. **Sleep** → Wait for free finish or next cycle

## Development

### Commands Reference

```bash
# Install dependencies
npm install

# Generate protobuf TypeScript
npm run proto:generate

# Build TypeScript
npm run build

# Run (cleans logs first)
npm start

# Run without cleaning logs
npm run start:keep-logs

# Clean error screenshots and debug dumps
npm run clean:logs

# Type check only
npx tsc --noEmit

# Lint (if configured)
npm run lint
```

### Proto Submodule

The `proto/` folder is a git submodule pointing to `proto-lnk`. To update:

```bash
cd proto
git pull origin master
cd ..
npm run proto:generate
git add proto src/generated
git commit -m "chore: update proto"
```

## Debug Output

Error screenshots and HTML dumps are saved to:
- `~/.bot-lnk-session/error-screenshots/`
- `~/.bot-lnk-session/debug-dumps/`

Clean with: `npm run clean:logs`

## License

MIT
