import { dateKey, validDay, validInstant } from './dates.js';

function contextCodes(record) {
  const codes = String(record.all_context_codes || record.context_code || '').split(',').filter(Boolean);
  if (record.context_code && !codes.includes(record.context_code)) codes.push(record.context_code);
  return codes;
}

function itemContexts(record, names) {
  return contextCodes(record).map(code => names.get(code) || record.context_name || code);
}

function makeEvent(record, names, state, timeZone) {
  const validStartDay = validInstant(record.start_at) ? dateKey(record.start_at, timeZone) : null;
  const validEndDay = validInstant(record.end_at) ? dateKey(record.end_at, timeZone) : null;
  // Keep unresolved event facts so validation cannot mistake unknown occupancy
  // for free time. Empty display days never place a bar on an invented date.
  const startDay = validStartDay || validEndDay || '';
  const rawEndDay = validEndDay || validStartDay || '';
  const startAt = validStartDay ? record.start_at : validEndDay ? record.end_at : null;
  const endAt = validEndDay ? record.end_at : validStartDay ? record.start_at : null;
  const key = `event:${record.id}`;
  const warnings = [];
  if (!validStartDay && !validEndDay) warnings.push('Canvas event has no verified dates. Refresh Canvas data before planning.');
  else {
    if (!validStartDay) warnings.push('Canvas event has an invalid start date; showing its end date.');
    if (!validEndDay) warnings.push('Canvas event has an invalid end date; showing its start date.');
  }
  if (rawEndDay && rawEndDay < startDay) warnings.push('Canvas event ends before it starts.');
  return {
    key, type: 'event', title: record.title || 'Untitled event',
    contexts: itemContexts(record, names), contextCodes: contextCodes(record), startDay,
    endDay: rawEndDay && rawEndDay >= startDay ? rawEndDay : startDay,
    startAt, endAt, fixedStartAt: startAt, fixedEndAt: endAt, unlockAt: null, dueAt: null, manualStartDay: null, url: record.html_url || null,
    completed: Boolean(state.completed?.[key]), needsStart: false,
    invalidTime: !validInstant(record.start_at) || !validInstant(record.end_at), warnings
  };
}

function makeAssignment(record, names, state, timeZone, userId) {
  const assignment = record.assignment;
  const dueAt = assignment ? assignment.due_at : record.end_at;
  const dueDay = validInstant(dueAt) ? dateKey(dueAt, timeZone) : null;
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

export function snapshotImportWarnings(snapshot) {
  const warnings = new Set();
  for (const record of snapshot.assignments) {
    const dueAt = record.assignment ? record.assignment.due_at : record.end_at;
    if (!validInstant(dueAt)) warnings.add(`${record.title || record.assignment?.name || 'Untitled assignment'}: no valid deadline was imported from this source. This task cannot be scheduled; check its Canvas deadline.`);
  }
  for (const record of snapshot.events) {
    if (!validInstant(record.start_at) || !validInstant(record.end_at)) warnings.add(`${record.title || 'Untitled event'}: the full event time could not be verified. Check both Canvas dates before planning.`);
  }
  return [...warnings];
}

export function normalizeItems(snapshot, userState = { starts: {}, completed: {} }) {
  if (snapshot.profile.time_zone) {
    try { new Intl.DateTimeFormat('en', {timeZone: snapshot.profile.time_zone}); }
    catch { throw new Error('Invalid Canvas account time zone. Check your Canvas profile and reload.'); }
  }
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
    existing.invalidTime ||= item.invalidTime;
    const timingFields = ['dueAt', 'unlockAt', 'fixedStartAt', 'fixedEndAt'];
    const same = (a, b) => (a ?? null) === (b ?? null) || (validInstant(a) && validInstant(b) && Date.parse(a) === Date.parse(b));
    if (timingFields.some(field => !same(existing[field], item[field]))) {
      existing.dataConflict = true;
      const warning = 'Conflicting dates were imported for this task. Refresh Canvas data before planning.';
      if (!existing.warnings.includes(warning)) existing.warnings.push(warning);
    }
    // Prefer a dated copy for display while retaining the merged uncertainty.
    if (existing.type === 'event' && !existing.startDay && item.startDay) {
      for (const field of ['startDay', 'endDay', 'startAt', 'endAt', 'fixedStartAt', 'fixedEndAt']) existing[field] = item[field];
    }
  };
  for (const record of snapshot.events) add(makeEvent(record, names, userState, snapshot.profile.time_zone));
  const unverified = new Set();
  for (const record of snapshot.assignments) {
    const item = makeAssignment(record, names, userState, snapshot.profile.time_zone, snapshot.profile.id);
    if (!item) unverified.add(`assignment:${String(record.id).replace(/^assignment_/, '')}`);
    add(item);
  }
  for (const key of unverified) {
    const item = merged.get(key);
    if (item) {
      item.dataConflict = true;
      item.warnings.push('Another imported copy has an invalid deadline. Refresh Canvas data before planning.');
    }
  }
  return [...merged.values()];
}
