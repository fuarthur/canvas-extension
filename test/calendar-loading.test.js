import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createCanvasLoader} from '../src/canvas-api.js';
import {createPlannerStore} from '../src/storage.js';
import {defaultSettings,validateSettings} from '../src/planning-settings.js';
import {renderPlanningSettings} from '../src/settings-view.js';
import {mountPlanner} from '../src/view.js';
import {memoryStorage} from './helpers/planning.js';

const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
function transport({id=()=>77,calendar=()=>[]}={}) {
  const calls=[];
  const fetchImpl=async input=>{
    const url=new URL(input);calls.push(url);
    if(url.pathname.endsWith('/profile'))return json({id:id(),time_zone:'America/Chicago'});
    if(url.pathname.endsWith('/account_calendars'))return json({account_calendars:[]});
    if(url.pathname.endsWith('/calendar_events'))return json(await calendar(url));
    return json([]);
  };
  return {calls,fetchImpl};
}
const dates=calls=>calls.filter(url=>url.pathname.endsWith('/calendar_events')).map(url=>[url.searchParams.get('start_date'),url.searchParams.get('end_date')]);
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));

test('default loading requests four months before and after, including year boundaries',async()=>{
  const t=transport();const snapshot=await createCanvasLoader({fetchImpl:t.fetchImpl})('2026-11');
  assert.deepEqual(snapshot.range,{startDate:'2026-07-01',endDate:'2027-03-31'});
  assert.deepEqual(dates(t.calls),[['2026-07-01','2027-03-31'],['2026-07-01','2027-03-31']]);
});

test('asymmetric and semester settings control the actual calendar requests',async()=>{
  for(const [month,config,range] of [
    ['2026-09',{mode:'months',pastMonths:2,futureMonths:1},{startDate:'2026-07-01',endDate:'2026-10-31'}],
    ['2028-02',{mode:'months',pastMonths:0,futureMonths:0},{startDate:'2028-02-01',endDate:'2028-02-29'}],
    ['2026-01',{mode:'semester',pastMonths:4,futureMonths:4},{startDate:'2026-01-01',endDate:'2026-05-31'}],
    ['2026-05',{mode:'semester',pastMonths:4,futureMonths:4},{startDate:'2026-01-01',endDate:'2026-05-31'}],
    ['2026-07',{mode:'semester',pastMonths:4,futureMonths:4},{startDate:'2026-07-01',endDate:'2026-07-31'}],
    ['2026-12',{mode:'semester',pastMonths:4,futureMonths:4},{startDate:'2026-08-01',endDate:'2026-12-31'}]
  ]) {
    const t=transport();const snapshot=await createCanvasLoader({fetchImpl:t.fetchImpl,readLoadingSettings:async()=>config})(month);
    assert.deepEqual(snapshot.range,range,month);
    assert.ok(dates(t.calls).every(([start,end])=>start===range.startDate&&end===range.endDate));
  }
});

test('old settings acquire loading defaults and invalid month ranges cannot be saved',()=>{
  const old=defaultSettings();delete old.calendarLoading;
  const restored=validateSettings(old).value.calendarLoading;
  assert.equal(restored.mode,'months');assert.equal(restored.pastMonths,4);assert.equal(restored.futureMonths,4);
  assert.deepEqual(restored.summer,{enabled:false,startMonth:6,endMonth:7});
  assert.deepEqual(restored.winter,{enabled:false,startMonth:12,endMonth:1});
  for(const calendarLoading of [{mode:'months',pastMonths:-1,futureMonths:4},{mode:'months',pastMonths:1.5,futureMonths:4},{mode:'months',pastMonths:12,futureMonths:12},{mode:'bad',pastMonths:4,futureMonths:4}])
    assert.equal(validateSettings({...old,calendarLoading}).value,null);
});

test('new page loaders read shared cached events after confirming identity',async()=>{
  const storageArea=memoryStorage(),t=transport({calendar:url=>url.searchParams.get('type')==='event'?[{id:1,title:'Saved event',start_at:'2026-09-10T12:00:00Z'}]:[]});
  const options={storageArea,fetchImpl:t.fetchImpl,now:()=>1000};
  await createCanvasLoader(options)('2026-09');t.calls.length=0;
  const reopened=await createCanvasLoader(options)('2026-09');
  assert.equal(reopened.events[0].title,'Saved event');
  assert.deepEqual(t.calls.map(url=>url.pathname),['/api/v1/users/self/profile']);
});

