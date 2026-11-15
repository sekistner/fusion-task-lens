# A small decision aid in the existing Fusion workflow

Status: proposed interface, not an installed dashboard. These requirements respond to a process/UI review by GPT-6 Astra. They are design judgments to test with users, not usability-study results.

## The operator's questions

Before starting: “Is this task clear enough, and what might make it fail?”
During work: “Is it progressing, waiting, blocked, or no longer observable?”
After work: “Did it meet the acceptance check, and what explains the time and model choice?”

Place a compact assessment card beside the task definition. Keep changes and decisions in the native activity history, and time breakdowns with Stats. Avoid making users visit a new control center to start ordinary work. A dedicated task tab is a possible later detailed view, not the minimum useful product.

## Default card

```text
Task assessment                          Advisory · automatic selection off

Recommended  Terra
Why          Configured default; 0 comparable verified outcomes
Fusion resolved  Sol                     Checked against task revision 4
Session confirmed  Not started

Scope  2 outcomes    Uncertainty  Medium
Next check  Compare authoritative writes with the displayed retry counter

[Assess task]  [Prices & limits ▾]  [Why this recommendation ▾]
Optional guidance: [Prefer one discriminating test.                 ]
```

This example uses the trial model names, not universal provider defaults. “Why” should state whether the answer comes from policy, history, or a model judgment. Do not display a numerical intelligence score or uncalibrated success probability.

“Fusion resolved” needs its scope: task revision, role/workflow stage, settings revision, and check time. Before a supported native read is available, show “Not checked.” Only a provider/session acknowledgement can populate “Session confirmed.” A fallback creates a new event showing the reason and effective model; it does not rewrite the original recommendation.

## The normal flow

1. The user writes a task and its acceptance criteria. Nothing calls a model yet.
2. **Assess task** checks the assessor's account, cost and enforced limits, then makes one bounded call. Show progress and permit cancellation where the adapter can enforce it.
3. The assessment appears with its source revision, uncertainty, pitfalls and one useful next check. It may recommend a model, a discovery step, a scope split, or resolving a prerequisite.
4. The user continues through Fusion's normal workflow. In advisory mode, advice neither dispatches work nor holds the task, and it cannot replace an explicit native override.
5. An observed native resolution and confirmed session are added separately when available. Native pause, approval, cancellation and workflow semantics retain their authority.
6. Independently verified outcomes become eligible feedback only after classification. Infrastructure failures do not count as model incapability.

A scope change marks the assessment **out of date**, with a reason and an explicit reassess action. It must not silently issue another paid call. A model/settings/catalog change invalidates the recommendation independently of the underlying assessment.

## Failure and waiting states

| Situation | User-facing message | Action |
| --- | --- | --- |
| Assessor times out or produces invalid output | “Assessment unavailable. Fusion's settings are unchanged.” | Retry explicitly; show prior assessment as stale |
| Assessor quota or price is unknown | “Assessment cannot be started within the current policy.” | Inspect account/limits; do not pretend executor quota applies to assessor |
| Suggested model unavailable | “Recommendation unavailable under current constraints.” | Show each rejection reason; retain native model readback separately |
| Task text changed while assessing | “Assessment belongs to an earlier revision.” | Discard as current; retain only as history |
| CI queue progresses normally | “Waiting for a runner,” with dependency and next check | Inspect queue; do not label a loop |
| Last heartbeat expires | “Worker status unknown since [time].” | Reconcile worker/session state before retrying |
| Human approval is pending | Native approval remains primary | Link the native approval; do not add a second approval system |
| OTLP export fails | “Telemetry delivery failed; task state unchanged.” | Inspect exporter status outside the task verdict |

The current lifecycle helper models active/waiting/blocked/unknown/done only. Explicit pause, cancellation, failure and wait deadlines require event-contract work before this becomes a live monitor. A missing heartbeat is not proof of a crash.

## Progressive settings

Most users should leave defaults alone. Use model menus populated from the admitted host catalog; never require users to guess provider/model identifiers.

| Group | Normal settings | Advanced settings |
| --- | --- | --- |
| Assessment | Assessor model, project guidance | Task-data character limit, output cap, deadline, assessor spend policy |
| Recommendation | Baseline and model preference order | Scope threshold, comparable-outcome minimum, observed-rate threshold |
| Execution estimate | Paid request ceiling, output reserve | Context headroom, price freshness, whole-attempt reservation integration |
| Observability | Enable optional export | Collector configuration, retention, dropped-event counters |

Only the settings in `manifest.json` are implemented in the prototype schema. Assessor spend policy, live catalog refresh, freshness enforcement and telemetry UI above are requirements. The default paid executor request estimate ceiling is $0; this is neither a whole-task spend cap nor an assessor spend cap.

Free text is guidance for assessing the work, not a way to set budgets, add models, grant tools or override workflow controls. Explain that near the field without exposing internal implementation terminology.

## Prices and limits drawer

Each model row must show billing type; input/output/cached token prices per million with currency, source and timestamp; context and maximum output; estimated request tokens; account quota status; and why it is eligible or rejected. Unknown is a first-class display value. Use a conservative cold-cache estimate unless cache eligibility is established. Display subscription usage separately from incremental metered cost.

Keep three budgets separate: assessor call, executor request estimate, and whole attempt. Enforcing a limit requires a host/provider adapter; passing a number in a request object is not enforcement. Native configured models can differ from the recommendation policy's admissible candidates; display both rather than claiming one is a verified executable route.

## Usability checks before implementation is called usable

Ask a Fusion user to identify the recommended model, the resolved model and the one actually running; explain why they differ; edit a task and notice staleness; recover from failed assessment without losing work; distinguish queue delay from execution time; and find advanced price/limit details without traversing every setting. Record errors, time to decision and whether the next step was clear. No such user study has run yet.
