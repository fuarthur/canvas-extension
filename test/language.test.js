import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountPlanner,mountCalendarEntry} from '../src/view.js';
import {createPlannerStore} from '../src/storage.js';
import {createPlannerController} from '../src/planner-view.js';
import {task,plan,settings,planningState,memoryStorage} from './helpers/planning.js';

const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
const control=(root,id)=>root.querySelector(`[data-control-id="${id}"],[aria-label="${id}"]`);

test('language preference survives stale settings saves and is isolated per Canvas account',async()=>{
 const area=memoryStorage(),store=createPlannerStore(area,'canvas.illinois.edu',77);
 await store.setSettings(settings({defaultMinutes:45}));
 assert.equal((await store.loadPlanningState()).settings.language,'en');
 await store.setLanguage('zh-CN');await store.setSettings(settings({defaultMinutes:90}));
 const reopened=await createPlannerStore(area,'canvas.illinois.edu',77).loadPlanningState();
 assert.equal(reopened.settings.language,'zh-CN');assert.equal(reopened.settings.defaultMinutes,90);
 assert.equal((await createPlannerStore(area,'canvas.illinois.edu',88).loadPlanningState()).settings.language,'en');
 await assert.rejects(store.setLanguage('invalid'));assert.equal((await store.loadPlanningState()).settings.language,'zh-CN');
});

async function setup({title='Settings',contextName='Today'}={}){
 const dom=new JSDOM('<main>Native Calendar</main><div class="calendar_view_buttons" role="tablist"></div>',{url:'https://canvas.illinois.edu/calendar'});
 const document=dom.window.document,host=document.createElement('div'),area=memoryStorage();
 const store=createPlannerStore(area,'canvas.illinois.edu',77);let calls=0;
 const planner=mountPlanner({host,storeFactory:()=>store,initialMonth:'2026-10',now:()=>new Date('2026-10-01T12:00:00Z'),loadSnapshot:async()=>{calls++;return {profile:{id:77,time_zone:'America/Chicago'},contexts:[{code:'course_456',name:contextName}],events:[],assignments:[{id:'assignment_1',title,context_code:'course_456',assignment:{due_at:'2026-10-03T23:59:00-05:00'}}],range:{startDate:'2026-10-01',endDate:'2026-12-31'}};}});
 const removeEntry=mountCalendarEntry({document,onOpen:()=>{}});await planner.show();
 const root=host.shadowRoot,click=async id=>{control(root,id).click();await settle();};
 const change=async(id,value)=>{const n=control(root,id);assert.ok(n,`Missing ${id}`);n.value=value;n.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await settle();};
 return {dom,document,root,planner,store,click,change,get calls(){return calls;},destroy(){planner.destroy();removeEntry();dom.window.close();}};
}

test('Settings switches immediately in both directions without losing unsaved rule edits or fetching Canvas',async()=>{
 const s=await setup();await s.click('Calendar settings');await s.click('Add estimate rule');
 await s.change('Rule 1 name','Settings');await s.change('Rule 1 match','HPDL');await s.change('Default estimate minutes','77');
 await s.change('Interface language','zh-CN');
 assert.equal((await s.store.loadPlanningState()).settings.language,'zh-CN');assert.match(s.root.textContent,/选择日历/);
 assert.equal(control(s.root,'Rule 1 name').value,'Settings');assert.equal(control(s.root,'Default estimate minutes').value,'77');
 assert.equal(control(s.root,'Save planning settings').getAttribute('aria-label'),'保存规划设置');
 assert.equal(s.document.querySelector('main').textContent,'Native Calendar');assert.equal(s.document.querySelector('.calendar_view_buttons button').textContent,'规划');
 await s.change('Interface language','en');assert.equal(control(s.root,'Save planning settings').getAttribute('aria-label'),'Save planning settings');
 assert.equal(control(s.root,'Rule 1 name').value,'Settings');assert.equal(s.calls,1);
 await s.change('Interface language','zh-CN');await s.click('Save planning settings');
 assert.equal((await s.store.loadPlanningState()).settings.defaultMinutes,77);s.destroy();
});

