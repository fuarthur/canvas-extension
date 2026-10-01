# UI Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task if the user selects execution in this chat. Use superpowers:subagent-driven-development only if the user selects delegation. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Preserve the stable Canvas planning features while protecting in-progress edits and making tasks and daily arrangements the primary content.

**Architecture:** Keep the existing vanilla JavaScript controllers and five views. Separate task-detail draft state from saved storage, preserve scroll across updates, and use native disclosures for advanced controls. Change the presentation and internal rendering boundaries without changing storage schemas, Canvas requests, or scheduling rules.

**Tech Stack:** JavaScript ES modules, Shadow DOM, Chrome Manifest V3, Node test runner, jsdom, esbuild.

**Spec:** The proposal in this chat, approved by the user on 2026-09-30. This plan makes that approved proposal concrete; it does not add a new product scope.

## Global Constraints

- Preserve Calendar, Task list, Workload, Planner, and Settings as the five navigation entries.
- Keep Canvas access read-only and preserve account isolation, local completion, batch undo, plan archives, and explicit draft saving.
- Preserve the current storage schema and extension permissions; add no runtime dependency or framework.
- Support English and Simplified Chinese; treat Canvas titles, course names, and user-entered names as literal text.
- Preserve task date-range loading, historical-task policy, estimate rules, automatic scheduling, cancellation, and partial-result warnings.
- Hidden controls must remain discoverable and keyboard accessible; active hidden filters must be visible outside their disclosure.
- Target the current build baseline, Chrome 114, and retain responsive layouts.

## Review Focus

- An unfinished personal target survives completion changes, storage notifications, and estimate changes, but never transfers to another task or account.
- Failed target saves retain both inputs; successful save or clear reconciles with saved data.
- Scroll remains stable during same-view updates; a deliberate view or month change does not reuse an unrelated position.
- Collapsed filters and batch editors preserve values and expose active restrictions; filters still clear selection as before.
- Generation previews, language switching, and unsaved-plan prompts remain usable after the layout is simplified.

## Approved Presentation

- Task list: keep presets, search, and course selector visible. Put type, completion, sort, grouping, and reset inside **More filters**. Show a compact summary of nondefault advanced filters, plus the task count. Keep historical-task controls and loaded-range disclosure as subdued auxiliary information below the main list controls.
- Batch actions: after selecting tasks, show the count, completion action, an estimate editor entry, and a personal-target editor entry. Display at most one editor at a time; keep reset, clear-target, reopen, clear-selection, and undo reachable.
- Planner: show the plan identity, explicit saved/unsaved state, Generate and Save prominently. Keep New plan and archive selection available; put Copy and Delete in **More actions**. Place the task pool and daily arrangement above analytics. Collapse the workload chart behind a compact summary by default. During generation preview, show one chart with a Current/Generated switch and keep Accept/Discard visible.
- Detail: show task title/course, readable deadline or activity time, estimate, completion, and Canvas link first. Put plan start, personal target, and single-session requirement inside **Planning options**. Preserve disclosure state during updates of the same task.
- Settings: keep language and calendar selection directly available. Organize history, estimates, estimate rules/preview, and defaults for new plans into clearly labeled sections; advanced sections start collapsed and retain edits through language changes.
- Toolbar: show month navigation only in Calendar and Workload. Task list shows the loaded range; Planner shows the active plan range through its own header; Settings shows its context. Refresh and close remain available in every view.
- Styling: reduce nested borders and card padding, distinguish primary actions from secondary text actions, and use neutral/amber unsaved notices, green success, and red errors/overdue warnings.

### Task 1: Protect task-detail drafts and scroll

**Files:** Modify `src/view.js`, `test/view.test.js`, `test/language.test.js`; create `src/task-detail-view.js` and `test/task-detail-view.test.js`.

**Interfaces:** Preserve `mountPlanner(options)` and its public return value. Extract `createTaskDetailView({document, getData, onStart, onEstimate, onTarget, onSingleSession, onComplete, onClose})`, returning `{render(item), reset()}`. `getData()` supplies `{userState, planningState, timeZone, notice}`; mutation callbacks return promises and `onTarget(key, target)` accepts `{day, time}` or `null`. `render(item)` returns the detail element. `reset()` discards the detail's transient inputs and disclosure state.

- [x] Add regressions using the existing fixture/setup: enter target `2026-09-25` and `14:30`, toggle completion, and assert both values remain; repeat with a storage notification and an estimate change.
- [x] Add save-failure, successful-save, clear-target, different-item, close/reopen, and different-account checks. Assert unsaved inputs do not bleed across identities and failed saves remain retryable.
- [x] Add a same-view storage-refresh regression: set `.content.scrollTop = 420`, notify storage, and assert the resulting content retains 420. Check intentional view changes start at their own position.
- [x] Run `node --test test/view.test.js test/language.test.js test/task-detail-view.test.js`; verify new regressions fail for the reproduced behavior before changing production code.
- [x] Extract the current detail UI with readable functions. Keep a transient target keyed to the current item, capture input events, reset it when identity changes, and reconcile after successful save/clear. Preserve scroll during same-view root replacement, including the detail's own scroll.
- [x] Run the targeted tests, then `npm test`; resolve all failures before continuing.

### Task 2: Simplify the task list and batch controls

**Files:** Modify `src/tasks-view.js`, `src/styles.js`, `src/i18n.js`, `test/tasks-view.test.js`.

**Interfaces:** Preserve `createTasksController(options)` and its callbacks. Extend `setData(next, {render = true} = {})` so the parent can avoid drawing twice while existing callers still draw immediately. Keep current control IDs for existing actions; new IDs are `More task filters`, `Edit selected estimates`, and `Edit selected planned finish`.

