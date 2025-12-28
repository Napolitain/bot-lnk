# Bot-LNK Agent Notes

## Game Views

### Buildings View (Global)
- Shows **all castles** with their resources, buildings, and upgrade status
- Best starting point for reading game state
- Single view gives complete building state for all castles
- Selector: `.table--global-overview--buildings`

### Recruitment View (Global)
- Shows **all castles** with their unit counts and recruit buttons
- Single view gives complete unit state for all castles
- Selector: `.table--global-overview--recruitment`

### Trading View (Per-Castle Dialog)
- **Not global** - opens a dialog per castle
- Reads single trade dialog state (`.menu--content-section`)
- Must open dialog for each castle to trade

## Bot Flow
1. Start on buildings view (read all castle state)
2. Process all castles for building upgrades
3. Switch to recruitment view (if any castle needs units)
4. Process all castles for recruiting
5. Switch to trading view (if any castle ready for trading)
6. Process castles for trading (opens dialog per castle)
