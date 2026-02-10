import { THEMES, THEME_KEYS, THEME_METADATA, type ThemeKey } from './themes';

export type Theme = ThemeKey;

export const THEME_STORAGE_KEY = 'dlulu_theme';
const DEFAULT_THEME: ThemeKey = 'light';
const LEGACY_THEME_MAP: Record<string, ThemeKey> = {
  bluey: 'sky',
  peppa: 'bubblegum',
  babyshark: 'splash',
};

const isThemeKey = (value: string | null): value is ThemeKey => {
  return normalizeThemeKey(value) !== null;
};

const normalizeThemeKey = (value: string | null): ThemeKey | null => {
  if (!value) return null;
  if (Object.prototype.hasOwnProperty.call(THEMES, value)) {
    return value as ThemeKey;
  }
  return LEGACY_THEME_MAP[value] ?? null;
};

export function getStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null;
  const value = window.localStorage.getItem(THEME_STORAGE_KEY);
  const normalized = normalizeThemeKey(value);
  if (normalized && normalized !== value) {
    window.localStorage.setItem(THEME_STORAGE_KEY, normalized);
  }
  return normalized;
}

export function getActiveTheme(): Theme {
  if (typeof document !== 'undefined') {
    const current = document.documentElement.dataset.theme;
    const normalizedCurrent = normalizeThemeKey(current);
    if (normalizedCurrent) {
      if (current !== normalizedCurrent) {
        document.documentElement.dataset.theme = normalizedCurrent;
      }
      return normalizedCurrent;
    }
    if (document.documentElement.classList.contains('dark')) return 'dark';
  }
  return getStoredTheme() ?? DEFAULT_THEME;
}

export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle('dark', theme === 'dark');
  const tokens = THEMES[theme];
  Object.entries(tokens).forEach(([key, value]) => {
    root.style.setProperty(`--${key}`, value);
  });
  root.style.colorScheme = THEME_METADATA[theme].colorScheme;
}

export function setTheme(theme: Theme) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }
  applyTheme(theme);
}

export function toggleTheme(current: Theme): Theme {
  const keys = [...THEME_KEYS];
  const index = keys.indexOf(current);
  if (index === -1) return DEFAULT_THEME;
  return keys[(index + 1) % keys.length];
}
