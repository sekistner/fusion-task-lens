import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalRoutes, revisionFor } from './service.mjs';
import { effectiveConfig, fingerprint } from './settings.mjs';
import { parseDeepInfra } from './catalog.mjs';
const valid = { independentOutcomes: 1, capabilities: ['review'], uncertainty: 'medium', acceptanceCheck: 'Compare authoritative values against the displayed value.', pitfalls: [] };
async function fixture(t, run, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'task-lens-test-')); t.after(() => rm(root, { recursive: true, force: true }));
  const task = { id: 'KB-001', title: 'Synthetic review', description: 'Describe a discriminating test.', column: 'todo' };
  const settings = { enginePaused: true, executionGlobalModelId: 'sol' };
  let calls = 0; const pluginSettings = { ...effectiveConfig() };
  const host = { resolveEffectiveSettingsDetailed: async () => ({}), applyWorkflowSettingsOverlay: base => base,
    resolveExecutorSessionModel: () => ({ provider: 'openai-codex', modelId: 'gpt-6.1-sol' }) };
  const routes = createLocalRoutes({ ...options, root, project: 'demo', nativeHost: host,
    getCatalog: async () => [{ id: 'terra', billing: 'subscription', contextTokens: 500000, maxOutputTokens: 128000 }],
    run: async (...args) => { calls++; return run ? run(...args) : { text: JSON.stringify(valid), usage: { input_tokens: 100, output_tokens: 50 }, elapsedMs: 50 }; } });
  const ctx = { taskStore: { getTask: async () => ({ ...task }), getSettingsFast: async () => ({ ...settings }), getPluginStore: () => ({ getPlugin: async () => ({ settings: { ...pluginSettings } }), updatePluginSettings: async (_id, next) => Object.assign(pluginSettings, next) }) } };
  if (options.dispatchRoutingAvailable) ctx.taskStore.updateTaskAtomic = () => { throw new Error('Settings must never update a task'); };
  const request = (action, body = {}, headers = {}) => routes.find(r => r.path.endsWith('/' + action)).handler({
    params: { id: task.id }, query: { projectId: 'demo' }, headers: { host: '127.0.0.1:55482', ...headers },
    body: { revision: revisionFor(task), settingsRevision: fingerprint(effectiveConfig(pluginSettings)), ...body },
  }, ctx);
  return { task, settings, pluginSettings, request, calls: () => calls };
}
test('assessment persists separately and never changes the task or native model', async t => {
  const f = await fixture(t); const before = JSON.stringify([f.task, f.settings]);
  const result = await f.request('assess', { note: 'Prefer one test.' });
  assert.equal(result.automaticSelection, false); assert.equal(result.resolved.modelId, 'gpt-6.1-sol');
  assert.equal(result.recommendation.model, 'terra'); assert.equal(result.recommendation.conditionalOnExecutorAdmission, true);
  assert.equal(result.result.assessment.acceptanceCheck, valid.acceptanceCheck);
  assert.equal(JSON.stringify([f.task, f.settings]), before); assert.equal(f.calls(), 1);
  f.task.description = 'Changed scope';
  assert.equal((await f.request('assessment')).stale, true);
});
test('foreign origin, automatic routing and stale revision fail before a model call', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('assess', {}, { origin: 'https://foreign.invalid' })).status, 403);
  assert.equal((await f.request('assess', { automaticSelection: true })).status, 400);
  assert.equal((await f.request('assess', { revision: 'old' })).status, 409);
  f.settings.enginePaused = false;
  assert.equal((await f.request('assess')).status, 409); assert.equal(f.calls(), 0);
});
test('project settings only activate execution routing on a compatible runtime', async t => {
  const settings = { ...effectiveConfig(), automaticExecutionRouting: true };
  const unsupported = await fixture(t);
  assert.equal((await unsupported.request('settings', { settings })).status, 400);
  const supported = await fixture(t, null, { dispatchRoutingAvailable: true });
  assert.equal((await supported.request('assessment')).automaticSelection, false);
  assert.equal((await supported.request('settings', { settings })).automaticSelection, true);
  assert.equal((await supported.request('assessment')).automaticSelection, true);
  assert.equal(supported.calls(), 0);
});
test('task edit during inference discards the late assessment', async t => {
  let finish;
  const f = await fixture(t, async () => new Promise(resolve => { finish = resolve; }));
  const result = f.request('assess');
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  f.task.description = 'New task intent';
  finish({ text: JSON.stringify(valid), usage: { input_tokens: 100, output_tokens: 50 }, elapsedMs: 20 });
  assert.equal((await result).status, 409);
  assert.equal((await f.request('assessment')).result, null);
});
test('duplicate clicks are refused and cancellation aborts inference without a result', async t => {
  let started = false;
  const f = await fixture(t, async (_request, _root, signal) => new Promise((_resolve, reject) => {
    started = true; signal.addEventListener('abort', () => reject(new Error('Assessment cancelled')), { once: true });
  }));
  const pending = f.request('assess');
  while (!started) await new Promise(resolve => setImmediate(resolve));
  assert.equal((await f.request('assess')).status, 409);
  const state = await f.request('assessment');
  f.settings.enginePaused = false; // Cancel remains usable after admission changes.
  await f.request('cancel', { runId: state.running.id });
  assert.equal((await pending).status, 422); assert.equal(f.calls(), 1);
  assert.equal((await f.request('assessment')).result, null);
});
test('provider cents-per-token and promotion convert to USD per million with provenance', () => {
  const snapshot = parseDeepInfra([{ model_name: 'deepseek-ai/DeepSeek-V4.1-Flash', max_tokens: 1048576,
    pricing: { type: 'tokens', cents_per_input_token: .00002, cents_per_output_token: .00006, rate_per_input_token_cached: .03, discount: .3 } }]);
  assert.ok(Math.abs(snapshot.prices.input - .14) < 1e-9);
  assert.equal(snapshot.prices.output, .42); assert.ok(Math.abs(snapshot.prices.cacheRead - .0042) < 1e-9);
  assert.equal(snapshot.providerContextTokens, 1048576); assert.ok(snapshot.priceAsOf);
});


