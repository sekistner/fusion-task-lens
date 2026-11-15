// Mounted by the version-checked disposable dashboard patch. Uses the host's
// React instance and task props, never a DOM scraper or a second task board.
export function TaskLensCard({ react: React, task, projectId, authHeaders = x => x, hideUnavailable = false }) {
  const h = React.createElement;
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState('');
  const [unavailable, setUnavailable] = React.useState(false);
  const [busy, setBusy] = React.useState('');
  const [note, setNote] = React.useState('');
  const [model, setModel] = React.useState('');
  const [draft, setDraft] = React.useState(null);
  const [dirty, setDirty] = React.useState(false);
  const [draftRevision, setDraftRevision] = React.useState('');
  const generation = React.useRef(0), epoch = React.useRef(0), activeAction = React.useRef(false), ownRun = React.useRef(null);
  const base = `/api/plugins/fusion-plugin-task-observability/tasks/${encodeURIComponent(task.id)}`;
  const request = async (action, body) => {
    const response = await fetch(`${base}/${action}?projectId=${encodeURIComponent(projectId ?? '')}`, {
      method: body ? 'POST' : 'GET', headers: authHeaders({ 'Content-Type': 'application/json' }),
      ...(body ? { body: JSON.stringify({ ...body, projectId, automaticSelection: false }) } : {}),
    });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error || 'Assessment unavailable'), { failure: result.failure, status: response.status });
    return result;
  };
  React.useEffect(() => {
    const gen = ++generation.current;
    setData(null); setUnavailable(false); setError(''); setNote(''); setBusy(''); setModel(''); setDraft(null); setDirty(false);
    activeAction.current = false;
    let readSequence = 0, acceptedSequence = 0;
    const load = () => {
      if (activeAction.current) return;
      const boundary = epoch.current, seq = ++readSequence;
      request('assessment').then(result => {
        if (generation.current === gen && boundary === epoch.current && seq >= acceptedSequence) { acceptedSequence = seq; setUnavailable(false); setData(result); }
      }).catch(e => { if (generation.current === gen && boundary === epoch.current && seq >= acceptedSequence) { setError(e.message); setUnavailable(e.status === 404 || e.status === 403); } });
    };
    load(); const timer = setInterval(load, 5000);
    return () => { generation.current++; clearInterval(timer); };
  }, [task.id, projectId, task.prompt, task.description, task.title]);
  React.useEffect(() => {
    if (data && !dirty) { setDraft({ ...data.settings }); setDraftRevision(data.settingsRevision); }
  }, [data?.settingsRevision, dirty]);
  async function action(kind) {
    const gen = generation.current;
    ++epoch.current; activeAction.current = true;
    setError(''); if (kind !== 'cancel') setBusy(kind);
    if (kind === 'assess') ownRun.current = crypto.randomUUID();
    try {
      let payload = { revision: data?.task.revision, settingsRevision: data?.settingsRevision, note, assessorModel: model,
        runId: kind === 'cancel' ? data?.running?.id ?? ownRun.current : ownRun.current };
      if (kind === 'settings') {
        const { assessorModels, automaticSelection, ...settings } = draft;
        payload = { settings, settingsRevision: draftRevision };
      }
      const result = await request(kind, payload);
      if (generation.current === gen) {
        if (kind !== 'cancel') { setData(result); if (kind === 'settings') setDirty(false); }
        else setError(result.cancelled ? 'Cancellation requested. Waiting for the assessor to stop.' : 'No assessment is running.');
      }
    } catch (e) {
      if (generation.current === gen) {
        setError(e.message);
        if (e.failure) setData(current => current && ({ ...current, lastFailure: e.failure }));
      }
    } finally {
      if (generation.current === gen && kind !== 'cancel') { ++epoch.current; activeAction.current = false; setBusy(''); }
      if (kind === 'cancel' && !busy) activeAction.current = false;
    }
  }
  const num = n => Number.isFinite(n) ? n.toLocaleString() : 'Unknown';
  const pretty = id => id === 'terra' || id?.endsWith('gpt-6.1-terra') ? 'Terra' : id === 'sol' || id?.endsWith('gpt-6.1-sol') ? 'Sol' : id === 'flash' ? 'DeepSeek Flash' : id || 'Not checked';
  const result = data?.result;
  const route = data?.recommendation;
  const processing = busy === 'assess' || !!data?.running;
  const config = data?.settings;
  const activeModel = data?.running?.model || model || config?.assessorModel;
  const row = (title, value, detail) => h('div', { className: 'tl-row', key: title }, h('span', { className: 'tl-label' }, title), h('div', null, h('strong', null, value), detail && h('small', null, detail)));
  const recommendation = !result ? 'Assess to see a suggestion' : route?.model ? pretty(route.model) : ({ decompose: 'Consider splitting the task', discovery: 'Run a small discovery check', block: 'Review prerequisites or constraints' }[route?.action] || 'Unavailable');
  const explanation = route?.reason === 'configured_baseline' ? 'Configured default · no comparable verified outcomes yet' : route?.reason === 'configured_preference' ? 'Configured preference order within estimated limits' : route?.reason?.replaceAll('_', ' ');
  if (hideUnavailable && ((!data && !error) || unavailable)) return null;
  return h('section', { className: 'task-lens', 'aria-label': 'Task assessment', 'data-testid': 'task-lens-card' },
    h('style', null, styles),
    h('header', { className: 'tl-head' }, h('div', null, h('h3', null, 'Task assessment'), h('small', null, (data?.assessorRuntime || 'Task assessor') + ' · manual advisory preview')), h('span', { className: 'tl-badge' }, 'Automatic selection off')),
    h('div', { className: 'tl-live', role: 'status', 'aria-live': 'polite' }, processing ? 'Assessing with ' + pretty(activeModel) + '… one call, up to ' + config?.assessmentTimeoutSeconds + ' seconds.' : data?.stale ? 'Out of date — ' + data.staleReasons.join('; ') + '. Reassess before using this advice.' : result ? 'Assessed ' + new Date(result.assessedAt).toLocaleTimeString() + ' · ' + pretty(result.model) : 'Assess the saved task without starting execution.'),
    error && h('div', { className: 'tl-error', role: 'alert' }, error),
    data?.lastFailure && (!result || data.lastFailure.failedAt > result.assessedAt) && h('p', { className: 'tl-footnote' }, 'Last attempt: ', data.lastFailure.message, ' Usage: ', data.lastFailure.usage ? num(data.lastFailure.usage.input_tokens) + ' input / ' + num(data.lastFailure.usage.output_tokens) + ' output tokens (already incurred).' : 'unknown; it may have consumed tokens.'),
    h('div', { className: data?.stale ? 'tl-stale' : '' },
      row('Policy suggestion', recommendation, [explanation, 'Capability fit and executor access unverified.'].filter(Boolean).join(' · ')),
      row('Fusion resolved', pretty(data?.resolved?.modelId), data?.resolved ? 'Executor · ' + data.resolved.source + ' · checked ' + new Date(data.resolved.checkedAt).toLocaleTimeString() : 'Native model resolution is not available for this task.'),
      row('Session confirmed', 'Not checked', 'Manual assessment uses a separate session. It never pauses, holds or starts task execution.')),
    result && h('div', { className: 'tl-assessment' },
      h('div', { className: 'tl-tags' }, h('span', null, result.assessment.independentOutcomes + ' outcomes'), h('span', null, result.assessment.uncertainty + ' uncertainty')),
      h('p', null, h('strong', null, 'Acceptance check: '), result.assessment.acceptanceCheck)),
    h('div', { className: 'tl-actions' },
      h('button', { type: 'button', className: 'btn btn-sm tl-primary', disabled: !data || !!busy || processing || !data.assessmentAllowed || dirty, onClick: () => action('assess') }, processing ? 'Assessing…' : result ? 'Reassess task' : 'Assess task'),
      processing && h('button', { type: 'button', className: 'btn btn-sm', onClick: () => action('cancel') }, 'Cancel assessment'),
      h('span', { className: 'tl-footnote' }, dirty ? 'Save or discard project-default changes before assessing.' : 'One subscription call · no native executor changes')),
    h('details', null, h('summary', null, 'Guidance & assessor'),
      h('label', { className: 'tl-input-label' }, 'Assessment model', h('select', { value: model, disabled: !!busy || processing, onChange: e => setModel(e.target.value) },
        h('option', { value: '' }, 'Project default (' + pretty(config?.assessorModel) + ')'), h('option', { value: 'openai-codex/gpt-6.1-terra' }, 'Terra — this assessment'), h('option', { value: 'openai-codex/gpt-6.1-sol' }, 'Sol'))),
      h('label', { className: 'tl-input-label' }, 'Optional assessment guidance', h('textarea', { value: note, disabled: processing, maxLength: 2000, rows: 2, placeholder: 'For example: prefer one discriminating test.', onChange: e => setNote(e.target.value) })),
      h('small', null, 'Guidance helps assess the task. It cannot grant tools, select the executor, or change budgets. Only saved task text is assessed.')),
    h('details', null, h('summary', null, 'Prices & limits'),
      h('p', { className: 'tl-footnote' }, 'USD per 1M tokens. Subscription usage is not free or unlimited. Account quota and executor availability are unverified.'),
      h('div', { className: 'tl-table-wrap' }, h('table', null,
        h('thead', null, h('tr', null, ...['Model', 'Input / output / cached', 'Local context / output', 'Source & freshness'].map(label => h('th', { key: label }, label)))),
        h('tbody', null, ...(data?.catalog ?? []).map(m => h('tr', { key: m.id },
          h('th', { scope: 'row' }, pretty(m.id)),
          h('td', null, m.billing === 'subscription' ? 'Subscription · incremental price unknown' : m.prices ? [m.prices.input, m.prices.output, m.prices.cacheRead].map(p => '$' + Number(p.toFixed(6))).join(' / ') : 'Unknown', m.promotion && h('small', null, m.promotion)),
          h('td', null, num(m.contextTokens) + ' / ' + num(m.maxOutputTokens), m.providerContextTokens && h('small', null, 'Provider advertises ' + num(m.providerContextTokens) + ' context')),
          h('td', null, m.priceSource?.startsWith('https://') ? h('a', { href: m.priceSource, target: '_blank', rel: 'noreferrer' }, 'Provider source ↗') : 'Local runtime catalog',
            h('small', null, m.billing === 'subscription' ? 'Configured limits; provider entitlement unverified' : m.priceAsOf ? (m.priceFresh ? 'Fetched ' : 'Stale / lookup failed · ') + new Date(m.priceAsOf).toLocaleString() : 'Not fetched'))))))),
      h('button', { type: 'button', className: 'btn btn-sm', disabled: !!busy || processing, onClick: () => action('prices') }, busy === 'prices' ? 'Refreshing…' : 'Refresh provider prices'),
      h('p', { className: 'tl-footnote' }, 'Assessment: ' + num(config?.assessmentInputChars) + ' task-data characters; ' + config?.assessmentTimeoutSeconds + '-second request deadline; ' + num(config?.assessmentOutputTokens) + ' output-token target checked after generation (not a hard provider cap). Harness input adds tokens.'),
      h('p', { className: 'tl-footnote' }, 'Executor preview: ' + config?.headroomPercent + '% context headroom, ' + num(config?.executorOutputTokens) + ' output tokens reserved, $' + config?.paidRequestLimitUsd + ' paid-request estimate ceiling. No paid executor is invoked. These are estimates, not whole-task spend limits.'),
      result && h('p', null, 'Last assessment: ', h('strong', null, num(result.usage.input_tokens) + ' input / ' + num(result.usage.output_tokens) + ' output tokens'), ' · ' + (result.elapsedMs / 1000).toFixed(1) + ' seconds.')),
    data && h(ProjectDefaults, { react: React, draft, setDraft, dirty, setDirty, busy: !!busy || processing, save: () => action('settings'), conflict: dirty && draftRevision !== data.settingsRevision, discard: () => { setDraft({ ...data.settings }); setDraftRevision(data.settingsRevision); setDirty(false); setError(''); } }),
    result && h('details', null, h('summary', null, 'Why this suggestion'),
      h('p', null, explanation), result.note && h('p', null, 'Guidance used: ', result.note), h('p', { className: 'tl-footnote' }, data.recommendationCaveat),
      h('p', { className: 'tl-footnote' }, 'Estimate uses approximately ' + num(data.estimateInputTokens) + ' task-text tokens; executor context is unknown.'),
      h('ul', null, ...(route?.candidateDecisions ?? []).map(c => h('li', { key: c.id }, pretty(c.id) + ': ' + (c.constraintFit ? 'within estimated limits' : c.estimate.reason.replaceAll('_', ' ')) + '; executor admission unverified'))),
      h('h4', null, 'Anticipated pitfalls'), h('ul', null, ...result.assessment.pitfalls.map(p => h('li', { key: p }, p))),
      h('small', null, 'No comparable outcome history has been collected. Scope and capability judgments are model estimates; this is not a calibrated success prediction.')),
  );
}
function ProjectDefaults({ react: React, draft, setDraft, dirty, setDirty, busy, save, conflict, discard }) {
  const h = React.createElement;
  if (!draft) return null;
  const change = (key, value) => { setDirty(true); setDraft(current => ({ ...current, [key]: value })); };
  const number = (key, label, min, max, step = 1) => h('label', { className: 'tl-input-label', key }, label,
    h('input', { type: 'number', min, max, step, value: draft[key], disabled: busy, onChange: e => change(key, Number(e.target.value)) }));
  return h('details', { className: 'tl-defaults' }, h('summary', null, 'Project defaults' + (dirty ? ' · unsaved' : '')),
    h('p', { className: 'tl-footnote' }, 'Saved in this Fusion project’s plugin settings. Changes affect assessment and advisory estimates only; automatic selection stays off.'),
    conflict && h('p', { role: 'alert' }, 'Defaults changed elsewhere. Reload before saving to avoid overwriting them.'),
    h('div', { className: 'tl-settings-grid' },
      h('label', { className: 'tl-input-label' }, 'Default assessor', h('select', { value: draft.assessorModel, disabled: busy, onChange: e => change('assessorModel', e.target.value) },
        h('option', { value: 'openai-codex/gpt-6.1-terra' }, 'Terra'), h('option', { value: 'openai-codex/gpt-6.1-sol' }, 'Sol'))),
      h('label', { className: 'tl-input-label' }, 'Baseline suggestion', h('select', { value: draft.baseline, disabled: busy, onChange: e => change('baseline', e.target.value) }, ...Object.entries({terra: 'Terra', sol: 'Sol', flash: 'DeepSeek Flash'}).map(([id, name]) => h('option', { key: id, value: id }, name)))),
      number('assessmentTimeoutSeconds', 'Assessment deadline (seconds)', 1, 120), number('maxOutcomes', 'Outcomes before suggesting a split', 1, 50)),
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

