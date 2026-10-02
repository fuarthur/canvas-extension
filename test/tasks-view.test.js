import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import * as view from '../src/tasks-view.js';import {createPlannerStore} from '../src/storage.js';import {task,memoryStorage} from './helpers/planning.js';import {setLanguage,localizeTree} from '../src/i18n.js';
const settle=()=>new Promise(r=>setTimeout(r,0));
async function setup({taskPreferences}={}){
 const dom=new JSDOM('<main/>'),document=dom.window.document,area=memoryStorage(),store=createPlannerStore(area,'canvas.illinois.edu',77);
 if(taskPreferences)await store.setTaskPreferences(taskPreferences);
 const items=[task({title:'Essay'}),task({key:'assignment:2',title:'Homework',endDay:'2026-09-29',dueAt:'2026-09-29T20:00:00-05:00'}),task({key:'assignment:3',title:'Canvas done',canvasCompleted:true,completed:true}),task({key:'assignment:4',title:'Spring',endDay:'2026-05-01',dueAt:'2026-05-01T20:00:00-05:00'})];
 let fail=false,controller;const ranges=[];
 const data=async()=>({items:items.map(i=>({...i,completed:i.canvasCompleted||Boolean((area.entries[`canvas-planner:canvas.illinois.edu:77:completed:${i.key}`]))})),state:{...await store.loadPlanningState(),completed:(await store.load()).completed},contexts:[{code:'course_456',name:'EPSY 456'}],loadedRange:{startDate:'2026-03-01',endDate:'2027-03-31'}});
 controller=view.createTasksController({document,...await data(),now:()=>new Date('2026-09-30T15:00:00Z'),timeZone:'America/Chicago',onOpenItem:()=>{},onPreferences:p=>store.setTaskPreferences(p),onApply:async(keys,patch)=>{if(fail)throw new Error('Storage is full');const token=await store.applyTaskBatch(keys,patch);controller.setData(await data());return token;},onUndo:async token=>{const result=await store.undoTaskBatch(token);controller.setData(await data());return result;},onLoadRange:async range=>{ranges.push(range);}});
 const root=controller.render();document.querySelector('main').append(root);
 const click=async label=>{const n=root.querySelector(`[data-control-id="${label}"]`);assert.ok(n,label);n.click();await settle();};
 const change=async(label,value)=>{const n=root.querySelector(`[data-control-id="${label}"]`);assert.ok(n,label);n.value=value;n.dispatchEvent(new dom.window.Event('change'));await settle();};
 return {dom,root,controller,store,click,change,ranges,fail:()=>fail=true};
}
test('presets hide history, count homework only, and changing filters clears multi-selection',async()=>{
 const s=await setup();assert.equal(s.root.querySelectorAll('[data-task-row]').length,2);
 await s.click('Select all filtered tasks');assert.equal(s.root.querySelector('[data-selection-count]').textContent.includes('2'),true);
 await s.click('Overdue H/W');assert.equal(s.root.querySelectorAll('[data-task-row]').length,1);assert.equal(s.root.querySelectorAll('[data-task-select]:checked').length,0);
 await s.click('Show historical tasks');assert.equal(s.root.querySelectorAll('[data-task-row]').length,2);
 await s.change('Tasks grouping','course');assert.equal(s.root.querySelectorAll('[data-task-group]').length,1);s.controller.destroy();s.dom.window.close();
});
test('multi-select completion is persisted, reversible and protects Canvas completion',async()=>{
 const s=await setup();await s.click('Select all filtered tasks');await s.click('Complete selected tasks');assert.deepEqual((await s.store.load()).completed,{'assignment:1':true,'assignment:2':true});
 await s.click('Undo task changes');assert.deepEqual((await s.store.load()).completed,{});
 await s.click('Completed tasks');assert.equal(s.root.querySelectorAll('[data-task-row]').length,1);await s.click('Select all filtered tasks');await s.click('Reopen selected tasks');assert.deepEqual((await s.store.load()).completed,{});assert.match(s.root.textContent,/Completed in Canvas/);s.controller.destroy();s.dom.window.close();
});
test('bulk effort and planned finish save separately and a failed write retains selection',async()=>{
 const s=await setup();await s.click('Select all filtered tasks');await s.click('Edit selected estimates');await s.change('Bulk estimate minutes','90');await s.click('Set selected estimates');assert.equal((await s.store.loadPlanningState()).estimates['assignment:1'],90);
 await s.click('Select all filtered tasks');await s.click('Edit selected planned finish');await s.change('Bulk finish date','2026-10-04');await s.change('Bulk finish time','20:00');await s.click('Set selected planned finish');assert.deepEqual((await s.store.loadPlanningState()).targets['assignment:1'],{day:'2026-10-04',time:'20:00'});assert.match(s.root.textContent,/Target is after the deadline/);
 await s.click('Select all filtered tasks');s.fail();await s.click('Complete selected tasks');assert.match(s.root.textContent,/Storage is full/);assert.equal(s.root.querySelectorAll('[data-task-select]:checked').length,2);s.controller.destroy();s.dom.window.close();
});
test('preferences persist and Chinese UI preserves user titles',async()=>{
 const s=await setup();await s.change('Tasks sort','estimateDesc');assert.equal((await s.store.loadPlanningState()).taskPreferences.sort,'estimateDesc');
 setLanguage(s.dom.window.document,'zh-CN');localizeTree(s.root);s.controller.render();assert.match(s.root.textContent,/全部任务/);assert.match(s.root.textContent,/Essay/);assert.equal(s.root.querySelector('[data-control-id="Overdue H/W"]').getAttribute('aria-label'),'逾期作业');s.controller.destroy();s.dom.window.close();
});
test('an unavailable saved course recovers to all courses without resetting other preferences',async()=>{
 const s=await setup({taskPreferences:{course:'course_999',query:'Essay',type:'assignment',sort:'titleDesc',group:'course'}});
 try{
  await settle();
  assert.equal(s.root.querySelector('[data-control-id="Tasks course"]').value,'all');
  assert.deepEqual([...s.root.querySelectorAll('[data-task-row]')].map(n=>n.dataset.taskRow),['assignment:1']);
  const saved=(await s.store.loadPlanningState()).taskPreferences;
  assert.equal(saved.course,'all');assert.equal(saved.query,'Essay');assert.equal(saved.type,'assignment');assert.equal(saved.sort,'titleDesc');assert.equal(saved.group,'course');
 }finally{s.controller.destroy();s.dom.window.close();}
});
test('removing the selected course on refresh clears selection and persists all courses',async()=>{
 const s=await setup();
 try{
  await s.change('Tasks course','course_456');await s.change('Tasks sort','estimateDesc');await s.click('Select all filtered tasks');
  s.controller.setData({items:[task({contexts:['Other'],contextCodes:['course_2']})],contexts:[{code:'course_2',name:'Other'}]});await settle();
  assert.equal(s.root.querySelector('[data-control-id="Tasks course"]').value,'all');
  assert.equal(s.root.querySelectorAll('[data-task-row]').length,1);assert.equal(s.root.querySelectorAll('[data-task-select]:checked').length,0);
  const saved=(await s.store.loadPlanningState()).taskPreferences;assert.equal(saved.course,'all');assert.equal(saved.sort,'estimateDesc');
 }finally{s.controller.destroy();s.dom.window.close();}
});
test('valid saved courses survive refresh and empty contexts safely clear an unavailable course',async()=>{
 const s=await setup({taskPreferences:{course:'course_456',sort:'titleDesc'}});
 try{
  s.controller.setData({contexts:[{code:'course_456',name:'Renamed course'}]});await settle();
  assert.equal(s.root.querySelector('[data-control-id="Tasks course"]').value,'course_456');
  assert.equal((await s.store.loadPlanningState()).taskPreferences.course,'course_456');
  s.controller.setData({contexts:[]},{render:false});s.controller.render();await settle();
  assert.equal(s.root.querySelector('[data-control-id="Tasks course"]').value,'all');assert.equal(s.root.querySelectorAll('[data-task-row]').length,2);
  const saved=(await s.store.loadPlanningState()).taskPreferences;assert.equal(saved.course,'all');assert.equal(saved.sort,'titleDesc');
 }finally{s.controller.destroy();s.dom.window.close();}
});
test('range expansion can change just one boundary and global overdue shortcut clears incompatible filters',async()=>{
 const s=await setup();await s.change('Tasks range end','2027-05-31');await s.click('Load task date range');assert.deepEqual(s.ranges,[{startDate:'2026-03-01',endDate:'2027-05-31'}]);
 await s.change('Tasks type','event');s.controller.showPreset('overdue');assert.equal(s.root.querySelectorAll('[data-task-row]').length,1);s.controller.destroy();s.dom.window.close();
});
test('bulk actions commit the displayed input even before a change or blur event',async()=>{
 const s=await setup();await s.click('Select all filtered tasks');
 await s.click('Edit selected estimates');const effort=s.root.querySelector('[data-control-id="Bulk estimate minutes"]');effort.value='45';effort.dispatchEvent(new s.dom.window.Event('input'));await s.click('Set selected estimates');assert.equal((await s.store.loadPlanningState()).estimates['assignment:1'],45);
 await s.click('Select all filtered tasks');await s.click('Edit selected planned finish');s.root.querySelector('[data-control-id="Bulk finish date"]').value='2026-10-01';s.root.querySelector('[data-control-id="Bulk finish time"]').value='20:00';await s.click('Set selected planned finish');assert.deepEqual((await s.store.loadPlanningState()).targets['assignment:1'],{day:'2026-10-01',time:'20:00'});s.controller.destroy();s.dom.window.close();
});

