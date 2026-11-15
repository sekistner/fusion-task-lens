const identifier = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
const stringList = value => Array.isArray(value) && value.every(identifier);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// Validate host facts as well as model output. Bad historical data must not
// turn an impossible success rate into a confident recommendation.
export function validatePolicyInputs(assessment, candidates, policy) {
  if (!record(assessment) || !stringList(assessment.missing) || !identifier(assessment.cohort)
    || !Number.isSafeInteger(assessment.independentOutcomes) || assessment.independentOutcomes < 1
    || !stringList(assessment.capabilities) || assessment.capabilities.length === 0
    || !['low', 'medium', 'high'].includes(assessment.uncertainty)
    || !record(policy) || !identifier(policy.baseline)
    || (policy.override !== undefined && !identifier(policy.override))
    || !Number.isSafeInteger(policy.maxOutcomes) || policy.maxOutcomes < 1
    || !Number.isSafeInteger(policy.minSamples) || policy.minSamples < 1
    || !Number.isFinite(policy.targetPassRate) || policy.targetPassRate <= 0 || policy.targetPassRate >= 1
    || !Array.isArray(candidates)) throw new Error('Invalid assessment, policy, or candidate data');
  const ids = new Set();
  for (const candidate of candidates) {
    if (!record(candidate) || !identifier(candidate.id) || ids.has(candidate.id)
      || !stringList(candidate.capabilities) || !record(candidate.history)
      || !['permitted', 'authenticated', 'funded', 'available'].every(key => typeof candidate[key] === 'boolean')) {
      throw new Error('Invalid candidate data');
    }
    ids.add(candidate.id);
    for (const observed of Object.values(candidate.history)) {
      if (!record(observed) || !Number.isSafeInteger(observed.attempts) || observed.attempts < 0
        || !Number.isSafeInteger(observed.successes) || observed.successes < 0 || observed.successes > observed.attempts) {
        throw new Error('Invalid candidate history');
      }
    }
  }
}

// The caller supplies an assessment and policy resolved by the Fusion host.
// A route is advisory until it is applied at an atomic dispatch boundary.
export function selectRoute(assessment, candidates, policy) {
  validatePolicyInputs(assessment, candidates, policy);
  const candidateDecisions = candidates.map(candidate => {
    const observed = Object.hasOwn(candidate.history, assessment.cohort) ? candidate.history[assessment.cohort] : undefined;
    const samples = observed?.attempts ?? 0;
    const reasons = [];
    if (!candidate.permitted) reasons.push('not_permitted');
    if (!candidate.authenticated) reasons.push('authentication_unconfirmed');
    if (!candidate.funded) reasons.push('funding_or_limits');
    if (!assessment.capabilities.every(skill => candidate.capabilities.includes(skill))) reasons.push('unsupported_capability');
    if (policy.override && candidate.id !== policy.override) reasons.push('native_override_other');
    if (candidate.id !== policy.override) {
      if (samples < policy.minSamples) {
        if (candidate.id !== policy.baseline) reasons.push('insufficient_history');
      } else if ((observed.successes + 1) / (observed.attempts + 2) < policy.targetPassRate) {
        reasons.push('below_target');
      }
    }
    if (!candidate.available) reasons.push('model_unavailable');
    return { id: candidate.id, samples, eligible: reasons.length === 0, reasons };
  });
  const decision = result => ({ ...result, candidateDecisions });
  if (assessment.missing.length) {
    return decision({ action: 'block', reason: 'missing_prerequisite', model: null });
  }
  if (assessment.independentOutcomes > policy.maxOutcomes) {
    return decision({ action: 'decompose', reason: 'task_scope', model: null });
  }
  if (assessment.uncertainty === 'high') {
    return decision({ action: 'discovery', reason: 'uncertain_scope', model: null });
  }
  const selected = candidateDecisions.find(candidate => candidate.eligible);
  if (!selected) {
    return decision({
      action: 'block',
      reason: candidateDecisions.some(candidate => candidate.reasons.length === 1 && candidate.reasons[0] === 'model_unavailable')
        ? 'model_unavailable' : 'no_qualified_model',
      model: null,
    });
  }
  return decision({
    action: 'route',
    reason: policy.override ? 'native_override'
      : selected.samples >= policy.minSamples ? 'historical_fit' : 'configured_baseline',
    model: selected.id,
    samples: selected.samples,
  });
}

export const phases = ['intake', 'assess', 'route', 'dispatch', 'execute', 'verify', 'close'];
export const states = ['active', 'waiting', 'blocked', 'unknown', 'done'];
export const reasons = [
  'assessment', 'selection', 'worker_start', 'agent_work', 'ci_queue', 'ci_execution',
  'missing_prerequisite', 'runner_capacity', 'task_scope', 'reasoning_gap',
  'no_progress', 'heartbeat_expired', 'verified',
];

// Points describe state after a transition. A task may revisit phases or wait inside one.
export function summarize(points, until) {
  const totals = {};
  const intervals = [];
  let repeats = 0;
  let lastResult;
  let lastAttempt = 0;
  const evidenceSeen = new Set();
  for (const [index, point] of points.entries()) {
    const end = points[index + 1]?.at ?? until;
    if (!phases.includes(point.phase) || !states.includes(point.state)
      || !reasons.includes(point.reason) || !Number.isSafeInteger(point.at)
      || !Number.isSafeInteger(end) || point.at < 0 || end < point.at || end > until) {
      throw new Error('Invalid lifecycle transition');
    }
    if (point.state === 'done') {
      if (index !== points.length - 1) throw new Error('Transition after terminal state');
      continue;
    }
    const duration = end - point.at;
    const key = point.state === 'active' || point.state === 'unknown'
      ? point.state : point.reason;
    totals[key] = (totals[key] ?? 0) + duration;
    if (point.state !== 'done') intervals.push({ ...point, end });
    if (point.result && point.attempt > lastAttempt) {
      // A host-provided evidence snapshot is required to assert no progress.
      // Missing evidence means unknown, not proof that nothing changed.
      const evidence = point.acceptanceEvidence;
      const known = Array.isArray(evidence) && evidence.every(ref => typeof ref === 'string' && ref.length > 0);
      const progressed = known && evidence.some(ref => !evidenceSeen.has(ref));
      repeats = !known || progressed ? 0 : point.result === lastResult ? repeats + 1 : 1;
      if (known) evidence.forEach(ref => evidenceSeen.add(ref));
      lastResult = point.result;
      lastAttempt = point.attempt;
    }
  }
  return {
    intervals,
    totals,
    checkpointRequired: repeats >= 2,
    state: points.at(-1)?.state ?? 'unknown',
  };
}

// A dormant or disconnected attempt keeps its last confirmed progress boundary.
export function expireHeartbeat(points, lastHeartbeat, timeout, now) {
  const last = points.at(-1);
  if (!last || last.state !== 'active' || now - lastHeartbeat < timeout) return points;
  if (lastHeartbeat < last.at) throw new Error('Heartbeat precedes active interval');
  return [...points, { at: lastHeartbeat, phase: last.phase, state: 'unknown', reason: 'heartbeat_expired' }];
}
