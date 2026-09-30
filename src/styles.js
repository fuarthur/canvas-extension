export const styles = `
  :host { all: initial; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f2937; }
  *, *::before, *::after { box-sizing: border-box; }
  .backdrop { position: fixed; inset: 0; z-index: 2147483647; background: rgba(18, 28, 44, .56); display: flex; padding: 22px; }
  .shell { width: min(1420px, 100%); height: 100%; margin: auto; display: flex; flex-direction: column; overflow: hidden; background: #f5f7fb; border-radius: 18px; box-shadow: 0 24px 90px rgba(0,0,0,.28); }
  .header { display: flex; align-items: center; gap: 14px; padding: 18px 22px; background: #fff; border-bottom: 1px solid #dce3ec; }
  .identity { min-width: 220px; }
  .eyebrow { margin: 0 0 3px; color: #52647b; font-size: 11px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; }
  h1 { margin: 0; font-size: 23px; line-height: 1.2; color: #13243b; }
  .subline { margin: 5px 0 0; color: #627186; font-size: 12px; }
  .controls { margin-left: auto; display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 7px; }
  button { font: inherit; cursor: pointer; }
  .control, .close, .more, .text-button { border: 1px solid #cbd5e1; background: #fff; color: #213850; border-radius: 9px; padding: 8px 11px; font-size: 13px; font-weight: 600; }
  .control:hover, .close:hover, .more:hover, .text-button:hover { background: #edf3f9; }
  .close { font-size: 20px; line-height: 1; min-width: 37px; }
  .month-name { min-width: 155px; text-align: center; font-weight: 800; font-size: 18px; color: #13243b; }
  .content { overflow: auto; padding: 20px; flex: 1; }
  .tabs { display: flex; gap: 8px; padding: 8px 22px; background: #fff; border-bottom: 1px solid #dce3ec; }
  .tab { border: 0; border-radius: 8px; padding: 9px 16px; background: transparent; color: #52647b; font-size: 14px; font-weight: 700; }
  .tab[aria-selected=true] { background: #e4edf9; color: #173358; }
  button:disabled { cursor: default; opacity: .6; }
  .settings { max-width: 850px; margin: 0 auto; padding: 20px; background: #fff; border: 1px solid #dce3ec; border-radius: 12px; }
  .settings h2 { margin: 0 0 8px; font-size: 20px; }
  .settings-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0; }
  .calendar-choice { display: flex; align-items: center; gap: 12px; padding: 12px 4px; border-top: 1px solid #edf0f4; font-size: 14px; }
  .calendar-choice input { width: 18px; height: 18px; flex: none; }
  .calendar-choice .hint { margin: 4px 0 0; }
  .settings > button { margin: 16px 8px 0 0; }
  .status { background: #fff; border: 1px solid #dce3ec; border-radius: 12px; padding: 26px; color: #34465f; }
  .status.error { border-color: #edb0a7; background: #fff8f7; }
  .weekday-row { display: grid; grid-template-columns: repeat(7,minmax(0,1fr)); margin: 0 0 8px; color: #65758a; font-size: 12px; font-weight: 700; text-transform: uppercase; text-align: right; }
  .weekday-row span { padding: 0 10px; }
  .month { border: 1px solid #dce3ec; border-radius: 12px; overflow: hidden; background: #fff; }
  .week { border-top: 1px solid #dce3ec; min-height: 116px; }
  .week:first-child { border-top: 0; }
  .days { display: grid; grid-template-columns: repeat(7,minmax(0,1fr)); }
  .day { min-height: 35px; text-align: right; padding: 8px 10px 2px; border-left: 1px solid #edf0f4; color: #273c55; font-size: 13px; font-weight: 700; }
  .day:first-child { border-left: 0; }
  .day.outside { color: #a3afbd; background: #f7f9fb; }
  .day.today { color: #fff; background: #344f78; }
  .bars { display: grid; grid-template-columns: repeat(7,minmax(0,1fr)); grid-auto-rows: 26px; gap: 3px 0; padding: 4px 5px 10px; min-height: 66px; }
  .bar { display: flex; align-items: center; gap: 5px; overflow: hidden; white-space: nowrap; text-align: left; border: 0; border-left: 4px solid #476ca3; border-radius: 5px; background: #e4edf9; color: #173358; padding: 3px 7px; font-size: 12px; font-weight: 700; margin: 0 2px; }
  .context-tag { flex: none; max-width: 42%; overflow: hidden; text-overflow: ellipsis; font-size: 10px; opacity: .72; }
  .bar-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .bar:hover, .bar:focus-visible { outline: 2px solid #1f4e8c; outline-offset: 1px; }
  .bar.completed { background: #e7ecea; color: #65736d; border-left-color: #83a090; text-decoration: line-through; }
  .bar.assignment { background: #e9e6fa; border-left-color: #6656a3; color: #3b326d; }
  .bar.assignment.completed { background: #e7ecea; border-left-color: #83a090; color: #65736d; }
  .more { grid-column: 1 / -1; justify-self: start; margin: 0 2px; padding: 3px 8px; font-size: 11px; }
  .detail { position: absolute; right: 22px; top: 92px; bottom: 22px; width: min(360px, calc(100vw - 44px)); overflow: auto; background: #fff; border: 1px solid #dce3ec; border-radius: 14px; box-shadow: 0 14px 40px rgba(23,40,63,.23); padding: 20px; }
  .detail-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .detail h2 { margin: 0; font-size: 20px; line-height: 1.3; color: #13243b; }
  .detail p { line-height: 1.5; font-size: 13px; color: #53647a; }
  .detail dl { margin: 20px 0; display: grid; grid-template-columns: 90px 1fr; gap: 11px 8px; font-size: 13px; }
  .detail dt { color: #68798f; }
  .detail dd { margin: 0; color: #243a56; font-weight: 600; overflow-wrap: anywhere; }
  .field { display: block; margin: 16px 0; font-size: 13px; font-weight: 700; }
  .field input[type=date] { display: block; width: 100%; margin-top: 7px; padding: 9px; border: 1px solid #abb9cb; border-radius: 8px; color: #213850; font: inherit; }
  .check { display: flex; align-items: center; gap: 9px; margin: 18px 0; font-size: 14px; font-weight: 700; }
  .check input { width: 18px; height: 18px; }
  .canvas-link { display: inline-block; margin-top: 8px; color: #275990; font-size: 13px; font-weight: 700; }
  .notice { color: #a23b31 !important; font-weight: 650; }
  .hint { margin: 8px 0 0; font-size: 12px; color: #738197; }
  @media (max-width: 760px) { .backdrop { padding: 0; } .shell { border-radius: 0; } .header { align-items: flex-start; flex-direction: column; padding: 12px; } .controls { margin-left: 0; justify-content: flex-start; } .content { padding: 8px; } .day { padding: 4px; } .bar { font-size: 10px; } .detail { top: 130px; right: 8px; bottom: 8px; } }

  .day { display:flex; align-items:center; justify-content:flex-end; gap:7px; }
  .pressure-badge { font:700 10px system-ui; border:0; border-radius:20px; min-width:22px; height:22px; cursor:pointer; }
  .pressure-badge.green { background:#dceee4;color:#246e4a; }.pressure-badge.yellow { background:#fff0cc;color:#946000; }.pressure-badge.red { background:#fbe0df;color:#a02e32; }
  .today-summary { font-size:13px;color:#53647a;margin:0 0 16px; }
  .summary-cards,.form-grid { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:18px 0; }
  .summary-card { display:flex;flex-direction:column;gap:8px;background:#f4f6fb;border:1px solid #e2e7ef;border-radius:12px;padding:16px; }.summary-card strong{font-size:24px;color:#26334f;}
  .line-chart { background:#fff;border:1px solid #e2e7ef;border-radius:12px;padding:16px;margin:16px 0; }.line-chart svg{width:100%;height:auto;display:block;}.line-chart circle{cursor:pointer;}.line-chart circle:focus{outline:2px solid #26334f;}
  .chart-legend{display:flex;gap:16px;font-size:12px;flex-wrap:wrap;}.chart-legend span{padding-left:8px;}.chart-data{margin-top:14px;font-size:12px;}.chart-data table{width:100%;border-collapse:collapse;}.chart-data th,.chart-data td{text-align:left;padding:8px;border-bottom:1px solid #edf0f4;}
  .view-tools{display:flex;gap:8px;flex-wrap:wrap;}.day-list{margin:16px 0;padding:16px;border:1px solid #e2e7ef;border-radius:12px;background:#fff;}.day-list h2{font-size:18px;margin:0 0 14px;}.task-row{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #edf0f4;flex-wrap:wrap;}.task-title{border:0;background:transparent;text-align:left;font-weight:700;color:#344f78;cursor:pointer;}
  .planning-settings{margin-top:32px;border-top:1px solid #e2e7ef;padding-top:24px;}.planning-settings h2,.workload-view h2{margin:0;font-size:22px;}.planning-settings h3{font-size:16px;margin-top:24px;}
  .field input,.field select { display:block;width:100%;padding:8px;margin-top:5px;border:1px solid #b9c4d4;border-radius:7px;font:inherit;color:#213850;background:#fff;box-sizing:border-box; }.field input[type=checkbox]{width:18px;height:18px;}.field{margin:8px 0;}
  .rule-card{display:grid;grid-template-columns:55px 1fr 1fr 1.5fr 85px auto auto auto;gap:8px;align-items:end;background:#f5f7fb;padding:12px;border-radius:10px;margin-bottom:8px;}.rule-card .field{font-size:11px;}.estimate-preview{background:#edeafa;color:#4b3d82;padding:12px;border-radius:8px;margin:12px 0;}.schedule-settings{margin:20px 0;}.schedule-row{display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid #edf0f4;}.schedule-row strong{min-width:90px;}.schedule-row .field{max-width:140px;font-size:12px;}.success{color:#246e4a;}
  @media(max-width:900px){.rule-card{grid-template-columns:repeat(3,minmax(0,1fr));}.summary-cards,.form-grid{grid-template-columns:1fr;}.schedule-row{flex-wrap:wrap;}.line-chart{padding:8px;}}
`;
