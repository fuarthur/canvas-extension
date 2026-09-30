import {validDay,daysBetween} from './dates.js';
const ORIGIN = 'https://canvas.illinois.edu';
const CACHE_MS = 5 * 60 * 1000;

export function createCanvasLoader({ fetchImpl = fetch, readSelection, now = Date.now } = {}) {
  const cache = new Map();
  let active = 0;
  const waiting = [];
  const limitedFetch = async (...args) => {
    if (active >= 6) await new Promise(resolve => waiting.push(resolve));
    else active++;
    try { return await fetchImpl(...args); }
    finally {
      if (waiting.length) waiting.shift()();
      else active--;
    }
  };
  return (month, options = {}) => loadCanvasSnapshot({ fetchImpl: limitedFetch, readSelection, now, cache, month, ...options });
}

export class CanvasApiError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CanvasApiError';
    this.code = code;
  }
}

function safeUrl(value) {
  const url = new URL(value, ORIGIN);
  if (url.origin !== ORIGIN) throw new CanvasApiError('DATA', 'Canvas returned a link outside its site.');
  return url;
}

async function getJson(fetchImpl, url) {
  const requestUrl = safeUrl(url);
  const endpoint = `${requestUrl.pathname}${requestUrl.searchParams.has('type') ? ` (${requestUrl.searchParams.get('type')})` : ''}`;
  const response = await fetchImpl(requestUrl.href, {
    credentials: 'include',
    headers: { Accept: 'application/json' }
  });
  if (response.status === 401) {
    throw new CanvasApiError('AUTH', `Canvas rejected ${endpoint} (401). Please sign in and try again.`);
  }
  if (response.status === 403) {
    throw new CanvasApiError('FORBIDDEN', `Canvas denied access to ${endpoint} (403).`);
  }
  if (!response.ok) throw new CanvasApiError('HTTP', `Canvas request failed (${response.status}).`);
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new CanvasApiError('AUTH', 'Canvas returned a sign-in page instead of calendar data.');
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new CanvasApiError('DATA', 'Canvas returned invalid JSON.');
  }
  return { body, link: response.headers.get('link') };
}

function nextLink(link) {
  if (!link) return null;
  for (const part of link.split(',')) {
    if (/\brel\s*=\s*"?next"?/i.test(part)) {
      return part.match(/<([^>]+)>/)?.[1] ?? null;
    }
  }
  return null;
}

export async function fetchPages(fetchImpl, url, listKey = null) {
  const rows = [];
  const seen = new Set();
  let next = safeUrl(url).href;
  while (next) {
    if (seen.has(next)) throw new CanvasApiError('DATA', 'Canvas pagination repeated a page.');
    seen.add(next);
    const { body, link } = await getJson(fetchImpl, next);
    const page = Array.isArray(body) ? body : listKey && body?.[listKey];
    if (!Array.isArray(page)) throw new CanvasApiError('DATA', 'Canvas returned a list in an unexpected format.');
    rows.push(...page);
    next = nextLink(link) ? safeUrl(nextLink(link)).href : null;
  }
  return rows;
}

function monthRange(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new CanvasApiError('DATA', 'Invalid calendar month.');
  }
  const [year, oneBasedMonth] = month.split('-').map(Number);
  const m = oneBasedMonth - 1;
  const day = date => date.toISOString().slice(0, 10);
  return {
    startDate: day(new Date(Date.UTC(year, m - 6, 1))),
    endDate: day(new Date(Date.UTC(year, m + 7, 0)))
  };
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function assignmentIdentity(record) {
  const id = String(record.id).replace(/^assignment_/, '');
  const courseId = String(record.context_code ?? '').match(/^course_(\d+)$/)?.[1];
  return /^\d+$/.test(id) && courseId ? { id, courseId } : null;
}

// One inaccessible context makes Canvas reject the entire batch. Isolate it
// without hiding failures from the other endpoints or treating 401 as partial data.
async function fetchCalendarBatch(fetchImpl, type, codes, range) {
  const url = new URL('/api/v1/calendar_events', ORIGIN);
  url.searchParams.set('type', type);
  url.searchParams.set('start_date', range.startDate);
  url.searchParams.set('end_date', range.endDate);
  url.searchParams.set('per_page', '100');
  if (type === 'assignment') url.searchParams.append('include[]', 'submission');
  for (const code of codes) url.searchParams.append('context_codes[]', code);
  try {
    return { rows: await fetchPages(fetchImpl, url.href), denied: [], readable: true };
  } catch (error) {
    if (!(error instanceof CanvasApiError) || error.code !== 'FORBIDDEN') throw error;
    if (codes.length === 1) return { rows: [], denied: codes, readable: false };
    const middle = Math.ceil(codes.length / 2);
    const [left, right] = await Promise.all([
      fetchCalendarBatch(fetchImpl, type, codes.slice(0, middle), range),
      fetchCalendarBatch(fetchImpl, type, codes.slice(middle), range)
    ]);
    return { rows: [...left.rows, ...right.rows], denied: [...left.denied, ...right.denied], readable: left.readable || right.readable };
  }
}