test('shared stale data is visible before a slow update, but data older than 24 hours is discarded',async()=>{
  let now=0,release,slow=false;
  const storageArea=memoryStorage(),t=transport({calendar:async()=>{if(slow){slow=false;await new Promise(resolve=>{release=resolve;});}return [];}});
  const options={storageArea,fetchImpl:t.fetchImpl,now:()=>now};
  await createCanvasLoader(options)('2026-09');now=300001;slow=true;
  let shown=false;const updating=createCanvasLoader(options)('2026-09',{onCached:()=>{shown=true;}});
  for(let i=0;i<20&&!release;i++)await settle();
  assert.equal(shown,true);assert.ok(release);release();await updating;
  now+=24*60*60*1000+1;shown=false;
  await createCanvasLoader(options)('2026-09',{onCached:()=>{shown=true;}});
  assert.equal(shown,false);
});

test('changing range settings never reuses a broader cached snapshot',async()=>{
  const storageArea=memoryStorage(),t=transport();let config={mode:'months',pastMonths:4,futureMonths:4};
  const options={storageArea,fetchImpl:t.fetchImpl,readLoadingSettings:async()=>config};
  await createCanvasLoader(options)('2026-09');config={mode:'semester',pastMonths:4,futureMonths:4};t.calls.length=0;
  let shown=false;const next=await createCanvasLoader(options)('2026-09',{onCached:()=>{shown=true;}});
  assert.equal(shown,false);assert.deepEqual(next.range,{startDate:'2026-08-01',endDate:'2026-12-31'});
  assert.equal(dates(t.calls).length,2);
});

test('shared caches respect account and calendar selection and sign-out clears them',async()=>{
  let id=77,selection=['user_77'],signedIn=true;
  const storageArea=memoryStorage(),t=transport({id:()=>id});
  const options={storageArea,readSelection:async()=>selection,fetchImpl:input=>signedIn?t.fetchImpl(input):Promise.resolve(new Response('',{status:401}))};
  await createCanvasLoader(options)('2026-09');
  id=88;selection=['user_88'];let shown=false;
  await createCanvasLoader(options)('2026-09',{onCached:()=>{shown=true;}});assert.equal(shown,false);
  id=77;selection=[];t.calls.length=0;await createCanvasLoader(options)('2026-09');assert.equal(dates(t.calls).length,0);
  signedIn=false;await assert.rejects(createCanvasLoader(options)('2026-09'),error=>error.code==='AUTH');
  signedIn=true;selection=['user_77'];t.calls.length=0;await createCanvasLoader(options)('2026-09');assert.equal(dates(t.calls).length,2);
});

test('sign-out in another tab prevents an earlier successful request from restoring shared cache',async()=>{
  const area=memoryStorage();let release,slow=true;
  const t=transport({calendar:async url=>{if(slow&&url.searchParams.get('type')==='event'){slow=false;await new Promise(resolve=>{release=resolve;});}return [];}});
  const delayed=createCanvasLoader({storageArea:area,fetchImpl:t.fetchImpl})('2026-09');
  for(let i=0;i<20&&!release;i++)await settle();assert.ok(release);
  await assert.rejects(createCanvasLoader({storageArea:area,fetchImpl:async()=>new Response('',{status:401})})('2026-09'));
  release();await delayed;t.calls.length=0;
  await createCanvasLoader({storageArea:area,fetchImpl:t.fetchImpl})('2026-09');assert.equal(dates(t.calls).length,2);
});

test('endpoint sign-out invalidates requests from another selection in the same page',async()=>{
  const area=memoryStorage();let release,selection=null,deny=false,slow=true;
  const t=transport({calendar:async url=>{if(slow&&url.searchParams.get('type')==='event'){slow=false;await new Promise(resolve=>{release=resolve;});}return [];}});
  const loader=createCanvasLoader({storageArea:area,readSelection:async()=>selection,fetchImpl:input=>deny&&new URL(input).pathname.endsWith('/calendar_events')?Promise.resolve(new Response('',{status:401})):t.fetchImpl(input)});
  const delayed=loader('2026-09');for(let i=0;i<20&&!release;i++)await settle();assert.ok(release);
  selection=['user_77'];deny=true;await assert.rejects(loader('2026-09',{force:true}),error=>error.code==='AUTH');
  release();await delayed;deny=false;selection=null;t.calls.length=0;
  await loader('2026-09');assert.equal(dates(t.calls).length,2);
});