test('saved project defaults reach the real adapter contract and change advice', async t => {
  let received;
  const f = await fixture(t, async request => { received = request; return { text: JSON.stringify(valid), usage: { input_tokens: 12, output_tokens: 2 }, elapsedMs: 20 }; });
  const next = { ...effectiveConfig(), assessorModel: 'openai-codex/gpt-6.1-sol', guidance: 'Prioritize the acceptance check.', assessmentTimeoutSeconds: 17, assessmentInputChars: 4000, assessmentOutputTokens: 800, headroomPercent: 99 };
  const saved = await f.request('settings', { settings: next });
  assert.equal(saved.settings.assessmentTimeoutSeconds, 17);
  const result = await f.request('assess');
  assert.equal(received.model, next.assessorModel); assert.equal(received.timeoutMs, 17000); assert.equal(received.maxOutputTokens, 800);
  assert.equal(JSON.parse(received.input).projectGuidance, next.guidance);
  assert.equal(result.recommendation.model, null); // Headroom now prevents the reservation fitting.
  f.pluginSettings.guidance = 'A changed project instruction';
  assert.deepEqual((await f.request('assessment')).staleReasons, ['Project defaults changed']);
});
test('settings changes during inference invalidate the result; invalid settings never save', async t => {
  let finish;
  const f = await fixture(t, async () => new Promise(resolve => { finish = resolve; }));
  assert.equal((await f.request('settings', { settings: { ...effectiveConfig(), assessmentTimeoutSeconds: 0 } })).status, 400);
  assert.equal((await f.request('settings', { settings: { ...effectiveConfig(), automaticSelection: true } })).status, 400);
  const pending = f.request('assess'); while (!finish) await new Promise(resolve => setImmediate(resolve));
  f.pluginSettings.guidance = 'changed';
  finish({ text: JSON.stringify(valid), usage: { input_tokens: 100, output_tokens: 50 }, elapsedMs: 20 });
  assert.equal((await pending).status, 409);
  const state = await f.request('assessment'); assert.equal(state.result, null); assert.equal(state.lastFailure.usage.input_tokens, 100);
});
test('failed output target preserves the incurred usage and precise explanation', async t => {
  const f = await fixture(t, async () => { throw Object.assign(new Error('Assessment exceeded its output target; usage was already incurred.'), { receipt: { usage: { input_tokens: 100, output_tokens: 1201 }, elapsedMs: 15 } }); });
  const failure = await f.request('assess'); assert.equal(failure.status, 422); assert.match(failure.body.error, /output target/);
  assert.equal(failure.body.failure.usage.output_tokens, 1201);
  assert.equal((await f.request('assessment')).lastFailure.usage.output_tokens, 1201);
});
test('promotion expiry does not leave an expired discount marked fresh', () => {
  const data = [{ model_name: 'deepseek-ai/DeepSeek-V4.1-Flash', max_tokens: 1048576, pricing: { type: 'tokens', cents_per_input_token: .00002, cents_per_output_token: .00006, rate_per_input_token_cached: .03, discount: .3, discount_ends_at: '2026-11-15T12:00:00Z' } }];
  assert.equal(parseDeepInfra(data, '2026-11-15T11:59:59Z').promotionExpiresAt, '2026-11-15T12:00:00Z');
  const after = parseDeepInfra(data, '2026-11-15T12:00:01Z'); assert.equal(after.prices.input, .2); assert.equal(after.promotionExpiresAt, null);
});

test('manual native assessment never requires or changes the running engine state', async t => {
  const f = await fixture(t, undefined, { manual: true });
  f.settings.enginePaused = false;
  const before = JSON.stringify([f.task, f.settings]);
  const result = await f.request('assess');
  assert.equal(result.assessmentAllowed, true);
  assert.equal(result.assessorRuntime, 'Fusion native AI');
  assert.equal(result.result.assessment.independentOutcomes, 1);
  assert.equal(JSON.stringify([f.task, f.settings]), before);
  assert.equal((await f.request('assess', { automaticSelection: true })).status, 400);
});
