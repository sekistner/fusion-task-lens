import assert from 'node:assert/strict';
import test from 'node:test';
import plugin from '../plugin.mjs';
import { createWorkflowRouting } from './workflow-routing.mjs';

const projectId = 'proj_test';
const extensionKey = 'plugin:fusion-plugin-task-observability:choose-executor-model';

function fixture() {
  const task = { id: 'TEST-1', lineageId: 'original', column: 'in-progress', title: 'Update the catalog',
    steps: ['Update schema', 'Update query', 'Verify lookup'].map(name => ({ name, status: 'pending' })) };
  const settings = { defaultProvider: 'openai-codex', defaultModelId: 'gpt-6.1-terra' };
  const installation = { enabled: true, settings: { automaticExecutionRouting: true } };
  const selectedWorkflowSettings = {};
  const routing = createWorkflowRouting(() => undefined);
  const node = { kind: 'gate', extensions: { [extensionKey]: { projectId } } };
  const workflow = { columns: [{ id: 'in-progress' }] };
  let live = task, writes = 0, beforeAtomic = () => {};
  const store = {
    getWorkflowSettingsProjectId: () => projectId,
    getDefaultWorkflowId: async () => 'builtin:coding',
    getTaskWorkflowSelectionAsync: async () => ({ workflowId: 'custom:task-lens' }),
    getWorkflowSettingValuesAsync: async id => id === 'custom:task-lens' ? selectedWorkflowSettings : {},
    getSettings: async () => settings,
    getTask: async () => ({ ...live }),
    getPluginStore: () => ({ getPlugin: async () => installation }),
    updateTaskAtomic: async (_id, update) => {
      beforeAtomic();
      const patch = update(live);
      if (patch) { writes++; live = { ...live, ...patch }; }
      return live;
    },
  };
  routing.hooks.onLoad({ taskStore: store });
  return {
    task, settings, installation, selectedWorkflowSettings, node, workflow,
    route: (override = {}) => routing.workflowExtensions[0].handle({ task, node, workflow, ...override }),
    unload: () => routing.hooks.onUnload({ taskStore: store }),
    live: () => live, change: patch => { live = { ...live, ...patch }; },
    writes: () => writes, atUpdate: fn => { beforeAtomic = fn; },
  };
}

test('Task Lens ships a native workflow extension and only fills model fields once', async () => {
  assert.equal(plugin.workflowExtensions[0].kind, 'node-handler');
  const f = fixture();
  assert.deepEqual(await f.route(), { outcome: 'success', value: 'multi-step-plan' });
  assert.deepEqual(f.live(), { ...f.task, modelProvider: 'openai-codex', modelId: 'gpt-6.1-sol' });
  assert.equal((await f.route()).value, 'native-default');
  assert.equal(f.writes(), 1);
});

test('explicit task models, credentials, workflow choices, and existing execution win', async () => {
  for (const patch of [
    { modelProvider: 'grok-cli', modelId: 'grok-4.7' },
    { modelId: 'gpt-6.1-terra' },
    { credentialInstanceId: 'named-subscription' },
    { sessionFile: 'existing' },
    { userPaused: true },
    { lineageId: 'another-project-task' },
    { steps: [{ name: 'Existing step', status: 'in-progress' }] },
  ]) {
    const f = fixture();
    f.change(patch);
    assert.equal((await f.route()).value, 'native-default');
    assert.equal(f.writes(), 0);
  }
  const workflow = fixture();
  workflow.selectedWorkflowSettings.executionModelId = 'gpt-6.1-terra';
  assert.equal((await workflow.route()).value, 'native-default');
  assert.equal(workflow.writes(), 0);
});

test('checks the live model and task scope within the native update', async () => {
  const f = fixture();
  f.atUpdate(() => f.change({ modelProvider: 'grok-cli', modelId: 'grok-4.7' }));
  assert.equal((await f.route()).value, 'native-default');
  assert.equal(f.live().modelId, 'grok-4.7');
  assert.equal(f.writes(), 0);
  const stale = fixture();
  stale.atUpdate(() => stale.change({ description: 'Edited scope' }));
  assert.equal((await stale.route()).value, 'native-default');
  assert.equal(stale.writes(), 0);
});

test('the gate is inert for a small plan, disabled project, cancelled run, or unloaded plugin', async () => {
  const f = fixture();
  assert.equal((await f.route({ signal: AbortSignal.abort() })).value, 'native-default');
  f.change({ steps: f.task.steps.slice(0, 1) });
  assert.equal((await f.route()).value, 'native-default');
  f.change({ steps: f.task.steps });
  f.installation.settings.automaticExecutionRouting = false;
  assert.equal((await f.route()).value, 'native-default');
  f.installation.settings.automaticExecutionRouting = true;
  f.unload();
  assert.equal((await f.route()).value, 'native-default');
  assert.equal(f.writes(), 0);
});
