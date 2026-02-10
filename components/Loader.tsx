import React, { useState, useEffect } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface LoaderStep {
  id: string;
  label: string;
  status: 'pending' | 'in-progress' | 'completed';
}

export interface LoaderConfig {
  title: string;
  subtitle: string;
  steps: LoaderStep[];
  estimatedDuration?: number; // in seconds
}

// =============================================================================
// Preset Loader Configurations
// =============================================================================

export const LOADER_CONFIGS = {
  analyzingAmbitions: {
    title: 'Analyzing your ambitions...',
    subtitle: 'We\'re identifying your core dreams and checking what you need to make them real.',
    steps: [
      { id: 'analyze', label: 'Processing your inputs', status: 'pending' as const },
      { id: 'goals', label: 'Identifying core ambitions', status: 'pending' as const },
      { id: 'prereqs', label: 'Checking prerequisites', status: 'pending' as const },
    ],
    estimatedDuration: 15, // Faster - only analysis
  },
  generatingBlueprint: {
    title: 'Creating your blueprint...',
    subtitle: 'Our AI is designing a strategic plan tailored to your ambitions.',
    steps: [
      { id: 'analyze', label: 'Analyzing ambition complexity', status: 'pending' as const },
      { id: 'phases', label: 'Structuring phases', status: 'pending' as const },
      { id: 'timeline', label: 'Calculating timeline', status: 'pending' as const },
      { id: 'optimize', label: 'Optimizing for success', status: 'pending' as const },
    ],
    estimatedDuration: 60, // Blueprint takes longer
  },
  buildingRoadmap: {
    title: 'Finding the path...',
    subtitle: 'Breaking down your ambitions into actionable steps and milestones.',
    steps: [
      { id: 'structure', label: 'Creating phase structure', status: 'pending' as const },
      { id: 'milestones', label: 'Defining milestones', status: 'pending' as const },
      { id: 'tasks', label: 'Generating tasks', status: 'pending' as const },
      { id: 'connect', label: 'Connecting the dots', status: 'pending' as const },
    ],
    estimatedDuration: 75, // Roadmap is comprehensive
  },
  generatingSchedule: {
    title: 'Building your schedule...',
    subtitle: 'Creating calendar events optimized for your availability and preferences.',
    steps: [
      { id: 'analyze', label: 'Analyzing time constraints', status: 'pending' as const },
      { id: 'slots', label: 'Finding optimal time slots', status: 'pending' as const },
      { id: 'events', label: 'Creating calendar events', status: 'pending' as const },
      { id: 'balance', label: 'Balancing workload', status: 'pending' as const },
    ],
    estimatedDuration: 45,
  },
  refiningPlan: {
    title: 'Refining your plan...',
    subtitle: 'Incorporating your feedback to improve the roadmap.',
    steps: [
      { id: 'parse', label: 'Understanding changes', status: 'pending' as const },
      { id: 'update', label: 'Updating structure', status: 'pending' as const },
      { id: 'validate', label: 'Validating timeline', status: 'pending' as const },
    ],
    estimatedDuration: 30,
  },
  savingProgress: {
    title: 'Saving your progress...',
    subtitle: 'Securely storing your ambitions and preferences.',
    steps: [
      { id: 'validate', label: 'Validating data', status: 'pending' as const },
      { id: 'save', label: 'Saving to cloud', status: 'pending' as const },
      { id: 'confirm', label: 'Confirming sync', status: 'pending' as const },
    ],
    estimatedDuration: 15,
  },
};

export type LoaderType = keyof typeof LOADER_CONFIGS;

// =============================================================================
// Loader Component Props
// =============================================================================

interface LoaderProps {
  type?: LoaderType;
  config?: LoaderConfig;
  progress?: number; // 0-100, if provided overrides auto-progress
  currentStep?: number; // 0-indexed, if provided overrides auto-step
  customSubtitle?: string; // Override subtitle with custom message (for progress updates)
  onComplete?: () => void;
}

// =============================================================================
// Loader Component
// =============================================================================

