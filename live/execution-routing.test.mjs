import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { chooseExecutionModel, executionRevision } from './execution-routing.mjs';
import { effectiveConfig, fingerprint } from '../local/settings.mjs';

const enabled = { automaticExecutionRouting: true };
const task = { id: 'TEST-1', title: 'Update the catalog', description: 'Verify the lookup' };
const plan = ['Update schema', 'Update query', 'Verify lookup'].map(name => ({ name }));

test('only an opted-in project with Sol in its model order routes a multi-step plan', async () => {
  const complex = { ...task, steps: plan };
  assert.equal(await chooseExecutionModel(complex, null, {}), undefined);
  assert.equal(await chooseExecutionModel(complex, null, { ...enabled, modelOrder: ['terra'] }), undefined);
  assert.equal(await chooseExecutionModel({ ...task, steps: plan.slice(0, 2) }, null, enabled), undefined);
  assert.deepEqual(await chooseExecutionModel(complex, null, enabled), {
    provider: 'openai-codex', modelId: 'gpt-6.1-sol', reason: 'multi-step-plan',
  });
});

test('a current cross-service assessment routes across workflow transitions and stale evidence falls through', async t => {
  const root = await mkdtemp(join(tmpdir(), 'task-lens-routing-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = 'proj_test';
  await mkdir(join(root, 'assessments'));
  const installation = { root, project };
  const assessment = {
    independentOutcomes: 2, uncertainty: 'medium', discovery: 'none', capabilities: ['cross_service', 'implementation'],
  };
  const receipt = {
    executionRevision: executionRevision(task), settingsRevision: fingerprint(effectiveConfig(enabled)), assessment,
  };
  const save = data => writeFile(join(root, 'assessments', `${project}-${task.id}.json`), JSON.stringify(data));
  await save(receipt);
  assert.equal((await chooseExecutionModel({ ...task, column: 'in-progress', worktree: '/allocated-worktree' }, installation, enabled)).reason,
    'assessed-cross-service');
  assert.equal(await chooseExecutionModel({ ...task, sourceMetadata: { externalExecutionCheckout: '/changed' } },
    installation, enabled), undefined);
  assert.equal(await chooseExecutionModel({ ...task, description: 'Changed scope' }, installation, enabled), undefined);
  assert.equal(await chooseExecutionModel(task, installation, { ...enabled, guidance: 'Changed settings' }), undefined);
  assert.equal(await chooseExecutionModel(task, { ...installation, project: 'proj_other' }, enabled), undefined);
  await save({ ...receipt, assessment: { ...assessment, discovery: 'source_review' } });
  assert.equal(await chooseExecutionModel(task, installation, enabled), undefined);
});
