import {defaultSettings} from '../src/planning-settings.js';
import {createPlannerStore} from '../src/storage.js';
import {normalizeItems} from '../src/model.js';
import {createPlan} from '../src/plans.js';
import {createPlanService} from '../src/plan-service.js';

export const DEMO_NOW = '2026-11-05T14:00:00.000Z'; // Nov 5, 08:00 America/Chicago
export const DEMO_USER = 900001;
export function createDemoData(scenario = 'standard') {
  const contexts = [{code: 'course_101', name: 'DEMO 101 · Software studio'}, {code: 'course_202', name: 'DEMO 202 · Design methods'}];
  const definitions = scenario === 'capacity' ? [
    [101, 'Reading reflection', '2026-11-06T17:00:00-06:00', 30],
    [102, 'Systems lab', '2026-11-06T17:00:00-06:00', 120],
    [103, 'Design critique', '2026-11-06T17:00:00-06:00', 90]
  ] : [
    [101, 'Reading reflection', '2026-11-06T17:00:00-06:00', 45],
    [102, 'Systems lab', '2026-11-07T18:00:00-06:00', 120],
    [103, 'Design critique', '2026-11-08T23:59:00-06:00', 90],
    [104, 'Problem set', '2026-11-09T17:00:00-06:00', 60],
    [105, 'Prototype milestone', '2026-11-11T17:00:00-06:00', 180],
    [106, 'Practice quiz', '2026-11-12T17:00:00-06:00', 30],
    [107, 'Completed sample', '2026-11-05T17:00:00-06:00', 45]
  ];
  const assignments = definitions.map(([id, title, due, minutes], index) => ({
    id: `assignment_${id}`, title, context_code: contexts[index % contexts.length].code,
    demoMinutes: minutes,
    assignment: {due_at: due, unlock_at: '2026-11-05T08:00:00-06:00', user_submitted: id === 107}
  }));
  // Same assignment from two calendar sources: normalization must count it once.
  assignments.push(structuredClone(assignments[0]));
  return {
    profile: {id: DEMO_USER, name: 'Fictional student', time_zone: 'America/Chicago'}, contexts,
    assignments,
    events: scenario === 'capacity' ? [] : [
      {id: 'studio', title: 'Studio meeting (simulated)', context_code: 'course_101', start_at: '2026-11-05T10:00:00-06:00', end_at: '2026-11-05T11:00:00-06:00'},
      {id: 'review', title: 'Design review (simulated)', context_code: 'course_202', start_at: '2026-11-06T13:00:00-06:00', end_at: '2026-11-06T14:00:00-06:00'}
    ],
    selectedCalendars: contexts.map(context => context.code),
    range: {startDate: '2026-11-01', endDate: '2027-01-31'}, warnings: []
  };
}

export async function seedDemo(area, scenario = 'standard') {
  if ((await area.get(null))['demo:seeded']) return;
  const snapshot = createDemoData(scenario);
  const store = createPlannerStore(area, 'canvas.illinois.edu', DEMO_USER);
  const settings = defaultSettings();
  settings.schedule.horizonDays = scenario === 'capacity' ? 2 : 14;
  settings.schedule.weekdays.forEach(day => Object.assign(day, {start: '09:00', end: '17:00', maxMinutes: scenario === 'capacity' ? 45 : 180}));
  await store.setSettings(settings);
  for (const record of snapshot.assignments) await store.setEstimate(`assignment:${record.id.replace('assignment_', '')}`, record.demoMinutes);
  if (scenario === 'standard') await store.setAllowSplitting('assignment:105', true);
  const state = await store.loadPlanningState();
  const plan = createPlan({id: 'demo-plan', name: scenario === 'capacity' ? 'Limited time · sample plan' : 'My study week · sample plan', items: normalizeItems(snapshot), state,
    startDate: '2026-11-05', endDate: scenario === 'capacity' ? '2026-11-06' : '2026-11-18', timeZone: snapshot.profile.time_zone, now: DEMO_NOW});
  const service = createPlanService({storageArea: area, now: () => new Date(DEMO_NOW)});
  const result = await service.handle({type: 'PLAN_SAVE', userId: DEMO_USER, plan, expectedRevision: 0}, {url: 'https://canvas.illinois.edu/calendar'});
  if (!result.ok) throw new Error(result.message);
  await area.set({'demo:seeded': true});
}
