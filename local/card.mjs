// Uses Fusion's own React and task navigation. No executor or task writes.
export function TaskLensCard({ react: React, task, projectId, authHeaders = x => x, hideUnavailable = false, compact = false, onOpenAssessment, onOpenModel, onOpenWorkflow, onOpenDefinition }) {
  const h = React.createElement;
  const [data,setData]=React.useState(null),[error,setError]=React.useState(''),[unavailable,setUnavailable]=React.useState(false);
  const [busy,setBusy]=React.useState(''),[note,setNote]=React.useState(''),[model,setModel]=React.useState('');
  const [draft,setDraft]=React.useState(null),[dirty,setDirty]=React.useState(false),[draftRevision,setDraftRevision]=React.useState('');
  const [view,setView]=React.useState('result'),[reported,setReported]=React.useState('');
  const generation=React.useRef(0),epoch=React.useRef(0),ownRun=React.useRef(null);
  const base=`/api/plugins/fusion-plugin-task-observability/tasks/${encodeURIComponent(task.id)}`;
  async function request(kind,body){
    const r=await fetch(`${base}/${kind}?projectId=${encodeURIComponent(projectId??'')}`,{method:body?'POST':'GET',headers:authHeaders({'Content-Type':'application/json'}),...(body?{body:JSON.stringify({...body,projectId,automaticSelection:false})}:{})});
    const value=await r.json();if(!r.ok)throw Object.assign(new Error(value.error||'Assessment unavailable'),{status:r.status,failure:value.failure});return value;
  }
  React.useEffect(()=>{
    const gen=++generation.current;let sequence=0,accepted=0;
    setData(null);setError('');setUnavailable(false);setBusy('');setNote('');setModel('');setDraft(null);setDirty(false);setView('result');setReported('');
    const load=()=>{const boundary=epoch.current,seq=++sequence;request('assessment').then(value=>{if(gen===generation.current&&boundary===epoch.current&&seq>=accepted){accepted=seq;setData(value);setUnavailable(false);}}).catch(e=>{if(gen===generation.current&&boundary===epoch.current){setError(e.message);setUnavailable([403,404].includes(e.status));}});};
    load();const timer=setInterval(load,5000);return()=>{generation.current++;clearInterval(timer);};
  },[task.id,projectId,task.prompt,task.description,task.title]);
  React.useEffect(()=>{if(data&&!dirty){setDraft({...data.settings});setDraftRevision(data.settingsRevision);}},[data?.settingsRevision,dirty]);
  async function action(kind,extra={}){
    const gen=generation.current;++epoch.current;setError('');if(kind!=='cancel')setBusy(kind);
    if(['assess','discover','report-evidence'].includes(kind))ownRun.current=crypto.randomUUID();
    try{
      let payload={revision:data?.task.revision,settingsRevision:data?.settingsRevision,sourceFingerprint:data?.sourceFingerprint,note,assessorModel:model,
        assessmentRunId:data?.result?.runId,evidenceText:reported,runId:kind==='cancel'?data?.running?.id??ownRun.current:ownRun.current,...extra};
      if(kind==='settings'){const{assessorModels,automaticSelection,...settings}=draft;payload={settings,settingsRevision:draftRevision};}
      const value=await request(kind,payload);
      if(gen===generation.current){if(kind==='cancel')setError(value.cancelled?'Cancellation requested. Waiting for cleanup.':'No operation is running.');else{setData(value);if(kind==='settings')setDirty(false);if(kind==='report-evidence'){setReported('');setView('result');}}}
    }catch(e){if(gen===generation.current){setError(e.message);try{const latest=await request('assessment');if(gen===generation.current)setData(latest);}catch{}}}
    finally{if(gen===generation.current&&kind!=='cancel'){++epoch.current;setBusy('');}}
  }
  const result=data?.result,a=result?.assessment,config=data?.settings,route=data?.recommendation;
  const processing=['assess','discover','report-evidence'].includes(busy)||!!data?.running;
  const blocked=!data||!!busy||processing||dirty||!data.assessmentAllowed;
  const pretty=id=>id==='terra'||id?.endsWith('gpt-6.1-terra')?'Terra':id==='sol'||id?.endsWith('gpt-6.1-sol')?'Sol':id==='flash'?'DeepSeek Flash':id||'Unknown';
  const num=n=>Number.isFinite(n)?n.toLocaleString():'Unknown';
  const date=value=>value?new Date(value).toLocaleString():'Unknown';
  const phase=data?.running?.phase||(busy==='discover'?'checking':'assessing');
  const budgetUsed=data?.discovery?.used>=data?.discovery?.limit;
  const status=processing?(phase==='checking'?'Collecting evidence':'Assessing with '+pretty(data?.running?.model||model||config?.assessorModel)):
    data?.stale?'Out of date':!result?'Not assessed':a?.discovery==='source_review'?(budgetUsed?'Discovery budget used':'Source evidence needed'):
    a?.discovery==='operator_evidence'?'Evidence needed':route?.action==='decompose'?'Scope decision needed':'Assessment current';
  const button=(label,click,disabled=false,primary=false)=>h('button',{type:'button',className:'btn btn-sm'+(primary?' tl-primary':''),onClick:click,disabled},label);
  if(compact){if((hideUnavailable&&unavailable)||!data)return null;return h('div',{className:'task-lens tl-compact','aria-label':'Assessment status'},h('style',null,styles+redesignedStyles),h('span',null,'Assessment: '+status),button('Open assessment',onOpenAssessment));}
  return h('section',{className:'task-lens tl-tab','aria-label':'Task assessment','data-testid':'task-lens-card'},
    h('style',null,styles+redesignedStyles),
    h('header',{className:'tl-head'},h('div',null,h('h3',null,view==='settings'?'Assessment settings':'Assessment')),h('div',{className:'tl-actions'},data&&h('span',{className:'tl-badge'},data.automaticSelection?'Task Lens workflow routing enabled':'Task-based execution routing off'),button(view==='settings'?'Back to assessment':'Assessment settings',()=>setView(view==='settings'?'result':'settings')))),
    error&&h('div',{className:'tl-error',role:'alert'},error),
    unavailable&&h('p',null,'Task Lens is not enabled for this project.'),
    !data&&!error&&h('p',{role:'status'},'Loading assessment…'),
    data&&view==='settings'?h(ProjectDefaults,{react:React,draft,setDraft,dirty,setDirty,dispatchRoutingAvailable:data.dispatchRoutingAvailable,busy:!!busy||processing,save:()=>action('settings'),conflict:dirty&&draftRevision!==data.settingsRevision,discard:()=>{setDraft({...data.settings});setDraftRevision(data.settingsRevision);setDirty(false);setError('');}}):data&&h(React.Fragment,null,
      h('div',{className:'tl-live',role:'status','aria-live':'polite'},status, result&&' · '+date(result.assessedAt)),
      data.stale&&h('p',{className:'tl-error'},data.staleReasons.join('; ')+'. The previous result is retained; reassess before using it.'),
      h('h2',{className:'tl-conclusion'},a?.conclusion||'Assess this task to decide what to do next.'),
      a?.changed&&h('p',null,h('strong',null,'What changed: '),a.changed),
      h('section',{className:'tl-next','aria-label':'Next action'},h('h4',null,'NEXT ACTION'),
        h('p',null,a?.nextStep||'One separate assessor call reads the saved task. It does not start task execution.'),
        a?.evidenceQuestion&&h('p',null,h('strong',null,'Question: '),a.evidenceQuestion),
        a?.discovery==='source_review'&&h('p',{className:'tl-footnote'},data.discovery.scope+' Source collection and validation share a 10-second budget. Reassessment uses one '+pretty(model||config.assessorModel)+' call with a '+config.assessmentTimeoutSeconds+'-second deadline. Output target is checked afterward.'),
        a?.discovery==='source_review'&&data.discovery.blockedReason&&h('p',{className:'tl-error'},data.discovery.blockedReason),
        budgetUsed&&a?.discovery==='source_review'&&h('p',{className:'tl-error'},'Discovery budget used ('+data.discovery.used+'/'+data.discovery.limit+'). Resolve the prerequisite or supply new evidence; the plugin will not repeat the check automatically.'),
        h('div',{className:'tl-actions'},
          button(processing?'Operation in progress…':result?'Reassess task':'Assess task',()=>action('assess'),blocked,!result||data.stale),
          a?.discovery==='source_review'&&button('Check source & reassess',()=>action('discover'),blocked||data.stale||budgetUsed||!data.discovery.enabled,true),
          a?.discovery==='operator_evidence'&&button('Add evidence',()=>setView('evidence'),blocked,true),
          route?.action==='decompose'&&onOpenDefinition&&button('Open task definition',onOpenDefinition,processing),
          a?.discovery==='none'&&route?.action!=='decompose'&&onOpenWorkflow&&button('Open workflow',onOpenWorkflow,processing),
          processing&&button('Cancel operation',()=>action('cancel'))),
        h('p',{className:'tl-footnote'},dirty?'Save or discard unsaved settings before assessing.':'After a check: evidence is saved and passed to one new assessment. Existing task holds, execution models and review requirements stay unchanged.')),
      data.lastFailure&&(!result||data.lastFailure.failedAt>result.assessedAt)&&h('div',{className:'tl-error'},h('strong',null,'Last attempt: '),data.lastFailure.message,h('small',null,'Usage: '+(data.lastFailure.usage?num(data.lastFailure.usage.input_tokens)+' input / '+num(data.lastFailure.usage.output_tokens)+' output tokens':'unknown; tokens may have been consumed'))),
      view==='evidence'&&h('section',{className:'tl-next'},h('h4',null,'Operator-reported evidence'),h('label',{className:'tl-input-label'},'What did you observe? Include the source and time.',h('textarea',{value:reported,maxLength:4000,rows:4,onChange:e=>setReported(e.target.value),disabled:processing})),h('small',null,'Stored as reported information. It is not promoted to a verified machine observation.'),button('Save evidence & reassess',()=>action('report-evidence'),blocked||!reported.trim(),true)),
      h('section',{'aria-label':'Assessment evidence'},h('h4',null,'Evidence used'),
        result?h('p',{className:'tl-footnote'},result.evidenceIds?.length?'This conclusion used evidence '+result.evidenceIds.map(id=>id.slice(0,8)).join(', ')+'.':'Task text and guidance only. No discovery evidence was used.'):null,
        !(data.evidence?.length)&&h('p',null,'No discovery evidence collected.'),
        ...(data.evidence??[]).slice(0,4).map(e=>h('article',{className:'tl-evidence',key:e.id},
          h('div',{className:'tl-head'},h('strong',null,(e.kind==='source_review'?'Source & recorded review':'Operator report')+' · '+e.id.slice(0,8)),h('small',null,e.current?'Current source':'Historical · source changed')),
          h('small',null,date(e.at)+' · '+e.provenance),
          e.observation?h(React.Fragment,null,h('p',null,e.observation.reason),h('p',{className:'tl-footnote'},'HEAD: '+(e.observation.head||'not observed')+' · clean: '+String(e.observation.clean??'unknown')),
            h('p',null,'Recorded review matches the full source binding: '+(e.observation.reviewMatchesSource===true?'yes':e.observation.reviewMatchesSource===false?'no':'not established')+'. This does not verify test execution.')):h('p',null,e.text),
          result?.evidenceIds?.includes(e.id)?h('small',null,'Used by the displayed assessment'):button('Reassess this evidence',()=>action('assess',{evidenceId:e.id}),blocked||!e.current),
          h('details',null,h('summary',null,'Evidence receipt'),h('pre',{className:'tl-receipt'},JSON.stringify(e,null,2))))),
        button('Add operator evidence',()=>setView('evidence'),blocked)),
      h('section',{className:'tl-model'},h('h4',null,'Execution model'),h('p',null,'Configured preference: ',h('strong',null,pretty(route?.model||config.baseline)),' · Fusion currently resolves: ',h('strong',null,data.assignedAgentRoute?'Assigned agent route — inspect native Model settings':pretty(data.resolved?.modelId))),
        h('p',{className:'tl-footnote'},data.automaticSelection?'Workflows with the Task Lens gate can select Sol before execution. Explicit model choices take priority. Actual executor session: not checked.':'Actual executor session: not checked.'),onOpenModel&&button('Open Fusion Model settings',onOpenModel)),
      a&&h('details',null,h('summary',null,'Scope, acceptance & anticipated pitfalls'),h('p',null,a.independentOutcomes+' independent outcome(s) · '+a.uncertainty+' uncertainty (assessor judgment)'),h('p',null,h('strong',null,'Acceptance: '),a.acceptanceCheck),h('ul',null,...a.pitfalls.map((p,i)=>h('li',{key:i},p)))),
      h('details',null,h('summary',null,'Guidance & assessment model'),
        h('label',{className:'tl-input-label'},'Assessor for the next call',h('select',{value:model,disabled:processing,onChange:e=>setModel(e.target.value)},h('option',{value:''},'Project default ('+pretty(config.assessorModel)+')'),h('option',{value:'openai-codex/gpt-6.1-terra'},'Terra'),h('option',{value:'openai-codex/gpt-6.1-sol'},'Sol'))),
        h('label',{className:'tl-input-label'},'Optional guidance',h('textarea',{rows:2,value:note,maxLength:2000,disabled:processing,onChange:e=>setNote(e.target.value)})),h('small',null,'The assessor has no tools. Guidance cannot change task authority or execution settings.')),
      h('details',null,h('summary',null,'Prices & limits'),h('p',{className:'tl-footnote'},'USD per million tokens. Subscription quota and provider entitlement are unverified.'),
        h('div',{className:'tl-table-wrap'},h('table',null,h('thead',null,h('tr',null,...['Model','Input / output / cached','Configured context / output','Source'].map(x=>h('th',{key:x},x)))),h('tbody',null,...data.catalog.map(m=>h('tr',{key:m.id},h('th',{scope:'row'},pretty(m.id)),h('td',null,m.billing==='subscription'?'Subscription; incremental price unknown':m.prices?[m.prices.input,m.prices.output,m.prices.cacheRead].map(x=>Number.isFinite(x)?'$'+Number(x.toFixed(6)):'Unknown').join(' / '):'Unknown',m.promotion&&h('small',null,m.promotion)),h('td',null,num(m.contextTokens)+' / '+num(m.maxOutputTokens)),h('td',null,m.priceSource?.startsWith('https://')?h('a',{href:m.priceSource,target:'_blank',rel:'noreferrer'},'Provider source'): 'Local runtime catalog',h('small',null,m.priceAsOf?(m.priceFresh?'Fetched ':'Stale · ')+date(m.priceAsOf):'Configured limits; entitlement unverified'))))))),
        button('Refresh provider prices',()=>action('prices'),!!busy||processing),h('p',{className:'tl-footnote'},'Assessment: '+num(config.assessmentInputChars)+' input characters; '+config.assessmentTimeoutSeconds+'-second deadline; '+num(config.assessmentOutputTokens)+' output-token target, checked after generation. Executor estimates reserve '+config.headroomPercent+'% context and '+num(config.executorOutputTokens)+' output tokens; paid request estimate ceiling $'+config.paidRequestLimitUsd+'. No paid executor is dispatched.')),
      h('details',null,h('summary',null,'Assessment history & attempts'),...(data.journalWarnings??[]).map(r=>h('p',{className:'tl-error',key:r.kind+r.id},r.message+' '+r.kind+' '+r.id)),...(data.history??[]).map(r=>h('article',{className:'tl-evidence',key:r.runId},h('strong',null,date(r.assessedAt)+' · '+(r.status||'historical')+' · '+pretty(r.model)),h('p',null,r.assessment.conclusion||r.assessment.acceptanceCheck),r.assessment.changed&&h('p',null,r.assessment.changed),h('small',null,'Run '+r.runId+' · evidence '+(r.evidenceIds?.join(', ')||'none')+' · '+num(r.usage?.input_tokens)+' input / '+num(r.usage?.output_tokens)+' output tokens'))),...(data.attempts??[]).filter(r=>r.state!=='completed').map(r=>h('p',{key:r.id},date(r.at)+' · '+r.kind+' · '+r.state, r.failure&&' · '+r.failure.message))),
      result&&h('p',{className:'tl-footnote'},'Assessed by '+pretty(result.model)+' · '+num(result.usage?.input_tokens)+' input / '+num(result.usage?.output_tokens)+' output tokens · '+(result.elapsedMs/1000).toFixed(1)+'s. No calibrated success claim.')));
}
const redesignedStyles=`.tl-tab{border:0;border-radius:0;background:transparent;max-width:1080px;margin:0;padding:20px}.tl-tab .tl-conclusion{font-size:21px;line-height:1.35;margin:16px 0}.tl-tab .tl-next{background:var(--bg-secondary,rgba(128,128,128,.08));padding:16px;border-radius:8px;margin:18px 0}.tl-tab .tl-next h4{margin-top:0}.tl-tab .tl-evidence{border-bottom:1px solid var(--border-color,#465461);padding:12px 0}.tl-tab .tl-receipt{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;max-height:360px;overflow:auto}.tl-tab .tl-model{margin:18px 0}.tl-tab .tl-head .tl-actions{margin:0}.tl-tab h4{font-size:13px}.tl-tab small,.tl-tab .tl-footnote{font-size:12px;opacity:.8}.tl-tab .tl-live{margin:12px 0}.tl-compact{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:10px 14px}.tl-tab button:disabled{cursor:default}.tl-tab .tl-defaults[open]>summary{display:none}.tl-tab .tl-defaults{border:0;margin:0;padding:0}@media(max-width:600px){.tl-tab{padding:14px}.tl-tab .tl-head{gap:12px}.tl-tab .tl-head .tl-actions{justify-content:flex-start}.tl-tab .tl-badge{white-space:normal}}`;

