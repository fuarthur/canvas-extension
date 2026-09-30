import {workloadSummary} from './workload.js';import {renderLineChart} from './chart-view.js';import {resolveEstimate} from './estimates.js';import {ui,formatMinutes} from './ui.js';
export function renderDayList({document,day,items,state,onOpenItem,onComplete}){
 const {el,button}=ui(document);const panel=el('section','day-list');panel.setAttribute('aria-label',`Tasks for ${day}`);panel.append(el('h2','',day));
 if(!items.length)panel.append(el('p','hint','No remaining tasks on this date.'));
 for(const item of items){const row=el('div','task-row');row.append(button(`Open ${item.title}`,()=>onOpenItem?.(item.key),'task-title',item.title),el('span','hint',`${item.contexts?.join(' · ')} · ${formatMinutes(resolveEstimate(item,state).minutes)}`));if(onComplete&&!item.canvasCompleted)row.append(button(`Complete ${item.title}`,()=>onComplete(item.key,true),'text-button','Mark complete'));panel.append(row);}return panel;
}
export function renderWorkloadView({document,items,state,range,now,timeZone,onOpenItem,onComplete}){
 const {el,button}=ui(document);const panel=el('section','workload-view');const summary=workloadSummary(items,state,{now,timeZone,range});let metric='tasks';let selectedDay=null;
 panel.append(el('h2','','Deadline workload'),el('p','hint','Assignments count on their deadline; calendar events count on their start date. Completed items are excluded.'));
 const cards=el('div','summary-cards');for(const [title,value]of [['Remaining',`${summary.totalTasks} tasks`],['Estimated work',formatMinutes(summary.totalMinutes)],['Overdue',`${summary.overdue.length} tasks`]]){const card=el('div','summary-card');card.append(el('span','hint',title),el('strong','',value));cards.append(card);}panel.append(cards);
 const tools=el('div','view-tools');const chart=el('div');const dayPanel=el('div');
 const draw=()=>{chart.replaceChildren(renderLineChart({document,series:[{id:'deadline',name:'Deadline workload',color:'#6154b4',points:summary.series}],metric,onSelectDay:day=>{selectedDay=day;drawDay();}}));};
 const drawDay=()=>{const point=summary.series.find(p=>p.day===selectedDay);dayPanel.replaceChildren(renderDayList({document,day:selectedDay,items:items.filter(i=>point?.itemKeys.includes(i.key)),state,onOpenItem,onComplete}));};
 tools.append(button('Show task count',()=>{metric='tasks';draw();},'control','Tasks'),button('Show estimated hours',()=>{metric='minutes';draw();},'control','Estimated hours'));panel.append(tools,chart,dayPanel);draw();return panel;
}
