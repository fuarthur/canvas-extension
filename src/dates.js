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

export function addDays(day,offset){
 if(!validDay(day)||!Number.isInteger(offset))throw new Error('Invalid day or offset');
 const value=new Date(`${day}T12:00:00Z`);value.setUTCDate(value.getUTCDate()+offset);return value.toISOString().slice(0,10);
}
export function daysBetween(startDate,endDate){
 if(!validDay(startDate)||!validDay(endDate)||endDate<startDate)throw new Error('Invalid date range');
 const result=[];for(let day=startDate;day<=endDate;day=addDays(day,1))result.push(day);return result;
}

const zonedFormatters=new Map();
export function zonedDateTime(day,time,timeZone,{disambiguation='earlier'}={}){
 if(!validDay(day)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time||''))return null;
 let formatter;try{formatter=zonedFormatters.get(timeZone);if(!formatter){formatter=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});zonedFormatters.set(timeZone,formatter);}}catch{return null;}
 const local=ms=>Object.fromEntries(formatter.formatToParts(new Date(ms)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 const target=Date.parse(`${day}T${time}:00Z`);const offsets=new Set();
 for(let h=-48;h<=48;h+=6){const ms=target+h*3600000;const p=local(ms);offsets.add(Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute),Number(p.second))-ms);}
 const candidates=[...offsets].map(offset=>target-offset).filter(ms=>{const p=local(ms);return `${p.year}-${p.month}-${p.day}`===day&&`${p.hour}:${p.minute}`===time;}).sort((a,b)=>a-b);
 return candidates.length?new Date(disambiguation==='later'?candidates.at(-1):candidates[0]).toISOString():null;
}
