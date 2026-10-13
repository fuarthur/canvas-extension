// Shared interface layer: Telegram-style grouped rows and semantic theme colors.
// Calendar/timeline geometry stays in styles.js; these rules define the shell,
// controls and information hierarchy shared by every view.
export const interfaceStyles = `
  :host { --cp-radius:12px; --cp-space:8px; font-size:14px; line-height:1.5; }
  .shell { position:relative; border:1px solid var(--cp-border); border-radius:20px; }
  .header { min-height:72px; padding:16px 24px; gap:12px;flex-direction:row;align-items:center; }
  .identity { display:flex;align-items:center;gap:12px;min-width:0; }
  .identity h1 { font-size:19px;letter-spacing:-.5px;font-weight:700; }
  .brand-icon { display:grid;place-items:center;width:36px;height:36px;flex:none;border-radius:11px;background:var(--cp-accent);color:var(--cp-on-accent); }
  .ui-icon { width:19px;height:19px;flex:none;vertical-align:middle; }
  .brand-icon .ui-icon { width:22px;height:22px; }
  .control,.close,.more,.text-button { min-height:36px;border-radius:9px;font-weight:550; }
  .control { border-color:var(--cp-border);padding:8px 12px; }
  .primary { border-color:var(--cp-accent); }
  .icon-button,.close { display:inline-flex;align-items:center;justify-content:center;width:36px;padding:6px;border-color:transparent;background:transparent; }
  .controls { gap:6px;margin-left:auto;justify-content:flex-end; }
  .month-name { min-width:145px;font-size:16px;font-weight:650; }
  .tabs { gap:4px;padding:0 24px 12px;border-bottom:1px solid var(--cp-border); }
  .tab { display:flex;align-items:center;justify-content:center;gap:8px;padding:9px 15px;border-radius:9px;font-size:13px;font-weight:600;min-height:38px; }
  .tab:hover { background:var(--cp-raised); }
  .tab[aria-selected=true] { background:var(--cp-accent-soft);color:var(--cp-accent-text); }
  .tab:last-child { margin-left:auto; }
  .content { padding:20px 24px 28px;scroll-padding:24px; }
  .content:has(.settings) { padding-bottom:0; }
  .content h2 { font-size:20px;letter-spacing:-.4px; }
  .hint { line-height:1.5;font-size:12px; }
  .hint:empty,.notice:empty,.success:empty { display:none; }
  .field { font-weight:550;line-height:1.5;min-width:0; }
  .field input,.field select,.task-pool>input,.task-pool>select,.plan-toolbar select { border-color:var(--cp-border);min-height:38px;border-radius:8px;font-weight:400;max-width:100%; }
  input:focus,select:focus { border-color:var(--cp-accent); }
  .field:has(>input[type=checkbox]) { display:flex;align-items:center;justify-content:space-between;gap:16px; }
  .field input[type=checkbox] { flex:none;min-height:0;width:18px;height:18px;margin:0; }
  .today-summary { display:flex;align-items:center;gap:12px;margin:0 0 18px;padding:0;font-size:13px;color:var(--cp-muted); }
  .today-summary button { margin:0;min-height:30px;font-size:12px; }
  .overdue-shortcut { border:0;border-radius:20px;padding:5px 10px;background:var(--cp-error-bg);color:var(--cp-error-text); }
  .calendar-board { overflow-x:auto;padding:3px; }
  .weekday-row { margin-bottom:8px;font-size:11px;letter-spacing:.04em; }
  .weekday-row span { padding-left:12px; }
  .month { border-radius:var(--cp-radius); }
  .day { display:flex;align-items:center;justify-content:space-between;min-height:40px;padding:7px 12px; }
  .day.today { background:var(--cp-accent-soft);color:var(--cp-accent-text); }
  .day.today .day-number { display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--cp-accent);color:var(--cp-on-accent); }
  .pressure-badge { min-width:22px;min-height:22px;padding:2px 6px;border-radius:7px;font-size:11px;line-height:18px;margin:0; }
  .bars { grid-auto-rows:27px;gap:4px 0; }
  .bar { border-radius:5px;font-weight:550;border-left-width:3px;padding-left:7px; }
  .more { min-height:26px;background:transparent;border-color:transparent;color:var(--cp-accent-text); }
  .settings { max-width:850px;padding:0;background:transparent;border:0; }
  .settings-heading { display:flex;align-items:center;justify-content:space-between;margin:0 0 16px; }
  .settings-heading h2 { margin:0; }
  .general-settings { padding:18px 20px;margin-bottom:16px;background:var(--cp-surface);border:1px solid var(--cp-border);border-radius:var(--cp-radius); }
  .settings-group-heading { display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px; }
  .settings-group-heading h3 { margin:0;font-size:14px;font-weight:650; }
  .general-settings>.field,.theme-settings>.field { display:grid;grid-template-columns:1fr minmax(160px,240px);align-items:center;gap:16px;max-width:none;margin:0;padding:8px 0; }
  .general-settings .field select { margin:0; }
  .theme-settings { margin:0;padding:0;border:0; }
  .theme-scope-options { font-size:12px;padding:10px 0 0; }
  .theme-scope-options>summary { color:var(--cp-muted); }
  .theme-preview { margin:12px 0; }
  .planning-settings { border:0;margin:0;padding:0; }
  .settings-section { border:1px solid var(--cp-border);border-radius:var(--cp-radius);background:var(--cp-surface);padding:0 20px;margin:0 0 10px; }
  .settings-section>summary { display:flex;align-items:center;gap:12px;list-style:none;padding:17px 0;cursor:pointer;font-size:14px;font-weight:550; }
  .settings-section>summary::-webkit-details-marker,.theme-scope-options>summary::-webkit-details-marker { display:none; }
  .settings-section>summary::after,.theme-scope-options>summary::after { content:'›';font-size:22px;line-height:20px;color:var(--cp-muted);margin-left:4px;transition:transform .15s; }
  .settings-section[open]>summary::after,.theme-scope-options[open]>summary::after { transform:rotate(90deg); }
  .settings-section[open] { padding-bottom:18px; }
  .settings-section[open]>summary { margin-bottom:10px;border-bottom:1px solid var(--cp-border); }
  .disclosure-title { flex:1;min-width:0; }
  .disclosure-value { color:var(--cp-muted);font-size:12px;font-weight:400;text-align:right;max-width:48%;overflow-wrap:anywhere; }
  .summary-warning { color:var(--cp-error-message); }
  .theme-scope-options>summary { display:flex;align-items:center;list-style:none;gap:8px;cursor:pointer; }
  .help-disclosure { margin:12px 0 0;font-size:12px;color:var(--cp-muted); }
  .help-disclosure>summary { cursor:pointer;min-height:30px;padding:4px 0;width:fit-content; }
  .help-disclosure p { max-width:75ch;margin:8px 0; }
  .settings-actions { margin:12px 0 4px;gap:8px; }
  .calendar-choice { padding:12px 0;border-color:var(--cp-border); }
  .calendar-choice:last-of-type { border-bottom:1px solid var(--cp-border); }
  .extra-semesters>summary { cursor:pointer;font-size:13px;margin:12px 0; }
  .settings-save-bar { position:sticky;bottom:0;z-index:6;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px 16px;padding:14px 4px;background:var(--cp-bg);border-top:1px solid var(--cp-border);margin-top:18px; }
  .settings-save-bar [data-planning-settings-status] { flex-basis:100%;margin:0;font-size:12px; }
  .reminder-round { grid-template-columns:100px minmax(100px,1fr) minmax(100px,1fr); }
  .reminder-settings>[data-reminder-status] { font-size:12px; }
  .task-agenda,.workload-view { max-width:1100px;margin:auto; }
  .task-agenda h2 { margin:0 0 16px; }
  .task-presets { gap:4px; }
  .task-presets .control { border-color:transparent;background:transparent;color:var(--cp-muted);border-radius:20px;padding:7px 12px; }
  .task-presets .control[aria-pressed=true] { background:var(--cp-accent-soft);color:var(--cp-accent-text); }
  .task-filters { gap:8px 14px; }
  .task-scope { display:flex;align-items:start;justify-content:space-between;gap:12px;flex-wrap:wrap;color:var(--cp-muted);margin:4px 0; }
  .task-range { border:0;padding:4px 0;margin:4px 0; }
  .task-range summary { font-weight:400; }
  .task-history { margin:4px 0;font-size:12px; }
  .task-list-tools { display:flex;align-items:center;justify-content:space-between;gap:16px;margin:8px 0; }
  .task-list-tools .field { display:flex;flex-direction:row-reverse;justify-content:start;gap:10px;font-size:12px; }
  .task-group { background:var(--cp-surface);border:1px solid var(--cp-border);border-radius:var(--cp-radius);overflow:hidden;margin:8px 0 16px; }
  .task-group h3 { margin:0;padding:10px 16px;background:var(--cp-raised);font-size:12px; }
  .agenda-row { grid-template-columns:18px minmax(150px,1fr) minmax(180px,.65fr) 108px;padding:16px;gap:16px; }
  .agenda-row:last-child { border-bottom:0; }
  .agenda-row:hover { background:var(--cp-raised); }
  .agenda-row.selected { background:var(--cp-accent-soft); }
  .agenda-title .task-title { color:var(--cp-text);font-weight:600;font-size:14px;line-height:1.5; }
  .agenda-title p { margin:4px 0 0;font-size:12px; }
  .agenda-meta { font-size:12px;gap:3px; }
  .agenda-meta span:first-child { font-size:10px; }
  .agenda-status { align-items:flex-end;gap:8px; }
  .quick-complete { display:grid;place-items:center;flex:none;min-width:32px;min-height:32px;border:1px solid var(--cp-border);border-radius:50%;background:var(--cp-surface);color:var(--cp-muted);font-size:16px; }
  .quick-complete:hover { background:var(--cp-accent);border-color:var(--cp-accent);color:var(--cp-on-accent); }
  .task-bulk { border-radius:var(--cp-radius);z-index:5; }
  button.filter-chip { border:1px solid var(--cp-border);min-height:30px;cursor:pointer; }
  button.filter-chip:hover { background:var(--cp-accent-soft);color:var(--cp-accent-text); }
  .plan-heading { display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-top:12px; }
  .plan-heading .field { flex:1;max-width:380px;margin:0; }
  .plan-heading .draft-notice,.plan-heading>.hint { margin:22px 0 0; }
  .plan-toolbar { gap:8px; }
  .plan-toolbar [data-control-id="Generate balanced plan"] { margin-left:auto; }
  .plan-more-actions { order:5;margin-left:0; }
  .plan-configuration { margin:12px 0 0;padding:8px 0;border:0; }
  .plan-status { background:var(--cp-surface);border:1px solid var(--cp-border);border-radius:var(--cp-radius);padding:12px 16px; }
  .plan-status strong { font-size:12px;font-weight:550; }
  .task-pool { background:var(--cp-surface);border:1px solid var(--cp-border);border-radius:var(--cp-radius);padding:16px; }
  .task-pool h3,.daily-plan h3 { font-size:15px; }
  .pool-card { padding:14px 0; }
  .pool-card .task-title { color:var(--cp-text);font-weight:600;line-height:1.5; }
  .pool-card .hint { margin:5px 0;font-size:12px; }
  .pool-card>.text-button { margin:4px 4px 0 0;font-size:12px;min-height:30px; }
  .pool-filters { margin:4px 0 12px; }
  .pool-filters>summary { cursor:pointer;font-size:12px;color:var(--cp-muted);padding:6px 0; }
  .pool-filters select { width:100%;max-width:100%;padding:8px;margin:6px 0;border:1px solid var(--cp-border);border-radius:8px;background:var(--cp-surface);color:var(--cp-text);font:inherit;font-size:12px; }
  .week-instructions { margin:4px 0; }
  .week-scroll { border-radius:var(--cp-radius);background:var(--cp-surface); }
  .detail { top:82px;right:12px;bottom:12px;width:min(390px,calc(100% - 24px));z-index:10;border-radius:16px;padding:20px; }
  .detail-head { position:sticky;top:-20px;background:var(--cp-surface);padding:12px 0;z-index:1; }
  .detail h2 { font-size:19px; }
  .detail .canvas-link { display:block;text-align:center;border:1px solid var(--cp-border);padding:9px;border-radius:8px;text-decoration:none; }
  .summary-cards { gap:12px; }
  .summary-card { border-radius:var(--cp-radius); }
  .workload-view>.view-tools { margin:16px 0; }
  .view-tools button[aria-pressed=true] { background:var(--cp-accent-soft);color:var(--cp-accent-text);border-color:var(--cp-accent); }
  .line-chart { border-radius:var(--cp-radius);background:var(--cp-surface);padding:16px; }
  .empty-state { background:var(--cp-surface);border:1px solid var(--cp-border);border-radius:var(--cp-radius); }
  .empty-state h3 { font-size:20px;color:var(--cp-text);margin:0 0 8px; }
  @media(max-width:800px) {
    .header { padding:12px 16px;flex-wrap:wrap; }
    .tabs { padding:0 12px 10px; }
    .content { padding:16px; }
    .agenda-row { grid-template-columns:18px minmax(0,1fr) 40px;gap:6px 12px; }
    .agenda-meta { grid-column:2;grid-row:2; }
    .agenda-status { grid-column:3;grid-row:1 / span 2; }
    .agenda-status .urgency-tag { font-size:10px;padding:3px 5px; }
    .task-pool { height:360px; }
  }
  @media(max-width:600px) {
    .backdrop { padding:0; }
    .shell { border-radius:0;border:0; }
    .header { gap:8px;min-height:62px; }
    .identity h1 { font-size:17px; }
    .brand-icon { width:30px;height:30px;border-radius:9px; }
    .controls:has(.month-name) { width:100%;justify-content:center; }
    .controls .month-name { flex:1;min-width:0; }
    .tabs { display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:2px;padding:0 8px 8px;overflow:visible; }
    .tab { flex-direction:column;gap:3px;min-width:0;padding:7px 2px;font-size:11px;white-space:normal; }
    .tab:last-child { margin:0; }
    .tab .ui-icon { width:18px;height:18px; }
    .content { padding:14px 12px; }
    .calendar-board .month,.calendar-board .weekday-row { min-width:620px; }
    .today-summary { margin-bottom:12px; }
    .general-settings { padding:14px 16px; }
    .general-settings>.field,.theme-settings>.field { grid-template-columns:1fr minmax(130px,170px);gap:12px; }
    .settings-section { padding:0 16px; }
    .settings-section>summary { font-size:13px;gap:8px; }
    .disclosure-value { font-size:11px;max-width:42%; }
    .settings-save-bar { padding:12px 0; }
    .reminder-round { grid-template-columns:1fr 1fr;gap:8px; }
    .reminder-round>strong { grid-column:1/-1; }
    .task-presets { gap:2px; }
    .task-presets .control { font-size:12px;padding:6px 8px;min-height:32px; }
    .task-filters { grid-template-columns:minmax(0,1fr);gap:0; }
    .task-filters .field { margin:5px 0; }
    .task-history { flex-wrap:wrap;gap:4px; }
    .task-range summary { font-size:11px; }
    .agenda-row { padding:14px 12px; }
    .plan-toolbar { gap:6px; }
    .plan-toolbar select { max-width:160px; }
    .plan-toolbar [data-control-id="Generate balanced plan"] { margin-left:0; }
    .plan-heading { gap:8px; }
    .plan-heading .field { flex-basis:100%;max-width:none; }
    .plan-heading .draft-notice,.plan-heading>.hint { margin:0; }
    .plan-columns { gap:16px; }
    .detail { top:12px; }
    .schedule-row strong { min-width:100%; }
    .schedule-row { gap:8px; }
    .schedule-row .field { flex:1;min-width:75px; }
    .rule-card { grid-template-columns:repeat(2,minmax(0,1fr)); }
  }
  @media(prefers-reduced-motion:reduce) { .settings-section>summary::after,.theme-scope-options>summary::after { transition:none; } }
`;
