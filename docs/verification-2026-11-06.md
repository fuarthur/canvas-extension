# Release verification · November 6, 2026

Node v24.21.0, macOS Apple Silicon. Fresh npm ci reported no vulnerabilities.

| Check | Result |
|---|---|
| TZ=UTC npm test | 448 passed, 0 failed/skipped/cancelled |
| Pacific timezone date/availability/model/reliability/scheduler subset | 50 passed |
| npm run test:e2e | Build passed; 8 browser scenarios passed, no retries |
| Benchmark 20/60/200 tasks | All complete, correctness checked every run |
| git diff --check | Passed |

The installed-extension scenario explicitly uses Asia/Shanghai; fixture account timezone is America/Chicago. Review found fully undated activities could disappear before validation. New tests failed with falsely complete schedules and now pass. Duplicate order, undated-event inspection/grouping, and an open event editor losing/restoring timestamps are covered. Invalid event facts remain blocking even if they cannot be placed on a calendar date. An unknown endpoint cannot safely establish no overlap with the plan.

The November 5 record remains historical. Current release counts supersede its counts. See [release notes](releases/v0.3.9.md) and [benchmark](benchmark-2026-11-06.json). Live-account and notification limitations remain as disclosed in the release notes. Hosted CI status is available in GitHub Actions for the published commit.