function ProjectDefaults({ react: React, draft, setDraft, dirty, setDirty, dispatchRoutingAvailable, busy, save, conflict, discard }) {
  const h = React.createElement;
  if (!draft) return null;
  const change = (key, value) => { setDirty(true); setDraft(current => ({ ...current, [key]: value })); };
  const number = (key, label, min, max, step = 1) => h('label', { className: 'tl-input-label', key }, label,
    h('input', { type: 'number', min, max, step, value: draft[key], disabled: busy, onChange: e => change(key, Number(e.target.value)) }));
  return h('details', { className: 'tl-defaults', open: true }, h('summary', null, 'Project defaults' + (dirty ? ' · unsaved' : '')),
    dispatchRoutingAvailable && h('label', null,
      h('input', { type: 'checkbox', checked: draft.automaticExecutionRouting === true, disabled: busy, onChange: e => change('automaticExecutionRouting', e.target.checked) }),
      ' Choose Sol for complex task execution'),
    conflict && h('p', { role: 'alert' }, 'Defaults changed elsewhere. Reload before saving to avoid overwriting them.'),
    h('div', { className: 'tl-settings-grid' },
      h('label', { className: 'tl-input-label' }, 'Default assessor', h('select', { value: draft.assessorModel, disabled: busy, onChange: e => change('assessorModel', e.target.value) },
        h('option', { value: 'openai-codex/gpt-6.1-terra' }, 'Terra'), h('option', { value: 'openai-codex/gpt-6.1-sol' }, 'Sol'))),
      h('label', { className: 'tl-input-label' }, 'Baseline suggestion', h('select', { value: draft.baseline, disabled: busy, onChange: e => change('baseline', e.target.value) }, ...Object.entries({terra: 'Terra', sol: 'Sol', flash: 'DeepSeek Flash'}).map(([id, name]) => h('option', { key: id, value: id }, name)))),
      number('maxDiscoveryChecks', 'Source checks per task scope', 1, 5), number('assessmentTimeoutSeconds', 'Assessment deadline (seconds)', 1, 120), number('maxOutcomes', 'Outcomes before suggesting a split', 1, 50)),
    h('label', { className: 'tl-input-label' }, 'Project assessment guidance', h('textarea', { rows: 2, maxLength: 4000, value: draft.guidance, disabled: busy, onChange: e => change('guidance', e.target.value) })),
    h('details', null, h('summary', null, 'Advanced limits & preferences'),
      h('div', { className: 'tl-settings-grid' }, number('assessmentInputChars', 'Maximum task-data characters', 1, 32000), number('assessmentOutputTokens', 'Output target (checked after generation)', 1, 4096),
        number('headroomPercent', 'Context headroom (%)', 0, 99), number('executorOutputTokens', 'Executor output reserve (tokens)', 1, 128000), number('paidRequestLimitUsd', 'Paid request estimate ceiling (USD)', 0, 100, .001)),
      h('label', { className: 'tl-input-label' }, 'Fallback preference order (comma-separated; include baseline)', h('input', { value: Array.isArray(draft.modelOrder) ? draft.modelOrder.join(', ') : draft.modelOrder, disabled: busy, onChange: e => change('modelOrder', e.target.value.split(',').map(s => s.trim())) })),
      h('p', { className: 'tl-footnote' }, 'A nonzero estimate ceiling does not authorize spending or dispatch. The CLI output target is checked after generation.'),
      h('details', null, h('summary', null, 'Scenario calibration only'), h('p', { className: 'tl-footnote' }, 'These two controls affect synthetic /scenarios only. The live card has no historical outcomes and makes no calibrated quality claim.'),
        h('div', { className: 'tl-settings-grid' }, number('minSamples', 'Minimum comparable outcomes', 1, 10000), number('targetPassPercent', 'Smoothed pass-rate threshold (%)', 1, 99)))),
    h('div', { className: 'tl-actions' }, h('button', { type: 'button', className: 'btn btn-sm', disabled: busy || !dirty || conflict, onClick: save }, 'Save project defaults'), h('button', { type: 'button', className: 'btn btn-sm', disabled: busy || !dirty, onClick: discard }, conflict ? 'Reload saved defaults' : 'Discard changes')));
}
const styles = `
.task-lens{max-width:1100px;margin:16px 0;padding:20px;border:1px solid var(--border-color,#465461);border-radius:12px;background:var(--bg-secondary,rgba(128,128,128,.06));color:inherit;font-size:13px;line-height:1.55}
.task-lens *{box-sizing:border-box}.tl-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}.task-lens h3{font-size:17px;margin:0;font-weight:650}.task-lens h4{font-size:13px;margin:12px 0 4px}.task-lens small{display:block;opacity:.72;font-size:11px}.tl-badge{font-size:11px;border:1px solid #4b8e7e;border-radius:99px;padding:3px 9px;white-space:nowrap}.tl-live{font-size:12px;opacity:.8;margin-bottom:14px}.tl-row{display:grid;grid-template-columns:140px 1fr;gap:12px;padding:5px 0}.tl-label{opacity:.68}.tl-row strong{font-weight:600}.tl-tags{display:flex;gap:8px;margin-top:14px}.tl-tags span{border:1px solid var(--border-color,#465461);border-radius:6px;padding:2px 8px;font-size:11px}.task-lens p{margin:8px 0}.tl-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:16px 0 10px}.tl-primary{background:#157861!important;color:white!important;border-color:#157861!important}.tl-footnote{font-size:11px;opacity:.72}.task-lens details{border-top:1px solid var(--border-color,#465461);padding:10px 0 0;margin-top:10px}.task-lens summary{cursor:pointer;font-weight:550}.tl-input-label{display:block;margin:10px 0;font-size:12px}.task-lens textarea,.task-lens select,.task-lens input{display:block;width:100%;border:1px solid var(--border-color,#465461);border-radius:6px;padding:8px;margin-top:5px;background:var(--bg-primary,transparent);color:inherit;font:inherit}.task-lens option{background:var(--bg-primary,#202328);color:inherit}.tl-table-wrap{overflow:auto;margin:12px 0}.task-lens table{width:100%;border-collapse:collapse;font-size:11px;min-width:530px}.task-lens td,.task-lens th{padding:9px 8px;text-align:left;border-bottom:1px solid var(--border-color,#465461);vertical-align:top}.task-lens th{font-weight:600}.task-lens a{color:inherit;text-decoration:underline}.tl-settings-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 14px}.tl-defaults{margin-top:10px}.tl-error{border-left:3px solid #c9894b;padding:8px 12px;margin:10px 0;background:rgba(201,137,75,.12)}.tl-stale{opacity:.6}.task-lens button:disabled{opacity:.5;cursor:wait}@media(max-width:600px){.tl-head{flex-direction:column}.tl-row{grid-template-columns:110px 1fr}.task-lens{padding:14px}}`;

