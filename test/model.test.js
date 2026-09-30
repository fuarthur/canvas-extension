import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeItems } from '../src/model.js';

const fixture = JSON.parse(await readFile(new URL('./fixtures/canvas-pages.json', import.meta.url)));
const snapshot = (overrides = {}) => ({
  profile: fixture.profile,
  contexts: [{ code: 'course_1', name: 'Course 1' }, { code: 'group_44', name: 'Lab group' }],
  events: [fixture.event],
  assignments: [{ ...fixture.assignment, assignment: fixture.assignmentDetail }],
  ...overrides
});
const state = { starts: {}, completed: {} };

test('Canvas user completion is combined with local marks, never class-wide submissions', () => {
  for (const [assignment, expected] of [
    [{ user_submitted: true }, true],
    [{ user_submitted: false, has_submitted_submissions: true }, false],
    [{ submission: { user_id: 77, workflow_state: 'submitted' } }, true],
    [{ submission: { user_id: 88, workflow_state: 'graded' } }, false],
    [{ user_submitted: false, submission: { user_id: 77, workflow_state: 'graded' } }, false]
  ]) {
    const [item] = normalizeItems(snapshot({ events: [], assignments: [{ ...fixture.assignment, assignment: { ...fixture.assignmentDetail, ...assignment } }] }), state);
    assert.equal(item.completed, expected);
    assert.equal(item.canvasCompleted, expected);
  }
});

test('event retains its real start and end dates and assignment uses unlock date', () => {
  const items = normalizeItems(snapshot(), state);
  assert.deepEqual(items.map(item => [item.key, item.startDay, item.endDay]), [
    ['event:5', '2026-09-10', '2026-09-12'],
    ['assignment:987', '2026-09-02', '2026-09-20']
  ]);
});

test('manual assignment start overrides unlock date and completion is local', () => {
  const items = normalizeItems(snapshot(), {
    starts: { 'assignment:987': '2026-09-04' },
    completed: { 'assignment:987': true }
  });
  assert.equal(items[1].startDay, '2026-09-04');
  assert.equal(items[1].completed, true);
});

test('assignment without unlock date stays on due day until a manual start is chosen', () => {
  const assignment = { ...fixture.assignmentDetail, unlock_at: null };
  const [item] = normalizeItems(snapshot({ events: [], assignments: [{ ...fixture.assignment, assignment }] }), state);
  assert.equal(item.startDay, '2026-09-20');
  assert.equal(item.needsStart, true);
});

test('invalid manual date is ignored with a warning and no due date is omitted', () => {
  const items = normalizeItems(snapshot(), { starts: { 'assignment:987': '2026-09-21' }, completed: {} });
  assert.equal(items[1].startDay, '2026-09-02');
  assert.ok(items[1].warnings.length > 0);
  const undated = { ...fixture.assignmentDetail, due_at: null };
  assert.equal(normalizeItems(snapshot({ events: [], assignments: [{ ...fixture.assignment, assignment: undated }] }), state).length, 0);
});

test('impossible saved date does not crash the calendar', () => {
  const items = normalizeItems(snapshot(), { starts: { 'assignment:987': '2026-99-99' }, completed: {} });
  assert.equal(items[1].startDay, '2026-09-02');
  assert.ok(items[1].warnings.length > 0);
});

test('duplicate event from another context becomes one item with both labels', () => {
  const duplicate = { ...fixture.event, context_code: 'group_44' };
  const [item] = normalizeItems(snapshot({ events: [fixture.event, duplicate], assignments: [] }), state);
  assert.deepEqual(item.contexts, ['Course 1', 'Lab group']);
});

test('event missing its end date becomes a one-day item', () => {
  const event = { ...fixture.event, end_at: null };
  const [item] = normalizeItems(snapshot({ events: [event], assignments: [] }), state);
  assert.equal(item.endDay, item.startDay);
});

test('event with malformed start retains its valid end date with a warning', () => {
  const event = { ...fixture.event, start_at: 'bad', end_at: '2026-09-20T10:00:00-05:00' };
  const [item] = normalizeItems(snapshot({ events: [event], assignments: [] }), state);
  assert.equal(item.startDay, '2026-09-20');
  assert.equal(item.endDay, '2026-09-20');
  assert.ok(item.warnings.length > 0);
});
