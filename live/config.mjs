import { isAbsolute } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createLocalRoutes } from '../local/service.mjs';
import { runNativeAssessment } from './assessor.mjs';
let config;
try { config = JSON.parse(await readFile(new URL('./installation.json', import.meta.url), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (config && (!/^proj_[a-zA-Z0-9]+$/.test(config.project) || !config.root?.startsWith('/home/fusion/.fusion/task-lens/') || !config.nativeModule?.startsWith(config.root + '/') || new URL(config.origin).protocol !== 'https:')) throw new Error('Invalid manual assessment installation');
if (config?.allowedCheckoutRoots !== undefined && (!Array.isArray(config.allowedCheckoutRoots) || config.allowedCheckoutRoots.some(root => typeof root !== 'string' || !isAbsolute(root) || root === '/'))) throw new Error('Invalid source discovery roots');
export const liveRoutes = config ? createLocalRoutes({ ...config, manual: true, run: runNativeAssessment }) : [];
