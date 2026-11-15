import { mkdir, readFile, writeFile, readdir, rename, rm, link } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
// A process-wide registry survives plugin module reloads. Durable run files
// fence repeated operation IDs after a daemon restart; they are never replayed.
const registry = globalThis[Symbol.for('fusion.task-lens.operations')] ??= new Map();
export function operations(root, project) {
  const key = root + ':' + project;
  if (!registry.has(key)) registry.set(key, new Map());
  return registry.get(key);
}
export function journal(root, project, id) {
  const dir = join(root, 'history', project + '-' + id);
  const path = (kind, key) => join(dir, kind + '-' + key + '.json');
  async function get(kind, key) { try { return JSON.parse(await readFile(path(kind, key), 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }
  async function put(kind, key, value, immutable = false) {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const tmp = path(kind, key) + '.' + randomUUID();
    try { await writeFile(tmp, JSON.stringify(value), { mode: 0o600 }); if (immutable) await link(tmp, path(kind, key)); else await rename(tmp, path(kind, key)); }
    finally { await rm(tmp, { force: true }); }
  }
  async function list(kind) {
    const names = await readdir(dir).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
    const selected = names.filter(n => n.startsWith(kind + '-') && n.endsWith('.json'));
    return (await Promise.all(selected.map(n => readFile(join(dir, n), 'utf8').then(JSON.parse).catch(() => ({ unreadable: true, id: n.slice(kind.length + 1, -5), kind, state: 'unreadable', at: '', failure: { message: 'Unreadable durable record; retained for operator recovery. This operation cannot be replayed.' } })))))
      .sort((a,b) => (a.at ?? '').localeCompare(b.at ?? ''));
  }
  return { get, put, list };
}