test('a delayed older tab response cannot hide a newer shared refresh on reopening',async()=>{
  const area=memoryStorage();let release,slow=true;
  const t=transport({calendar:async url=>{
    if(url.searchParams.get('type')!=='event')return [];
    if(slow){slow=false;await new Promise(resolve=>{release=resolve;});return [{id:1,title:'Old',start_at:'2026-09-10T12:00:00Z'}];}
    return [{id:1,title:'New',start_at:'2026-09-10T12:00:00Z'}];
  }});
  const options={storageArea:area,fetchImpl:t.fetchImpl,now:()=>1000},first=createCanvasLoader(options);
  const older=first('2026-09');for(let i=0;i<20&&!release;i++)await settle();assert.ok(release);
  await createCanvasLoader(options)('2026-09',{force:true});release();await older;
  assert.equal((await first('2026-09')).events[0].title,'New');
  assert.equal((await createCanvasLoader(options)('2026-09')).events[0].title,'New');
});

test('a new load after another tab signs out never joins a pre-sign-out pending request',async()=>{
  const area=memoryStorage();let release,slow=true;
  const t=transport({calendar:async url=>{
    if(url.searchParams.get('type')!=='event')return [];
    if(slow){slow=false;await new Promise(resolve=>{release=resolve;});return [{id:1,title:'Before sign-out',start_at:'2026-09-10T12:00:00Z'}];}
    return [{id:1,title:'After sign-in',start_at:'2026-09-10T12:00:00Z'}];
  }});
  const loader=createCanvasLoader({storageArea:area,fetchImpl:t.fetchImpl});
  const earlier=loader('2026-09');for(let i=0;i<20&&!release;i++)await settle();assert.ok(release);
  await assert.rejects(createCanvasLoader({storageArea:area,fetchImpl:async()=>new Response('',{status:401})})('2026-09'));
  const newer=loader('2026-09');for(let i=0;i<20&&dates(t.calls).length<4;i++)await settle();
  release();await earlier;assert.equal((await newer).events[0].title,'After sign-in');
});

test('the current month appears before the configured range finishes loading',async()=>{
  let release;const t=transport({calendar:async url=>{
    if(url.searchParams.get('start_date')==='2026-05-01'&&url.searchParams.get('type')==='event')await new Promise(resolve=>{release=resolve;});
    return url.searchParams.get('type')==='event'?[{id:1,title:'Current event',start_at:'2026-09-10T12:00:00Z'}]:[];
  }});
  let partial;const loading=createCanvasLoader({fetchImpl:t.fetchImpl})('2026-09',{onPartial:snapshot=>{partial=snapshot;}});
  for(let i=0;i<20&&!release;i++)await settle();
  assert.ok(partial);assert.equal(partial.events[0].title,'Current event');
  assert.deepEqual(partial.range,{startDate:'2026-08-30',endDate:'2026-10-03'});
  assert.ok(release);release();const full=await loading;
  assert.deepEqual(full.range,{startDate:'2026-05-01',endDate:'2027-01-31'});
});

test('calendar range controls persist asymmetric months and semester mode',async()=>{
  const dom=new JSDOM(''),store=createPlannerStore(memoryStorage(),'canvas.illinois.edu',77);
  const root=renderPlanningSettings({document:dom.window.document,state:await store.loadPlanningState(),contexts:[],onSave:value=>store.setSettings(value)});
  const change=(name,value)=>{const field=root.querySelector(`[data-control-id="${name}"]`);assert.ok(field,name);field.value=value;field.dispatchEvent(new dom.window.Event('change'));};
  change('Months before current month','2');change('Months after current month','5');
  root.querySelector('[data-control-id="Save planning settings"]').click();await settle();
  const saved=(await store.loadPlanningState()).settings.calendarLoading;
  assert.equal(saved.mode,'months');assert.equal(saved.pastMonths,2);assert.equal(saved.futureMonths,5);
  change('Calendar loading mode','semester');assert.equal(root.querySelector('[data-control-id="Months before current month"]').disabled,true);
  root.querySelector('[data-control-id="Save planning settings"]').click();await settle();
  assert.equal((await store.loadPlanningState()).settings.calendarLoading.mode,'semester');dom.window.close();
});

