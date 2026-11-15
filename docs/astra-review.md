# Astra concept, process and implementation review

Reviewed 2026-11-15 by **GPT-6 Astra**, explicitly requested by the project owner. This was an AI-assisted code and design review, not a human user study, security audit, vendor endorsement, or deployment approval. The review covered the operating contract, prototype architecture, all prototype source files, tests, and the local trial receipt.

## Recommendation

Publish as an early community **design and policy prototype** after correcting the small implementation findings. Keep automatic selection unavailable. Current evidence does not qualify live task monitoring, installed UI, plugin-native assessment, or executor routing.

Astra's strongest product recommendation was to retain Fusion's native model control and add a compact assessment block beside Definition. Put detail and history near Activity/Stats; avoid thirteen equally prominent controls or a second scheduler. Show the native selection, the suggestion, the reason, and preview/advisory status. Free-text guidance should help assessment, not bypass policy.

## Findings and response

| Priority | Finding in initial prototype | Response |
| --- | --- | --- |
| P2 | Closing at minute 5 and observing at minute 65 added 60 minutes of `verified` time | Terminal accounting stops immediately; later transitions are rejected. Regression added. |
| P2 | Equivalent result strings across attempts triggered no-progress even when acceptance evidence advanced | Checkpoints require host-owned evidence snapshots. New or unknown evidence prevents the diagnosis; same-attempt duplicates do not count. Regressions added. |
| P2 | `native_baseline` mislabeled the plugin's configured default as Fusion's choice | Renamed `configured_baseline`. Historical receipt keeps the original label with an explanatory note. |
| P2 | Impossible history such as 50 successes in 12 attempts qualified a model; some malformed settings were accepted | Validate host assessment, policy and candidate history; reject impossible counts and the unreachable smoothed 100% threshold. Regressions added. |
| P2 | A generic `no_qualified_model` could not explain candidate exclusions | Added per-candidate bounded reason codes and sample coverage, including capability, history, funding, authentication, override and availability. Regression added. |

The initial 10 tests passed despite these gaps. The revised suite has 16 passing tests. Passing these tests establishes the specified local helper behavior, not a live integration.

## Process concerns retained in the design

- **Recommendations are advisory.** A split/discovery suggestion can coexist with a native model override. It cannot erase the override, start work, or create an implicit hold.
- **Scope thresholds are heuristics.** More than two outcomes is a review signal, not proof that an otherwise cohesive task must be split.
- **Distinct model facts.** Recommendation, native resolution and actual session acknowledgement have different authority. The paused local trial resolved Sol but launched no Sol session.
- **Boundaries require enforcement.** The assessment helper passes limits to a callback; an admitted host adapter must enforce tools, deadline, token caps, identity and budget.
- **Characters are not tokens.** The task-data character limit does not include harness context or cap total inference cost.
- **A small UI needs progressive disclosure.** Default card first; candidate exclusions, price provenance, limits and calibration details expand on demand. Project settings hold advanced defaults.

## Strengths identified

Astra highlighted the separation of assessment from execution authority, recommendation from actual model, CI queue from job execution, capacity problems from capability gaps, and unknown time from confirmed work. Conservative unknown-price handling, zero default paid-request allowance, bounded telemetry and explicit integration limitations support an honest prototype.

## Remaining release boundaries

The public package has no live task hooks, native task card, integrated model adapter, durable event stream, automatic price/account refresh or automatic dispatch. Lifecycle work still needs attempt fencing, idempotency, waits/deadlines and explicit pause/cancel/failure semantics. Quality and savings claims require evaluation with comparable verified outcomes and assessor overhead included.

## Follow-up verification

Astra re-reviewed the corrections and public documentation and ran the standalone repository tests: **16 passed, 0 failed**. It confirmed that all five original findings were resolved within prototype scope and found no serious new regression. It judged the public claims accurate and the compact task-card design appropriate for Fusion, while retaining every release boundary above. Two final wording corrections clarify that tests exercise recommendations, not dispatch, and that commands run from this standalone repository.

Verdict: suitable for public feedback as an early community prototype; not qualified for live monitoring, plugin-native assessment, automatic routing, usability or production deployment.
