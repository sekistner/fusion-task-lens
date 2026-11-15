import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import plugin from './plugin.mjs';
import { expireHeartbeat, selectRoute, summarize } from './policy.mjs';
import { postTrace, traceFor } from './otlp.mjs';
import { assessAndRecommend, assessWithModel, previewSelection } from './selector.mjs';

const scenarios = await plugin.routes[0].handler();

test('scope and infrastructure prerequisites produce advisory recommendations', () => {
  assert.equal(scenarios.oversized.route.action, 'decompose');
  assert.equal(scenarios.oversized.route.model, null);
  assert.equal(scenarios.capacity.route.action, 'block');
  assert.equal(scenarios.capacity.totals.runner_capacity, 20);
});

test('project settings affect the plugin preview', async () => {
  const changed = await plugin.routes[0].handler({}, { settings: { headroomPercent: 99 } });
  assert.equal(changed.slowCi.route.action, 'block');
  assert.equal(scenarios.slowCi.route.model, 'terra');
});

test('CI delay is attributed separately and preserves the routine route', () => {
  assert.equal(scenarios.slowCi.route.model, 'terra');
  assert.deepEqual(scenarios.slowCi.totals, { active: 8, ci_queue: 30, ci_execution: 7 });
  assert.deepEqual(scenarios.slowBuild.totals, { active: 8, ci_queue: 2, ci_execution: 35 });
  const waiting = [{ at: 8, phase: 'verify', state: 'waiting', reason: 'ci_queue' }];
  assert.equal(expireHeartbeat(waiting, 8, 3, 38), waiting);
});

test('repeated outcomes need reassessment and corroborated reasoning evidence changes the route', () => {
  assert.equal(scenarios.retry.checkpointRequired, true);
  assert.equal(scenarios.retry.initial.model, 'terra');
  assert.equal(scenarios.retry.revised.model, 'sol');
});

test('native overrides still require capability, permission, budget, and availability', () => {
  const assessment = { missing: [], independentOutcomes: 1, cohort: 'routine', uncertainty: 'low', capabilities: ['code'] };
  const model = {
    id: 'sol', permitted: true, authenticated: true, funded: true, available: true, capabilities: ['code'], history: {},
  };
  const policy = { override: 'sol', baseline: 'terra', maxOutcomes: 2, minSamples: 12, targetPassRate: 0.8 };
  assert.equal(selectRoute(assessment, [model], policy).reason, 'native_override');
  assert.equal(selectRoute(assessment, [{ ...model, funded: false }], policy).action, 'block');
  assert.equal(selectRoute(assessment, [{ ...model, available: false }], policy).reason, 'model_unavailable');
});

test('an expired heartbeat leaves unobserved time unknown', () => {
  assert.equal(scenarios.workerLost.state, 'unknown');
  assert.deepEqual(scenarios.workerLost.totals, { active: 9, unknown: 3 });
});

test('the configured assessor receives bounded free text and cannot return a model override', async () => {
  const assessment = await assessWithModel(async request => {
    assert.equal(request.model, 'openai-codex/gpt-6.1-sol');
    assert.equal(request.maxOutputTokens, 1200);
    assert.equal(request.timeoutMs, 30_000);
    assert.deepEqual(request.tools, []);
    assert.equal(JSON.parse(request.input).operatorNote, 'Prefer a narrow test.');
    return JSON.stringify({
      independentOutcomes: 1, capabilities: ['implementation'], uncertainty: 'medium',
      acceptanceCheck: 'Focused tests pass', pitfalls: ['Stale generated files'], model: 'unapproved',
    });
  }, { assessorModel: 'openai-codex/gpt-6.1-sol' }, 'Update the generated files.', 'Prefer a narrow test.');
  assert.equal(assessment.acceptanceCheck, 'Focused tests pass');
  assert.equal('model' in assessment, false);
  await assert.rejects(
    assessWithModel(() => assert.fail('must not dispatch'), { assessmentInputChars: 30 }, 'a'.repeat(31)),
    /input exceeds limit/,
  );
});

test('price and limits constrain only the eligible models and subscriptions need quota', () => {
  const assessment = { missing: [], independentOutcomes: 1, cohort: 'routine', uncertainty: 'low', capabilities: ['implementation'] };
  const allowed = {
    permitted: true, authenticated: true, funded: true, available: true,
    capabilities: ['implementation'], history: { routine: { successes: 16, attempts: 16 } },
    contextTokens: 128_000, maxOutputTokens: 16_384,
  };
  const terra = { ...allowed, id: 'terra', billing: 'subscription', quota: 'unknown' };
  const flash = { ...allowed, id: 'flash', billing: 'metered', priceFresh: true, prices: { input: 0.20, output: 0.60 } };
  const catalog = [terra, flash];
  const blocked = previewSelection(assessment, catalog, 10_000);
  assert.equal(blocked.route.action, 'block');
  assert.equal(blocked.candidates[0].estimate.reason, 'subscription_quota');
  assert.equal(blocked.candidates[1].estimate.estimatedUsd, 0.0069152);
  assert.equal(previewSelection(assessment, catalog, 10_000, { paidRequestLimitUsd: 0.02 }).route.model, 'flash');
  assert.equal(previewSelection(assessment, catalog, 100_000, { paidRequestLimitUsd: 0.02 }).candidates[1].estimate.reason, 'token_limit');
  assert.equal(previewSelection(assessment, [{ ...flash, priceFresh: false }], 10_000,
    { paidRequestLimitUsd: 0.02 }).candidates[0].estimate.reason, 'price_unknown');
});

