import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {writeFile} from 'node:fs/promises';
import {generateSchedule} from '../src/scheduler.js';
import {validatePlan} from '../src/plan-validation.js';
import {createPlan} from '../src/plans.js';
import {defaultSettings} from '../src/planning-settings.js';
import {addDays, dateKey} from '../src/dates.js';

const NOW = '2026-11-05T14:00:00Z';
const range = {startDate: '2026-11-05', endDate: '2026-12-02'};
function fixture(count) {
  const settings = defaultSettings();
  settings.schedule.weekdays.forEach(day => Object.assign(day, {start: '09:00', end: '21:00', maxMinutes: 480}));
  const items = Array.from({length: count}, (_, index) => {
    const day = addDays(range.startDate, 6 + index % 22);
    return {key: `assignment:${index}`, type: 'assignment', title: `Synthetic task ${index}`, contexts: ['Demo'], contextCodes: ['course_1'],
      startDay: range.startDate, endDay: day, unlockAt: NOW, dueAt: `${day}T20:00:00-06:00`, manualStartDay: null,
      fixedStartAt: null, fixedEndAt: null, completed: false, warnings: []};
  });
  const state = {settings, estimates: Object.fromEntries(items.map(item => [item.key, 30]))};
  const plan = createPlan({id: 'benchmark', name: 'Synthetic benchmark', items, state, ...range, timeZone: 'America/Chicago', now: NOW});
  return {plan, items, completed: {}, now: NOW, loadedRange: range};
}

// Separate, directly readable postconditions as well as the production validator.
function check(input, result) {
  assert.equal(result.status, 'complete');
  assert.equal(validatePlan({...input.plan, segments: result.segments}, input).complete, true);
  const totals = new Map(), daily = new Map();
  const ordered = [...result.segments].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  for (let index = 0; index < ordered.length; index++) {
    const segment = ordered[index], start = Date.parse(segment.startAt), end = Date.parse(segment.endAt);
    const task = input.plan.tasks[segment.itemKey], minutes = (end - start) / 60000;
    assert.equal(minutes, 30);
    assert.ok(start >= Date.parse(task.unlockAt));
    assert.ok(end <= Date.parse(task.dueAt));
    if (index) assert.ok(start - Date.parse(ordered[index - 1].endAt) >= 15 * 60000);
    totals.set(task.key, (totals.get(task.key) || 0) + minutes);
    const day = dateKey(start, input.plan.timeZone);
    daily.set(day, (daily.get(day) || 0) + minutes);
  }
  assert.equal(totals.size, input.items.length);
  for (const minutes of totals.values()) assert.equal(minutes, 30);
  for (const minutes of daily.values()) assert.ok(minutes <= 480);
}

const results = [];
for (const count of [20, 60, 200]) {
  const input = fixture(count), times = [];
  check(input, await generateSchedule(input)); // warm conversion caches
  let last;
  for (let run = 0; run < 3; run++) {
    const before = performance.now();
    last = await generateSchedule(input, {budgetMs: 5000});
    times.push(Number((performance.now() - before).toFixed(2)));
    check(input, last);
  }
  results.push({tasks: count, days: 28, totalWorkMinutes: count * 30, status: last.status, blocks: last.segments.length,
    timesMs: times, medianMs: [...times].sort((a, b) => a - b)[1], visitedStates: last.diagnostics.visitedStates});
}
const report = {measuredAt: new Date().toISOString(), node: process.version, platform: `${process.platform}/${process.arch}`,
  method: 'Fixed synthetic 28-day fixtures; one warmup and three measured runs; 5s budget per run; correctness checked every run. Observations on this machine, not an optimality or production-scale guarantee.', results};
console.log(JSON.stringify(report, null, 2));
const output = process.argv.find(arg => arg.startsWith('--output='))?.slice('--output='.length);
if (output) await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
