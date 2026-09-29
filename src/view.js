import { monthWeeks, validDay, weekSegments } from './dates.js';
import { normalizeItems } from './model.js';
import { styles } from './styles.js';

function monthOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function monthFromCalendarHash(hash, now = new Date()) {
  const value = new URLSearchParams(String(hash).replace(/^#/, '')).get('view_start');
  return /^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$/.test(value ?? '') ? value.slice(0, 7) : monthOf(now);
}

function shiftMonth(month, amount) {
  const [year, number] = month.split('-').map(Number);
  return monthOf(new Date(year, number - 1 + amount, 1));
}

function monthInRange(month, range) {
  return Boolean(range && `${month}-01` >= range.startDate && `${month}-01` <= range.endDate);
}

function safeCanvasLink(value) {
  if (!value) return null;
  try {
    const url = new URL(value, 'https://canvas.illinois.edu');
    return url.origin === 'https://canvas.illinois.edu' ? url.href : null;
  } catch {
    return null;
  }
}

export function mountPlanner({ host, loadSnapshot, storeFactory, initialMonth, now = new Date() }) {
  const document = host.ownerDocument;
  const root = host.shadowRoot || host.attachShadow({ mode: 'open' });
  let open = false;
  let month = initialMonth;
  let snapshot = null;
  let store = null;
  let userState = { starts: {}, completed: {}, lastMonth: null };
  let loading = false;
  let error = null;
  let selectedKey = null;
  let notice = null;
  let requestId = 0;
  const expandedWeeks = new Set();

  function el(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function action(label, text, handler, className = 'control') {
    const button = el('button', className, text);
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.addEventListener('click', handler);
    return button;
  }

  function close() {
    open = false;
    requestId++;
    host.remove();
    document.removeEventListener('keydown', onKeyDown);
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') close();
  }

  async function load(force = false) {
    if (!force && snapshot && monthInRange(month, snapshot.range)) {
      render();
      return;
    }
    const currentRequest = ++requestId;
    loading = true;
    error = null;
    render();
    try {
      const nextSnapshot = await loadSnapshot(month);
      if (!open || currentRequest !== requestId) return;
      snapshot = nextSnapshot;
      store = storeFactory(nextSnapshot.profile.id);
      userState = await store.load();
      if (!open || currentRequest !== requestId) return;
      loading = false;
      render();
    } catch (cause) {
      if (!open || currentRequest !== requestId) return;
      loading = false;
      error = cause instanceof Error ? cause.message : 'Could not load Canvas calendar.';
      render();
    }
  }

  async function navigate(nextMonth) {
    month = nextMonth;
    selectedKey = null;
    expandedWeeks.clear();
    if (store) await store.setLastMonth(month);
    await load();
  }

  function detail(item) {
    const panel = el('aside', 'detail');
    panel.setAttribute('aria-label', 'Item details');
    const head = el('div', 'detail-head');
    head.append(el('h2', '', item.title), action('Close details', '×', () => { selectedKey = null; render(); }, 'close'));
    panel.append(head);
    panel.append(el('p', '', item.contexts.join(' · ') || 'Personal'));
    const facts = el('dl');
    for (const [label, value] of [['Starts', item.startAt || item.startDay], ['Ends', item.endAt || item.endDay]]) {
      facts.append(el('dt', '', label), el('dd', '', value));
    }
    panel.append(facts);
    if (item.type === 'assignment') {
      const field = el('label', 'field', 'Plan start date');
      const input = el('input');
      input.type = 'date';
      input.value = userState.starts[item.key] || item.startDay;
      input.max = item.endDay;
      input.setAttribute('aria-label', 'Plan start date');
      input.addEventListener('change', async () => {
        if (!validDay(input.value) || input.value > item.endDay) {
          notice = 'Choose a valid date no later than the due date.';
          render();
          return;
        }
        notice = null;
        await store.setStart(item.key, input.value);
        userState = await store.load();
        render();
      });
      field.append(input);
      panel.append(field);
      panel.append(action('Use Canvas start date', 'Use Canvas date', async () => {
        notice = null;
        await store.setStart(item.key, null);
        userState = await store.load();
        render();
      }, 'text-button'));
      if (item.needsStart) panel.append(el('p', 'hint', 'No Canvas open date; choose when you plan to start.'));
    }
    const check = el('label', 'check');
    const checkbox = el('input');
    checkbox.type = 'checkbox';
    checkbox.checked = item.completed;
    checkbox.setAttribute('aria-label', 'Mark complete');
    checkbox.addEventListener('change', async () => {
      await store.setCompleted(item.key, checkbox.checked);
      userState = await store.load();
      render();
    });
    check.append(checkbox, document.createTextNode('Complete in this extension'));
    panel.append(check);
    if (notice) panel.append(el('p', 'notice', notice));
    for (const warning of item.warnings) panel.append(el('p', 'notice', warning));
    const url = safeCanvasLink(item.url);
    if (url) {
      const link = el('a', 'canvas-link', 'Open in Canvas ↗');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', 'Open in Canvas');
      panel.append(link);
    }
    return panel;
  }

  function calendar(items) {
    const container = el('div');
    const weekdayRow = el('div', 'weekday-row');
    for (const day of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) weekdayRow.append(el('span', '', day));
    container.append(weekdayRow);
    const monthGrid = el('div', 'month');
    const weeks = monthWeeks(month);
    const segments = weekSegments(items, weeks);
    const byKey = new Map(items.map(item => [item.key, item]));
    weeks.forEach((week, index) => {
      const row = el('div', 'week');
      const days = el('div', 'days');
      week.forEach(day => {
        const cell = el('div', `day${day.slice(0, 7) === month ? '' : ' outside'}${day === monthOf(now) + '-' + String(now.getDate()).padStart(2, '0') ? ' today' : ''}`, String(Number(day.slice(-2))));
        cell.setAttribute('aria-label', day);
        days.append(cell);
      });
      row.append(days);
      const bars = el('div', 'bars');
      const shown = expandedWeeks.has(index) ? segments[index] : segments[index].slice(0, 4);
      shown.forEach((segment, barIndex) => {
        const item = byKey.get(segment.itemKey);
        const bar = action(`Open ${item.title}`, `${item.completed ? '✓ ' : ''}${item.title}`, () => { selectedKey = item.key; notice = null; render(); }, `bar ${item.type}${item.completed ? ' completed' : ''}`);
        bar.dataset.itemKey = item.key;
        bar.style.gridColumn = `${segment.startColumn + 1} / ${segment.endColumn + 2}`;
        bar.style.gridRow = String(barIndex + 1);
        bar.title = `${item.title}: ${item.startDay} – ${item.endDay}`;
        bars.append(bar);
      });
      if (segments[index].length > 4) {
        const expanded = expandedWeeks.has(index);
        bars.append(action(expanded ? 'Show fewer items' : 'Show more items', expanded ? 'Show less' : `+${segments[index].length - 4} more`, () => {
          if (expanded) expandedWeeks.delete(index); else expandedWeeks.add(index);
          render();
        }, 'more'));
      }
      row.append(bars);
      monthGrid.append(row);
    });
    container.append(monthGrid);
    return container;
  }

  function render() {
    if (!open) return;
    const style = el('style', '', styles);
    const backdrop = el('div', 'backdrop');
    const shell = el('section', 'shell');
    shell.setAttribute('role', 'dialog');
    shell.setAttribute('aria-modal', 'true');
    shell.setAttribute('aria-label', 'Planning calendar');
    const header = el('header', 'header');
    const identity = el('div', 'identity');
    identity.append(el('p', 'eyebrow', 'Illinois Canvas'), el('h1', '', 'Planning calendar'), el('p', 'subline', 'Your dates and completion marks stay in this extension'));
    header.append(identity);
    const controls = el('div', 'controls');
    controls.append(action('Previous month', '‹', () => navigate(shiftMonth(month, -1))), el('span', 'month-name', new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00`))), action('Next month', '›', () => navigate(shiftMonth(month, 1))), action('Today', 'Today', () => navigate(monthOf(now))), action('Refresh calendar', 'Refresh', () => load(true)), action('Close planning calendar', '×', close, 'close'));
    header.append(controls);
    shell.append(header);
    const body = el('div', 'content');
    if (loading) body.append(el('div', 'status', 'Loading Canvas calendar…'));
    else if (error) {
      const status = el('div', 'status error');
      status.append(el('p', '', error), action('Retry loading', 'Retry', () => load(true)));
      body.append(status);
    } else if (snapshot) {
      const items = normalizeItems(snapshot, userState);
      body.append(calendar(items));
      const selected = items.find(item => item.key === selectedKey);
      if (selected) shell.append(detail(selected));
    }
    shell.append(body);
    backdrop.append(shell);
    root.replaceChildren(style, backdrop);
  }

  async function toggle() {
    if (open) { close(); return; }
    open = true;
    document.body.append(host);
    document.addEventListener('keydown', onKeyDown);
    await load();
  }

  return { toggle, destroy: close };
}
