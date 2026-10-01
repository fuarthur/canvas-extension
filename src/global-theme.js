import {normalizeTheme,themePalette,readableColor} from './themes.js';

export function canvasThemePalette(theme,systemDark=false){
 const {scheme,variables:base}=themePalette(theme,systemDark),variables={...base};
 for(const background of ['bg','surface']){
  for(const [kind,color] of [['text',base.text],['muted',base.muted],['link',base.accent],['focus',base.accent]]){
   variables[`${kind}-on-${background}`]=readableColor(color,base[background],kind==='focus'?3:4.5);
  }
 }
 variables['control-border']=readableColor(base['input-border'],base.surface,3);
 return {scheme,variables};
}

// Protect both the information-bearing element and any nested UI-like classes.
const protectedRegions=[
 '.Grouping-styles__hero','.PlannerItem-styles__badges',
 '.user_content','.mce-content-body','.tox','.CodeMirror','pre','code',
 '.fc-event','.agenda-event__item','.context-list-toggle-box',
 '.ic-DashboardCard__header_image','.ic-DashboardCard__header_hero','.ic-DashboardCard__header-title',
 '.ic-DashboardCard__header-button','.ic-DashboardCard__header_color',
 '.alert-success','.alert-error','.alert-danger','.alert-warning','.alert-info',
 '.ic-flash-success','.ic-flash-error','.ic-flash-warning','[role="alert"]',
 '.text-success','.text-error','.text-warning','.label-success','.label-important','.label-warning',
 '.submission_status','.submission-status','.gradebook-status','.completion_status',
 '.complete_icon','.in_progress_icon','.locked_icon','.icon-publish','.icon-unpublish',
 'svg','canvas','img','video','iframe'
];
const safe=protectedRegions.map(s=>`:not(${s}):not(${s} *)`).join('');
const root='html[data-canvas-planning-theme]';
const selector=values=>values.map(value=>`${root} ${value}${safe}`).join(',\n');
const rule=(values,body)=>`${selector(values)}{${body}}`;

