import test from 'node:test';
import assert from 'node:assert/strict';
import {generateSchedule} from '../src/scheduler.js';
import {validatePlan} from '../src/plan-validation.js';
import {normalizeItems} from '../src/model.js';
import {buildAvailability} from '../src/availability.js';
import {plan, task} from './helpers/planning.js';
import * as model from '../src/model.js';
import {validInstant} from '../src/storage.js';

const now = '2026-10-01T12:00:00Z';
const factsFor = (p, items = [task()]) => ({items, now, loadedRange: p.range, completed: {}});

test('malformed live deadlines and release instants block generation with an actionable issue', async () => {
  for (const patch of [{dueAt: 'invalid'}, {unlockAt: 'invalid'}, {dueAt: null}]) {
    const item = task(patch);
    const p = plan({tasks: {[item.key]: {...item, estimateMinutes: 60, singleSession: true}}});
    const facts = factsFor(p, [item]);
    const checked = validatePlan(p, facts);
    assert.ok(checked.issues.some(issue => issue.code === 'TASK_TIME' && issue.itemKey === item.key));
    const result = await generateSchedule({plan: p, ...facts});
    assert.equal(result.status, 'partial');
    assert.equal(result.validation.unassigned[item.key], 60);
    assert.equal(result.segments.length, 0);
    assert.ok(result.issues.some(issue => issue.code === 'TASK_TIME'));
  }
});

test('reversed fixed events are reported rather than silently leaving apparently free time', () => {
  const event = task({key: 'event:bad', type: 'event', fixedStartAt: '2026-10-01T11:00:00-05:00', fixedEndAt: '2026-10-01T10:00:00-05:00'});
  const p = plan();
  assert.ok(validatePlan(p, factsFor(p, [task(), event])).issues.some(issue => issue.code === 'EVENT_TIME'));
});

test('invalid account zones are rejected at import rather than using the host timezone', () => {
  assert.throws(() => normalizeItems({profile: {id: 1, time_zone: 'Mars/Olympus'}, contexts: [], events: [], assignments: []}), /time zone/i);
});

test('conflicting duplicate imports remain one task and visibly block ambiguous timing', async () => {
  const raw = {id: 'assignment_1', title: 'Duplicate lab', context_code: 'course_1', assignment: {due_at: '2026-10-03T20:00:00-05:00', unlock_at: null}};
  const snapshot = {profile: {id: 1, time_zone: 'America/Chicago'}, contexts: [{code: 'course_1', name: 'Studio'}], events: [], assignments: [raw, structuredClone(raw)]};
  assert.equal(normalizeItems(snapshot).length, 1);
  snapshot.assignments.push({...raw, assignment: {...raw.assignment, due_at: '2026-10-02T20:00:00-05:00'}});
  const items = normalizeItems(snapshot);
  assert.equal(items.length, 1);
  assert.equal(items[0].dataConflict, true);
  assert.ok(items[0].warnings.some(warning => /conflicting/i.test(warning)));
  const p = plan({tasks: {[items[0].key]: {...items[0], estimateMinutes: 60, singleSession: true}}});
  const result = await generateSchedule({plan: p, ...factsFor(p, items)});
  assert.ok(result.issues.some(issue => issue.code === 'DATA_CONFLICT'));
  assert.equal(result.validation.unassigned[items[0].key], 60);
});

test('equivalent offset representations of duplicate dates do not create a false conflict', () => {
  const raw = {id: 'assignment_1', title: 'Lab', assignment: {due_at: '2026-10-01T20:00:00-05:00', unlock_at: null}};
  const snapshot = {profile: {id: 1, time_zone: 'America/Chicago'}, contexts: [], events: [], assignments: [raw, {...raw, assignment: {...raw.assignment, due_at: '2026-10-02T01:00:00Z'}}]};
  const items = normalizeItems(snapshot);
  assert.equal(items.length, 1);
  assert.notEqual(items[0].dataConflict, true);
});

test('a valid duplicate cannot hide an invalid deadline from another source', async () => {
  const raw = {id: 'assignment_1', title: 'Lab', assignment: {due_at: '2026-10-03T20:00:00-05:00', unlock_at: null}};
  for (const due of [null, 'bad', '2026-02-30T20:00:00Z']) {
    const snapshot = {profile: {id: 1, time_zone: 'America/Chicago'}, contexts: [], events: [], assignments: [raw, {...raw, assignment: {...raw.assignment, due_at: due}}]};
    const items = normalizeItems(snapshot);
    assert.equal(items.length, 1);
    assert.equal(items[0].dataConflict, true);
    const p = plan({tasks: {[items[0].key]: {...items[0], estimateMinutes: 60, singleSession: true}}});
    const result = await generateSchedule({plan: p, ...factsFor(p, items)});
    assert.equal(result.status, 'partial');
    assert.equal(result.segments.length, 0);
  }
});

