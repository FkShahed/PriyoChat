// PriyoChat Themes — Refined Color Grading, Soft Vibrancy, High Contrast & Visual Comfort
// Handcrafted with modern design principles (inspired by Telegram, WhatsApp, and Apple iMessage)

export const THEMES = {
  ClassicBlue: {
    name: 'Classic Blue',
    isLight: true,
    darkVariant: 'DarkNeon',
    background: '#F0F4FA',
    headerBg: '#0A7AFF',
    headerText: '#FFFFFF',
    headerIconColor: '#FFFFFF',
    headerStatusColor: 'rgba(255, 255, 255, 0.85)',
    sentBubble: '#0A7AFF',
    sentText: '#FFFFFF',
    receivedBubble: '#FFFFFF',
    receivedText: '#182438',
    inputBg: '#FFFFFF',
    inputText: '#182438',
    placeholderText: '#8D9CAE',
    timestampColor: '#8D9CAE',
    accentColor: '#0A7AFF',
    replySenderColor: '#0A7AFF',
    replyTextColor: '#4A5B73',
    replyBgMine: 'rgba(255, 255, 255, 0.22)',
    replyBgTheirs: 'rgba(10, 122, 255, 0.08)',
    inputBorderColor: 'rgba(10, 122, 255, 0.18)',
    bottomBarBg: ['rgba(240, 244, 250, 0.90)', 'rgba(240, 244, 250, 0.98)'],
    gradient: ['#0A7AFF', '#00B4D8'],
    preview: '#0A7AFF',
  },

  DarkNeon: {
    name: 'Midnight Neon',
    isLight: false,
    lightVariant: 'ClassicBlue',
    background: '#0B0F19',
    headerBg: '#111726',
    headerText: '#FFFFFF',
    headerIconColor: '#00E5FF',
    headerStatusColor: 'rgba(0, 229, 255, 0.75)',
    sentBubble: '#6C5CE7',
    sentText: '#FFFFFF',
    receivedBubble: '#172033',
    receivedText: '#E6EDF8',
    inputBg: '#131C2E',
    inputText: '#E6EDF8',
    placeholderText: '#6C7D98',
    timestampColor: '#7C8EA8',
    accentColor: '#00E5FF',
    replySenderColor: '#00E5FF',
    replyTextColor: '#B0C2DE',
    replyBgMine: 'rgba(255, 255, 255, 0.18)',
    replyBgTheirs: 'rgba(0, 229, 255, 0.10)',
    inputBorderColor: 'rgba(108, 92, 231, 0.35)',
    bottomBarBg: ['rgba(11, 15, 25, 0.92)', 'rgba(11, 15, 25, 0.98)'],
    gradient: ['#161F33', '#0E1626'],
    preview: '#6C5CE7',
  },

  SoftPurple: {
    name: 'Lavender Mist',
    isLight: true,
    darkVariant: 'DarkNeon',
    background: '#F8F4FD',
    headerBg: '#8A56E2',
    headerText: '#FFFFFF',
    headerIconColor: '#FFFFFF',
    headerStatusColor: 'rgba(255, 255, 255, 0.85)',
    sentBubble: '#8A56E2',
    sentText: '#FFFFFF',
    receivedBubble: '#FFFFFF',
    receivedText: '#26183B',
    inputBg: '#FFFFFF',
    inputText: '#26183B',
    placeholderText: '#9A8AA9',
    timestampColor: '#9A8AA9',
    accentColor: '#8A56E2',
    replySenderColor: '#8A56E2',
    replyTextColor: '#625375',
    replyBgMine: 'rgba(255, 255, 255, 0.22)',
    replyBgTheirs: 'rgba(138, 86, 226, 0.08)',
    inputBorderColor: 'rgba(138, 86, 226, 0.22)',
    bottomBarBg: ['rgba(248, 244, 253, 0.90)', 'rgba(248, 244, 253, 0.98)'],
    gradient: ['#8A56E2', '#B76DF2'],
    preview: '#8A56E2',
  },

  MinimalWhite: {
    name: 'Nordic Clean',
    isLight: true,
    darkVariant: 'OceanGlass',
    background: '#F6F7F9',
    headerBg: '#FFFFFF',
    headerText: '#1A202C',
    headerIconColor: '#1A202C',
    headerStatusColor: '#718096',
    sentBubble: '#2D3748',
    sentText: '#FFFFFF',
    receivedBubble: '#FFFFFF',
    receivedText: '#1A202C',
    inputBg: '#FFFFFF',
    inputText: '#1A202C',
    placeholderText: '#A0AEC0',
    timestampColor: '#718096',
    accentColor: '#2D3748',
    replySenderColor: '#2D3748',
    replyTextColor: '#4A5568',
    replyBgMine: 'rgba(255, 255, 255, 0.18)',
    replyBgTheirs: 'rgba(45, 55, 72, 0.07)',
    inputBorderColor: 'rgba(0, 0, 0, 0.08)',
    bottomBarBg: ['rgba(246, 247, 249, 0.92)', 'rgba(246, 247, 249, 0.98)'],
    gradient: ['#FFFFFF', '#EDF2F7'],
    preview: '#2D3748',
  },

  OceanGlass: {
    name: 'Deep Ocean',
    isLight: false,
    lightVariant: 'MinimalWhite',
    background: '#07131E',
    headerBg: '#0C2135',
    headerText: '#FFFFFF',
    headerIconColor: '#38BDF8',
    headerStatusColor: 'rgba(56, 189, 248, 0.8)',
    sentBubble: '#0284C7',
    sentText: '#FFFFFF',
    receivedBubble: '#0F2B44',
    receivedText: '#E0F2FE',
    inputBg: '#0B2236',
    inputText: '#E0F2FE',
    placeholderText: '#5A7D9A',
    timestampColor: '#7295B3',
    accentColor: '#38BDF8',
    replySenderColor: '#38BDF8',
    replyTextColor: '#BAE6FD',
    replyBgMine: 'rgba(255, 255, 255, 0.18)',
    replyBgTheirs: 'rgba(56, 189, 248, 0.12)',
    inputBorderColor: 'rgba(2, 132, 199, 0.35)',
    bottomBarBg: ['rgba(7, 19, 30, 0.92)', 'rgba(7, 19, 30, 0.98)'],
    gradient: ['#0C2135', '#081726'],
    preview: '#0284C7',
  },

  DoodleLight: {
    name: 'Cozy Emerald',
    isLight: true,
    darkVariant: 'DoodleDark',
    background: '#EAE6DF',
    bgImage: require('../../assets/patterns/doodle_light.jpg'),
    headerBg: '#0B6E4F',
    headerText: '#FFFFFF',
    headerIconColor: '#FFFFFF',
    headerStatusColor: 'rgba(255, 255, 255, 0.88)',
    sentBubble: '#D9FDD3',
    sentText: '#111B21',
    receivedBubble: '#FFFFFF',
    receivedText: '#111B21',
    inputBg: '#FFFFFF',
    inputText: '#111B21',
    placeholderText: '#8696A0',
    timestampColor: '#667781',
    accentColor: '#0B6E4F',
    replySenderColor: '#0B6E4F',
    replyTextColor: '#4B5563',
    replyBgMine: 'rgba(11, 110, 79, 0.10)',
    replyBgTheirs: 'rgba(0, 0, 0, 0.05)',
    inputBorderColor: 'rgba(11, 110, 79, 0.18)',
    bottomBarBg: ['rgba(234, 230, 223, 0.92)', 'rgba(234, 230, 223, 0.98)'],
    gradient: ['#0B6E4F', '#0E835E'],
    preview: '#0B6E4F',
  },

  DoodleDark: {
    name: 'Forest Dark',
    isLight: false,
    lightVariant: 'DoodleLight',
    background: '#0C1317',
    bgImage: require('../../assets/patterns/doodle_dark.jpg'),
    headerBg: '#192229',
    headerText: '#E9EDEF',
    headerIconColor: '#00A884',
    headerStatusColor: 'rgba(0, 168, 132, 0.85)',
    sentBubble: '#005C4B',
    sentText: '#E9EDEF',
    receivedBubble: '#1F2C34',
    receivedText: '#E9EDEF',
    inputBg: '#1F2C34',
    inputText: '#E9EDEF',
    placeholderText: '#8696A0',
    timestampColor: '#8696A0',
    accentColor: '#00A884',
    replySenderColor: '#00A884',
    replyTextColor: '#A0B2BC',
    replyBgMine: 'rgba(255, 255, 255, 0.15)',
    replyBgTheirs: 'rgba(0, 168, 132, 0.12)',
    inputBorderColor: 'rgba(0, 168, 132, 0.3)',
    bottomBarBg: ['rgba(12, 19, 23, 0.94)', 'rgba(12, 19, 23, 0.98)'],
    gradient: ['#192229', '#121A20'],
    preview: '#00A884',
  },

  WatercolorLight: {
    name: 'Rose Pastel',
    isLight: true,
    darkVariant: 'OilPainting',
    background: '#FDF7F8',
    bgImage: require('../../assets/patterns/watercolor_light.jpg'),
    headerBg: '#E06B80',
    headerText: '#FFFFFF',
    headerIconColor: '#FFFFFF',
    headerStatusColor: 'rgba(255, 255, 255, 0.88)',
    sentBubble: '#F48FB1',
    sentText: '#FFFFFF',
    receivedBubble: '#FFFFFF',
    receivedText: '#3B1824',
    inputBg: '#FFFFFF',
    inputText: '#3B1824',
    placeholderText: '#B08895',
    timestampColor: '#A07886',
    accentColor: '#E06B80',
    replySenderColor: '#E06B80',
    replyTextColor: '#664552',
    replyBgMine: 'rgba(255, 255, 255, 0.22)',
    replyBgTheirs: 'rgba(224, 107, 128, 0.08)',
    inputBorderColor: 'rgba(224, 107, 128, 0.25)',
    bottomBarBg: ['rgba(253, 247, 248, 0.92)', 'rgba(253, 247, 248, 0.98)'],
    gradient: ['#E06B80', '#F0859A'],
    preview: '#E06B80',
  },

  OilPainting: {
    name: 'Twilight Slate',
    isLight: false,
    lightVariant: 'WatercolorLight',
    background: '#141724',
    bgImage: require('../../assets/patterns/oil_painting.jpg'),
    headerBg: '#1E2337',
    headerText: '#FFFFFF',
    headerIconColor: '#818CF8',
    headerStatusColor: 'rgba(129, 140, 248, 0.8)',
    sentBubble: '#4F46E5',
    sentText: '#FFFFFF',
    receivedBubble: '#232940',
    receivedText: '#EEF2FF',
    inputBg: '#1C2033',
    inputText: '#EEF2FF',
    placeholderText: '#7B84A6',
    timestampColor: '#8792B6',
    accentColor: '#818CF8',
    replySenderColor: '#818CF8',
    replyTextColor: '#C7D2FE',
    replyBgMine: 'rgba(255, 255, 255, 0.18)',
    replyBgTheirs: 'rgba(129, 140, 248, 0.12)',
    inputBorderColor: 'rgba(79, 70, 229, 0.35)',
    bottomBarBg: ['rgba(20, 23, 36, 0.92)', 'rgba(20, 23, 36, 0.98)'],
    gradient: ['#1E2337', '#151928'],
    preview: '#4F46E5',
  },

  AbstractArt: {
    name: 'Cyberpunk Violet',
    isLight: false,
    lightVariant: 'SketchArt',
    background: '#0D0714',
    headerBg: '#190F26',
    headerText: '#FFFFFF',
    headerIconColor: '#F43F5E',
    headerStatusColor: 'rgba(244, 63, 94, 0.85)',
    sentBubble: '#E11D48',
    sentText: '#FFFFFF',
    receivedBubble: '#211433',
    receivedText: '#FCE7F3',
    inputBg: '#1C102C',
    inputText: '#FCE7F3',
    placeholderText: '#8E6F9F',
    timestampColor: '#9D7FA9',
    accentColor: '#F43F5E',
    replySenderColor: '#F43F5E',
    replyTextColor: '#FBCFE8',
    replyBgMine: 'rgba(255, 255, 255, 0.18)',
    replyBgTheirs: 'rgba(244, 63, 94, 0.12)',
    inputBorderColor: 'rgba(225, 29, 72, 0.35)',
    bottomBarBg: ['rgba(13, 7, 20, 0.94)', 'rgba(13, 7, 20, 0.98)'],
    gradient: ['#190F26', '#12081C'],
    preview: '#E11D48',
  },

  SketchArt: {
    name: 'Warm Terracotta',
    isLight: true,
    darkVariant: 'AbstractArt',
    background: '#FAF5EE',
    bgImage: require('../../assets/patterns/watercolor_light.jpg'),
    headerBg: '#B45309',
    headerText: '#FFFFFF',
    headerIconColor: '#FFFFFF',
    headerStatusColor: 'rgba(255, 255, 255, 0.88)',
    sentBubble: '#D97706',
    sentText: '#FFFFFF',
    receivedBubble: '#FFFFFF',
    receivedText: '#2D1B08',
    inputBg: '#FFFFFF',
    inputText: '#2D1B08',
    placeholderText: '#A18265',
    timestampColor: '#927357',
    accentColor: '#B45309',
    replySenderColor: '#B45309',
    replyTextColor: '#664B32',
    replyBgMine: 'rgba(255, 255, 255, 0.22)',
    replyBgTheirs: 'rgba(180, 83, 9, 0.08)',
    inputBorderColor: 'rgba(180, 83, 9, 0.22)',
    bottomBarBg: ['rgba(250, 245, 238, 0.92)', 'rgba(250, 245, 238, 0.98)'],
    gradient: ['#B45309', '#D97706'],
    preview: '#B45309',
  },
};

