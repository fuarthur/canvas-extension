import {monthWeeks} from './dates.js';

export const defaultCalendarLoading = () => ({
  mode: 'months', pastMonths: 4, futureMonths: 4,
  summer: {enabled: false, startMonth: 6, endMonth: 7},
  winter: {enabled: false, startMonth: 12, endMonth: 1}
});
const validTerm = value => value && typeof value.enabled === 'boolean' &&
  ['startMonth','endMonth'].every(key => Number.isInteger(value[key]) && value[key] >= 1 && value[key] <= 12);
export function validCalendarLoading(value) {
  return Boolean(value && ['months','semester'].includes(value.mode) &&
    ['pastMonths','futureMonths'].every(key => Number.isInteger(value[key]) && value[key] >= 0 && value[key] <= 12) &&
    value.pastMonths + value.futureMonths <= 23 &&
    (value.summer == null || validTerm(value.summer)) && (value.winter == null || validTerm(value.winter)));
}
export function normalizeCalendarLoading(value) {
  const defaults = defaultCalendarLoading();
  return validCalendarLoading(value) ? {...defaults,...value,summer:{...defaults.summer,...value.summer},winter:{...defaults.winter,...value.winter}} : defaults;
}
const day = date => date.toISOString().slice(0,10);
function monthBounds(year,startMonth,endMonth,endYear=year) {
  return {startDate:day(new Date(Date.UTC(year,startMonth-1,1))),endDate:day(new Date(Date.UTC(endYear,endMonth,0)))};
}
export function calendarLoadingRange(month,config) {
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Invalid calendar month.');
  const [year,number]=month.split('-').map(Number),settings=normalizeCalendarLoading(config);
  if(settings.mode==='months')return monthBounds(year,number-settings.pastMonths,number+settings.futureMonths);
  // Explicit extra terms take precedence in their configured months. Winter
  // comes first if a user configures overlapping extra terms.
  for(const term of [settings.winter,settings.summer]) {
    if(!term.enabled)continue;
    if(term.startMonth<=term.endMonth) {
      if(number>=term.startMonth&&number<=term.endMonth)return monthBounds(year,term.startMonth-1,term.endMonth+1);
    } else if(number>=term.startMonth||number<=term.endMonth) {
      const startYear=number>=term.startMonth?year:year-1;
      return monthBounds(startYear,term.startMonth-1,term.endMonth+1,startYear+1);
    }
  }
  if(number<=5)return monthBounds(year,1,5);
  if(number>=8)return monthBounds(year,8,12);
  return monthBounds(year,number,number);
}
export function visibleCalendarRange(month,range) {
  const weeks=monthWeeks(month);
  return {startDate:weeks[0][0]>range.startDate?weeks[0][0]:range.startDate,endDate:weeks.at(-1)[6]<range.endDate?weeks.at(-1)[6]:range.endDate};
}
