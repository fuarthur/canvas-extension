import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountPlanner} from '../src/view.js';
import {createPlannerStore} from '../src/storage.js';
import {memoryStorage} from './helpers/planning.js';

const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
async function setup() {
  const dom=new JSDOM('<main/>',{url:'https://canvas.illinois.edu/calendar'});
  const document=dom.window.document, host=document.createElement('div'), area=memoryStorage();
  let userId=77, notify, authFailure=false, snapshotGate=null, titlePrefix='Essay';
  const stores=new Map();
  const storeFor=id=>{if(!stores.has(id))stores.set(id,createPlannerStore(area,'canvas.illinois.edu',id));return stores.get(id);};
  const planner=mountPlanner({host,storeFactory:storeFor,planningStoreFactory:storeFor,
    initialMonth:'2026-10',now:()=>new Date('2026-10-01T12:00:00Z'),
    subscribeStorage:(_scope,callback)=>{notify=callback;return()=>{};},
    loadSnapshot:async()=>{if(snapshotGate)await snapshotGate;if(authFailure)throw Object.assign(new Error('Login required'),{code:'AUTH'});return {profile:{id:userId,time_zone:'America/Chicago'},
      contexts:[{code:'course_456',name:'EPSY 456'}],events:[],
      assignments:[1,2].map(id=>({id:`assignment_${id}`,title:`${titlePrefix} ${id}`,context_code:'course_456',assignment:{due_at:'2026-10-03T23:59:00-05:00'}})),
      range:{startDate:'2026-03-01',endDate:'2027-03-31'}};}});
  await planner.show();
  const root=host.shadowRoot,control=id=>root.querySelector(`[data-control-id="${id}"]`);
  const click=async id=>{assert.ok(control(id),id);control(id).click();await settle();};
  const open=id=>root.querySelector(`[data-item-key="assignment:${id}"]`).click();
  const enter=()=>{control('Planned finish date').value='2026-10-02';control('Planned finish time').value='14:30';};
  const assertDraft=()=>{assert.equal(control('Planned finish date').value,'2026-10-02');assert.equal(control('Planned finish time').value,'14:30');};
  return {dom,root,control,click,open,enter,assertDraft,store:storeFor(77),
    notify:async()=>{notify({});await settle();},changeAccount:()=>{userId=88;},setAuthFailure:value=>{authFailure=value;},setTitlePrefix:value=>{titlePrefix=value;},
    holdRefresh:()=>{let release;snapshotGate=new Promise(resolve=>{release=()=>{snapshotGate=null;resolve();};});return release;},
    close:async()=>{await planner.destroy();dom.window.close();}};
}

test('unfinished personal target survives a completion change',async()=>{
  const s=await setup();s.open(1);s.enter();
  const completed=s.control('Mark complete');completed.checked=true;completed.dispatchEvent(new s.dom.window.Event('change'));
  await settle();s.assertDraft();await s.close();
});
test('unfinished personal target survives estimate changes and storage notifications',async()=>{
  const s=await setup();s.open(1);s.enter();
  const estimate=s.control('Estimated effort minutes');estimate.value='90';estimate.dispatchEvent(new s.dom.window.Event('change'));
  await settle();s.assertDraft();await s.notify();s.assertDraft();await s.close();
});
test('failed target saves retain editable inputs and permit a retry',async()=>{
  const s=await setup();s.open(1);s.enter();const save=s.store.applyTaskBatch;
  s.store.applyTaskBatch=async()=>{throw new Error('Storage is full');};
  await s.click('Save planned finish');assert.match(s.root.textContent,/Storage is full/);s.assertDraft();
  s.store.applyTaskBatch=save;await s.click('Save planned finish');
  assert.deepEqual((await s.store.loadPlanningState()).targets['assignment:1'],{day:'2026-10-02',time:'14:30'});
  await s.click('Clear planned finish');assert.equal(s.control('Planned finish date').value,'');assert.equal(s.control('Planned finish time').value,'');await s.close();
});
test('detail drafts reset when switching tasks or closing and reopening',async()=>{
  const s=await setup();s.open(1);s.enter();s.open(2);assert.equal(s.control('Planned finish date').value,'');
  s.enter();await s.click('Close details');s.open(2);assert.equal(s.control('Planned finish date').value,'');await s.close();
});
test('detail drafts never transfer to another Canvas account',async()=>{
  const s=await setup();s.open(1);s.enter();s.changeAccount();await s.click('Refresh calendar');s.open(1);
  assert.equal(s.control('Planned finish date').value,'');await s.close();
});
test('same-view local refresh preserves content and detail scroll positions',async()=>{
  const s=await setup();await s.click('Task list view');s.root.querySelector('.content').scrollTop=420;await s.notify();
  assert.equal(s.root.querySelector('.content').scrollTop,420);
  s.root.querySelector('.task-title').click();s.root.querySelector('.detail').scrollTop=180;await s.notify();
  assert.equal(s.root.querySelector('.detail').scrollTop,180);
  await s.click('Workload view');assert.equal(s.root.querySelector('.content').scrollTop,0);await s.close();
});

