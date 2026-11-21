import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bindingFor, reviewFor } from '../local/discovery.mjs';
import { effectiveConfig, fingerprint } from '../local/settings.mjs';

// Status changes and a freshly allocated managed worktree do not change the
// task definition. External checkout bindings are part of the task input.
export function executionRevision(task) {
  const binding = bindingFor(task);
  return fingerprint([
    task.id, task.lineageId, task.title, task.description, task.prompt,
    task.steps?.map(step => [step.name, step.description]),
    binding.kind === 'external' ? binding : null, reviewFor(task),
  ]);
}

export async function chooseExecutionModel(task, installation, stored) {
  const config = effectiveConfig(stored);
  if (!config.automaticExecutionRouting || !config.modelOrder.includes('sol')) return;
  if (!/^[A-Z0-9-]{1,50}$/.test(task.id)) return;

  // Frozen plans are available for cards that have never been assessed.
  if (task.steps?.filter(step => typeof step.name === 'string' && step.name.trim()).length >= 3) {
    return sol('multi-step-plan');
  }
  if (!installation) return;
  const receipt = await readFile(join(installation.root, 'assessments', `${installation.project}-${task.id}.json`),
    { encoding: 'utf8' }).then(JSON.parse).catch(() => null);
  if (receipt?.executionRevision !== executionRevision(task) || receipt.settingsRevision !== fingerprint(config)) return;
  const assessment = receipt.assessment;
  if (assessment?.uncertainty !== 'high' && assessment?.discovery === 'none'
    && Number.isInteger(assessment.independentOutcomes) && assessment.independentOutcomes > 0
    && assessment.independentOutcomes <= config.maxOutcomes
    && Array.isArray(assessment.capabilities) && assessment.capabilities.includes('cross_service')) {
    return sol('assessed-cross-service');
  }
}

const sol = reason => ({ provider: 'openai-codex', modelId: 'gpt-6.1-sol', reason });
