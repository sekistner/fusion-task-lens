import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
export async function disposableEnvironment(root) {
  root = resolve(root || '');
  if (!root.startsWith('/tmp/fusion-shadow.') && !root.startsWith('/private/tmp/fusion-shadow.')) throw new Error('Use a disposable /tmp/fusion-shadow.* directory');
  const privateDir = join(root, 'private'); await mkdir(privateDir, { recursive: true, mode: 0o700 });
  let dsn = process.env.DATABASE_URL;
  if (!dsn) { try { dsn = (await readFile(join(privateDir, 'dsn'), 'utf8')).trim(); } catch {} }
  if (!dsn) throw new Error('Set DATABASE_URL to a disposable PostgreSQL database; never use a production database.');
  const url = new URL(dsn);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('The local trial requires a loopback PostgreSQL database');
  const env = { ...process.env, USERPROFILE: privateDir, DATABASE_URL: dsn, FUSION_SKIP_ONBOARDING: '1' };
  delete env.HOME; // Fusion's disposable profile only; assessor restores owner sign-in.
  return { root, env, entry: join(root, 'install/node_modules/@runfusion/fusion/bin.mjs') };
}
