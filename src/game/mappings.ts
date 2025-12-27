import {
  BuildingType,
  Technology,
  UnitType,
} from '../generated/proto/config.js';

// Map DOM building names to proto BuildingType
export const BUILDING_NAME_TO_TYPE: Record<string, BuildingType> = {
  'Keep': BuildingType.KEEP,
  'Arsenal': BuildingType.ARSENAL,
  'Tavern': BuildingType.TAVERN,
  'Library': BuildingType.LIBRARY,
  'Fortifications': BuildingType.FORTIFICATIONS,
  'Market': BuildingType.MARKET,
  'Farm': BuildingType.FARM,
  'Lumberjack': BuildingType.LUMBERJACK,
  'Wood store': BuildingType.WOOD_STORE,
  'Quarry': BuildingType.QUARRY,
  'Stone store': BuildingType.STONE_STORE,
  'Ore mine': BuildingType.ORE_MINE,
  'Ore store': BuildingType.ORE_STORE,
};

// Building types from header, in column order (for DOM parsing)
export const BUILDING_TYPES = [
  'Keep', 'Arsenal', 'Tavern', 'Library', 'Fortifications',
  'Market', 'Farm', 'Lumberjack', 'Wood store', 'Quarry',
  'Stone store', 'Ore mine', 'Ore store'
];

// Map BuildingType enum to column index
export const BUILDING_TYPE_TO_INDEX: Record<BuildingType, number> = {
  [BuildingType.KEEP]: 0,
  [BuildingType.ARSENAL]: 1,
  [BuildingType.TAVERN]: 2,
  [BuildingType.LIBRARY]: 3,
  [BuildingType.FORTIFICATIONS]: 4,
  [BuildingType.MARKET]: 5,
  [BuildingType.FARM]: 6,
  [BuildingType.LUMBERJACK]: 7,
  [BuildingType.WOOD_STORE]: 8,
  [BuildingType.QUARRY]: 9,
  [BuildingType.STONE_STORE]: 10,
  [BuildingType.ORE_MINE]: 11,
  [BuildingType.ORE_STORE]: 12,
  [BuildingType.BUILDING_UNKNOWN]: -1,
  [BuildingType.UNRECOGNIZED]: -1,
};

// Map Technology enum to display name for clicking
export const TECHNOLOGY_TO_NAME: Record<Technology, string> = {
  [Technology.LONGBOW]: 'Longbow',
  [Technology.CROP_ROTATION]: 'Crop rotation',
  [Technology.YOKE]: 'Yoke',
  [Technology.CELLAR_STOREROOM]: 'Cellar storeroom',
  [Technology.STIRRUP]: 'Stirrup',
  [Technology.CROSSBOW]: 'Crossbow',
  [Technology.SWORDSMITH]: 'Swordsmith',
  [Technology.HORSE_ARMOUR]: 'Horse armour',
  [Technology.TECH_UNKNOWN]: '',
  [Technology.UNRECOGNIZED]: '',
};

// Unit types from header, in column order (for DOM parsing)
// Maps to icon classes: icon-unit-1, icon-unit-2, icon-unit-101, etc.
export const UNIT_TYPES: UnitType[] = [
  UnitType.SPEARMAN,      // icon-unit-1
  UnitType.SWORDSMAN,     // icon-unit-2
  UnitType.ARCHER,        // icon-unit-101
  UnitType.CROSSBOWMAN,   // icon-unit-102
  UnitType.HORSEMAN,      // icon-unit-201 (Armoured horseman)
  UnitType.LANCER,        // icon-unit-202 (Lancer horseman)
  UnitType.HANDCART,      // icon-unit-10001
];

// Map UnitType enum to column index
export const UNIT_TYPE_TO_INDEX: Record<UnitType, number> = {
  [UnitType.SPEARMAN]: 0,
  [UnitType.SWORDSMAN]: 1,
  [UnitType.ARCHER]: 2,
  [UnitType.CROSSBOWMAN]: 3,
  [UnitType.HORSEMAN]: 4,
  [UnitType.LANCER]: 5,
  [UnitType.HANDCART]: 6,
  [UnitType.OXCART]: -1,  // Not shown in basic view
  [UnitType.UNIT_UNKNOWN]: -1,
  [UnitType.UNRECOGNIZED]: -1,
};
