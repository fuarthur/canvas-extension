import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CanvasApiError, fetchPages, loadCanvasSnapshot } from '../src/canvas-api.js';

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

test('loadCanvasSnapshot batches 11 contexts and retrieves effective assignment dates', async () => {
  const calendarUrls = [];
  const fetchImpl = async input => {
    const url = new URL(input, origin);
    if (url.pathname === '/api/v1/users/self/profile') return json(fixture.profile);
    if (url.pathname === '/api/v1/courses') return json(fixture.courses);
    if (url.pathname === '/api/v1/users/self/groups') return json(fixture.groups);
    if (url.pathname === '/api/v1/courses/1/assignments/987') return json(fixture.assignmentDetail);
    if (url.pathname === '/api/v1/calendar_events') {
      calendarUrls.push(url);
      const contexts = url.searchParams.getAll('context_codes[]');
      assert.ok(contexts.length <= 10);
      assert.equal(url.searchParams.get('start_date'), '2026-03-01');
      assert.equal(url.searchParams.get('end_date'), '2027-03-31');
      if (!contexts.includes('course_1')) return json([]);
      return json(url.searchParams.get('type') === 'event' ? [fixture.event] : [fixture.assignment]);
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const snapshot = await loadCanvasSnapshot({ fetchImpl, month: '2026-09' });
  assert.equal(snapshot.profile.id, 77);
  assert.equal(snapshot.contexts.length, 11);
  assert.equal(calendarUrls.length, 4);
  assert.equal(snapshot.events.length, 1);
  assert.equal(snapshot.assignments[0].assignment.unlock_at, '2026-09-02T00:00:00-05:00');
});
