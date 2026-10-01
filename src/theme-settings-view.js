import { ui } from './ui.js';
import { setText } from './i18n.js';
import { normalizeTheme, themeOptions, defaultCustomColors, validColor, contrastRatio } from './themes.js';
import {normalizeThemeScope} from './appearance.js';

export function createThemeSettings({ document, value, scope, onSave, onSaveScope }) {
  const { el, field, select, input, button } = ui(document);
  let current = normalizeTheme(value), busy = false;
  let currentScope=normalizeThemeScope(scope);
  const panel = el('section', 'theme-settings');
  const notice = el('p', 'theme-notice');
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  const warning = el('p', 'hint');
  const controls = [];
  const preset = select('Interface theme', themeOptions, current.preset, value => save({ ...current, preset: value }));
  controls.push(preset);
  panel.append(el('h2', '', 'Appearance'), field('Theme', preset), el('p', 'hint', 'Appearance changes are saved automatically for this Canvas account.'));
  const scopeControl=select('Theme applies to',[['planner','Planning tab only'],['canvas','Entire Canvas']],currentScope,saveScope);
  controls.push(scopeControl);
  panel.append(field('Theme applies to',scopeControl),el('p','hint','Global themes adjust the Canvas interface; course colors, event color accents, and content colors stay unchanged.'));
  const preview = el('div', 'theme-preview');
  preview.setAttribute('aria-hidden', 'true');
  preview.append(el('span', 'theme-preview-surface'), el('span', 'theme-preview-accent'), el('span', 'theme-preview-text'));
  panel.append(preview);
  const custom = el('div', 'custom-theme');
  const base = select('Custom theme base', [['light', 'Light base'], ['dark', 'Dark base']], current.custom.base,
    value => save({ preset: 'custom', custom: defaultCustomColors(value) }));
  controls.push(base);
  custom.append(field('Base', base), el('p', 'hint', 'Changing the base or resetting colors restores that base’s default colors.'));
  const grid = el('div', 'theme-color-grid');
  const pairs = new Map();
  for (const [key, label] of [['accent', 'Accent color'], ['background', 'Background color'], ['surface', 'Card color'], ['text', 'Text color']]) {
    const pair = el('span', 'theme-color-pair');
    const change = color => {
      if (!validColor(color)) {
        sync();
        setText(notice, 'Enter a six-digit hex color, such as #344f78.');
        return;
      }
      save({ ...current, custom: { ...current.custom, [key]: color.toLowerCase() } });
    };
    const picker = input(`Theme ${key} color`, current.custom[key], 'color', change);
    const hex = input(`Theme ${key} hex`, current.custom[key], 'text', value => change(value.trim()));
    hex.maxLength = 7;
    hex.spellcheck = false;
    pair.append(picker, hex);
    grid.append(field(label, pair));
    pairs.set(key, { picker, hex });
    controls.push(picker, hex);
  }
  const reset = button('Reset custom colors', () => save({ ...current, custom: defaultCustomColors(current.custom.base) }));
  controls.push(reset);
  custom.append(grid, reset, warning);
  panel.append(custom, notice);

  function sync() {
    preset.value = current.preset;
    scopeControl.value=currentScope;
    base.value = current.custom.base;
    custom.hidden = current.preset !== 'custom';
    for (const [key, { picker, hex }] of pairs) picker.value = hex.value = current.custom[key];
    for (const node of controls) node.disabled = busy;
    const lowContrast = contrastRatio(current.custom.text, current.custom.background) < 4.5 || contrastRatio(current.custom.text, current.custom.surface) < 4.5;
    setText(warning, lowContrast ? 'Text may be difficult to read. Choose text and background colors with more contrast.' : '');
  }
  async function save(next) {
    if (busy) return;
    busy = true;
    for (const node of controls) node.disabled = true;
    setText(notice, '');
    try {
      const saved = await onSave(normalizeTheme(next));
      current = normalizeTheme(saved || next);
    } catch (cause) {
      setText(notice, cause.message || 'Could not save appearance. Please try again.');
    } finally {
      busy = false;
      sync();
    }
  }
  async function saveScope(next){
    if(busy)return;
    busy=true;sync();setText(notice,'');
    try{currentScope=normalizeThemeScope(await onSaveScope(next));}
    catch(cause){setText(notice,cause.message||'Could not save appearance. Please try again.');}
    finally{busy=false;sync();}
  }
  sync();
  return { element: panel, update(value,scope) { if (!busy) { current = normalizeTheme(value);currentScope=normalizeThemeScope(scope); sync(); } } };
}
