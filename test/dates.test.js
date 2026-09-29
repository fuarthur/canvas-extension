import test from 'node:test';
import assert from 'node:assert/strict';
import { dateKey, monthWeeks, weekSegments } from '../src/dates.js';

test('monthWeeks returns complete Sunday-to-Saturday rows', () => {
  const weeks = monthWeeks('2026-09');
  assert.equal(weeks[0][0], '2026-08-30');
  assert.equal(weeks.at(-1).at(-1), '2026-10-03');
  assert.ok(weeks.every(week => week.length === 7));
});

test('weekSegments clips a long item to the visible month and splits it by week', () => {
  const weeks = monthWeeks('2026-09');
  const segments = weekSegments([{ key: 'assignment:1', title: 'Essay', startDay: '2026-08-20', endDay: '2026-10-05' }], weeks);
  assert.deepEqual(segments[0][0], { itemKey: 'assignment:1', weekIndex: 0, startColumn: 2, endColumn: 6 });
  assert.deepEqual(segments.at(-1)[0], { itemKey: 'assignment:1', weekIndex: 4, startColumn: 0, endColumn: 3 });
});

test('weekSegments keeps a one-day item in one cell', () => {
  const segments = weekSegments([{ key: 'event:2', title: 'Lab', startDay: '2026-09-08', endDay: '2026-09-08' }], monthWeeks('2026-09'));
  assert.deepEqual(segments[1][0], { itemKey: 'event:2', weekIndex: 1, startColumn: 2, endColumn: 2 });
});

test('dateKey uses Canvas profile time zone across midnight and daylight saving', () => {
  assert.equal(dateKey('2026-09-01T02:00:00Z', 'America/Chicago'), '2026-08-31');
  assert.equal(dateKey('2026-03-08T07:30:00Z', 'America/Chicago'), '2026-03-08');
  assert.equal(dateKey('2026-03-08T07:30:00Z', 'America/Los_Angeles'), '2026-03-07');
});