test('planning options are collapsed initially and retain expansion and edits through refresh',async()=>{
 const s=await setup();s.open(1);const options=s.root.querySelector('.detail-planning-options');assert.ok(options);assert.equal(options.open,false);
 assert.equal(s.control('Estimated effort minutes').closest('.detail-planning-options'),null);assert.equal(s.control('Mark complete').closest('.detail-planning-options'),null);
 options.open=true;s.enter();await s.notify();assert.equal(s.root.querySelector('.detail-planning-options').open,true);s.assertDraft();
 assert.match(s.root.querySelector('.detail dl').textContent,/Oct 3, 2026/);s.open(2);assert.equal(s.root.querySelector('.detail-planning-options').open,false);await s.close();
});
test('toolbar offers month navigation only for calendar and workload',async()=>{
 const s=await setup();assert.ok(s.control('Previous month'));
 for(const id of ['Task list view','Planner view','Calendar settings']) {
  await s.click(id);assert.equal(s.control('Previous month'),null);assert.ok(s.control('Refresh calendar'));assert.ok(s.control('Close planning calendar'));
 }
 await s.click('Workload view');assert.ok(s.control('Previous month'));await s.close();
});

test('authentication failure discards task drafts before retrying under another account',async()=>{
 const s=await setup();s.open(1);s.enter();s.setAuthFailure(true);await s.click('Refresh calendar');
 s.changeAccount();s.setAuthFailure(false);await s.click('Retry loading');s.open(1);
 assert.equal(s.control('Planned finish date').value,'');assert.equal(s.control('Planned finish time').value,'');await s.close();
});
test('completion updates survive a target save finishing later',async()=>{
 const s=await setup();s.open(1);s.enter();const apply=s.store.applyTaskBatch;let release;
 s.store.applyTaskBatch=async(...args)=>{await new Promise(resolve=>{release=resolve;});return apply(...args);};
 await s.click('Save planned finish');const completed=s.control('Mark complete');completed.checked=true;completed.dispatchEvent(new s.dom.window.Event('change'));await settle();
 assert.equal(s.control('Mark complete').checked,true);release();await settle();await settle();
 assert.equal((await s.store.load()).completed['assignment:1'],true);assert.equal(s.control('Mark complete').checked,true);await s.close();
});
test('newer target edits survive an earlier target save finishing',async()=>{
 const s=await setup();s.open(1);s.enter();const apply=s.store.applyTaskBatch;let release;
 s.store.applyTaskBatch=async(...args)=>{await new Promise(resolve=>{release=resolve;});return apply(...args);};
 await s.click('Save planned finish');s.control('Planned finish date').value='2026-10-03';s.control('Planned finish date').dispatchEvent(new s.dom.window.Event('input'));
 release();await settle();await settle();assert.equal(s.control('Planned finish date').value,'2026-10-03');
 assert.equal((await s.store.loadPlanningState()).targets['assignment:1'].day,'2026-10-02');await s.close();
});
test('network refresh keeps content, detail and scroll visible while updating',async()=>{
 const s=await setup();await s.click('Task list view');s.root.querySelector('.task-title').click();
 s.root.querySelector('.content').scrollTop=420;s.root.querySelector('.detail').scrollTop=180;
 const release=s.holdRefresh();await s.click('Refresh calendar');assert.ok(s.root.querySelector('.detail'));
 assert.equal(s.root.querySelector('.content').scrollTop,420);assert.equal(s.root.querySelector('.detail').scrollTop,180);
 release();await settle();await settle();
 assert.equal(s.root.querySelector('.content').scrollTop,420);assert.equal(s.root.querySelector('.detail').scrollTop,180);
 await s.click('Workload view');assert.equal(s.root.querySelector('.content').scrollTop,0);await s.close();
});

