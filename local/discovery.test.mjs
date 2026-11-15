import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, symlink, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { observeSource } from './discovery.mjs';
import { createLocalRoutes, revisionFor } from './service.mjs';
import { effectiveConfig, fingerprint } from './settings.mjs';
const answer = { independentOutcomes: 1, capabilities: ['review'], uncertainty: 'high', acceptanceCheck: 'Review binds the actual head.', pitfalls: [], conclusion: 'Check the pinned source.', nextStep: 'Read the bound source and recorded review.', evidenceQuestion: 'Does the recorded review match the bound head?', discovery: 'source_review', changed: '' };
async function fixture(t, adapter) {
  const root = await mkdtemp(join(tmpdir(), 'lens-loop-')); t.after(() => rm(root, { recursive: true, force: true }));
  const repo = join(root, 'repo');
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
  execFileSync('git', ['init', '-q', '--initial-branch=fixture', repo]);
  await writeFile(join(repo, 'file'), 'original');
  git('add', 'file'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
  const head = git('rev-parse', 'HEAD');
  const task = { id: 'T-1', title: 'Check recorded source review', prompt: 'Verify source and review identity; do not change files.', autoMerge: false, paused: true,
    sourceMetadata: { externalReviewCheckout: repo, externalExecutionCheckout: repo, externalReviewHeadSha: head, externalExecutionBaseSha: head, externalExecutionBranch: 'fixture' },
    workflowStepResults: [{ workflowStepId: 'code-review', status: 'passed', verdict: 'APPROVE', reviewedCommitSha: head,
      reviewInputFingerprint: '1'.repeat(64), externalReviewSourceKey: JSON.stringify([repo,repo,'fixture',head,head]) }] };
  const settings = effectiveConfig({ assessmentInputChars: 32000, maxDiscoveryChecks: 1 });
  const native = { resolveEffectiveSettingsDetailed: async()=>({}), applyWorkflowSettingsOverlay:x=>x, resolveExecutorSessionModel:()=>({ modelId:'native-fixed' }) };
  const ctx = { taskStore: { getTask: async()=>structuredClone(task), getSettingsFast:async()=>({enginePaused:false}), getPluginStore:()=>({getPlugin:async()=>({settings})}) } };
  let calls = 0, lastInput;
  const options = { root, project:'demo', manual:true, allowedCheckoutRoots:[root], nativeHost:native, getCatalog:async()=>[],
    run:async(req,...rest)=>{calls++;lastInput=JSON.parse(JSON.parse(req.input).task);return adapter ? adapter(req,...rest) : {text:JSON.stringify({...answer, ...(lastInput.evidence.length ? {uncertainty:'low',discovery:'none',conclusion:'Recorded review matches source.',changed:'The source check resolved review identity.'}:{})}),usage:{input_tokens:10,output_tokens:20},elapsedMs:1};} };
  let routes=createLocalRoutes(options);
  const request=(action,body={})=>routes.find(r=>r.path.endsWith('/'+action)).handler({params:{id:task.id},query:{projectId:'demo'},headers:{},body:{revision:revisionFor(task),settingsRevision:fingerprint(settings),...body}},ctx);
  return {root,repo,task,settings,git,request,calls:()=>calls,input:()=>lastInput,reload:()=>{routes=createLocalRoutes(options);}};
}
test('real bound Git and recorded review become evidence consumed by reassessment; native task remains held',async t=>{
  const f=await fixture(t);const before=JSON.stringify(f.task), status=f.git('status','--porcelain');
  const a=await f.request('assess');
  const b=await f.request('discover',{runId:'discovery-one',assessmentRunId:a.result.runId,sourceFingerprint:a.sourceFingerprint});
  assert.equal(b.status,undefined,JSON.stringify(b));assert.equal(b.result.assessment.discovery,'none');
  assert.equal(f.input().availableDiscovery.enabled,true);assert.equal(f.input().availableDiscovery.remainingAttempts,0);
  assert.equal(f.input().evidence[0].observation.reviewMatchesHead,true);
  assert.equal(f.input().evidence[0].observation.reviewMatchesSource,true);
  assert.deepEqual(b.result.evidenceIds,[f.input().evidence[0].id]);assert.equal(b.history.length,2);
  assert.equal(b.discovery.used,1);assert.equal(f.calls(),2);assert.equal(JSON.stringify(f.task),before);assert.equal(f.git('status','--porcelain'),status);
  f.reload();const again=await f.request('discover',{runId:'discovery-one',assessmentRunId:a.result.runId,sourceFingerprint:a.sourceFingerprint});
  assert.equal(again.result.runId,b.result.runId);assert.equal(f.calls(),2);
  assert.equal((await f.request('discover',{runId:'discovery-one',note:'changed',assessmentRunId:a.result.runId})).status,409);
});
test('failure retains collected evidence; a retry can consume it without a second source check',async t=>{
  let fail=false;
  const f=await fixture(t,async req=>{if(fail)throw new Error('provider failure');return {text:JSON.stringify(answer),usage:{input_tokens:1,output_tokens:2},elapsedMs:1};});
  const a=await f.request('assess');fail=true;
  const b=await f.request('discover',{assessmentRunId:a.result.runId});assert.equal(b.status,422);assert.ok(b.body.failure.evidenceId);
  const state=await f.request('assessment');assert.equal(state.evidence.length,1);assert.equal(state.result.runId,a.result.runId);
  fail=false;const retried=await f.request('assess',{evidenceId:b.body.failure.evidenceId});assert.equal(retried.discovery.used,1);assert.equal(retried.result.evidenceIds.length,1);
  assert.equal((await f.request('discover',{assessmentRunId:retried.result.runId})).status,409);
});
test('source drift during model inference prevents publishing current advice and preserves history',async t=>{
  let drift=false;
  const f=await fixture(t,async()=>{if(drift){await writeFile(join(f.repo,'file'),'modified');}return {text:JSON.stringify(answer),usage:{input_tokens:1,output_tokens:2},elapsedMs:1};});
  const a=await f.request('assess');drift=true;
  const result=await f.request('discover',{assessmentRunId:a.result.runId});assert.equal(result.status,409);
  const state=await f.request('assessment');assert.equal(state.stale,true);assert.equal(state.result.runId,a.result.runId);assert.equal(state.evidence[0].current,false);
  assert.equal((await f.request('assess',{evidenceId:state.evidence[0].id})).status,409);
});
test('operator reports stay reported and cannot become machine observations',async t=>{
  const f=await fixture(t);const result=await f.request('report-evidence',{evidenceText:'I observed that the service responds.'});
  assert.equal(result.evidence[0].kind,'reported');assert.match(result.evidence[0].provenance,/not independently verified/);
  assert.equal(f.input().evidence[0].observation,undefined);assert.equal(result.discovery.used,0);
});
test('missing, wrong-head, dirty and escaping checkouts cannot be presented as verified source',async t=>{
  const f=await fixture(t),options={allowedCheckoutRoots:[f.root]};
  const good=await observeSource(f.task,options);assert.equal(good.clean,true);
  f.task.sourceMetadata.externalReviewHeadSha='0'.repeat(40);assert.match((await observeSource(f.task,options)).reason,/differs/);
  await writeFile(join(f.repo,'new'),'untracked');assert.equal((await observeSource(f.task,options)).clean,false);
  f.task.sourceMetadata.externalReviewCheckout=join(f.root,'missing');assert.match((await observeSource(f.task,options)).reason,/missing/);
  await symlink(tmpdir(),join(f.root,'escape'));f.task.sourceMetadata.externalReviewCheckout=join(f.root,'escape');assert.match((await observeSource(f.task,options)).reason,/escapes/);
});
test('Git fsmonitor helpers cannot execute during discovery',async t=>{
  const f=await fixture(t);const marker=join(f.root,'helper-ran');const hook=join(f.root,'monitor');
  await writeFile(hook,'#!/bin/sh\ntouch '+JSON.stringify(marker)+'\n',{mode:0o700});f.git('config','core.fsmonitor',hook);
  await observeSource(f.task,{allowedCheckoutRoots:[f.root]});
  await assert.rejects(readFile(marker),{code:'ENOENT'});
});
test('clean/process filters are refused before Git can execute repository helpers',async t=>{
  const f=await fixture(t);const marker=join(f.root,'filter-ran'),helper=join(f.root,'filter');
  await writeFile(helper,'#!/bin/sh\ntouch '+JSON.stringify(marker)+'\ncat\n',{mode:0o700});
  await writeFile(join(f.repo,'.gitattributes'),'file filter=spy\n');await writeFile(join(f.repo,'file'),'changed');
  for(const type of ['clean','process']){
    f.git('config','filter.spy.'+type,helper);
    const result=await observeSource(f.task,{allowedCheckoutRoots:[f.root]});assert.equal(result.state,'unavailable');assert.match(result.reason,/content filters/);
    await assert.rejects(readFile(marker),{code:'ENOENT'});f.git('config','--unset','filter.spy.'+type);
  }
});
test('full recorded review identity and both external bindings matter; cleared routes use managed source',async t=>{
  const f=await fixture(t),opts={allowedCheckoutRoots:[f.root]};
  const initial=revisionFor(f.task);f.task.sourceMetadata.externalExecutionCheckout=join(f.root,'elsewhere');
  assert.notEqual(revisionFor(f.task),initial);assert.match((await observeSource(f.task,opts)).reason,/conflict/);
  f.task.sourceMetadata.externalExecutionCheckout=f.repo;
  f.task.workflowStepResults[0].externalReviewSourceKey='[]';assert.equal((await observeSource(f.task,opts)).reviewMatchesSource,false);
  delete f.task.workflowStepResults[0].reviewInputFingerprint;assert.equal((await observeSource(f.task,opts)).reviewMatchesSource,false);
  f.task.sourceMetadata.externalReviewHeadSha='a'.repeat(41);assert.equal((await observeSource(f.task,opts)).state,'unavailable');
  f.task.sourceMetadata=Object.fromEntries(Object.keys(f.task.sourceMetadata).map(k=>[k,null]));f.task.worktree=f.repo;
  assert.equal((await observeSource(f.task,opts)).binding.kind,'managed');
});
test('durable corrupt records remain visible without replaying a paid operation', async t=>{
  const f=await fixture(t);const a=await f.request('assess',{runId:'durable-call'});
  await writeFile(join(f.root,'history','demo-T-1','run-durable-call.json'),'{');
  f.reload();const state=await f.request('assessment');assert.equal(state.journalWarnings.length,1);assert.equal(state.discovery.enabled,false);
  const newAttempt=await f.request('discover',{runId:'new-discovery',assessmentRunId:a.result.runId});assert.equal(newAttempt.status,409);assert.match(newAttempt.body.error,/budget cannot be established/);
  const again=await f.request('assess',{runId:'durable-call'});assert.ok(again.status>=400);assert.equal(f.calls(),1);
});
test('cancelled and changed task contexts cannot publish advice',async t=>{
  let finish;const f=await fixture(t,()=>new Promise(resolve=>{finish=()=>resolve({text:JSON.stringify(answer),usage:{input_tokens:1,output_tokens:2},elapsedMs:1});}));
  const pending=f.request('assess',{runId:'cancel-call'});
  while(!finish) await new Promise(resolve=>setImmediate(resolve));
  await f.request('cancel',{runId:'cancel-call'});finish();assert.equal((await pending).status,409);
  const state=await f.request('assessment');assert.equal(state.result,null);assert.equal(state.history[0].status,'invalidated');
});
test('canonical checkout within an admitted symlink root is accepted',async t=>{
  const f=await fixture(t);const alias=join(f.root,'alias');await symlink(f.repo,alias);
  const result=await observeSource(f.task,{allowedCheckoutRoots:[alias]});assert.equal(result.state,'observed');assert.equal(result.clean,true);
});
