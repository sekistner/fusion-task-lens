import { fileURLToPath } from 'node:url';
const projectId = process.argv[2];
if (!/^proj_[a-zA-Z0-9]+$/.test(projectId || '')) throw new Error('Pass the disposable project ID');
const path = fileURLToPath(new URL('../', import.meta.url));
const endpoint = 'http://127.0.0.1:55482/api/plugins?projectId=' + encodeURIComponent(projectId);
const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'install', path, aiScanOnLoad: false }) });
const result = await response.json();
if (!response.ok) throw new Error(result.error || 'Plugin registration failed');
console.log('Registered the standalone local plugin. Refresh Fusion and open a task’s Assessment tab.');
