import {setText,setLabel} from './i18n.js';
export function ui(document){
 const el=(tag,className,text,literal=false)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!=null)setText(node,text,literal);return node;};
 const button=(label,handler,className='control',text=label)=>{const node=el('button',className,text,className==='task-title');node.type='button';setLabel(node,className==='task-title'?{key:'Open {title}',values:{title:text}}:label);node.dataset.controlId=label;node.addEventListener('click',handler);return node;};
 const input=(label,value,type='text',handler,{live=false}={})=>{const node=el('input');node.type=type;node.value=value??'';setLabel(node,label);node.dataset.controlId=label;if(handler){const update=()=>handler(type==='number'?Number(node.value):node.value);node.addEventListener('change',update);if(live)node.addEventListener('input',update);}return node;};
 const field=(label,node,literal=false)=>{const wrap=el('label','field',label,literal);wrap.append(node);return wrap;};
 const select=(label,options,value,handler)=>{const node=el('select');setLabel(node,label);node.dataset.controlId=label;for(const [key,text,literal]of options){const option=el('option','',text,literal);option.value=key;node.append(option);}node.value=value;if(handler)node.addEventListener('change',()=>handler(node.value));return node;};
 const disclosure=(label,className='settings-section',description)=>{
  const node=el('details',className),summary=el('summary');
  node.dataset.disclosure=label;summary.dataset.controlId=`Expand ${label}`;
  summary.append(el('span','disclosure-title',label));
  if(description!=null)summary.append(el('span','disclosure-value',description));
  node.append(summary);return node;
 };
 const help=(...messages)=>{const node=disclosure('How it works','help-disclosure');node.dataset.disclosure=`Help ${messages[0]}`;node.querySelector('summary').dataset.controlId=node.dataset.disclosure;for(const message of messages)node.append(el('p','hint',message));return node;};
 const icon=name=>{
  const paths={calendar:'M5 4h14v16H5z M8 2v4 M16 2v4 M5 9h14 M8 13h2 M14 13h2 M8 17h2',tasks:'M9 6h11 M9 12h11 M9 18h11 M3 6l1 1 2-2 M3 12l1 1 2-2 M3 18l1 1 2-2',planner:'M4 5h16v15H4z M4 10h16 M10 10v10 M8 3v4 M16 3v4',workload:'M4 4v16h17 M7 15l4-5 4 3 5-7',settings:'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',refresh:'M20 8a8 8 0 0 0-14-3L3 8 M3 3v5h5 M4 16a8 8 0 0 0 14 3l3-3 M21 21v-5h-5'};
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  for(const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false',class:'ui-icon'}))svg.setAttribute(key,value);
  const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[name]||paths.calendar);svg.append(path);return svg;
 };
 return {el,button,input,field,select,disclosure,help,icon};
}
export function newId(prefix='id'){return `${prefix}-${globalThis.crypto?.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;}
export const formatMinutes=n=>n>=60?`${Math.floor(n/60)}h${n%60?` ${Math.round(n%60)}m`:''}`:`${Math.round(n)} min`;
