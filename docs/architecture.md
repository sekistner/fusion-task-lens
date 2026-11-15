# Task assessment and model selection in Fusion

Fusion is the task record, decision point, and operator UI. The plugin owns the assessment and recommendation. Fusion's engine owns dispatch, holds, and the effective model. An optional OpenTelemetry collector receives execution data for correlation with infrastructure. The operator can read the task and its reasoning summary without a collector.

## Working local integration and scenario prototype

The [disposable integration](../local/README.md) installs a task card into Fusion 0.77.0's Definition view. An explicit click invokes a tool-free local Codex assessor, persists its receipt outside the task record, reads native model resolution, and fetches public provider prices. Project defaults are stored in Fusion's plugin settings. The integration uses an exact-version temporary dashboard patch; it is not an upstream dashboard extension or production release.

`npm test` exercises the local routes and synthetic policy/lifecycle helpers. `GET /api/plugins/fusion-plugin-task-observability/scenarios` still returns six synthetic runs; its OTLP round trip is a scenario test, not live task monitoring. There are no live engine callbacks or automatic execution hooks. The remaining lifecycle and routing sections describe the intended contract, not implemented monitoring.

## Task lifecycle

| Phase | Producer and exit evidence |
| --- | --- |
| Intake | Fusion binds project, task, revision, workflow, user intent, and acceptance evidence. |
| Assess | A bounded planner supplies scope, independently verifiable outcomes, capability demands, dependencies, missing prerequisites, uncertainty, anticipated failure modes, and one inexpensive check that could change the assessment. Store the assessment with its source, author, and revision. Reopen it when scope or evidence changes. |
| Route | The policy returns a candidate and reason, a discovery check, a decomposition proposal, or a blocker. Record rejected candidates by reason, policy revision, sample coverage, and recommendation. Keep recommendation, resolved model, and actual session model distinct. |
| Dispatch | Fusion checks the task revision, checkout epoch, attempt generation, approval or pause state, budget, credential availability, and worker requirements before claiming the attempt. Record queue entry, worker assignment, and worker ready as separate facts. |
| Execute | The controller records liveness. Agent checkpoints declare progress and waits with dependency reference, next check and deadline. Persist recoverable evidence before suspension. |
| Verify | Record result and source identity for each acceptance check. Link CI queue entry, job start and completion independently. Native review and workflow results keep their existing authority. |
| Close | Record the terminal outcome, evidence, time breakdown, and any linked child tasks. Use verified outcomes to update capability history. |

Each event needs a task-bound sequence, attempt identity, phase, state, source, timestamp, reason, and optional typed evidence reference. Store active, waiting, blocked and terminal transitions independently of the phase. Derive stale liveness from a supervisor clock. Attribute the uncovered interval after the last heartbeat to unknown. A known wait ends when its dependency signals or its deadline fires. A crash, cancellation and pause each have distinct evidence. Late events from an old attempt remain historical and cannot update the current attempt.

At each result checkpoint, the host supplies an acceptanceEvidence array of stable evidence references. Missing evidence is unknown and cannot establish a loop. A no-progress checkpoint requires two distinct attempts with equivalent outcomes and no new acceptance evidence. At that point choose one bounded next check, revise scope, or ask for the concrete dependency. Repeated polling of a progressing CI job does not count as a new attempt. A retry after worker loss requires source reconciliation and fencing the old execution. Superseding the model requires fresh evidence about the capability gap and a new dispatch decision.

## Routing and calibration

The policy follows MetaCogAgent's assessment, delegation, and feedback pattern. The assessor reports uncertainty and capabilities. Fusion applies task and workflow constraints and uses verified results for comparable work. It does not use the model's verbal probability as an observed completion rate.

Keep the normal Task UI to the recommendation, reason, and optional free-text note. Project settings hold the defaults, organized into Assessment, Routing, and Limits. Terra is the configured assessor and baseline. The assessor's default envelope is 12,000 input characters, a 1,200 output-token target checked after generation, one tool-free call, and 30 seconds. The executor reserves 8,192 output tokens and 20% context headroom. Paid execution estimates default to a zero USD ceiling.

The assessor receives the task, the project guidance, and the optional per-task note as data. Its validated output describes the task and cannot pick a model, grant permissions, or change a limit. The local adapter invokes the signed-in Codex CLI with tools, apps, hooks and web search disabled, a read-only sandbox and a disposable working directory. It enforces task-data length and a process deadline and supports cancellation. The output target is checked after generation: it is not a provider generation cap or assessor spend cap. Failed output-target checks retain known token usage. Assessor subscription quota remains unknown until the provider responds. Native model resolution remains visible on assessor failure.

