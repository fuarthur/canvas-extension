import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {renderLineChart} from '../src/chart-view.js';import {renderWorkloadView} from '../src/workload-view.js';import {task,planningState} from './helpers/planning.js';
test('workload switches metrics and selecting a date exposes real tasks',()=>{
 const dom=new JSDOM('');const root=renderWorkloadView({document:dom.window.document,items:[task({title:'<b>Essay</b>'})],state:planningState(),range:{startDate:'2026-10-01',endDate:'2026-10-03'},now:'2026-10-01T12:00:00Z',timeZone:'America/Chicago',onOpenItem:()=>{},onComplete:()=>{}});
 assert.match(root.textContent,/1 task/);root.querySelector('[aria-label="Show estimated hours"]').click();assert.match(root.querySelector('svg').getAttribute('aria-label'),/hours/);
 root.querySelector('[data-chart-day="2026-10-03"]').dispatchEvent(new dom.window.MouseEvent('click'));assert.match(root.textContent,/<b>Essay<\/b>/);assert.equal(root.querySelector('b'),null);
});
test('zero charts and missing range data stay finite and expose equivalent date tables',()=>{
 const dom=new JSDOM('');const chart=renderLineChart({document:dom.window.document,series:[{id:'a',name:'A',color:'#00f',points:[{day:'2026-10-01',tasks:0,minutes:0,itemKeys:[]},{day:'2026-10-02',tasks:null,minutes:null,itemKeys:[]}]}],metric:'tasks'});
 assert.doesNotMatch(chart.querySelector('svg').outerHTML,/NaN|Infinity/);assert.match(chart.querySelector('table').textContent,/No data/);assert.match(chart.textContent,/2026-10-01/);
});

test('task grids use actual integer values and workload identifies the peak day',()=>{
 const dom=new JSDOM('');const chart=renderLineChart({document:dom.window.document,series:[{name:'A',points:[{day:'2026-10-01',tasks:1,minutes:60}]}]});assert.deepEqual([...chart.querySelectorAll('svg text[text-anchor="end"]')].map(n=>n.textContent),['0','1']);
 const view=renderWorkloadView({document:dom.window.document,items:[task()],state:planningState(),range:{startDate:'2026-10-01',endDate:'2026-10-03'},now:'2026-10-01T12:00:00Z',timeZone:'America/Chicago'});assert.match(view.textContent,/Peak day.*2026-10-03/);
});