test('Chinese calendar, workload and task details preserve Canvas titles and localize dates and errors',async()=>{
 const s=await setup();await s.click('Calendar settings');await s.change('Interface language','zh-CN');await s.click('Planning calendar view');
 assert.match(s.root.textContent,/2026年10月/);assert.equal(s.root.querySelector('.bar-title').textContent,'Settings');
 s.root.querySelector('[data-item-key="assignment:1"]').click();assert.equal(s.root.querySelector('.detail h2').textContent,'Settings');
 assert.equal(control(s.root,'Estimated effort minutes').getAttribute('aria-label'),'预计耗时（分钟）');
 await s.change('Estimated effort minutes','0');assert.match(s.root.textContent,/1.*1440.*分钟/);await s.click('Close details');
 await s.click('Workload view');assert.match(s.root.textContent,/截止日工作量/);assert.match(s.root.textContent,/1小时/);
 assert.equal(s.root.querySelector('svg').getAttribute('aria-label'),'每日任务数量');s.destroy();
});

test('changing language preserves a dirty planner draft, original task text and editable work blocks',async()=>{
 const dom=new JSDOM('<main/>'),document=dom.window.document;const item=task({title:'Settings',contexts:['Today']});
 const original=plan({name:'Today',tasks:{[item.key]:{...item,estimateMinutes:60,singleSession:false,completedAtSave:false}}});
 const state=planningState({plans:{[original.id]:original}});let saved;
 const controller=createPlannerController({document,state,items:[item],now:()=>new Date('2026-10-01T12:00:00Z'),timeZone:'America/Chicago',loadedRange:original.range,planClient:{save:async p=>{saved=structuredClone(p);return {ok:true,plan:{...p,revision:1}};}}});
 const root=controller.render();document.querySelector('main').append(root);
 const name=control(root,'Plan name');name.value='Settings';name.dispatchEvent(new dom.window.Event('change'));
 controller.setData({state:{...state,settings:{...state.settings,language:'zh-CN'}}});
 assert.equal(control(root,'Plan name').value,'Settings');assert.match(root.textContent,/尚未保存/);assert.equal(root.querySelector('.task-title').textContent,'Settings');
 control(root,'Arrange Settings').click();control(root,'Add work block').click();assert.match(root.querySelector('[data-plan-day="2026-10-01"]').textContent,/今天.*1小时/);
 control(root,'Save plan').click();await settle();assert.equal(saved.name,'Settings');assert.equal(saved.segments.length,1);assert.match(root.textContent,/计划已保存/);controller.destroy();dom.window.close();
});

test('failed language writes retain the active language and show a recoverable message',async()=>{
 const s=await setup();s.store.setLanguage=async()=>{throw new Error('Storage unavailable');};await s.click('Calendar settings');await s.change('Interface language','zh-CN');
 assert.equal(control(s.root,'Interface language').value,'en');assert.equal(control(s.root,'Save planning settings').getAttribute('aria-label'),'Save planning settings');assert.match(s.root.textContent,/Storage unavailable/);s.destroy();
});

test('language changes retain an in-progress work-block editor and expanded plan settings',()=>{
 const dom=new JSDOM('<main/>'),document=dom.window.document,item=task();const original=plan();const state=planningState({plans:{[original.id]:original}});
 const controller=createPlannerController({document,state,items:[item],now:()=>new Date('2026-10-01T12:00:00Z'),timeZone:'America/Chicago',loadedRange:original.range,planClient:{}});
 const root=controller.render();document.querySelector('main').append(root);root.querySelector('.plan-configuration').open=true;
 control(root,'Arrange Essay').click();const minutes=control(root,'Work minutes');minutes.value='30';minutes.dispatchEvent(new dom.window.Event('change'));
 controller.setData({state:{...state,settings:{...state.settings,language:'zh-CN'}}});
 assert.equal(control(root,'Work minutes').value,'30');assert.equal(root.querySelector('.plan-configuration').open,true);assert.match(root.querySelector('.arrange-editor').textContent,/建议.*30 分钟/);
 controller.destroy();dom.window.close();
});

test('cached rule previews and validation notices switch both ways without translating rule or course names',async()=>{
 const s=await setup();await s.click('Calendar settings');await s.click('Add estimate rule');await s.change('Rule 1 name','Settings');await s.change('Rule 1 match','HPDL');await s.change('Preview title','HPDL 1');
 await s.change('Default estimate minutes','0');await s.change('Yellow pressure starts at','9');await s.click('Save planning settings');
 await s.change('Interface language','zh-CN');assert.equal(control(s.root,'Preview calendar').selectedOptions[0].textContent,'Today');assert.equal(s.root.querySelector('[data-estimate-preview]').textContent,'30 分钟 · 规则：Settings');assert.match(s.root.textContent,/默认估时必须.*压力阈值必须/);
 await s.change('Interface language','en');assert.equal(s.root.querySelector('[data-estimate-preview]').textContent,'30 min · Rule: Settings');assert.match(s.root.textContent,/Default estimate must.*Pressure thresholds must/);s.destroy();
});

