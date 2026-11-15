import { createHash } from 'node:crypto';
import { defaults, estimateRequest } from '../selector.mjs';
import { assessorModels } from './assessor.mjs';
export const pluginId = 'fusion-plugin-task-observability';
export const modelIds = ['terra', 'sol', 'flash'];
export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function effectiveConfig(stored = {}) {
  const config = Object.fromEntries(Object.keys(defaults).map(key => [key, stored[key] ?? defaults[key]]));
  const integer = (key, min, max) => { if (!Number.isSafeInteger(config[key]) || config[key] < min || config[key] > max) throw new Error(`${key} must be an integer from ${min} to ${max}`); };
  integer('assessmentInputChars', 1, 32000); integer('assessmentOutputTokens', 1, 4096);
  integer('assessmentTimeoutSeconds', 1, 120); integer('maxOutcomes', 1, 50);
  integer('maxDiscoveryChecks', 1, 5);
  integer('minSamples', 1, 10000); integer('targetPassPercent', 1, 99);
  integer('headroomPercent', 0, 99); integer('executorOutputTokens', 1, 128000);
  if (!assessorModels.includes(config.assessorModel)) throw new Error('Choose an admitted assessment model');
  if (typeof config.guidance !== 'string' || config.guidance.length > 4000) throw new Error('Project guidance must be at most 4,000 characters');
  if (!modelIds.includes(config.baseline)) throw new Error('Choose a known baseline model');
  if (!Array.isArray(config.modelOrder) || !config.modelOrder.length || config.modelOrder.some(id => !modelIds.includes(id)) || new Set(config.modelOrder).size !== config.modelOrder.length || !config.modelOrder.includes(config.baseline)) throw new Error('Model order must contain unique known models and include the baseline');
  if (!Number.isFinite(config.paidRequestLimitUsd) || config.paidRequestLimitUsd < 0 || config.paidRequestLimitUsd > 100) throw new Error('Paid request estimate ceiling must be between $0 and $100');
  return config;
}
// Local pilot has no verified capability history or executor account probes.
// Do not manufacture admission facts to produce a recommendation.
export function preferenceAdvice(assessment, models, inputTokens, config) {
  const candidates = config.modelOrder.map(id => models.find(m => m.id === id)).filter(Boolean).map(model => {
    const estimate = estimateRequest({ ...model, quota: 'unknown' }, inputTokens, config.executorOutputTokens, config);
    return { id: model.id, admission: 'unverified', constraintFit: estimate.eligible || estimate.reason === 'subscription_quota', estimate };
  });
  let action = 'route', reason = 'configured_baseline', model = null;
  if (assessment.independentOutcomes > config.maxOutcomes) { action = 'decompose'; reason = 'task_scope'; }
  else if (assessment.uncertainty === 'high') { action = 'discovery'; reason = 'uncertain_scope'; }
  else {
    model = candidates.find(c => c.id === config.baseline && c.constraintFit)?.id ?? candidates.find(c => c.constraintFit)?.id ?? null;
    if (!model) { action = 'block'; reason = 'no_model_within_estimated_limits'; }
    else if (model !== config.baseline) reason = 'configured_preference';
  }
  return { action, reason, model, samples: 0, conditionalOnExecutorAdmission: true, candidateDecisions: candidates };
}
