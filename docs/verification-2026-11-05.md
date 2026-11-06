# Local verification · November 5, 2026

This record describes this task's checks. It does not reuse older release claims as current evidence. No real Canvas personal data was uploaded, no account settings were changed, and nothing was pushed or published.

## Environment

- macOS, Apple Silicon (`darwin/arm64`); Node `v24.21.0`; npm lockfile v3.
- Playwright `1.64.1`, bundled Chromium, headless. Browser app tests use an **Asia/Shanghai** browser time zone and fictional **America/Chicago** account data.
- Manifest V3 build targets Chrome 114. This task tested the installed bundle in current Playwright Chromium, not every historical Chrome version.
- Node 22 is the configured CI target; hosted Linux/Node 22 CI has not been executed here.

## Commands and outcomes

| Command | Observed outcome |
| --- | --- |
| Baseline `npm test` before edits | 425 passed, 0 failed; 13.26 s |
| Baseline `npm run build` | Passed |
| `npm ci --cache=/tmp/canvas-npm-cache --fetch-retries=0 --fetch-timeout=20000` | Fresh dependency install passed; 47 packages audited, 0 reported vulnerabilities |
| `TZ=UTC npm test` | **443 passed, 0 failed**, no skipped/cancelled tests; 13.36 s |
| `TZ=America/Los_Angeles node --test test/dates.test.js test/availability.test.js test/reliability.test.js test/model.test.js test/scheduler.test.js` | **48 passed**, 0 failed; 0.62 s |
| `npm run test:e2e` | Build passed; **8 passed, 0 failed**, 11.2 s; no retries |
| `node scripts/benchmark.mjs --output=docs/benchmark-2026-11-05.json` | All fixtures complete; every measured run passes correctness checks |
| `npm run screenshots` | Four fictional-data PNGs generated; desktop plan/tasks, partial result, and narrow tasks visually inspected |
| `git diff --check` | Passed |
| `git apply --reverse --check /tmp/canvas-existing-2026-11-05.patch` | Passed; all original dirty hunks remain present |
| Documentation file/image link check | Current delivery links checked; no missing files after this record is created |

The baseline Node command discovered helper modules as test entries. The final `npm test` explicitly selects `test/*.test.js`; therefore the change in the total is not a direct count of new assertions. The new meaningful cases cover import ambiguity, strict instants, DST capacity, account metadata failure, blocked/search-limited scheduling, completion/replanning and demo persistence/concurrency.

## Browser coverage

1. Fictional import → effort edit → plan-data update → capacity edit → generation → acceptance/save → reload → task completion → regeneration → reload.
2. Insufficient capacity lists Systems lab (120 missing minutes) and Design critique (90), and preserves the partial status after save/reload.
3. Injected save failure preserves the draft; retry and reload restore the successfully saved plan.
4. 390px layout, keyboard Home/Enter tab switching, document overflow check, and axe WCAG A/AA sampling in Planner and Calendar. No serious/critical violations in the sampled states.
5. Changed deadline invalidates old task data and cannot produce a new preview until explicit update; the new infeasible deadline yields a named partial result.
6. Demo load/generate/save with external HTTP(S) requests intercepted and rejected: no external requests observed.
7. Two demo tabs concurrently save a plan and an estimate; both fields survive reload.
8. Actual unpacked Manifest V3 extension injects into a simulated Canvas page, sends scheduling to its real service worker, saves through its real message handler, and restores after refresh. Its bundled account-free demo is also exercised. Canvas API responses are simulated, and external network requests are blocked.

Tests use visible UI behavior and persisted outcomes. No retries, arbitrary timing sleeps, forced clicks, or disabling of accessibility rules were used to make the final browser suite pass. A frame locator handles the fictional demo viewport; Playwright traverses the extension's open Shadow DOM.

## Measured performance

Fixed 28-day fixtures; 30-minute tasks; 480-minute daily capacity; 15-minute break; staggered deadlines. One warmup plus three measured runs per size, with the default five-second per-run budget.

