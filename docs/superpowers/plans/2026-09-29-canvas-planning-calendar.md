# Canvas Planning Calendar Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an unpacked Chrome extension that opens a separate Canvas planning month view with date spans and local completion marks.

**Architecture:** A Manifest V3 action toggles a Shadow DOM overlay from a content script on the Illinois Canvas calendar page. Pure modules fetch and normalize Canvas data, compute local-date spans, and persist per-user choices; the overlay renders those results without changing Canvas nodes.

**Tech Stack:** JavaScript ES modules, Chrome Manifest V3, `chrome.storage.local`, Node 18 built-in test runner, jsdom for view tests, esbuild for two browser entry points; no UI framework or server.

**Spec:** `docs/superpowers/specs/2026-09-29-canvas-planning-calendar-design.md`

## Global Constraints

- Run only on `https://canvas.illinois.edu/calendar*`; do not write to Canvas APIs or mutate its calendar DOM.
- Plan start precedence: explicit local date, then effective assignment `unlock_at`, then due date as a single-day item.
- Completion is local and independent of Canvas submission and Planner state.
- Include personal, active-course, active-group, and visible account-calendar contexts; send no more than 10 context codes per calendar request and follow all pagination links.
- Query a window from the first day six calendar months before the viewed month through the last day six calendar months after it.
- Keep user state separate by Canvas hostname, user ID, item type, and item ID; use the Canvas profile time zone if available.

## File Map

- `package.json`, `package-lock.json`: test/build scripts and pinned test/build tools.
- `scripts/build.mjs`: deterministic extension bundle.
- `manifest.json`, `src/background.js`, `src/content.js`: Chrome registration and action-to-overlay toggle.
- `src/canvas-api.js`: authenticated, paginated read-only Canvas requests and context batching.
- `src/model.js`, `src/dates.js`: normalized items, date precedence, month window and week segments.
- `src/storage.js`: per-user local planning dates, completion and last month.
- `src/view.js`, `src/styles.js`: isolated month UI, detail pane, controls and visible error states.
- `test/*.test.js`, `test/fixtures/*.json`: API, date, state and rendering behavior using mock Canvas data.
- `README.md`: unpacked installation, usage, data handling and live-login verification.

## Review Focus

- Canvas may return an HTML login page with HTTP 200: Task 1 test must reject it as an authentication error with a retry path.
- A pagination `Link` can point to the same page: Task 1 test must stop a cycle and report a data error.
- One event can arrive through multiple contexts: Task 2 test must merge it into one item while retaining all context labels.
- A due time near midnight can change calendar date across time zones or daylight saving: Task 2 test must use the profile time zone consistently.
- Two Canvas users can use one Chrome profile: Task 3 test must keep their local completion and start dates separate.

---

### Task 1: Canvas read client and build foundation

**Files:** Create `package.json`, `package-lock.json`, `src/canvas-api.js`, `test/canvas-api.test.js`, `test/fixtures/canvas-pages.json`.

**Interfaces:** Produce `loadCanvasSnapshot({fetchImpl, month}): Promise<{profile, contexts, events, assignments, range}>`. `month` is `YYYY-MM`; `range` is `{startDate,endDate}`. Export `fetchPages(fetchImpl,url)` for tests and later use. Failure throws `CanvasApiError` with `code` equal to `AUTH`, `HTTP`, or `DATA`.

- [ ] **Step 1: Write failing tests** for a profile, 12 combined contexts (including a visible account calendar), event and assignment requests split into batches of at most 10, all response pages, the six-month window, HTML login response, and repeated next-page URL. Fixture responses must include an assignment with `assignment: null` so detail fallback is exercised.
- [ ] **Step 2: Run `npm test -- test/canvas-api.test.js`**; expect failure because `src/canvas-api.js` does not exist.
- [ ] **Step 3: Implement the exact exports** above. Use `GET /api/v1/users/self/profile`, `GET /api/v1/courses?enrollment_state=active`, `GET /api/v1/users/self/groups`, `GET /api/v1/account_calendars`, and `GET /api/v1/calendar_events` for each type and context batch. Request the effective assignment detail when the calendar record lacks dates. Reject non-JSON responses and non-OK statuses with typed errors. `package.json` provides `npm test` using `node --test` and pins esbuild and jsdom as dev dependencies; add the build script in Task 4.
- [ ] **Step 4: Run `npm test -- test/canvas-api.test.js`**; expect all cases to pass.
- [ ] **Step 5: Commit** the task files with `feat: read Canvas calendar data`.

### Task 2: Item normalization and calendar geometry

**Files:** Create `src/model.js`, `src/dates.js`, `test/model.test.js`, `test/dates.test.js`.

**Interfaces:** Produce `normalizeItems(snapshot, userState): Item[]`, where `Item` is `{key,type,title,contexts,startDay,endDay,startAt,endAt,url,completed,needsStart,warnings}`; produce `monthWeeks(month): Day[][]` and `weekSegments(items, weeks): Segment[][]`. `Day` is a local `YYYY-MM-DD` string and `Segment` is `{itemKey,weekIndex,startColumn,endColumn}` with inclusive Sunday-based columns 0–6. Dates use `snapshot.profile.time_zone` when present.

