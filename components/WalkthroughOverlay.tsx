import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';

export type WalkthroughStep = {
  id: string;
  selector: string;
  title: string;
  body: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
};

interface WalkthroughOverlayProps {
  steps: WalkthroughStep[];
  stepIndex: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onComplete: () => void;
  canProceed?: boolean;
  primaryLabel?: string;
  isWaiting?: boolean;
}

type TooltipPosition = {
  top: number;
  left: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const WalkthroughOverlay: React.FC<WalkthroughOverlayProps> = ({
  steps,
  stepIndex,
  onNext,
  onBack,
  onSkip,
  onComplete,
  canProceed = true,
  primaryLabel,
  isWaiting,
}) => {
  const step = steps[stepIndex];
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null);

  useLayoutEffect(() => {
    if (!step) return;

    let isActive = true;
    let retryTimer: number | undefined;

    const updateRect = () => {
      if (!isActive) return;
      const elements = Array.from(document.querySelectorAll(step.selector)) as HTMLElement[];
      let rect: DOMRect | null = null;
      for (const element of elements) {
        const candidateRect = element.getBoundingClientRect();
        if (candidateRect.width !== 0 || candidateRect.height !== 0) {
          rect = candidateRect;
          break;
        }
      }

      if (!rect) {
        setTargetRect(null);
        retryTimer = window.setTimeout(updateRect, 200);
        return;
      }
      setTargetRect(rect);
    };

    updateRect();

    const handleViewportChange = () => {
      updateRect();
    };

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      isActive = false;
      if (retryTimer) window.clearTimeout(retryTimer);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [step]);

  useLayoutEffect(() => {
    if (!targetRect || !tooltipRef.current || !step) {
      setTooltipPosition(null);
      return;
    }

    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const spacing = 12;
    const margin = 12;
    const placement = step.placement || 'bottom';

    let top = targetRect.bottom + spacing;
    let left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;

    if (placement === 'top') {
      top = targetRect.top - tooltipRect.height - spacing;
    }
    if (placement === 'left') {
      top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
      left = targetRect.left - tooltipRect.width - spacing;
    }
    if (placement === 'right') {
      top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
      left = targetRect.right + spacing;
    }

    if (placement === 'bottom' && top + tooltipRect.height > window.innerHeight - margin) {
      top = targetRect.top - tooltipRect.height - spacing;
    }
    if (placement === 'top' && top < margin) {
      top = targetRect.bottom + spacing;
    }
    if (placement === 'left' && left < margin) {
      left = targetRect.right + spacing;
    }
    if (placement === 'right' && left + tooltipRect.width > window.innerWidth - margin) {
      left = targetRect.left - tooltipRect.width - spacing;
    }

    top = clamp(top, margin, window.innerHeight - tooltipRect.height - margin);
    left = clamp(left, margin, window.innerWidth - tooltipRect.width - margin);

    setTooltipPosition({ top, left });
  }, [targetRect, step, stepIndex]);

  const highlightStyle = useMemo(() => {
    if (!targetRect) return undefined;
    const padding = 8;
    const top = Math.max(targetRect.top - padding, 0);
    const left = Math.max(targetRect.left - padding, 0);
    const width = Math.min(targetRect.width + padding * 2, window.innerWidth - left);
    const height = Math.min(targetRect.height + padding * 2, window.innerHeight - top);

    return {
      top,
      left,
      width,
      height,
    };
  }, [targetRect]);

  if (!step || !targetRect || !highlightStyle) return null;

  const isLastStep = stepIndex >= steps.length - 1;
  const handlePrimaryAction = () => {
    if (!canProceed) return;
    if (isLastStep) {
      onComplete();
      return;
    }
    onNext();
  };
  const primaryText = primaryLabel || (isLastStep ? 'Finish' : 'Next');

  return (
    <div className="fixed inset-0 z-[70] pointer-events-none">
      <div className="absolute inset-0" aria-hidden="true" />
      <div
        className="fixed rounded-2xl border border-border/60 bg-transparent transition-all duration-200"
        style={{
          top: highlightStyle.top,
          left: highlightStyle.left,
          width: highlightStyle.width,
          height: highlightStyle.height,
          boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.55)',
        }}
      />

      <div
        ref={tooltipRef}
        className="fixed pointer-events-auto w-[280px] sm:w-[320px] bg-card/95 backdrop-blur-md border border-border rounded-2xl p-4 shadow-2xl"
        style={tooltipPosition ? { top: tooltipPosition.top, left: tooltipPosition.left } : { top: 0, left: 0, opacity: 0 }}
      >
        <div className="flex items-center justify-between text-xs uppercase tracking-widest text-muted-foreground mb-2">
          <span>Walkthrough</span>
          <span>{stepIndex + 1} / {steps.length}</span>
        </div>
        <h3 className="text-foreground font-semibold text-base mb-2">{step.title}</h3>
        <p className="text-muted-foreground text-sm leading-relaxed mb-4">{step.body}</p>
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={onSkip}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              disabled={stepIndex === 0}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Back
            </button>
            <button
              onClick={handlePrimaryAction}
              disabled={!canProceed}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-brand-gradient text-primary-foreground hover:brightness-110 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {primaryText}
            </button>
          </div>
        </div>
        {isWaiting && !canProceed && (
          <p className="text-[10px] text-muted-foreground mt-2">
            Waiting for your action to continue.
          </p>
        )}
      </div>
    </div>
  );
};

export default WalkthroughOverlay;
