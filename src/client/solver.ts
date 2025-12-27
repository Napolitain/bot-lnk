import { createChannel, createClient } from 'nice-grpc';
import {
  BuildingAction,
  ResearchAction,
  UnitsRecommendation,
  SolveRequest,
  CastleSolverServiceDefinition,
  CastleSolverServiceClient,
} from '../generated/proto/config.js';
import { config } from '../config.js';
import { CastleState } from '../game/castle.js';
import { SolverError } from '../errors/index.js';

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
    targetLevels: { targets: config.targets },
  };

  try {
    const response = await client.solve(request);
    return {
      nextAction: response.nextAction,
      nextResearchAction: response.nextResearchAction,
      unitsRecommendation: response.unitsRecommendation,
    };
  } catch (e) {
    throw new SolverError(`Failed to get next action: ${e}`, castle.name);
  }
}
