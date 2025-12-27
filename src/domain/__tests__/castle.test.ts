import { describe, it, expect } from 'vitest';
import { UnitType } from '../../generated/proto/config.js';
import { CastlePhase, determineCastlePhase, compareUnits } from '../castle.js';

describe('determineCastlePhase', () => {
  it('returns BUILDING when no units recommendation', () => {
    const result = determineCastlePhase(undefined, undefined);
    expect(result.phase).toBe(CastlePhase.BUILDING);
    expect(result.missingUnits.size).toBe(0);
  });

  it('returns BUILDING when build order not complete', () => {
    const result = determineCastlePhase(
      { buildOrderComplete: false, unitCounts: [], totalFood: 0, totalThroughput: 0, defenseVsCavalry: 0, defenseVsInfantry: 0, defenseVsArtillery: 0, silverPerHour: 0 },
      undefined
    );
    expect(result.phase).toBe(CastlePhase.BUILDING);
  });

  it('returns RECRUITING when units are missing', () => {
    const result = determineCastlePhase(
      {
        buildOrderComplete: true,
        unitCounts: [
          { type: UnitType.SPEARMAN, count: 100 },
          { type: UnitType.ARCHER, count: 50 },
        ],
        totalFood: 150,
        totalThroughput: 1000,
        defenseVsCavalry: 500,
        defenseVsInfantry: 400,
        defenseVsArtillery: 300,
        silverPerHour: 20,
      },
      [
        { type: UnitType.SPEARMAN, count: 80 },  // missing 20
        { type: UnitType.ARCHER, count: 50 },    // ok
      ]
    );
    expect(result.phase).toBe(CastlePhase.RECRUITING);
    expect(result.missingUnits.get(UnitType.SPEARMAN)).toBe(20);
    expect(result.missingUnits.has(UnitType.ARCHER)).toBe(false);
  });

  it('returns TRADING when all units meet recommendation', () => {
    const result = determineCastlePhase(
      {
        buildOrderComplete: true,
        unitCounts: [
          { type: UnitType.SPEARMAN, count: 100 },
        ],
        totalFood: 100,
        totalThroughput: 1000,
        defenseVsCavalry: 500,
        defenseVsInfantry: 400,
        defenseVsArtillery: 300,
        silverPerHour: 20,
      },
      [
        { type: UnitType.SPEARMAN, count: 100 },
      ]
    );
    expect(result.phase).toBe(CastlePhase.TRADING);
    expect(result.missingUnits.size).toBe(0);
  });

  it('returns TRADING when units exceed recommendation', () => {
    const result = determineCastlePhase(
      {
        buildOrderComplete: true,
        unitCounts: [
          { type: UnitType.SPEARMAN, count: 100 },
        ],
        totalFood: 100,
        totalThroughput: 1000,
        defenseVsCavalry: 500,
        defenseVsInfantry: 400,
        defenseVsArtillery: 300,
        silverPerHour: 20,
      },
      [
        { type: UnitType.SPEARMAN, count: 150 },  // more than needed
      ]
    );
    expect(result.phase).toBe(CastlePhase.TRADING);
  });
});

describe('compareUnits', () => {
  it('returns correct comparison data', () => {
    const result = compareUnits(
      [
        { type: UnitType.SPEARMAN, count: 80 },
        { type: UnitType.ARCHER, count: 60 },
      ],
      {
        buildOrderComplete: true,
        unitCounts: [
          { type: UnitType.SPEARMAN, count: 100 },
          { type: UnitType.ARCHER, count: 50 },
        ],
        totalFood: 150,
        totalThroughput: 1000,
        defenseVsCavalry: 500,
        defenseVsInfantry: 400,
        defenseVsArtillery: 300,
        silverPerHour: 20,
      }
    );

    const spearman = result.get(UnitType.SPEARMAN);
    expect(spearman?.current).toBe(80);
    expect(spearman?.recommended).toBe(100);
    expect(spearman?.deficit).toBe(20);

    const archer = result.get(UnitType.ARCHER);
    expect(archer?.current).toBe(60);
    expect(archer?.recommended).toBe(50);
    expect(archer?.deficit).toBe(0);  // no deficit when current > recommended
  });

  it('handles missing current units', () => {
    const result = compareUnits(
      undefined,
      {
        buildOrderComplete: true,
        unitCounts: [
          { type: UnitType.SPEARMAN, count: 100 },
        ],
        totalFood: 100,
        totalThroughput: 1000,
        defenseVsCavalry: 500,
        defenseVsInfantry: 400,
        defenseVsArtillery: 300,
        silverPerHour: 20,
      }
    );

    const spearman = result.get(UnitType.SPEARMAN);
    expect(spearman?.current).toBe(0);
    expect(spearman?.recommended).toBe(100);
    expect(spearman?.deficit).toBe(100);
  });
});
