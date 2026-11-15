import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { renameSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assessWithModel } from '../selector.mjs';
import { runCodexAssessment, assessorModels } from './assessor.mjs';
import { catalogSnapshot } from './catalog.mjs';
import { effectiveConfig, fingerprint, preferenceAdvice, pluginId } from './settings.mjs';
import { bindingFor, reviewFor, observeSource, checkSpec } from './discovery.mjs';
import { journal, operations } from './journal.mjs';
export const revisionFor = task => fingerprint([task.id, task.title, task.description, task.prompt, task.column, task.modelProvider, task.modelId, task.executionMode, task.assignedAgentId, bindingFor(task), reviewFor(task)]);
const scopeFor = task => fingerprint([task.id, task.title, task.description, task.prompt, bindingFor(task)]);
const fail = (status, message) => Object.assign(new Error(message), { status });
export function createLocalRoutes({ root = process.env.FUSION_TASK_LENS_LOCAL_ROOT, project = process.env.FUSION_TASK_LENS_PROJECT_ID, run = runCodexAssessment, nativeHost, nativeModule, manual = false, origin = 'http://127.0.0.1:55482', getCatalog = catalogSnapshot, allowedCheckoutRoots = manual ? [] : root ? [join(root, 'project')] : [] } = {}) {
  if (!root || !project) return [];
  const running = operations(root, project); let nativePromise, savingSettings = false;
  const native = () => nativeHost ? Promise.resolve(nativeHost) : nativePromise ??= import(pathToFileURL(nativeModule || join(root, 'install/node_modules/@runfusion/fusion/dist/task-lens-native.mjs')).href);
  async function context(req, ctx, { requirePause = false, readConfig = true, readSource = readConfig, sourceSignal, sourceBudget } = {}) {
    if ((!manual && req.headers?.host !== new URL(origin).host) || (req.headers?.origin && req.headers.origin !== origin)) throw fail(403, 'Fusion origin does not match this installation');
    if ((req.query?.projectId ?? req.body?.projectId) !== project || (req.body?.projectId && req.body.projectId !== project)) throw fail(403, 'Project is not enabled for assessment');
    const id = req.params.id;
    if (!/^[A-Z0-9-]{1,50}$/.test(id)) throw fail(400, 'Invalid task identifier');
    const task = await ctx.taskStore.getTask(id);
    const host = await native();
    const settings = host.applyWorkflowSettingsOverlay(await ctx.taskStore.getSettingsFast(), await host.resolveEffectiveSettingsDetailed(ctx.taskStore, { id }));
    if (requirePause && !manual && settings.enginePaused !== true) throw fail(409, 'Pause the disposable Fusion engine before assessing.');
    let config;
    if (readConfig) {
      const stored = (await ctx.taskStore.getPluginStore().getPlugin(pluginId)).settings;
      try { config = effectiveConfig(stored); } catch (error) { throw fail(400, 'Invalid project defaults: ' + error.message + '. Correct them in Settings → Advanced settings → Plugins → Fusion Task Lens.'); }
    }
    const source = readSource ? await sourceRead(task, sourceSignal, sourceBudget) : null;
    return { task, settings, host, config, source, settingsRevision: config && fingerprint(config), revision: revisionFor(task) };
  }
  async function sourceRead(task, signal, budget) {
    if (signal?.aborted) throw fail(409, 'Assessment cancelled');
    if (budget && budget.remaining <= 0) throw fail(409, 'Source validation exceeded its shared 10-second budget');
    const start = Date.now();
    try { return await observeSource(task, { allowedCheckoutRoots, signal, timeoutMs: budget?.remaining ?? 10000 }); }
    finally { if (budget) budget.remaining -= Date.now() - start; }
  }
  const filename = (id, suffix = '') => join(root, 'assessments', `${project}-${id}${suffix}.json`);
  async function read(id, suffix) { try { return JSON.parse(await readFile(filename(id, suffix), 'utf8')); } catch { return null; } }
  async function persist(id, value, suffix, beforeCommit = () => {}) {
    await mkdir(join(root, 'assessments'), { recursive: true, mode: 0o700 });
    const temp = filename(id, suffix) + '.' + randomUUID();
    await writeFile(temp, JSON.stringify(value), { mode: 0o600 });
    try {
      await beforeCommit();
      // No event-loop turn between the cancellation check above and publication.
      renameSync(temp, filename(id, suffix));
    } finally { await rm(temp, { force: true }); }
  }
  async function snapshot(req, ctx, refresh = false, capturedContext) {
    const { task, settings, host, config, revision, settingsRevision, source } = capturedContext ?? await context(req, ctx);
    const result = await read(task.id), lastFailure = await read(task.id, '-failure');
    const models = await getCatalog(root, refresh);
    const inputTokens = Math.ceil(((task.prompt || task.description || '').length + (task.title || '').length) / 3);
    const staleReasons = result ? [result.revision !== revision && 'Task or source binding changed', result.settingsRevision !== settingsRevision && 'Project defaults changed', result.sourceFingerprint && result.sourceFingerprint !== source.fingerprint && 'Checkout or review evidence changed'].filter(Boolean) : [];
    const log = journal(root, project, task.id);
    const [history, evidence, attempts] = await Promise.all([log.list('assessment'), log.list('evidence'), log.list('run')]);
    const used = attempts.filter(e => e.kind === 'source_review' && e.scope === scopeFor(task)).length;
    const decision = result ? preferenceAdvice(result.assessment, models, inputTokens, config) : null;
    const resolved = task.assignedAgentId ? null : host.resolveExecutorSessionModel(task.modelProvider, task.modelId, settings, undefined, task.credentialInstanceId, task.executionMode);
    const job = running.get(task.id);
    return { automaticSelection: false, assessmentAllowed: manual || settings.enginePaused === true, assessorRuntime: manual ? 'Fusion native AI' : 'Local Codex CLI', enginePaused: settings.enginePaused === true, task: { id: task.id, title: task.title, revision }, result, lastFailure,
      history: history.filter(r => !r.unreadable).slice(-20).reverse().map(r => ({...r, status: attempts.find(a => a.id === r.runId)?.state === 'failed' || attempts.find(a => a.id === r.runId)?.state === 'cancelled' ? 'invalidated' : r.revision !== revision || r.settingsRevision !== settingsRevision || r.sourceFingerprint !== source.fingerprint ? 'outdated' : r.runId === result?.runId ? 'current' : 'superseded'})), journalWarnings: [...history, ...evidence, ...attempts].filter(r => r.unreadable).map(r => ({kind:r.kind,id:r.id,message:r.failure.message})), evidence: evidence.filter(r => !r.unreadable).slice(-20).reverse().map(e => ({ ...e, current: e.revision === revision && e.sourceFingerprint === source.fingerprint })),
      attempts: attempts.slice(-10).reverse().map(a => ({ ...a, state: running.get(task.id)?.id === a.id ? a.state : ['checking','assessing','started'].includes(a.state) ? 'interrupted' : a.state })),
      sourceFingerprint: source.fingerprint, discovery: { ...checkSpec, used, limit: config.maxDiscoveryChecks, enabled: allowedCheckoutRoots.length > 0 && !attempts.some(r=>r.unreadable), blockedReason: attempts.some(r=>r.unreadable) ? 'Discovery budget cannot be established: unreadable operation record. Operator recovery is needed.' : !allowedCheckoutRoots.length ? 'Source discovery is not configured for this installation.' : null },
      stale: staleReasons.length > 0, staleReasons, running: job ? { id: job.id, model: job.model, startedAt: job.startedAt, phase: job.phase } : null,
      recommendation: decision, catalog: models, settingsRevision,
      resolved: resolved ? { ...resolved, checkedAt: new Date().toISOString(), source: task.modelId ? 'Task override' : 'Native effective settings' } : null,
      assignedAgentRoute: !!task.assignedAgentId, session: { model: null, label: 'Not checked', detail: 'The card does not inspect or launch executor sessions.' },
      estimateInputTokens: inputTokens, inputEstimateSource: 'Rough task-text estimate only; excludes executor harness and tools',
      settings: { ...config, assessorModels, automaticSelection: false },
      recommendationCaveat: 'Configured preference only. Capability fit, executor access, quota and availability are unverified. No comparable verified outcomes yet.' };
  }
  const route = (method, path, handler) => ({ method, path, handler: async (req, ctx) => {
    try { return await handler(req, ctx); }
    catch (error) { return { status: error.status ?? 400, body: { error: error.status ? error.message : 'Assessment unavailable. Native Fusion settings are unchanged.', ...(error.receipt ? { failure: error.receipt } : {}) } }; }
  } });
  async function assess(req, ctx, kind = 'assess') {
    const initial = await context(req, ctx, { requirePause: true, readSource: false });
    const { task, revision, config, settingsRevision } = initial;
    let source, lastContext;
    const sourceBudget = { remaining: 10000 };
    if (req.body.automaticSelection !== undefined && req.body.automaticSelection !== false) throw fail(400, 'Automatic selection is unavailable');
    const note = req.body.note ?? '';
    if (typeof note !== 'string' || note.length > 2000) throw fail(400, 'Guidance must be at most 2,000 characters');
    const model = req.body.assessorModel || config.assessorModel;
    if (!assessorModels.includes(model)) throw fail(400, 'Assessor model is not admitted');
    const id = req.body.runId ?? randomUUID();
    if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw fail(400, 'Invalid assessment request ID');
    const log = journal(root, project, task.id), scope = scopeFor(task);
    const signature = fingerprint([kind, note, model, req.body.revision, req.body.settingsRevision, req.body.sourceFingerprint, req.body.evidenceId, req.body.evidenceText]);
    const existing = await log.get('run', id);
    if (existing) {
      if (existing.signature !== signature) throw fail(409, 'Operation ID already belongs to another request');
      return snapshot(req, ctx); // A persisted operation is never charged/replayed.
    }
    if (running.size || savingSettings) throw fail(409, 'An assessment or settings save is already running. Wait or cancel it.');
    if (req.body.revision !== revision || req.body.settingsRevision !== settingsRevision) throw fail(409, 'Task, source or project defaults changed. Reload before assessing.');
    const previous = await read(task.id);
    let evidence = null;
    if (kind === 'source_review') {
      if (!allowedCheckoutRoots.length) throw fail(409, 'Source discovery is not configured for this installation');
      if (!previous || previous.assessment.discovery !== 'source_review' || previous.runId !== req.body.assessmentRunId || previous.revision !== revision || previous.settingsRevision !== settingsRevision) throw fail(409, 'Reassess the current task before running its recommended check');
      const pastRuns = await log.list('run');
      if (pastRuns.some(r=>r.unreadable)) throw fail(409, 'Discovery budget cannot be established: unreadable operation record. Operator recovery is needed.');
      if (pastRuns.filter(r => r.kind === 'source_review' && r.scope === scope).length >= config.maxDiscoveryChecks) throw fail(409, 'Discovery budget used. Supply new evidence or resolve the prerequisite; no automatic retry.');
    }
    if (kind === 'reported' && (typeof req.body.evidenceText !== 'string' || !req.body.evidenceText.trim() || req.body.evidenceText.length > 4000)) throw fail(400, 'Reported evidence must contain 1–4,000 characters');
    const evidenceId = req.body.evidenceId || (kind === 'assess' ? previous?.evidenceIds?.at(-1) : null);
    if (evidenceId) {
      if (typeof evidenceId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(evidenceId)) throw fail(400, 'Invalid evidence ID');
      evidence = await log.get('evidence', evidenceId);
      if (!evidence || evidence.revision !== revision) {
        if (req.body.evidenceId) throw fail(409, 'Evidence is no longer current for this source. Collect current evidence.');
        evidence = null; // An ordinary fresh assessment must not carry old evidence.
      }
    }
    // Recheck after asynchronous journal reads, before claiming the whole operation.
    if (running.size || savingSettings) throw fail(409, 'Another operation started. Wait or cancel it.');
    const controller = new AbortController();
    const job = { id, controller, model, startedAt: new Date().toISOString(), phase: kind === 'source_review' ? 'checking' : 'assessing' };
    running.set(task.id, job);
    const record = { id, at: job.startedAt, taskId: task.id, project, kind, scope, signature, revision, settingsRevision, sourceFingerprint: null, state: job.phase };
    let receipt;
    const check = async () => {
      if (controller.signal.aborted) throw fail(409, 'Assessment cancelled. Native settings are unchanged.');
      const current = await context(req, ctx, { requirePause: true, sourceSignal: controller.signal, sourceBudget });
      if (current.revision !== revision || current.settingsRevision !== settingsRevision || current.source.fingerprint !== source.fingerprint) throw fail(409, 'Task, source or defaults changed. Result retained in history only; reassess the current task.');
      if (controller.signal.aborted) throw fail(409, 'Assessment cancelled. Native settings are unchanged.');
      lastContext = current;
    };
    try {
      try { await log.put('run', id, record, true); }
      catch (error) { if (error.code === 'EEXIST') return snapshot(req, ctx); throw error; }
      if (previous?.runId && /^[a-zA-Z0-9-]{1,80}$/.test(previous.runId) && !await log.get('assessment', previous.runId)) {
        await log.put('assessment', previous.runId, { ...previous, at: previous.assessedAt, importedHistory: true }, true);
      }
      source = await sourceRead(task, controller.signal, sourceBudget);
      record.sourceFingerprint = source.fingerprint;
      if (req.body.sourceFingerprint && req.body.sourceFingerprint !== source.fingerprint) throw fail(409, 'Source changed. Reload before assessing.');
      if (kind === 'source_review' && previous.sourceFingerprint !== source.fingerprint) throw fail(409, 'Source changed. Reassess before running discovery.');
      if (evidence && evidence.sourceFingerprint !== source.fingerprint) {
        if (req.body.evidenceId) throw fail(409, 'Evidence is no longer current for this source. Collect current evidence.');
        evidence = null;
      }
      if (kind === 'source_review' || kind === 'reported') {
        const observed = kind === 'source_review' ? source : null;
        evidence = { id: randomUUID(), at: new Date().toISOString(), taskId: task.id, project, kind, scope, revision,
          sourceFingerprint: observed?.fingerprint ?? source.fingerprint, operationId: id,
          provenance: kind === 'source_review' ? 'Bounded machine observation and native recorded review' : 'Operator-reported; not independently verified',
          ...(observed ? { check: checkSpec, observation: observed } : { text: req.body.evidenceText.trim() }) };
        await log.put('evidence', evidence.id, evidence, true);
        record.evidenceId = evidence.id;
      }
      await check();
      job.phase = 'assessing'; record.state = 'assessing'; await log.put('run', id, record);
      const knownRuns = await log.list('run');
      const discoveryUsed = knownRuns.filter(r=>r.kind === 'source_review' && r.scope === scope).length;
      const input = JSON.stringify({ availableDiscovery: { check: checkSpec, enabled: allowedCheckoutRoots.length > 0, remainingAttempts: Math.max(0,config.maxDiscoveryChecks-discoveryUsed), budgetKnown: !knownRuns.some(r=>r.unreadable), instruction: 'This fixed check is performed by the plugin only after an operator clicks Check source & reassess. Historical unavailable receipts do not establish current availability. Request source_review when its documented facts would resolve the current question and a check is available; otherwise request operator_evidence.' }, title: task.title, description: task.description, prompt: task.prompt,
        previousAssessment: previous ? { assessment: previous.assessment, runId: previous.runId, revision: previous.revision, settingsRevision: previous.settingsRevision, sourceFingerprint: previous.sourceFingerprint, status: previous.revision === revision && previous.settingsRevision === settingsRevision && previous.sourceFingerprint === source.fingerprint ? 'current context, advisory only' : 'historical; context changed, not current evidence' } : null, evidence: evidence ? [evidence] : [],
        evidenceRules: 'Only supplied check receipts establish observed facts. Operator reports are unverified. Native review records do not prove test execution. No executor/tool permissions are granted.' });
      const assessment = await assessWithModel(async request => {
        receipt = await run(request, root, controller.signal, ctx); return receipt.text;
      }, { ...config, assessorModel: model }, input, note);
      const result = { assessment, model, completedModel: receipt.completedModel ?? null, usage: receipt.usage, elapsedMs: receipt.elapsedMs,
        revision, settingsRevision, sourceFingerprint: source.fingerprint, config, runId: id, note, assessedAt: new Date().toISOString(),
        previousRunId: previous?.runId ?? null, evidenceIds: evidence ? [evidence.id] : [], inputFingerprint: fingerprint(input) };
      // Immutable history may contain an outcome invalidated immediately afterward;
      // the separately fenced latest pointer determines whether it is current.
      await log.put('assessment', id, { ...result, at: result.assessedAt }, true);
      await persist(task.id, result, '', check);
      record.state = 'completed'; record.completedAt = result.assessedAt; await log.put('run', id, record);
    } catch (error) {
      const known = ['Previous native assessor is still stopping; no new call was started.', 'Assessment cancelled', 'Assessment timed out', 'Assessment input exceeds limit', 'Assessment exceeded its output target; usage was already incurred.'];
      const failure = { message: error.status || known.includes(error.message) ? error.message : 'Assessor failed or returned invalid output. Collected evidence is retained; native settings are unchanged.',
        usage: error.receipt?.usage ?? receipt?.usage ?? null, elapsedMs: error.receipt?.elapsedMs ?? receipt?.elapsedMs ?? null, model, failedAt: new Date().toISOString(), evidenceId: evidence?.id ?? null, runId: id };
      record.state = controller.signal.aborted ? 'cancelled' : 'failed'; record.failure = failure; await log.put('run', id, record);
      await persist(task.id, failure, '-failure');
      throw Object.assign(fail(error.status ?? 422, failure.message), { receipt: failure });
    } finally { running.delete(task.id); }
    return snapshot(req, ctx, false, lastContext);
  }
  return [
    route('GET', '/tasks/:id/assessment', (req, ctx) => snapshot(req, ctx)),
    route('POST', '/tasks/:id/prices', (req, ctx) => snapshot(req, ctx, true)),
    route('POST', '/tasks/:id/settings', async (req, ctx) => {
      const current = await context(req, ctx, { readConfig: false });
      if (savingSettings) throw fail(409, 'Settings are being saved. Reload and retry.');
      savingSettings = true;
      try {
        const stored = (await ctx.taskStore.getPluginStore().getPlugin(pluginId)).settings;
        let config;
        try {
          if (!req.body.settings || Object.keys(req.body.settings).some(key => !Object.hasOwn(effectiveConfig(), key))) throw new Error('Unknown setting');
          config = effectiveConfig(req.body.settings);
        } catch (error) { throw fail(400, error.message); }
        let expected; try { expected = fingerprint(effectiveConfig(stored)); } catch { expected = 'invalid'; }
        if (req.body.settingsRevision !== expected) throw fail(409, 'Project defaults changed elsewhere. Reload before saving.');
        await ctx.taskStore.getPluginStore().updatePluginSettings(pluginId, config);
        for (const job of running.values()) job.controller.abort();
        return snapshot(req, ctx);
      } finally { savingSettings = false; }
    }),
    route('POST', '/tasks/:id/cancel', async (req, ctx) => {
      const { task } = await context(req, ctx, { readConfig: false });
      const job = running.get(task.id);
      if (job && req.body?.runId !== job.id) throw fail(409, 'This assessment has changed. Refresh before cancelling.');
      job?.controller.abort(); return { cancelled: !!job };
    }),
    route('POST', '/tasks/:id/assess', (req, ctx) => assess(req, ctx)),
    route('POST', '/tasks/:id/discover', (req, ctx) => assess(req, ctx, 'source_review')),
    route('POST', '/tasks/:id/report-evidence', (req, ctx) => assess(req, ctx, 'reported')),
  ];
}
