import type {
  UnitCount,
  UnitsRecommendation,
  UnitType,
} from '../generated/proto/config.js';

/** Castle phase: what should we do for this castle */
export enum CastlePhase {
  BUILDING = 'building',
  RECRUITING = 'recruiting',
  TRADING = 'trading',
}

/** Result of phase determination */
export interface PhaseResult {
  phase: CastlePhase;
  missingUnits: Map<UnitType, number>;
}

/** Determine what phase a castle is in based on solver response and current units */
export function determineCastlePhase(
  unitsRecommendation: UnitsRecommendation | undefined,
  currentUnits: UnitCount[] | undefined,
): PhaseResult {
  const missingUnits = new Map<UnitType, number>();

  // If build order not complete, we're in building phase
  if (!unitsRecommendation?.buildOrderComplete) {
    return { phase: CastlePhase.BUILDING, missingUnits };
  }

  // Build order complete - check if units match recommendation
  const recommendedCounts = new Map<UnitType, number>();
  for (const uc of unitsRecommendation.unitCounts) {
    recommendedCounts.set(uc.type, uc.count);
  }

  const currentCounts = new Map<UnitType, number>();
  if (currentUnits) {
    for (const uc of currentUnits) {
      currentCounts.set(uc.type, uc.count);
    }
  }

  // Check if any unit type is below recommended
  for (const [unitType, recommendedCount] of recommendedCounts) {
    const currentCount = currentCounts.get(unitType) || 0;
    if (currentCount < recommendedCount) {
      missingUnits.set(unitType, recommendedCount - currentCount);
    }
  }

  if (missingUnits.size > 0) {
    return { phase: CastlePhase.RECRUITING, missingUnits };
  }

  // All conditions met - ready for trading
  return { phase: CastlePhase.TRADING, missingUnits };
}

/** Compare current units to recommended and return deficit */
export function compareUnits(
  currentUnits: UnitCount[] | undefined,
  recommendation: UnitsRecommendation,
): Map<UnitType, { current: number; recommended: number; deficit: number }> {
  const result = new Map<
    UnitType,
    { current: number; recommended: number; deficit: number }
  >();

  const currentMap = new Map<UnitType, number>();
  if (currentUnits) {
    for (const uc of currentUnits) {
      currentMap.set(uc.type, uc.count);
    }
  }

  for (const uc of recommendation.unitCounts) {
    const current = currentMap.get(uc.type) || 0;
    const recommended = uc.count;
    result.set(uc.type, {
      current,
      recommended,
      deficit: Math.max(0, recommended - current),
    });
  }

  return result;
}
