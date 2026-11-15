# Assessment tab and evidence loop — 15 November 2026

This is actual disposable Fusion 0.77.0 UI evidence using the signed-in real Terra assessor. The task and Git repository are synthetic; the observations and model calls are real. The engine was disabled throughout. Existing live tasks were not used for this fixture.

## User flow observed

1. Assessment is a native task tab beside Definition; Definition has a compact status/link.
2. The real assessor requested source evidence. An unbound checkout produced an unavailable receipt, and the next assessment asked for the missing binding rather than claiming success.
3. After the operator bound the disposable fixture, earlier evidence became historical. Browser testing found and fixed a macOS canonical-root alias issue. The assessor also now receives the supported check's scope, availability and remaining budget so an old unavailable receipt does not hide an available check.
4. Clicking **Check source & reassess** observed the actual expected commit and clean root checkout, saved immutable evidence, and called Terra once with that receipt. The result changed to **Assessment current**, explicitly resolving source identity only. No recorded review was found; it did not claim tests ran or a native review requirement was waived.
5. **Open workflow** selected native Workflow Overview. **Open Fusion Model settings** selected native Model Configuration, showing the existing Sol default. Neither link changed a model or task state.
6. Assessment settings saved deadline 25→30 seconds and retained it on reopening; it was restored to 25. An unsaved guidance edit was discarded. Automatic selection stayed off. Prices/limits showed configured limits, provider price timestamps, unknown subscription incremental cost, and actual assessor usage separately.

The positive reassessment consumed 13,460 input and 166 output tokens in 7.7 seconds. Input includes the CLI harness; it is not a task-only estimate or a benchmark.

## Tests and independent review

44 automated tests passed. Coverage includes real Git source observation, evidence consumption, unchanged task holds, failed reassessment/evidence reuse, operation-ID deduplication, source drift, cancellation, historical provenance, unreadable journal handling, shared source admission, canonical-root aliases/escapes, helper refusal, and native-session quarantine across module reloads. The clean/process-filter regression fails with the helper guard removed and passes with it restored.

Astra independently reviewed source and the actual result screenshot, reran focused discovery/native tests, and approved the bounded MVP after fixes. Findings addressed: repository helper execution, complete external source matching, durable atomic history, historical/invalidated labels, incomplete branch bindings, corrupt-journal budget uncertainty, native assessor leases, and assigned-agent explanation. A minor remaining wording issue is that the compact review line says “no” for both absent and mismatched records; the full receipt and conclusion distinguish them.

The dashboard uses a versioned asset directory. Browser testing demonstrated why renaming only the entry fails: lazy chunks can re-import the original entry. The directory keeps all relative imports on one UI version.

## Boundaries

The machine check reads source identity, root cleanliness excluding submodule contents, base ancestry and recorded review identity. It does not run tests, inspect source contents, probe infrastructure, dispatch executors or advance workflow steps. Other evidence is operator-reported and unverified. There is no automatic retry or automatic model selection. Evidence history is not a complete execution audit or live OTLP event stream.

Screenshots: [result](../assets/screenshots/assessment-loop.jpg), [settings](../assets/screenshots/assessment-settings.jpg), [prices](../assets/screenshots/assessment-prices.jpg). Deployment is recorded separately by the installation owner; these screenshots prove the disposable UI, not a production rollout.

## Native managed-instance verification

The same published backend and dashboard were subsequently deployed through the installation owner's image/Flux controls. A real manual assessment in the running instance requested source evidence; the bounded check observed a clean expected commit and matching full recorded review identity. The native Terra reassessment consumed that receipt, returned `discovery: none`, and explicitly left test execution, patch contents and delivery unverified. It used 5,763 input and 201 output tokens in 5.7 seconds.

Astra inspected the live UI screenshot and found no visual or process blocker. All 329 existing tasks retained content, source bindings, models, workflow decisions and holds; native observation timestamps advanced normally. Automatic model selection stayed off and existing plugin settings were unchanged. Private task details and the live screenshot are not published here.

Some legacy tasks already returned an unavailable native assessment context before this release. The new tab exposes the unavailable state; this release does not repair that existing context-resolution limitation.