test('fresh Canvas titles survive a target save finishing later',async()=>{
 const s=await setup();s.open(1);s.enter();const apply=s.store.applyTaskBatch;let release;
 s.store.applyTaskBatch=async(...args)=>{await new Promise(resolve=>{release=resolve;});return apply(...args);};
 await s.click('Save planned finish');s.setTitlePrefix('Revised essay');await s.click('Refresh calendar');
 release();await settle();await settle();assert.equal(s.root.querySelector('.detail h2').textContent,'Revised essay 1');await s.close();
});
test('detail dates follow extension language rather than host page language',async()=>{
 const s=await setup();s.dom.window.document.documentElement.lang='zh-CN';s.open(1);
 assert.match(s.root.querySelector('.detail dl').textContent,/Oct 3, 2026/);await s.close();
});

test('splitting is opt-in in task details and survives reopening',async()=>{
 const s=await setup();s.open(1);
 let toggle=s.control('Allow splitting');assert.ok(toggle);assert.equal(toggle.checked,false);
 toggle.checked=true;toggle.dispatchEvent(new s.dom.window.Event('change'));await settle();
 assert.equal((await s.store.loadPlanningState()).allowSplitting['assignment:1'],true);
 await s.click('Close details');s.open(1);assert.equal(s.control('Allow splitting').checked,true);
 toggle=s.control('Allow splitting');toggle.checked=false;toggle.dispatchEvent(new s.dom.window.Event('change'));await settle();
 assert.equal((await s.store.loadPlanningState()).allowSplitting['assignment:1'],undefined);await s.close();
});

