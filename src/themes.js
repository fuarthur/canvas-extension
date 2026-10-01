export const themeOptions = [['light', 'Default light'], ['dark', 'Dark mode'], ['forest', 'Forest'], ['warm', 'Warm'], ['system', 'Follow system'], ['custom', 'Custom colors']];

const bases = {
  light: { base: 'light', accent: '#344f78', background: '#f5f7fb', surface: '#ffffff', text: '#1f2937' },
  dark: { base: 'dark', accent: '#91b8f4', background: '#111827', surface: '#1c2636', text: '#e8edf5' },
  forest: { base: 'light', accent: '#24634b', background: '#edf5ef', surface: '#fafffb', text: '#20372d' },
  warm: { base: 'light', accent: '#91532a', background: '#faf1e6', surface: '#fffaf3', text: '#3c2b22' }
};

export const defaultCustomColors = (base = 'light') => ({ ...bases[base === 'dark' ? 'dark' : 'light'] });
export const defaultTheme = () => ({ preset: 'light', custom: defaultCustomColors() });
export const validColor = value => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
export function validTheme(value) {
  return Boolean(value && themeOptions.some(([id]) => id === value.preset) &&
    ['light', 'dark'].includes(value.custom?.base) &&
    ['accent', 'background', 'surface', 'text'].every(key => validColor(value.custom[key])));
}
export function normalizeTheme(value) {
  if (!validTheme(value)) return defaultTheme();
  return { preset: value.preset, custom: { base: value.custom.base, ...Object.fromEntries(
    ['accent', 'background', 'surface', 'text'].map(key => [key, value.custom[key].toLowerCase()])) } };
}

const rgb = color => [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
function mix(a, b, amount) {
  const left = rgb(a), right = rgb(b);
  return '#' + left.map((v, i) => Math.round(v + (right[i] - v) * amount).toString(16).padStart(2, '0')).join('');
}
function luminance(color) {
  const values = rgb(color).map(v => { const c = v / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
  return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
}
export function contrastRatio(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + .05) / (values[1] + .05);
}
const onColor = color => contrastRatio(color, '#ffffff') >= contrastRatio(color, '#000000') ? '#ffffff' : '#000000';
function readable(color, background, minimum = 4.5) {
  if (contrastRatio(color, background) >= minimum) return color;
  const target = onColor(background);
  for (let amount = .1; amount <= 1; amount += .1) {
    const candidate = mix(color, target, Math.min(amount, 1));
    if (contrastRatio(candidate, background) >= minimum) return candidate;
  }
  return target;
}
export const readableColor=readable;

export function themePalette(value, systemDark = false) {
  const theme = normalizeTheme(value);
  const preset = theme.preset === 'system' ? (systemDark ? 'dark' : 'light') : theme.preset;
  const colors = preset === 'custom' ? theme.custom : bases[preset];
  const { accent, background, surface, text } = colors;
  const dark = colors.base === 'dark';
  const accentText = contrastRatio(accent, surface) >= 4.5 ? accent : text;
  const palette = {
    bg: background, surface, text, accent, 'on-accent': onColor(accent),
    'accent-hover': mix(accent, onColor(accent) === '#ffffff' ? '#000000' : '#ffffff', .12),
    'accent-text': accentText, 'accent-soft': mix(surface, accent, dark ? .16 : .10),
    raised: mix(surface, text, dark ? .05 : .025), muted: mix(text, surface, .25),
    border: mix(surface, text, .18), 'input-border': mix(surface, text, .38),
    'completed-bg': dark ? '#263630' : '#e7ecea', 'completed-text': dark ? '#b1c9bb' : '#53685c',
    'completed-border': dark ? '#7b9d8a' : '#83a090',
    'assignment-bg': dark ? '#302d49' : '#e9e6fa', 'assignment-text': dark ? '#d5cbff' : '#3b326d',
    'assignment-accent': dark ? '#b7a5f1' : '#6656a3',
    'success-bg': dark ? '#203f32' : '#dceee4', 'success-text': dark ? '#99dfb8' : '#246e4a',
    'warning-bg': dark ? '#49391e' : '#fff0cc', 'warning-text': dark ? '#f6d18a' : '#815200',
    'warning-border': dark ? '#d5a552' : '#d7a142',
    'error-bg': dark ? '#4a272d' : '#fbe0df', 'error-text': dark ? '#ffb2b6' : '#a02e32',
    'error-border': dark ? '#e5878c' : '#c45454',
    'chart-1': preset === 'custom' ? accent : (dark ? '#c0a8fa' : '#6154b4'),
    'chart-2': dark ? '#75d5c6' : '#20796f', 'chart-3': dark ? '#f1c078' : '#9b6418',
    'chart-4': dark ? '#f39bbe' : '#b13c69'
  };
  for (const kind of ['success', 'warning', 'error']) {
    palette[`${kind}-message`] = readable(palette[`${kind}-text`], surface);
    palette[`${kind}-on-bg`] = readable(palette[`${kind}-text`], background);
  }
  palette['preview-error'] = readable(palette['error-text'], palette['success-bg']);
  palette['chart-label'] = readable(palette.muted, background);
  for (let index = 1; index <= 4; index++) palette[`chart-${index}`] = readable(palette[`chart-${index}`], background, 3);
  return { scheme: colors.base, variables: palette };
}

export function applyTheme(host, theme, systemDark = false) {
  const normalized = normalizeTheme(theme), palette = themePalette(normalized, systemDark);
  host.dataset.theme = normalized.preset;
  host.style.colorScheme = palette.scheme;
  for (const [key, value] of Object.entries(palette.variables)) host.style.setProperty(`--cp-${key}`, value);
}
