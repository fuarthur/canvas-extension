# Canvas quality pass 1 — 2026-10-02

Status: **COMPLETE**. All four frozen items passed. Stop condition A reached; no further implementation.

## Budget and isolation

- Repository review/scope selection: **1/1**, complete. Initial implementation: **1/1**, complete.
- Integrated initial verification: **passed**. Repair/reverification rounds: **0/2**.
- Branch: `improvement/canvas-extension-pass-1`; base: `c39281b`.
- Original `/Users/arthurfu/Documents/Canvas Extension` was clean on `main`; no uncommitted work copied or modified. Separate worktree under this chat's `work/canvas-extension`.
- Default Git and native worktree tool were blocked by Xcode licensing. Existing CommandLineTools Git worked; manual worktree creation succeeded. No license/system settings changed. Environment issue closed; no further attempts.
- Existing local dependencies copied locally into ignored node_modules (no installation/network needed). No added dependencies, permissions, telemetry, data migration, push, merge, deployment, or real Canvas writes.

## Targeted review and baseline

The MV3 extension offers a read-only Canvas calendar, task agenda, estimates/local completion, workload, and saved study plans. `content.js` wires Canvas loader, account-scoped local storage, background plan/scheduler clients and Shadow DOM views. `view.js` coordinates identity, loading and retained controllers; task/detail/planner views manage interaction drafts. Background writes serialize local mutations. The only extension permission is `storage`, with Illinois Canvas host access. Vanilla JavaScript/CSS, esbuild, Node test runner and jsdom; no lint/typecheck scripts configured. No repository/ancestor AGENTS.md found.

- Original baseline `node --test` (120 s timeout): **323 passed, 0 failed**, 30.23 s, Node 18.16.0.
- Clean worktree baseline `npm run build` (60 s timeout): **passed**.
- Targeted jsdom probes reproduced lost effort values (135/150 → 60), invisible course filter (blank selector/zero rows despite available tasks), and deletion crash (`Cannot read properties of undefined (reading 'completed')`).
- Main shell declares a modal dialog but has no initial focus, Tab containment, or return-focus behavior (`view.js` show/close/onKeyDown). Five regression tests established this before editing and now pass.
- Browser checks use a fictional in-memory fixture only. Live-account integration is outside this pass's validation.

## Ranked candidates (one review only)

| Rank | Candidate | Value / evidence | Cost / risk | Decision |
| --- | --- | --- | --- | --- |
| 1 | Clear stale editor after plan deletion | Prevents verified core-flow crash | Small / low | Select |
| 2 | Preserve effort input and retry failed saves | Prevents verified lost user input | Medium / moderate async risk | Select |
| 3 | Reconcile unavailable course filter | Prevents verified false empty result | Small / low | Select |
| 4 | Modal keyboard focus lifecycle | Restores usable keyboard navigation; absent handlers | Medium / moderate interaction risk | Select |
| 5 | Plan-start input draft retention | Similar code pattern, not reproduced | Medium / unknown | Backlog only |
| 6 | Keyboard focus for planner leave/delete prompts | Nested prompt behavior deserves separate acceptance | Medium / moderate | Backlog only |

No new extension feature is justified; all four improve existing flows.

## Frozen scope and acceptance

### A. Effort draft and save recovery

- Evidence: `task-detail-view.js` reconstructs effort from saved state on every render; only planned-finish drafts are captured. A local refresh or rejected save discards input.
- Benefit: retain work and retry without retyping.
- Change: same-task effort draft lifecycle, saving/error/retry feedback using existing UI/i18n conventions; preserve later edits when an earlier save finishes.
- Exclude: start-date drafts, planned-finish redesign, estimate rules, storage schema.
- Pass: typed effort survives same-task storage/appearance rerenders and rejected writes; retry persists the shown value; newer input survives an earlier save; task/account/reset boundaries never transfer drafts; existing automatic-estimate action remains usable.
- Verify: focused detail jsdom regressions plus browser fictional failure/retry and task switching.

### B. Unavailable course filter recovery

- Evidence: `tasks-view.js` setData retains a course absent from rebuilt select options, while `taskList` continues filtering by it.
- Benefit: available work remains discoverable after calendar selection changes.
- Change: normalize unavailable course to all on initial render/data refresh, persist corrected preference and clear stale selection. Preserve valid course filters and other preferences.
- Exclude: new filters, pagination, changes to historical/date-range inclusion.
- Pass: unavailable saved/current course shows All courses, exposes matching remaining tasks, clears selection and persists correction; valid filter stays selected; empty contexts do not crash.
- Verify: task controller jsdom tests and browser selection flow.

### C. Plan deletion editor cleanup

- Evidence: `planner-view.js` delete success switches plan but retains editing for a task missing from the remaining plan/current items; `plan-editor-view.js` then throws.
- Benefit: deleting an alternative leaves a usable plan.
- Change: reset relevant plan-local transient state only after successful deletion.
- Exclude: archive format, scheduler logic, new deletion/undo feature.
- Pass: deleting the active plan while an archived-task block editor is open selects the remaining plan, closes stale editor, shows task pool/timeline, preserves remaining archive. Failed deletion retains the current plan/editor.
- Verify: focused planner regression and fictional browser smoke.

