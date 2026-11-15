import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
const exec = promisify(execFile);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sha = value => typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
export const checkSpec = Object.freeze({ id: 'source_review', version: 1, name: 'Check bound source & review evidence', timeoutSeconds: 10,
  scope: 'Read the bound checkout identity, working-tree cleanliness and recorded code-review identity. No file contents, tests, network probes or task changes.' });
export function bindingFor(task) {
  const s = task.sourceMetadata ?? {};
  const external = Object.keys(s).some(k => (k.startsWith('externalReview') || k.startsWith('externalExecution')) && s[k] != null && s[k] !== '');
  return external ? { kind: 'external', checkout: s.externalReviewCheckout ?? null, expectedHead: s.externalReviewHeadSha ?? null,
    executionCheckout: s.externalExecutionCheckout ?? null, base: s.externalExecutionBaseSha ?? null, branch: s.externalExecutionBranch ?? null } : {
    kind: 'managed', checkout: typeof task.worktree === 'string' ? task.worktree : null,
    expectedHead: null, base: task.baseCommitSha ?? null, branch: task.branch ?? null };
}
export function reviewFor(task) {
  const r = task.workflowStepResults?.find(x => x.workflowStepId === 'code-review');
  return r ? { status: r.status ?? null, verdict: r.verdict ?? null, head: r.reviewedCommitSha ?? null,
    sourceKey: r.externalReviewSourceKey ?? null, inputFingerprint: r.reviewInputFingerprint ?? null,
    completedAt: r.completedAt ?? null } : null;
}
const contained = (root, path) => { const r = relative(root, path); return r === '' || (r !== '..' && !r.startsWith('../') && !isAbsolute(r)); };
export async function observeSource(task, { allowedCheckoutRoots = [], signal, timeoutMs = 10000 } = {}) {
  const binding = bindingFor(task), review = reviewFor(task);
  const value = { binding, review, state: 'unavailable', head: null, branch: null, clean: null, cleanScope: 'Root checkout; submodule contents are not inspected', baseIsAncestor: null, reviewMatchesHead: false, reviewMatchesSource: null };
  const finish = () => ({ ...value, fingerprint: digest(value) });
  if (!binding.checkout) { value.reason = 'Task has no bound checkout'; return finish(); }
  if (!isAbsolute(binding.checkout) || (binding.kind === 'external' && (!sha(binding.expectedHead) || !sha(binding.base) || typeof binding.branch !== 'string' || !binding.branch.trim() || typeof binding.executionCheckout !== 'string' || !isAbsolute(binding.executionCheckout))) || (binding.base && !sha(binding.base))) {
    value.reason = 'Source binding is incomplete or invalid'; return finish();
  }
  let cwd;
  try { cwd = await realpath(binding.checkout); }
  catch { value.reason = 'Bound checkout is missing or unreadable'; return finish(); }
  const roots = await Promise.all(allowedCheckoutRoots.filter(root => isAbsolute(root)).map(root => realpath(root).catch(() => null)));
  if (!roots.some(root => root && contained(root, cwd))) { value.reason = 'Canonical checkout escapes its admitted root'; return finish(); }
  if (binding.kind === 'external' && await realpath(binding.executionCheckout).catch(() => null) !== cwd) {
    value.reason = 'Execution and review checkout bindings conflict or are unreadable'; return finish();
  }
  const deadline = AbortSignal.any([AbortSignal.timeout(Math.max(1, Math.min(10000, Math.floor(timeoutMs)))), ...(signal ? [signal] : [])]);
  const git = async (...args) => (await exec('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false',
    '-c', 'core.hooksPath=/dev/null', '-c', 'diff.external=', '-C', cwd, ...args], {
    signal: deadline, timeout: 2500, maxBuffer: 65536, encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: '/nonexistent', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
      GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1', GIT_ATTR_NOSYSTEM: '1', LC_ALL: 'C' },
  })).stdout.trim();
  try {
    if (await realpath(await git('rev-parse', '--show-toplevel')) !== cwd) throw new Error('not root');
    value.head = await git('rev-parse', '--verify', 'HEAD');
    if (!sha(value.head)) throw new Error('invalid head');
    value.branch = await git('branch', '--show-current');
    // status can invoke clean/process filters as well as fsmonitor. Refuse
    // repositories configuring such helpers, before touching worktree content.
    let helpers = '';
    try { helpers = await git('config', '--includes', '--name-only', '--get-regexp', '^filter\\..*\\.(clean|process)$'); }
    catch (error) { if (error.code !== 1) throw error; }
    if (helpers) { value.reason = 'Repository content filters prevent a safe cleanliness check'; return finish(); }
    value.clean = (await git('status', '--porcelain=v1', '--untracked-files=normal', '--ignore-submodules=all')).length === 0;
    if (binding.base) {
      try { await git('merge-base', '--is-ancestor', binding.base, value.head); value.baseIsAncestor = true; }
      catch (error) { if (error.code === 1) value.baseIsAncestor = false; else throw error; }
    }
    value.reviewMatchesHead = !!review && review.head === value.head && review.status === 'passed';
    if (binding.kind === 'external') value.reviewMatchesSource = value.reviewMatchesHead && value.head === binding.expectedHead
      && value.branch === binding.branch && value.baseIsAncestor === true && value.clean === true
      && typeof review.inputFingerprint === 'string' && /^[a-f0-9]{64}$/.test(review.inputFingerprint)
      && review.sourceKey === JSON.stringify([binding.executionCheckout, binding.checkout, binding.branch, binding.base, binding.expectedHead]);
    value.state = 'observed';
    value.reason = binding.expectedHead && binding.expectedHead !== value.head ? 'Bound head differs from actual HEAD'
      : binding.branch && binding.branch !== value.branch ? 'Bound branch differs from actual branch'
      : !value.clean ? 'Checkout has uncommitted or untracked changes'
      : value.baseIsAncestor === false ? 'Bound base is not an ancestor of HEAD' : 'Bound source identity observed';
  } catch {
    if (signal?.aborted) throw new Error('Assessment cancelled');
    value.state = 'unavailable'; value.reason = 'Bounded Git inspection failed or exceeded its deadline';
  }
  return finish();
}
