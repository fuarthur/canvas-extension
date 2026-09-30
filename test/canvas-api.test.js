import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CanvasApiError, fetchPages, loadCanvasSnapshot } from '../src/canvas-api.js';

import * as canvasApi from '../src/canvas-api.js';

const fixture = JSON.parse(await readFile(new URL('./fixtures/canvas-pages.json', import.meta.url)));
const origin = 'https://canvas.illinois.edu';
const json = (value, headers = {}) => new Response(JSON.stringify(value), {
  headers: { 'content-type': 'application/json', ...headers }
});

test('fetchPages follows Link pagination and gathers all rows', async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    return calls.length === 1
      ? json([1], { link: `<${origin}/api/v1/items?page=2>; rel="next"` })
      : json([2]);
  };
  assert.deepEqual(await fetchPages(fetchImpl, `${origin}/api/v1/items`), [1, 2]);
  assert.equal(calls.length, 2);
});

test('fetchPages accepts Illinois account calendar envelope across pages', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return calls === 1
      ? json({ account_calendars: [{ id: 15 }], total_results: 2 }, { link: `<${origin}/api/v1/account_calendars?page=2>; rel="next"` })
      : json({ account_calendars: [{ id: 16 }], total_results: 2 });
  };
  assert.deepEqual(await fetchPages(fetchImpl, `${origin}/api/v1/account_calendars`, 'account_calendars'), [{ id: 15 }, { id: 16 }]);
});

test('fetchPages rejects a repeated next-page link', async () => {
  const url = `${origin}/api/v1/items`;
  const fetchImpl = async () => json([1], { link: `<${url}>; rel="next"` });
  await assert.rejects(fetchPages(fetchImpl, url), error => error instanceof CanvasApiError && error.code === 'DATA');
});

test('fetchPages rejects HTML login responses and authorization failures', async () => {
  await assert.rejects(fetchPages(async () => new Response('<html>login</html>', {
    headers: { 'content-type': 'text/html' }
  }), `${origin}/api/v1/items`), error => error.code === 'AUTH');
  await assert.rejects(fetchPages(async () => new Response('{}', { status: 401 }), `${origin}/api/v1/items`), error => error.code === 'AUTH');
});

test('forbidden Canvas requests identify the denied endpoint', async () => {
  await assert.rejects(
    fetchPages(async () => new Response('{"errors":["forbidden"]}', { status: 403, headers: { 'content-type': 'application/json' } }), `${origin}/api/v1/calendar_events?type=assignment`),
    error => error instanceof CanvasApiError && error.code === 'FORBIDDEN' && /calendar_events/.test(error.message) && /403/.test(error.message)
  );
});

function calendarFetch(statusForContexts) {
  return async input => {
    const url = new URL(input);
    if (url.pathname.endsWith('/profile')) return json(fixture.profile);
    if (url.pathname === '/api/v1/courses') return json([{ id: 1, name: 'Course 1' }]);
    if (url.pathname.endsWith('/groups')) return json([{ id: 44, name: 'Old lab group' }]);
    if (url.pathname === '/api/v1/account_calendars') return json({ account_calendars: [], total_results: 0 });
    if (url.pathname === '/api/v1/calendar_events') {
      const codes = url.searchParams.getAll('context_codes[]');
      const status = statusForContexts(codes);
      if (status !== 200) return new Response('{"status":"unauthorized","errors":[{"message":"user not authorized to perform that action"}]}', { status });
      if (url.searchParams.get('type') === 'event') return json(codes.includes('course_1') ? [fixture.event] : []);
      return json(codes.includes('course_1') ? [{ ...fixture.assignment, assignment: fixture.assignmentDetail }] : []);
    }
    throw new Error(`Unexpected URL ${url}`);
  };
}

test('denied context does not block accessible events or assignments and is reported', async () => {
  const snapshot = await loadCanvasSnapshot({
    month: '2026-09', fetchImpl: calendarFetch(codes => codes.includes('group_44') ? 403 : 200)
  });
  assert.deepEqual(snapshot.events.map(event => event.id), [5]);
  assert.deepEqual(snapshot.assignments.map(event => event.id), ['assignment_987']);
  assert.equal(snapshot.warnings.length, 1);
  assert.match(snapshot.warnings[0], /Old lab group/);
});

test('global calendar denial is an error rather than a successful empty calendar', async () => {
  await assert.rejects(loadCanvasSnapshot({ month: '2026-09', fetchImpl: calendarFetch(() => 403) }), error => error.code === 'FORBIDDEN');
});

test('calendar login failures are not treated as inaccessible contexts', async () => {
  await assert.rejects(loadCanvasSnapshot({ month: '2026-09', fetchImpl: calendarFetch(() => 401) }), error => error.code === 'AUTH');
});