- [ ] **Step 1: Write failing tests** for an activity crossing two weeks, a one-day event, an assignment using `unlock_at`, a manual start overriding it, an assignment without `unlock_at`, a start later than due date, no due date, duplicate item contexts, visible-month clipping, and midnight/DST conversion.
- [ ] **Step 2: Run `npm test -- test/model.test.js test/dates.test.js`**; expect missing-module failures.
- [ ] **Step 3: Implement the exact exports** above. `normalizeItems` takes raw records from Task 1 plus Task 3 state `{starts,completed}`. Invalid local starts are ignored and reported in a `warnings` field on the item; undated assignments are omitted. `monthWeeks` returns complete Sunday-to-Saturday weeks; `weekSegments` returns clipped, per-week bars ordered by start day and title.
- [ ] **Step 4: Run `npm test -- test/model.test.js test/dates.test.js`**; expect all cases to pass.
- [ ] **Step 5: Commit** the task files with `feat: compute planning spans`.

### Task 3: Per-user local state

**Files:** Create `src/storage.js`, `test/storage.test.js`.

**Interfaces:** Produce `createPlannerStore(storageArea, hostname, userId)` with async `load(): {starts,completed,lastMonth}`, `setStart(itemKey, day|null)`, `setCompleted(itemKey, boolean)`, and `setLastMonth(month)` methods. The item key is `type:id`; store keys include hostname and user ID.

- [ ] **Step 1: Write failing tests** for reload persistence, clearing a manual date, toggling completion both ways, a different Canvas user on the same Chrome profile, and a different hostname.
- [ ] **Step 2: Run `npm test -- test/storage.test.js`**; expect missing-module failure.
- [ ] **Step 3: Implement `createPlannerStore`** using only the injected `chrome.storage.local` compatible area. Do not persist Canvas descriptions, course lists or authentication material.
- [ ] **Step 4: Run `npm test -- test/storage.test.js`**; expect all cases to pass.
- [ ] **Step 5: Commit** the task files with `feat: persist local planning state`.

### Task 4: Toggle and isolated month view

**Files:** Create `manifest.json`, `scripts/build.mjs`, `src/background.js`, `src/content.js`, `src/view.js`, `src/styles.js`, `test/view.test.js`; modify `package.json`.

**Interfaces:** Produce `mountPlanner({host,loadSnapshot,storeFactory,initialMonth,now}): {toggle(),destroy()}`. Here `loadSnapshot(month)` calls Task 1, `storeFactory(userId)` returns a Task 3 store, `initialMonth` is `YYYY-MM`, and `now` is a Date. `background.js` sends `{type:'PLANNER_TOGGLE'}` to the active calendar tab. `content.js` creates one host under `document.body`, attaches a Shadow DOM, and calls `mountPlanner`.

- [ ] **Step 1: Write failing tests** using a small DOM fixture for single-instance open/close, Escape, initial URL month, previous/next/today, span bars across weeks, detail link, start-date edit, completion toggle, error/retry, and unchanged native fixture nodes after close. Add a check that the built manifest targets only the Illinois calendar.
- [ ] **Step 2: Run `npm test -- test/view.test.js`**; expect failure because the view module is absent.
- [ ] **Step 3: Implement the entry points and view** with Shadow DOM styles. Include a visible loading state and `aria` labels for icon buttons, date input and completion checkbox. Use only DOM text nodes for Canvas titles; do not insert Canvas descriptions as HTML. Close removes the overlay host; refresh reruns `loadSnapshot`. `scripts/build.mjs` bundles both entry points and copies `manifest.json` into `dist/`.
- [ ] **Step 4: Run `npm test -- test/view.test.js` and `npm run build`**; expect passing tests and `dist/manifest.json`, `dist/content.js`, `dist/background.js`.
- [ ] **Step 5: Commit** the task files with `feat: add planning calendar overlay`.

### Task 5: Installation and end-to-end verification

**Files:** Create `README.md`; modify only files that fail the final checks.

**Interfaces:** Deliver `dist/` as a loadable unpacked extension and document its behavior and known live-login limit.

- [ ] **Step 1: Write README** with build command, Chrome `chrome://extensions` loading steps, toolbar toggle, local-only status, and the fact that an Illinois Canvas login is required for live verification.
- [ ] **Step 2: Run `npm test` and `npm run build`**; expect all tests passing and a valid Manifest V3 bundle.
- [ ] **Step 3: Load the unpacked `dist/` extension in Chrome** and inspect extension loading errors. Verify toggle, cross-week bars, edit/persistence and error state with the jsdom fixture harness. If an authenticated Illinois Canvas tab is available, also verify the real calendar; otherwise record that specific limitation in README.
- [ ] **Step 4: Commit** README and any required fixes with `docs: explain installation and verification`.
