import { expireHeartbeat, summarize } from './policy.mjs';
import { previewSelection } from './selector.mjs';

const allowed = {
  permitted: true, authenticated: true, funded: true, available: true,
  billing: 'subscription', quota: 'ready', contextTokens: 500_000,
};
const models = [
  {
    ...allowed, id: 'terra', maxOutputTokens: 128_000, capabilities: ['implementation', 'cross_service'],
    history: { routine: { successes: 27, attempts: 30 }, cross_service: { successes: 10, attempts: 16 } },
  },
  {
    ...allowed, id: 'sol', maxOutputTokens: 16_384, capabilities: ['implementation', 'cross_service'],
    history: { routine: { successes: 14, attempts: 15 }, cross_service: { successes: 18, attempts: 20 } },
  },
];
const routine = {
  cohort: 'routine', independentOutcomes: 1, capabilities: ['implementation'],
  uncertainty: 'low', missing: [],
};
const crossService = { ...routine, cohort: 'cross_service', capabilities: ['cross_service'] };
const point = (at, phase, state, reason, extra = {}) => ({ at, phase, state, reason, ...extra });
export function runScenarios(settings) {
  const route = assessment => previewSelection(assessment, models, 10_000, settings).route;
  const ci = [
    point(0, 'execute', 'active', 'agent_work'),
    point(8, 'verify', 'waiting', 'ci_queue'),
    point(38, 'verify', 'waiting', 'ci_execution'),
    point(45, 'close', 'done', 'verified'),
  ];
  const slowBuild = [ci[0], ci[1], point(10, 'verify', 'waiting', 'ci_execution'), ci[3]];
  const repeated = [
    point(0, 'verify', 'active', 'agent_work'),
    point(4, 'verify', 'active', 'no_progress', { attempt: 1, result: 'same-check', acceptanceEvidence: [] }),
    point(8, 'assess', 'active', 'no_progress', { attempt: 2, result: 'same-check', acceptanceEvidence: [] }),
    point(10, 'route', 'active', 'reasoning_gap'),
  ];
  const lost = expireHeartbeat([point(0, 'execute', 'active', 'agent_work')], 9, 3, 12);
  return {
    oversized: { route: route({ ...routine, independentOutcomes: 3 }) },
    slowCi: { route: route(routine), ...summarize(ci, 45) },
    slowBuild: { route: route(routine), ...summarize(slowBuild, 45) },
    capacity: {
      route: route({ ...routine, missing: ['eligible-gpu-runner'] }),
      ...summarize([point(0, 'dispatch', 'blocked', 'runner_capacity')], 20),
    },
    retry: { initial: route(routine), revised: route(crossService), ...summarize(repeated, 10) },
    workerLost: { route: route(routine), ...summarize(lost, 12) },
  };
}