- [x] Add behavior tests: advanced filters start collapsed; changing task type and closing the disclosure keeps the restriction active and visible in its summary; reopening restores values. Check reset and presets continue clearing selection.
- [x] Add batch tests: selection shows the compact bar; clicking estimate/target opens only that editor; switching editors preserves unfinished values; failed writes retain the selected tasks and editor. Update existing interaction tests to open the editor before using its fields.
- [x] Verify new tests fail using `node --test test/tasks-view.test.js`.
- [x] Implement the approved presentation using native `details` and buttons. Preserve disclosure/editor state during draw and focus after filtering; keep range/history controls available and avoid introducing automatic range requests.
- [x] Use `setData(next, {render:false})` before the parent's subsequent `render()` call in `src/view.js`. Verify controller users elsewhere retain the default behavior.
- [x] Add all new English/Chinese strings; run task-view, batch, language, and full tests.

### Task 3: Prioritize daily planning and simplify analytics

**Files:** Modify `src/planner-view.js`, `src/styles.js`, `src/i18n.js`, `src/view.js`, `test/planner-view.test.js`, `test/planning-integration.test.js`, `test/language.test.js`.

**Interfaces:** Preserve `createPlannerController(options)` and all scheduling/storage callbacks. Extend its `setData(next, {render = true} = {})` using the same compatibility rule as Task 2. Preview chart selection is transient state, never part of a saved plan.

- [x] Add tests that daily arrangements remain usable with analytics collapsed; expanding analytics and selecting a chart day still reveals that day. Check Copy/Delete are reachable through More actions, with delete confirmation retained.
- [x] Add preview tests: Current/Generated switching leaves exactly one chart in the preview region; switching never changes draft segments; Accept changes the draft only and Save persists it. Keep cancellation and partial/timeout notices visible.
- [x] Verify new tests fail with targeted planner/integration tests.
- [x] Reorder the layout, apply the secondary-actions disclosure, and add compact workload summary plus collapsible chart. Preserve existing data validation and fingerprint checks.
- [x] Within each draw, compute and reuse plan resolution, validation, series, and segment indexes rather than repeatedly scanning the same segments. Keep caches limited to the current draw so time-sensitive checks remain fresh.
- [x] Remove duplicate parent-triggered drawing through the optional `setData` argument. Rewrite touched dense blocks into readable functions; avoid unrelated scheduler or storage changes.
- [x] Run planner, integration, language, scheduler, and full tests.

### Task 4: Unify details, settings, toolbar, and visual hierarchy

**Files:** Modify `src/task-detail-view.js`, `src/settings-view.js`, `src/view.js`, `src/styles.js`, `src/i18n.js`, `test/task-detail-view.test.js`, `test/settings-view.test.js`, `test/view.test.js`, `test/language.test.js`.

**Interfaces:** Retain all previously introduced interfaces. Section disclosure state is view state only. Keep current field/action control IDs when moving controls into disclosures.

- [x] Add tests for Planning options: unfinished target inputs and expanded state survive rerenders; all advanced actions remain reachable; switching tasks resets transient state. Use native keyboard-operable controls.
- [x] Add settings tests that a rule draft survives collapse/reopen and language changes; save failures keep the section editable. Check invalid inputs display an error in an accessible visible location, opening the relevant section when necessary.
- [x] Add toolbar tests: previous/next month exist in Calendar/Workload and are absent from Tasks/Planner/Settings; Refresh and close remain available. The displayed range matches the current view.
- [x] Verify the new tests fail before implementing their corresponding changes.
- [x] Implement the approved detail/settings disclosures and contextual toolbar. Localize date facts with the Canvas time zone. Apply status-specific styles without reclassifying genuine constraint errors as success.
- [x] Reduce nested visual decoration and emphasize Generate/Save as the plan's primary actions. Check narrow layouts, long titles, empty states, and keyboard focus.
- [x] Run targeted tests and `npm test`.

### Task 5: Verify and document the final experience

**Files:** Update `README.md`; create `docs/superpowers/reviews/2026-09-30-ui-simplification.md` after implementation.

**Interfaces:** The extension continues to load from `dist` using the existing build command and manifest.

- [x] Run `npm test` and `npm run build`; record actual test totals and build results.
- [x] Review the changed files for account isolation, stale callback behavior, unintended schema changes, missing translations, and unreachable hidden controls.
- [x] Inspect a browser preview using synthetic data at desktop and narrow widths; check tasks, selected-task actions, planning, generation preview, settings, and detail. Inspect actual screenshots and fix clipping/overflow before delivery.
- [x] If an authorized logged-in Canvas session is available, verify opening/closing, cached refresh, scrolling, and language switching there without changing the user's saved task data. Otherwise explicitly record that live Canvas verification was unavailable.
- [x] Update usage instructions and write the verification record, distinguishing automated tests, synthetic browser checks, and live Canvas checks.
- [x] Deliver the final change summary with verification results and any remaining limitation. Commit or PR creation is not required by this request; do not obscure a Git tooling failure with a success claim.

## Plan Self-Review

- All six UI recommendations from the approved proposal map to Tasks 2–4.
- The two reproduced interaction defects and identity/error boundaries map to Task 1.
- Readability, modularity, duplicate rendering, and repeated per-draw computation map to Tasks 1–3.
- The five Review Focus cases each have explicit test steps above.
- No scheduler rewrite, framework migration, data migration, feature deletion, or additional permission is included.
- Executed inline after the user approved proceeding. Final independent review findings were repaired and verified; see the UI verification record.
