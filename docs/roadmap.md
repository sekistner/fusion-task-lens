# Roadmap: earn trust before dispatch authority

## 0. Public exercise — current

Runnable scenarios, bounded assessment schema, advisory policy, local OTLP round trip, sanitized trial receipt, explicit product design, and independent Astra review. Publish limitations beside the product story. Automatic selection remains unavailable/off.

## 1. One useful advisory task card

Implement one explicit Assess task action using an admitted controller adapter. Enforce tools, deadline, input/output token and assessor budget bounds; bind persistence to task revision and policy/catalog versions. Display the short recommendation, uncertainty and useful next check; provide a source-stamped native resolution readback and session confirmation where supported. Add stale/unavailable states and a price/limits drawer.

Acceptance: in a disposable Fusion project, a user can assess, edit, reassess, inspect price provenance and continue the normal workflow while the plugin cannot alter native selection, approvals or task holds. Failures leave Fusion usable. Verify the session actually launched separately from its resolution.

## 2. Explain real waiting and interruptions

Define durable task/attempt/sequence identities, authority for each producer, state transitions, wait dependency/deadline, explicit paused/cancelled/failed outcomes and idempotent import. Fence old-attempt events. Integrate native worker, approval and CI evidence. Add optional OTLP correlation and exporter failure reporting outside task transactions.

Acceptance: task edits, reset, late callbacks, duplicate events, approval holds, healthy CI waits, worker loss, restart and collector failure produce accurate history without changing workflow verdicts. Time totals stop at closure. Unknown time is visible.

## 3. Calibrate recommendations

Collect comparable verified outcomes, record coverage, distinguish capability failures from infrastructure, and compare to Fusion's existing selection policy. Measure total tokens including assessor overhead, useful outcome rate, rework, active time and waiting. Do not generalize a single task or a smoothed point estimate into a quality guarantee.

Acceptance: a predeclared evaluation can establish whether advice improves decisions enough to justify its latency and cost. No improvement is assumed.

## 4. Optional automatic selection — separate future decision

Only after explicit user opt-in, add a supported awaited native dispatch boundary that checks fresh task, attempt, model and budget identity atomically. Preserve overrides, role/column routing, native fallbacks, holds and approvals. Verify effective model through actual session acknowledgement across start, retry and resume. Production deployment remains under the host owner's release controls.

This stage has no implementation or enabled flag in the prototype. Installing or publishing this repository never authorizes it.
