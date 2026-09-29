export function dateKey(value, timeZone) {
  if (!value || Number.isNaN(new Date(value).getTime())) return null;
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit'
    });
  } catch {
    formatter = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }
  const parts = Object.fromEntries(formatter.formatToParts(new Date(value)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function validDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function utcDay(value) {
  return new Date(`${value}T00:00:00Z`);
}

function dayString(date) {
  return date.toISOString().slice(0, 10);
}

export function monthWeeks(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Invalid month');
  const first = utcDay(`${month}-01`);
  first.setUTCDate(first.getUTCDate() - first.getUTCDay());
  const [year, number] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, number, 0));
  last.setUTCDate(last.getUTCDate() + 6 - last.getUTCDay());
  const weeks = [];
  while (first <= last) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(dayString(first));
      first.setUTCDate(first.getUTCDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export function weekSegments(items, weeks) {
  const count = new Map();
  for (const day of weeks.flat()) count.set(day.slice(0, 7), (count.get(day.slice(0, 7)) ?? 0) + 1);
  const month = [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!month) return [];
  const firstDay = `${month}-01`;
  const [year, number] = month.split('-').map(Number);
  const lastDay = dayString(new Date(Date.UTC(year, number, 0)));
  const ordered = [...items].sort((a, b) => a.startDay.localeCompare(b.startDay) || a.title.localeCompare(b.title));
  return weeks.map((week, weekIndex) => {
    const visibleStart = week[0] > firstDay ? week[0] : firstDay;
    const visibleEnd = week[6] < lastDay ? week[6] : lastDay;
    return ordered.flatMap(item => {
      if (item.endDay < visibleStart || item.startDay > visibleEnd) return [];
      const start = item.startDay > visibleStart ? item.startDay : visibleStart;
      const end = item.endDay < visibleEnd ? item.endDay : visibleEnd;
      return [{ itemKey: item.key, weekIndex, startColumn: week.indexOf(start), endColumn: week.indexOf(end) }];
    });
  });
}
