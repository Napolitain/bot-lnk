/**
 * Browser selectors for Lords & Knights game UI elements.
 *
 * This file centralizes all DOM selectors used for navigation and actions.
 * Each selector is documented with its purpose and which view it belongs to.
 */

// ============================================================================
// TOP MENU NAVIGATION BUTTONS
// ============================================================================

/**
 * Top menu "Buildings" button - Opens per-castle buildings sidebar.
 * Use this to access individual building menus (Library, Keep, Tavern, etc.)
 * NOT the same as global buildings overview table.
 */
export const TOP_MENU_BUILDINGS = 'Buildings';

/**
 * "Current building upgrades" button - Opens global buildings overview table.
 * Shows all castles in a table with upgrade status, resources, and actions.
 * Selector type: button role with accessible name
 */
export const TOP_MENU_BUILDINGS_OVERVIEW = 'Current building upgrades';

/**
 * "Recruitment list" button - Opens global recruitment overview table.
 * Shows all castles with unit counts and recruitment actions.
 * Selector type: button role with accessible name
 */
export const TOP_MENU_RECRUITMENT_OVERVIEW = 'Recruitment list';

// ============================================================================
// GLOBAL OVERVIEW TABLES (Multi-Castle Views)
// ============================================================================

/**
 * Global buildings table - Shows all castles with buildings, resources, upgrades.
 * Access via: TOP_MENU_BUILDINGS_OVERVIEW button
 * Each row = one castle
 */
export const TABLE_BUILDINGS_GLOBAL = '.table--global-overview--buildings';

/**
 * Global recruitment table - Shows all castles with unit counts.
 * Access via: TOP_MENU_RECRUITMENT_OVERVIEW button
 * Each row = one castle
 */
export const TABLE_RECRUITMENT_GLOBAL = '.table--global-overview--recruitment';

/**
 * Castle rows in global tables (excludes header row).
 * Use with .nth(castleIndex) to select specific castle.
 */
export const TABLE_CASTLE_ROWS =
  '.tabular-row:not(.global-overview--table--header)';

/** Table header row in global overview tables */
export const TABLE_HEADER_ROW = '.global-overview--table--header';

// ============================================================================
// GLOBAL BUILDINGS TABLE - Cell Types
// ============================================================================

/**
 * Building upgrade cells in global buildings table.
 * Contains building level, upgrade button, and upgrade status.
 */
export const CELL_BUILDING_UPGRADE = '.tabular-cell--upgrade-building';

/**
 * Upgrade status cell - Shows if building is currently upgrading.
 * Has multiple .upgrade-building--cell children when upgrade is active.
 */
export const CELL_UPGRADE_STATUS = '.upgrade-building--cell';

/** Building upgrade action button */
export const BTN_BUILDING_UPGRADE = 'button.button--action';

/** Free finish button icon (instant complete for short builds) */
export const ICON_FREE_FINISH = '.icon-build-finish-free-2';

// ============================================================================
// GLOBAL RECRUITMENT TABLE - Cell Types
// ============================================================================

/**
 * Recruitment cells in global recruitment table.
 * Contains unit count display and recruitment controls.
 */
export const CELL_RECRUITMENT = '.tabular-cell--recruitment';

/** Recruitment cell wrapper */
export const CELL_RECRUITMENT_WRAPPER = '.recruitment--cell';

/** Unit count input field */
export const INPUT_RECRUITMENT = 'input.component--input';

/** Current unit count display (in recruitment cell) */
export const TEXT_UNIT_COUNT =
  '.recruitment--cell .tabular-cell--input-container .centered.last';

/** Recruitment action button */
export const BTN_RECRUITMENT = 'button.button--action';

// ============================================================================
// PER-CASTLE BUILDINGS SIDEBAR (Opened via TOP_MENU_BUILDINGS)
// ============================================================================

/**
 * Global buildings sidebar container - Shows Library, Keep, Tavern, etc.
 * Access via: TOP_MENU_BUILDINGS button
 * This is where you find building-specific menus.
 */
export const SIDEBAR_BUILDINGS_CONTAINER = '#menu-section-general-container';

