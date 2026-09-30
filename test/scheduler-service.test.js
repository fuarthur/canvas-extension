import test from 'node:test';import assert from 'node:assert/strict';import {createSchedulerService} from '../src/scheduler-service.js';import {createSchedulerClient} from '../src/scheduler-client.js';import {generateSchedule} from '../src/scheduler.js';import {plan,task} from './helpers/planning.js';import {portPair} from './helpers/ports.js';
const input={plan:plan(),items:[task()],completed:{},now:'2026-10-01T12:00:00Z',loadedRange:{startDate:'2026-10-01',endDate:'2026-10-03'}};const sender={url:'https://canvas.illinois.edu/calendar',tab:{id:1}};
const clientFor=(service,s=sender)=>{let pair;const client=createSchedulerClient({connect:()=>{pair=portPair();service.handlePort(pair.server,s);return pair.client;}});return {client,disconnect:()=>pair.client.disconnect()};};
test('background and client run the actual scheduler and isolate cancellation by port',async()=>{
 const service=createSchedulerService({generateSchedule});const a=clientFor(service),b=clientFor(service,{...sender,tab:{id:2}});const first=a.client.run(input);const second=b.client.run(input);a.client.cancel();assert.equal((await first).status,'cancelled');assert.equal((await second).status,'complete');a.client.destroy();b.client.destroy();
});
test('disconnection returns a retryable error and does not apply a stale result',async()=>{
 const service=createSchedulerService({generateSchedule});const {client,disconnect}=clientFor(service);const pending=client.run(input);disconnect();assert.equal((await pending).status,'error');client.destroy();
});
test('a newer run cancels the previous request without losing the new response',async()=>{
 const {client}=clientFor(createSchedulerService({generateSchedule}));const old=client.run(input);const next=client.run(input);assert.equal((await old).status,'cancelled');assert.equal((await next).status,'complete');client.destroy();
});
test('foreign senders and invalid inputs cannot run a schedule',async()=>{
 const bad=clientFor(createSchedulerService({generateSchedule}),{url:'https://example.com/calendar',tab:{id:1}});assert.equal((await bad.client.run(input)).status,'error');bad.client.destroy();const good=clientFor(createSchedulerService({generateSchedule}));assert.equal((await good.client.run({...input,plan:{schemaVersion:99}})).status,'error');good.client.destroy();
});