export const DEFAULT_THEME = 'DoodleLight';

// ────────────────────────────────────────────────────────────────────────────
// Adaptive light/dark variants
// Every theme keeps its own identity (colour family) but is re-graded for the app's
// current light/dark mode, like Messenger. THEMES above is untouched, so every
// stored theme key keeps working; this only decides WHICH palette is shown.
// ────────────────────────────────────────────────────────────────────────────
const hex2rgb = (h) => {
  const s = h.replace('#', '');
  const f = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
};
const rgb2hex = (r, g, b) =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => {
  const A = hex2rgb(a), B = hex2rgb(b);
  return rgb2hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
};
const rgba = (h, a) => { const [r, g, b] = hex2rgb(h); return `rgba(${r}, ${g}, ${b}, ${a})`; };
const lum = (h) => { const [r, g, b] = hex2rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
const asHex = (c, fb) => (typeof c === 'string' && c.startsWith('#') ? c : fb);

// light theme -> its own dark version
function makeDark(t) {
  const accent = asHex(t.accentColor, '#4F8CFF');
  let sent = asHex(t.sentBubble, accent);
  if (lum(sent) > 0.7) sent = accent;          // pale bubbles (e.g. mint) -> use the accent
  if (lum(sent) < 0.3) sent = mix(sent, '#FFFFFF', 0.28); // near-black bubbles -> lift so they read on dark
  else sent = mix(sent, '#000000', 0.12);
  const lift = mix(accent, '#FFFFFF', lum(accent) < 0.35 ? 0.45 : 0.22);
  const bg = mix('#0B0D12', accent, 0.07);
  const header = mix('#0B0D12', accent, 0.17);
  const received = mix('#161922', accent, 0.12);
  const text = mix('#F1F3F8', accent, 0.08);
  const input = mix('#12151C', accent, 0.10);
  const muted = mix('#8A92A4', accent, 0.18);
  return {
    ...t,
    isLight: false,
    bgImage: undefined,
    background: bg,
    headerBg: header,
    headerText: '#FFFFFF',
    headerIconColor: lift,
    headerStatusColor: rgba(lift, 0.8),
    sentBubble: sent,
    sentText: '#FFFFFF',
    receivedBubble: received,
    receivedText: text,
    inputBg: input,
    inputText: text,
    placeholderText: muted,
    timestampColor: muted,
    accentColor: lift,
    replySenderColor: lift,
    replyTextColor: mix('#B6BDCC', accent, 0.18),
    replyBgMine: 'rgba(255, 255, 255, 0.18)',
    replyBgTheirs: rgba(lift, 0.12),
    inputBorderColor: rgba(sent, 0.38),
    bottomBarBg: [rgba(bg, 0.92), rgba(bg, 0.98)],
    gradient: [header, mix(header, '#000000', 0.28)],
    preview: sent,
  };
}

// dark theme -> its own light version
function makeLight(t) {
  let base = asHex(t.sentBubble, '#4F46E5');
  if (lum(base) > 0.75) base = mix(base, '#000000', 0.25);
  const bg = mix('#FFFFFF', base, 0.06);
  const text = mix('#12161F', base, 0.14);
  const muted = mix('#8A93A3', base, 0.22);
  return {
    ...t,
    isLight: true,
    bgImage: undefined,
    background: bg,
    headerBg: base,
    headerText: '#FFFFFF',
    headerIconColor: '#FFFFFF',
    headerStatusColor: 'rgba(255, 255, 255, 0.85)',
    sentBubble: base,
    sentText: '#FFFFFF',
    receivedBubble: '#FFFFFF',
    receivedText: text,
    inputBg: '#FFFFFF',
    inputText: text,
    placeholderText: muted,
    timestampColor: muted,
    accentColor: base,
    replySenderColor: base,
    replyTextColor: mix('#4A5568', base, 0.25),
    replyBgMine: 'rgba(255, 255, 255, 0.22)',
    replyBgTheirs: rgba(base, 0.08),
    inputBorderColor: rgba(base, 0.22),
    bottomBarBg: [rgba(bg, 0.90), rgba(bg, 0.98)],
    gradient: [base, mix(base, '#FFFFFF', 0.2)],
    preview: base,
  };
}

// The only theme pair where light and dark were already designed as the same look
const SAME_IDENTITY = { DoodleLight: 'DoodleDark', DoodleDark: 'DoodleLight' };
const _cache = {};

/**
 * Palette for `key` in the given app mode ('light' | 'dark').
 * Always returns an object with the same shape as THEMES[key].
 */
export function getAdaptiveTheme(key, mode) {
  const k = THEMES[key] ? key : DEFAULT_THEME;
  const base = THEMES[k];
  const wantLight = mode !== 'dark';
  if (!!base.isLight === wantLight) return base;
  if (SAME_IDENTITY[k]) return THEMES[SAME_IDENTITY[k]];
  const id = `${k}:${wantLight ? 'light' : 'dark'}`;
  if (!_cache[id]) _cache[id] = wantLight ? makeLight(base) : makeDark(base);
  return _cache[id];
}

// One card per look in the selector (Cozy Emerald / Forest Dark are the same look)
export const SELECTOR_KEYS = Object.keys(THEMES).filter((k) => k !== 'DoodleDark');
export const canonicalThemeKey = (k) => (k === 'DoodleDark' ? 'DoodleLight' : k);
