import { compareUnits } from '../domain/castle.js';
import type { CastleState } from '../game/castle.js';
import {
  buildingTypeToJSON,
  ResourceType,
  type UnitCount,
  type UnitsRecommendation,
  unitTypeToJSON,
} from '../generated/proto/config.js';

/** Print castle status (buildings, resources) */
export function printCastleStatus(castle: CastleState): void {
  const wood =
    castle.config.resources.find((r) => r.type === ResourceType.WOOD)?.amount ||
    0;
  const stone =
    castle.config.resources.find((r) => r.type === ResourceType.STONE)
      ?.amount || 0;
  const iron =
    castle.config.resources.find((r) => r.type === ResourceType.IRON)?.amount ||
    0;
  const food =
    castle.config.resources.find((r) => r.type === ResourceType.FOOD)?.amount ||
    0;

  console.log(
    `\n${castle.name}: (${castle.upgradeQueueCount} building(s) in queue)`,
  );
  console.log(
    `  Resources: Wood=${wood}, Stone=${stone}, Iron=${iron}, Food=${food}`,
  );
  console.log(`  Buildings:`);
  for (const bl of castle.config.buildingLevels) {
    const canUpgrade = castle.buildingCanUpgrade.get(bl.type)
      ? '[CAN UPGRADE]'
      : '';
    const status = castle.buildingUpgradeStatus.get(bl.type);
    const upgrading = status?.isUpgrading
      ? `[UPGRADING → Lv ${status.targetLevel}, ${status.timeRemaining}]`
      : '';
    console.log(
      `    - ${buildingTypeToJSON(bl.type)}: Lv ${bl.level} ${canUpgrade} ${upgrading}`,
    );
  }
}

/** Print units recommendation */
export function printUnitsRecommendation(
  castleName: string,
  rec: UnitsRecommendation,
): void {
  console.log(`\n=== ${castleName}: BUILD ORDER COMPLETE ===`);
  console.log(`Recommended Army Composition:`);
  console.log(`  Food: ${rec.totalFood}`);
  console.log(
    `  Trading throughput: ${rec.totalThroughput?.toFixed(0)} resources/hour`,
  );
  console.log(`  Silver income: ${rec.silverPerHour?.toFixed(2)}/hour`);
  console.log(`  Defense vs Cavalry: ${rec.defenseVsCavalry}`);
  console.log(`  Defense vs Infantry: ${rec.defenseVsInfantry}`);
  console.log(`  Defense vs Artillery: ${rec.defenseVsArtillery}`);
  console.log(`  Units:`);
  for (const uc of rec.unitCounts) {
    console.log(`    - ${unitTypeToJSON(uc.type)}: ${uc.count}`);
  }
}

/** Print current vs recommended units comparison */
export function printUnitComparison(
  castleName: string,
  currentUnits: UnitCount[] | undefined,
  rec: UnitsRecommendation,
): void {
  console.log(`\n=== ${castleName}: UNIT STATUS ===`);
  const comparison = compareUnits(currentUnits, rec);

  for (const [unitType, data] of comparison) {
    const status = data.deficit === 0 ? '✓' : `need ${data.deficit} more`;
    console.log(
      `  ${unitTypeToJSON(unitType)}: ${data.current}/${data.recommended} ${status}`,
    );
  }
}

/** Print cycle summary */
export function printCycleSummary(
  upgrades: number,
  recruits: number,
  trades: number,
): void {
  console.log(`\n=== Cycle Summary ===`);
  console.log(`  Building upgrades: ${upgrades}`);
  console.log(`  Unit recruitments: ${recruits}`);
  console.log(`  Trades executed: ${trades}`);
}

/** Print sleep info */
export function printSleepInfo(
  sleepMs: number,
  timeRemainingMs: number,
  freeFinishAvailable: boolean,
): void {
  if (freeFinishAvailable) {
    console.log(
      `\nBuild already under 5min (${Math.round(timeRemainingMs / 1000)}s), checking again in ${sleepMs / 1000}s`,
    );
  } else {
    console.log(
      `\nSleeping ${Math.round(sleepMs / 1000)}s until free finish available (${Math.round(timeRemainingMs / 1000)}s remaining)`,
    );
  }
}
