# Scheduling: constraints, method, and limits

The scheduler is a bounded feasibility search followed by a local load-balancing heuristic. A result marked complete means the implemented checks passed for the supplied snapshot. It is not proof that the workload is realistic, that Canvas data is current, or that the schedule is globally optimal.

## Inputs and output contract

`generateSchedule({plan, items, completed, now, loadedRange, historyFilter}, options)` consumes a plan snapshot and current task facts. It returns `status`, candidate `segments`, `validation`, user-facing `issues`, `metrics`, and diagnostic search counts/timing. It does not mutate its input or save a plan.

- `complete`: every pending assignment's estimate is allocated and all validation checks pass.
- `partial`: missing work or unresolved constraints; missing minutes remain keyed by task in `validation.unassigned`.
- `timeout` / `cancelled`: calculation stopped; no claim of completion from status alone. A timed-out balancing phase can retain a valid complete candidate, which the UI identifies separately.
- Scheduler-service/client failures produce an error result and preserve the editable draft.

`UNASSIGNED` issues identify the task, missing minutes, and a reason: unverified task data, overdue deadline, existing blocking conflicts, exhausted search, or capacity/continuous-window constraints. Global issues also identify invalid calendar activities, unavailable loaded ranges, DST gaps, buffers, stale facts, and unknown tasks.

## Hard constraints

| Constraint | Implementation |
| --- | --- |
| Earliest work | Maximum of current time, plan start, Canvas release, and manual start day; rounded up to a whole minute |
| Latest work | Current Canvas deadline rounded down to a minute; availability restricts work to the selected plan range |
| Working time | One local start/end window per weekday, optionally replaced for a specific date; start must precede end |
| Capacity | Actual event occupancy and unfinished locked work consume the daily minute budget; overlaps are unioned before charging |
| Fixed events | Block actual clock intervals; missing/malformed/reversed intervals prevent an automatic verified result |
| Continuity | A task is continuous unless explicit splitting permission is true, single-session is false, and its estimate exceeds the plan threshold |
| Breaks | Generated unfinished work blocks reserve the configured real-time gap, including adjacent days; default 15 minutes |
| Retained work | Locked blocks and completed-task blocks remain; invalid retained locks block generation until corrected |
| Data coverage | Plan range must be loaded; missing current deadline tasks, unknown saved tasks, changed dates, and conflicting duplicate sources are explicit issues |

Completion applies to an entire task, not to a fraction of its estimate. Personal finish targets are separate UI metadata, not alternate deadlines. An estimate change requires **Update plan task data**; global defaults do not silently rewrite plan snapshots.

## Calculation stages

1. Resolve live completion and task timing against the saved snapshot. Validate retained blocks before searching. Overdue assignments remain visible and unassigned while other feasible work can be scheduled; invalid facts or conflicting retained work stop the new search.
2. Construct legal intervals from account-local working windows, subtracting fixed events, locks, and reserved breaks. Charge elapsed event/lock minutes against each day's quota.
3. Try continuous tasks using bounded backtracking. Tasks are ordered by deadline, number of candidates, then stable key. Candidates are the earliest/latest possible starts in each legal interval, ordered using current daily load. A search pass explores at most 2,000 states.
4. When a continuous schedule is not found, a second pass permits authorized splitting. With a zero-minute break, deferred work is a maximum-flow subproblem: source → daily quota → release/deadline interval slices → tasks → sink. Dinic's residual paths can reallocate earlier choices. With nonzero breaks, deferred work is placed greedily by deadline, reserving gaps after each chunk; block-dependent break overhead is not represented by the flow graph.
5. If all non-overdue work is feasible, move whole unlocked blocks to improve a lexicographic objective: daily peak minutes, capacity-weighted imbalance, then a penalty for finishing within the final 24 hours before the deadline. Completed blocks do not contribute remaining work. Adjacent blocks belonging to the same task are merged where legal.
6. Validate the candidate again. The UI checks its fingerprint and current time before accepting it. Accept updates the draft; a separate revision-checked Save persists it.

## Time zones and DST

Persisted instants require an explicit `Z`/offset, a real Gregorian date, and a valid clock time. ISO-like local strings without an offset are rejected. Canvas profile zones are checked before calendar loading; invalid IANA zones produce a recoverable load error.

`zonedDateTime` resolves local working times through `Intl.DateTimeFormat` offset candidates. A nonexistent spring-forward time returns null and creates a visible availability issue. Repeated fall-back times resolve to the earlier occurrence by default; availability ends choose the later occurrence. A local day can therefore contain 23 or 25 elapsed hours. `intervalDays` splits actual instants at local day boundaries for load totals. Manual repeated start times use the earlier occurrence; the editor does not provide a second-occurrence selector.

Deduplication compares valid timestamp instants, so equivalent `Z` and offset forms do not cause false conflicts. Contradictory times, or an invalid copy of an otherwise valid task, mark the merged task unverified and block automatic planning. A display fallback for an event retains an invalid-time marker; it cannot turn unknown event duration into free study time.

## Why no global-optimality guarantee

- Boundary candidates do not enumerate every possible continuous placement.
- Each search phase has a finite state cap; total calculation has a cooperative five-second budget. Expensive synchronous operations can run until their next checkpoint, so this is not a hard real-time bound.
- Buffered splitting is greedy. Maximum flow only optimizes a restricted zero-break allocation subproblem with already chosen continuous placements; it is not an optimizer for the entire plan.
- Balancing is a local, whole-block improvement pass, not an exhaustive optimization. It can stop in a local minimum, at its iteration cap, or on timeout.
- Feasibility relies on currently loaded facts and user estimates. Unreturned undated assignments, tasks outside the selected horizon, and later Canvas updates are outside that snapshot.

The practical tradeoff is a local, inspectable planner with cancellation and explicit partial outcomes, without a server or a solver dependency. Task dependencies, multiple daily windows, overnight windows, learned estimates, and per-block progress are deliberately absent.

## Evidence

`test/reliability.test.js` covers invalid instants, contradictory duplicates, event fallback, spring DST capacity, blocked calculations, search limits, completion and replan. Existing scheduling tests include tiny independently enumerated feasibility cases, fall DST interpretation, midnight transitions, deadlines, fixed events, split permission, capacity, locks, cancellation and timeouts. `scripts/benchmark.mjs` uses literal synthetic inputs and separately checks minute totals, releases/deadlines, nonoverlap/breaks and daily budgets in addition to calling the production validator.

The fixed performance fixtures are intentionally ordinary: 28 days, 20/60/200 continuous 30-minute tasks, 09:00–21:00 windows, 480-minute daily quotas, 15-minute gaps, and staggered deadlines. They do not characterize adversarial search, large real accounts, cold browser startup, network latency, or general scheduling complexity. See [measured results](benchmark-2026-11-05.json).
