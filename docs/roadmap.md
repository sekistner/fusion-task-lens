# Roadmap: earn trust before dispatch authority

## 0. Public exercise — available

Runnable scenarios, bounded assessment schema, advisory policy, local OTLP round trip, sanitized trial receipt, explicit product design, and independent Astra review. Publish limitations beside the product story. Automatic selection remains unavailable/off.

## 1. One useful advisory task card — local implementation available

The disposable Fusion 0.77.0 card now provides explicit assessment, cancellation, task/settings binding, persisted receipts, native executor resolution, a fresh public price drawer, and project defaults with validation and discard/conflict recovery. [Verification and screenshots](ui-verification.md) document an actual call from the UI. Automatic selection remains off.

Remaining qualification: supported upstream dashboard registration; portable provider/account catalogs; provider-enforced token/spend limits; actual session acknowledgement; broader browser and human-user testing. The local CLI enforces time and input bounds but checks the output target after generation. It cannot prove executor access or model quality. Source publication is not production deployment.

## 2. Explain real waiting and interruptions

Define durable task/attempt/sequence identities, authority for each producer, state transitions, wait dependency/deadline, explicit paused/cancelled/failed outcomes and idempotent import. Fence old-attempt events. Integrate native worker, approval and CI evidence. Add optional OTLP correlation and exporter failure reporting outside task transactions.

Acceptance: task edits, reset, late callbacks, duplicate events, approval holds, healthy CI waits, worker loss, restart and collector failure produce accurate history without changing workflow verdicts. Time totals stop at closure. Unknown time is visible.

## 3. Calibrate recommendations

Collect comparable verified outcomes, record coverage, distinguish capability failures from infrastructure, and compare to Fusion's existing selection policy. Measure total tokens including assessor overhead, useful outcome rate, rework, active time and waiting. Do not generalize a single task or a smoothed point estimate into a quality guarantee.

Acceptance: a predeclared evaluation can establish whether advice improves decisions enough to justify its latency and cost. No improvement is assumed.

## 4. Optional automatic selection — separate future decision

Only after explicit user opt-in, add a supported awaited native dispatch boundary that checks fresh task, attempt, model and budget identity atomically. Preserve overrides, role/column routing, native fallbacks, holds and approvals. Verify effective model through actual session acknowledgement across start, retry and resume. Production deployment remains under the host owner's release controls.

This stage has no implementation or enabled flag in the prototype. Installing or publishing this repository never authorizes it.