export async function loadCanvasSnapshot({ fetchImpl = fetch, month, readSelection, cache = new Map(), now = Date.now, retryUnavailable = false, range: requestedRange }) {
  const range = requestedRange || monthRange(month);
  if(!validDay(range.startDate)||!validDay(range.endDate)||range.endDate<range.startDate||daysBetween(range.startDate,range.endDate).length>732)throw new CanvasApiError('DATA','Invalid planning date range.');
  const profile = (await getJson(fetchImpl, `${ORIGIN}/api/v1/users/self/profile`)).body;
  if (!profile || !Number.isFinite(Number(profile.id))) {
    throw new CanvasApiError('DATA', 'Canvas did not identify the signed-in user.');
  }
  const userId = String(profile.id);
  let cached = cache.get(userId);
  if (!cached || cached.expires <= now() || retryUnavailable) {
    cached = { expires: now() + CACHE_MS, denied: { event: new Set(), assignment: new Set() }, directory: Promise.all([
    fetchPages(fetchImpl, `${ORIGIN}/api/v1/courses?enrollment_state=active&per_page=100`),
    fetchPages(fetchImpl, `${ORIGIN}/api/v1/users/self/groups?per_page=100`),
    fetchPages(fetchImpl, `${ORIGIN}/api/v1/account_calendars?per_page=100`, 'account_calendars')
    ]) };
    cache.set(userId, cached);
    cached.directory.catch(() => { if (cache.get(userId) === cached) cache.delete(userId); });
  }
  const [[courses, groups, accountCalendars], savedSelection] = await Promise.all([
    cached.directory, readSelection?.(profile.id)
  ]);
  const contexts = [
    { code: `user_${profile.id}`, name: 'Personal' },
    ...courses.map(course => ({ code: `course_${course.id}`, name: course.name })),
    ...groups.map(group => ({ code: `group_${group.id}`, name: group.name })),
    ...accountCalendars.filter(calendar => calendar.visible).map(calendar => ({
      code: calendar.asset_string || `account_${calendar.id}`,
      name: calendar.name
    }))
  ];
  const uniqueContexts = [...new Map(contexts.map(context => [context.code, context])).values()];
  const selectedCalendars = uniqueContexts.map(context => context.code).filter(code => !Array.isArray(savedSelection) || savedSelection.includes(code));
  const requests = [];
  for (const type of ['event', 'assignment']) {
    const readableCodes = selectedCalendars.filter(code => !cached.denied[type].has(code));
    for (const batch of chunks(readableCodes, 10)) {
      requests.push(fetchCalendarBatch(fetchImpl, type, batch, range).then(result => ({ type, ...result })));
    }
  }
  const events = [];
  const assignments = [];
  let results;
  try {results=await Promise.all(requests);}catch(error){
    if(error.code!=='AUTH')error.snapshot={profile,contexts:uniqueContexts,selectedCalendars,unavailableCalendars:[],events:[],assignments:[],range:null,warnings:[]};
    throw error;
  }
  for (const result of results) for (const code of result.denied) cached.denied[result.type].add(code);
  const denied = new Set(selectedCalendars.filter(code => cached.denied.event.has(code) || cached.denied.assignment.has(code)));
  if (selectedCalendars.length && !results.some(result => result.readable)) {
    const error = new CanvasApiError('FORBIDDEN', 'Canvas denied access to all selected calendars. Choose other calendars in Settings or retry access.');
    error.snapshot = { profile, contexts: uniqueContexts, selectedCalendars, unavailableCalendars: [...denied], events: [], assignments: [], range, warnings: [] };
    throw error;
  }
  const warnings = denied.size ? [
    `Some calendar data could not be loaded because Canvas denied access: ${uniqueContexts.filter(context => denied.has(context.code)).map(context => context.name || context.code).join(', ')}.`
  ] : [];
  for (const result of results) {
    (result.type === 'event' ? events : assignments).push(...result.rows);
  }
  const enrichedAssignments = await Promise.all(assignments.map(async record => {
    if (record.assignment && 'due_at' in record.assignment && 'unlock_at' in record.assignment) return record;
    const identity = assignmentIdentity(record);
    if (!identity) return record;
    const detail = (await getJson(fetchImpl, `${ORIGIN}/api/v1/courses/${identity.courseId}/assignments/${identity.id}`)).body;
    return { ...record, assignment: { ...record.assignment, ...detail } };
  }));
  return { profile, contexts: uniqueContexts, selectedCalendars, unavailableCalendars: [...denied], events, assignments: enrichedAssignments, range, warnings };
}