test('event display fallback cannot turn an unverified interval into free planning time', async () => {
  const snapshot = {profile: {id: 1, time_zone: 'America/Chicago'}, contexts: [], assignments: [], events: [
    {id: 1, title: 'Unverified meeting', start_at: 'bad', end_at: '2026-10-01T10:00:00-05:00'}
  ]};
  const event = normalizeItems(snapshot)[0];
  assert.equal(event.startDay, '2026-10-01');
  const p = plan();
  const result = await generateSchedule({plan: p, ...factsFor(p, [task(), event])});
  assert.ok(result.issues.some(issue => issue.code === 'EVENT_TIME'));
  assert.equal(result.status, 'partial');
  assert.equal(result.segments.length, 0);
  assert.match(model.snapshotImportWarnings(snapshot).join(' '), /Unverified meeting.*time/i);
});

test('spring-forward windows use elapsed capacity and a nonexistent endpoint is explicit', () => {
  const p = plan();
  const range = {startDate: '2026-03-08', endDate: '2026-03-08'};
  p.schedule.weekdays.forEach(day => Object.assign(day, {start: '01:00', end: '04:00', maxMinutes: 180}));
  let availability = buildAvailability({range, schedule: p.schedule, timeZone: p.timeZone, now: '2026-03-07T12:00Z'});
  assert.equal(availability.days[0].budgetMinutes, 120);
  p.schedule.weekdays[0].start = '02:30';
  p.schedule.weekdays[0].maxMinutes = 90;
  availability = buildAvailability({range, schedule: p.schedule, timeZone: p.timeZone, now: '2026-03-07T12:00Z'});
  assert.equal(availability.days[0].budgetMinutes, 0);
  assert.ok(availability.issues.some(issue => issue.code === 'TIME'));
});

test('completion and a changed deadline replan unlocked work while preserving locks', async () => {
  const second = task({key: 'assignment:2', title: 'Second task'});
  const p = plan();
  p.tasks[second.key] = {...second, estimateMinutes: 60, singleSession: true};
  p.segments = [{id: 'keep', itemKey: 'assignment:1', startAt: '2026-10-01T14:00:00Z', endAt: '2026-10-01T15:00:00Z', locked: true, order: 0}];
  const first = await generateSchedule({plan: p, ...factsFor(p, [task(), second])});
  assert.equal(first.validation.complete, true);
  const changed = {...second, dueAt: '2026-10-02T17:00:00Z'};
  const stale = await generateSchedule({plan: {...p, segments: first.segments}, ...factsFor(p, [task(), changed])});
  assert.ok(stale.issues.some(issue => issue.code === 'STALE'));
  p.tasks[second.key] = {...p.tasks[second.key], dueAt: changed.dueAt};
  const completed = {'assignment:1': true};
  const result = await generateSchedule({plan: {...p, segments: first.segments}, ...factsFor(p, [task(), changed]), completed});
  assert.deepEqual(result.segments.find(segment => segment.id === 'keep'), p.segments[0]);
  assert.equal(validatePlan({...p, segments: result.segments}, {...factsFor(p, [task(), changed]), completed}).complete, true);
});

test('offset-free and impossible calendar instants cannot be persisted or scheduled', () => {
  for (const value of ['2026-10-01T10:00:00', '2026-02-30T10:00:00Z', '2026-10-01']) assert.equal(validInstant(value), false, value);
  assert.equal(validInstant('2026-11-01T01:30:00-05:00'), true);
  assert.equal(validInstant('2026-11-01T01:30:00-06:00'), true);
});

test('omitted malformed and undated imports have visible per-task reasons', () => {
  const snapshot = {profile: {id: 1, time_zone: 'America/Chicago'}, contexts: [], events: [], assignments: [
    {id: 'assignment_1', title: 'Unscheduled essay', assignment: {due_at: null}},
    {id: 'assignment_2', title: 'Broken date', assignment: {due_at: 'bad'}}
  ]};
  assert.equal(typeof model.snapshotImportWarnings, 'function');
  const warnings = model.snapshotImportWarnings(snapshot);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /Unscheduled essay.*deadline/i);
  assert.match(warnings[1], /Broken date.*deadline/i);
});

