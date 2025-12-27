import { Page } from 'playwright';
import { executeTrade } from '../../browser/actions.js';

export interface TradingPhaseResult {
  traded: boolean;
}

/** Handle trading phase for a single castle */
export async function handleTradingPhase(
  page: Page,
  castleName: string,
  castleIndex: number
): Promise<TradingPhaseResult> {
  console.log(`\n[${castleName}] TRADING PHASE - Ready for silver trading!`);

  const traded = await executeTrade(page, castleIndex);

  return { traded };
}
