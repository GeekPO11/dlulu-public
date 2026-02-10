import React from 'react';
import { Check, ChevronDown, Palette } from 'lucide-react';
import { cn } from '../lib/utils';
import { applyTheme, getActiveTheme, setTheme, THEME_STORAGE_KEY, type Theme } from '../lib/theme';
import { THEME_KEYS, THEME_METADATA } from '../lib/themes';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

interface ThemeToggleProps {
  className?: string;
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ className }) => {
  const [theme, setThemeState] = React.useState<Theme>(() => getActiveTheme());

  React.useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  React.useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const next = getActiveTheme();
      setThemeState(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const handleSelectTheme = (next: Theme) => {
    if (next === theme) return;
    setThemeState(next);
    setTheme(next);
  };

  const activeThemeMeta = THEME_METADATA[theme];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card/60 px-3 text-muted-foreground transition-colors hover:bg-card hover:text-foreground",
            className
          )}
          aria-label={`Select theme. Current theme: ${activeThemeMeta.label}`}
        >
          <Palette className="h-4 w-4 shrink-0" />
          <span className="max-w-24 truncate text-xs font-semibold uppercase tracking-wide hidden sm:inline">{activeThemeMeta.label}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <div className="flex flex-col gap-1">
          {THEME_KEYS.map((key) => {
            const option = THEME_METADATA[key];
            const selected = key === theme;
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleSelectTheme(key)}
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-left transition-all",
                  selected
                    ? "border-primary/30 bg-primary/10 text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground"
                )}
                aria-pressed={selected}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-3.5 rounded-full border border-foreground/15"
                      style={{ backgroundColor: `hsl(${option.preview})` }}
                      aria-hidden="true"
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-semibold">{option.label}</span>
                      <span className="truncate text-xs text-muted-foreground">{option.description}</span>
                    </span>
                  </span>
                  {selected && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ThemeToggle;
