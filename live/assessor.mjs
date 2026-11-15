import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { assessorModels } from '../local/assessor.mjs';
// Uses the host's signed-in model factory. No CLI, executor, task lease or
// workflow action is involved. Missing runtime controls fail before prompting.
const leases = globalThis[Symbol.for('fusion.task-lens.native-assessor-leases')] ??= new Map();
export async function runNativeAssessment(request, root, signal, ctx) {
  if (!assessorModels.includes(request.model) || !ctx.createAiSession) throw new Error('Native assessment model is unavailable');
  if (leases.has(root)) throw new Error('Previous native assessor is still stopping; no new call was started.');
  const lease = {}; leases.set(root, lease);
  const started = Date.now(); let session, timeout, cancelled = false, expired = false, cwd;
  let stop;
  const stopped = new Promise((_, reject) => { stop = reject; });
  const abort = () => {
    cancelled = true;
    try { Promise.resolve(session?.abort?.()).catch(() => {}); } catch {}
    stop(new Error(expired ? 'Assessment timed out' : 'Assessment cancelled'));
  };
  signal.addEventListener('abort', abort, { once: true });
  timeout = setTimeout(() => { expired = true; abort(); }, request.timeoutMs);
  let usage;
  const work = (async () => {
  try {
    await mkdir(join(root, 'sessions'), { recursive: true, mode: 0o700 });
    cwd = await mkdtemp(join(root, 'sessions', 'assessment-'));
    if (signal.aborted || cancelled) throw new Error('Assessment cancelled');
    const [provider, ...parts] = request.model.split('/');
    ({ session } = await ctx.createAiSession({ cwd, systemPrompt: request.system + '\nReturn only one compact JSON object, under 250 words. No markdown fences.', tools: 'readonly', defaultProvider: provider, defaultModelId: parts.join('/') }));
    for (const method of ['setActiveToolsByName', 'getActiveToolNames', 'abort', 'dispose']) if (typeof session?.[method] !== 'function') throw new Error('Native assessor lacks required controls');
    session.setActiveToolsByName([]);
    if (session.getActiveToolNames().length) throw new Error('Native assessor tools were not disabled');
    if (session.model?.provider !== provider || session.model?.id !== parts.join('/')) throw new Error('Native assessor model did not match');
    session.setThinkingLevel?.('low');
    if (signal.aborted || cancelled) throw new Error(expired ? 'Assessment timed out' : 'Assessment cancelled');
    await session.prompt(request.input);
    const messages = session.state.messages;
    const replies = messages.filter(m => m.role === 'assistant');
    const last = replies.at(-1);
    const measured = replies.map(m => m.usage).filter(Boolean);
    if (measured.length) usage = {
      input_tokens: measured.reduce((n,u) => n + (u.input ?? 0) + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0), 0),
      output_tokens: measured.reduce((n,u) => n + (u.output ?? 0), 0),
      cached_input_tokens: measured.reduce((n,u) => n + (u.cacheRead ?? 0), 0),
    };
    if (cancelled || signal.aborted) throw new Error(expired ? 'Assessment timed out' : 'Assessment cancelled');
    if (messages.some(m => m.role === 'toolResult') || replies.some(m => Array.isArray(m.content) && m.content.some(c => c.type === 'toolCall'))) throw new Error('Native assessor attempted a tool call');
    if (!last || last.stopReason === 'error' || last.stopReason === 'aborted' || !usage) throw new Error('Native assessor did not complete');
    if (session.model?.provider !== provider || session.model?.id !== parts.join('/') || (last.provider && last.provider !== provider) || (last.model && last.model !== parts.join('/'))) throw new Error('Native assessor model changed during inference');
    if (usage.output_tokens > request.maxOutputTokens) throw new Error('Assessment exceeded its output target; usage was already incurred.');
    const text = typeof last.content === 'string' ? last.content : last.content.filter(c => c.type === 'text').map(c => c.text).join('');
    return { text, usage, elapsedMs: Date.now() - started, model: request.model, completedModel: { provider: last.provider || session.model.provider, modelId: last.model || session.model.id, source: last.model ? 'Assistant completion' : 'Session completion' } };
  } catch (error) {
    if (usage) error.receipt = { usage, elapsedMs: Date.now() - started };
    throw error;
  } finally {
    // Keep admission closed until the real provider/factory and cleanup settle.
    // A timed-out request never permits a second orphaned model call.
    try { await session?.dispose?.(); }
    finally { if (cwd) await rm(cwd, { recursive: true, force: true }); if (leases.get(root) === lease) leases.delete(root); }
  }
  })();
  if (signal.aborted) abort();
  try { return await Promise.race([work, stopped]); }
  catch (error) { if (usage) error.receipt = { usage, elapsedMs: Date.now() - started }; throw error; }
  finally { clearTimeout(timeout); signal.removeEventListener('abort', abort); }
}