test('bounded search explicitly discloses exhaustion instead of claiming proven infeasibility', async () => {
  const items = Array.from({length: 12}, (_, index) => task({key: `assignment:${index}`, dueAt: '2026-10-01T20:00:00-05:00', endDay: '2026-10-01'}));
  const p = plan({range: {startDate: '2026-10-01', endDate: '2026-10-01'}, tasks: Object.fromEntries(items.map(item => [item.key, {...item, estimateMinutes: 60, singleSession: true}]))});
  p.schedule.bufferMinutes = 0;
  p.schedule.weekdays.forEach(day => Object.assign(day, {start: '09:00', end: '20:00', maxMinutes: 660}));
  const result = await generateSchedule({plan: p, ...factsFor(p, items)}, {budgetMs: 5000});
  assert.equal(result.status, 'partial');
  assert.ok(result.issues.some(issue => issue.code === 'SEARCH_LIMIT'));
  assert.ok(result.diagnostics.searchLimitReached);
  assert.ok(Object.keys(result.validation.unassigned).length > 0);
  assert.equal(result.segments.reduce((sum, segment) => sum + (Date.parse(segment.endAt) - Date.parse(segment.startAt)) / 60000, 0), 660);
});

test('blocked preconditions do not misdiagnose otherwise feasible tasks as capacity failures', async () => {
  const second = task({key: 'assignment:2'});
  const event = task({key: 'event:1', type: 'event', fixedStartAt: '2026-10-01T09:00:00-05:00', fixedEndAt: '2026-10-01T10:00:00-05:00'});
  const p = plan();
  p.tasks[second.key] = {...second, estimateMinutes: 60, singleSession: true};
  p.segments = [{id: 'bad-lock', itemKey: 'assignment:1', startAt: '2026-10-01T09:00:00-05:00', endAt: '2026-10-01T10:00:00-05:00', locked: true, order: 0}];
  const result = await generateSchedule({plan: p, ...factsFor(p, [task(), second, event])});
  const missing = result.issues.find(issue => issue.code === 'UNASSIGNED' && issue.itemKey === second.key);
  assert.equal(missing.reason, 'BLOCKED');
  assert.match(missing.message, /conflict|invalid/i);
  assert.equal(result.diagnostics.visitedStates, 0);
});


test('events with no trustworthy endpoint block scheduling without inventing calendar dates', async () => {
  const {monthWeeks, weekSegments} = await import('../src/dates.js');
  for (const [start_at, end_at] of [[null, null], ['bad', 'bad'], ['2026-02-30T10:00:00Z', '2026-02-30T11:00:00Z']]) {
    const snapshot = {profile: {id: 1, time_zone: 'America/Chicago'}, contexts: [], assignments: [], events: [
      {id: 9, title: 'Unverified meeting', start_at, end_at}
    ]};
    const items = normalizeItems(snapshot);
    const p = plan();
    const result = await generateSchedule({plan: p, ...factsFor(p, structuredClone([task(), ...items]))});
    assert.equal(result.status, 'partial');
    assert.equal(result.segments.length, 0);
    assert.ok(result.issues.some(issue => issue.code === 'EVENT_TIME' && issue.itemKey === 'event:9'));
    assert.equal(items.length, 1);
    assert.equal(items[0].invalidTime, true);
    assert.equal(items[0].startAt, null);
    assert.equal(items[0].endAt, null);
    assert.deepEqual(weekSegments(items, monthWeeks('2026-10')).flat(), []);
  }
});

test('a dated event copy cannot hide an entirely invalid duplicate in either import order', async () => {
  const valid = {id: 9, title: 'Meeting', start_at: '2026-10-01T09:00:00-05:00', end_at: '2026-10-01T10:00:00-05:00'};
  const invalid = {...valid, start_at: null, end_at: null};
  for (const events of [[valid, invalid], [invalid, valid]]) {
    const items = normalizeItems({profile: {id: 1, time_zone: 'America/Chicago'}, contexts: [], assignments: [], events});
    const p = plan();
    const result = await generateSchedule({plan: p, ...factsFor(p, [task(), ...items])});
    assert.equal(result.status, 'partial');
    assert.equal(result.segments.length, 0);
    assert.equal(items.length, 1);
    assert.equal(items[0].invalidTime, true);
    assert.equal(items[0].dataConflict, true);
    assert.equal(items[0].startDay, '2026-10-01');
    assert.equal(items[0].fixedStartAt, valid.start_at);
  }
});