test('Chinese comparisons keep archived names literal in pickers, summaries, legends and chart accessibility',()=>{
 const dom=new JSDOM('<main/>'),document=dom.window.document;const first=plan({id:'first',name:'Today'}),second=plan({id:'second',name:'Settings'});const state=planningState({settings:settings({language:'zh-CN'}),plans:{first,second}});
 const controller=createPlannerController({document,state,items:[task({title:'Settings',contexts:['Today']})],now:()=>new Date('2026-10-01T12:00:00Z'),timeZone:'America/Chicago',loadedRange:first.range,planClient:{}});const root=controller.render();document.querySelector('main').append(root);
 assert.deepEqual([...control(root,'Saved plans').options].slice(1).map(n=>n.textContent),['Today','Settings']);assert.equal(control(root,'Task course').options[1].textContent,'Today');
 control(root,'Compare Today').click();control(root,'Compare Settings').click();assert.deepEqual([...root.querySelectorAll('.plan-comparison .summary-card strong')].map(n=>n.textContent),['Today','Settings']);assert.deepEqual([...root.querySelectorAll('.plan-comparison .chart-legend span')].map(n=>n.textContent),['Today','Settings']);assert.match(root.querySelector('.plan-comparison circle').getAttribute('aria-label'),/^Today, .*0 分钟/);
 controller.destroy();dom.window.close();
});

test('a name being typed remains dirty and survives another page changing the language before blur',()=>{
 const dom=new JSDOM('<main/>'),document=dom.window.document,original=plan();const state=planningState({plans:{[original.id]:original}});let dirty=false;
 const controller=createPlannerController({document,state,items:[task()],now:()=>new Date('2026-10-01T12:00:00Z'),timeZone:'America/Chicago',loadedRange:original.range,onDirtyChange:value=>{dirty=value;},planClient:{}});const root=controller.render();document.querySelector('main').append(root);
 const name=control(root,'Plan name');name.focus();name.value='Unsaved typed name';name.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 controller.setData({state:{...state,settings:{...state.settings,language:'zh-CN'}}});assert.equal(control(root,'Plan name').value,'Unsaved typed name');assert.equal(dirty,true);
 controller.destroy();dom.window.close();
});

test('the actual Settings route can switch language while keeping a planner draft unsaved',async()=>{
 const s=await setup();await s.click('Planner view');await s.click('New plan');await s.change('Plan name','My unfinished plan');await s.click('Calendar settings');
 assert.ok(control(s.root,'Interface language'),'Settings should suspend, not discard or save, the draft');await s.change('Interface language','zh-CN');await s.click('Planner view');
 assert.equal(control(s.root,'Plan name').value,'My unfinished plan');assert.match(s.root.textContent,/尚未保存/);assert.deepEqual((await s.store.loadPlanningState()).plans,{});s.destroy();
});

test('Chinese accessible task labels preserve titles containing template delimiters',async()=>{
 const s=await setup({title:'Essay in Class',contextName:'Settings'});await s.click('Calendar settings');await s.change('Interface language','zh-CN');await s.click('Planning calendar view');
 // Task titles and calendar names are passed separately, so " in " is literal.
 assert.equal(s.root.querySelector('[data-item-key="assignment:1"]').getAttribute('aria-label'),'打开 Settings 中的 Essay in Class');s.destroy();
 const dom=new JSDOM('<main/>'),document=dom.window.document;const item=task({title:'Essay in Class',contexts:['Settings']});const original=plan({tasks:{[item.key]:{...item,estimateMinutes:60,singleSession:false,completedAtSave:false}}});const state=planningState({settings:settings({language:'zh-CN'}),plans:{[original.id]:original}});
 const controller=createPlannerController({document,state,items:[item],now:()=>new Date('2026-10-01T12:00:00Z'),timeZone:'America/Chicago',loadedRange:original.range,planClient:{}});const root=controller.render();assert.equal(root.querySelector('.task-title').getAttribute('aria-label'),'打开 Essay in Class');controller.destroy();dom.window.close();
});

test('before the account is identified the native entry is bilingual without changing native tabs',()=>{
 const dom=new JSDOM('<div class="calendar_view_buttons" role="tablist"><button role="tab">Month</button></div>');const document=dom.window.document;const remove=mountCalendarEntry({document,onOpen:()=>{}});
 assert.equal(document.querySelector('[data-planning-entry]').textContent,'Planning / 规划');assert.equal(document.querySelector('[role="tab"]').textContent,'Month');remove();dom.window.close();
});