test('assessor output drives routing but cannot override observed admission facts', async () => {
  const input = {
    task: 'Diagnose the cross-service timeout.', facts: { cohort: 'cross_service', missing: ['eligible-runner'] },
    inputTokens: 10_000, catalog: [],
  };
  const result = await assessAndRecommend(async () => JSON.stringify({
    independentOutcomes: 1, capabilities: ['cross_service'], uncertainty: 'low',
    acceptanceCheck: 'Timeout test passes', pitfalls: [], missing: [],
  }), input);
  assert.equal(result.assessment.capabilities[0], 'cross_service');
  assert.equal(result.route.reason, 'missing_prerequisite');
});

test('OTLP JSON survives a local HTTP round trip without assessment or task contents', async t => {
  let request;
  let rejectedSpans = 0;
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    request = { path: req.url, type: req.headers['content-type'], body: JSON.parse(body) };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ partialSuccess: { rejectedSpans } }));
  });
  t.after(() => server.close());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const endpoint = 'http://127.0.0.1:' + server.address().port + '/v1/traces';
  const intervals = scenarios.slowCi.intervals.map(interval => ({ ...interval, privateTaskText: 'omit me' }));
  const { traceId, payload } = traceFor(intervals, 1_700_000_000_000);
  await postTrace(endpoint, payload);
  const spans = request.body.resourceSpans[0].scopeSpans[0].spans;
  assert.equal(request.path, '/v1/traces');
  assert.equal(request.type, 'application/json');
  assert.equal(spans.length, 4);
  assert.ok(spans.every(span => span.traceId === traceId));
  assert.ok(spans.slice(1).every(span => span.parentSpanId === spans[0].spanId));
  assert.equal(BigInt(spans[2].endTimeUnixNano) - BigInt(spans[2].startTimeUnixNano), 30n * 60_000_000_000n);
  assert.doesNotMatch(JSON.stringify(request), /omit me|privateTaskText|terra/);
  rejectedSpans = 1;
  await assert.rejects(postTrace(endpoint, payload), /rejected spans/);
});


test('closed tasks stop accumulating elapsed time and reject later transitions', () => {
  const points = [
    { at: 0, phase: 'execute', state: 'active', reason: 'agent_work' },
    { at: 5, phase: 'close', state: 'done', reason: 'verified' },
  ];
  assert.deepEqual(summarize(points, 65).totals, { active: 5 });
  assert.throws(() => summarize([...points, { ...points[0], at: 6 }], 65), /after terminal/);
});

test('new or unknown acceptance evidence prevents a no-progress diagnosis', () => {
  const points = [1, 2].map(attempt => ({
    at: attempt, phase: 'verify', state: 'active', reason: 'no_progress',
    attempt, result: 'same-check', acceptanceEvidence: [],
  }));
  assert.equal(summarize(points, 3).checkpointRequired, true);
  assert.equal(summarize([points[0], { ...points[1], acceptanceEvidence: ['test:passed'] }], 3).checkpointRequired, false);
  assert.equal(summarize(points.map(({ acceptanceEvidence, ...point }) => point), 3).checkpointRequired, false);
});

test('an uncalibrated configured baseline is not described as Fusion native selection', () => {
  const assessment = { missing: [], independentOutcomes: 1, cohort: 'routine', uncertainty: 'low', capabilities: ['code'] };
  const candidate = { id: 'terra', permitted: true, authenticated: true, funded: true, available: true, capabilities: ['code'], history: {} };
  const policy = { baseline: 'terra', maxOutcomes: 2, minSamples: 12, targetPassRate: 0.8 };
  assert.equal(selectRoute(assessment, [candidate], policy).reason, 'configured_baseline');
});

test('malformed history and impossible confidence settings fail explicitly', () => {
  const assessment = { missing: [], independentOutcomes: 1, cohort: 'routine', uncertainty: 'low', capabilities: ['code'] };
  const candidate = { id: 'terra', permitted: true, authenticated: true, funded: true, available: true, capabilities: ['code'], history: { routine: { successes: 50, attempts: 12 } } };
  const policy = { baseline: 'terra', maxOutcomes: 2, minSamples: 12, targetPassRate: 0.8 };
  assert.throws(() => selectRoute(assessment, [candidate], policy), /Invalid candidate history/);
  assert.throws(() => selectRoute({ ...assessment, missing: undefined }, [], policy), /Invalid assessment/);
  assert.throws(() => previewSelection(assessment, [], 100, { targetPassPercent: 100 }), /Invalid selector/);
  assert.throws(() => previewSelection(assessment, [], 100, { baseline: 42 }), /Invalid assessment/);
  assert.throws(() => previewSelection(assessment, [], 100, {}, 42), /Invalid assessment/);
});

test('candidate explanations distinguish history, capability and availability', () => {
  const assessment = { missing: [], independentOutcomes: 1, cohort: 'routine', uncertainty: 'low', capabilities: ['code'] };
  const candidate = { id: 'terra', permitted: true, authenticated: true, funded: true, available: true, capabilities: ['code'], history: {} };
  const policy = { baseline: 'terra', maxOutcomes: 2, minSamples: 12, targetPassRate: 0.8 };
  const result = selectRoute(assessment, [candidate, { ...candidate, id: 'other', capabilities: [], available: false }], policy);
  assert.equal(result.model, 'terra');
  assert.deepEqual(result.candidateDecisions[1], {
    id: 'other', samples: 0, eligible: false,
    reasons: ['unsupported_capability', 'insufficient_history', 'model_unavailable'],
  });
});

test('same-attempt duplicate events cannot create a no-progress checkpoint', () => {
  const point = { at: 1, phase: 'verify', state: 'active', reason: 'no_progress', attempt: 1, result: 'same', acceptanceEvidence: [] };
  assert.equal(summarize([point, { ...point, at: 2 }], 3).checkpointRequired, false);
});
