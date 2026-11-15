# Disposable local trial, 2026-11-15

This is the initial historical CLI trial. The newer [working-card verification](ui-verification.md) records assessment initiated inside Fusion, saved settings, and actual screenshots.

This is a historical observation, not a reproducible end-to-end runner included in this package. The original private scratch harness and credentials are not published. The sanitized [JSON receipt](../examples/local-trial.json) preserves the original result labels and adds explanatory notes.

Fusion 0.77.0 loaded the plugin and served six synthetic scenarios. A separate local Codex CLI adapter called the configured Terra assessor against a synthetic queue-service diagnosis. It requested schema-constrained output, disabled tools, enforced a wall-clock deadline, checked completion usage, and verified no tool events. Its requested model-output cap was not enforceable through that CLI; 106 output tokens were observed. The package's adapter interface still requires a controller that enforces output limits before live integration.

The task asked for the smallest plausible cause of a retry counter resetting when a worker reconnects, and one test distinguishing an out-of-order shared-row write from display caching. No real repository or infrastructure diagnosis was performed.

The native model resolver was invoked from an unmodified Fusion bundle exposed by a scratch export, with the disposable task and effective settings. Deliberately configured global settings resolved Sol; a Terra counterfactual resolved Terra. A task document containing the result was written and read back through the local Fusion API. The engine remained paused and the task remained todo with no model override. No executor session started. The local services were stopped afterward.

## What the receipt establishes

- A real assessor call returned a task assessment: two outcomes, review capability, medium uncertainty, a discriminating test and three pitfalls.
- Local recommendation policy chose Terra with no comparable history, using its configured baseline.
- Native resolution selected Sol independently. The receipt's old `native_baseline` reason was misleading and is now `configured_baseline` in the code.
- Observing and recording that difference did not enable automatic routing.

## Limits and prices in the local snapshot

| Model | Context | Maximum output | Billing / prices per 1M tokens |
| --- | ---: | ---: | --- |
| Terra | 500,000 | 128,000 | Subscription; incremental cost unknown |
| Sol | 500,000 | 16,384 | Subscription; quota/authentication unverified in the trial |
| DeepSeek V4.1 Flash | 128,000 | 16,384 | Historical pinned USD 0.20 input / 0.60 output / 0.006 cache read; freshness unverified, rejected |

These are **trial catalog values**, not official current model specifications, entitlements or a promise of access. The paid ceiling was zero. No paid candidate ran. Provider pricing changes, including promotions, must be fetched and timestamped by a future host adapter. A subscription's zero catalog price does not establish zero economic cost or unlimited use.

The assessor reported 12,138 input tokens and 106 output tokens over 10.337 seconds. Task-data character limits exclude harness instructions; they cannot be used as total input-token or cost limits.

## Still unproven

There is no integrated plugin-native assessor call, no confirmed Sol executor session, no durable lifecycle event collection, no installed task card, no live price/account catalog, no whole-attempt budget gate, and no measured routing quality or savings. All source tests are local policy/transport tests. Passing them is not a runtime or deployment qualification.
