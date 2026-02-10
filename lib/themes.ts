export const THEME_KEYS = ['light', 'dark', 'sky', 'bubblegum', 'splash'] as const;

export type ThemeKey = typeof THEME_KEYS[number];

export type ThemeMeta = {
  label: string;
  description: string;
  preview: string;
  colorScheme: 'light' | 'dark';
};

export type ThemeTokens = {
  background: string;
  foreground: string;
  card: string;
  'card-foreground': string;
  popover: string;
  'popover-foreground': string;
  primary: string;
  'primary-foreground': string;
  secondary: string;
  'secondary-foreground': string;
  muted: string;
  'muted-foreground': string;
  accent: string;
  'accent-foreground': string;
  destructive: string;
  'destructive-foreground': string;
  border: string;
  input: string;
  ring: string;
  'chart-1': string;
  'chart-2': string;
  'chart-3': string;
  'chart-4': string;
  'chart-5': string;
};

export const THEME_METADATA: Record<ThemeKey, ThemeMeta> = {
  light: {
    label: 'Day Shift',
    description: 'Clean daylight focus',
    preview: '222 47% 11%',
    colorScheme: 'light',
  },
  dark: {
    label: 'Original',
    description: 'Signature brown-orange vibe',
    preview: '25 95% 52.94%',
    colorScheme: 'dark',
  },
  sky: {
    label: 'Sky Mode',
    description: 'Cloud-pop blues',
    preview: '209 95% 56%',
    colorScheme: 'light',
  },
  bubblegum: {
    label: 'Bubblegum',
    description: 'Playful candy pinks',
    preview: '338 79% 58%',
    colorScheme: 'light',
  },
  splash: {
    label: 'Splash Pop',
    description: 'Sunny aqua energy',
    preview: '48 100% 54%',
    colorScheme: 'light',
  },
};

export const THEMES: Record<ThemeKey, ThemeTokens> = {
  light: {
    background: '220 33% 98%',
    foreground: '222 47% 11%',
    card: '0 0% 100%',
    'card-foreground': '222 47% 11%',
    popover: '0 0% 100%',
    'popover-foreground': '222 47% 11%',
    primary: '222 47% 11%',
    'primary-foreground': '0 0% 100%',
    secondary: '220 16% 96%',
    'secondary-foreground': '222 47% 11%',
    muted: '220 16% 96%',
    'muted-foreground': '218 22% 28%',
    accent: '220 16% 94%',
    'accent-foreground': '222 47% 11%',
    destructive: '0 84.2% 60.2%',
    'destructive-foreground': '0 0% 98%',
    border: '220 13% 91%',
    input: '220 13% 91%',
    ring: '222 47% 11%',
    'chart-1': '24 95% 53%',
    'chart-2': '173 58% 39%',
    'chart-3': '350 89% 60%',
    'chart-4': '43 74% 66%',
    'chart-5': '27 87% 67%',
  },
  dark: {
    background: '25.71 17.07% 8.04%',
    foreground: '0 0% 95%',
    card: '25 18.18% 12.94%',
    'card-foreground': '0 0% 95%',
    popover: '25 18.18% 12.94%',
    'popover-foreground': '0 0% 95%',
    primary: '25 95% 52.94%',
    'primary-foreground': '0 0% 100%',
    secondary: '25.26 19.59% 19.02%',
    'secondary-foreground': '0 0% 95%',
    muted: '25.26 19.59% 19.02%',
    'muted-foreground': '0 0% 88%',
    accent: '25.26 19.59% 19.02%',
    'accent-foreground': '0 0% 95%',
    destructive: '0 62.8% 30.6%',
    'destructive-foreground': '0 0% 98%',
    border: '24.44 18.88% 28.04%',
    input: '24.44 18.88% 28.04%',
    ring: '25 95% 52.94%',
    'chart-1': '25 95% 60%',
    'chart-2': '160 60% 45%',
    'chart-3': '350 89% 60%',
    'chart-4': '43 74% 70%',
    'chart-5': '340 75% 55%',
  },
  sky: {
    background: '207 100% 97%',
    foreground: '218 46% 20%',
    card: '0 0% 100%',
    'card-foreground': '218 46% 20%',
    popover: '0 0% 100%',
    'popover-foreground': '218 46% 20%',
    primary: '209 95% 56%',
    'primary-foreground': '218 46% 20%',
    secondary: '209 70% 90%',
    'secondary-foreground': '218 46% 20%',
    muted: '209 50% 94%',
    'muted-foreground': '216 34% 24%',
    accent: '39 100% 73%',
    'accent-foreground': '218 46% 20%',
    destructive: '0 78% 58%',
    'destructive-foreground': '0 0% 98%',
    border: '210 48% 84%',
    input: '210 48% 84%',
    ring: '209 95% 56%',
    'chart-1': '209 95% 56%',
    'chart-2': '196 89% 62%',
    'chart-3': '39 100% 69%',
    'chart-4': '13 90% 66%',
    'chart-5': '262 82% 74%',
  },
  bubblegum: {
    background: '336 100% 97%',
    foreground: '336 36% 20%',
    card: '0 0% 100%',
    'card-foreground': '336 36% 20%',
    popover: '0 0% 100%',
    'popover-foreground': '336 36% 20%',
    primary: '338 79% 58%',
    'primary-foreground': '336 36% 20%',
    secondary: '199 79% 90%',
    'secondary-foreground': '336 36% 20%',
    muted: '332 58% 93%',
    'muted-foreground': '336 30% 24%',
    accent: '44 95% 69%',
    'accent-foreground': '336 36% 20%',
    destructive: '0 75% 57%',
    'destructive-foreground': '0 0% 98%',
    border: '330 45% 86%',
    input: '330 45% 86%',
    ring: '338 79% 58%',
    'chart-1': '338 79% 58%',
    'chart-2': '198 84% 60%',
    'chart-3': '44 95% 69%',
    'chart-4': '20 95% 67%',
    'chart-5': '274 75% 69%',
  },
  splash: {
    background: '51 100% 95%',
    foreground: '214 52% 18%',
    card: '0 0% 100%',
    'card-foreground': '214 52% 18%',
    popover: '0 0% 100%',
    'popover-foreground': '214 52% 18%',
    primary: '48 100% 54%',
    'primary-foreground': '214 52% 18%',
    secondary: '194 88% 90%',
    'secondary-foreground': '214 52% 18%',
    muted: '198 58% 92%',
    'muted-foreground': '214 36% 22%',
    accent: '210 89% 62%',
    'accent-foreground': '0 0% 100%',
    destructive: '0 75% 57%',
    'destructive-foreground': '0 0% 98%',
    border: '194 55% 82%',
    input: '194 55% 82%',
    ring: '210 89% 62%',
    'chart-1': '48 100% 54%',
    'chart-2': '210 89% 62%',
    'chart-3': '189 91% 49%',
    'chart-4': '12 95% 62%',
    'chart-5': '276 72% 65%',
  },
};
