import { createChannel, createClient } from 'nice-grpc';
import {
  BuildingType,
  BuildingAction,
  ResearchAction,
  UnitsRecommendation,
  SolveRequest,
  CastleSolverServiceDefinition,
  CastleSolverServiceClient,
} from '../generated/proto/config.js';
import { config } from '../config.js';
import { CastleState } from '../game/castle.js';

// Default target levels (same as solver defaults)
export const DEFAULT_TARGETS = [
  { type: BuildingType.LUMBERJACK, level: 30 },
  { type: BuildingType.QUARRY, level: 30 },
  { type: BuildingType.ORE_MINE, level: 30 },
  { type: BuildingType.FARM, level: 30 },
  { type: BuildingType.WOOD_STORE, level: 20 },
  { type: BuildingType.STONE_STORE, level: 20 },
  { type: BuildingType.ORE_STORE, level: 20 },
  { type: BuildingType.KEEP, level: 10 },
  { type: BuildingType.ARSENAL, level: 30 },
  { type: BuildingType.LIBRARY, level: 10 },
  { type: BuildingType.TAVERN, level: 10 },
  { type: BuildingType.MARKET, level: 8 },
  { type: BuildingType.FORTIFICATIONS, level: 20 },
];

export interface SolverActions {
  nextAction?: BuildingAction;
  nextResearchAction?: ResearchAction;
  unitsRecommendation?: UnitsRecommendation;
}

export function createSolverClient(): CastleSolverServiceClient {
  const channel = createChannel(config.solverAddress);
  return createClient(CastleSolverServiceDefinition, channel);
}

export async function getNextActionsForCastle(
  client: CastleSolverServiceClient,
  castle: CastleState
): Promise<SolverActions> {
  const request: SolveRequest = {
    castleConfig: castle.config,
    targetLevels: { targets: DEFAULT_TARGETS },
  };

  try {
    const response = await client.solve(request);
    return {
      nextAction: response.nextAction,
      nextResearchAction: response.nextResearchAction,
      unitsRecommendation: response.unitsRecommendation,
    };
  } catch (e) {
    console.error(`Failed to get next action for ${castle.name}:`, e);
    return {};
  }
}