test('advanced filters collapse without hiding active restrictions or losing their values',async()=>{
 const s=await setup();const details=s.root.querySelector('.task-more-filters');assert.ok(details);assert.equal(details.open,false);
 details.open=true;await s.change('Tasks type','assignment');s.root.querySelector('.task-more-filters').open=false;s.controller.render();
 assert.equal(s.root.querySelector('.task-more-filters').open,false);assert.match(s.root.querySelector('.active-task-filters').textContent,/Homework/);
 assert.equal(s.root.querySelector('[data-control-id="Tasks type"]').value,'assignment');assert.equal(s.root.querySelectorAll('[data-task-row]').length,2);
 await s.click('Reset task filters');assert.equal(s.root.querySelector('.active-task-filters').textContent,'');s.controller.destroy();s.dom.window.close();
});
test('batch editors open one at a time and preserve unfinished input across switching',async()=>{
 const s=await setup();await s.click('Select all filtered tasks');assert.equal(s.root.querySelector('[data-control-id="Bulk estimate minutes"]'),null);
 await s.click('Edit selected estimates');s.root.querySelector('[data-control-id="Bulk estimate minutes"]').value='75';
 await s.click('Edit selected planned finish');assert.equal(s.root.querySelector('[data-control-id="Bulk estimate minutes"]'),null);
 s.root.querySelector('[data-control-id="Bulk finish date"]').value='2026-10-02';await s.click('Edit selected estimates');
 assert.equal(s.root.querySelector('[data-control-id="Bulk estimate minutes"]').value,'75');await s.click('Edit selected planned finish');
 assert.equal(s.root.querySelector('[data-control-id="Bulk finish date"]').value,'2026-10-02');
 s.fail();await s.click('Set selected planned finish');assert.ok(s.root.querySelector('[data-control-id="Bulk finish date"]'));assert.equal(s.root.querySelectorAll('[data-task-select]:checked').length,2);s.controller.destroy();s.dom.window.close();
});

test('batch status distinguishes successful saves and undo from failures',async()=>{
 const s=await setup();await s.click('Select all filtered tasks');await s.click('Edit selected estimates');await s.change('Bulk estimate minutes','60');await s.click('Set selected estimates');
 assert.match(s.root.querySelector('.success')?.textContent||'',/Task changes saved/);
 await s.click('Undo task changes');assert.match(s.root.querySelector('.success')?.textContent||'',/Task changes undone/);
 await s.click('Select all filtered tasks');s.fail();await s.click('Complete selected tasks');assert.match(s.root.querySelector('.notice')?.textContent||'',/Storage is full/);assert.equal(s.root.querySelector('.success'),null);
 s.controller.destroy();s.dom.window.close();
});
