import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const root = process.argv[2];
if (!root || !root.startsWith('/tmp/fusion-shadow.')) throw new Error('Only a disposable fusion-shadow installation is accepted');
const dist = join(root, 'install/node_modules/@runfusion/fusion/dist');
const source = await readFile(join(dist, 'bin.js'), 'utf8');
const sha = createHash('sha256').update(source).digest('hex');
// The second identity is the separately reviewed external-source correction.
if (!['94caa77aee3c3a1ea1d6aa407a0883b8c1fe6139a7807401d5728bb13ffcf5e7', '675d3a4aa59a640e8db0219d6bc99e631e7217e1a45b602a8ebeb89a8fa1e6f3'].includes(sha)) throw new Error('Native Fusion bundle changed; review the patch before applying');
const mainGuard = 'if (process.env.FUSION_CLI_SKIP_MAIN !== "1") {\n  await main();\n}';
if (!source.includes(mainGuard)) throw new Error('Native entrypoint guard missing');
await writeFile(join(dist, 'task-lens-native.mjs'), source.replace(mainGuard, '') + '\nexport { resolveExecutorSessionModel, resolveEffectiveSettingsDetailed, applyWorkflowSettingsOverlay };\n');
const packageRoot = join(root, 'install/node_modules/@runfusion/fusion');
// Recover only our exact original backup, then let the pinned installer verify it.
const asset = join(dist, 'client/assets/index-C2TJ3ObY.js');
const originalSha = '11a58e0182ec86dccb0cf7ec7d672adab3182406cd2f4541963b907e902c8cf1';
if (createHash('sha256').update(await readFile(asset)).digest('hex') !== originalSha) {
  const backup = await readFile(asset + '.task-lens-original');
  if (createHash('sha256').update(backup).digest('hex') !== originalSha) throw Error('Original dashboard backup changed');
  await writeFile(asset, backup);
}
const { installUI } = await import('../ui/patch-ui.mjs');
installUI(packageRoot, await readFile(new URL('./card.mjs', import.meta.url), 'utf8'));
// Explicit example configuration: no private sibling repository dependency.
try { await readFile(join(root, 'local-models.json')); }
catch { await copyFile(new URL('./example-catalog.json', import.meta.url), join(root, 'local-models.json')); }
console.log('Installed the Assessment tab and read-only native resolver adapter for Fusion 0.77.0.');
