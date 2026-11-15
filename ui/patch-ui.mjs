import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
export const originalClientSha = '11a58e0182ec86dccb0cf7ec7d672adab3182406cd2f4541963b907e902c8cf1';
const sha = data => createHash('sha256').update(data).digest('hex');
export function patchClient(original, cardFile) {
  if (sha(original) !== originalClientSha) throw Error('Unsupported Fusion dashboard; no changes made');
  const once = (source, needle, replacement) => { if (source.split(needle).length !== 2) throw Error('Dashboard integration point changed'); return source.replace(needle, replacement); };
  const tab = 'n.jsx("button",{className:`detail-tab${Y==="definition"?" detail-tab-active":""}`,onClick:()=>J("definition"),children:S("taskDetail.tabs.definition","Plan")})';
  const props = 'react:a,task:V,projectId:t,authHeaders:So,onOpenAssessment:()=>J("assessment"),onOpenModel:()=>J("model"),onOpenWorkflow:()=>J("workflow"),onOpenDefinition:()=>J("definition")';
  let source = once(original, tab, tab + ',n.jsx("button",{className:`detail-tab${Y==="assessment"?" detail-tab-active":""}`,onClick:()=>J("assessment"),"data-testid":"task-assessment-tab",children:"Assessment"})');
  source = once(source, ':Y==="changes"?n.jsx(ope,', ':Y==="assessment"?n.jsx(TaskLensCard,{' + props + '},`${t}:${e.id}:assessment`):Y==="changes"?n.jsx(ope,');
  const promptEnd = 'children:S("taskDetail.spec.noPrompt","(no prompt)")})]})]})]})';
  source = once(source, promptEnd, 'children:S("taskDetail.spec.noPrompt","(no prompt)")})]}),n.jsx(TaskLensCard,{' + props + ',compact:true,hideUnavailable:true},`${t}:${e.id}:assessment-summary`)]})]})');
  if (!original.includes('function So(e){const t=lm();')) throw Error('Native authentication adapter changed');
  return 'import { TaskLensCard } from "./' + cardFile + '";\n' + source;
}
export function installUI(root, cardSource) {
  const dist = join(root, 'dist'), assets = join(dist, 'client/assets');
  const original = readFileSync(join(assets, 'index-C2TJ3ObY.js'), 'utf8');
  const cardFile = 'task-lens-' + sha(cardSource).slice(0,16) + '.js';
  const patched = patchClient(original, cardFile);
  // Keep all relative chunk imports within a versioned asset directory. Merely
  // renaming the entry lets lazy chunks re-import and mount the old entry.
  const buildDir = 'task-lens-' + sha(patched).slice(0,16);
  const target = join(assets, buildDir); mkdirSync(target, {recursive:true});
  for (const entry of readdirSync(assets, {withFileTypes:true})) {
    if (entry.isFile()) copyFileSync(join(assets,entry.name),join(target,entry.name));
  }
  const clientFile = buildDir + '/index-C2TJ3ObY.js';
  const htmlPath = join(dist, 'client/index.html');
  let html = readFileSync(htmlPath, 'utf8').replace(/\/assets\/task-lens-[a-f0-9]{16}\//g, '/assets/').replace(/index-task-lens-[a-f0-9]{16}\.js/g, 'index-C2TJ3ObY.js');
  if (!html.includes('/assets/index-C2TJ3ObY.js')) throw Error('Dashboard HTML entrypoint changed');
  writeFileSync(join(target, cardFile), cardSource);
  writeFileSync(join(assets, clientFile), patched);
  writeFileSync(htmlPath, html.replaceAll('/assets/', '/assets/' + buildDir + '/'));
  const receipt = { version: 2, originalClientSha256: sha(original), patchedClientSha256: sha(patched), cardSha256: sha(cardSource),
    clientFile, cardFile: buildDir + '/' + cardFile, automaticSelection: false, placement: 'task-assessment-tab' };
  writeFileSync(join(dist, 'task-lens-ui.json'), JSON.stringify(receipt));
  return receipt;
}
