import { chooseExecutionModel, executionRevision } from './execution-routing.mjs';
import { pluginId } from '../local/settings.mjs';

const extensionId = 'choose-executor-model';
const extensionKey = `plugin:${pluginId}:${extensionId}`;
const outcome = value => ({ outcome: 'success', value });
const hasSelection = task => Boolean(task.modelProvider || task.modelId || task.credentialInstanceId);
const eligible = task => !hasSelection(task) && !task.sessionFile && !task.paused && !task.userPaused
  && !task.deletedAt && task.executionMode !== 'fast'
  && !task.steps?.some(step => ['in-progress', 'done', 'skipped'].includes(step.status));

export function createWorkflowRouting(resolveInstallation) {
  const stores = new Map();
  return {
    hooks: {
      onLoad({ taskStore }) {
        const project = taskStore.getWorkflowSettingsProjectId?.();
        if (project && typeof taskStore.updateTaskAtomic === 'function') stores.set(project, taskStore);
      },
      onUnload({ taskStore }) {
        stores.delete(taskStore.getWorkflowSettingsProjectId?.());
      },
    },
    workflowExtensions: [{
      extensionId,
      name: 'Choose executor model',
      kind: 'node-handler',
      nodeKind: 'gate',
      schemaVersion: 1,
      fallback: 'degradeToDefault',
      async handle({ task, node, workflow, signal }) {
        const project = node.extensions?.[extensionKey]?.projectId;
        const store = stores.get(project);
        if (!store || !task.lineageId || signal?.aborted) return outcome('native-default');
        const fresh = await store.getTask(task.id);
        if (fresh.lineageId !== task.lineageId || fresh.column !== task.column || !eligible(fresh)) {
          return outcome('native-default');
        }
        const [installation, config, defaultWorkflow, workflowSelection] = await Promise.all([
          store.getPluginStore().getPlugin(pluginId), store.getSettings(), store.getDefaultWorkflowId(),
          store.getTaskWorkflowSelectionAsync(task.id),
        ]);
        if (!installation.enabled || installation.settings?.automaticExecutionRouting !== true) return outcome('native-default');
        if (config.globalPause || config.enginePaused || config.testMode
          || config.defaultModelIdOverride || config.defaultProviderOverride
          || config.executionProvider || config.executionModelId
          || (config.executionGlobalProvider ?? config.defaultProvider) !== 'openai-codex'
          || (config.executionGlobalModelId ?? config.defaultModelId) !== 'gpt-6.1-terra'
          || workflow.columns?.find(column => column.id === fresh.column)?.agent) {
          return outcome('native-default');
        }
        const workflowId = workflowSelection?.workflowId ?? 'builtin:coding';
        const workflowSettings = await Promise.all([...new Set([defaultWorkflow || 'builtin:coding', workflowId])]
          .map(id => store.getWorkflowSettingValuesAsync(id, project)));
        if ([...workflowSettings, Object.fromEntries((workflow.settings ?? []).map(setting => [setting.id, setting.default]))]
          .some(values => values?.executionProvider || values?.executionModelId || values?.executionCredentialInstanceId)) {
          return outcome('native-default');
        }
        const selected = await chooseExecutionModel(fresh, resolveInstallation(project), installation.settings);
        if (!selected || signal?.aborted) return outcome('native-default');
        const revision = executionRevision(fresh);
        let applied = false;
        await store.updateTaskAtomic(task.id, current => {
          if (signal?.aborted || current.column !== fresh.column || current.assignedAgentId !== fresh.assignedAgentId
            || !eligible(current) || executionRevision(current) !== revision) return null;
          applied = true;
          return { modelProvider: selected.provider, modelId: selected.modelId };
        });
        return outcome(applied ? selected.reason : 'native-default');
      },
    }],
  };
}
