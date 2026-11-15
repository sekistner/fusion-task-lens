import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { renameSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assessWithModel } from '../selector.mjs';
import { runCodexAssessment, assessorModels } from './assessor.mjs';
import { catalogSnapshot } from './catalog.mjs';
import { effectiveConfig, fingerprint, preferenceAdvice, pluginId } from './settings.mjs';
export const revisionFor = task => fingerprint([task.id, task.title, task.description, task.prompt, task.column, task.modelProvider, task.modelId, task.executionMode, task.assignedAgentId]);
const fail = (status, message) => Object.assign(new Error(message), { status });
export function createLocalRoutes({ root = process.env.FUSION_TASK_LENS_LOCAL_ROOT, project = process.env.FUSION_TASK_LENS_PROJECT_ID, run = runCodexAssessment, nativeHost, nativeModule, manual = false, origin = 'http://127.0.0.1:55482', getCatalog = catalogSnapshot } = {}) {
  if (!root || !project) return [];
  const running = new Map(); let nativePromise, savingSettings = false;
  const native = () => nativeHost ? Promise.resolve(nativeHost) : nativePromise ??= import(pathToFileURL(nativeModule || join(root, 'install/node_modules/@runfusion/fusion/dist/task-lens-native.mjs')).href);
  async function context(req, ctx, { requirePause = false, readConfig = true } = {}) {
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
    return { task, settings, host, config, settingsRevision: config && fingerprint(config), revision: revisionFor(task) };
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
  async function snapshot(req, ctx, refresh = false) {
    const { task, settings, host, config, revision, settingsRevision } = await context(req, ctx);
    const result = await read(task.id), lastFailure = await read(task.id, '-failure');
    const models = await getCatalog(root, refresh);
    const inputTokens = Math.ceil(((task.prompt || task.description || '').length + (task.title || '').length) / 3);
    const staleReasons = result ? [result.revision !== revision && 'Task changed', result.settingsRevision !== settingsRevision && 'Project defaults changed'].filter(Boolean) : [];
    const decision = result ? preferenceAdvice(result.assessment, models, inputTokens, config) : null;
    const resolved = task.assignedAgentId ? null : host.resolveExecutorSessionModel(task.modelProvider, task.modelId, settings, undefined, task.credentialInstanceId, task.executionMode);
    const job = running.get(task.id);
    return { automaticSelection: false, assessmentAllowed: manual || settings.enginePaused === true, assessorRuntime: manual ? 'Fusion native AI' : 'Local Codex CLI', enginePaused: settings.enginePaused === true, task: { id: task.id, title: task.title, revision }, result, lastFailure,
      stale: staleReasons.length > 0, staleReasons, running: job ? { id: job.id, model: job.model, startedAt: job.startedAt } : null,
      recommendation: decision, catalog: models, settingsRevision,
      resolved: resolved ? { ...resolved, checkedAt: new Date().toISOString(), source: task.modelId ? 'Task override' : 'Native effective settings' } : null,
      session: { model: null, label: 'Not checked', detail: 'The card does not inspect or launch executor sessions.' },
      estimateInputTokens: inputTokens, inputEstimateSource: 'Rough task-text estimate only; excludes executor harness and tools',
      settings: { ...config, assessorModels, automaticSelection: false },
      recommendationCaveat: 'Configured preference only. Capability fit, executor access, quota and availability are unverified. No comparable verified outcomes yet.' };
  }
  const route = (method, path, handler) => ({ method, path, handler: async (req, ctx) => {
    try { return await handler(req, ctx); }
    catch (error) { return { status: error.status ?? 400, body: { error: error.status ? error.message : 'Assessment unavailable. Native Fusion settings are unchanged.', ...(error.receipt ? { failure: error.receipt } : {}) } }; }
  } });
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
    route('POST', '/tasks/:id/assess', async (req, ctx) => {
      const { task, revision, config, settingsRevision } = await context(req, ctx, { requirePause: true });
      if (running.size || savingSettings) throw fail(409, 'An assessment or settings save is already running. Wait or cancel it.');
      if (req.body?.revision !== revision || req.body?.settingsRevision !== settingsRevision) throw fail(409, 'Task or project defaults changed. Reload the card before assessing.');
      if (req.body.automaticSelection !== undefined && req.body.automaticSelection !== false) throw fail(400, 'Automatic selection is unavailable');
      const note = req.body.note ?? '';
      if (typeof note !== 'string' || note.length > 2000) throw fail(400, 'Guidance must be at most 2,000 characters');
      const model = req.body.assessorModel || config.assessorModel;
      if (!assessorModels.includes(model)) throw fail(400, 'Assessor model is not admitted');
      const id = req.body.runId ?? randomUUID();
      if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw fail(400, 'Invalid assessment request ID');
      if ((await read(task.id))?.runId === id) return snapshot(req, ctx);
      // Recheck after the asynchronous receipt lookup before claiming admission.
      if (running.size) throw fail(409, 'An assessment is already running.');
      const controller = new AbortController(); running.set(task.id, { id, controller, model, startedAt: new Date().toISOString() });
      let receipt;
      try {
        const assessment = await assessWithModel(async request => {
          receipt = await run(request, root, controller.signal, ctx); return receipt.text;
        }, { ...config, assessorModel: model }, JSON.stringify({ title: task.title, description: task.description, prompt: task.prompt }), note);
        const check = async () => {
          const current = await context(req, ctx, { requirePause: true });
          if (current.revision !== revision || current.settingsRevision !== settingsRevision) throw fail(409, 'Task or defaults changed while assessing. Result discarded; reassess the current task.');
          if (controller.signal.aborted) throw fail(409, 'Assessment cancelled. Native settings are unchanged.');
        };
        await check();
        await persist(task.id, { assessment, model, completedModel: receipt.completedModel ?? null, usage: receipt.usage, elapsedMs: receipt.elapsedMs, revision, settingsRevision, config, runId: id, note, assessedAt: new Date().toISOString() }, '', check);
      } catch (error) {
        const known = ['Previous native assessor is still stopping; no new call was started.', 'Assessment cancelled', 'Assessment timed out', 'Assessment input exceeds limit', 'Assessment exceeded its output target; usage was already incurred.'];
        const failure = { message: error.status || known.includes(error.message) ? error.message : 'Assessor failed or returned invalid output. Check local sign-in/quota; native settings are unchanged.',
          usage: error.receipt?.usage ?? receipt?.usage ?? null, elapsedMs: error.receipt?.elapsedMs ?? receipt?.elapsedMs ?? null, model, failedAt: new Date().toISOString() };
        await persist(task.id, failure, '-failure');
        throw Object.assign(fail(error.status ?? 422, failure.message), { receipt: failure });
      } finally { running.delete(task.id); }
      return snapshot(req, ctx);
    }),
  ];
}