test('enabled extra semesters include a month of overlap on both sides, including cross-year winter',async()=>{
  const base={mode:'semester',pastMonths:4,futureMonths:4,summer:{enabled:true,startMonth:6,endMonth:7},winter:{enabled:true,startMonth:12,endMonth:1}};
  for(const [month,config,range] of [
    ['2026-06',base,{startDate:'2026-05-01',endDate:'2026-08-31'}],
    ['2026-12',base,{startDate:'2026-11-01',endDate:'2027-02-28'}],
    ['2028-01',base,{startDate:'2027-11-01',endDate:'2028-02-29'}],
    ['2026-07',{...base,summer:{enabled:true,startMonth:5,endMonth:8}},{startDate:'2026-04-01',endDate:'2026-09-30'}]
  ]) {
    const t=transport();const snapshot=await createCanvasLoader({fetchImpl:t.fetchImpl,readLoadingSettings:async()=>config})(month);
    assert.deepEqual(snapshot.range,range,month);
  }
});

test('extra semester switches default off and saved custom ranges control later loads',async()=>{
  const dom=new JSDOM(''),store=createPlannerStore(memoryStorage(),'canvas.illinois.edu',77);
  const root=renderPlanningSettings({document:dom.window.document,state:await store.loadPlanningState(),contexts:[],currentMonth:'2026-06',onSave:value=>store.setSettings(value)});
  dom.window.document.body.append(root);
  const field=name=>root.querySelector(`[data-control-id="${name}"]`);
  assert.equal(field('Enable Summer semester').checked,false);assert.equal(field('Enable Winter semester').checked,false);
  field('Calendar loading mode').value='semester';field('Calendar loading mode').dispatchEvent(new dom.window.Event('change'));
  field('Enable Summer semester').click();assert.equal(field('Summer start month').disabled,false);
  field('Summer start month').value='5';field('Summer start month').dispatchEvent(new dom.window.Event('change'));
  field('Save planning settings').click();await settle();
  const config=(await store.loadPlanningState()).settings.calendarLoading;
  assert.deepEqual(config.summer,{enabled:true,startMonth:5,endMonth:7});
  const t=transport();const snapshot=await createCanvasLoader({fetchImpl:t.fetchImpl,readLoadingSettings:async()=>config})('2026-06');
  assert.deepEqual(snapshot.range,{startDate:'2026-04-01',endDate:'2026-08-31'});
  assert.match(root.querySelector('[data-loading-range-preview]').textContent,/2026-04-01.*2026-08-31/);dom.window.close();
});

test('semester changes do not mistake overlapping Summer or Winter buffers for the next full semester',async()=>{
  const t=transport(),area=memoryStorage(),config={mode:'semester',pastMonths:4,futureMonths:4,summer:{enabled:true,startMonth:6,endMonth:7},winter:{enabled:true,startMonth:12,endMonth:1}};
  const options={fetchImpl:t.fetchImpl,storageArea:area,readLoadingSettings:async()=>config};
  await createCanvasLoader(options)('2026-07');t.calls.length=0;
  const fall=await createCanvasLoader(options)('2026-08');
  assert.deepEqual(fall.range,{startDate:'2026-08-01',endDate:'2026-12-31'});assert.equal(dates(t.calls).length,2);
  await createCanvasLoader(options)('2027-01');t.calls.length=0;
  const spring=await createCanvasLoader(options)('2027-02');
  assert.deepEqual(spring.range,{startDate:'2027-01-01',endDate:'2027-05-31'});assert.equal(dates(t.calls).length,2);
});

