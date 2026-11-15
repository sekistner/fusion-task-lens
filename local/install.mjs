import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const root = process.argv[2];
if (!root || !root.startsWith('/tmp/fusion-shadow.')) throw new Error('Only a disposable fusion-shadow installation is accepted');
const dist = join(root, 'install/node_modules/@runfusion/fusion/dist');
const source = await readFile(join(dist, 'bin.js'), 'utf8');
const sha = createHash('sha256').update(source).digest('hex');
if (sha !== '94caa77aee3c3a1ea1d6aa407a0883b8c1fe6139a7807401d5728bb13ffcf5e7') throw new Error('Native Fusion bundle changed; review the patch before applying');
const mainGuard = 'if (process.env.FUSION_CLI_SKIP_MAIN !== "1") {\n  await main();\n}';
if (!source.includes(mainGuard)) throw new Error('Native entrypoint guard missing');
await writeFile(join(dist, 'task-lens-native.mjs'), source.replace(mainGuard, '') + '\nexport { resolveExecutorSessionModel, resolveEffectiveSettingsDetailed, applyWorkflowSettingsOverlay };\n');
const asset = join(dist, 'client/assets/index-C2TJ3ObY.js');
let bundle = await readFile(asset, 'utf8');
const importLine = 'import { TaskLensCard } from "./task-lens-card.js";\n';
const card = 'n.jsx(TaskLensCard,{react:a,task:V,projectId:t},`${t}:${e.id}`)';
// Upgrade our previous before-prompt placement without moving native task UI.
const original = bundle.replace(importLine, '').replace(card + ',', '').replace(',' + card, '');
const needle = 'children:S("taskDetail.spec.noPrompt","(no prompt)")})]})]})]})';
const replacement = 'children:S("taskDetail.spec.noPrompt","(no prompt)")})]}),' + card + ']})]})';
if (original.split(needle).length !== 2) throw new Error('Task Definition insertion point changed');
if (!bundle.includes('task-lens-card.js')) await copyFile(asset, asset + '.task-lens-original');
const patched = importLine + original.replace(needle, replacement);
await writeFile(asset, patched);
await copyFile(new URL('./card.mjs', import.meta.url), join(dist, 'client/assets/task-lens-card.js'));
// Explicit example configuration: no private sibling repository dependency.
try { await readFile(join(root, 'local-models.json')); }
catch { await copyFile(new URL('./example-catalog.json', import.meta.url), join(root, 'local-models.json')); }
console.log('Installed the local task card and read-only native resolver adapter for Fusion 0.77.0.');
