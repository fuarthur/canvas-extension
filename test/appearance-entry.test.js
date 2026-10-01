import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {memoryStorage} from './helpers/planning.js';
import {createPlannerStore} from '../src/storage.js';
import {defaultTheme} from '../src/themes.js';
test('appearance entry runs before Canvas content without expanding permissions',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../manifest.json',import.meta.url),'utf8'));
 const entry=manifest.content_scripts.find(s=>s.js.includes('appearance.js'));assert.ok(entry);
 assert.equal(entry.run_at,'document_start');assert.deepEqual(entry.matches,['https://canvas.illinois.edu/*']);assert.equal(entry.all_frames,false);assert.notEqual(entry.world,'MAIN');
 assert.deepEqual(manifest.permissions,['storage']);assert.deepEqual(manifest.host_permissions,['https://canvas.illinois.edu/*']);
 for(const entry of manifest.content_scripts.filter(s=>!s.js.includes('appearance.js')))assert.deepEqual(entry.matches,['https://canvas.illinois.edu/calendar*']);
});
test('bundled early entry skips auth pages and applies verified appearance on a normal page',async()=>{
 const result=await build({entryPoints:['src/appearance-entry.js'],bundle:true,write:false,format:'iife',platform:'browser',target:'chrome114'});
 const code=result.outputFiles[0].text;
 for(const path of ['/login/canvas','/courses/1/files/2/preview','/courses/1/modules']){
  const dom=new JSDOM('<main>Canvas</main>',{url:`https://canvas.illinois.edu${path}`,runScripts:'outside-only'});
  const area=memoryStorage(),store=createPlannerStore(area,'canvas.illinois.edu',77);await store.setTheme({...defaultTheme(),preset:'dark'});await store.setThemeScope('canvas');
  const listeners=new Set(),requests=[];dom.window.chrome={storage:{local:area,onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}}};
  dom.window.fetch=async(url,options)=>{requests.push({url,options});return{ok:true,headers:{get:()=> 'application/json'},json:async()=>({id:77})};};
  dom.window.eval(code);for(let i=0;i<12;i++)await Promise.resolve();
  if(path.includes('modules')){assert.equal(dom.window.document.documentElement.getAttribute('data-canvas-planning-theme'),'dark');assert.ok(requests.length);assert.equal(requests[0].url,'/api/v1/users/self/profile');assert.equal(requests[0].options.credentials,'include');}
  else{assert.equal(requests.length,0);assert.equal(listeners.size,0);assert.equal(dom.window.document.querySelector('style'),null);}
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide',{persisted:false}));assert.equal(listeners.size,0);dom.window.close();
 }
});
