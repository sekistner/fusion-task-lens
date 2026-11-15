# A small decision aid in the existing Fusion workflow

Status: the assessment card, settings and price drawer now run in a disposable Fusion 0.77.0 dashboard. See [actual screenshots and verification](ui-verification.md). Lifecycle history and calibrated model selection remain proposals. Astra reviewed the design and implementation; this is not a human usability study.

## The operator's questions

Before starting: “Is this task clear enough, and what might make it fail?”
During work: “Is it progressing, waiting, blocked, or no longer observable?”
After work: “Did it meet the acceptance check, and what explains the time and model choice?”

Place a compact assessment card beside the task definition. Keep changes and decisions in the native activity history, and time breakdowns with Stats. Avoid making users visit a new control center to start ordinary work. A dedicated task tab is a possible later detailed view, not the minimum useful product.

## Default card

```text
Task assessment                          Advisory · automatic selection off

Policy suggestion  Terra
Why          Configured default; 0 comparable verified outcomes
Fusion resolved  Sol                     Checked against task revision 4
Session confirmed  Not checked

Scope  2 outcomes    Uncertainty  Medium
Next check  Compare authoritative writes with the displayed retry counter

[Assess task]  [Prices & limits ▾]  [Why this recommendation ▾]
Optional guidance: [Prefer one discriminating test.                 ]
```

This example uses the trial model names, not universal provider defaults. “Why” should state whether the answer comes from policy, history, or a model judgment. Do not display a numerical intelligence score or uncalibrated success probability.

“Fusion resolved” needs its scope: task revision, role/workflow stage, settings revision, and check time. Before a supported native read is available, show “Not checked.” Only a provider/session acknowledgement can populate “Session confirmed.” A fallback creates a new event showing the reason and effective model; it does not rewrite the original recommendation.

## The normal flow

1. The user writes a task and its acceptance criteria. Nothing calls a model yet.
2. **Assess task** validates the saved task and settings, then makes one explicit subscription call with a process deadline and cancellation. Account quota and incremental subscription cost are unknown. Output tokens are checked after generation; the target does not cap provider generation.
3. The assessment appears with its source revision, uncertainty, pitfalls and one useful next check. It may recommend a model, a discovery step, a scope split, or resolving a prerequisite.
4. The user continues through Fusion's normal workflow. In advisory mode, advice neither dispatches work nor holds the task, and it cannot replace an explicit native override.
5. An observed native resolution and confirmed session are added separately when available. Native pause, approval, cancellation and workflow semantics retain their authority.
6. Independently verified outcomes become eligible feedback only after classification. Infrastructure failures do not count as model incapability.

A scope change marks the assessment **out of date**, with a reason and an explicit reassess action. It must not silently issue another paid call. Project-default changes also mark the assessment out of date. The current card recomputes its policy preview against fresh catalog data without another model call.

## Failure and waiting states

| Situation | User-facing message | Action |
| --- | --- | --- |
| Assessor times out or produces invalid output | “Assessment unavailable. Fusion's settings are unchanged.” | Retry explicitly; show prior assessment as stale |
| Assessor subscription quota is unknown | “One subscription call,” with unknown incremental price | The explicit call may fail at the provider; do not pretend executor quota applies to assessor |
| Suggested model unavailable | “Recommendation unavailable under current constraints.” | Show each rejection reason; retain native model readback separately |
| Task text changed while assessing | “Assessment belongs to an earlier revision.” | Discard as current; retain only as history |
| CI queue progresses normally | “Waiting for a runner,” with dependency and next check | Inspect queue; do not label a loop |
| Last heartbeat expires | “Worker status unknown since [time].” | Reconcile worker/session state before retrying |
| Human approval is pending | Native approval remains primary | Link the native approval; do not add a second approval system |
| OTLP export fails | “Telemetry delivery failed; task state unchanged.” | Inspect exporter status outside the task verdict |

The current lifecycle helper models active/waiting/blocked/unknown/done only. Explicit pause, cancellation, failure and wait deadlines require event-contract work before this becomes a live monitor. A missing heartbeat is not proof of a crash.

## Progressive settings

The local card has four basic project controls plus guidance. Advanced estimates and fallback order are collapsed. The assessor menu is deliberately limited to the two CLI models admitted by this local adapter; it is not a dynamic account-entitlement catalog.

| Group | Normal settings | Advanced settings |
| --- | --- | --- |
| Assessment | Assessor model, project guidance | Task-data character limit, output cap, deadline, assessor spend policy |
| Recommendation | Baseline and model preference order | Scope threshold, comparable-outcome minimum, observed-rate threshold |
| Execution estimate | Paid request ceiling, output reserve | Context headroom, price freshness, whole-attempt reservation integration |
| Observability | Enable optional export | Collector configuration, retention, dropped-event counters |

The card now edits the settings in `manifest.json`, validates ranges and model identities, saves to native project plugin settings, and offers Discard and conflict Reload controls. Unsaved edits disable assessment. Invalid native settings point users to Settings → Advanced settings → Plugins → Fusion Task Lens for repair. Historical thresholds are explicitly labeled “Scenario calibration only.” The card does not claim that changing these thresholds trains a live selector.

Public metered prices refresh with freshness and promotion-expiry handling. Assessor spend policy, account-quota lookup and telemetry UI remain future work. The default paid executor request estimate ceiling is $0; this is neither a whole-task spend cap nor an assessor spend cap.

Free text is guidance for assessing the work, not a way to set budgets, add models, grant tools or override workflow controls. Explain that near the field without exposing internal implementation terminology.

## Prices and limits drawer

Each model row must show billing type; input/output/cached token prices per million with currency, source and timestamp; context and maximum output; estimated request tokens; account quota status; and the numeric constraint result. Eligibility and executor admission remain unverified in the local card. Unknown is a first-class display value. Use a conservative cold-cache estimate unless cache eligibility is established. Display subscription usage separately from incremental metered cost.

Keep three budgets separate: assessor call, executor request estimate, and whole attempt. Enforcing a limit requires a host/provider adapter; passing a number in a request object is not enforcement. Native configured models can differ from the recommendation policy's admissible candidates; display both rather than claiming one is a verified executable route.

## Usability checks before implementation is called usable

Ask a Fusion user to identify the recommended model, the resolved model and the one actually running; explain why they differ; edit a task and notice staleness; recover from failed assessment without losing work; distinguish queue delay from execution time; and find advanced price/limit details without traversing every setting. Record errors, time to decision and whether the next step was clear. No such user study has run yet.