export function globalThemeCss(theme,systemDark=false){
 const {scheme,variables:v}=canvasThemePalette(theme,systemDark);
 const eventText=readableColor(v.text,v.raised);
 const surface=`background-color:${v.surface}!important;color:${v['text-on-surface']}!important;border-color:${v.border}!important;`;
 const bg=`background-color:${v.bg}!important;color:${v['text-on-bg']}!important;`;
 const neutralButtons=['.btn','.Button','.ui-button','#minical .fc-button','#dashboard-planner-header button','#dashboard-planner-header button [class*="baseButton__content"]'];
 const inputs=['input:not([type="color"]):not([type="checkbox"]):not([type="radio"]):not([type="range"])','select','textarea','.ic-Input','.ic-Select'];
 const links=['#section-tabs a','#breadcrumbs a','.ig-title','.ig-info a','.item-group-condensed a','.ic-Table a','.ic-DashboardCard__action','.ic-DashboardCard__header_content a','#right-side a:not(.fc-event)','.PlannerItem-styles__details a','.PlannerItem-styles__title button','.planner-completed-items button'];
 const surfaces=['.ic-Dashboard-header','.ic-Dashboard-header__layout','#dashboard-planner-header','.PlannerHeader','.ic-app-nav-toggle-and-crumbs','#breadcrumbs','.header-bar','.header-bar-container','.ic-Action-header','.ig-header','.ig-row','.ig-list','.item-group-condensed','.ic-DashboardCard','.ic-DashboardCard__header_content','.ic-DashboardCard__action-container','.ic-Table','.ic-Table th','.ic-Table td','.table th','.table td','#grades_summary','.student_assignment','.discussions-index-container','.discussion-topic','.communication_message','.conversations .panel','.ui-dialog','.ui-dialog-titlebar','.ui-dialog-content','.ui-dialog-buttonpane','.ui-datepicker','.ui-datepicker-header','.ui-datepicker-calendar','.ui-menu','.ui-menu-item','.dropdown-menu','.popover','.dropdown-menu .menu-item__text','.ui-menu .menu-item__text','.ic-notification','#minical','#calendar-list-holder','#calendars-context-list'];
 const titles=['#dashboard_header_container [class*="view-heading"]','.planner-day','.planner-day h2','.planner-day h2 span','.planner-day [class*="view-text"]','.ig-header-title','.ig-header-title .name','.ig-info','.ig-info .module-item-title','.assignment-title','.assignment-name','#calendar_header h2','#calendar_header h2 button','#minical h2'];
 const muted=['.planner-day .PlannerItem-styles__type','.planner-day .PlannerItem-styles__type span','.planner-day .PlannerItem-styles__metrics','.planner-day .PlannerItem-styles__metrics span','.ig-details','.ig-details .due_date_display','.points_possible','.muted','.ic-Table caption','.ic-Form-help-text'];
 // Each neutral label uses the background of its containing UI, including opposite custom colors.
 const withinSurface=values=>values.map(value=>`:is(${surfaces.join(',')}) ${value}`);
 const focus=neutralButtons.concat(inputs,links).map(value=>`${value}:focus-visible`);
 return `
${root}{background-color:${v.bg}!important;color-scheme:${scheme};${['bg','surface','text','accent'].map(k=>`--cp-canvas-${k}:${v[k]};`).join('')}}
${rule(['body','#wrapper','#main','#content','#not_right_side','#right-side','.ic-app-main-content','.ic-Layout-wrapper','.ic-Layout-contentMain','.ic-Layout-columns'],bg)}
${rule(['#header','.ic-app-header'],bg)}
${rule(['#header .ic-app-header__logomark-container','#header .ic-app-header__secondary-navigation','#header #primaryNavToggle','#header .ic-app-header__menu-list','#header .ic-app-header__menu-list-item','#header .ic-app-header__menu-list-link','#header .menu-item__text'],`background-color:transparent!important;background-image:none!important;box-shadow:none!important;`)}
${rule(['#header .ic-app-header__menu-list-link','#header .ic-app-header__menu-list-link .menu-item__text','#primaryNavToggle'],`color:${v['text-on-bg']}!important;`)}
${root} #header .ic-icon-svg{fill:${v['text-on-bg']}!important;}
${root} #header .ic-app-header__menu-list-item--active .ic-icon-svg{fill:${readableColor(v.accent,v['accent-soft'])}!important;}
${rule(['#header .ic-app-header__menu-list-item--active','#header .ic-app-header__menu-list-item--active .ic-app-header__menu-list-link','#section-tabs .active','#section-tabs .active a'],`background-color:${v['accent-soft']}!important;color:${readableColor(v.accent,v['accent-soft'])}!important;`)}
${rule(['#header .ic-app-header__menu-list-item--active .menu-item__text'],`color:${readableColor(v.accent,v['accent-soft'])}!important;`)}
${rule(['#header .ic-app-header__menu-list-item:not(.ic-app-header__menu-list-item--active) .ic-app-header__menu-list-link:hover'],`background-color:${v.surface}!important;`)}
${rule(['#header .ic-app-header__menu-list-link:focus-visible'],`outline:2px solid ${v['focus-on-bg']}!important;outline-offset:-3px;`)}
${rule(surfaces,surface)}
${rule(['.ig-row:hover','.ic-Table tr:hover td','.table tr:hover td','.ui-menu-item:hover','.dropdown-menu li:hover'],`background-color:${v.raised}!important;`)}
${rule(links,`color:${v['link-on-bg']}!important;`)}
${rule(withinSurface(links),`color:${v['link-on-surface']}!important;`)}
${rule(titles,`color:${v['text-on-bg']}!important;`)}
${rule(withinSurface(titles),`color:${v['text-on-surface']}!important;`)}
${rule(muted,`color:${v['muted-on-bg']}!important;`)}
${rule(withinSurface(muted),`color:${v['muted-on-surface']}!important;`)}
${rule(neutralButtons.concat(inputs),`${surface}background-image:none!important;border-color:${v['control-border']}!important;color-scheme:${scheme};box-shadow:none!important;`)}
${rule(neutralButtons.map(s=>`${s}:hover`),`background-color:${v.raised}!important;color:${readableColor(v.text,v.raised)}!important;`)}
${rule(['.btn.active','.Button[aria-pressed="true"]','.btn-primary','.Button--primary','.ui-state-active'],`background-color:${v.accent}!important;color:${v['on-accent']}!important;border-color:${v.accent}!important;`)}
${rule(neutralButtons.concat(inputs).map(s=>`${s}:disabled`),`color:${v['muted-on-surface']}!important;background-color:${v.surface}!important;opacity:.7;`)}
${rule(focus,`outline:2px solid ${v['focus-on-bg']}!important;outline-offset:2px;`)}
${rule(withinSurface(focus),`outline-color:${v['focus-on-surface']}!important;`)}
${rule(['#calendar-app .fc-widget-header','#calendar-app .fc-widget-content','#calendar-app .fc-day','#calendar-app .fc-day-top','#calendar-app .fc-time-grid','#calendar-app .fc-axis','#calendar-app .fc-divider','#calendar-app .agenda-day','#calendar-app .agenda-event__list','#minical','#minical .fc-widget-header','#minical .fc-widget-content','#calendar-list-holder','#calendars-context-list','.agenda-date','.agenda-day__header'],surface)}
${rule(['#calendar-app .fc-today','#calendar-app .fc-day-top.fc-today','#minical .today'],`background-color:${v['accent-soft']}!important;color:${readableColor(v.text,v['accent-soft'])}!important;`)}
${rule(['#calendar-app .fc-day-number','#calendar-app .fc-day-header','#calendar-app .fc-axis','#minical .day','#minical .fc-day-number'],`color:${v['text-on-surface']}!important;`)}
${rule(['#calendar-app .fc-other-month','#minical .other-month'],`color:${v['muted-on-surface']}!important;`)}
${scheme==='dark'?`
/* Keep native course-color borders and agenda icons; the reading surface follows the theme. */
${root} #calendar-app .fc-event,${root} #calendar-app .agenda-event__item{background-color:${v.raised}!important;color:${eventText}!important;color-scheme:dark;}
${root} #calendar-app .fc-event{border-left-width:3px!important;}
${root} #calendar-app .fc-event .fc-content,${root} #calendar-app .fc-event .fc-title,${root} #calendar-app .fc-event .fc-time,${root} #calendar-app .agenda-event__title,${root} #calendar-app .agenda-event__time{color:${eventText}!important;}
${root} #calendar-app .fc-event .fc-bg{background-color:transparent!important;}
`:''}
${root} .user_content,${root} .mce-content-body{background-color:#ffffff;color:#273540;color-scheme:light;}
${root}{--cp-native-completed-bg:${v['completed-bg']};--cp-native-completed-text:${v['completed-text']};--cp-native-completed-border:${v['completed-border']};}
`;
}

export function createGlobalTheme({document}){
 let style=null,activeRoot=null,previousMark=null,lastMark=null;
 function remove(){
  style?.remove();style=null;
  if(activeRoot?.getAttribute('data-canvas-planning-theme')===lastMark){
   if(previousMark===null)activeRoot.removeAttribute('data-canvas-planning-theme');else activeRoot.setAttribute('data-canvas-planning-theme',previousMark);
  }
  activeRoot=null;lastMark=null;
 }
 return {
  apply(appearance,systemDark=false){
   if(appearance?.scope!=='canvas'){remove();return;}
   const docRoot=document.documentElement;if(!docRoot)return;
   if(activeRoot!==docRoot){remove();activeRoot=docRoot;previousMark=docRoot.getAttribute('data-canvas-planning-theme');}
   if(!style){style=document.createElement('style');style.id='canvas-planning-global-theme-style';(document.head||docRoot).append(style);}
   style.textContent=globalThemeCss(appearance.theme,systemDark);
   lastMark=normalizeTheme(appearance.theme).preset;docRoot.setAttribute('data-canvas-planning-theme',lastMark);
  },
  destroy:remove
 };
}
