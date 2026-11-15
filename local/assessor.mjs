import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { join } from 'node:path';

export const schema = {
  type: 'object', additionalProperties: false,
  required: ['independentOutcomes', 'capabilities', 'uncertainty', 'acceptanceCheck', 'pitfalls'],
  properties: {
    independentOutcomes: { type: 'integer' },
    capabilities: { type: 'array', items: { type: 'string', enum: ['implementation', 'cross_service', 'domain_research', 'operations', 'review'] } },
    uncertainty: { type: 'string', enum: ['low', 'medium', 'high'] },
    acceptanceCheck: { type: 'string' }, pitfalls: { type: 'array', items: { type: 'string' } },
  },
};
export const assessorModels = ['openai-codex/gpt-6.1-terra', 'openai-codex/gpt-6.1-sol'];

// Local subscription adapter. Deadline, no-tools configuration and response
// validation are enforced. Output tokens are checked AFTER generation; the
// installed CLI has no supported hard generation cap. UI must disclose this.
export async function runCodexAssessment(request, root, signal) {
  if (!assessorModels.includes(request.model)) throw new Error('Assessor model is not admitted');
  await mkdir(join(root, 'assessor'), { recursive: true, mode: 0o700 });
  const dir = await mkdtemp(join(root, 'assessor', 'call-'));
  await writeFile(join(dir, 'schema.json'), JSON.stringify(schema), { mode: 0o600 });
  const started = Date.now();
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn('codex', ['-a', 'never', 'exec', '--ignore-user-config', '--ignore-rules', '--ephemeral',
        '--skip-git-repo-check', '--disable', 'apps', '--disable', 'hooks', '--disable', 'shell_tool',
        '-c', 'web_search="disabled"', '-c', 'model_reasoning_effort="low"', '--sandbox', 'read-only',
        '-C', dir, '-m', request.model.split('/')[1], '--json', '--output-schema', join(dir, 'schema.json'),
        '--output-last-message', join(dir, 'answer.json'), '-'], {
        // Restore the actual owner's home for the existing signed-in Codex CLI.
        // No database credentials, Fusion settings, or provider API keys inherit.
        env: { PATH: process.env.PATH, HOME: userInfo().homedir, USER: userInfo().username, TMPDIR: process.env.TMPDIR || '/tmp' },
        detached: true, stdio: ['pipe', 'pipe', 'pipe'],
      });
      let events = '', failure, force;
      const terminate = message => {
        failure ??= message;
        try { process.kill(-child.pid, 'SIGTERM'); } catch {}
        force ??= setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 1000);
      };
      const abort = () => terminate('Assessment cancelled');
      const timeout = setTimeout(() => terminate('Assessment timed out'), request.timeoutMs);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      child.stdout.on('data', bytes => { events += bytes; if (events.length > 100_000) terminate('Assessor response exceeded limit'); });
      child.stderr.resume();
      child.stdin.on('error', () => terminate('Assessor input failed'));
      child.on('error', () => { failure = 'Codex could not start. Check the local CLI and sign-in.'; });
      child.on('close', async code => {
        clearTimeout(timeout); clearTimeout(force); signal.removeEventListener('abort', abort);
        try {
          const rows = events.split('\n').filter(Boolean).map(line => JSON.parse(line));
          const usage = rows.findLast(row => row.type === 'turn.completed')?.usage;
          const toolUse = rows.some(row => row.item && !['agent_message', 'reasoning'].includes(row.item.type));
          if (failure) throw new Error(failure);
          if (code !== 0 || !usage || toolUse) throw new Error('Assessment failed. Check local Codex sign-in/quota and try again.');
          if (!Number.isSafeInteger(usage.input_tokens) || !Number.isSafeInteger(usage.output_tokens)) throw new Error('Assessor usage unavailable');
          if (usage.output_tokens > request.maxOutputTokens) throw Object.assign(new Error('Assessment exceeded its output target; usage was already incurred.'), { receipt: { usage, elapsedMs: Date.now() - started } });
          resolve({ text: await readFile(join(dir, 'answer.json'), 'utf8'), usage, elapsedMs: Date.now() - started, model: request.model });
        } catch (error) { reject(error); }
      });
      child.stdin.end(request.system + '\nKeep the complete JSON under 250 words.\n' + request.input);
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
}
