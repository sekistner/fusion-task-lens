import { randomBytes } from 'node:crypto';
import { phases, reasons, states } from './policy.mjs';

const attribute = (key, stringValue) => ({ key, value: { stringValue } });
const nonzeroHex = bytes => {
  let id;
  do { id = randomBytes(bytes).toString('hex'); } while (!/[1-9a-f]/.test(id));
  return id;
};

// Export only enumerated timing data. Evidence, prompts, source and task contents stay in Fusion.
export function traceFor(intervals, startedAt) {
  if (!Number.isSafeInteger(startedAt) || startedAt < 1 || intervals.length < 1 || intervals.length > 64) {
    throw new Error('Invalid trace bounds');
  }
  const traceId = nonzeroHex(16);
  const rootId = nonzeroHex(8);
  const nanos = minutes => String(BigInt(startedAt) * 1_000_000n + BigInt(minutes) * 60_000_000_000n);
  const spans = intervals.map(({ at, end, phase, state, reason }) => {
    if (!phases.includes(phase) || !states.includes(state) || !reasons.includes(reason)
      || !Number.isSafeInteger(at) || !Number.isSafeInteger(end) || at < 0 || end < at) {
      throw new Error('Invalid trace interval');
    }
    return {
      traceId, spanId: nonzeroHex(8), parentSpanId: rootId, name: 'fusion.task.' + phase, kind: 1,
      startTimeUnixNano: nanos(at), endTimeUnixNano: nanos(end),
      attributes: [attribute('fusion.task.state', state), attribute('fusion.task.reason', reason)],
    };
  });
  const root = {
    traceId, spanId: rootId, name: 'fusion.task.attempt', kind: 1,
    startTimeUnixNano: nanos(Math.min(...intervals.map(interval => interval.at))),
    endTimeUnixNano: nanos(Math.max(...intervals.map(interval => interval.end))),
  };
  return {
    traceId, payload: {
      resourceSpans: [{
        resource: { attributes: [attribute('service.name', 'fusion-task-observability-prototype')] },
        scopeSpans: [{ scope: { name: 'fusion.task.observability' }, spans: [root, ...spans] }],
      }],
    },
  };
}

// Endpoint is trusted host configuration. Call outside the task state transaction.
export async function postTrace(endpoint, payload) {
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || url.search || url.hash || !url.pathname.endsWith('/v1/traces')) {
    throw new Error('Invalid OTLP trace endpoint');
  }
  const response = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    redirect: 'error', signal: AbortSignal.timeout(3000),
  });
  if (response.status !== 200) throw new Error('OTLP receiver returned HTTP ' + response.status);
  const result = await response.json();
  if (Number(result.partialSuccess?.rejectedSpans ?? 0) > 0) {
    throw new Error('OTLP receiver rejected spans');
  }
}
