export const styles = `
  :host { all: initial; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--cp-text); }
  *, *::before, *::after { box-sizing: border-box; }
  .backdrop { position: fixed; inset: 0; z-index: 2147483647; background: rgba(18, 28, 44, .56); display: flex; padding: 22px; }
  .shell { width: min(1420px, 100%); height: 100%; margin: auto; display: flex; flex-direction: column; overflow: hidden; background: var(--cp-bg); border-radius: 18px; box-shadow: 0 24px 90px rgba(0,0,0,.28); }
  .header { display: flex; align-items: center; gap: 14px; padding: 18px 22px; background: var(--cp-surface); border-bottom: 1px solid var(--cp-border); }
  .identity { min-width: 220px; }
  .eyebrow { margin: 0 0 3px; color: var(--cp-muted); font-size: 11px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; }
  h1 { margin: 0; font-size: 23px; line-height: 1.2; color: var(--cp-text); }
  .subline { margin: 5px 0 0; color: var(--cp-muted); font-size: 12px; }
  .controls { margin-left: auto; display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 7px; }
  button { font: inherit; cursor: pointer; }
  .control, .close, .more, .text-button { border: 1px solid var(--cp-input-border); background: var(--cp-surface); color: var(--cp-text); border-radius: 9px; padding: 8px 11px; font-size: 13px; font-weight: 600; }
  .control:hover, .close:hover, .more:hover, .text-button:hover { background: var(--cp-raised); }
  .close { font-size: 20px; line-height: 1; min-width: 37px; }
  .month-name { min-width: 155px; text-align: center; font-weight: 800; font-size: 18px; color: var(--cp-text); }
  .content { overflow: auto; padding: 20px; flex: 1; }
  .tabs { display: flex; gap: 8px; padding: 8px 22px; background: var(--cp-surface); border-bottom: 1px solid var(--cp-border); }
  .tab { border: 0; border-radius: 8px; padding: 9px 16px; background: transparent; color: var(--cp-muted); font-size: 14px; font-weight: 700; }
  .tab[aria-selected=true] { background: var(--cp-accent-soft); color: var(--cp-accent-text); }
  button:disabled { cursor: default; opacity: .6; }
  .settings { max-width: 850px; margin: 0 auto; padding: 20px; background: var(--cp-surface); border: 1px solid var(--cp-border); border-radius: 12px; }
  .settings h2 { margin: 0 0 8px; font-size: 20px; }
  .settings-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0; }
  .calendar-choice { display: flex; align-items: center; gap: 12px; padding: 12px 4px; border-top: 1px solid var(--cp-border); font-size: 14px; }
  .calendar-choice input { width: 18px; height: 18px; flex: none; }
  .calendar-choice .hint { margin: 4px 0 0; }
  .settings > button { margin: 16px 8px 0 0; }
  .status { background: var(--cp-surface); border: 1px solid var(--cp-border); border-radius: 12px; padding: 26px; color: var(--cp-text); }
  .status.error { border-color: var(--cp-error-border); background: var(--cp-error-bg); color:var(--cp-error-text); }
  .loading-title,.calendar-updating { display:flex;align-items:center;gap:10px;font-size:13px;color:var(--cp-muted); }
  .loading-spinner { display:inline-block;width:17px;height:17px;flex:none;border:2px solid var(--cp-border);border-top-color:var(--cp-accent);border-radius:50%;animation:calendar-spin .9s linear infinite; }
  .calendar-skeleton { display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:1px;background:var(--cp-border);border:1px solid var(--cp-border);border-radius:10px;overflow:hidden;margin-top:22px; }
  .skeleton-day { padding:14px 10px;min-height:88px;background:var(--cp-surface); }
  .skeleton-date,.skeleton-event { display:block;border-radius:4px;background:var(--cp-raised);animation:calendar-pulse 1.8s ease-in-out infinite; }
  .skeleton-date { width:22%;height:12px;min-width:10px; }.skeleton-event { width:85%;height:16px;margin-top:16px; }
  .extra-semester-row { display:grid;grid-template-columns:2fr 1fr 1fr;gap:14px;align-items:end;padding:12px 0;border-bottom:1px solid var(--cp-border); }
  @keyframes calendar-spin { to { transform:rotate(360deg); } }
  @keyframes calendar-pulse { 50% { opacity:.35; } }
  @media(prefers-reduced-motion:reduce) { .loading-spinner,.skeleton-date,.skeleton-event { animation:none; } }
  @media(max-width:760px) { .skeleton-day { padding:10px 5px;min-height:64px; }.extra-semester-row { grid-template-columns:1fr 1fr; }.extra-semester-row>.field:first-child { grid-column:1/-1; } }
  .weekday-row { display: grid; grid-template-columns: repeat(7,minmax(0,1fr)); margin: 0 0 8px; color: var(--cp-muted); font-size: 12px; font-weight: 700; text-transform: uppercase; text-align: left; }
  .weekday-row span { padding: 0 10px; }
  .month { border: 1px solid var(--cp-border); border-radius: 12px; overflow: hidden; background: var(--cp-surface); }
  .week { border-top: 1px solid var(--cp-border); min-height: 116px; }
  .week:first-child { border-top: 0; }
  .days { display: grid; grid-template-columns: repeat(7,minmax(0,1fr)); }
  .day { min-height: 35px; text-align: right; padding: 8px 10px 2px; border-left: 1px solid var(--cp-border); color: var(--cp-text); font-size: 13px; font-weight: 700; }
  .day:first-child { border-left: 0; }
  .day.outside { color: var(--cp-muted); background: var(--cp-bg); }
  .day.today { color: var(--cp-on-accent); background: var(--cp-accent); }
  .bars { display: grid; grid-template-columns: repeat(7,minmax(0,1fr)); grid-auto-rows: 26px; gap: 3px 0; padding: 4px 5px 10px; min-height: 66px; }
  .bar { display: flex; align-items: center; gap: 5px; overflow: hidden; white-space: nowrap; text-align: left; border: 0; border-left: 4px solid var(--cp-accent); border-radius: 5px; background: var(--cp-accent-soft); color: var(--cp-accent-text); padding: 3px 7px; font-size: 12px; font-weight: 700; margin: 0 2px; }
  .context-tag { flex: none; max-width: 42%; overflow: hidden; text-overflow: ellipsis; font-size: 10px; opacity: .72; }
  .bar-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .bar:hover, .bar:focus-visible, .bar.highlighted { outline: 2px solid var(--cp-accent); outline-offset: 1px; }
  .bar.completed { background: var(--cp-completed-bg); color: var(--cp-completed-text); border-left-color: var(--cp-completed-border); text-decoration: line-through; }
  .bar.assignment { background: var(--cp-assignment-bg); border-left-color: var(--cp-assignment-accent); color: var(--cp-assignment-text); }
  .bar.assignment.completed { background: var(--cp-completed-bg); border-left-color: var(--cp-completed-border); color: var(--cp-completed-text); }
  .more { grid-column: 1 / -1; justify-self: start; margin: 0 2px; padding: 3px 8px; font-size: 11px; }
  .detail { position: absolute; right: 22px; top: 92px; bottom: 22px; width: min(360px, calc(100vw - 44px)); overflow: auto; background: var(--cp-surface); border: 1px solid var(--cp-border); border-radius: 14px; box-shadow: 0 14px 40px rgba(23,40,63,.23); padding: 20px; }
  .detail-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .detail h2 { margin: 0; font-size: 20px; line-height: 1.3; color: var(--cp-text); }
  .detail p { line-height: 1.5; font-size: 13px; color: var(--cp-muted); }
  .detail dl { margin: 20px 0; display: grid; grid-template-columns: 90px 1fr; gap: 11px 8px; font-size: 13px; }
  .detail dt { color: var(--cp-muted); }
  .detail dd { margin: 0; color: var(--cp-text); font-weight: 600; overflow-wrap: anywhere; }
  .field { display: block; margin: 16px 0; font-size: 13px; font-weight: 700; }
  .field input[type=date] { display: block; width: 100%; margin-top: 7px; padding: 9px; border: 1px solid var(--cp-input-border); border-radius: 8px; color: var(--cp-text); font: inherit; }
  .check { display: flex; align-items: center; gap: 9px; margin: 18px 0; font-size: 14px; font-weight: 700; }
  .check input { width: 18px; height: 18px; }
  .canvas-link { display: inline-block; margin-top: 8px; color: var(--cp-accent-text); font-size: 13px; font-weight: 700; }
  .notice { color: var(--cp-error-on-bg) !important; font-weight: 650; }
  .hint { margin: 8px 0 0; font-size: 12px; color: var(--cp-muted); }
  @media (max-width: 760px) { .backdrop { padding: 0; } .shell { border-radius: 0; } .header { align-items: flex-start; flex-direction: column; padding: 12px; } .controls { margin-left: 0; justify-content: flex-start; } .content { padding: 8px; } .day { padding: 4px; } .bar { font-size: 10px; } .detail { top: 130px; right: 8px; bottom: 8px; } }

  .day { display:flex; flex-direction:column; align-items:flex-start; justify-content:flex-start; gap:4px; min-height:60px; text-align:left; }
  .day-number { font-size:14px; line-height:18px; }
  .pressure-badge { font:600 10px system-ui; border:0; border-radius:5px; padding:3px 6px; min-height:22px; max-width:100%; white-space:nowrap; cursor:pointer; }
  .pressure-badge.empty { background:transparent; color:var(--cp-muted); padding-left:0; font-weight:400; }
  .day.today .pressure-badge.empty { color:var(--cp-on-accent); }
  .pressure-badge:focus-visible { outline:2px solid var(--cp-accent); outline-offset:2px; }
  .day.today .pressure-badge:focus-visible { outline-color:var(--cp-on-accent); }
  @media(max-width:760px) { .pressure-badge { font-size:9px; padding:3px; } }
  .pressure-badge.green { background:var(--cp-success-bg);color:var(--cp-success-text); }.pressure-badge.yellow { background:var(--cp-warning-bg);color:var(--cp-warning-text); }.pressure-badge.red { background:var(--cp-error-bg);color:var(--cp-error-text); }
  .today-summary { font-size:13px;color:var(--cp-muted);margin:0 0 16px; }
  .summary-cards,.form-grid { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:18px 0; }
  .summary-card { display:flex;flex-direction:column;gap:8px;background:var(--cp-raised);border:1px solid var(--cp-border);border-radius:12px;padding:16px; }.summary-card strong{font-size:24px;color:var(--cp-text);}
  .line-chart { background:var(--cp-surface);border:1px solid var(--cp-border);border-radius:12px;padding:16px;margin:16px 0; }.line-chart svg{width:100%;height:auto;display:block;}.line-chart circle{cursor:pointer;}.line-chart circle:focus{outline:2px solid var(--cp-text);}
  .chart-legend{display:flex;gap:16px;font-size:12px;flex-wrap:wrap;}.chart-legend span{padding-left:8px;}.chart-data{margin-top:14px;font-size:12px;}.chart-data table{width:100%;border-collapse:collapse;}.chart-data th,.chart-data td{text-align:left;padding:8px;border-bottom:1px solid var(--cp-border);}
  .view-tools{display:flex;gap:8px;flex-wrap:wrap;}.day-list{margin:16px 0;padding:16px;border:1px solid var(--cp-border);border-radius:12px;background:var(--cp-surface);}.day-list h2{font-size:18px;margin:0 0 14px;}.task-row{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--cp-border);flex-wrap:wrap;}.task-title{border:0;background:transparent;text-align:left;font-weight:700;color:var(--cp-accent-text);cursor:pointer;}
  .planning-settings{margin-top:32px;border-top:1px solid var(--cp-border);padding-top:24px;}.planning-settings h2,.workload-view h2{margin:0;font-size:22px;}.planning-settings h3{font-size:16px;margin-top:24px;}
  .field input,.field select { display:block;width:100%;padding:8px;margin-top:5px;border:1px solid var(--cp-input-border);border-radius:7px;font:inherit;color:var(--cp-text);background:var(--cp-surface);box-sizing:border-box; }.field input[type=checkbox]{width:18px;height:18px;}.field{margin:8px 0;}
  .rule-card{display:grid;grid-template-columns:55px 1fr 1fr 1.5fr 85px auto auto auto;gap:8px;align-items:end;background:var(--cp-bg);padding:12px;border-radius:10px;margin-bottom:8px;}.rule-card .field{font-size:11px;}.estimate-preview{background:var(--cp-assignment-bg);color:var(--cp-assignment-text);padding:12px;border-radius:8px;margin:12px 0;}.schedule-settings{margin:20px 0;}.schedule-row{display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--cp-border);}.schedule-row strong{min-width:90px;}.schedule-row .field{max-width:140px;font-size:12px;}.success{color:var(--cp-success-message);}
  @media(max-width:900px){.rule-card{grid-template-columns:repeat(3,minmax(0,1fr));}.summary-cards,.form-grid{grid-template-columns:1fr;}.schedule-row{flex-wrap:wrap;}.line-chart{padding:8px;}}

  .plan-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}.plan-toolbar select,.task-pool>input,.task-pool>select,.view-tools select{font:inherit;font-size:12px;border:1px solid var(--cp-input-border);border-radius:7px;padding:8px;background:var(--cp-surface);color:var(--cp-text);}
  .plan-columns{display:grid;grid-template-columns:minmax(250px,.8fr) minmax(0,1.7fr);gap:20px;margin-top:20px;}.task-pool{background:var(--cp-raised);border:1px solid var(--cp-border);border-radius:12px;padding:16px;align-self:start;}.task-pool>input,.task-pool>select{display:block;width:100%;margin-bottom:8px;box-sizing:border-box;}.task-pool h3,.daily-plan h3{margin:0 0 14px;font-size:17px;}.pool-card{background:var(--cp-surface);border:1px solid var(--cp-border);border-radius:9px;padding:12px;margin:10px 0;}.pool-card[draggable=true]{cursor:grab;}.pool-card.urgency-red{border-left:4px solid var(--cp-error-border);}.pool-card.urgency-yellow{border-left:4px solid var(--cp-warning-border);}.urgency-tag{display:inline-block;font-size:10px;border-radius:12px;padding:4px 7px;background:var(--cp-border);color:var(--cp-muted);}.urgency-tag.red{background:var(--cp-error-bg);color:var(--cp-error-text);}.urgency-tag.yellow{background:var(--cp-warning-bg);color:var(--cp-warning-text);}
  .plan-day{border:1px solid var(--cp-border);background:var(--cp-surface);border-radius:10px;margin-bottom:10px;padding:12px;}.plan-day>summary{font-weight:700;font-size:13px;cursor:pointer;color:var(--cp-text);}.planned-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px 0;border-bottom:1px solid var(--cp-border);}.planned-row.completed,.completed{text-decoration:line-through;color:var(--cp-muted);}.plan-status{padding:14px;background:var(--cp-raised);border-radius:10px;margin:14px 0;display:flex;flex-wrap:wrap;gap:12px;font-size:13px;}.plan-status details{width:100%;}.plan-configuration,.comparison-picker{margin:14px 0;border:1px solid var(--cp-border);border-radius:10px;padding:14px;}.plan-configuration>summary,.comparison-picker>summary{cursor:pointer;font-weight:700;font-size:13px;}.arrange-editor{padding:18px;background:var(--cp-accent-soft);border:1px solid var(--cp-border);border-radius:12px;margin:16px 0;}.arrange-editor .field{display:inline-block;margin-right:12px;}.arrange-editor h3{margin-top:0;}.arrange-editor button{margin-right:8px;}.draft-dialog{position:sticky;bottom:8px;padding:20px;background:var(--cp-surface);border:2px solid var(--cp-assignment-accent);border-radius:12px;box-shadow:0 8px 30px #243a5633;z-index:2;}.draft-dialog button{margin-right:10px;}.empty-state{padding:50px 20px;color:var(--cp-muted);text-align:center;}
  .plan-day .arrange-editor{padding:14px;margin:10px 0 0;box-sizing:border-box;}.planned-row .arrange-editor{flex-basis:100%;min-width:0;}.arrange-editor input{max-width:100%;box-sizing:border-box;}
  @media(max-width:800px){.plan-columns{grid-template-columns:1fr;}.task-pool{max-height:480px;overflow:auto;}}
  .task-agenda h2{margin:0 0 16px;font-size:22px;}.task-presets{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;}.task-presets button[aria-pressed=true]{background:var(--cp-accent);color:var(--cp-on-accent);border-color:var(--cp-accent);}
  .task-filters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px 16px;padding:12px 16px;background:var(--cp-raised);border:1px solid var(--cp-border);border-radius:12px;align-items:end;}.task-filters .field{font-size:12px;}.task-history{display:flex;align-items:center;gap:12px;margin:12px 0;}.task-range{font-size:12px;margin:12px 0;padding:12px;border:1px solid var(--cp-border);border-radius:10px;}.task-range summary{cursor:pointer;font-weight:700;}.task-range .field{display:inline-block;max-width:220px;margin-right:12px;}
  .task-agenda>label{display:flex;align-items:center;gap:10px;font-size:12px;}.task-agenda>label input{margin:0;width:18px;height:18px;}.task-bulk{position:sticky;top:0;z-index:1;border:1px solid var(--cp-border);box-shadow:0 5px 18px #243a5614;background:var(--cp-accent-soft);padding:14px 18px;border-radius:12px;margin:12px 0;}.task-bulk strong{display:block;margin-bottom:10px;}.task-bulk .view-tools{align-items:end;margin:4px 0;}.task-bulk .field{font-size:12px;max-width:200px;}
  .task-group h3{font-size:14px;color:var(--cp-muted);margin:24px 0 8px;}.agenda-row{display:grid;grid-template-columns:20px minmax(180px,1fr) minmax(180px,.7fr) 130px;align-items:center;gap:16px;padding:14px;border:1px solid var(--cp-border);border-radius:10px;margin:8px 0;background:var(--cp-surface);}.agenda-row.selected{background:var(--cp-accent-soft);border-color:var(--cp-border);}.agenda-row input[type=checkbox]{width:18px;height:18px;accent-color:var(--cp-accent);}.agenda-title{min-width:0;overflow-wrap:anywhere;}.agenda-title .task-title{font-size:14px;padding:0;}.agenda-meta,.agenda-status{display:flex;flex-direction:column;align-items:start;gap:5px;font-size:12px;}.agenda-meta span:nth-child(odd){color:var(--cp-muted);}.agenda-row.completed{text-decoration:none;}.agenda-row.completed .task-title{text-decoration:line-through;color:var(--cp-muted);}.today-summary button{margin-left:12px;}
  @media(max-width:800px){.task-filters{grid-template-columns:repeat(2,minmax(0,1fr));}.agenda-row{grid-template-columns:20px minmax(0,1fr);gap:10px;}.agenda-meta,.agenda-status{grid-column:2;}.task-bulk{position:static;}.task-history{flex-wrap:wrap;}}

  .task-filters { grid-template-columns:minmax(200px,1.5fr) minmax(180px,1fr) auto;background:transparent;border:0;padding:0; }
  .task-more-filters { align-self:center; }.task-more-filters>summary,.bulk-more-actions>summary { cursor:pointer;font-size:13px;padding:8px;color:var(--cp-muted); }
  .task-more-filters[open] { grid-column:1/-1; }.advanced-filter-fields { display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;padding:12px 0;border-top:1px solid var(--cp-border); }
  .active-task-filters { display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 12px; }.active-task-filters:empty { display:none; }.filter-chip { background:var(--cp-raised);padding:4px 8px;border-radius:5px;font-size:12px;color:var(--cp-muted); }
  .task-bulk strong { margin:0; }.task-bulk { padding:10px 14px;box-shadow:none; }.task-bulk>.view-tools:first-of-type { margin-top:8px; }.bulk-more-actions { font-size:12px; }.bulk-more-actions[open] { padding-bottom:8px; }
  .primary { background:var(--cp-accent);color:var(--cp-on-accent);border-color:var(--cp-accent); }.primary:hover { background:var(--cp-accent-hover);color:var(--cp-on-accent); }
  @media(max-width:800px) { .task-filters { grid-template-columns:1fr; }.advanced-filter-fields { grid-template-columns:repeat(2,minmax(0,1fr)); }.task-more-filters[open] { grid-column:auto; } }

  .plan-more-actions { margin-left:auto;position:relative;font-size:13px; }.plan-more-actions>summary { cursor:pointer;padding:8px;color:var(--cp-muted); }.plan-more-actions[open] { padding:0 8px 8px;background:var(--cp-raised);border-radius:8px; }
  .plan-analytics { border-top:1px solid var(--cp-border);margin-top:24px;padding-top:14px; }.plan-analytics>summary { display:list-item;cursor:pointer;font-size:14px;font-weight:600; }.plan-analytics>summary .hint { margin-left:14px;font-weight:400; }
  .draft-notice { color:var(--cp-warning-message);font-size:12px;margin:4px 0 12px; }.generated-preview { border-left:3px solid var(--cp-success-text);padding:12px 16px;margin:16px 0;background:var(--cp-success-bg);color:var(--cp-success-text); }.generated-preview h3 { margin-top:0; }
  .plan-toolbar { align-items:center; }.planner-workbench>.field { max-width:420px; }.plan-columns { margin-top:16px; }

  .header { padding:12px 20px; }.identity .eyebrow,.identity .subline { display:none; }h1 { font-size:20px; }.tabs { padding:6px 20px; }.content { padding:16px 20px; }.toolbar-context { color:var(--cp-muted);font-size:12px; }
  .control,.close,.more { border-radius:6px; }.text-button { border-color:transparent;background:transparent;padding:6px 8px;font-weight:500; }
  .agenda-row { border:0;border-bottom:1px solid var(--cp-border);border-radius:0;margin:0;padding:12px 4px;background:transparent; }.task-group { background:transparent; }.agenda-row.selected { background:var(--cp-accent-soft); }.agenda-meta { gap:3px; }
  .task-pool { background:transparent;padding:0 16px 0 0;border:0;border-right:1px solid var(--cp-border);border-radius:0; }.pool-card { background:transparent;border:0;border-bottom:1px solid var(--cp-border);border-radius:0;padding:12px 4px;margin:0; }.plan-day { border-radius:6px;padding:10px 12px; }.plan-status { padding:10px 12px;margin:10px 0;background:var(--cp-raised); }.plan-configuration,.comparison-picker { border:0;border-bottom:1px solid var(--cp-border);padding:10px 0;border-radius:0; }
  .scheduled-task-pool { margin-top:14px;border-top:1px solid var(--cp-border);padding-top:12px; }.scheduled-task-pool>summary { cursor:pointer;font-weight:700;font-size:13px;color:var(--cp-muted); }
  .detail-planning-options { border-top:1px solid var(--cp-border);margin-top:18px;padding-top:12px; }.detail-planning-options>summary,.settings-section>summary { cursor:pointer;font-size:14px;font-weight:600;color:var(--cp-text); }.detail-planning-options[open]>summary { margin-bottom:14px; }
  .settings { padding:16px 20px;border:0; }.settings-section { padding:14px 0;border-top:1px solid var(--cp-border);margin:0; }.settings-section[open]>summary { margin-bottom:12px; }.planning-settings>h2 { font-size:18px; }.planning-settings { margin-top:24px;padding-top:20px; }.calendar-choice { padding:8px 0; }.calendar-choice .hint { font-size:11px; }
  .detail dl { margin:14px 0; }.detail { padding:18px; }.line-chart { border:0;background:transparent;padding:8px 0; }.notice { font-size:13px; }.success { font-size:13px; }
  @media(max-width:800px) { .task-pool { border-right:0;padding:0;border-bottom:1px solid var(--cp-border); }.content { padding:12px; }.header { padding:12px; }.toolbar-context { overflow-wrap:anywhere; }.tabs { padding:6px 10px;gap:2px;overflow:auto; }.tab { padding:8px 10px;white-space:nowrap; } }

  button:focus-visible, summary:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible { outline:2px solid var(--cp-accent);outline-offset:2px; }
  input { accent-color:var(--cp-accent); }
  input::placeholder { color:var(--cp-muted);opacity:1; }
  .theme-settings { padding:14px 0 20px;margin-bottom:18px;border-bottom:1px solid var(--cp-border); }
  .theme-settings>.field { max-width:340px; }
  .theme-preview { display:flex;align-items:center;gap:6px;width:120px;margin:12px 0;padding:8px;background:var(--cp-bg);border:1px solid var(--cp-border);border-radius:8px; }
  .theme-preview span { display:block;width:28px;height:20px;border-radius:4px; }
  .theme-preview-surface { background:var(--cp-surface);border:1px solid var(--cp-border); }
  .theme-preview-accent { background:var(--cp-accent); }
  .theme-preview-text { background:var(--cp-text); }
  .theme-color-grid { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 18px;margin:12px 0; }
  .theme-color-pair { display:flex;align-items:center;gap:8px; }
  .theme-color-pair input[type=color] { flex:none;width:44px;height:38px;padding:3px;cursor:pointer; }
  .theme-color-pair input[type=text] { min-width:0;font-family:ui-monospace,monospace; }
  .theme-notice:empty { display:none; }
  .theme-notice { color:var(--cp-error-message);font-size:13px;font-weight:650; }
  .settings .notice,.detail .notice,.draft-dialog .notice,.plan-day .notice { color:var(--cp-error-message) !important; }
  .success { color:var(--cp-success-on-bg); }
  .settings .success,.plan-status .success { color:var(--cp-success-message); }
  .draft-notice { color:var(--cp-warning-on-bg); }
  .generated-preview .hint { color:var(--cp-success-text); }
  .generated-preview .notice { color:var(--cp-preview-error) !important; }
  .line-chart { color:var(--cp-text);background:var(--cp-bg);--cp-muted:var(--cp-chart-label); }
  .generated-preview .line-chart { padding:12px;border-radius:8px; }
  [hidden] { display:none !important; }
  .plan-columns { grid-template-columns:minmax(240px,300px) minmax(0,1fr);align-items:start; }
  .task-pool { height:clamp(440px,66vh,760px);overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable; }
  .pool-card .task-title { overflow-wrap:anywhere; }.pool-card .hint { overflow-wrap:anywhere;font-size:11px; }
  .task-pagination { position:sticky;top:0;z-index:3;background:var(--cp-bg);display:flex;align-items:center;justify-content:space-between;gap:6px;padding:10px 0; }.task-pagination .hint { font-size:11px;text-align:center; }
  .daily-plan { min-width:0; }.week-toolbar { display:flex;align-items:center;gap:6px;flex-wrap:wrap; }.week-toolbar h3 { margin:0 auto 0 0; }.week-toolbar .control { padding:5px 9px;font-size:12px; }.week-range { font-size:12px;font-weight:600; }.week-instructions { font-size:11px;margin:8px 0; }
  .week-scroll { height:clamp(420px,60vh,680px);overflow:auto;overscroll-behavior:contain;border:1px solid var(--cp-border);border-radius:8px;background:var(--cp-bg);scrollbar-gutter:stable; }
  .week-grid { display:grid;grid-template-columns:52px repeat(7,minmax(108px,1fr));min-width:808px; }
  .week-corner,.week-day-header { position:sticky;top:0;height:64px;background:var(--cp-surface);z-index:5;border-bottom:1px solid var(--cp-border);padding:10px 5px; }.week-corner { left:0;z-index:7;font-size:11px;color:var(--cp-muted); }.week-day-header { text-align:center;border-left:1px solid var(--cp-border); }.week-day-header strong { display:block;font-size:12px; }.week-day-header .hint { display:block;font-size:10px;margin-top:5px;white-space:nowrap; }.week-day-header.is-today strong { color:var(--cp-assignment-accent); }
  .week-time-axis { position:sticky;left:0;z-index:4;background:var(--cp-bg);height:2304px; }.week-hour { height:96px;padding:2px 5px;font-size:10px;color:var(--cp-muted);text-align:right;border-top:1px solid var(--cp-border); }
  .week-day-lane { position:relative;height:2304px;border-left:1px solid var(--cp-border);background:repeating-linear-gradient(to bottom,var(--cp-border) 0 1px,transparent 1px 96px); }.week-day-lane.is-today { background-color:var(--cp-accent-soft); }.outside-plan { opacity:.55;background-color:var(--cp-raised); }
  .week-drop-slot { position:absolute;height:24px;left:0;right:0;border-bottom:1px dotted color-mix(in srgb,var(--cp-border) 45%,transparent); }.week-drop-slot:hover { background:var(--cp-accent-soft); }
  .week-drop-marker { position:absolute;left:0;right:0;height:2px;background:var(--cp-accent);z-index:8;pointer-events:none;font-size:10px;font-weight:700;color:var(--cp-accent);text-align:right; }
  .week-block { position:absolute;z-index:2;padding:2px 4px;border:1px solid var(--cp-assignment-accent);border-left:3px solid var(--cp-assignment-accent);border-radius:4px;background:var(--cp-accent-soft);color:var(--cp-text);min-width:0; }.week-block[draggable=true] { cursor:grab; }.week-block.locked { border-style:dashed; }.week-block.urgency-yellow { border-left-color:var(--cp-warning-border); }.week-block.urgency-red { border-left-color:var(--cp-error-border); }.week-block.fixed-block { background:var(--cp-raised);border-color:var(--cp-muted); }
  .week-block-title,.week-block .task-title { display:block;width:100%;border:0;background:none;color:inherit;font:inherit;font-size:11px;font-weight:600;line-height:14px;padding:0 16px 0 0;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer; }.week-block-time { display:block;font-size:9px;line-height:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none; }.week-block.completed .week-block-title { text-decoration:line-through; }
  .week-block-actions { position:absolute;right:2px;top:0; }.week-block-actions>summary { list-style:none;cursor:pointer;font-size:14px;line-height:14px;padding:0 2px; }.week-block-actions>summary::-webkit-details-marker { display:none; }.week-block:has(.week-block-actions[open]) { z-index:9; }.week-block-menu { position:absolute;right:0;top:18px;width:200px;background:var(--cp-surface);border:1px solid var(--cp-border);border-radius:6px;padding:8px;box-shadow:0 6px 20px #0004; }.week-block-menu .task-title { white-space:normal;overflow-wrap:anywhere;margin-bottom:6px; }.week-block-menu .text-button { padding:5px;font-size:11px; }.week-selected-editor { margin:8px 0;padding:10px; }.week-selected-editor h3 { font-size:13px; }.week-selected-editor .field { font-size:11px; }.week-selected-editor input { padding:5px; }.week-selected-editor .hint { font-size:11px; }
  .plan-editor-header { display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap; }.plan-editor-header h3 { margin:0;min-width:0;overflow-wrap:anywhere;flex:1 1 180px; }.plan-editor-header .plan-completion-button { margin:0;flex-shrink:0; }.plan-completion-hint { margin:6px 0 12px; }.plan-completion-error { margin:8px 0; }
  .week-block.completed { text-decoration:none;background:var(--cp-completed-bg);border-color:var(--cp-completed-border);color:var(--cp-completed-text); }.week-block.completed .week-block-title { padding-right:32px; }.week-block.completed .week-block-time { color:var(--cp-text);text-decoration:none; }.week-block-completed { position:absolute;right:20px;top:1px;font-size:11px;font-weight:700;line-height:14px;pointer-events:none; }.fixed-block .week-block-completed { right:4px; }
  @media(max-width:800px) { .plan-columns { grid-template-columns:1fr; }.task-pool { height:350px;max-height:none;padding:0 0 12px; }.week-scroll { height:520px; }.week-range { width:100%; } }
  @media(max-width:600px) { .theme-color-grid { grid-template-columns:1fr; } }
`;
