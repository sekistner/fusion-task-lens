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
  let routingLogger;
  return {
    hooks: {
      onLoad({ taskStore, logger }) {
        routingLogger = logger ?? routingLogger;
        const project = taskStore.getWorkflowSettingsProjectId?.();
        if (project && typeof taskStore.updateTaskAtomic === 'function') {
          stores.set(project, { taskStore, logger });
        }
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
        const binding = stores.get(project);
        const logger = binding?.logger ?? routingLogger;
        const report = (result, reason) => {
          if (/^[A-Z0-9-]{1,50}$/.test(task.id)) {
            logger?.info(`Task Lens executor default ${task.id}: ${result} (${reason})`);
          }
          return outcome(result === 'sol' ? reason : 'native-default');
        };
        const skip = reason => report('native', reason);
        if (!binding) return skip('project-store-unavailable');
        if (signal?.aborted || !task.lineageId) return skip('inactive-run');

        const store = binding.taskStore;
        let stage = 'read-task';
        try {
          const fresh = await store.getTask(task.id);
          // Fusion's graph can retain the task snapshot from its previous column.
          // Use the gate's declared column to check where the live task belongs.
          const column = node.column ?? task.column;
          if (fresh.lineageId !== task.lineageId || fresh.column !== column) return skip('task-changed');
          if (hasSelection(fresh)) return skip('explicit-task-model');
          if (!eligible(fresh)) return skip('execution-already-started-or-held');

          stage = 'read-project-settings';
          const [installation, config, defaultWorkflow, workflowSelection] = await Promise.all([
            store.getPluginStore().getPlugin(pluginId), store.getSettings(), store.getDefaultWorkflowId(),
            store.getTaskWorkflowSelectionAsync(task.id),
          ]);
          if (!installation.enabled || installation.settings?.automaticExecutionRouting !== true) return skip('routing-disabled');
          if (config.globalPause || config.enginePaused || config.testMode) return skip('engine-held');
          if (config.defaultModelIdOverride || config.defaultProviderOverride
            || config.executionProvider || config.executionModelId
            || (config.executionGlobalProvider ?? config.defaultProvider) !== 'openai-codex'
            || (config.executionGlobalModelId ?? config.defaultModelId) !== 'gpt-6.1-terra'
            || workflow.columns?.find(entry => entry.id === column)?.agent) return skip('execution-lane-selected');

          stage = 'read-workflow-settings';
          const workflowId = workflowSelection?.workflowId ?? 'builtin:coding';
          const workflowSettings = await Promise.all([...new Set([defaultWorkflow || 'builtin:coding', workflowId])]
            .map(id => store.getWorkflowSettingValuesAsync(id, project)));
          if ([...workflowSettings, Object.fromEntries((workflow.settings ?? []).map(setting => [setting.id, setting.default]))]
            .some(values => values?.executionProvider || values?.executionModelId || values?.executionCredentialInstanceId)) return skip('explicit-workflow-model');

          stage = 'choose-model';
          const selected = await chooseExecutionModel(fresh, resolveInstallation(project), installation.settings);
          if (signal?.aborted) return skip('inactive-run');
          if (!selected) return skip('baseline-for-task');
          const revision = executionRevision(fresh);
          stage = 'write-task-default';
          let applied = false;
          const updated = await store.updateTaskAtomic(task.id, current => {
            if (signal?.aborted || current.column !== column || current.assignedAgentId !== fresh.assignedAgentId
              || !eligible(current) || executionRevision(current) !== revision) return null;
            applied = true;
            return { modelProvider: selected.provider, modelId: selected.modelId };
          });
          if (!applied || updated?.modelProvider !== selected.provider || updated?.modelId !== selected.modelId) return skip('task-changed');
          return report('sol', selected.reason);
        } catch {
          // Keep this failure local to the task. Throwing disables the shared
          // extension in Fusion's registry until its entry is replaced.
          return skip(`failed-${stage}`);
        }
      },
    }],
  };
}
