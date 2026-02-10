import React from 'react';
import ThemeToggle from './ThemeToggle';
import { cn } from '../lib/utils';

interface OnboardingHeaderProps {
  onClose: () => void;
  progressStep?: number;
  isAddGoalMode?: boolean;
  className?: string;
  closeAriaLabel?: string;
}

const OnboardingHeader: React.FC<OnboardingHeaderProps> = ({
  onClose,
  progressStep = 0,
  isAddGoalMode = false,
  className,
  closeAriaLabel = 'Close',
}) => {
  const activeStep = Math.max(0, Math.min(2, progressStep));

  return (
    <header className={cn('fixed top-0 w-full z-50 glass-nav', className)}>
      <div className="w-full flex items-center justify-between gap-4 px-6 lg:px-10 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 flex items-center justify-center">
            <img src="/logoFinal.png" className="w-full h-full object-contain" alt="Dlulu Logo" />
          </div>
          <h2 className="text-foreground text-xl font-bold leading-tight tracking-tight">dlulu life</h2>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {!isAddGoalMode && (
            <div className="hidden md:flex gap-2 mr-2">
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  className={cn('h-1.5 w-8 rounded-full', activeStep >= index ? 'bg-primary' : 'bg-muted')}
                />
              ))}
            </div>
          )}

          <ThemeToggle />
          <button
            type="button"
            onClick={onClose}
            aria-label={closeAriaLabel}
            className="flex items-center justify-center rounded-xl h-10 w-10 bg-card/60 border border-border hover:bg-card transition-colors"
          >
            <span className="material-symbols-outlined text-foreground text-[20px]">close</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default OnboardingHeader;
