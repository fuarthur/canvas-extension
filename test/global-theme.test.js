import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {createGlobalTheme,canvasThemePalette,globalThemeCss} from '../src/global-theme.js';
import {defaultTheme,contrastRatio} from '../src/themes.js';
const html=readFileSync(new URL('./fixtures/canvas-theme.html',import.meta.url),'utf8');
const dark={...defaultTheme(),preset:'dark'};
const read=(view,el)=>{const s=view.getComputedStyle(el);return [s.color,s.backgroundColor,s.borderColor,s.filter];};
const readProtected=(view,el)=>{const s=view.getComputedStyle(el);return el.matches('.fc-event')?[s.borderColor,s.filter]:el.dataset.protected==='swatch'?[s.backgroundColor,s.borderColor]:el.dataset.protected==='media'?[s.filter,s.backgroundColor]:read(view,el);};
test('Canvas neutrals change while events, course colors, status and content stay intact',()=>{
 const dom=new JSDOM(html),doc=dom.window.document,theme=createGlobalTheme({document:doc});
 const protectedNodes=[...doc.querySelectorAll('[data-protected]')],before=protectedNodes.map(el=>readProtected(dom.window,el));
 const button=doc.querySelector('#neutral-button'),native=read(dom.window,button);
 theme.apply({theme:dark,scope:'canvas'});
 assert.equal(dom.window.getComputedStyle(doc.body).backgroundColor,'rgb(17, 24, 39)');
 assert.notDeepEqual(read(dom.window,button),native);assert.equal(dom.window.getComputedStyle(doc.querySelector('.ig-row')).backgroundColor,'rgb(28, 38, 54)');
 assert.deepEqual(protectedNodes.map(el=>readProtected(dom.window,el)),before);
 theme.apply({theme:dark,scope:'planner'});assert.deepEqual(read(dom.window,button),native);
 assert.equal(doc.querySelector('#canvas-planning-global-theme-style'),null);assert.equal(doc.documentElement.hasAttribute('data-canvas-planning-theme'),false);
 theme.destroy();dom.window.close();
});
test('global theme only owns its style and root marker, and handles repeated updates',()=>{
 const dom=new JSDOM(html),doc=dom.window.document,root=doc.documentElement;
 root.style.cssText='color:purple;--canvas-owned:one';root.className='canvas-owned';const before=root.getAttribute('style');
 const theme=createGlobalTheme({document:doc});theme.apply({theme:dark,scope:'canvas'});theme.apply({theme:{...dark,preset:'forest'},scope:'canvas'});
 assert.equal(doc.querySelectorAll('#canvas-planning-global-theme-style').length,1);
 theme.destroy();theme.destroy();assert.equal(root.getAttribute('style'),before);assert.equal(root.className,'canvas-owned');dom.window.close();
});
test('calendar sidebar and mini-calendar stay readable and button gradients are removed',()=>{
 const dom=new JSDOM(html),doc=dom.window.document,theme=createGlobalTheme({document:doc});theme.apply({theme:dark,scope:'canvas'});
 assert.equal(dom.window.getComputedStyle(doc.querySelector('#calendar-list-holder')).backgroundColor,'rgb(28, 38, 54)');
 assert.equal(dom.window.getComputedStyle(doc.querySelector('#minical .fc-day-number')).color,'rgb(232, 237, 245)');
 assert.equal(dom.window.getComputedStyle(doc.querySelector('#minical .fc-button')).color,'rgb(232, 237, 245)');
 assert.equal(dom.window.getComputedStyle(doc.querySelector('#neutral-button')).backgroundImage,'none');theme.destroy();dom.window.close();
});
test('navigation icon foreground follows the navigation surface',()=>{
 const dom=new JSDOM(html),doc=dom.window.document,theme=createGlobalTheme({document:doc});theme.apply({theme:dark,scope:'canvas'});
 assert.equal(dom.window.getComputedStyle(doc.querySelector('#header .ic-icon-svg')).fill,'#e8edf5');theme.destroy();dom.window.close();
});
test('global palette keeps extreme custom colors readable',()=>{
 const themes=['light','dark','warm','forest','system'].map(preset=>({...defaultTheme(),preset}));
 for(const background of ['#000000','#ffffff','#777777'])for(const surface of ['#000000','#ffffff','#777777'])themes.push({preset:'custom',custom:{base:'dark',accent:surface,background,surface,text:background}});
 for(const theme of themes){const {variables:v}=canvasThemePalette(theme,true);
 for(const bg of ['bg','surface'])for(const kind of ['text','muted','link','focus'])assert.ok(contrastRatio(v[`${kind}-on-${bg}`],v[bg])>=(kind==='focus'?3:4.5),`${kind} on ${bg}`);
 assert.ok(contrastRatio(v['control-border'],v.surface)>=3);
 }
 const css=globalThemeCss({preset:'custom',custom:{base:'dark',accent:'red;display:none',background:'#fff',surface:'#fff',text:'#fff'}});
 assert.ok(!css.includes('red;display:none'));
});
test('opposite page and surface colors keep rendered headings, links, muted text and focus readable',()=>{
 for(const [background,surface] of [['#000000','#ffffff'],['#ffffff','#000000']]){
  const dom=new JSDOM(html),doc=dom.window.document;
  doc.querySelector('#content').insertAdjacentHTML('afterbegin','<div id="calendar_header"><h2>October</h2></div><p class="muted" id="page-muted">Page hint</p>');
  doc.querySelector('#right-side').insertAdjacentHTML('afterbegin','<a href="#" id="sidebar-link">Help</a>');
  doc.querySelector('.ig-row').insertAdjacentHTML('beforeend','<span class="muted" id="surface-muted">Row hint</span>');
  const theme=createGlobalTheme({document:doc});theme.apply({scope:'canvas',theme:{preset:'custom',custom:{base:'dark',background,surface,text:background,accent:background}}});
  const hex=value=>value.startsWith('#')?value:'#'+value.match(/\d+/g).slice(0,3).map(n=>Number(n).toString(16).padStart(2,'0')).join('');
  for(const [target,bg] of [['#calendar_header h2',background],['#sidebar-link',background],['#page-muted',background],['#surface-muted',surface],['.ig-title',surface]]){
   assert.ok(contrastRatio(hex(dom.window.getComputedStyle(doc.querySelector(target)).color),bg)>=4.5,`${target} on ${bg}`);
  }
  for(const [target,bg] of [['#sidebar-link',background],['#neutral-input',background],['.ig-title',surface]]){
   const el=doc.querySelector(target);el.tabIndex=0;el.focus();
   const outline=dom.window.getComputedStyle(el).outline;assert.ok(contrastRatio(outline.match(/#[\da-f]{6}/i)[0],bg)>=3,`${target} focus on ${bg}`);
  }
  theme.destroy();dom.window.close();
 }
});
test('Dashboard list mode adapts header and day labels while preserving course and status colors',()=>{
 const dom=new JSDOM(html),doc=dom.window.document;
 doc.head.insertAdjacentHTML('beforeend','<style>.ic-Dashboard-header__layout{background:rgba(255,255,255,.95)}.PlannerHeader,.baseButton__content{background:white}.planner-day,.planner-day h2,.planner-day > .view-text{color:#334451}.PlannerItem-styles__details a{color:#b74d04}</style>');
 doc.body.insertAdjacentHTML('beforeend',`<div id="dashboard_header_container" class="ic-Dashboard-header"><div class="ic-Dashboard-header__layout"><span class="view-heading">Dashboard</span><div id="dashboard-planner-header"><div class="PlannerHeader"><button><span class="baseButton__content">Today</span></button></div></div></div></div><div id="dashboard-planner"><div class="planner-day"><h2><span>Today</span></h2><span class="view-text">Nothing planned</span><div class="planner-grouping"><a class="Grouping-styles__hero" style="background:white;color:#254284">Course</a><div class="PlannerItem-styles__details"><a href="#">Assignment</a></div><div class="PlannerItem-styles__badges"><span class="view-text" style="background:white;color:#636d75">Submitted</span></div></div></div></div>`);
 const theme=createGlobalTheme({document:doc});theme.apply({theme:dark,scope:'canvas'});
 assert.equal(dom.window.getComputedStyle(doc.querySelector('.ic-Dashboard-header__layout')).backgroundColor,'rgb(28, 38, 54)');
 assert.equal(dom.window.getComputedStyle(doc.querySelector('.planner-day')).color,'rgb(232, 237, 245)');
 assert.equal(dom.window.getComputedStyle(doc.querySelector('.planner-day h2')).color,'rgb(232, 237, 245)');
 assert.equal(dom.window.getComputedStyle(doc.querySelector('.planner-day > .view-text')).color,'rgb(232, 237, 245)');
 assert.equal(dom.window.getComputedStyle(doc.querySelector('.PlannerItem-styles__details a')).color,'rgb(145, 184, 244)');
 assert.equal(dom.window.getComputedStyle(doc.querySelector('.baseButton__content')).backgroundColor,'rgb(28, 38, 54)');
 assert.equal(dom.window.getComputedStyle(doc.querySelector('.Grouping-styles__hero')).color,'rgb(37, 66, 132)');
 assert.equal(dom.window.getComputedStyle(doc.querySelector('.PlannerItem-styles__badges span')).color,'rgb(99, 109, 117)');
 theme.destroy();dom.window.close();
});
test('dark calendar cards use readable theme text and preserve native course identification',()=>{
 const dom=new JSDOM(html),doc=dom.window.document;
 doc.head.insertAdjacentHTML('beforeend','<style>.fc-title,.fc-time{color:#254284}.fc-bg{background:white}.agenda-event__item{background:white}.agenda-event__title,.agenda-event__icon{color:#008400}</style>');
 doc.querySelector('.fc-event').insertAdjacentHTML('beforeend','<span class="fc-time">2pm</span><span class="fc-title calendar__event--completed">Completed</span><div class="fc-bg"></div>');
 doc.querySelector('#calendar-app').insertAdjacentHTML('beforeend','<div class="agenda-event__item"><i class="agenda-event__icon">Icon</i><span class="agenda-event__title calendar__event--completed">Essay</span><span class="agenda-event__time">2pm</span></div>');
 const theme=createGlobalTheme({document:doc}),native=doc.querySelector('#calendar-app').innerHTML;
 theme.apply({theme:dark,scope:'canvas'});
 const hex=value=>'#'+value.match(/\d+/g).slice(0,3).map(n=>Number(n).toString(16).padStart(2,'0')).join('');
 for(const selector of ['.fc-event','.agenda-event__item']){
  const card=dom.window.getComputedStyle(doc.querySelector(selector));assert.notEqual(card.backgroundColor,'rgb(255, 255, 255)',`${selector} must not retain a white island`);
  const title=dom.window.getComputedStyle(doc.querySelector(selector+' '+(selector==='.fc-event'?'.fc-title':'.agenda-event__title')));
  assert.ok(contrastRatio(hex(title.color),hex(card.backgroundColor))>=4.5,selector+' title contrast');
 }
 assert.equal(dom.window.getComputedStyle(doc.querySelector('.fc-event')).borderLeftColor,'rgb(37, 66, 132)');
 assert.equal(dom.window.getComputedStyle(doc.querySelector('.agenda-event__icon')).color,'rgb(0, 132, 0)');
 assert.equal(dom.window.getComputedStyle(doc.querySelector('.fc-bg')).backgroundColor,'rgba(0, 0, 0, 0)');
 assert.equal(doc.querySelector('#calendar-app').innerHTML,native,'theme must not rewrite event markup or completion classes');
 theme.apply({theme:dark,scope:'planner'});assert.equal(dom.window.getComputedStyle(doc.querySelector('.fc-event')).backgroundColor,'rgb(255, 255, 255)');
 theme.destroy();dom.window.close();
});
test('global navigation has one continuous background with whole-row active feedback',()=>{
 const dom=new JSDOM(html),doc=dom.window.document;
 doc.querySelector('#header').innerHTML='<div class="ic-app-header__logomark-container">Logo</div><ul class="ic-app-header__menu-list"><li class="ic-app-header__menu-list-item"><button class="ic-app-header__menu-list-link"><span class="menu-item__text">Account</span></button></li><li class="ic-app-header__menu-list-item ic-app-header__menu-list-item--active"><a class="ic-app-header__menu-list-link"><span class="menu-item__text">Calendar</span></a></li></ul><div class="ic-app-header__secondary-navigation"><button id="primaryNavToggle">Collapse</button></div>';
 doc.head.insertAdjacentHTML('beforeend','<style>.ic-app-header__logomark-container{background:#13294b}</style>');
 const theme=createGlobalTheme({document:doc});theme.apply({theme:dark,scope:'canvas'});
 const bg=el=>dom.window.getComputedStyle(el).backgroundColor;
 assert.equal(dom.window.getComputedStyle(doc.documentElement).colorScheme,'dark','browser scrollbars should follow the global theme');
 assert.equal(bg(doc.querySelector('#header')),'rgb(17, 24, 39)');
 assert.equal(bg(doc.querySelector('.ic-app-header__logomark-container')),'rgba(0, 0, 0, 0)');
 for(const label of doc.querySelectorAll('#header .menu-item__text'))assert.equal(bg(label),'rgba(0, 0, 0, 0)','labels must not paint separate stripes');
 assert.equal(bg(doc.querySelector('button.ic-app-header__menu-list-link')),'rgba(0, 0, 0, 0)');
 assert.equal(bg(doc.querySelector('#header .ic-app-header__secondary-navigation')),'rgba(0, 0, 0, 0)');
 const active=doc.querySelector('.ic-app-header__menu-list-item--active');assert.notEqual(bg(active),'rgba(0, 0, 0, 0)');assert.equal(bg(active),bg(active.querySelector('a')));
 theme.destroy();dom.window.close();
});
