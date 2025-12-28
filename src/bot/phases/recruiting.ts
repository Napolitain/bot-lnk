import type { Page } from 'playwright';
import { recruitUnits } from '../../browser/actions.js';
import { type UnitType, unitTypeToJSON } from '../../generated/proto/config.js';

export interface RecruitingPhaseResult {
  recruited: boolean;
}

/** Handle recruiting phase for a single castle */
export async function handleRecruitingPhase(
  page: Page,
  castleName: string,
  castleIndex: number,
  missingUnits: Map<UnitType, number>,
): Promise<RecruitingPhaseResult> {
  console.log(`\n[${castleName}] RECRUITING PHASE`);

  let recruited = false;

  for (const [unitType, missing] of missingUnits) {
    console.log(`  Recruiting ${missing}x ${unitTypeToJSON(unitType)}...`);
    const success = await recruitUnits(page, castleIndex, unitType, missing);
    if (success) {
      recruited = true;
    }
  }

  return { recruited };
}
