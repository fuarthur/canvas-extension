import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountPlanner} from '../src/view.js';
import {createPlannerStore} from '../src/storage.js';
import {memoryStorage} from './helpers/planning.js';

async function setup() {
  const dom = new JSDOM('<button id="opener">Open Planning</button><a href="#outside">Outside</a>', {url:'https://canvas.illinois.edu/calendar'});
  const document = dom.window.document, opener = document.querySelector('#opener');
  const host = document.createElement('div'), store = createPlannerStore(memoryStorage(), 'canvas.illinois.edu', 77);
  const planner = mountPlanner({host, storeFactory:()=>store, initialMonth:'2026-10', now:()=>new Date('2026-10-02T12:00:00Z'),
    loadSnapshot:async()=>({profile:{id:77,time_zone:'America/Chicago'},contexts:[],selectedCalendars:[],events:[],assignments:[],range:{startDate:'2026-06-01',endDate:'2027-02-28'}})});
  opener.focus();
  await planner.show();
  const root = host.shadowRoot;
  const control = id=>root.querySelector(`[data-control-id="${id}"]`);
  const settle = ()=>new Promise(resolve=>setTimeout(resolve,0));
  const click = async id=>{control(id).click();await settle();};
  const key = (value,shiftKey=false)=>{
    const event=new dom.window.KeyboardEvent('keydown',{key:value,shiftKey,bubbles:true,composed:true,cancelable:true});
    (root.activeElement||document.activeElement).dispatchEvent(event);
    return event;
  };
  return {dom,document,opener,host,root,planner,control,click,settle,key,close:async()=>{await planner.destroy();dom.window.close();}};
}

test('modal takes focus on open and returns it to the opener on close',async()=>{
  const s=await setup();
  assert.equal(s.root.activeElement,s.control('Close planning calendar'));
  await s.click('Close planning calendar');
  assert.equal(s.document.activeElement,s.opener);
  await s.close();
});

test('Tab wraps visible enabled controls and ignores collapsed details',async()=>{
  const s=await setup(), shell=s.root.querySelector('.shell');
  const last=s.document.createElement('button');last.textContent='Last visible';shell.append(last);
  const hidden=s.document.createElement('button');hidden.hidden=true;shell.append(hidden);
  const disabled=s.document.createElement('button');disabled.disabled=true;shell.append(disabled);
  const details=s.document.createElement('details');details.innerHTML='<summary>Options</summary><button>Hidden action</button>';shell.append(details);
  // A closed disclosure summary remains reachable; its contents must not be.
  details.querySelector('summary').focus();
  assert.equal(s.key('Tab').defaultPrevented,true);
  assert.equal(s.root.activeElement,s.control('Previous month'));
  assert.equal(s.key('Tab',true).defaultPrevented,true);
  assert.equal(s.root.activeElement,details.querySelector('summary'));
  details.open=true;details.querySelector('button').focus();s.key('Tab');
  assert.equal(s.root.activeElement,s.control('Previous month'));
  last.focus();assert.equal(s.key('Tab').defaultPrevented,false);
  await s.close();
});

test('refresh retains focused control and a lost control gets a usable fallback',async()=>{
  const s=await setup();s.control('Refresh calendar').focus();await s.click('Refresh calendar');
  assert.equal(s.root.activeElement,s.control('Refresh calendar'));
  s.control('Previous month').focus();await s.click('Task list view');
  assert.equal(s.root.activeElement,s.control('Close planning calendar'));
  await s.close();
});

test('canceled unsaved-plan close keeps focus inside, eventual close restores opener',async()=>{
  const s=await setup();await s.click('Planner view');await s.click('New plan');
  s.control('Close planning calendar').focus();await s.click('Close planning calendar');
  assert.ok(s.root.querySelector('.draft-dialog'));
  assert.equal(s.document.activeElement,s.host);
  await s.click('Return to editing');
  assert.ok(s.host.isConnected);assert.equal(s.document.activeElement,s.host);
  await s.click('Close planning calendar');await s.click('Discard draft changes');
  assert.equal(s.document.activeElement,s.opener);
  await s.close();
});

test('Escape closes safely when the original opener has been removed',async()=>{
  const s=await setup();s.opener.remove();
  assert.equal(s.key('Escape').defaultPrevented,true);await s.settle();
  assert.equal(s.host.isConnected,false);
  await s.close();
});