test('loadCanvasSnapshot batches 12 contexts including account calendars and retrieves effective assignment dates', async () => {
  const calendarUrls = [];
  const fetchImpl = async input => {
    const url = new URL(input, origin);
    if (url.pathname === '/api/v1/users/self/profile') return json(fixture.profile);
    if (url.pathname === '/api/v1/courses') return json(fixture.courses);
    if (url.pathname === '/api/v1/users/self/groups') return json(fixture.groups);
    if (url.pathname === '/api/v1/account_calendars') return json({ account_calendars: fixture.accountCalendars, total_results: fixture.accountCalendars.length });
    if (url.pathname === '/api/v1/courses/1/assignments/987') return json(fixture.assignmentDetail);
    if (url.pathname === '/api/v1/calendar_events') {
      calendarUrls.push(url);
      const contexts = url.searchParams.getAll('context_codes[]');
      assert.ok(contexts.length <= 10);
      assert.equal(url.searchParams.get('start_date'), '2026-03-01');
      assert.equal(url.searchParams.get('end_date'), '2027-03-31');
      if (url.searchParams.get('type') === 'event') {
        return json([
          ...(contexts.includes('course_1') ? [fixture.event] : []),
          ...(contexts.includes('account_15') ? [fixture.accountEvent] : [])
        ]);
      }
      return json(contexts.includes('course_1') ? [fixture.assignment] : []);
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const snapshot = await loadCanvasSnapshot({ fetchImpl, month: '2026-09' });
  assert.equal(snapshot.profile.id, 77);
  assert.equal(snapshot.contexts.length, 12);
  assert.ok(snapshot.contexts.some(context => context.code === 'account_15' && context.name === 'College of Education'));
  assert.equal(calendarUrls.length, 4);
  assert.equal(snapshot.events.length, 2);
  assert.equal(snapshot.assignments[0].assignment.unlock_at, '2026-09-02T00:00:00-05:00');
});

test('saved calendar selection is applied before any event or assignment request', async () => {
  const requested = [];
  const base = calendarFetch(() => 200);
  const snapshot = await loadCanvasSnapshot({ month: '2026-09', readSelection: async id => {
    assert.equal(id, 77);
    return ['course_1'];
  }, fetchImpl: async input => {
    const url = new URL(input);
    if (url.pathname === '/api/v1/calendar_events') {
      requested.push(url);
      assert.deepEqual(url.searchParams.getAll('context_codes[]'), ['course_1']);
      if (url.searchParams.get('type') === 'assignment') assert.ok(url.searchParams.getAll('include[]').includes('submission'));
    }
    return base(input);
  } });
  assert.equal(requested.length, 2);
  assert.equal(snapshot.contexts.length, 3);
  assert.deepEqual(snapshot.selectedCalendars, ['course_1']);
});

test('deselecting every calendar skips all calendar requests and preserves configuration', async () => {
  let calls = 0;
  const base = calendarFetch(() => 200);
  const snapshot = await loadCanvasSnapshot({ month: '2026-09', readSelection: async () => [], fetchImpl: async input => {
    if (new URL(input).pathname === '/api/v1/calendar_events') calls++;
    return base(input);
  } });
  assert.equal(calls, 0);
  assert.deepEqual(snapshot.events, []);
  assert.deepEqual(snapshot.assignments, []);
  assert.equal(snapshot.contexts.length, 3);
});

test('loader reuses directory and denied contexts but refreshes completion and checks the user', async () => {
  let id = 77;
  let submitted = false;
  let now = 0;
  const calls = [];
  const base = calendarFetch(codes => codes.includes('group_44') ? 403 : 200);
  const loader = canvasApi.createCanvasLoader({ now: () => now, fetchImpl: async input => {
    const url = new URL(input);
    calls.push(url);
    if (url.pathname.endsWith('/profile')) return json({ ...fixture.profile, id });
    const response = await base(input);
    if (url.pathname === '/api/v1/calendar_events' && url.searchParams.get('type') === 'assignment' && response.ok) {
      const rows = await response.json();
      return json(rows.map(row => ({ ...row, assignment: { ...row.assignment, user_submitted: submitted } })));
    }
    return response;
  } });
  await loader('2026-09');
  calls.length = 0;
  submitted = true;
  const refreshed = await loader('2026-09');
  assert.equal(calls.filter(url => url.pathname === '/api/v1/courses').length, 0);
  assert.equal(calls.filter(url => url.pathname.endsWith('/profile')).length, 1);
  assert.equal(calls.filter(url => url.pathname === '/api/v1/calendar_events').length, 2);
  assert.ok(calls.filter(url => url.pathname === '/api/v1/calendar_events').every(url => !url.searchParams.getAll('context_codes[]').includes('group_44')));
  assert.equal(refreshed.assignments[0].assignment.user_submitted, true);
  assert.match(refreshed.warnings[0], /Old lab group/);
  calls.length = 0;
  id = 88;
  await loader('2026-09');
  assert.equal(calls.filter(url => url.pathname === '/api/v1/courses').length, 1);
  assert.ok(calls.some(url => url.searchParams.getAll('context_codes[]').includes('group_44')));
  calls.length = 0;
  id = 77;
  now = 300001;
  await loader('2026-09');
  assert.equal(calls.filter(url => url.pathname === '/api/v1/courses').length, 1);
  assert.ok(calls.some(url => url.searchParams.getAll('context_codes[]').includes('group_44')));
});

test('explicit permission retry rechecks denied calendars before cache expiry', async () => {
  let allowed = false;
  const base = calendarFetch(codes => !allowed && codes.includes('group_44') ? 403 : 200);
  const loader = canvasApi.createCanvasLoader({ fetchImpl: base });
  await loader('2026-09');
  allowed = true;
  const snapshot = await loader('2026-09', { retryUnavailable: true });
  assert.deepEqual(snapshot.warnings, []);
});
