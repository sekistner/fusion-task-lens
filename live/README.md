# Manual assessment on a running Fusion instance

The native adapter uses Fusion 0.77.0's existing signed-in AI factory. It does not need a Codex executable. It creates a separate session in a private empty directory, selects the configured assessor, disables every tool, verifies that selection, and checks the model again at completion. It never claims a task, changes a workflow, or pauses the engine. Only an explicit authenticated POST starts inference.

The native plugin needs an operator-owned `live/installation.json` (excluded from Git) binding `project`, HTTPS `origin`, a private state `root` under `/home/fusion/.fusion/task-lens/`, and `nativeModule` under that root. The read-only resolver module is derived from the exact upstream 0.77.0 bundle by removing its CLI main guard and exporting its three native settings/resolution functions. Keep its dependencies resolvable using the existing installed package. Never change the running server bundle to expose those functions.

Install the package through Fusion's supported authenticated plugin installation API. Keep its files and private assessment receipts on persistent storage. The existing `local-models.json` format holds local configured limits; provider/account entitlement remains unverified. No credential is copied into this package or its configuration: the native factory uses the host's existing credential owner.

The Assessment tab additionally requires registration in the compiled dashboard. The runtime integration uses an exact-hash client patch, passes Fusion's existing authentication-header helper, and hides the card when this project has no backend. It preserves the native server/engine bytes. A production image rollout follows the runtime owner's normal image/Flux controls; a plugin install alone does not install the tab. The patch's exit condition is a supported inline extension point or maintained source integration.

The request deadline returns a timeout and requests provider cancellation. If the factory, provider or disposal is still settling, subsequent assessments are refused until cleanup completes. This prevents overlapping orphaned calls; it is not proof that a remote provider stopped spending tokens at the deadline. Unknown usage stays unknown. The output target is checked after generation and is not a spend cap.

Assessment uses the shared provider account and may consume quota even though it does not occupy Fusion's task-execution slots. Automatic selection is unavailable. The plugin has no engine hooks and no task mutation path. Keep native model overrides, approval holds and existing task pauses unchanged during installation and verification.

## Source discovery admission

Add `allowedCheckoutRoots` to the private installation configuration: an array of absolute owner-approved checkout directories. An empty array disables machine discovery. Paths must resolve inside those roots; external execution and review bindings must resolve to the same checkout and include exact head, base and branch. Content-filter repositories are refused before Git status can invoke helpers. Discovery reads fixed Git facts only, disables fsmonitor/hooks/external diffs and lazy fetching, and ignores submodule content explicitly.

Stage a versioned package and use the supported plugin loader for updates. Fusion may cache imported ESM dependencies across a plugin reload; a reviewed idle daemon restart is required to load changed dependencies reliably. Preserve native plugin settings. The Assessment tab patch uses a versioned asset directory so lazy chunks cannot load an old dashboard entry. Its exact-version guard fails closed on unsupported Fusion bundles.

Private `history/<project>-<task>/` records contain immutable evidence and outcomes, with mutable terminal operation receipts. Repeated operation IDs never launch inference again. Interrupted or unreadable records are surfaced for operator recovery rather than replayed. Provider calls still stopping are quarantined across module reloads. Keep private history out of public repositories.