/** Library button in buildings sidebar */
export const SIDEBAR_LIBRARY = 'Library';

/** Keep icon in per-castle building menu */
export const ICON_BUILDING_KEEP = '.icon-building--keep';

/** Tavern icon in per-castle building menu */
export const ICON_BUILDING_TAVERN = '.icon-building--tavern';

/** Library icon in per-castle building menu */
export const ICON_BUILDING_LIBRARY = '.icon-building--library';

/** Building menu row (clickable list element) */
export const MENU_BUILDING_ROW = '.menu-list-element-basic.clickable';

// ============================================================================
// LIBRARY MENU (Research/Technology)
// ============================================================================

/** Menu list title (section headers in building menus) */
export const MENU_LIST_TITLE = '.menu-list-title-basic';

/** Menu list element (individual items in building menus) */
export const MENU_LIST_ELEMENT = '.menu-list-element-basic';

/** Research/action button in technology rows */
export const BTN_RESEARCH = 'button.button';

// ============================================================================
// KEEP MENU (Trading)
// ============================================================================

/** Trade button in Keep menu */
export const BTN_TRADE = 'button.button--in-building-list--trade';

/** Trade dialog content section */
export const DIALOG_TRADE_CONTENT = '.menu--content-section';

/** Max button for trade sliders */
export const BTN_TRADE_MAX = '.seek-bar-increase-value--button';

// ============================================================================
// TAVERN MENU (Missions)
// ============================================================================

/** "Available missions" section title in Tavern */
export const TAVERN_MISSIONS_TITLE = 'Available missions';

// ============================================================================
// DIALOGS & OVERLAYS
// ============================================================================

/** Confirmation dialog */
export const DIALOG_CONFIRMATION = '.dialog';

/** Generic dialog action button */
export const BTN_DIALOG_ACTION = '.dialog button.button--action';

/** Alternative confirmation button selector */
export const BTN_CONFIRM_ALT = 'div:nth-child(2) > .button';

/** Generic overlays (popups, modals, dialogs) */
export const OVERLAY_GENERIC = '.overlay, .modal, .dialog';

/** Tutorial close button */
export const BTN_CLOSE_TUTORIAL = '.icon-tutorial.icon-close-button';

/** Generic close button */
export const BTN_CLOSE_GENERIC = '.icon-close-button';

// ============================================================================
// CSS CLASSES (State Indicators)
// ============================================================================

/** Disabled state class (not enough resources, action unavailable) */
export const CLASS_DISABLED = 'disabled';

/** Clickable element class */
export const CLASS_CLICKABLE = 'clickable';

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * Example: Navigate to Library
 * 1. Click TOP_MENU_BUILDINGS ("Buildings" in top menu)
 * 2. Click SIDEBAR_LIBRARY in SIDEBAR_BUILDINGS_CONTAINER
 * 3. Find technology by name in MENU_LIST_ELEMENT
 * 4. Click BTN_RESEARCH within that element
 *
 * Example: Upgrade building in global view
 * 1. Click TOP_MENU_BUILDINGS_OVERVIEW ("Current building upgrades")
 * 2. Locate TABLE_BUILDINGS_GLOBAL
 * 3. Find castle row: TABLE_BUILDINGS_GLOBAL + TABLE_CASTLE_ROWS + .nth(castleIndex)
 * 4. Find building cell: CELL_BUILDING_UPGRADE + .nth(buildingIndex)
 * 5. Click BTN_BUILDING_UPGRADE
 *
 * Example: Recruit units in global view
 * 1. Click TOP_MENU_RECRUITMENT_OVERVIEW ("Recruitment list")
 * 2. Locate TABLE_RECRUITMENT_GLOBAL
 * 3. Find castle row: TABLE_RECRUITMENT_GLOBAL + TABLE_CASTLE_ROWS + .nth(castleIndex)
 * 4. Find unit cell: CELL_RECRUITMENT + .nth(unitIndex)
 * 5. Fill INPUT_RECRUITMENT with amount
 * 6. Click BTN_RECRUITMENT
 */
