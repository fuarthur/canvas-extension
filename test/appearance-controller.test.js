import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountAppearance} from '../src/appearance-controller.js';
import {writeAppearanceCache,readAppearanceCache,appearanceCacheKey} from '../src/appearance.js';
import {defaultTheme} from '../src/themes.js';
import {createPlannerStore} from '../src/storage.js';
import {memoryStorage} from './helpers/planning.js';
const host='canvas.illinois.edu',dark={...defaultTheme(),preset:'dark'};
const pending='data-canvas-planning-appearance-pending';
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return{promise,resolve,reject};};
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function setup({cache={theme:dark,scope:'canvas'},storageArea,loadProfile=()=>new Promise(()=>{})}={}){
 const dom=new JSDOM('<main>Native Canvas</main>',{url:`https://${host}/calendar`}),doc=dom.window.document;
 if(cache)writeAppearanceCache(dom.window.localStorage,cache);
 const area=storageArea||memoryStorage(),listeners=new Set(),mediaListeners=new Set();
 const originalSet=area.set;area.set=async values=>{await originalSet(values);for(const listener of listeners)listener(Object.fromEntries(Object.entries(values).map(([key,newValue])=>[key,{newValue}])),'local');};
 const media={matches:false,addEventListener:(_t,fn)=>mediaListeners.add(fn),removeEventListener:(_t,fn)=>mediaListeners.delete(fn)};dom.window.matchMedia=()=>media;
 let now=0,id=0;const timers=new Map();dom.window.setTimeout=(fn,delay)=>{timers.set(++id,{fn,time:now+delay});return id;};dom.window.clearTimeout=id=>timers.delete(id);
 const controller=mountAppearance({document:doc,storageArea:area,cacheStorage:dom.window.localStorage,loadProfile,subscribeStorage:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}});
 return {dom,doc,area,controller,listeners,mediaListeners,media,timers,async tick(ms){now+=ms;for(const [id,timer]of timers)if(timer.time<=now){timers.delete(id);timer.fn();}await settle();},destroy(){controller.destroy();dom.window.close();}};
}
test('cached dark canvas appearance mounts synchronously before storage or profile resolves',()=>{
 const wait=deferred(),s=setup({storageArea:{get:()=>wait.promise,set:async()=>{}}});try{
 assert.equal(s.doc.documentElement.getAttribute('data-canvas-planning-theme'),'dark');assert.equal(s.doc.documentElement.hasAttribute(pending),false);
 assert.equal(s.dom.window.getComputedStyle(s.doc.body).backgroundColor,'rgb(17, 24, 39)');
 }finally{s.destroy();}
});
test('cold startup applies local theme before releasing content',async()=>{
 const wait=deferred(),s=setup({cache:null,storageArea:{get:()=>wait.promise,set:async()=>{}}});try{
 assert.equal(s.doc.documentElement.hasAttribute(pending),true);
 wait.resolve({[`canvas-planner:${host}:appearance-account:v1`]:'77',[`canvas-planner:${host}:77:theme:v1`]:dark,[`canvas-planner:${host}:77:theme-scope:v1`]:'canvas'});await settle();
 assert.equal(s.doc.documentElement.hasAttribute(pending),false);assert.equal(s.doc.documentElement.getAttribute('data-canvas-planning-theme'),'dark');
 assert.equal(readAppearanceCache(s.dom.window.localStorage).scope,'canvas');
 }finally{s.destroy();}
});
test('storage timeout releases content at 250ms and destroyed late reads never reapply',async()=>{
 const wait=deferred(),s=setup({cache:null,storageArea:{get:()=>wait.promise,set:async()=>{}}});try{
 await s.tick(249);assert.equal(s.doc.documentElement.hasAttribute(pending),true);
 await s.tick(1);assert.equal(s.doc.documentElement.hasAttribute(pending),false);
 s.controller.destroy();wait.resolve({});await settle();assert.equal(s.doc.querySelector('#canvas-planning-global-theme-style'),null);assert.equal(s.listeners.size,0);
 }finally{s.destroy();}
});
test('root arriving after the timeout cannot become hidden',async()=>{
 const dom=new JSDOM('',{url:`https://${host}/calendar`}),doc=dom.window.document;doc.documentElement.remove();
 let expire;dom.window.setTimeout=fn=>{expire=fn;return 1;};dom.window.clearTimeout=()=>{};
 const controller=mountAppearance({document:doc,storageArea:{get:()=>new Promise(()=>{})},cacheStorage:dom.window.localStorage,loadProfile:()=>new Promise(()=>{})});
 expire();const root=doc.createElement('html');root.append(doc.createElement('body'));doc.append(root);await settle();
 assert.equal(root.hasAttribute(pending),false);controller.destroy();dom.window.close();
});
async function savedArea(theme=dark){const area=memoryStorage(),store=createPlannerStore(area,host,77);await store.setTheme(theme);await store.setThemeScope('canvas');return {area,store};}
test('verified account settings synchronize while other account writes cannot change the page',async()=>{
 const {area,store}=await savedArea(),s=setup({storageArea:area,loadProfile:async()=>({id:77})});try{
 await settle();assert.equal(s.doc.documentElement.getAttribute('data-canvas-planning-theme'),'dark');assert.equal(s.listeners.size,1);
 await createPlannerStore(area,host,88).setTheme({...dark,preset:'forest'});await settle();assert.equal(s.doc.documentElement.getAttribute('data-canvas-planning-theme'),'dark');
 await store.setTheme({...dark,preset:'warm'});await settle();assert.equal(s.doc.documentElement.getAttribute('data-canvas-planning-theme'),'warm');
 await store.setThemeScope('planner');await settle();assert.equal(s.doc.documentElement.hasAttribute('data-canvas-planning-theme'),false);assert.equal(readAppearanceCache(s.dom.window.localStorage).scope,'planner');
 }finally{s.destroy();}
});
test('cross-page cache mutations only trigger authoritative Chrome reads',async()=>{
 const {area}=await savedArea(),s=setup({storageArea:area,loadProfile:async()=>({id:77})});try{
 await settle();writeAppearanceCache(s.dom.window.localStorage,{theme:{...dark,preset:'forest'},scope:'canvas'});
 s.dom.window.dispatchEvent(new s.dom.window.StorageEvent('storage',{key:appearanceCacheKey}));await settle();
 assert.equal(s.doc.documentElement.getAttribute('data-canvas-planning-theme'),'dark');assert.equal(readAppearanceCache(s.dom.window.localStorage).theme.preset,'forest','valid cache hints are not republished; Chrome still controls this page');
 s.dom.window.localStorage.removeItem(appearanceCacheKey);s.dom.window.dispatchEvent(new s.dom.window.StorageEvent('storage',{key:appearanceCacheKey}));await settle();
 assert.equal(readAppearanceCache(s.dom.window.localStorage).theme.preset,'dark');
 }finally{s.destroy();}
});
test('late initial reads cannot undo a newer theme save',async()=>{
 const {area:base}=await savedArea(),wait=deferred();let first=true;
 const area={...base,get:async keys=>{if(Array.isArray(keys)&&first){first=false;return wait.promise;}return base.get(keys);}};
 const s=setup({storageArea:area});try{
 await settle();await createPlannerStore(area,host,77).setTheme({...dark,preset:'warm'});await settle();assert.equal(s.doc.documentElement.getAttribute('data-canvas-planning-theme'),'warm');
 wait.resolve({[`canvas-planner:${host}:77:theme:v1`]:dark,[`canvas-planner:${host}:77:theme-scope:v1`]:'canvas'});await settle();assert.equal(s.doc.documentElement.getAttribute('data-canvas-planning-theme'),'warm');
 }finally{s.destroy();}
});
test('system scheme follows changes and cleanup leaves no listeners or timers',async()=>{
 const {area}=await savedArea({...dark,preset:'system'}),s=setup({cache:{theme:{...dark,preset:'system'},scope:'canvas'},storageArea:area,loadProfile:async()=>({id:77})});try{
 await settle();s.media.matches=true;for(const fn of s.mediaListeners)fn({matches:true});
 assert.equal(s.dom.window.getComputedStyle(s.doc.body).backgroundColor,'rgb(17, 24, 39)');
 s.controller.destroy();assert.equal(s.listeners.size,0);assert.equal(s.mediaListeners.size,0);assert.equal(s.timers.size,0);assert.equal(s.doc.querySelector('#canvas-planning-global-theme-style'),null);
 }finally{s.destroy();}
});
test('BFCache restore and focus reconcile a changed account; failed identity preserves appearance',async()=>{
 const {area}=await savedArea();let userId=77,fail=false;
 const s=setup({storageArea:area,loadProfile:async()=>{if(fail)throw Error('offline');return {id:userId};}});try{
 await settle();fail=true;s.dom.window.dispatchEvent(new s.dom.window.Event('focus'));await settle();assert.equal(s.doc.documentElement.getAttribute('data-canvas-planning-theme'),'dark');
 const event=new s.dom.window.PageTransitionEvent('pagehide',{persisted:true});s.dom.window.dispatchEvent(event);assert.equal(s.listeners.size,1);
 fail=false;userId=88;s.dom.window.dispatchEvent(new s.dom.window.PageTransitionEvent('pageshow',{persisted:true}));await settle();assert.equal(s.doc.documentElement.hasAttribute('data-canvas-planning-theme'),false);
 await createPlannerStore(area,host,88).setTheme({...dark,preset:'forest'});await createPlannerStore(area,host,88).setThemeScope('canvas');await settle();assert.equal(s.doc.documentElement.getAttribute('data-canvas-planning-theme'),'forest');
 s.dom.window.dispatchEvent(new s.dom.window.PageTransitionEvent('pagehide',{persisted:false}));assert.equal(s.listeners.size,0);
 }finally{s.destroy();}
});
test('blocked cache and rejected storage fail open without leaving content hidden',async()=>{
 const dom=new JSDOM('<main>Canvas</main>',{url:`https://${host}/calendar`}),doc=dom.window.document;
 const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
 const controller=mountAppearance({document:doc,storageArea:{get:async()=>{throw Error('storage failed');}},cacheStorage:blocked,loadProfile:async()=>({id:'invalid'})});
 await settle();assert.equal(doc.documentElement.hasAttribute(pending),false);assert.equal(doc.querySelector('#canvas-planning-appearance-gate'),null);controller.destroy();dom.window.close();
});
test('different verified accounts cannot perpetuate a shared bootstrap cache feedback loop',async()=>{
 const {area}=await savedArea();await createPlannerStore(area,host,88).setTheme({...dark,preset:'forest'});await createPlannerStore(area,host,88).setThemeScope('canvas');
 const pages=[new JSDOM('<main>Canvas</main>',{url:`https://${host}/calendar`}),new JSDOM('<main>Canvas</main>',{url:`https://${host}/calendar`})];
 let value=null,writes=0;const events=[],controllers=[];
 try{
  for(const [index,dom]of pages.entries())controllers.push(mountAppearance({document:dom.window.document,storageArea:area,loadProfile:async()=>({id:index?88:77}),cacheStorage:{getItem:()=>value,setItem:(_key,next)=>{value=next;writes++;events.push(1-index);}}}));
  await settle();
  for(let count=0;events.length&&count<20;count++){const recipient=events.shift(),dom=pages[recipient];dom.window.dispatchEvent(new dom.window.StorageEvent('storage',{key:appearanceCacheKey}));await settle();}
  assert.equal(events.length,0,'cache events must settle instead of republishing competing accounts');assert.ok(writes<=4,`unexpected cache writes: ${writes}`);
  assert.equal(pages[0].window.document.documentElement.getAttribute('data-canvas-planning-theme'),'dark');assert.equal(pages[1].window.document.documentElement.getAttribute('data-canvas-planning-theme'),'forest');
 }finally{controllers.forEach(controller=>controller.destroy());pages.forEach(dom=>dom.window.close());}
});
