import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runNativeAssessment } from './assessor.mjs';
const request = {model:'openai-codex/gpt-6.1-terra',system:'Assess.',input:'Synthetic input',timeoutMs:1000,maxOutputTokens:100};
async function fixture(t) {
 const root=await mkdtemp(join(tmpdir(),'lens-native-')); t.after(()=>rm(root,{recursive:true,force:true}));
 let active=['read'], prompts=0, disposed=false, aborts=0;
 const session={model:{provider:'openai-codex',id:'gpt-6.1-terra'},state:{messages:[]},
 setActiveToolsByName:n=>{active=n},getActiveToolNames:()=>active,abort:async()=>{aborts++},dispose:()=>{disposed=true},
 prompt:async()=>{assert.deepEqual(active,[]);prompts++;session.state.messages.push({role:'assistant',content:[{type:'text',text:'{}'}],usage:{input:20,cacheRead:5,output:10},stopReason:'stop'})}};
 const ctx={createAiSession:async options=>{assert.equal(options.tools,'readonly');return {session}}};
 return {root,session,ctx,counts:()=>({prompts,disposed,aborts})};
}
test('native session disables all tools before prompting and records actual model usage',async t=>{
 const f=await fixture(t); const result=await runNativeAssessment(request,f.root,new AbortController().signal,f.ctx);
 assert.equal(result.usage.input_tokens,25);assert.equal(result.usage.output_tokens,10);assert.equal(f.counts().disposed,true);
});
test('native missing controls and wrong model fail before any inference',async t=>{
 const f=await fixture(t);delete f.session.setActiveToolsByName;
 await assert.rejects(runNativeAssessment(request,f.root,new AbortController().signal,f.ctx),/controls/);assert.equal(f.counts().prompts,0);
 const g=await fixture(t);g.session.model.id='other';
 await assert.rejects(runNativeAssessment(request,g.root,new AbortController().signal,g.ctx),/did not match/);assert.equal(g.counts().prompts,0);
});
test('native cancellation reaches the separate session without touching a task',async t=>{
 const f=await fixture(t);const ctl=new AbortController();let finish;
 f.session.prompt=()=>new Promise(resolve=>{finish=resolve});f.session.abort=async()=>finish?.();
 const promise=runNativeAssessment(request,f.root,ctl.signal,f.ctx);
 while(!finish)await new Promise(resolve=>setImmediate(resolve));ctl.abort();
 await assert.rejects(promise,/cancelled/);assert.equal(f.counts().disposed,true);
});
test('native output target failure retains known incurred tokens',async t=>{
 const f=await fixture(t);
 await assert.rejects(runNativeAssessment({...request,maxOutputTokens:1},f.root,new AbortController().signal,f.ctx),e=>e.receipt.usage.output_tokens===10);
});
test('deadline returns while stalled factory is quarantined; late session is disposed without prompting',async t=>{
 const f=await fixture(t);let finish;f.ctx.createAiSession=()=>new Promise(resolve=>{finish=resolve});
 const promise=runNativeAssessment({...request,timeoutMs:20},f.root,new AbortController().signal,f.ctx);
 await assert.rejects(promise,/timed out/);
 await assert.rejects(runNativeAssessment(request,f.root,new AbortController().signal,f.ctx),/still stopping/);
 const reloaded = await import('./assessor.mjs?reload=' + Date.now());
 await assert.rejects(reloaded.runNativeAssessment(request,f.root,new AbortController().signal,f.ctx),/still stopping/);
 finish({session:f.session});
 while(!f.counts().disposed)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.counts().prompts,0);
 // Let the temporary-directory cleanup complete before the next test.
 await new Promise(resolve=>setTimeout(resolve,10));
});
test('deadline returns when prompt ignores abort, and prevents another call until cleanup settles',async t=>{
 const f=await fixture(t);let finish;f.session.prompt=()=>new Promise(resolve=>{finish=resolve});
 const promise=runNativeAssessment({...request,timeoutMs:20},f.root,new AbortController().signal,f.ctx);
 await assert.rejects(promise,/timed out/);
 assert.equal(f.counts().aborts,1);
 await assert.rejects(runNativeAssessment(request,f.root,new AbortController().signal,f.ctx),/still stopping/);
 finish();while(!f.counts().disposed)await new Promise(resolve=>setImmediate(resolve));
 await new Promise(resolve=>setTimeout(resolve,10));
});
test('model changes during inference cannot be recorded as the requested assessor',async t=>{
 const f=await fixture(t);const prompt=f.session.prompt;
 f.session.prompt=async()=>{await prompt();f.session.model.id='other';};
 await assert.rejects(runNativeAssessment(request,f.root,new AbortController().signal,f.ctx),e=>/model changed/.test(e.message)&&e.receipt.usage.output_tokens===10);
});
