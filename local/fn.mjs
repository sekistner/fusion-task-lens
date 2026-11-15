import { spawn } from 'node:child_process';
import { disposableEnvironment } from './environment.mjs';
const { root, env, entry } = await disposableEnvironment(process.argv[2]);
const child = spawn(process.execPath, [entry, ...process.argv.slice(3)], { env, cwd: root, stdio: 'inherit' });
child.on('error', () => { console.error('Could not start the disposable Fusion CLI'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
