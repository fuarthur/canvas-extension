import test from 'node:test';import assert from 'node:assert/strict';
import {createReminderClient} from '../src/reminder-client.js';
test('reminder client binds every request to its verified account',async()=>{
 const sent=[],client=createReminderClient({userId:77,sendMessage:async message=>{sent.push(message);return {ok:true,status:{state:'off'}};}});
 await client.accountSeen({userId:88,selectedCalendars:['course_1']});await client.getStatus({userId:88});await client.testNotification({userId:88});
 assert.deepEqual(sent,[{type:'REMINDER_ACCOUNT_SEEN',userId:77,selectedCalendars:['course_1']},{type:'REMINDER_STATUS',userId:77},{type:'REMINDER_TEST',userId:77}]);
});
test('invalidated extension context produces a fixed reminder error',async()=>{
 const client=createReminderClient({userId:77,sendMessage:async()=>{throw new Error('Extension context invalidated');}});
 assert.deepEqual(await client.getStatus(),{ok:false,code:'CONTEXT',message:'Reminder status is unavailable. Reload this Canvas page.'});
});