| Tasks | Work minutes | Measured runs (ms) | Median (ms) | Result |
| --- | --- | --- | --- | --- |
| 20 | 600 | 6.62 / 6.19 / 6.42 | 6.42 | Complete, 20 blocks |
| 60 | 1,800 | 27.62 / 25.67 / 25.64 | 25.67 | Complete, 60 blocks |
| 200 | 6,000 | 178.82 / 174.39 / 173.46 | 174.39 | Complete, 200 blocks |

Each run independently checks exact work totals, releases, deadlines, break/nonoverlap and daily quotas, and also invokes the production validator. These are observed local synthetic timings, not a before/after improvement, worst-case bound, optimality result or production-account benchmark. Source results are in [benchmark-2026-11-05.json](benchmark-2026-11-05.json).

## Failures found and repaired

- Invalid starts/deadlines, offset-free timestamps and impossible dates could bypass comparisons or persistence validation. Strict instant validation and per-task errors now cover them.
- Malformed fixed-event endpoints were replaced with display fallbacks, allowing unknown occupancy to look free. Raw invalid-time markers now block automatic scheduling; display remains usable.
- Duplicate imports could hide contradictory or invalid dates. Merging now flags ambiguity, while equivalent UTC/offset instants remain equivalent.
- State-limit exhaustion and early exits caused misleading capacity explanations. Search diagnostics disclose caps; pre-existing constraints produce a blocked-calculation reason.
- Separate demo task/plan locks could lose unrelated fields in a shared storage blob. All demo mutations, including reset, now use one scenario-wide lock; deterministic interleaving and browser tests verify preservation.
- Invalid account metadata on refresh could leave the previous account's tasks visible. This failure now clears the prior identity.
- Root demo routing initially broke relative resources; fixed with an explicit redirect. The first bundled-demo test incorrectly blocked its own extension resources; the interceptor now permits local extension URLs while blocking external traffic.
- A concurrent browser test clicked a button that blur-saving had already replaced/disabled. It now drives the existing automatic-on-blur contract directly. Production save behavior was preserved.
- Partial results previously shared the green complete-preview treatment; they now use the warning palette and retain textual missing-work explanations.

An independent read-only code review produced five material findings (equivalent instants, event fallback, demo write serialization, invalid duplicate copies, and blocked reasons). Each was reproduced with a failing regression and fixed. No review finding was deferred. The raw review is summarized here; no extra remote review or publication occurred.

## Remaining verification gaps and limits

- Live signed-in Canvas, course/group permissions and changes to actual assignments have **not** been verified in this task. The integration test proves packaging and message/data flow against simulated APIs.
- Real desktop notifications, browser sleep/restart, full screen-reader testing, physical mobile devices, Firefox, and Safari were not tested. Notification behavior is an existing optional subsystem, outside the demo claim.
- Hosted CI, Linux execution and the Node 22 target are configured but not run. Local code passed on Node 24/macOS.
- Arbitrary large/adversarial scheduling workloads have no timing/optimality guarantee. Search/balance budgets are cooperative. Undated assignments the Canvas calendar API never returns cannot be recovered by client-side warnings.
- Saved data is device-local. Unsaved plan drafts do not survive a browser reload. Web Locks provide demo cross-tab serialization on supported browsers; the fallback is page-local.
- `npm ci` emitted the existing transitive `whatwg-encoding` deprecation warning and an npm install-script policy notice for esbuild. The subsequent actual build succeeded with the installed platform binary; no machine-wide script approval was changed.

Implementation references: [Playwright local web server](https://playwright.dev/docs/test-webserver), [Playwright extension testing](https://playwright.dev/docs/chrome-extensions). Project-specific correctness claims above come from the commands and fixtures, not from these guides.

## Final browser result

`npm run test:e2e`: build exit 0, 8 scenarios passed in 11.2 seconds, no failures/retries. This includes the packaged demo and cross-tab persistence case. The final Node suite passed 443/443; no required local check remains failing.
