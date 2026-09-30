import {ui,formatMinutes} from './ui.js';
export function renderLineChart({document,series,metric='tasks',onSelectDay}){
 const {el,button}=ui(document);const wrap=el('section','line-chart');
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 900 240');svg.setAttribute('role','img');svg.setAttribute('aria-label',metric==='tasks'?'Daily task count':'Daily estimated hours');
 const ns=(tag,attributes,text)=>{const n=document.createElementNS(svg.namespaceURI,tag);for(const [key,value]of Object.entries(attributes))n.setAttribute(key,value);if(text!=null)n.textContent=text;svg.append(n);return n;};
 const days=[...new Set(series.flatMap(s=>s.points.map(p=>p.day)))].sort();const value=p=>metric==='tasks'?p.tasks:p.minutes==null?null:p.minutes/60;
 const maximum=Math.max(1,...series.flatMap(s=>s.points.map(value).filter(n=>n!=null)));const top=metric==='tasks'?Math.ceil(maximum):Math.ceil(maximum*2)/2;
 const x=day=>55+days.indexOf(day)*820/Math.max(1,days.length-1);const y=n=>195-n/top*165;
 for(let i=0;i<=4;i++){const v=top*i/4;ns('line',{x1:55,x2:875,y1:y(v),y2:y(v),stroke:'#e5eaf2'});ns('text',{x:44,y:y(v)+4,'text-anchor':'end',fill:'#6c7890','font-size':11},metric==='tasks'?String(Math.ceil(v)):v.toFixed(1));}
 const tickEvery=Math.max(1,Math.ceil(days.length/10));days.forEach((day,index)=>{if(index%tickEvery===0||index===days.length-1)ns('text',{x:x(day),y:217,'text-anchor':'middle',fill:'#6c7890','font-size':11},day.slice(5));});
 for(const s of series){let path='';let drawing=false;for(const p of s.points){const v=value(p);if(v==null){drawing=false;continue;}path+=`${drawing?'L':'M'}${x(p.day)} ${y(v)} `;drawing=true;}ns('path',{d:path,stroke:s.color||'#5b61ad','stroke-width':3,fill:'none','stroke-linecap':'round','stroke-linejoin':'round'});
  for(const p of s.points){const v=value(p);if(v==null)continue;const dot=ns('circle',{cx:x(p.day),cy:y(v),r:4,fill:s.color||'#5b61ad',tabindex:0,role:'button','aria-label':`${s.name}, ${p.day}: ${metric==='tasks'?`${p.tasks} tasks`:formatMinutes(p.minutes)}`,'data-chart-day':p.day});dot.addEventListener('click',()=>onSelectDay?.(p.day));dot.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelectDay?.(p.day);}});}
 }
 wrap.append(svg);const legend=el('div','chart-legend');for(const s of series){const label=el('span','',s.name);label.style.borderLeft=`4px solid ${s.color||'#5b61ad'}`;legend.append(label);}wrap.append(legend);
 const details=el('details','chart-data');details.append(el('summary','','View daily data'));const table=el('table');const heading=el('tr');heading.append(el('th','','Date'));for(const s of series)heading.append(el('th','',s.name));table.append(heading);
 for(const day of days){const row=el('tr');const cell=el('td');cell.append(button(`View ${day}`,()=>onSelectDay?.(day),'text-button',day));row.append(cell);for(const s of series){const p=s.points.find(p=>p.day===day);row.append(el('td','',p==null||value(p)==null?'No data':metric==='tasks'?`${p.tasks} tasks`:formatMinutes(p.minutes)));}table.append(row);}details.append(table);wrap.append(details);return wrap;
}
