import { spawn } from 'node:child_process';
import { open, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { disposableEnvironment } from './environment.mjs';
const { root, env, entry } = await disposableEnvironment(process.argv[2]);
const project = process.argv[3];
if (!/^proj_[a-zA-Z0-9]+$/.test(project || '')) throw new Error('Pass the disposable project ID from fn project list');
let occupied = false;
try { await fetch('http://127.0.0.1:55482/api/projects', { signal: AbortSignal.timeout(1000) }); occupied = true; } catch {}
if (occupied) throw new Error('Port 55482 is already serving a dashboard. Stop that disposable process first.');
Object.assign(env, { FUSION_TASK_LENS_LOCAL_ROOT: root, FUSION_TASK_LENS_PROJECT_ID: project });
const log = await open(join(root, 'fusion.log'), 'a', 0o600);
const child = spawn(process.execPath, [entry, 'dashboard', '--no-engine', '--host', '127.0.0.1', '--port', '55482', '--paused', '--no-auth', '--no-auto-register'], {
  cwd: join(root, 'project'), env, stdio: ['ignore', log.fd, log.fd], detached: true,
});
child.unref(); await log.close();
await writeFile(join(root, 'fusion.pid'), String(child.pid), { mode: 0o600 });
console.log('Disposable Fusion starting at http://127.0.0.1:55482/ with execution engine disabled.');
console.log('PID recorded in the disposable root. Stop that PID when the trial is finished.');
