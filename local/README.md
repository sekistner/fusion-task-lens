# Run the real card in a disposable Fusion project

The local integration runs a real signed-in Codex assessor from a small card in native **Definition**. It can write its own plugin defaults and private assessment files. It never writes native executor settings, task status, workflow holds, approvals or dispatch instructions. Automatic selection is unavailable.

## Requirements

- Node.js 22.12+ and npm.
- Exactly `@runfusion/fusion@0.77.0`. The installer checks the tested native server hash and the unique client insertion point, and refuses a mismatch.
- A new disposable PostgreSQL database reachable on loopback. Set `DATABASE_URL` in your environment through your existing credential mechanism. Never use a production database, paste credentials into an issue, or commit a DSN. The tested environment used PostgreSQL 16 on macOS.
- An installed `codex` CLI already signed in under your normal user account. The adapter requires the CLI's `--ignore-user-config`, `--ignore-rules`, `--ephemeral`, `--output-schema` and feature-disable options. CLI versions lacking these flags fail; other platforms and builds are unqualified.
- The configured assessor must be available to that account. The example Terra/Sol model identifiers and example limits are trial configuration, not a promise of provider access.

The wrappers isolate Fusion's profile under the disposable root. The assessor uses the owner's existing CLI sign-in, receives no database environment or API keys from Fusion, and ignores user configuration/rules for the assessment call.

## Install

Run from this repository after provisioning the disposable database and setting `DATABASE_URL`:

```sh
trialRoot=$(mktemp -d /tmp/fusion-shadow.XXXXXX)
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install --prefix "$trialRoot/install" @runfusion/fusion@0.77.0
node local/fn.mjs "$trialRoot" init --name fusion-shadow --path "$trialRoot/project" --git
node local/install.mjs "$trialRoot"
projectId=$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).id" "$trialRoot/project/.fusion/project.json")
node local/start.mjs "$trialRoot" "$projectId"
```

Wait for [the local dashboard](http://127.0.0.1:55482/) to load, then register this checkout:

```sh
node local/register.mjs "$projectId"
```

The `bundled.js` entry shim supports Fusion 0.77's dashboard installer. Refresh Fusion after registration. When upgrading an existing trial, use a cache-bypassing browser reload so its compiled dashboard asset is refreshed. Create a synthetic task, open **Definition**, then press **Assess task**. The dashboard runs with `--no-engine --paused`; its engine-disabled banner is expected. Native provider setup may remain incomplete because the assessor uses a separate local CLI adapter.

The example catalog is copied to `$trialRoot/local-models.json` only if absent. It records conservative trial runtime limits, not authoritative current entitlements. Update that private local file only with verified configuration appropriate to your own environment. Public provider pricing is refreshed independently.

The launcher binds only `127.0.0.1:55482` without dashboard authentication. It refuses a non-loopback database or an already serving dashboard. It writes a private `fusion.log` and `fusion.pid` under the disposable root and leaves the dashboard running. Stop the PID recorded there when finished; also stop your disposable database. No global Fusion settings are modified by these wrappers.

## Settings and authority

Open **Project defaults** in the card. The ordinary Fusion **Settings → Advanced settings → Plugins → Fusion Task Lens** editor reads the same persisted plugin settings. The card validates numeric ranges, admitted assessor IDs, known model IDs, unique preference ordering and guidance length before saving. Native plugin editors may accept a broader schema; invalid saved values stop assessment and report the exact field plus the native recovery location.

The default assessor can be overridden for one call in **Guidance & assessor**. Project guidance and the optional note are assessment data, not permissions. Save/Discard controls make edits explicit. Detected conflicting saves require reloading current defaults; this is optimistic detection, not a database-level CAS against other native writers.

Assessment limits default to 12,000 task-data characters, a 30-second deadline and a 1,200-token output target. All are configurable within validated ranges. The character bound excludes harness input. The CLI cannot enforce a hard generation-token cap: the target is checked after generation and a rejected call may already have consumed tokens. Known failure usage is retained; unknown usage is labeled unknown.

Baseline, model order, scope threshold, context headroom, output reserve and paid request estimate ceiling affect **preference advice only**. Capability fit, executor admission, authentication and quota remain unknown. A higher estimate ceiling does not authorize spending. The historical sample-count and pass-rate settings affect synthetic `/scenarios` only.

## Cancellation, staleness and persistence

Only one assessment runs at a time. Cancellation is bound to the run ID and remains available if the engine's pause state changes. The subprocess group is terminated. Changing a task or project defaults during inference discards the result; changing them afterward marks it stale. Polling cannot overwrite a newer mutation result.

Results live in private sidecar files keyed by project/task with task and settings fingerprints. These are not native task documents or a durable multi-node event stream. Prior pre-settings trial files are historical and not automatically migrated into current assessments. Reassess explicitly after upgrading.

The card reads native executor model resolution and displays its scope. It neither inspects nor confirms live executor sessions. It never applies its suggestion.

## Prices

Only the public provider catalog is fetched; task text is never sent to that pricing endpoint. The drawer shows USD per million input/output/cached tokens, source and fetched time. Prices refresh after 15 minutes or promotion expiry, or through **Refresh provider prices**. Failed/expired lookups do not become fresh quotes. Subscription costs and quota remain unknown. Local limits can be smaller than advertised provider context; both are shown.

## Remove the temporary integration

Stop the disposable dashboard. Restore `dist/client/assets/index-C2TJ3ObY.js.task-lens-original` over `index-C2TJ3ObY.js` inside its private Fusion installation. Omit `FUSION_TASK_LENS_LOCAL_ROOT` and `FUSION_TASK_LENS_PROJECT_ID` to disable local backend routes. The ordinary `/scenarios` plugin remains independent.

The compiled-dashboard patch is temporary. Its exit condition is a supported inline extension or a source-level dashboard integration with versioned build checks. No upstream bundle is distributed here and no production runtime is qualified.

## Verification

Run `npm test` for policy, transport and local-route regressions. [UI evidence](../docs/ui-verification.md) records actual local browser checks separately from synthetic tests. Publication is source availability, not deployment.
