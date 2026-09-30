import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import * as view from '../src/tasks-view.js';import {createPlannerStore} from '../src/storage.js';import {task,memoryStorage} from './helpers/planning.js';import {setLanguage,localizeTree} from '../src/i18n.js';
const settle=()=>new Promise(r=>setTimeout(r,0));
async function setup(){
 const dom=new JSDOM('<main/>'),document=dom.window.document,area=memoryStorage(),store=createPlannerStore(area,'canvas.illinois.edu',77);
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
 const s=await setup();await s.click('Select all filtered tasks');await s.change('Bulk estimate minutes','90');await s.click('Set selected estimates');assert.equal((await s.store.loadPlanningState()).estimates['assignment:1'],90);
 await s.click('Select all filtered tasks');await s.change('Bulk finish date','2026-10-04');await s.change('Bulk finish time','20:00');await s.click('Set selected planned finish');assert.deepEqual((await s.store.loadPlanningState()).targets['assignment:1'],{day:'2026-10-04',time:'20:00'});assert.match(s.root.textContent,/Target is after the deadline/);
 await s.click('Select all filtered tasks');s.fail();await s.click('Complete selected tasks');assert.match(s.root.textContent,/Storage is full/);assert.equal(s.root.querySelectorAll('[data-task-select]:checked').length,2);s.controller.destroy();s.dom.window.close();
});
test('preferences persist and Chinese UI preserves user titles',async()=>{
 const s=await setup();await s.change('Tasks sort','estimateDesc');assert.equal((await s.store.loadPlanningState()).taskPreferences.sort,'estimateDesc');
 setLanguage(s.dom.window.document,'zh-CN');localizeTree(s.root);s.controller.render();assert.match(s.root.textContent,/全部任务/);assert.match(s.root.textContent,/Essay/);assert.equal(s.root.querySelector('[data-control-id="Overdue H/W"]').getAttribute('aria-label'),'逾期作业');s.controller.destroy();s.dom.window.close();
});
test('range expansion can change just one boundary and global overdue shortcut clears incompatible filters',async()=>{
 const s=await setup();await s.change('Tasks range end','2027-05-31');await s.click('Load task date range');assert.deepEqual(s.ranges,[{startDate:'2026-03-01',endDate:'2027-05-31'}]);
 await s.change('Tasks type','event');s.controller.showPreset('overdue');assert.equal(s.root.querySelectorAll('[data-task-row]').length,1);s.controller.destroy();s.dom.window.close();
});
test('bulk actions commit the displayed input even before a change or blur event',async()=>{
 const s=await setup();await s.click('Select all filtered tasks');
 const effort=s.root.querySelector('[data-control-id="Bulk estimate minutes"]');effort.value='45';effort.dispatchEvent(new s.dom.window.Event('input'));await s.click('Set selected estimates');assert.equal((await s.store.loadPlanningState()).estimates['assignment:1'],45);
 await s.click('Select all filtered tasks');s.root.querySelector('[data-control-id="Bulk finish date"]').value='2026-10-01';s.root.querySelector('[data-control-id="Bulk finish time"]').value='20:00';await s.click('Set selected planned finish');assert.deepEqual((await s.store.loadPlanningState()).targets['assignment:1'],{day:'2026-10-01',time:'20:00'});s.controller.destroy();s.dom.window.close();
});
