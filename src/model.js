import { dateKey, validDay } from './dates.js';

function contextCodes(record) {
  const codes = String(record.all_context_codes || record.context_code || '').split(',').filter(Boolean);
  if (record.context_code && !codes.includes(record.context_code)) codes.push(record.context_code);
  return codes;
}

function itemContexts(record, names) {
  return contextCodes(record).map(code => names.get(code) || record.context_name || code);
}

function makeEvent(record, names, state, timeZone) {
  const validStartDay = dateKey(record.start_at, timeZone);
  const validEndDay = dateKey(record.end_at, timeZone);
  if (!validStartDay && !validEndDay) return null;
  const startDay = validStartDay || validEndDay;
  const rawEndDay = validEndDay || validStartDay;
  const startAt = validStartDay ? record.start_at : record.end_at;
  const endAt = validEndDay ? record.end_at : record.start_at;
  const key = `event:${record.id}`;
  const warnings = [];
  if (record.start_at && !validStartDay) warnings.push('Canvas event has an invalid start date; showing its end date.');
  if (record.end_at && !validEndDay) warnings.push('Canvas event has an invalid end date; showing its start date.');
  if (rawEndDay && rawEndDay < startDay) warnings.push('Canvas event ends before it starts.');
  return {
    key, type: 'event', title: record.title || 'Untitled event',
    contexts: itemContexts(record, names), contextCodes: contextCodes(record), startDay,
    endDay: rawEndDay && rawEndDay >= startDay ? rawEndDay : startDay,
    startAt, endAt, fixedStartAt: startAt, fixedEndAt: endAt, unlockAt: null, dueAt: null, manualStartDay: null, url: record.html_url || null,
    completed: Boolean(state.completed?.[key]), needsStart: false, warnings
  };
}

function makeAssignment(record, names, state, timeZone, userId) {
  const assignment = record.assignment;
  const dueAt = assignment ? assignment.due_at : record.end_at;
  const dueDay = dateKey(dueAt, timeZone);
  if (!dueDay) return null;
  const id = String(record.id).replace(/^assignment_/, '');
  const key = `assignment:${id}`;
  const unlockAt = assignment?.unlock_at || null;
  const unlockDay = dateKey(unlockAt, timeZone);
  const manual = state.starts?.[key];
  const warnings = [];
  const submission = assignment?.submission;
  const canvasCompleted = typeof assignment?.user_submitted === 'boolean' ? assignment.user_submitted : Boolean(
    submission && String(submission.user_id) === String(userId) && !submission.redo_request && !submission.missing &&
    ['submitted', 'graded'].includes(submission.workflow_state)
  );
  let startDay = unlockDay && unlockDay <= dueDay ? unlockDay : dueDay;
  if (manual != null) {
    if (validDay(manual) && manual <= dueDay) startDay = manual;
    else warnings.push('The saved plan start is invalid or after the due date.');
  }
  return {
    key, type: 'assignment', title: record.title || assignment?.name || 'Untitled assignment',
    contexts: itemContexts(record, names), contextCodes: contextCodes(record), startDay, endDay: dueDay,
    unlockAt, dueAt, manualStartDay: validDay(manual) ? manual : null, fixedStartAt: null, fixedEndAt: null,
    startAt: manual && startDay === manual ? null : unlockAt,
    endAt: dueAt, url: record.html_url || assignment?.html_url || null,
    completed: canvasCompleted || Boolean(state.completed?.[key]), canvasCompleted,
    needsStart: !unlockDay && !(manual && startDay === manual), warnings
  };
}

export function normalizeItems(snapshot, userState = { starts: {}, completed: {} }) {
  const names = new Map(snapshot.contexts.map(context => [context.code, context.name]));
  const merged = new Map();
  const add = item => {
    if (!item) return;
    const existing = merged.get(item.key);
    if (!existing) {
      merged.set(item.key, item);
      return;
    }
    for (const context of item.contexts) {
      if (!existing.contexts.includes(context)) existing.contexts.push(context);
    }
    for (const code of item.contextCodes) if (!existing.contextCodes.includes(code)) existing.contextCodes.push(code);
    existing.completed ||= item.completed;
    existing.canvasCompleted ||= item.canvasCompleted;
  };
  for (const record of snapshot.events) add(makeEvent(record, names, userState, snapshot.profile.time_zone));
  for (const record of snapshot.assignments) add(makeAssignment(record, names, userState, snapshot.profile.time_zone, snapshot.profile.id));
  return [...merged.values()];
}
