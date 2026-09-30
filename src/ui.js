export function ui(document){
 const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=text;return node;};
 const button=(label,handler,className='control',text=label)=>{const node=el('button',className,text);node.type='button';node.setAttribute('aria-label',label);node.addEventListener('click',handler);return node;};
 const input=(label,value,type='text',handler)=>{const node=el('input');node.type=type;node.value=value??'';node.setAttribute('aria-label',label);node.dataset.controlId=label;if(handler)node.addEventListener('change',()=>handler(type==='number'?Number(node.value):node.value));return node;};
 const field=(label,node)=>{const wrap=el('label','field',label);wrap.append(node);return wrap;};
 const select=(label,options,value,handler)=>{const node=el('select');node.setAttribute('aria-label',label);node.dataset.controlId=label;for(const [key,text]of options){const option=el('option','',text);option.value=key;node.append(option);}node.value=value;if(handler)node.addEventListener('change',()=>handler(node.value));return node;};
 return {el,button,input,field,select};
}
export function newId(prefix='id'){return `${prefix}-${globalThis.crypto?.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;}
export const formatMinutes=n=>n>=60?`${Math.floor(n/60)}h${n%60?` ${Math.round(n%60)}m`:''}`:`${Math.round(n)} min`;