const Loader: React.FC<LoaderProps> = ({
  type = 'analyzingAmbitions',
  config: customConfig,
  progress: externalProgress,
  currentStep: externalStep,
  customSubtitle,
  onComplete,
}) => {
  const config = customConfig || LOADER_CONFIGS[type];
  const displaySubtitle = customSubtitle || config.subtitle;
  const [internalProgress, setInternalProgress] = useState(0);
  const [steps, setSteps] = useState<LoaderStep[]>(
    config.steps.map((s, i) => ({ ...s, status: i === 0 ? 'in-progress' : 'pending' }))
  );

  const progress = externalProgress !== undefined ? externalProgress : internalProgress;

  // Auto-progress simulation when no external progress provided
  // Uses easing: starts slow, speeds up, then slows down near the end
  useEffect(() => {
    if (externalProgress !== undefined) return;

    const duration = (config.estimatedDuration || 30) * 1000;
    const startTime = Date.now();

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const linearProgress = Math.min(elapsed / duration, 1);

      // Ease-out cubic: starts faster, slows down at end
      // But cap at 92% so it doesn't look like it's done
      const easedProgress = 1 - Math.pow(1 - linearProgress, 2.5);
      const cappedProgress = Math.min(easedProgress * 92, 92);

      // Add tiny random variation for natural feel
      const variation = (Math.random() - 0.5) * 0.5;

      setInternalProgress(prev => {
        // Only go forward, never backward
        const next = Math.max(prev, cappedProgress + variation);
        return Math.min(next, 92);
      });
    }, 200); // Update every 200ms for smoother appearance

    return () => clearInterval(timer);
  }, [externalProgress, config.estimatedDuration]);

  // Update steps based on progress
  useEffect(() => {
    if (externalStep !== undefined) {
      setSteps(config.steps.map((s, i) => ({
        ...s,
        status: i < externalStep ? 'completed' : i === externalStep ? 'in-progress' : 'pending',
      })));
      return;
    }

    const stepCount = config.steps.length;
    const progressPerStep = 100 / stepCount;
    const currentStepIndex = Math.min(
      Math.floor(progress / progressPerStep),
      stepCount - 1
    );

    setSteps(config.steps.map((s, i) => ({
      ...s,
      status: i < currentStepIndex ? 'completed' : i === currentStepIndex ? 'in-progress' : 'pending',
    })));
  }, [progress, externalStep, config.steps]);

  // Handle completion
  useEffect(() => {
    if (progress >= 100 && onComplete) {
      const timer = setTimeout(onComplete, 500);
      return () => clearTimeout(timer);
    }
  }, [progress, onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-slate-100 via-blue-50/50 to-blue-50/30">
      {/* Background ambient effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-200/30 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-200/30 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Loader Card */}
      <div className="relative w-full max-w-md mx-4 bg-white rounded-3xl shadow-2xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
        {/* Header with Logo */}
        <div className="pt-8 pb-4 flex justify-center">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 flex items-center justify-center">
              <img src="/logoFinal.png" className="w-full h-full object-contain shadow-lg shadow-primary/10" alt="Dlulu Logo" />
            </div>
            <span className="font-semibold text-slate-700 tracking-tight">dlulu life</span>
          </div>
        </div>

        {/* Animated Icon */}
        <div className="flex justify-center py-6">
          <div className="relative">
            {/* Outer rotating ring */}
            <div className="w-24 h-24 rounded-full border-4 border-slate-100 flex items-center justify-center">
              <div
                className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary border-r-blue-300"
                style={{ animation: 'spin 2s linear infinite' }}
              />
              {/* Inner sparkle icon */}
              <div className="relative z-10 text-primary">
                <svg
                  width="36"
                  height="36"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="animate-pulse"
                  style={{ animationDuration: '1.5s' }}
                >
                  <path
                    d="M12 2L13.09 8.26L18 6L14.74 10.91L21 12L14.74 13.09L18 18L13.09 15.74L12 22L10.91 15.74L6 18L9.26 13.09L3 12L9.26 10.91L6 6L10.91 8.26L12 2Z"
                    fill="currentColor"
                  />
                </svg>
              </div>
            </div>
            {/* Floating sparkles */}
            <div
              className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full opacity-60"
              style={{ animation: 'float 3s ease-in-out infinite' }}
            />
            <div
              className="absolute -bottom-2 -left-2 w-2 h-2 bg-primary rounded-full opacity-50"
              style={{ animation: 'float 3s ease-in-out infinite', animationDelay: '1s' }}
            />
          </div>
        </div>

        {/* Title & Subtitle */}
        <div className="px-8 text-center">
          <h2 className="text-xl font-bold text-slate-800 mb-2">
            {config.title}
          </h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            {displaySubtitle}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="px-8 py-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500">Processing inputs</span>
            <span className="text-xs font-semibold text-slate-600">{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Steps Checklist */}
        <div className="px-8 pb-8">
          <div className="space-y-3">
            {steps.map((step) => (
              <div
                key={step.id}
                className={`flex items-center gap-3 transition-opacity duration-300 ${step.status === 'pending' ? 'opacity-40' : 'opacity-100'
                  }`}
              >
                {/* Status Icon */}
                <div className="flex-shrink-0">
                  {step.status === 'completed' ? (
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                      <svg className="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : step.status === 'in-progress' ? (
                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-slate-200" />
                  )}
                </div>

                {/* Label */}
                <span className={`text-sm ${step.status === 'in-progress'
                  ? 'font-semibold text-slate-800'
                  : step.status === 'completed'
                    ? 'text-slate-600'
                    : 'text-slate-400'
                  }`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0) scale(1); opacity: 0.6; }
          50% { transform: translateY(-8px) scale(1.2); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default Loader;