test('saving loading settings reloads the range and leaves the settings editor in place',async()=>{
  const dom=new JSDOM('<main/>',{url:'https://canvas.illinois.edu/calendar'}),host=dom.window.document.createElement('div');
  const area=memoryStorage(),store=createPlannerStore(area,'canvas.illinois.edu',77),t=transport();
  const loader=createCanvasLoader({fetchImpl:t.fetchImpl,storageArea:area,readLoadingSettings:async()=>(await store.loadPlanningState()).settings.calendarLoading});
  const planner=mountPlanner({host,initialMonth:'2026-09',storeFactory:()=>store,loadSnapshot:loader});
  await planner.show();host.shadowRoot.querySelector('[data-control-id="Calendar settings"]').click();await settle();
  const editor=host.shadowRoot.querySelector('.planning-settings');t.calls.length=0;
  const mode=editor.querySelector('[data-control-id="Calendar loading mode"]');mode.value='semester';mode.dispatchEvent(new dom.window.Event('change'));
  editor.querySelector('[data-control-id="Save planning settings"]').click();
  for(let i=0;i<30&&!/Planning settings saved/.test(editor.textContent);i++)await settle();
  assert.deepEqual(dates(t.calls),[['2026-08-01','2026-12-31'],['2026-08-01','2026-12-31']]);
  assert.equal(host.shadowRoot.querySelector('.planning-settings'),editor);assert.match(editor.textContent,/Planning settings saved/);
  planner.destroy();dom.window.close();
});

test('navigating from a buffered Summer month loads the complete Fall semester',async()=>{
  const dom=new JSDOM('<main/>',{url:'https://canvas.illinois.edu/calendar'}),host=dom.window.document.createElement('div');
  const area=memoryStorage(),store=createPlannerStore(area,'canvas.illinois.edu',77),t=transport();
  await store.setSettings({...defaultSettings(),calendarLoading:{mode:'semester',pastMonths:4,futureMonths:4,summer:{enabled:true,startMonth:6,endMonth:7}}});
  const loader=createCanvasLoader({fetchImpl:t.fetchImpl,storageArea:area,readLoadingSettings:async()=>(await store.loadPlanningState()).settings.calendarLoading});
  const planner=mountPlanner({host,initialMonth:'2026-07',storeFactory:()=>store,loadSnapshot:loader});
  await planner.show();t.calls.length=0;host.shadowRoot.querySelector('[data-control-id="Next month"]').click();
  for(let i=0;i<20&&!dates(t.calls).some(([start,end])=>start==='2026-08-01'&&end==='2026-12-31');i++)await settle();
  assert.ok(dates(t.calls).some(([start,end])=>start==='2026-08-01'&&end==='2026-12-31'));
  await settle();host.shadowRoot.querySelector('[data-control-id="Calendar settings"]').click();await settle();
  assert.match(host.shadowRoot.querySelector('[data-loading-range-preview]').textContent,/2026-08.*2026-12-31/);
  planner.destroy();dom.window.close();
});

test('initial loading uses a skeleton and partial calendar content stays interactive',async()=>{
  const dom=new JSDOM('<main/>',{url:'https://canvas.illinois.edu/calendar'}),host=dom.window.document.createElement('div');
  let begin,finish;const planner=mountPlanner({host,initialMonth:'2026-09',storeFactory:()=>createPlannerStore(memoryStorage(),'canvas.illinois.edu',77),loadSnapshot:async(_month,options)=>{
    await new Promise(resolve=>{begin=resolve;});
    const snapshot={profile:{id:77},contexts:[],events:[],assignments:[],range:{startDate:'2026-09-01',endDate:'2026-09-30'}};
    await options.onPartial(snapshot);return new Promise(resolve=>{finish=()=>resolve(snapshot);});
  }});
  const loading=planner.show();for(let i=0;i<20&&!begin;i++)await settle();
  assert.ok(host.shadowRoot.querySelector('.calendar-skeleton'));assert.equal(host.shadowRoot.querySelector('[role="status"]').getAttribute('aria-live'),'polite');
  begin();for(let i=0;i<20&&!finish;i++)await settle();
  assert.ok(host.shadowRoot.querySelector('.month'));assert.equal(host.shadowRoot.querySelector('[data-control-id="Task list view"]').disabled,false);
  assert.match(host.shadowRoot.textContent,/Loading remaining calendar months/);
  finish();await loading;planner.destroy();dom.window.close();
});
