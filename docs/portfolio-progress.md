# Portfolio hardening progress

Date: 2026-11-05. Owner: current autonomous Codex task. Nothing has been published or pushed.

## Current stage

Local hardening completed November 5. Release v0.3.9 was authorized November 6; current release preparation and validation are recorded in `docs/verification-2026-11-06.md`. See `docs/verification-2026-11-05.md` for commands, evidence and limits; `README.md` for startup; `docs/code-tour.md` for interview preparation and English resume drafts.

## Verified baseline

- `npm test`: 425/425 passed, 13.26 s.
- `npm run build`: passed.
- Existing production capabilities include Canvas calendar API loading, account-isolated local task edits, working windows/capacities, plan validation, bounded scheduling, completion, revision-checked plan archives and bilingual accessible DOM controls.
- These initial observations were the baseline, not evidence of live authenticated Canvas behavior. The final installed-extension test uses simulated Canvas responses; live Canvas and system notifications remain unverified.

## Preservation

The original five dirty files and their tests are retained. Their original patch is `/tmp/canvas-existing-2026-11-05.patch`. Do not reset, restore, stash or overwrite them. No commit/push is required for local delivery.

## Delivered changes and decisions

- Retained the native DOM / ES module / Manifest V3 architecture. No framework rewrite, AI feature, server backend, remote publication, branch switch or commit was needed.
- Strict offset-aware instants, profile-zone checking, ambiguous duplicate detection, raw invalid-event markers, visible invalid-import warnings, explicit blocked/search-cap reasons and search diagnostics.
- Isolated persistent fictional demo with fixed clock, normal/insufficient-capacity scenarios, deadline changes, reset and injected save failure. Same production views/model/validator/scheduler/plan service; one scenario-wide storage mutation lock.
- Real-browser E2E plus installed-extension/message-worker coverage using simulated Canvas APIs. Sampled keyboard/narrow-screen/axe checks. Reproducible performance fixtures and independent postconditions.
- English README; retained detailed Chinese usage; algorithm notes; code tour, eight interview questions and project-capability resume drafts; four synthetic screenshots and reproducible capture command; CI configuration (not run remotely).

## Final verification

- Fresh `npm ci`: passed (0 reported audit vulnerabilities; existing transitive deprecation and esbuild script-policy notices documented).
- `TZ=UTC npm test`: 443/443, 13.36 s.
- Pacific-zone date/availability/model/reliability/scheduler subset: 48/48.
- `npm run test:e2e`: actual build passed, 8/8 browser scenarios, 11.2 s, no retries.
- Fixed 28-day benchmark: 20/60/200 tasks, all complete and checked; observed median 6.42/25.67/174.39 ms on this machine. No before/after improvement or global-optimality claim.
- Screenshot generation: four PNGs, visually reviewed. Documentation links, diff whitespace, and original dirty-hunk preservation checks passed.
- Independent read-only review found five material issues. Each reproduced by a failing regression and repaired; none deferred. The final tests include those regressions.

## Next most valuable step

With explicit authorization and a test account, verify the installed extension against current live Canvas: selected calendar permissions, actual assignment update/submission, account switching and cache invalidation. This is the primary remaining integration uncertainty. No further functionality is necessary to use the local demo and interview materials.

## Resume after interruption

Do not restart implementation. Read the verification record, run only checks affected by new edits, preserve the five original dirty files, and keep remote actions behind user approval. The current local deliverables meet the requested stop conditions; live account verification, hosted CI and publication are follow-ups, not silently claimed completed work.
