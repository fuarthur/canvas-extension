const ORIGIN = 'https://canvas.illinois.edu';

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
  const response = await fetchImpl(safeUrl(url).href, {
    credentials: 'include',
    headers: { Accept: 'application/json' }
  });
  if (response.status === 401 || response.status === 403) {
    throw new CanvasApiError('AUTH', 'Please sign in to Canvas and try again.');
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

export async function fetchPages(fetchImpl, url) {
  const rows = [];
  const seen = new Set();
  let next = safeUrl(url).href;
  while (next) {
    if (seen.has(next)) throw new CanvasApiError('DATA', 'Canvas pagination repeated a page.');
    seen.add(next);
    const { body, link } = await getJson(fetchImpl, next);
    if (!Array.isArray(body)) throw new CanvasApiError('DATA', 'Canvas returned a list in an unexpected format.');
    rows.push(...body);
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

export async function loadCanvasSnapshot({ fetchImpl = fetch, month }) {
  const range = monthRange(month);
  const profile = (await getJson(fetchImpl, `${ORIGIN}/api/v1/users/self/profile`)).body;
  if (!profile || !Number.isFinite(Number(profile.id))) {
    throw new CanvasApiError('DATA', 'Canvas did not identify the signed-in user.');
  }
  const [courses, groups, accountCalendars] = await Promise.all([
    fetchPages(fetchImpl, `${ORIGIN}/api/v1/courses?enrollment_state=active&per_page=100`),
    fetchPages(fetchImpl, `${ORIGIN}/api/v1/users/self/groups?per_page=100`),
    fetchPages(fetchImpl, `${ORIGIN}/api/v1/account_calendars?per_page=100`)
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
  const requests = [];
  for (const type of ['event', 'assignment']) {
    for (const batch of chunks(uniqueContexts.map(context => context.code), 10)) {
      const url = new URL('/api/v1/calendar_events', ORIGIN);
      url.searchParams.set('type', type);
      url.searchParams.set('start_date', range.startDate);
      url.searchParams.set('end_date', range.endDate);
      url.searchParams.set('per_page', '100');
      for (const code of batch) url.searchParams.append('context_codes[]', code);
      requests.push({ type, rows: fetchPages(fetchImpl, url.href) });
    }
  }
  const events = [];
  const assignments = [];
  for (const request of requests) {
    const rows = await request.rows;
    (request.type === 'event' ? events : assignments).push(...rows);
  }
  const enrichedAssignments = await Promise.all(assignments.map(async record => {
    if (record.assignment && 'due_at' in record.assignment && 'unlock_at' in record.assignment) return record;
    const identity = assignmentIdentity(record);
    if (!identity) return record;
    const detail = (await getJson(fetchImpl, `${ORIGIN}/api/v1/courses/${identity.courseId}/assignments/${identity.id}`)).body;
    return { ...record, assignment: detail };
  }));
  return { profile, contexts: uniqueContexts, events, assignments: enrichedAssignments, range };
}
