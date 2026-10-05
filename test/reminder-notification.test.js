import test from 'node:test';import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';
import {formatReminderNotification,safeReminderUrl,notificationIdForToken} from '../src/reminder-notification.js';
import {translateForLanguage} from '../src/i18n.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const item={title:'Settings <img src=x>',contexts:['Today'],dueAt:'2026-10-05T20:00Z'},profile={time_zone:'America/Chicago'};
test('task text remains literal in both languages',()=>{
 for(const language of ['en','zh-CN']){
  const result=formatReminderNotification({item,profile,language,now:Date.parse('2026-10-05T19:59:30Z')});
  assert.equal(result.title,item.title);assert.ok(result.message.startsWith('Today\n'));assert.match(result.message,/1/);assert.match(result.message,/3:00|15:00/);assert.match(result.message,/CDT|GMT-5/);
 }
 assert.equal(translateForLanguage('zh-CN','Settings'),'设置');
});
test('same token gives the same short notification id',async()=>{
 const a=await notificationIdForToken('token');assert.equal(a,await notificationIdForToken('token'));assert.notEqual(a,await notificationIdForToken('other'));assert.ok(a.length<500);
});
test('unsafe targets return Canvas calendar and valid assignment links survive',()=>{
 const calendar='https://canvas.illinois.edu/calendar';
 for(const value of [null,'javascript:alert(1)','data:text/html,x','http://canvas.illinois.edu','https://example.com','https://user:pass@canvas.illinois.edu/x'])assert.equal(safeReminderUrl(value),calendar);
 assert.equal(safeReminderUrl('/courses/1/assignments/2'),'https://canvas.illinois.edu/courses/1/assignments/2');
});
test('invalid deadline is rejected and long names remain literal',()=>{
 assert.throws(()=>formatReminderNotification({item:{...item,dueAt:'bad'},profile,language:'en',now:0}));
 const long={...item,title:'x'.repeat(2000)};assert.equal(formatReminderNotification({item:long,profile,language:'en',now:0}).title,long.title);
});
