import test from 'node:test';import assert from 'node:assert/strict';
import {fetchCanvasProfile,loadCanvasReminderSnapshot} from '../src/canvas-api.js';
const profile={id:77,time_zone:'America/Chicago'},now=()=>Date.parse('2026-10-05T02:00Z');
const json=(data,options={})=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json',...options.headers},status:options.status||200});
function fixture({deny=false,paginate=false}={}){
 const calls=[];const fetchImpl=async(input,options)=>{
 const url=new URL(input);calls.push({url,options});
 if(url.pathname.endsWith('/profile'))return json(profile);
 if(url.pathname==='/api/v1/courses')return json([{id:1,name:'Course'}]);
 if(url.pathname.endsWith('/groups'))return json(deny?[{id:44,name:'Closed group'}]:[]);
 if(url.pathname==='/api/v1/account_calendars')return json({account_calendars:[]});
 if(url.pathname==='/api/v1/calendar_events'){
  if(url.searchParams.getAll('context_codes[]').includes('group_44'))return json({}, {status:403});
  if(url.searchParams.get('page')==='2')return json([]);
  return json([{id:'assignment_987',context_code:'course_1',title:'Essay',end_at:'2026-10-05T20:00Z'}],paginate?{headers:{link:'<https://canvas.illinois.edu/api/v1/calendar_events?page=2>; rel="next"'}}:{});
 }
 if(url.pathname==='/api/v1/courses/1/assignments/987')return json({id:987,due_at:'2026-10-05T20:00Z',unlock_at:null,submission:{user_id:77,workflow_state:'submitted'}});
 throw new Error('Unexpected endpoint '+url.pathname);
 };return {fetchImpl,calls};
}
test('reminder range follows now and account timezone',async()=>{
 const f=fixture();assert.equal((await fetchCanvasProfile(f.fetchImpl)).id,77);
 const s=await loadCanvasReminderSnapshot({...f,profile,selectedCalendars:['course_1'],now,maxLeadMinutes:43200});
 assert.equal(s.range.startDate,'2026-10-04');assert.equal(s.range.endDate,'2026-11-04');
 for(const c of f.calls)assert.equal(c.options.credentials,'include');
 const requests=f.calls.filter(c=>c.url.pathname==='/api/v1/calendar_events');assert.equal(requests.length,1);assert.equal(requests[0].url.searchParams.get('type'),'assignment');
 assert.deepEqual(s.events,[]);
});
test('empty selection never requests every calendar',async()=>{
 const f=fixture();const s=await loadCanvasReminderSnapshot({...f,profile,selectedCalendars:[],now,maxLeadMinutes:120});
 assert.deepEqual(s.assignments,[]);assert.equal(f.calls.filter(c=>c.url.pathname==='/api/v1/calendar_events').length,0);
});
test('reminders reuse pagination submission and deadlines',async()=>{
 const f=fixture({paginate:true});const s=await loadCanvasReminderSnapshot({...f,profile,selectedCalendars:['course_1'],now,maxLeadMinutes:120});
 assert.equal(s.assignments[0].assignment.due_at,'2026-10-05T20:00Z');assert.equal(s.assignments[0].assignment.submission.workflow_state,'submitted');
 assert.ok(f.calls.some(c=>c.url.searchParams.get('page')==='2'));
});
test('401 and login HTML are authentication failures',async()=>{
 for(const response of [json({}, {status:401}),new Response('<html>Sign in</html>',{headers:{'content-type':'text/html'}})])await assert.rejects(fetchCanvasProfile(async()=>response),e=>e.code==='AUTH');
 await assert.rejects(fetchCanvasProfile(async()=>json({id:'bad'})),e=>e.code==='DATA');
});
test('untrusted next links malformed pages and invalid timezone are rejected',async()=>{
 const f=fixture();let foreignCalls=0;
 const fetchImpl=async(input,options)=>{
  const url=new URL(input);if(url.origin!=='https://canvas.illinois.edu'){foreignCalls++;throw new Error('foreign');}
  if(url.pathname==='/api/v1/calendar_events')return json([],{headers:{link:'<https://example.com/next>; rel="next"'}});
  return f.fetchImpl(input,options);
 };
 await assert.rejects(loadCanvasReminderSnapshot({fetchImpl,profile,selectedCalendars:['course_1'],now,maxLeadMinutes:120}),e=>e.code==='DATA');assert.equal(foreignCalls,0);
 await assert.rejects(loadCanvasReminderSnapshot({...f,profile:{...profile,time_zone:'invalid'},selectedCalendars:[],now,maxLeadMinutes:120}),e=>e.code==='DATA');
 const malformed=async(input,options)=>new URL(input).pathname==='/api/v1/calendar_events'?json({broken:true}):f.fetchImpl(input,options);
 await assert.rejects(loadCanvasReminderSnapshot({fetchImpl:malformed,profile,selectedCalendars:['course_1'],now,maxLeadMinutes:120}),e=>e.code==='DATA');
});
test('one inaccessible calendar cannot retain its old reminder data',async()=>{
 const f=fixture({deny:true});const s=await loadCanvasReminderSnapshot({...f,profile,selectedCalendars:['course_1','group_44'],now,maxLeadMinutes:120});
 assert.deepEqual(s.unavailableCalendars,['group_44']);assert.equal(s.assignments.length,1);
 await assert.rejects(loadCanvasReminderSnapshot({...f,profile,selectedCalendars:['group_44'],now,maxLeadMinutes:120}),e=>e.code==='FORBIDDEN');
});