The local card uses the configured baseline/preference order within estimated numeric limits. It does not apply the synthetic history/capability policy as if that history or executor admission had been observed. Capability fit and access stay explicitly unverified. Concurrent card saves use revision checks; the native plugin settings store does not provide an atomic compare-and-swap across every possible native writer.

Each model row should show its context and output limits, quota or billing type, price per million input/output tokens, source and time of the price, and estimated request cost using a cold cache. Use Fusion's enabled runtime catalog and the controller's account/budget state as inputs. Do not interpret the subscription catalog's zero cost as zero usage. Missing or stale prices are unknown, and an estimated cost alone cannot authorize a paid run. The reservation for a whole attempt belongs to the native spend gate.

Prototype thresholds are synthetic policy choices. More than two independent outcomes proposes decomposition. High uncertainty proposes bounded discovery. Required capabilities, prerequisite checks, explicit native overrides, allowed models, authentication, budget and availability constrain routing. The candidates arrive in owner-defined preference order. Per-candidate decisions expose bounded exclusion reasons and sample counts. Host facts and histories are validated; impossible success counts and a smoothed 100% target are rejected. A sparse-history fallback is labeled `configured_baseline`, not a native Fusion choice. A model with at least 12 comparable results qualifies at a smoothed observed pass rate of 0.8. With sparse history, the policy uses the authorized baseline or reports that no model qualified. This rate is an estimate with limited confidence. Cohorts should key on task class, verification rigour, provider/model version, and harness. Quota, missing input, cancellations, infrastructure failures and unknown outcomes belong in operational counts and outside the capability denominator. Report sample coverage and rework, and compare against the existing policy before switching a live cohort.

## Fusion integration

- **Placement.** Keep the assessment beside Definition and decision history beside Activity/Stats. If operators need a combined view, register a native `task-detail-tab` in the dashboard bundle using the Quality plugin's QA tab as the precedent.
- **Shadow mode.** Run the planner on explicitly opted-in tasks before dispatch when practical, persist a task-scoped assessment and recommendation, and compare the recommendation to Fusion's actual model and independently verified result. Do this with the native engine still selecting the model.
- **Applying a route.** Fusion 0.77 task-created and task-moved hooks run without awaiting their results. The v2 workflow `work-engine` extension does run before native model resolution in `runImplementation` and can park work, but its result types carry no model pair and its placement follows the execution lock claim. A pre-execution workflow node is a candidate for persisting the assessment. Prove the transition to executor reads a fresh, fenced route, or add an explicit engine seam that accepts the recommendation under its dispatch transaction. Verify effective and actual model through normal dispatch, column overrides, role-routed execution, resume, retry, and policy changes. Preserve an explicit operator override and record any native fallback.
- **Packaging.** Managed Fusion installations may restrict plugins to an approved immutable list. Installing this prototype does not change that list. A native dashboard tab requires host-side registration. Keep plugin data access project/task-scoped. The synthetic route makes no database writes; the local settings route updates only its own plugin settings. Assessment receipts are project/task/settings-bound local sidecars.
- **OpenTelemetry.** Use OTLP/HTTP to the operator-configured collector. Keep detailed assessment text and evidence references in Fusion. Store the trace link on the Fusion attempt and export bounded typed phase, state, and reason data. Extend the existing runtime's controller telemetry only after checking the collector route and confirmed ingestion. Export outside the task state transaction and report dropped data separately. A receiver error has no effect on a workflow verdict.

## What to measure

| Symptom | Evidence | Decision it supports |
| --- | --- | --- |
| Tasks are too large | Independent outcomes, median and p90 active time, rework and verified completion by scope cohort | Split along independently verifiable outcomes when the larger cohort repeatedly needs rework. |
| CI is slow | Queue time versus job execution time, grouped by runner pool and workflow | Increase or rebalance slots when queue time dominates. Profile jobs and measure cache misses or repeat setup when execution time dominates. |
| Required capacity is missing | Blocked minutes, time to ready, eligible slots and demand by requirement | Add or repair the compatible pool, or adjust scheduling. A model change leaves this requirement in place. |
| An agent is looping | Distinct attempts, equivalent outcomes, acceptance evidence and active time | Try a different bounded check, revise scope or change model when the evidence supports a capability gap. |
| A worker disappeared | Last heartbeat, unknown interval, worker exit and checkpoint reconciliation | Resume a fenced attempt or investigate worker reliability. Count unknown time separately. |

Before enabling routing, replay these cases against one disposable Fusion project, verify the displayed evidence and model actually launched, and prove that pauses, native approval gates, missing capacity and exporter failure leave their intended task behavior intact.