### D. Main modal keyboard lifecycle

- Evidence: declared modal has only Escape handler, no focus entry/trap/return behavior.
- Benefit: keyboard users can enter and leave Planning predictably without reaching obscured Canvas controls.
- Change: capture opener, initial focus, forward/backward Tab wrap among visible enabled controls, restore opener after successful close; respect async load and existing unsaved-plan decision.
- Exclude: tab arrow navigation, nested prompt redesign, broad accessibility overhaul.
- Pass: opening moves focus inside; Tab/Shift+Tab wrap and exclude collapsed/disabled controls; refresh retains usable focus; successful close restores opener; canceled draft close stays open and does not restore opener; detached opener does not throw.
- Verify: focused jsdom tests and real browser keyboard checks at desktop/narrow widths.

## Validation / repair ledger

Initial implementation completed. A: 8 new regressions failed before fixes; detail/language targeted checks 37/37 pass. B/C: 5 added regressions, expected original failures reproduced; targeted checks 49/49 pass. D: 5 regression tests failed before implementation; modal/view/entry checks 31/31 pass. Independent scoped B/C/D review found no blocker; focused reviewer checks 54/54 pass. Final integrated `npm test`: **341/341 passed**, 0 failed/skipped, 34.79 s (120 s limit). `npm run build`: **passed** (60 s limit). `git diff --check`: **passed**. A read-only review of final A also found no blocker. Repair rounds remain **0/2**. New unrelated findings go only to backlog.

## Backlog and limits

- Plan-start draft retention (unconfirmed); separate nested prompt focus behavior.
- No real Canvas account writes or new permission paths tested.

- Preview localhost bind was denied in sandbox; authorized localhost-only execution succeeded (second grounded method). Servers are time-limited and use invented data; CSP blocks remote connections.


## Final acceptance evidence

| Scope | Automated result | Actual browser result (fictional data) | Verdict |
| --- | --- | --- | --- |
| A — effort recovery | Draft refresh/failure/retry, newer edit vs earlier save, reset/account boundaries, automatic-estimate pending-save edge covered | Original 151 minute save failure reset to 60; changed version retained 151, Retry saved it and showed success. Switching tasks showed the other task's 60. English/light and Chinese/dark at 390px checked; detail client/scroll width both 342px | Pass |
| B — course recovery | Unavailable saved/current course, valid preference preservation, empty contexts, cleared selection/persistence covered | Selected DEMO 202, deselected it in Settings, saved; Task list showed All courses and 21 remaining tasks from the other calendars | Pass |
| C — deletion cleanup | Archived-task deletion with a remaining plan no longer crashes; failed removal retains editor and both archives | Copied fictional plan, opened block editor, deleted copy; original remained selected, editor count 0, task pool and rendered block rows remained usable | Pass |
| D — modal keyboard | Entry/return, disabled/hidden/collapsed Tab exclusion, refresh fallback, canceled unsaved close, removed opener covered | Initial focus Close; Shift+Tab from first wraps to last visible control and Tab returns to first; Escape returns focus to in-frame opener. Desktop and 390px checked | Pass |

- Browser console: no errors/warnings during final desktop and narrow checks. No real Canvas account used.
- Screenshots delivered in chat outputs: `before-effort-error.jpg`, `after-effort-error.jpg`, `after-narrow-task-list.jpg`, `after-narrow-effort-error.jpg` (fictional content).
- No test assertions removed/relaxed, no product code edits after the passing integrated run. Only final documentation and packaging follow it.
- Lint/typecheck: not applicable; the project defines neither command. Built extension bundles verified by esbuild. Chrome extension background/content-script injection on a live account was not tested this round; preview uses actual UI/storage/plan/scheduler modules with an in-memory adapter.
- Local worktree and branch retained. User data/schema, manifest, lockfile, dependencies and permissions unchanged. No push/merge/publish/deploy.
- Interrupt/resume continued this log; scope and counters were not reset.

## Experience this version

- `node scripts/preview.mjs --timeout=3600`, then `http://127.0.0.1:4173/`. Preview shuts down after one hour; restart the same command when needed. Use Fail next local save to test recovery. All demo edits reset on refresh.
- Build from this branch with `npm ci` then `npm run build` (existing dependencies may be reused). Load `dist` unpacked in a separate Chrome profile for an isolated extension trial.
- A separately loaded extension has separate local storage; it does not import the original extension's plans. Do not uninstall the original extension to test. To keep using its data later, update the files at its existing loaded directory and reload that extension after deciding to adopt this branch.

## Next-round suggestions only

1. Investigate plan-start draft retention, currently unconfirmed.
2. Define and test nested leave/delete prompt keyboard focus behavior separately.
3. Perform read-only live Canvas extension integration checks when adopting this version.

End of pass 1. No new work is authorized by these suggestions.
