# Portfolio reliability implementation plan

**Goal:** Make the existing Canvas planner reliable, independently demonstrable, and explainable in an internship interview.

**Architecture:** Keep the Manifest V3 extension, native DOM views, pure scheduling modules and account-scoped storage. Reuse the same views, model, validator, scheduler and plan service in an isolated local demo; only the data and storage adapters differ.

**Scope and decisions:** Work in the current checkout to preserve and test the user's five existing uncommitted files. No remote push, publication, account changes or real-data upload. The user explicitly authorized autonomous implementation; no intermediate design approval is needed. Prefer focused corrections over a framework rewrite, new AI services or feature expansion.

## Baseline

- Branch: `main`, HEAD `cee7baf` (v0.3.8).
- Existing edits: `src/content.js`, `src/planner-view.js`, `src/view.js`, `test/calendar-entry.test.js`, `test/planner-view.test.js`. Original patch saved to `/tmp/canvas-existing-2026-11-05.patch` before editing.
- No applicable `AGENTS.md` found in repository or ancestor directories.
- `npm test`: 425 passed, 0 failed (13.26 s). `npm run build`: passed.
- Existing quality sandbox reuses real views/services but resets on refresh, uses an old fixed date, and is not documented as a recruiter demo. No real-browser automated test command exists.

## Execution

- [x] Inspect README, entry points, services, domain logic, conventions and existing changes; run baseline build/tests.
- [x] Start the existing preview and exercise the current flow in a real browser.
- [x] Add focused regression tests before fixing confirmed time-zone, duplicate-data, invalid-input, task-update, insufficient-capacity or rescheduling defects. Independently validate generated schedules.
- [x] Add an explicit fictional demo with repeatable data, isolated persistent storage, reset and save-failure recovery, reusing the production core. Document its fixed clock.
- [x] Add browser E2E coverage for task data → availability → generation → partial/conflict feedback → completion → rescheduling → reload, plus narrow-screen/keyboard checks.
- [x] Measure representative fixed scheduling fixtures, retaining correctness assertions and reporting observed timings without optimality or improvement claims.
- [x] Update README and provide synthetic screenshots, algorithm/architecture explanation, walkthrough, interview prompts and evidence-based English resume bullets.
- [x] Run final clean-install/build/unit/E2E/performance checks, review the complete diff, preserve unrelated edits, and report limits. Stop adding features.

## Review focus

1. DST gaps/repeated local times and account time zones must not silently shift work.
2. Duplicate sources must not multiply workload or pick contradictory task timing silently.
3. Capacity or search limits must retain every missing minute with an explicit explanation.
4. Changed/deleted/completed tasks and refreshes must invalidate stale previews and preserve drafts.
5. Storage failures and reloads must not claim successful saves or corrupt unrelated data.

## Verification ledger

Detailed results, decisions, blockers and resume instructions live in `docs/portfolio-progress.md`. Final commands and measured results will be recorded in `docs/verification-2026-11-05.md`.
