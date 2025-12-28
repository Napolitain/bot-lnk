import { type Channel, createChannel, createClient } from 'nice-grpc';
import { config } from '../config.js';
import { SolverError } from '../errors/index.js';
import type { CastleState } from '../game/castle.js';
import {
  type BuildingAction,
  type CastleSolverServiceClient,
  CastleSolverServiceDefinition,
  type ResearchAction,
  type SolveRequest,
  type UnitsRecommendation,
} from '../generated/proto/config.js';

export interface SolverActions {
  nextAction?: BuildingAction;
  nextResearchAction?: ResearchAction;
  unitsRecommendation?: UnitsRecommendation;
}

let channel: Channel | null = null;
let client: CastleSolverServiceClient | null = null;

export function createSolverClient(): CastleSolverServiceClient {
  if (!client) {
    channel = createChannel(config.solverAddress);
    client = createClient(CastleSolverServiceDefinition, channel);
  }
  return client;
}

export function closeSolverClient(): void {
  if (channel) {
    channel.close();
    channel = null;
    client = null;
    console.log('[Solver] gRPC channel closed');
  }
}

export async function getNextActionsForCastle(
  client: CastleSolverServiceClient,
  castle: CastleState,
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