const enterEffort=(s,value,event='input')=>{
 const input=s.control('Estimated effort minutes');input.value=value;
 input.dispatchEvent(new s.dom.window.Event(event));
};
test('unfinished effort survives storage and appearance refreshes without being saved',async t=>{
 const s=await setup();t.after(s.close);s.open(1);enterEffort(s,'135');
 await s.notify();assert.equal(s.control('Estimated effort minutes').value,'135');
 const theme=(await s.store.loadPlanningState()).theme;await s.store.setTheme({...theme,preset:'dark'});await s.notify();
 assert.equal(s.control('Estimated effort minutes').value,'135');
 assert.equal((await s.store.loadPlanningState()).estimates['assignment:1'],undefined);
 assert.match(s.root.querySelector('[data-effort-status]')?.textContent||'',/unsaved/i);
});
test('failed effort saves retain the shown value and offer an accessible retry',async t=>{
 const s=await setup();t.after(s.close);s.open(1);const save=s.store.setEstimate;
 s.store.setEstimate=async()=>{throw new Error('Storage is full');};
 enterEffort(s,'150','change');await settle();
 assert.equal(s.control('Estimated effort minutes').value,'150');
 assert.match(s.root.textContent,/Storage is full/);
 assert.equal(s.root.querySelector('[data-effort-status]')?.getAttribute('role'),'status');
 assert.match(s.control('Save estimated effort')?.getAttribute('aria-label')||'',/retry/i);
 s.store.setEstimate=save;await s.click('Save estimated effort');
 assert.equal((await s.store.loadPlanningState()).estimates['assignment:1'],150);
 assert.equal(s.control('Estimated effort minutes').value,'150');
 assert.match(s.root.querySelector('[data-effort-status]')?.textContent||'',/saved/i);
 assert.doesNotMatch(s.root.textContent,/Storage is full/);
});
test('a newer effort draft survives an earlier save and can be saved explicitly',async t=>{
 const s=await setup();t.after(s.close);s.open(1);const save=s.store.setEstimate;let release;
 s.store.setEstimate=async(...args)=>{await new Promise(resolve=>{release=resolve;});return save(...args);};
 enterEffort(s,'90','change');await settle();
 assert.match(s.root.querySelector('[data-effort-status]')?.textContent||'',/saving/i);
 assert.equal(s.control('Save estimated effort')?.disabled,true);
 enterEffort(s,'135');release();await settle();await settle();
 assert.equal((await s.store.loadPlanningState()).estimates['assignment:1'],90);
 assert.equal(s.control('Estimated effort minutes').value,'135');
 assert.match(s.root.querySelector('[data-effort-status]')?.textContent||'',/unsaved/i);
 s.store.setEstimate=save;await s.click('Save estimated effort');
 assert.equal((await s.store.loadPlanningState()).estimates['assignment:1'],135);
 assert.match(s.root.querySelector('[data-effort-status]')?.textContent||'',/saved/i);
});
test('effort drafts reset when switching tasks or closing details',async t=>{
 const s=await setup();t.after(s.close);s.open(1);enterEffort(s,'135');await s.notify();
 assert.equal(s.control('Estimated effort minutes').value,'135');
 s.open(2);assert.equal(s.control('Estimated effort minutes').value,'60');
 enterEffort(s,'150');await s.click('Close details');s.open(2);
 assert.equal(s.control('Estimated effort minutes').value,'60');
});
test('effort drafts never transfer to another Canvas account',async t=>{
 const s=await setup();t.after(s.close);s.open(1);enterEffort(s,'135');await s.notify();
 assert.equal(s.control('Estimated effort minutes').value,'135');
 s.changeAccount();await s.click('Refresh calendar');s.open(1);
 assert.equal(s.control('Estimated effort minutes').value,'60');
 assert.doesNotMatch(s.root.querySelector('[data-effort-status]')?.textContent||'',/unsaved|saving|retry/i);
});
test('automatic effort replaces an unfinished manual draft only after it saves',async t=>{
 const s=await setup();t.after(s.close);await s.store.setEstimate('assignment:1',150);await s.notify();s.open(1);
 enterEffort(s,'135');await s.notify();assert.equal(s.control('Estimated effort minutes').value,'135');
 await s.click('Use automatic estimate');
 assert.equal((await s.store.loadPlanningState()).estimates['assignment:1'],undefined);
 assert.equal(s.control('Estimated effort minutes').value,'60');
 assert.match(s.root.querySelector('[data-effort-status]')?.textContent||'',/saved/i);
});
test('invalid effort remains editable and never persists until corrected',async t=>{
 const s=await setup();t.after(s.close);s.open(1);enterEffort(s,'0','change');await settle();
 assert.equal(s.control('Estimated effort minutes').value,'0');
 assert.equal((await s.store.loadPlanningState()).estimates['assignment:1'],undefined);
 enterEffort(s,'45');await s.click('Save estimated effort');
 assert.equal((await s.store.loadPlanningState()).estimates['assignment:1'],45);
});
test('automatic effort remains actionable while a blur-triggered manual save finishes',async t=>{
 const s=await setup();t.after(s.close);s.open(1);const save=s.store.setEstimate;let release;
 s.store.setEstimate=async(...args)=>{
  await save(...args);
  if(args[1]===90)await new Promise(resolve=>{release=resolve;});
 };
 enterEffort(s,'90','change');await settle();
 assert.equal(s.control('Use automatic estimate').disabled,false);
 await s.click('Use automatic estimate');
 assert.equal((await s.store.loadPlanningState()).estimates['assignment:1'],undefined);
 assert.equal(s.control('Estimated effort minutes').value,'60');
 release();await settle();await settle();
 assert.equal(s.control('Estimated effort minutes').value,'60');
 assert.match(s.root.querySelector('[data-effort-status]')?.textContent||'',/saved/i);
});
