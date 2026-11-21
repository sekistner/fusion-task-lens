# Manual assessment on a running Fusion instance

The native adapter uses Fusion 0.77.0's existing signed-in AI factory. It does not need a Codex executable. It creates a separate session in a private empty directory, selects the configured assessor, disables every tool, verifies that selection, and checks the model again at completion. It never claims a task, changes a workflow, or pauses the engine. Only an explicit authenticated POST starts inference.

The native plugin needs an operator-owned `live/installation.json` (excluded from Git) binding `project`, HTTPS `origin`, a private state `root` under `/home/fusion/.fusion/task-lens/`, and `nativeModule` under that root. The read-only resolver module is derived from the exact upstream 0.77.0 bundle by removing its CLI main guard and exporting its three native settings/resolution functions. Keep its dependencies resolvable using the existing installed package. Never change the running server bundle to expose those functions.

Install the package through Fusion's supported authenticated plugin installation API. Keep its files and private assessment receipts on persistent storage. The existing `local-models.json` format holds local configured limits; provider/account entitlement remains unverified. No credential is copied into this package or its configuration: the native factory uses the host's existing credential owner.

The Assessment tab additionally requires registration in the compiled dashboard. The runtime integration uses an exact-hash client patch, passes Fusion's existing authentication-header helper, and hides the card when this project has no backend. It preserves the native server/engine bytes. A production image rollout follows the runtime owner's normal image/Flux controls; a plugin install alone does not install the tab. The patch's exit condition is a supported inline extension point or maintained source integration.

The request deadline returns a timeout and requests provider cancellation. If the factory, provider or disposal is still settling, subsequent assessments are refused until cleanup completes. This prevents overlapping orphaned calls; it is not proof that a remote provider stopped spending tokens at the deadline. Unknown usage stays unknown. The output target is checked after generation and is not a spend cap.

Assessment uses the shared provider account and may consume quota even though it does not occupy Fusion's task-execution slots.

## Standalone workflow routing

Install and enable the plugin in a stock Fusion project. Set `automaticExecutionRouting` to `true` in the project’s Task Lens settings. In a copy of the project's V2 workflow, insert this gate after parsing the plan and before the first execution node. Replace the example project ID with the ID of the project that owns the workflow. Link the gate to the normal executor using a success edge.

```json
{
  "id": "task-lens-choose-model",
  "kind": "gate",
  "extensions": {
    "plugin:fusion-plugin-task-observability:choose-executor-model": {
      "projectId": "proj_example"
    }
  }
}
```

Fusion awaits the gate, then launches its ordinary executor. The gate can set the task's native model fields to Sol when the inherited execution default is Codex Terra and the task has at least three planned steps or a current cross-service assessment. It checks the task again inside Fusion's atomic update and leaves an existing model or credential choice in place. The normal task Model tab can change or clear a selection. Disabling the project setting stops future selections. The Assessment tab is optional for plan-based routing.

## Source discovery admission

Add `allowedCheckoutRoots` to the private installation configuration: an array of absolute owner-approved checkout directories. An empty array disables machine discovery. Paths must resolve inside those roots; external execution and review bindings must resolve to the same checkout and include exact head, base and branch. Content-filter repositories are refused before Git status can invoke helpers. Discovery reads fixed Git facts only, disables fsmonitor/hooks/external diffs and lazy fetching, and ignores submodule content explicitly.

Stage a versioned package and use the supported plugin loader for updates. Fusion may cache imported ESM dependencies across a plugin reload; a reviewed idle daemon restart is required to load changed dependencies reliably. Preserve native plugin settings. The Assessment tab patch uses a versioned asset directory so lazy chunks cannot load an old dashboard entry. Its exact-version guard fails closed on unsupported Fusion bundles.

Private `history/<project>-<task>/` records contain immutable evidence and outcomes, with mutable terminal operation receipts. Repeated operation IDs never launch inference again. Interrupted or unreadable records are surfaced for operator recovery rather than replayed. Provider calls still stopping are quarantined across module reloads. Keep private history out of public repositories.
