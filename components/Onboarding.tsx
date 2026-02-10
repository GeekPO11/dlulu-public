import React, { useState, useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import { analyzeAmbitions, generatePrerequisites, generateFullPlan, parseRosterImage, goalsToRoadmap } from '../services/gemini';
import type { FullPlanResponse } from '../services/gemini';
import RoadmapView from './RoadmapView';
import NeuralAnalysisLoader from './NeuralAnalysisLoader';
import BlueprintReveal from './BlueprintReveal';
import StatusCheck, { type AnalyzedGoal, type GoalContext } from './StatusCheck';
import FloatingBubbles from './FloatingBubbles';
import OnboardingHeader from './OnboardingHeader';
import WalkthroughOverlay, { type WalkthroughStep } from './WalkthroughOverlay';
import { POPULAR_GOALS } from '../constants/goals';
import { logger } from '../lib/logger';
import { analytics, AnalyticsEvents, OnboardingStepNames } from '../lib/analytics';
import { cn } from '../lib/utils';
import { calculateWeeklyAvailability } from '../utils/availability';
import type {
  UserProfile,
  Prerequisite,
  GoalStatusContext,
  TimeConstraints,
  TimeBlock,
  Goal,
  Phase,
  Commitment,
  GapAnalysisResponse,
  AmbitionAnalysisResponse,
  Chronotype,
  EnergyLevel,
  GoalCategory,
  GoalIntakeAnswerValue,
  GoalIntakeAnswers,
  GoalIntakeQuestion,
  GoalIntakeQuestionType,
  Roadmap
} from '../types';
import type { CalendarEvent } from '../constants/calendarTypes';

// =============================================================================
// Types
// =============================================================================

interface OnboardingProps {
  onComplete: (
    profile: UserProfile,
    constraints: TimeConstraints,
    goals: Goal[],
    commitments: Commitment[],
    events?: CalendarEvent[]
  ) => void;
  onBack: () => void;
  initialAmbition?: string;
  onSignUpClick?: () => void;
  initialProfile?: Partial<UserProfile>; // For existing users adding goals
  initialStep?: number; // 0 for new users, 1 for adding goals
  isAddGoalMode?: boolean; // If true, skip profile and boundaries steps
  initialConstraints?: Partial<TimeConstraints>;
  existingGoals?: Goal[];
  walkthroughSeen?: boolean;
  onWalkthroughComplete?: () => void;
}

// =============================================================================
// SVG Icons for Icon Selectors
// =============================================================================

const SunriseIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const SunIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const MoonIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
  </svg>
);

const ClockIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const BoltIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

const ScaleIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
  </svg>
);

const LeafIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

// =============================================================================
// UI Components
// =============================================================================

// Animated background orbs - Warm Indian/YC aesthetic
// Animated background orbs - Stitch Dark Coffee Aesthetic
const BackgroundOrbs: React.FC = () => (
  <div className="fixed inset-0 overflow-hidden pointer-events-none">
    <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[120px] animate-float-1" />
    <div className="absolute bottom-[-10%] left-[-10%] w-[30%] h-[30%] rounded-full bg-blue-500/5 blur-[100px] animate-float-2" />
    <div className="absolute top-[40%] left-[20%] w-[20%] h-[20%] rounded-full bg-primary/5 blur-[80px] animate-float-3" />
  </div>
);

// Compact progress dots with step label - Orange theme
const ProgressDots: React.FC<{ current: number; total: number; stepLabels: string[] }> = ({ current, total, stepLabels }) => (
  <div className="flex flex-col items-center gap-1.5">
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`
            h-2 rounded-full transition-all duration-300
            ${i === current
              ? 'w-6 bg-primary'
              : i < current
                ? 'w-2 bg-primary/70'
                : 'w-2 bg-muted'
            }
          `}
        />
      ))}
    </div>
    <span className="text-xs font-medium text-muted-foreground">
      Step {current + 1}: {stepLabels[current]}
    </span>
  </div>
);



const CompactInput: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'textarea' | 'time';
  optional?: boolean;
  rows?: number;
}> = ({ label, value, onChange, placeholder, type = 'text', optional, rows = 2 }) => (
  <div className="relative">
    <label className="block text-sm font-medium text-muted-foreground mb-2 px-1">
      {label}
      {optional && <span className="text-muted-foreground/70 font-normal ml-1">(optional)</span>}
    </label>
    {type === 'textarea' ? (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="form-input w-full rounded-xl text-foreground focus:outline-0 focus:ring-1 focus:ring-primary border border-border bg-card/60 focus:border-primary p-4 text-base placeholder:text-muted-foreground transition-all resize-none"
      />
    ) : (
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="form-input w-full rounded-xl text-foreground focus:outline-0 focus:ring-1 focus:ring-primary border border-border bg-card/60 focus:border-primary h-14 placeholder:text-muted-foreground p-4 text-base transition-all"
      />
    )}
  </div>
);

const PrimaryButton: React.FC<{
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}> = ({ children, onClick, disabled, size = 'md' }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`
      inline-flex items-center justify-center gap-2 rounded-xl font-semibold
      transition-all duration-200
      ${size === 'sm' ? 'py-2 px-4 text-sm' : 'py-2.5 px-6 text-sm'}
      ${disabled
        ? 'bg-muted text-muted-foreground cursor-not-allowed'
        : 'bg-brand-gradient glow-button text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30'
      }
    `}
  >
    {children}
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
    </svg>
  </button>
);

// =============================================================================
// Main Component
// =============================================================================

const parseInitialAmbition = (ambition: string | undefined) => {
  if (!ambition) return { selected: [] as string[], custom: '' };
  return { selected: [], custom: ambition };
};

// Compact icon option selector - Orange theme
const IconOption: React.FC<{
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  onClick: () => void;
}> = ({ icon, label, selected, onClick }) => (
  <button
    onClick={onClick}
    className={`
      flex flex-col items-center gap-1 p-2.5 rounded-xl transition-all duration-200
      ${selected
        ? 'bg-primary/10 ring-2 ring-primary text-primary'
        : 'bg-card/60 border border-border text-muted-foreground hover:text-foreground hover:border-primary/50'
      }
    `}
  >
    <span className={selected ? 'text-primary' : 'text-muted-foreground'}>{icon}</span>
    <span className="text-xs font-medium">{label}</span>
  </button>
);

// Simple Info Tooltip Component
const InfoTooltip: React.FC<{ text: string }> = ({ text }) => (
  <div className="group relative inline-flex items-center ml-2">
    <span className="material-symbols-outlined text-muted-foreground/70 text-[16px] cursor-help hover:text-foreground transition-colors">info</span>
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-popover/95 backdrop-blur border border-border rounded-lg text-xs text-popover-foreground shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none text-center">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-popover/95"></div>
    </div>
  </div>
);

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEK_PATTERN_OPTIONS: Array<{ value: 'default' | 'A' | 'B'; label: string }> = [
  { value: 'default', label: 'Every week' },
  { value: 'A', label: 'Week A' },
  { value: 'B', label: 'Week B' },
];

const AVAILABILITY_TEMPLATES: Array<{
  id: string;
  label: string;
  description: string;
  constraints: Partial<TimeConstraints>;
}> = [
    {
      id: 'student',
      label: 'Student',
      description: 'Classes mid-day + study blocks',
      constraints: {
        workBlocks: [
          { id: 'student-class', title: 'Classes', days: [0, 1, 2, 3, 4], start: '09:00', end: '15:00', type: 'work', isFlexible: false, weekPattern: 'default' },
        ],
        blockedSlots: [
          { id: 'student-study', title: 'Study / Assignments', days: [0, 1, 2, 3, 4], start: '18:00', end: '20:00', type: 'personal', isFlexible: true, weekPattern: 'default' },
        ],
        sleepStart: '23:00',
        sleepEnd: '07:00',
        peakStart: '10:00',
        peakEnd: '12:00',
      },
    },
    {
      id: 'shift',
      label: 'Shift Worker',
      description: 'Rotating Week A/B shifts',
      constraints: {
        workBlocks: [
          { id: 'shift-a', title: 'Shift (Week A)', days: [0, 1, 2, 3], start: '07:00', end: '15:00', type: 'work', isFlexible: false, weekPattern: 'A' },
          { id: 'shift-b', title: 'Shift (Week B)', days: [2, 3, 4, 5], start: '15:00', end: '23:00', type: 'work', isFlexible: false, weekPattern: 'B' },
        ],
        blockedSlots: [],
        sleepStart: '23:30',
        sleepEnd: '07:30',
        peakStart: '09:00',
        peakEnd: '11:00',
      },
    },
    {
      id: 'parent',
      label: 'Parent',
      description: 'School runs + work hours',
      constraints: {
        workBlocks: [
          { id: 'parent-work', title: 'Work', days: [0, 1, 2, 3, 4], start: '09:30', end: '16:30', type: 'work', isFlexible: false, weekPattern: 'default' },
        ],
        blockedSlots: [
          { id: 'parent-morning', title: 'School / Morning Routine', days: [0, 1, 2, 3, 4], start: '07:00', end: '08:30', type: 'personal', isFlexible: false, weekPattern: 'default' },
          { id: 'parent-evening', title: 'Family Time', days: [0, 1, 2, 3, 4], start: '17:30', end: '20:30', type: 'personal', isFlexible: false, weekPattern: 'default' },
        ],
        sleepStart: '22:30',
        sleepEnd: '06:30',
        peakStart: '10:00',
        peakEnd: '12:00',
      },
    },
    {
      id: 'senior',
      label: 'Senior',
      description: 'Flexible days + morning peak',
      constraints: {
        workBlocks: [],
        blockedSlots: [
          { id: 'senior-errands', title: 'Appointments / Errands', days: [1, 3, 5], start: '10:00', end: '12:00', type: 'personal', isFlexible: true, weekPattern: 'default' },
        ],
        sleepStart: '21:30',
        sleepEnd: '06:00',
        peakStart: '08:00',
        peakEnd: '10:00',
      },
    },
  ];

const GlassCard: React.FC<{
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>> = ({ children, className = '', ...props }) => (
  <div className={`
    glass-card relative rounded-2xl
    text-foreground shadow-2xl
    ${className}
  `} {...props}>
    {children}
  </div>
);

// Compact icon option selector - Orange theme

interface IntakeGoalConfig {
  goalTitle: string;
  category: GoalCategory;
  questions: GoalIntakeQuestion[];
}

const INTAKE_SCHEMA_VERSION = '2026-03';
const INTAKE_ALLOWED_TYPES: GoalIntakeQuestionType[] = [
  'short_text',
  'long_text',
  'number',
  'single_select',
  'multi_select',
  'boolean',
  'date',
];

const SENSITIVE_GOAL_CATEGORIES: GoalCategory[] = ['health', 'financial', 'relationships'];

const slugifyFieldKey = (input: string): string => {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'field';
};

const normalizeFieldKey = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
};

const CANONICAL_INTAKE_FIELD_ALIASES: Record<string, string[]> = {
  current_state: ['current_state', 'current_status', 'starting_point', 'baseline_state', 'current_situation'],
  target_state: ['target_state', 'desired_state', 'goal_state', 'target_outcome', 'desired_outcome'],
  target_timeframe_weeks: [
    'target_timeframe_weeks',
    'timeframe_weeks',
    'timeline_weeks',
    'target_weeks',
    'deadline_weeks',
    'target_timeframe',
    'time_horizon_weeks',
    'target_date',
  ],
  current_weight_kg: ['current_weight_kg', 'current_weight', 'weight_kg', 'current_weight_lb', 'current_weight_lbs'],
  target_weight_kg: ['target_weight_kg', 'target_weight', 'goal_weight', 'goal_weight_kg', 'target_weight_lb', 'target_weight_lbs'],
  lifestyle_pattern: ['lifestyle_pattern', 'lifestyle', 'activity_level', 'daily_activity_level', 'routine_pattern'],
  age_group: ['age_group', 'age_range', 'age_bracket', 'age'],
  current_net_worth: ['current_net_worth', 'net_worth_current', 'starting_net_worth'],
  target_net_worth: ['target_net_worth', 'goal_net_worth', 'desired_net_worth'],
  monthly_income: ['monthly_income', 'income_monthly', 'monthly_take_home', 'take_home_monthly'],
  monthly_expenses: ['monthly_expenses', 'expenses_monthly', 'monthly_spend', 'monthly_spending'],
  current_relationship_state: ['current_relationship_state', 'relationship_status', 'relationship_context'],
  target_relationship_outcome: ['target_relationship_outcome', 'relationship_goal', 'desired_relationship_outcome'],
};

const INTAKE_FIELD_HINTS: Record<string, RegExp[]> = {
  current_state: [/where are you currently/i, /current (situation|status|state|level)/i, /baseline/i],
  target_state: [/target (state|outcome)/i, /desired (state|outcome|result)/i, /what (exact )?outcome/i],
  target_timeframe_weeks: [/time ?frame/i, /\bdeadline\b/i, /by when/i, /\bhow long\b/i, /\bweeks?\b/i, /target date/i],
  current_weight_kg: [/current weight/i, /what do you weigh/i, /weight now/i],
  target_weight_kg: [/target weight/i, /goal weight/i, /want to weigh/i],
  lifestyle_pattern: [/lifestyle/i, /activity level/i, /daily routine/i, /how active/i],
  age_group: [/\bage\b/i, /age group/i, /age range/i],
  current_net_worth: [/current net worth/i, /net worth now/i, /assets minus liabilities/i],
  target_net_worth: [/target net worth/i, /goal net worth/i, /desired net worth/i],
  monthly_income: [/monthly income/i, /monthly take[- ]?home/i, /income per month/i],
  monthly_expenses: [/monthly expenses/i, /monthly spend/i, /expenses per month/i],
  current_relationship_state: [/current relationship/i, /relationship status/i, /relationship now/i],
  target_relationship_outcome: [/target relationship/i, /relationship outcome/i, /desired relationship/i],
};

const INTAKE_FIELD_ALIAS_LOOKUP = Object.entries(CANONICAL_INTAKE_FIELD_ALIASES)
  .reduce((lookup, [canonical, aliases]) => {
    aliases.forEach((alias) => {
      lookup.set(normalizeFieldKey(alias), canonical);
    });
    return lookup;
  }, new Map<string, string>());

const isIntakeAnswerFilled = (value: GoalIntakeAnswerValue | undefined): boolean => {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  return false;
};

const toAnswerText = (value: GoalIntakeAnswerValue | undefined): string => {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
};

const parseNumericAnswer = (value: GoalIntakeAnswerValue | undefined): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '').trim();
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const buildIntakeRealityChecks = (
  category: GoalCategory,
  answers: GoalIntakeAnswers
): string[] => {
  const warnings: string[] = [];
  const timeframeWeeks = parseNumericAnswer(answers.target_timeframe_weeks);

  if (timeframeWeeks !== null && timeframeWeeks <= 1) {
    warnings.push('A one-week timeline is usually too short for meaningful progress. Expect to expand the timeline.');
  }

  if (category === 'health') {
    const currentWeight = parseNumericAnswer(answers.current_weight_kg);
    const targetWeight = parseNumericAnswer(answers.target_weight_kg);
    if (currentWeight !== null && targetWeight !== null && timeframeWeeks && timeframeWeeks > 0) {
      const delta = Math.abs(currentWeight - targetWeight);
      const perWeek = delta / timeframeWeeks;
      if (perWeek > 1.2) {
        warnings.push(
          `Your requested pace is about ${perWeek.toFixed(1)} kg/week, which is generally aggressive. A safer timeline is recommended.`
        );
      }
    }
  }

  if (category === 'financial') {
    const currentNetWorth = Math.max(0, parseNumericAnswer(answers.current_net_worth) || 0);
    const targetNetWorth = Math.max(0, parseNumericAnswer(answers.target_net_worth) || 0);
    if (timeframeWeeks && timeframeWeeks > 0 && targetNetWorth > 0) {
      if (targetNetWorth >= 1_000_000 && timeframeWeeks <= 12) {
        warnings.push('Reaching $1M in under ~3 months is usually unrealistic without exceptional starting conditions.');
      }
      if (currentNetWorth > 0) {
        const growthMultiple = targetNetWorth / currentNetWorth;
        if (growthMultiple >= 20 && timeframeWeeks < 52) {
          warnings.push('The requested wealth growth multiple is very high for the selected timeframe.');
        }
      }
    }
  }

  return warnings;
};

const getMissingRequiredIntakeFields = (
  questions: GoalIntakeQuestion[],
  answers: GoalIntakeAnswers
): string[] => {
  return questions
    .filter((question) => question.required)
    .filter((question) => !isIntakeAnswerFilled(answers[question.fieldKey]))
    .map((question) => question.fieldKey);
};

const REQUIRED_INTAKE_FIELDS_BY_CATEGORY: Record<GoalCategory, string[]> = {
  health: ['current_state', 'target_state', 'target_timeframe_weeks'],
  financial: ['current_state', 'target_state', 'target_timeframe_weeks'],
  relationships: ['current_relationship_state', 'target_relationship_outcome', 'target_timeframe_weeks'],
  career: ['current_state', 'target_state', 'target_timeframe_weeks'],
  learning: ['current_state', 'target_state', 'target_timeframe_weeks'],
  personal: ['current_state', 'target_state', 'target_timeframe_weeks'],
};

const REQUIRED_INTAKE_FIELD_GROUPS_BY_CATEGORY: Record<GoalCategory, string[][]> = {
  health: [
    ['target_timeframe_weeks'],
    ['current_weight_kg', 'current_state'],
    ['target_weight_kg', 'target_state'],
  ],
  financial: [
    ['target_timeframe_weeks'],
    ['current_net_worth', 'current_state'],
    ['target_net_worth', 'target_state'],
  ],
  relationships: [
    ['current_relationship_state'],
    ['target_relationship_outcome'],
    ['target_timeframe_weeks'],
  ],
  career: [
    ['current_state'],
    ['target_state'],
    ['target_timeframe_weeks'],
  ],
  learning: [
    ['current_state'],
    ['target_state'],
    ['target_timeframe_weeks'],
  ],
  personal: [
    ['current_state'],
    ['target_state'],
    ['target_timeframe_weeks'],
  ],
};

const normalizeGoalCategory = (value: unknown): GoalCategory => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (
    normalized === 'health'
    || normalized === 'career'
    || normalized === 'learning'
    || normalized === 'personal'
    || normalized === 'financial'
    || normalized === 'relationships'
  ) {
    return normalized;
  }
  return 'personal';
};

const inferCanonicalFieldKey = (
  category: GoalCategory,
  rawFieldKey: unknown,
  questionText: string
): string => {
  const normalizedRaw = normalizeFieldKey(rawFieldKey);
  if (normalizedRaw && INTAKE_FIELD_ALIAS_LOOKUP.has(normalizedRaw)) {
    return INTAKE_FIELD_ALIAS_LOOKUP.get(normalizedRaw)!;
  }
  if (normalizedRaw) {
    return normalizedRaw;
  }

  const categoryRequired = REQUIRED_INTAKE_FIELDS_BY_CATEGORY[category] || REQUIRED_INTAKE_FIELDS_BY_CATEGORY.personal;
  for (const requiredField of categoryRequired) {
    const hints = INTAKE_FIELD_HINTS[requiredField] || [];
    if (hints.some((pattern) => pattern.test(questionText))) {
      return requiredField;
    }
  }

  for (const [canonical, hints] of Object.entries(INTAKE_FIELD_HINTS)) {
    if (hints.some((pattern) => pattern.test(questionText))) {
      return canonical;
    }
  }

  return normalizedRaw || slugifyFieldKey(questionText);
};

const hasRequiredIntakeCoverage = (
  category: GoalCategory,
  questions: GoalIntakeQuestion[]
): boolean => {
  const requiredGroups = REQUIRED_INTAKE_FIELD_GROUPS_BY_CATEGORY[category]
    || REQUIRED_INTAKE_FIELD_GROUPS_BY_CATEGORY.personal;
  const present = new Set(
    questions
      .map((question) => normalizeFieldKey(question.fieldKey))
      .filter((fieldKey) => typeof fieldKey === 'string' && fieldKey.trim().length > 0)
  );
  return requiredGroups.every((group) => group.some((fieldKey) => present.has(normalizeFieldKey(fieldKey))));
};

const normalizeIntakeQuestions = (
  goalTitle: string,
  _category: GoalCategory,
  questions: GoalIntakeQuestion[] | undefined
): GoalIntakeQuestion[] => {
  if (!Array.isArray(questions) || questions.length === 0) return [];

  const normalized = questions
    .map((question, index) => {
      if (!question || typeof question !== 'object') return null;
      const questionText = question.question?.trim();
      if (!questionText) return null;
      const fieldKey = inferCanonicalFieldKey(_category, question.fieldKey, questionText);
      if (!fieldKey) return null;

      const type = INTAKE_ALLOWED_TYPES.includes(question.type)
        ? question.type
        : null;
      if (!type) return null;

      const options = Array.isArray(question.options)
        ? question.options
          .map((option, optionIndex) => {
            const value = typeof option?.value === 'string' ? option.value.trim() : '';
            const label = typeof option?.label === 'string' ? option.label.trim() : value;
            if (!value || !label) return null;
            return {
              id: option.id || `${fieldKey}_option_${optionIndex + 1}`,
              label,
              value,
            };
          })
          .filter((option): option is NonNullable<typeof option> => !!option)
        : undefined;

      if ((type === 'single_select' || type === 'multi_select') && (!options || options.length === 0)) {
        return null;
      }

      const required = typeof question.required === 'boolean'
        ? question.required
        : true;

      return {
        id: question.id || `${slugifyFieldKey(goalTitle)}_${fieldKey}`,
        fieldKey,
        question: questionText,
        helperText: question.helperText?.trim() || undefined,
        placeholder: question.placeholder?.trim() || undefined,
        type,
        required,
        options,
        min: typeof question.min === 'number' ? question.min : undefined,
        max: typeof question.max === 'number' ? question.max : undefined,
        unit: typeof question.unit === 'string' ? question.unit : undefined,
        sensitivity: question.sensitivity || 'general',
      } as GoalIntakeQuestion;
    })
    .filter((question): question is GoalIntakeQuestion => !!question);

  return normalized.slice(0, 12);
};

const buildIntakeSummary = (
  questions: GoalIntakeQuestion[],
  answers: GoalIntakeAnswers,
  missingRequired: string[]
): string => {
  const lines = questions
    .filter((question) => isIntakeAnswerFilled(answers[question.fieldKey]))
    .slice(0, 8)
    .map((question) => `${question.question}: ${toAnswerText(answers[question.fieldKey])}`);

  if (missingRequired.length > 0) {
    lines.push(`Missing required fields: ${missingRequired.join(', ')}`);
  }

  return lines.join('\n');
};

const Onboarding: React.FC<OnboardingProps> = ({
  onComplete,
  onBack,
  initialAmbition,
  onSignUpClick,
  initialProfile,
  initialStep = 0,
  isAddGoalMode = false,
  initialConstraints,
  existingGoals = [],
  walkthroughSeen,
  onWalkthroughComplete,
}) => {
  // Onboarding component initialized
  const [step, setStep] = useState(initialStep);
  const [isLoading, setIsLoading] = useState(false);
  const [loaderProgress, setLoaderProgress] = useState<number | undefined>(undefined);
  const [loaderSubtitle, setLoaderSubtitle] = useState<string | undefined>(undefined);
  const [isTimePrefsExpanded, setIsTimePrefsExpanded] = useState(false);
  const [isGeneratingBlueprint, setIsGeneratingBlueprint] = useState(false);
  const [currentGoalIndex, setCurrentGoalIndex] = useState(0);
  const [showFeasibilityReview, setShowFeasibilityReview] = useState(false);
  const [reviewGoals, setReviewGoals] = useState<Goal[]>([]);
  const [riskAcknowledgements, setRiskAcknowledgements] = useState<Record<string, boolean>>({});
  const [overrideFeasibility, setOverrideFeasibility] = useState(false);
  const [stepStartTime, setStepStartTime] = useState<number>(Date.now());

  // Track onboarding started on mount
  useEffect(() => {
    analytics.track(AnalyticsEvents.ONBOARDING_STARTED);
    analytics.timeEvent(AnalyticsEvents.ONBOARDING_COMPLETED);
  }, []);

  // Track step changes
  useEffect(() => {
    if (step > 0) {
      // Calculate duration of previous step
      const duration = Math.floor((Date.now() - stepStartTime) / 1000);
      const prevStepIndex = step - 1;
      const prevStepName = OnboardingStepNames[prevStepIndex] || 'unknown';

      analytics.track(AnalyticsEvents.ONBOARDING_STEP_COMPLETED, {
        step_index: prevStepIndex,
        step_name: prevStepName,
        duration_seconds: duration,
      });
    }
    // Reset timer for current step
    setStepStartTime(Date.now());
  }, [step]);

  // Step 0: Profile
  const [profile, setProfile] = useState({
    name: initialProfile?.name || '',
    role: initialProfile?.role || '',
    roleContext: initialProfile?.roleContext || '',
    bio: initialProfile?.bio || '',
    chronotype: (initialProfile?.chronotype || 'flexible') as Chronotype,
    energyLevel: (initialProfile?.energyLevel || 'balanced') as EnergyLevel,
  });

  // Steps handling omitted...

  // Step 1: Ambitions
  const { selected: initialSelectedGoals, custom: initialCustomInput } = useMemo(() => {
    if (!initialAmbition) return { selected: [] as string[], custom: '' };
    return { selected: [], custom: initialAmbition };
  }, [initialAmbition]);

  const [ambitionInput, setAmbitionInput] = useState(initialCustomInput);
  const [selectedGoals, setSelectedGoals] = useState<string[]>(initialSelectedGoals);

  // Step 2: Status Check + Intake
  const [analysisResult, setAnalysisResult] = useState<AmbitionAnalysisResponse | null>(null);
  const [analyzedGoals, setAnalyzedGoals] = useState<AnalyzedGoal[]>([]);
  const [intakeGoalConfigs, setIntakeGoalConfigs] = useState<IntakeGoalConfig[]>([]);
  const [intakeResponsesByGoalIndex, setIntakeResponsesByGoalIndex] = useState<Record<number, GoalIntakeAnswers>>({});
  const [intakeValidationErrors, setIntakeValidationErrors] = useState<Record<string, string>>({});
  const [ambitionAnalysisError, setAmbitionAnalysisError] = useState<string | null>(null);
  const [prerequisitesGenerationError, setPrerequisitesGenerationError] = useState<string | null>(null);
  const [intakeRealityAcknowledgements, setIntakeRealityAcknowledgements] = useState<Record<number, boolean>>({});
  const [currentIntakeGoalIndex, setCurrentIntakeGoalIndex] = useState(0);
  const [showIntakeStep, setShowIntakeStep] = useState(false);
  const [showStatusCheck, setShowStatusCheck] = useState(false);
  const [isGeneratingPrerequisites, setIsGeneratingPrerequisites] = useState(false);
  const [prerequisites, setPrerequisites] = useState<Prerequisite[]>([]);
  const [prerequisiteNotes, setPrerequisiteNotes] = useState<Record<string, string>>({});
  const [goalAdditionalNotes, setGoalAdditionalNotes] = useState<Record<string, string>>({});

  // Step 3: Roadmap Generation
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [showRoadmapView, setShowRoadmapView] = useState(false);

  // Step 5: Generated
  const [generatedGoals, setGeneratedGoals] = useState<Goal[]>([]);

  // Step 4: Boundaries
  const [constraints, setConstraints] = useState<Partial<TimeConstraints>>(initialConstraints || {
    workBlocks: [{
      id: 'work-1',
      title: 'Work Hours',
      days: [0, 1, 2, 3, 4],
      start: '09:00',
      end: '17:00',
      type: 'work',
      isFlexible: false,
      weekPattern: 'default',
    }],
    sleepStart: '22:30',
    sleepEnd: '06:30',
    peakStart: '09:00',
    peakEnd: '12:00',
    blockedSlots: [],
    timeExceptions: [],
  });

  const availabilitySummary = useMemo(() => calculateWeeklyAvailability(constraints), [constraints]);
  const capacityMinutes = useMemo(() => {
    if (availabilitySummary.usesPatterns) {
      const candidates = [
        availabilitySummary.weekAMinutes,
        availabilitySummary.weekBMinutes,
        availabilitySummary.defaultMinutes,
      ].filter(n => Number.isFinite(n) && n > 0);
      return candidates.length > 0 ? Math.min(...candidates) : 0;
    }
    return availabilitySummary.defaultMinutes;
  }, [availabilitySummary]);

  const requiredMinutes = useMemo(() => {
    return reviewGoals.reduce((sum, goal) => {
      const frequency = Number.isFinite(goal.frequency) ? goal.frequency : 0;
      const duration = Number.isFinite(goal.duration) ? goal.duration : 0;
      return sum + Math.max(0, frequency) * Math.max(0, duration);
    }, 0);
  }, [reviewGoals]);

  const overCapacity = requiredMinutes > capacityMinutes && capacityMinutes > 0;
  const missingRiskAcknowledgements = useMemo(() => {
    return reviewGoals.filter(goal => {
      if (goal.riskLevel !== 'medium' && goal.riskLevel !== 'high') return false;
      return !riskAcknowledgements[goal.id];
    });
  }, [reviewGoals, riskAcknowledgements]);

  useEffect(() => {
    if (!overCapacity) {
      setOverrideFeasibility(false);
    }
  }, [overCapacity]);

  // Debug log to verify initialAmbition is received
  useEffect(() => {
    // Processing initial ambition data

    if (initialAmbition) {
      // Using provided ambition
      const { selected, custom } = parseInitialAmbition(initialAmbition);
      setSelectedGoals(selected);
      setAmbitionInput(custom);
    } else {
      if (typeof window !== 'undefined') {
        const storedAmbition = sessionStorage.getItem('dlulu_onboarding_ambition');
        if (storedAmbition) {
          // Restoring ambition from session
          const { selected, custom } = parseInitialAmbition(storedAmbition);
          setSelectedGoals(selected);
          setAmbitionInput(custom);
          sessionStorage.removeItem('dlulu_onboarding_ambition');
        }
      }
    }
  }, [initialAmbition, initialSelectedGoals, initialCustomInput]);

  // Restore onboarding progress on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && !isAddGoalMode && initialStep === 0) {
      const savedProgress = sessionStorage.getItem('dlulu_onboarding_progress');
      if (savedProgress) {
        try {
          const parsed = JSON.parse(savedProgress);
          if (parsed.step !== undefined) setStep(parsed.step);
          if (parsed.profile) setProfile(prev => ({ ...prev, ...parsed.profile }));
          if (parsed.ambitionInput) setAmbitionInput(parsed.ambitionInput);
          if (parsed.selectedGoals) setSelectedGoals(parsed.selectedGoals);
          if (parsed.constraints) setConstraints(prev => ({ ...prev, ...parsed.constraints }));
          if (parsed.analysisResult) setAnalysisResult(parsed.analysisResult);
          if (Array.isArray(parsed.analyzedGoals)) setAnalyzedGoals(parsed.analyzedGoals);
          if (Array.isArray(parsed.intakeGoalConfigs)) setIntakeGoalConfigs(parsed.intakeGoalConfigs);
          if (parsed.intakeResponsesByGoalIndex && typeof parsed.intakeResponsesByGoalIndex === 'object') {
            setIntakeResponsesByGoalIndex(parsed.intakeResponsesByGoalIndex);
          }
          if (parsed.intakeRealityAcknowledgements && typeof parsed.intakeRealityAcknowledgements === 'object') {
            setIntakeRealityAcknowledgements(parsed.intakeRealityAcknowledgements);
          }
          if (typeof parsed.currentIntakeGoalIndex === 'number') {
            setCurrentIntakeGoalIndex(Math.max(0, parsed.currentIntakeGoalIndex));
          }
          if (typeof parsed.showIntakeStep === 'boolean') setShowIntakeStep(parsed.showIntakeStep);
          if (typeof parsed.showStatusCheck === 'boolean') setShowStatusCheck(parsed.showStatusCheck);
        } catch (e) {
          // Failed to restore progress, continue with defaults
        }
      }
    }
  }, []);

  // Persist onboarding progress to sessionStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && !isAddGoalMode) {
      const onboardingState = {
        step,
        profile,
        ambitionInput,
        selectedGoals,
        constraints,
        analysisResult,
        analyzedGoals,
        intakeGoalConfigs,
        intakeResponsesByGoalIndex,
        intakeRealityAcknowledgements,
        currentIntakeGoalIndex,
        showIntakeStep,
        showStatusCheck,
      };
      sessionStorage.setItem('dlulu_onboarding_progress', JSON.stringify(onboardingState));
    }
  }, [
    step,
    profile,
    ambitionInput,
    selectedGoals,
    constraints,
    analysisResult,
    analyzedGoals,
    intakeGoalConfigs,
    intakeResponsesByGoalIndex,
    intakeRealityAcknowledgements,
    currentIntakeGoalIndex,
    showIntakeStep,
    showStatusCheck,
    isAddGoalMode
  ]);

  const stepLabels = ['About You', 'Your Ambitions', 'Intake Questions', 'Your Progress', 'Your Schedule', 'Your Roadmap', 'All Set'];

  // =============================================================================
  // Walkthrough (First-Time Coachmarks)
  // =============================================================================

  type WalkthroughPhase = 'profile' | 'ambitions' | 'intake' | 'status' | 'blueprint' | 'feasibility';

  const walkthroughEnabled = !isAddGoalMode && !walkthroughSeen;
  const [walkthroughDone, setWalkthroughDone] = useState(false);
  const [walkthroughStepIndex, setWalkthroughStepIndex] = useState(0);
  const [walkthroughPhaseCompleted, setWalkthroughPhaseCompleted] = useState<Record<WalkthroughPhase, boolean>>({
    profile: false,
    ambitions: false,
    intake: false,
    status: false,
    blueprint: false,
    feasibility: false,
  });

  const walkthroughPhase: WalkthroughPhase = useMemo(() => {
    if (showFeasibilityReview) return 'feasibility';
    if (showRoadmapView) return 'blueprint';
    if (showIntakeStep) return 'intake';
    if (showStatusCheck) return 'status';
    return step === 0 ? 'profile' : 'ambitions';
  }, [showFeasibilityReview, showRoadmapView, showIntakeStep, showStatusCheck, step]);

  useEffect(() => {
    setWalkthroughStepIndex(0);
  }, [walkthroughPhase]);

  const totalBlueprintGoals = generatedGoals.length || roadmap?.goals.length || 0;
  const isBlueprintLastGoal = showRoadmapView && totalBlueprintGoals > 0 && currentGoalIndex === totalBlueprintGoals - 1;

  const walkthroughSteps = useMemo<WalkthroughStep[]>(() => {
    if (walkthroughPhase === 'profile') {
      return [
        {
          id: 'ob-profile-basic',
          selector: '[data-wt="ob-profile-basic"]',
          title: 'Personalize Your Plan',
          body: 'Start with your name + role so we personalize your plan.',
          placement: 'bottom',
        },
        {
          id: 'ob-profile-energy',
          selector: '[data-wt="ob-profile-energy"]',
          title: 'Set Your Rhythm',
          body: 'Set your rhythm + energy to optimize scheduling.',
          placement: 'bottom',
        },
        {
          id: 'ob-profile-continue',
          selector: '[data-wt="ob-profile-continue"]',
          title: 'Continue When Ready',
          body: 'Continue when you’re ready.',
          placement: 'top',
        },
      ];
    }

    if (walkthroughPhase === 'ambitions') {
      return [
        {
          id: 'ob-ambition-input',
          selector: '[data-wt="ob-ambition-input"]',
          title: 'Describe Your Ambition',
          body: 'Describe your ambition here.',
          placement: 'bottom',
        },
        {
          id: 'ob-ambition-bubbles',
          selector: '[data-wt="ob-ambition-bubbles"]',
          title: 'Quick Ideas',
          body: 'Tap bubbles for quick ideas.',
          placement: 'top',
        },
        {
          id: 'ob-ambition-continue',
          selector: '[data-wt="ob-ambition-continue"]',
          title: 'Generate Checklist',
          body: 'Generate your prerequisite checklist.',
          placement: 'top',
        },
      ];
    }

    if (walkthroughPhase === 'intake') {
      return [
        {
          id: 'ob-intake-header',
          selector: '[data-wt="ob-intake-header"]',
          title: 'Add Essential Context',
          body: 'Answer these questions so planning matches your real situation.',
          placement: 'bottom',
        },
        {
          id: 'ob-intake-questions',
          selector: '[data-wt="ob-intake-questions"]',
          title: 'Complete Required Fields',
          body: 'Required fields are needed before blueprint generation.',
          placement: 'top',
        },
        {
          id: 'ob-intake-action',
          selector: '[data-wt="ob-intake-action"]',
          title: 'Continue to Verification',
          body: 'Next, verify what you’ve already completed.',
          placement: 'top',
        },
      ];
    }

    if (walkthroughPhase === 'status') {
      return [
        {
          id: 'ob-status-header',
          selector: '[data-wt="ob-status-header"]',
          title: 'Verify Your Progress',
          body: 'This step verifies what you’ve already done.',
          placement: 'bottom',
        },
        {
          id: 'ob-status-prereqs',
          selector: '[data-wt="ob-status-prereqs"]',
          title: 'Mark Completed Items',
          body: 'Check items you’ve completed so we skip them.',
          placement: 'bottom',
        },
        {
          id: 'ob-status-action',
          selector: '[data-wt="ob-status-action"]',
          title: 'Generate Blueprint',
          body: 'Next: generate your blueprint.',
          placement: 'top',
        },
      ];
    }

    if (walkthroughPhase === 'feasibility') {
      return [
        {
          id: 'ob-feasibility-summary',
          selector: '[data-wt="ob-feasibility-summary"]',
          title: 'Reality Check',
          body: 'See if your plan fits your real weekly capacity.',
          placement: 'bottom',
        },
        {
          id: 'ob-feasibility-goals',
          selector: '[data-wt="ob-feasibility-goals"]',
          title: 'Balance Goal Load',
          body: 'Adjust priority and session settings to make execution sustainable.',
          placement: 'top',
        },
        {
          id: 'ob-feasibility-continue',
          selector: '[data-wt="ob-feasibility-continue"]',
          title: 'Lock the Plan',
          body: 'Continue when your plan is realistic for your schedule.',
          placement: 'top',
        },
      ];
    }

    const steps: WalkthroughStep[] = [
      {
        id: 'ob-blueprint-nav',
        selector: '[data-wt="ob-blueprint-nav"]',
        title: 'Navigate Ambitions',
        body: 'Navigate across ambitions here.',
        placement: 'bottom',
      },
      {
        id: 'ob-blueprint-content',
        selector: '[data-wt="ob-blueprint-content"]',
        title: 'Your Roadmap',
        body: 'Here’s your phased blueprint.',
        placement: 'top',
      },
    ];

    if (isBlueprintLastGoal) {
      steps.push({
        id: 'ob-blueprint-start',
        selector: '[data-wt="ob-blueprint-start"]',
        title: 'Start Your Plan',
        body: 'Start your plan when you’re ready.',
        placement: 'top',
      });
    }

    return steps;
  }, [walkthroughPhase, isBlueprintLastGoal]);

  useEffect(() => {
    if (walkthroughSteps.length > 0 && walkthroughStepIndex >= walkthroughSteps.length) {
      setWalkthroughStepIndex(walkthroughSteps.length - 1);
    }
  }, [walkthroughSteps.length, walkthroughStepIndex]);

  const walkthroughActive =
    walkthroughEnabled &&
    !walkthroughDone &&
    !walkthroughPhaseCompleted[walkthroughPhase] &&
    walkthroughSteps.length > 0;

  const handleWalkthroughSkip = () => {
    setWalkthroughDone(true);
    onWalkthroughComplete?.();
  };

  const handleWalkthroughFinish = () => {
    setWalkthroughDone(true);
    onWalkthroughComplete?.();
  };

  const handleWalkthroughNext = () => {
    const isLastStep = walkthroughStepIndex >= walkthroughSteps.length - 1;
    if (!isLastStep) {
      setWalkthroughStepIndex(prev => prev + 1);
      return;
    }

    if (walkthroughPhase === 'blueprint') {
      handleWalkthroughFinish();
      return;
    }

    setWalkthroughPhaseCompleted(prev => ({ ...prev, [walkthroughPhase]: true }));
  };

  const handleWalkthroughBack = () => {
    setWalkthroughStepIndex(prev => Math.max(0, prev - 1));
  };

  const currentIntakeConfig = intakeGoalConfigs[currentIntakeGoalIndex] || null;
  const currentIntakeAnswers = intakeResponsesByGoalIndex[currentIntakeGoalIndex] || {};
  const currentIntakeRealityChecks = useMemo(() => {
    if (!currentIntakeConfig) return [];
    return buildIntakeRealityChecks(currentIntakeConfig.category, currentIntakeAnswers);
  }, [currentIntakeAnswers, currentIntakeConfig]);
  const hasCurrentIntakeRealityChecks = currentIntakeRealityChecks.length > 0;
  const currentIntakeRealityAcknowledged = !!intakeRealityAcknowledgements[currentIntakeGoalIndex];
  const existingGoalsForPrompt = useMemo(() => {
    return (existingGoals || [])
      .filter((goal) => goal.status !== 'completed' && goal.status !== 'abandoned')
      .map((goal) => ({
        id: goal.id,
        title: goal.title,
        category: goal.category,
        timeline: goal.timeline,
        estimatedWeeks: goal.estimatedWeeks,
        status: goal.status,
        frequency: goal.frequency,
        duration: goal.duration,
      }));
  }, [existingGoals]);
  const currentIntakeMissingRequired = useMemo(() => {
    if (!currentIntakeConfig) return [];
    return getMissingRequiredIntakeFields(currentIntakeConfig.questions, currentIntakeAnswers);
  }, [currentIntakeAnswers, currentIntakeConfig]);

  const updateIntakeAnswer = (
    goalIndex: number,
    fieldKey: string,
    value: GoalIntakeAnswerValue
  ) => {
    if (prerequisitesGenerationError) {
      setPrerequisitesGenerationError(null);
    }
    setIntakeResponsesByGoalIndex((prev) => ({
      ...prev,
      [goalIndex]: {
        ...(prev[goalIndex] || {}),
        [fieldKey]: value,
      },
    }));
    setIntakeValidationErrors((prev) => {
      const key = `${goalIndex}:${fieldKey}`;
      const realityKey = `${goalIndex}:__reality_check`;
      if (!prev[key] && !prev[realityKey]) return prev;
      const next = { ...prev };
      delete next[key];
      delete next[realityKey];
      return next;
    });
    setIntakeRealityAcknowledgements((prev) => ({
      ...prev,
      [goalIndex]: false,
    }));
  };

  const validateIntakeGoal = (goalIndex: number): boolean => {
    const config = intakeGoalConfigs[goalIndex];
    if (!config) return true;
    const answers = intakeResponsesByGoalIndex[goalIndex] || {};
    const missing = getMissingRequiredIntakeFields(config.questions, answers);
    if (missing.length === 0) return true;

    const nextErrors: Record<string, string> = {};
    missing.forEach((fieldKey) => {
      nextErrors[`${goalIndex}:${fieldKey}`] = 'This field is required.';
    });
    setIntakeValidationErrors((prev) => ({ ...prev, ...nextErrors }));
    return false;
  };

  const handleIntakeBack = () => {
    setPrerequisitesGenerationError(null);
    if (currentIntakeGoalIndex > 0) {
      setCurrentIntakeGoalIndex((prev) => prev - 1);
      return;
    }
    setShowIntakeStep(false);
    setStep(1);
  };

  const generatePersonalizedPrerequisites = async (): Promise<boolean> => {
    if (!analyzedGoals.length) {
      setPrerequisitesGenerationError('No goals available for prerequisite generation. Please retry ambition analysis.');
      return false;
    }

    setIsLoading(true);
    setIsGeneratingPrerequisites(true);
    setLoaderProgress(undefined);
    setLoaderSubtitle(undefined);
    setPrerequisitesGenerationError(null);

    try {
      const personalizedResults = await Promise.all(
        analyzedGoals.map(async (goal, goalIndex) => {
          const intakeConfig = intakeGoalConfigs[goalIndex];
          const intakeAnswers = intakeResponsesByGoalIndex[goalIndex] || {};
          const intakeMissingRequired = intakeConfig
            ? getMissingRequiredIntakeFields(intakeConfig.questions, intakeAnswers)
            : [];

          if (intakeMissingRequired.length > 0) {
            throw new Error(`Missing required intake answers for "${goal.title}". Please complete all required fields.`);
          }

          return generatePrerequisites({
            goal: {
              title: goal.title,
              category: goal.category,
              timeline: goal.timeline,
              estimatedWeeks: goal.estimatedWeeks,
              originalInput: goal.originalInput,
            },
            intakeAnswers,
            profile,
          });
        })
      );

      setAnalyzedGoals((prevGoals) => (
        prevGoals.map((goal, goalIndex) => {
          const result = personalizedResults[goalIndex];
          const normalizedPrerequisites = (result?.prerequisites || [])
            .slice()
            .sort((a, b) => (a.order || Number.POSITIVE_INFINITY) - (b.order || Number.POSITIVE_INFINITY))
            .map((prerequisite, prerequisiteIndex) => ({
              id: `prereq-${goalIndex}-${prerequisiteIndex}`,
              label: prerequisite.label,
              order: prerequisiteIndex + 1,
              isCompleted: false,
              comment: '',
            }));

          return {
            ...goal,
            prerequisites: normalizedPrerequisites,
          };
        })
      ));

      setShowIntakeStep(false);
      setShowStatusCheck(true);
      return true;
    } catch (err: any) {
      logger.error('[Onboarding] Error generating personalized prerequisites', err);
      setPrerequisitesGenerationError(
        err?.message || 'Failed to generate personalized status check. Please retry.'
      );
      setShowIntakeStep(true);
      setShowStatusCheck(false);
      return false;
    } finally {
      setIsLoading(false);
      setIsGeneratingPrerequisites(false);
    }
  };

  const handleIntakeNext = async () => {
    if (!validateIntakeGoal(currentIntakeGoalIndex)) return;
    if (hasCurrentIntakeRealityChecks && !currentIntakeRealityAcknowledged) {
      setIntakeValidationErrors((prev) => ({
        ...prev,
        [`${currentIntakeGoalIndex}:__reality_check`]: 'Please acknowledge the feasibility warning before continuing.',
      }));
      return;
    }

    const isLastGoal = currentIntakeGoalIndex >= intakeGoalConfigs.length - 1;
    if (isLastGoal) {
      await generatePersonalizedPrerequisites();
      return;
    }

    setCurrentIntakeGoalIndex((prev) => prev + 1);
  };

  // =============================================================================
  // Step Handlers
  // =============================================================================

  const handleProfileSubmit = () => {
    if (!profile.name || !profile.role) return;
    setStep(1);
  };

  const handleGoalToggle = (goal: string) => {
    setAmbitionAnalysisError(null);
    const isSelected = selectedGoals.includes(goal);

    if (isSelected) {
      setSelectedGoals(prev => prev.filter(g => g !== goal));
    } else {
      setSelectedGoals(prev => [...prev, goal]);
    }

    setAmbitionInput(current => {
      let parts = current.split(',').map(s => s.trim()).filter(Boolean);

      if (isSelected) {
        parts = parts.filter(p => p !== goal);
      } else {
        if (!parts.includes(goal)) {
          parts.push(goal);
        }
      }
      return parts.join(', ');
    });
  };

  const handleAmbitionsSubmit = async () => {
    const allAmbitions = [...selectedGoals, ambitionInput].filter(Boolean).join('. ');
    if (!ambitionInput && selectedGoals.length === 0) return;

    setIsLoading(true);
    setLoaderProgress(undefined);
    setLoaderSubtitle(undefined);
    setAmbitionAnalysisError(null);
    setPrerequisitesGenerationError(null);
    setGeneratedGoals([]);
    setRoadmap(null);
    setShowRoadmapView(false);
    setShowFeasibilityReview(false);
    setReviewGoals([]);

    try {
      setLoaderSubtitle("Analyzing your ambitions...");
      logger.info('[Onboarding] Running ambition analysis', {
        isAddGoalMode,
        ambitionsTextLength: allAmbitions.length,
        existingGoalsCount: existingGoalsForPrompt.length,
      });

      const result = await analyzeAmbitions({
        ambitionText: allAmbitions,
        profile,
        isAddGoalMode,
        existingGoals: existingGoalsForPrompt,
      });

      if (!result || !result.goals || result.goals.length === 0) {
        throw new Error("Could not analyze ambitions. Please try again.");
      }

      const convertedGoals: AnalyzedGoal[] = result.goals.map((g, gIndex) => ({
        title: g.title,
        originalInput: g.originalInput || allAmbitions,
        category: (g.category as AnalyzedGoal['category']) || 'personal',
        timeline: g.timeline || '12 weeks',
        estimatedWeeks: g.estimatedWeeks || 12,
        prerequisites: (g.prerequisites || []).map((p, pIndex) => ({
          id: `prereq-${gIndex}-${pIndex}`,
          label: p.label,
          order: p.order || pIndex + 1,
          isCompleted: false,
          comment: '',
        })),
      }));

      const intakeConfigs: IntakeGoalConfig[] = result.goals.map((g, gIndex) => {
        const normalizedCategory = normalizeGoalCategory(g.category);
        const normalizedQuestions = normalizeIntakeQuestions(g.title, normalizedCategory, g.intakeQuestions);
        if (normalizedQuestions.length < 3) {
          throw new Error(`AI did not return enough intake questions for "${g.title}". Please retry.`);
        }
        if (!hasRequiredIntakeCoverage(normalizedCategory, normalizedQuestions)) {
          throw new Error(`AI intake questions for "${g.title}" are missing required fields. Please retry.`);
        }

        return {
          goalTitle: g.title,
          category: normalizedCategory,
          questions: normalizedQuestions,
        };
      });

      if (intakeConfigs.length === 0) {
        throw new Error('AI did not return intake questions. Please retry.');
      }

      const responsesSeed: Record<number, GoalIntakeAnswers> = {};
      intakeConfigs.forEach((_, index) => {
        responsesSeed[index] = {};
      });

      setAnalysisResult(result);
      setAnalyzedGoals(convertedGoals);
      setIntakeGoalConfigs(intakeConfigs);
      setIntakeResponsesByGoalIndex(responsesSeed);
      setIntakeValidationErrors({});
      setIntakeRealityAcknowledgements({});
      setCurrentIntakeGoalIndex(0);
      setShowIntakeStep(true);
      setIsLoading(false);
      setIsGeneratingPrerequisites(false);
      setShowStatusCheck(false);
      logger.info('[Onboarding] Ambition analysis complete', {
        goalsCount: result.goals.length,
        intakeGoalsCount: intakeConfigs.length,
      });

    } catch (err: any) {
      logger.error('[Onboarding] Error analyzing ambitions', err);
      setAmbitionAnalysisError(err?.message || 'Failed to analyze ambitions. Please try again.');
      setShowIntakeStep(false);
      setShowStatusCheck(false);
      setIsGeneratingPrerequisites(false);
      setIsLoading(false);
    }
  };

  const handleStatusCheckComplete = async (goalContexts: GoalContext[]) => {
    setShowStatusCheck(false);
    setShowIntakeStep(false);
    setIsLoading(true);
    setIsGeneratingBlueprint(true);
    setLoaderProgress(undefined);
    setLoaderSubtitle(undefined);
    setGeneratedGoals([]);
    setRoadmap(null);
    setShowRoadmapView(false);
    setShowFeasibilityReview(false);
    setReviewGoals([]);

    try {
      const allAmbitions = [...selectedGoals, ambitionInput].filter(Boolean).join('. ');

      const formatBlocks = (blocks: TimeBlock[] | undefined) => {
        if (!blocks || blocks.length === 0) return 'None';
        return blocks.map(b => {
          const days = (b.days || []).map(d => DAY_LABELS[d] || '').filter(Boolean).join(', ') || 'All days';
          const pattern = b.weekPattern && b.weekPattern !== 'default' ? ` (Week ${b.weekPattern})` : '';
          return `${b.title}: ${b.start}-${b.end} on ${days}${pattern}`;
        }).join(' | ');
      };

      const formatExceptions = (exceptions: TimeConstraints['timeExceptions'] | undefined) => {
        if (!exceptions || exceptions.length === 0) return 'None';
        return exceptions.map(ex => `${ex.date}: ${ex.start}-${ex.end} ${ex.isBlocked ? '(blocked)' : '(available)'}`).join(' | ');
      };

      const existingGoalContext = existingGoalsForPrompt.length > 0
        ? `
## EXISTING GOALS (ALREADY IN FLIGHT)
${existingGoalsForPrompt.map((goal) =>
          `- ${goal.title} (${goal.category}) — ${goal.timeline || `${goal.estimatedWeeks || '?'} weeks`} | status: ${goal.status} | cadence: ${goal.frequency || '?'}x/week @ ${goal.duration || '?'} min`
        ).join('\n')}
- Avoid duplicate plans and account for these active commitments when proposing cadence.
`
        : '';

      const timeContext = `
## USER'S TIME AVAILABILITY
- Chronotype: ${profile.chronotype || 'flexible'}
- Energy Level: ${profile.energyLevel || 'balanced'}
- Work Blocks: ${formatBlocks(constraints.workBlocks as TimeBlock[] | undefined)}
- Blocked Slots: ${formatBlocks(constraints.blockedSlots as TimeBlock[] | undefined)}
- Exceptions: ${formatExceptions(constraints.timeExceptions)}
- Sleep: ${constraints.sleepStart || '22:30'} to ${constraints.sleepEnd || '06:30'}
- Peak Productivity: ${constraints.peakStart || '09:00'} to ${constraints.peakEnd || '12:00'}
${existingGoalContext}
`;

      const handleProgress = (message: string, percent: number) => {
        setLoaderSubtitle(message);
        if (percent >= 0) {
          setLoaderProgress(percent);
        }
      };

      const formattedContexts = goalContexts.map((gc, goalIndex) => {
        const intakeConfig = intakeGoalConfigs[goalIndex];
        const intakeResponses = intakeResponsesByGoalIndex[goalIndex] || {};
        const intakeMissingRequired = intakeConfig
          ? getMissingRequiredIntakeFields(intakeConfig.questions, intakeResponses)
          : [];

        return {
          goalTitle: gc.goalTitle,
          additionalNotes: gc.additionalNotes,
          completedPrerequisites: gc.completedPrerequisites,
          skippedPrerequisites: gc.skippedPrerequisites,
          prerequisiteComments: gc.prerequisiteComments,
          intakeResponses,
          intakeMissingRequired,
        };
      });

      const fullPlan = await generateFullPlan({
        ambitionText: allAmbitions,
        profile,
        prerequisites: [],
        goalContexts: formattedContexts,
        additionalContext: timeContext,
      }, handleProgress);

      logger.info('[Onboarding] Full plan generated', {
        generatedGoalsCount: fullPlan.goals?.length || 0,
        formattedGoalContexts: formattedContexts.length,
      });

      const goals: Goal[] = (fullPlan.goals || []).map((fg, fgIndex) => {
        const intakeConfig = intakeGoalConfigs[fgIndex];
        const intakeResponses = intakeResponsesByGoalIndex[fgIndex] || {};
        const intakeMissingRequired = intakeConfig
          ? getMissingRequiredIntakeFields(intakeConfig.questions, intakeResponses)
          : [];
        const intakeSummary = intakeConfig
          ? buildIntakeSummary(intakeConfig.questions, intakeResponses, intakeMissingRequired)
          : '';

        const phases: Phase[] = (fg.phases || []).map((p) => ({
          id: `phase-${fg.goalTitle}-${p.number}`,
          goalId: `goal-${fg.goalTitle}`,
          number: p.number,
          title: p.title || `Phase ${p.number}`,
          description: p.description || '',
          startWeek: p.startWeek || 1,
          endWeek: p.endWeek || 4,
          estimatedDuration: `${(p.endWeek || 4) - (p.startWeek || 1) + 1} weeks`,
          focus: p.focus || [],
          milestones: (p.milestones || []).map((m, mi) => {
            const milestoneId = m.id || `milestone-${fg.goalTitle}-${p.number}-${mi}`;
            return {
              id: milestoneId,
              phaseId: `phase-${fg.goalTitle}-${p.number}`,
              goalId: `goal-${fg.goalTitle}`,
              title: m.title || `Milestone ${mi + 1}`,
              description: m.description || '',
              isCompleted: false,
              order: mi,
              targetWeek: m.targetWeek || p.endWeek || 4,
              tasks: (m.tasks || []).map((t, ti) => {
                const taskId = t.id || `task-${fg.goalTitle}-${p.number}-${mi}-${ti}`;
                return {
                  id: taskId,
                  milestoneId: milestoneId,
                  title: t.title || `Task ${ti + 1}`,
                  description: t.description || '',
                  isCompleted: false,
                  isStrikethrough: false,
                  order: t.order || ti,
                  estimatedMinutes: t.estimatedMinutes,
                  difficulty: t.difficulty,
                  cognitiveType: t.cognitiveType,
                  subTasks: (t.subTasks || []).map((st, sti) => ({
                    id: st.id || `subtask-${taskId}-${sti}`,
                    taskId: taskId,
                    title: st.title || `Subtask ${sti + 1}`,
                    description: st.description || '',
                    isCompleted: false,
                    isManual: false,
                    isStrikethrough: false,
                    order: st.order || sti,
                  })),
                };
              }),
              subTasks: [],
            };
          }),
          status: p.number === 1 ? 'active' : 'upcoming',
          progress: 0,
          coachAdvice: p.coachAdvice || '',
        }));

        return {
          id: `goal-${fg.goalTitle}`,
          title: fg.goalTitle,
          originalInput: fg.goalTitle,
          category: (fg.category || 'learning') as GoalCategory,
          timeline: fg.timeline,
          estimatedWeeks: fg.estimatedWeeks || 24,
          strategyOverview: fg.strategyOverview || '',
          criticalGaps: fg.criticalGaps || [],
          behaviorPlan: fg.behaviorPlan,
          priorityWeight: fg.priorityWeight ?? 50,
          riskLevel: fg.riskLevel || 'low',
          intakeQuestions: intakeConfig?.questions || [],
          intakeAnswers: intakeResponses,
          intakeSummary: intakeSummary || undefined,
          intakeSchemaVersion: INTAKE_SCHEMA_VERSION,
          intakeUpdatedAt: Object.keys(intakeResponses).length > 0 ? new Date() : undefined,
          phases,
          currentPhaseIndex: 0,
          overallProgress: 0,
          status: 'active',
          history: [],
          preferredTime: fg.suggestedSchedule?.preferredTime || 'morning',
          frequency: fg.suggestedSchedule?.frequency || 3,
          duration: fg.suggestedSchedule?.duration || 60,
          energyCost: fg.suggestedSchedule?.energyCost || 'medium',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      });

      setGeneratedGoals(goals);
      const generatedRoadmap = goalsToRoadmap(goals);
      setRoadmap(generatedRoadmap);
      setShowRoadmapView(true);
      setStep(2);

    } catch (error) {
      logger.error('Plan generation error', error);
      setGeneratedGoals([]);
      setRoadmap(null);
      setShowRoadmapView(false);
      setShowFeasibilityReview(false);
      setReviewGoals([]);
      alert('Failed to generate plan. Please try again.');
    } finally {
      setIsLoading(false);
      setIsGeneratingBlueprint(false);
    }
  };

  const finalizeOnboarding = (finalGoals: Goal[]) => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('dlulu_onboarding_progress');
      sessionStorage.removeItem('dlulu_onboarding_ambition');
    }

    // Track onboarding completion with metrics
    analytics.track(AnalyticsEvents.ONBOARDING_COMPLETED, {
      goals_count: finalGoals.length,
      step_name: 'complete',
    });

    // Track each goal created
    finalGoals.forEach(goal => {
      analytics.trackGoalCreated(goal.category || 'uncategorized', 'onboarding');
    });

    const fullProfile: UserProfile = {
      id: initialProfile?.id || '',
      name: profile.name,
      role: profile.role,
      roleContext: profile.roleContext,
      bio: profile.bio,
      chronotype: profile.chronotype,
      workStyle: 'flow',
      energyLevel: profile.energyLevel,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    onComplete(
      fullProfile,
      constraints as TimeConstraints,
      finalGoals,
      [],
      undefined
    );
  };

  const handleProceedFromRoadmap = () => {
    if (!roadmap) return;

    const goalsFromRoadmap: Goal[] = generatedGoals.length > 0
      ? generatedGoals
      : roadmap.goals.map((rg, goalIndex) => {
        const goalId = rg.goalId;
        const intakeConfig = intakeGoalConfigs[goalIndex];
        const intakeResponses = intakeResponsesByGoalIndex[goalIndex] || {};
        const intakeMissingRequired = intakeConfig
          ? getMissingRequiredIntakeFields(intakeConfig.questions, intakeResponses)
          : [];
        const intakeSummary = intakeConfig
          ? buildIntakeSummary(intakeConfig.questions, intakeResponses, intakeMissingRequired)
          : '';

        return {
          id: goalId,
          title: rg.goalTitle,
          originalInput: rg.goalTitle,
          category: rg.category,
          timeline: `${rg.endWeek - rg.startWeek || 12} weeks`,
          estimatedWeeks: rg.endWeek - rg.startWeek || 12,
          strategyOverview: '',
          criticalGaps: [],
          behaviorPlan: undefined,
          priorityWeight: 50,
          riskLevel: 'low',
          intakeQuestions: intakeConfig?.questions || [],
          intakeAnswers: intakeResponses,
          intakeSummary: intakeSummary || undefined,
          intakeSchemaVersion: INTAKE_SCHEMA_VERSION,
          intakeUpdatedAt: Object.keys(intakeResponses).length > 0 ? new Date() : undefined,
          status: 'active' as const,
          preferredTime: rg.preferredTimeSlot || 'morning',
          frequency: rg.sessionsPerWeek || 3,
          duration: rg.minutesPerSession || 45,
          energyCost: 'medium' as const,
          phases: rg.phases.map((p, pIdx) => {
            const phaseId = p.phaseId;
            const milestones = (p.tasks || []).map((t, tIdx) => {
              const milestoneId = t.id || `milestone-${phaseId}-${tIdx}`;

              return {
                id: milestoneId,
                phaseId: phaseId,
                goalId: goalId,
                title: t.title || `Milestone ${tIdx + 1}`,
                description: t.description || '',
                targetWeek: Math.floor((t.startDay || 1) / 7) + p.startWeek,
                isCompleted: t.isCompleted || false,
                order: t.order || tIdx + 1,
                tasks: [{
                  id: `task-${milestoneId}-1`,
                  milestoneId: milestoneId,
                  title: t.title,
                  description: t.description || '',
                  isCompleted: t.isCompleted || false,
                  isStrikethrough: false,
                  order: 1,
                  subTasks: (t.subTasks || []).map((st, stIdx) => ({
                    id: st.id || `subtask-${t.id}-${stIdx}`,
                    taskId: `task-${milestoneId}-1`,
                    title: st.title || `Sub-task ${stIdx + 1}`,
                    isCompleted: st.isCompleted || false,
                    isManual: st.isManual || false,
                    isStrikethrough: st.isStrikethrough || false,
                    order: st.order || stIdx + 1,
                  })),
                }],
                subTasks: [],
              };
            });

            return {
              id: phaseId,
              goalId: goalId,
              number: p.phaseNumber || pIdx + 1,
              title: p.title || `Phase ${pIdx + 1}`,
              description: p.description || '',
              startWeek: p.startWeek || 1,
              endWeek: p.endWeek || 4,
              estimatedDuration: `${(p.endWeek || 4) - (p.startWeek || 1)} weeks`,
              focus: [],
              status: pIdx === 0 ? 'active' as const : 'upcoming' as const,
              progress: 0,
              coachAdvice: p.coachAdvice || '',
              isScheduled: false,
              milestones,
            };
          }),
          currentPhaseIndex: 0,
          overallProgress: 0,
          history: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      });

    setGeneratedGoals(goalsFromRoadmap);
    setShowRoadmapView(false);

    const initialAcks: Record<string, boolean> = {};
    goalsFromRoadmap.forEach(goal => {
      initialAcks[goal.id] = !!goal.riskAcknowledgedAt;
    });
    setRiskAcknowledgements(initialAcks);
    setReviewGoals(goalsFromRoadmap);
    setShowFeasibilityReview(true);
  };

  const formatMinutes = (minutes: number) => {
    if (!Number.isFinite(minutes) || minutes <= 0) return '0m';
    const hrs = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  };

  type ReviewLevel = 'low' | 'medium' | 'high';

  const PRIORITY_BAND_TO_WEIGHT: Record<ReviewLevel, number> = {
    low: 25,
    medium: 50,
    high: 75,
  };

  const reviewLevelStyles: Record<ReviewLevel, {
    pill: string;
    card: string;
    title: string;
    body: string;
  }> = {
    low: {
      pill: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
      card: 'border-emerald-500/30 bg-emerald-500/10',
      title: 'text-emerald-700 dark:text-emerald-300',
      body: 'text-emerald-700/80 dark:text-emerald-200/80',
    },
    medium: {
      pill: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
      card: 'border-amber-500/30 bg-amber-500/10',
      title: 'text-amber-700 dark:text-amber-300',
      body: 'text-amber-700/80 dark:text-amber-200/80',
    },
    high: {
      pill: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
      card: 'border-rose-500/30 bg-rose-500/10',
      title: 'text-rose-700 dark:text-rose-300',
      body: 'text-rose-700/80 dark:text-rose-200/80',
    },
  };

  const priorityWeightToBand = (weight: number | undefined): ReviewLevel => {
    const value = typeof weight === 'number' && Number.isFinite(weight) ? weight : 50;
    if (value >= 67) return 'high';
    if (value <= 33) return 'low';
    return 'medium';
  };

  const normalizeRiskLevel = (riskLevel: string | undefined): ReviewLevel => {
    const normalized = String(riskLevel || 'low').toLowerCase();
    if (normalized === 'high' || normalized === 'medium') return normalized;
    return 'low';
  };

  const updateReviewGoal = (goalId: string, updates: Partial<Goal>) => {
    setReviewGoals(prev => prev.map(goal => goal.id === goalId ? { ...goal, ...updates, updatedAt: new Date() } : goal));
  };

  const handleAutoBalance = () => {
    if (!capacityMinutes) return;
    const totalWeight = reviewGoals.reduce((sum, g) => sum + Math.max(0, g.priorityWeight ?? 50), 0) || 1;

    setReviewGoals(prev => prev.map(goal => {
      const weight = Math.max(0, goal.priorityWeight ?? 50);
      const duration = Math.max(15, Number(goal.duration) || 60);
      const currentFrequency = Math.max(0, Number(goal.frequency) || 0);
      const targetMinutes = capacityMinutes * (weight / totalWeight);
      const maxFrequency = duration > 0 ? Math.floor(targetMinutes / duration) : 0;
      const minFrequency = weight > 0 ? 1 : 0;
      const nextFrequency = Math.min(currentFrequency, Math.max(minFrequency, Math.min(7, maxFrequency)));

      return { ...goal, frequency: nextFrequency };
    }));
  };

  const handleComplete = () => {
    finalizeOnboarding(reviewGoals.length > 0 ? reviewGoals : generatedGoals);
  };

  const goBack = () => {
    if (step === 0) onBack();
    else setStep(step - 1);
  };

  // =============================================================================
  // Render
  // =============================================================================

  // Render Neural Logic Core when loading
  if (isLoading) {
    let loaderContent = <NeuralAnalysisLoader phases={['Processing...']} stats={[]} duration={5000} headless />;

    if (isGeneratingBlueprint) {
      loaderContent = (
        <NeuralAnalysisLoader
          phases={[
            'Aligning Reality Dimensions...',
            'Architecting Strategy Phases...',
            'Calculating Milestones...',
            'Finalizing Your Blueprint...'
          ]}
          stats={[]}
          progress={loaderProgress}
          duration={8000}
          headless
        />
      );
    } else if (isGeneratingPrerequisites) {
      loaderContent = (
        <NeuralAnalysisLoader
          phases={[
            'Reviewing your intake context...',
            'Generating personalized prerequisites...',
            'Calibrating your status check...',
            'Preparing verification checklist...'
          ]}
          stats={[]}
          duration={7000}
          headless
        />
      );
    } else if (step === 1) {
      loaderContent = (
        <NeuralAnalysisLoader
          phases={[
            'Scanning for Ambitions...',
            'Identifying Core Ambitions...',
            'Generating Preliminary Checklists...',
            'Preparing Status Review...'
          ]}
          stats={[]}
          duration={8000}
          headless
        />
      );
    }

    return (
      <div className="flex h-screen w-full bg-background text-foreground font-display overflow-hidden">
        <OnboardingHeader
          progressStep={step}
          isAddGoalMode={isAddGoalMode}
          onClose={onBack}
        />
        <main className="flex-1 w-full h-full pt-16">
          {loaderContent}
        </main>
      </div>
    );
  }

  // Render Blueprint Reveal (Step 2 in simplified flow)
  if (showRoadmapView && roadmap) {
    const currentGoal = generatedGoals[currentGoalIndex];
    if (!currentGoal) return null;

    const totalGoals = generatedGoals.length || roadmap.goals.length;
    const isLastGoal = currentGoalIndex === totalGoals - 1;
    const handleBackToStatusCheck = () => {
      setShowRoadmapView(false);
      setShowStatusCheck(true);
    };

    const handleNextGoal = () => {
      if (currentGoalIndex < roadmap.goals.length - 1) {
        setCurrentGoalIndex(prev => prev + 1);
      }
    };

    const handlePrevGoal = () => {
      if (currentGoalIndex > 0) {
        setCurrentGoalIndex(prev => prev - 1);
      } else {
        handleBackToStatusCheck();
      }
    };

    return (
      <div className="relative">
        <BlueprintReveal
          goal={currentGoal}
          goalIndex={currentGoalIndex}
          totalGoals={totalGoals}
          onNextGoal={handleNextGoal}
          onPrevGoal={handlePrevGoal}
          onStartPlan={isLastGoal ? handleProceedFromRoadmap : undefined}
          onClose={onBack}
          isAddGoalMode={isAddGoalMode}
          onBack={handleBackToStatusCheck}
        />
        {walkthroughActive && (
          <WalkthroughOverlay
            steps={walkthroughSteps}
            stepIndex={walkthroughStepIndex}
            onNext={handleWalkthroughNext}
            onBack={handleWalkthroughBack}
            onSkip={handleWalkthroughSkip}
            onComplete={handleWalkthroughNext}
          />
        )}
      </div>
    );
  }

  if (showFeasibilityReview) {
    const canProceed = (!overCapacity || overrideFeasibility) && missingRiskAcknowledgements.length === 0;
    const utilizationRatio = capacityMinutes > 0
      ? requiredMinutes / capacityMinutes
      : (requiredMinutes > 0 ? Number.POSITIVE_INFINITY : 0);
    const statusLevel: ReviewLevel = utilizationRatio > 1
      ? 'high'
      : utilizationRatio >= 0.85
        ? 'medium'
        : 'low';
    const statusStyles = reviewLevelStyles[statusLevel];
    const statusLabel = statusLevel === 'high'
      ? 'Over Capacity'
      : statusLevel === 'medium'
        ? 'Tight Capacity'
        : 'Within Capacity';
    const statusNote = statusLevel === 'high'
      ? `Reduce ${formatMinutes(requiredMinutes - capacityMinutes)} to fit your schedule.`
      : statusLevel === 'medium'
        ? `You are near capacity (${Math.round(utilizationRatio * 100)}% utilized).`
        : 'Your plan fits the time you have available.';

    return (
      <div className="flex h-screen w-full bg-background text-foreground font-display overflow-hidden">
        <OnboardingHeader
          progressStep={step}
          isAddGoalMode={isAddGoalMode}
          onClose={onBack}
        />

        <main className="flex-1 overflow-y-auto p-6 lg:p-12 mt-16">
          <div className="w-full max-w-5xl mx-auto space-y-6">
            <GlassCard className="p-8 space-y-6" data-wt="ob-feasibility-summary">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold text-foreground">Feasibility Review</h1>
                <p className="text-muted-foreground text-sm">
                  We matched your plan against the time you actually have. Adjust priorities or sessions so your schedule stays realistic.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-border bg-card/60 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Weekly Availability</p>
                  <p className="text-2xl font-bold text-foreground mt-2">{formatMinutes(capacityMinutes)}</p>
                  {availabilitySummary.usesPatterns && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Week A {formatMinutes(availabilitySummary.weekAMinutes)} · Week B {formatMinutes(availabilitySummary.weekBMinutes)}
                    </p>
                  )}
                </div>
                <div className="rounded-2xl border border-border bg-card/60 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Required Time</p>
                  <p className="text-2xl font-bold text-foreground mt-2">{formatMinutes(requiredMinutes)}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Based on your goal frequencies and session durations.
                  </p>
                </div>
                <div className={`rounded-2xl border p-4 ${statusStyles.card}`}>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${statusStyles.pill}`}>
                      {statusLevel}
                    </span>
                    <p className={`text-2xl font-bold ${statusStyles.title}`}>{statusLabel}</p>
                  </div>
                  <p className={`text-xs mt-2 ${statusStyles.body}`}>
                    {statusNote}
                  </p>
                </div>
              </div>

              {overCapacity && (
                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-200 space-y-2">
                  <p>
                    You can rebalance below or proceed anyway (we’ll still schedule, but it may be tight).
                  </p>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={overrideFeasibility}
                      onChange={(e) => setOverrideFeasibility(e.target.checked)}
                      className="h-4 w-4 rounded border-border bg-card/70 text-primary focus:ring-primary"
                    />
                    Proceed anyway
                  </label>
                </div>
              )}
            </GlassCard>

            <GlassCard className="p-6 space-y-6" data-wt="ob-feasibility-goals">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-foreground">Adjust your goals</h2>
                  <p className="text-xs text-muted-foreground">Tweak priorities, frequency, and duration to fit your real week.</p>
                </div>
                <button
                  onClick={handleAutoBalance}
                  className="px-4 py-2 rounded-xl border border-border bg-card/60 hover:bg-card text-sm font-bold transition"
                >
                  Auto-balance
                </button>
              </div>

              <div className="space-y-4">
                {reviewGoals.map(goal => {
                  const weeklyMinutes = Math.max(0, (goal.frequency || 0) * (goal.duration || 0));
                  const riskLevel = normalizeRiskLevel(goal.riskLevel);
                  const riskStyles = reviewLevelStyles[riskLevel];
                  const priorityBand = priorityWeightToBand(goal.priorityWeight);
                  const priorityStyles = reviewLevelStyles[priorityBand];
                  const acked = !!riskAcknowledgements[goal.id];

                  return (
                    <div key={goal.id} className="rounded-2xl border border-border bg-card/50 p-5 space-y-4">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-bold text-foreground">{goal.title}</h3>
                          <div className="mt-1 flex items-center gap-2">
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${priorityStyles.pill}`}>
                              Priority {priorityBand}
                            </span>
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${riskStyles.pill}`}>
                              Safety {riskLevel}
                            </span>
                          </div>
                        </div>
                        <div className="text-left md:text-right">
                          <p className="text-xs text-muted-foreground uppercase tracking-wide">Weekly time</p>
                          <p className="text-lg font-semibold text-foreground">{formatMinutes(weeklyMinutes)}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs uppercase tracking-wide text-muted-foreground">Priority</label>
                          <select
                            value={priorityBand}
                            onChange={(e) => {
                              const nextBand = e.target.value as ReviewLevel;
                              updateReviewGoal(goal.id, { priorityWeight: PRIORITY_BAND_TO_WEIGHT[nextBand] });
                            }}
                            className="w-full rounded-xl border border-border bg-card/60 px-3 py-2 text-sm text-foreground"
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs uppercase tracking-wide text-muted-foreground">Sessions / week</label>
                          <input
                            type="number"
                            min={0}
                            max={7}
                            value={goal.frequency || 0}
                            onChange={(e) => {
                              const next = Math.max(0, Math.min(7, Number(e.target.value) || 0));
                              updateReviewGoal(goal.id, { frequency: next });
                            }}
                            className="w-full rounded-xl border border-border bg-card/60 px-3 py-2 text-sm"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs uppercase tracking-wide text-muted-foreground">Session duration (min)</label>
                          <input
                            type="number"
                            min={15}
                            max={180}
                            step={5}
                            value={goal.duration || 0}
                            onChange={(e) => {
                              const next = Math.max(15, Math.min(180, Number(e.target.value) || 60));
                              updateReviewGoal(goal.id, { duration: next });
                            }}
                            className="w-full rounded-xl border border-border bg-card/60 px-3 py-2 text-sm"
                          />
                        </div>
                      </div>

                      <div className={`rounded-2xl border p-4 text-sm ${riskStyles.card}`}>
                        <div className="flex items-start gap-3">
                          <span className={`material-symbols-outlined ${riskStyles.title}`}>
                            {riskLevel === 'high' ? 'error' : riskLevel === 'medium' ? 'warning' : 'verified'}
                          </span>
                          <div className="space-y-2">
                            <p className={`font-semibold ${riskStyles.title}`}>Safety check: {riskLevel.toUpperCase()} risk</p>
                            <p className={`text-xs ${riskStyles.body}`}>
                              {riskLevel === 'low'
                                ? 'Current plan appears low risk based on the model output.'
                                : 'This plan may involve health, finance, or other sensitive topics. Please acknowledge you’ll seek professional guidance where appropriate.'}
                            </p>
                            {riskLevel !== 'low' && (
                              <label className={`flex items-center gap-2 text-xs font-medium ${riskStyles.body}`}>
                                <input
                                  type="checkbox"
                                  checked={acked}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setRiskAcknowledgements(prev => ({ ...prev, [goal.id]: checked }));
                                    updateReviewGoal(goal.id, { riskAcknowledgedAt: checked ? new Date() : undefined });
                                  }}
                                  className="h-4 w-4 rounded border-border bg-card/70 text-primary focus:ring-primary"
                                />
                                I acknowledge this guidance isn’t medical/legal advice.
                              </label>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </GlassCard>

            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <button
                onClick={() => {
                  setShowFeasibilityReview(false);
                  setShowRoadmapView(true);
                }}
                className="px-6 py-3 rounded-xl border border-border bg-card/60 hover:bg-card text-sm font-bold transition w-full md:w-auto"
              >
                Back to roadmap
              </button>
              <button
                onClick={handleComplete}
                disabled={!canProceed}
                data-wt="ob-feasibility-continue"
                className={`px-8 py-3 rounded-xl text-sm font-bold transition w-full md:w-auto ${canProceed ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}
              >
                Continue
              </button>
            </div>
          </div>
        </main>
        {walkthroughActive && (
          <WalkthroughOverlay
            steps={walkthroughSteps}
            stepIndex={walkthroughStepIndex}
            onNext={handleWalkthroughNext}
            onBack={handleWalkthroughBack}
            onSkip={handleWalkthroughSkip}
            onComplete={handleWalkthroughNext}
          />
        )}
      </div>
    );
  }

  if (showIntakeStep && intakeGoalConfigs.length > 0 && currentIntakeConfig) {
    const totalGoals = intakeGoalConfigs.length;
    const isLastIntakeGoal = currentIntakeGoalIndex === totalGoals - 1;
    const sensitiveByCategory = SENSITIVE_GOAL_CATEGORIES.includes(currentIntakeConfig.category);
    const sensitiveByQuestions = currentIntakeConfig.questions.some((question) =>
      question.sensitivity === 'health' || question.sensitivity === 'finance' || question.sensitivity === 'relationships'
    );
    const showSensitiveCue = sensitiveByCategory || sensitiveByQuestions;

    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <OnboardingHeader
          progressStep={2}
          isAddGoalMode={isAddGoalMode}
          onClose={onBack}
        />

        <div className="mt-16 flex items-center justify-between px-6 py-4 glass-nav border-b border-border" data-wt="ob-intake-header">
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider">
              Ambition {currentIntakeGoalIndex + 1} of {totalGoals}
            </span>
            <span className="px-3 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium">
              Step 3: Intake Questions
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">Required remaining</span>
            <span className={cn(
              "px-2 py-1 rounded-full text-xs font-bold",
              currentIntakeMissingRequired.length > 0 ? "bg-amber-500/20 text-amber-500" : "bg-emerald-500/20 text-emerald-500"
            )}>
              {currentIntakeMissingRequired.length}
            </span>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="w-full max-w-3xl mx-auto space-y-6">
            <div className="rounded-2xl border border-border bg-card/70 p-6">
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">{currentIntakeConfig.goalTitle}</h1>
              <p className="text-sm text-muted-foreground">
                Answer these questions so scheduling and blueprint logic reflect your real context.
              </p>
            </div>

            {showSensitiveCue && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-600 dark:text-amber-300">
                This goal may involve sensitive decisions. Plans are coaching support, not medical, legal, financial, or relationship advice.
              </div>
            )}

            {hasCurrentIntakeRealityChecks && (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 space-y-3">
                <p className="text-sm font-semibold text-rose-600 dark:text-rose-300">
                  Honesty check: your requested timeline may be unrealistic.
                </p>
                <ul className="space-y-1">
                  {currentIntakeRealityChecks.map((warning) => (
                    <li key={warning} className="text-xs text-rose-600/90 dark:text-rose-200/90">
                      - {warning}
                    </li>
                  ))}
                </ul>
                <label className="flex items-start gap-2 text-xs text-rose-700 dark:text-rose-200">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-rose-500/40 bg-card/80"
                    checked={currentIntakeRealityAcknowledged}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setIntakeRealityAcknowledgements((prev) => ({
                        ...prev,
                        [currentIntakeGoalIndex]: checked,
                      }));
                      setIntakeValidationErrors((prev) => {
                        const key = `${currentIntakeGoalIndex}:__reality_check`;
                        if (!prev[key]) return prev;
                        const next = { ...prev };
                        delete next[key];
                        return next;
                      });
                    }}
                  />
                  <span>I understand this timeline may not be realistic and want a safer, evidence-based plan recommendation.</span>
                </label>
                {intakeValidationErrors[`${currentIntakeGoalIndex}:__reality_check`] && (
                  <p className="text-xs text-rose-500">{intakeValidationErrors[`${currentIntakeGoalIndex}:__reality_check`]}</p>
                )}
              </div>
            )}

            {isLastIntakeGoal && prerequisitesGenerationError && (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 space-y-3">
                <p className="text-sm text-rose-600 dark:text-rose-200">{prerequisitesGenerationError}</p>
                <button
                  type="button"
                  onClick={() => { void generatePersonalizedPrerequisites(); }}
                  className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-500 hover:bg-rose-500/20 transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">refresh</span>
                  Retry personalized status check
                </button>
              </div>
            )}

            <div className="rounded-2xl border border-border bg-card/90 p-5 sm:p-6 space-y-5" data-wt="ob-intake-questions">
              {currentIntakeConfig.questions.map((question) => {
                const errorKey = `${currentIntakeGoalIndex}:${question.fieldKey}`;
                const errorMessage = intakeValidationErrors[errorKey];
                const answerValue = currentIntakeAnswers[question.fieldKey];
                const selectedValues = Array.isArray(answerValue) ? answerValue : [];
                const inputBaseClass = cn(
                  "w-full rounded-xl border px-3 py-2.5 text-sm text-foreground bg-card/70 focus:outline-none focus:ring-1 focus:ring-primary/50",
                  errorMessage ? "border-rose-500" : "border-border"
                );

                return (
                  <div key={question.id} className="space-y-2">
                    <label className="flex items-start gap-2 text-sm font-semibold text-foreground">
                      <span>{question.question}</span>
                      {question.required && <span className="text-rose-500">*</span>}
                    </label>
                    {question.helperText && (
                      <p className="text-xs text-muted-foreground">{question.helperText}</p>
                    )}

                    {(question.type === 'short_text' || question.type === 'long_text') && (
                      question.type === 'long_text' ? (
                        <textarea
                          value={typeof answerValue === 'string' ? answerValue : ''}
                          onChange={(e) => updateIntakeAnswer(currentIntakeGoalIndex, question.fieldKey, e.target.value)}
                          placeholder={question.placeholder || 'Type your answer...'}
                          className={cn(inputBaseClass, "min-h-[120px] resize-y")}
                        />
                      ) : (
                        <input
                          type="text"
                          value={typeof answerValue === 'string' ? answerValue : ''}
                          onChange={(e) => updateIntakeAnswer(currentIntakeGoalIndex, question.fieldKey, e.target.value)}
                          placeholder={question.placeholder || 'Type your answer...'}
                          className={inputBaseClass}
                        />
                      )
                    )}

                    {question.type === 'number' && (
                      <div className="relative">
                        <input
                          type="number"
                          min={question.min}
                          max={question.max}
                          value={typeof answerValue === 'number' ? answerValue : ''}
                          onChange={(e) => {
                            const raw = e.target.value;
                            updateIntakeAnswer(
                              currentIntakeGoalIndex,
                              question.fieldKey,
                              raw === '' ? null : Number(raw)
                            );
                          }}
                          className={inputBaseClass}
                          placeholder={question.placeholder || 'Enter a number'}
                        />
                        {question.unit && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                            {question.unit}
                          </span>
                        )}
                      </div>
                    )}

                    {question.type === 'single_select' && (
                      <select
                        value={typeof answerValue === 'string' ? answerValue : ''}
                        onChange={(e) => updateIntakeAnswer(currentIntakeGoalIndex, question.fieldKey, e.target.value || null)}
                        className={inputBaseClass}
                      >
                        <option value="">Select one...</option>
                        {(question.options || []).map((option) => (
                          <option key={option.id} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    )}

                    {question.type === 'multi_select' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {(question.options || []).map((option) => {
                          const checked = selectedValues.includes(option.value);
                          return (
                            <label
                              key={option.id}
                              className={cn(
                                "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer transition-colors",
                                checked ? "border-primary bg-primary/10 text-primary" : "border-border bg-card/60 text-foreground"
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  const nextValues = checked
                                    ? selectedValues.filter((item) => item !== option.value)
                                    : [...selectedValues, option.value];
                                  updateIntakeAnswer(currentIntakeGoalIndex, question.fieldKey, nextValues);
                                }}
                                className="h-4 w-4"
                              />
                              <span>{option.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {question.type === 'boolean' && (
                      <div className="flex items-center gap-2">
                        {[
                          { label: 'Yes', value: true },
                          { label: 'No', value: false },
                        ].map((option) => {
                          const selected = answerValue === option.value;
                          return (
                            <button
                              key={option.label}
                              type="button"
                              onClick={() => updateIntakeAnswer(currentIntakeGoalIndex, question.fieldKey, option.value)}
                              className={cn(
                                "px-4 py-2 rounded-xl border text-sm font-semibold transition-colors",
                                selected
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-card/60 text-foreground hover:bg-card"
                              )}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => updateIntakeAnswer(currentIntakeGoalIndex, question.fieldKey, null)}
                          className="px-4 py-2 rounded-xl border border-border bg-card/60 text-sm text-muted-foreground hover:text-foreground"
                        >
                          Clear
                        </button>
                      </div>
                    )}

                    {question.type === 'date' && (
                      <input
                        type="date"
                        value={typeof answerValue === 'string' ? answerValue : ''}
                        onChange={(e) => updateIntakeAnswer(currentIntakeGoalIndex, question.fieldKey, e.target.value || null)}
                        className={inputBaseClass}
                      />
                    )}

                    {errorMessage && (
                      <p className="text-xs text-rose-500">{errorMessage}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </main>

        <div className="border-t border-border px-6 py-4" data-wt="ob-intake-action">
          <div className="max-w-3xl mx-auto flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
            <button
              onClick={handleIntakeBack}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-card/60 border border-border text-foreground hover:bg-card transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              <span className="text-sm font-medium">
                {currentIntakeGoalIndex === 0 ? 'Back to ambitions' : 'Previous ambition'}
              </span>
            </button>

            <div className="flex items-center justify-center gap-2">
              {intakeGoalConfigs.map((_, index) => (
                <div
                  key={index}
                  className={cn(
                    "h-2 w-2 rounded-full transition-all",
                    index === currentIntakeGoalIndex
                      ? "w-4 bg-primary"
                      : index < currentIntakeGoalIndex
                        ? "bg-primary/70"
                        : "bg-muted"
                  )}
                />
              ))}
            </div>

            <button
              onClick={handleIntakeNext}
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-brand-gradient text-primary-foreground font-bold hover:brightness-110 transition-all shadow-lg shadow-primary/25"
            >
              <span>{isLastIntakeGoal ? 'Continue to verification' : 'Next ambition'}</span>
              <span className="material-symbols-outlined text-[18px]">
                {isLastIntakeGoal ? 'rocket_launch' : 'arrow_forward'}
              </span>
            </button>
          </div>
        </div>
        {walkthroughActive && (
          <WalkthroughOverlay
            steps={walkthroughSteps}
            stepIndex={walkthroughStepIndex}
            onNext={handleWalkthroughNext}
            onBack={handleWalkthroughBack}
            onSkip={handleWalkthroughSkip}
            onComplete={handleWalkthroughNext}
          />
        )}
      </div>
    );
  }

  // Render Status Check (Goal Verification)
  if (showStatusCheck && analyzedGoals.length > 0) {
    return (
      <div className="relative">
        <StatusCheck
          goals={analyzedGoals}
          onComplete={handleStatusCheckComplete}
          onBack={() => {
            setShowStatusCheck(false);
            if (intakeGoalConfigs.length > 0) {
              setShowIntakeStep(true);
              setCurrentIntakeGoalIndex(Math.max(0, intakeGoalConfigs.length - 1));
            } else {
              setStep(1);
            }
          }}
          onClose={onBack}
          isAddGoalMode={isAddGoalMode}
        />
        {walkthroughActive && (
          <WalkthroughOverlay
            steps={walkthroughSteps}
            stepIndex={walkthroughStepIndex}
            onNext={handleWalkthroughNext}
            onBack={handleWalkthroughBack}
            onSkip={handleWalkthroughSkip}
            onComplete={handleWalkthroughNext}
          />
        )}
      </div>
    );
  }

  // Main UI
  return (
    <div className="flex h-screen w-full bg-background text-foreground font-display overflow-hidden">
      {/* Top Navigation - Consistent Stitch Header */}
      <OnboardingHeader
        progressStep={step}
        isAddGoalMode={isAddGoalMode}
        onClose={onBack}
      />

      <main className="flex-1 flex items-center justify-center p-6 lg:p-12 mt-16 w-full">
        {/* Step 0: Identity Capture */}
        {step === 0 && !isAddGoalMode && (
          <div className="glass-card w-full max-w-[560px] rounded-xl p-8 md:p-12 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in duration-500">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <span className="material-symbols-outlined text-6xl">auto_awesome</span>
            </div>

            <div className="text-center mb-10">
              <h1 className="text-foreground tracking-tight text-[32px] font-bold leading-tight mb-2">Who are you becoming?</h1>
              <p className="text-muted-foreground text-base font-normal">Calibrate the AI to your natural rhythm and identity.</p>
            </div>

            <div className="space-y-8">
              {/* Identity Inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-wt="ob-profile-basic">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center">
                    <label className="text-foreground text-sm font-medium px-1">Name</label>
                    <InfoTooltip text="Select a name for your profile display." />
                  </div>
                  <input
                    value={profile.name}
                    onChange={(e) => setProfile(prev => ({ ...prev, name: e.target.value }))}
                    className="form-input w-full rounded-xl text-foreground focus:outline-0 focus:ring-1 focus:ring-primary border border-border bg-card/60 focus:border-primary h-14 placeholder:text-muted-foreground p-4 text-base transition-all"
                    placeholder="Your full name"
                    type="text"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center">
                    <label className="text-foreground text-sm font-medium px-1">Role</label>
                    <InfoTooltip text="Describe who you are or what you do (e.g., Student, Designer)." />
                  </div>
                  <input
                    value={profile.role}
                    onChange={(e) => setProfile(prev => ({ ...prev, role: e.target.value }))}
                    className="form-input w-full rounded-xl text-foreground focus:outline-0 focus:ring-1 focus:ring-primary border border-border bg-card/60 focus:border-primary h-14 placeholder:text-muted-foreground p-4 text-base transition-all"
                    placeholder="e.g. Entrepreneur"
                    type="text"
                  />
                </div>
              </div>

              {/* Rhythm & Energy Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-wt="ob-profile-energy">
                {/* Chronotype Toggle */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center">
                    <label className="text-muted-foreground text-xs font-medium px-1 uppercase tracking-wider">Natural Rhythm</label>
                    <InfoTooltip text="When do you feel most productive and alert?" />
                  </div>
                  <div className="flex bg-card/60 p-1 rounded-xl border border-border items-center relative h-12">
                    <button
                      onClick={() => setProfile(prev => ({ ...prev, chronotype: 'early_bird' }))}
                      className={`relative flex-1 flex items-center justify-center gap-2 h-full text-xs font-bold transition-all rounded-lg z-10 ${profile.chronotype === 'early_bird' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      <span className="material-symbols-outlined text-[16px]">light_mode</span>
                      EARLY BIRD
                    </button>
                    <button
                      onClick={() => setProfile(prev => ({ ...prev, chronotype: 'night_owl' }))}
                      className={`relative flex-1 flex items-center justify-center gap-2 h-full text-xs font-bold transition-all rounded-lg z-10 ${profile.chronotype === 'night_owl' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      <span className="material-symbols-outlined text-[16px]">dark_mode</span>
                      NIGHT OWL
                    </button>
                  </div>
                </div>

                {/* Energy Level Selection */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center">
                    <label className="text-muted-foreground text-xs font-medium px-1 uppercase tracking-wider">Current Energy</label>
                    <InfoTooltip text="How much bandwidth do you have for new ambitions?" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 h-12">
                    <button
                      onClick={() => setProfile(prev => ({ ...prev, energyLevel: 'high_octane' }))}
                      className={`flex items-center justify-center gap-1.5 rounded-xl border transition-all group ${profile.energyLevel === 'high_octane' ? 'border-primary bg-primary/20' : 'border-border bg-card/60 hover:border-primary/50'}`}
                      title="High Octane"
                    >
                      <span className={`material-symbols-outlined text-[20px] group-hover:scale-110 transition-transform ${profile.energyLevel === 'high_octane' ? 'text-primary' : 'text-muted-foreground'}`}>battery_full</span>
                    </button>
                    <button
                      onClick={() => setProfile(prev => ({ ...prev, energyLevel: 'balanced' }))}
                      className={`flex items-center justify-center gap-1.5 rounded-xl border transition-all group ${profile.energyLevel === 'balanced' ? 'border-primary bg-primary/20' : 'border-border bg-card/60 hover:border-primary/50'}`}
                      title="Balanced"
                    >
                      <span className={`material-symbols-outlined text-[20px] group-hover:scale-110 transition-transform ${profile.energyLevel === 'balanced' ? 'text-primary' : 'text-muted-foreground'}`}>battery_4_bar</span>
                    </button>
                    <button
                      onClick={() => setProfile(prev => ({ ...prev, energyLevel: 'recovery' }))}
                      className={`flex items-center justify-center gap-1.5 rounded-xl border transition-all group ${profile.energyLevel === 'recovery' ? 'border-primary bg-primary/20' : 'border-border bg-card/60 hover:border-primary/50'}`}
                      title="Recovery Mode"
                    >
                      <span className={`material-symbols-outlined text-[20px] group-hover:scale-110 transition-transform ${profile.energyLevel === 'recovery' ? 'text-primary' : 'text-muted-foreground'}`}>battery_charging_20</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Time Preferences (Expandable) */}
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => setIsTimePrefsExpanded(prev => !prev)}
                  className="flex items-center justify-between w-full text-left group"
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[20px]">schedule</span>
                    <span className="text-foreground text-sm font-medium">Time Preferences</span>
                    <InfoTooltip text="Set your boundaries for a realistic schedule." />
                    <span className="text-muted-foreground text-xs ml-auto">(optional)</span>
                  </div>
                  <span className={`material-symbols-outlined text-muted-foreground transition-transform ${isTimePrefsExpanded ? 'rotate-180' : ''}`}>
                    expand_more
                  </span>
                </button>

                {isTimePrefsExpanded && (
                  <div className="space-y-5 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    {/* Availability Templates */}
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        <label className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Availability Templates</label>
                        <InfoTooltip text="Quick-start blocks for common schedules. You can edit after selecting." />
                      </div>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {AVAILABILITY_TEMPLATES.map(template => (
                          <button
                            key={template.id}
                            onClick={() => {
                              const now = Date.now();
                              setConstraints(prev => ({
                                ...prev,
                                ...template.constraints,
                                workBlocks: (template.constraints.workBlocks || []).map((b, idx) => ({
                                  ...b,
                                  id: b.id || `${template.id}-work-${idx}-${now}`
                                })),
                                blockedSlots: (template.constraints.blockedSlots || []).map((b, idx) => ({
                                  ...b,
                                  id: b.id || `${template.id}-blocked-${idx}-${now}`
                                })),
                              }));
                            }}
                            className="p-3 rounded-xl border border-border bg-card/60 hover:border-primary/50 hover:bg-card/80 transition-all text-left"
                          >
                            <p className="text-sm font-semibold text-foreground">{template.label}</p>
                            <p className="text-xs text-muted-foreground">{template.description}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Work Blocks */}
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <label className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Work Blocks</label>
                        <button
                          type="button"
                          onClick={() => setConstraints(prev => ({
                            ...prev,
                            workBlocks: [
                              ...(prev.workBlocks || []),
                              {
                                id: `work-${Date.now()}`,
                                title: 'Work',
                                days: [0, 1, 2, 3, 4],
                                start: '09:00',
                                end: '17:00',
                                type: 'work',
                                isFlexible: false,
                                weekPattern: 'default',
                              }
                            ]
                          }))}
                          className="text-xs font-semibold text-primary hover:text-primary/80"
                        >
                          + Add Work Block
                        </button>
                      </div>
                      {(constraints.workBlocks || []).length === 0 && (
                        <p className="text-xs text-muted-foreground">No work blocks yet. Add one to protect work hours.</p>
                      )}
                      {(constraints.workBlocks || []).map((block, index) => (
                        <div key={block.id} className="p-4 rounded-xl border border-border bg-card/60 space-y-3">
                          <div className="flex flex-col md:flex-row md:items-center gap-3">
                            <input
                              value={block.title}
                              onChange={(e) => setConstraints(prev => ({
                                ...prev,
                                workBlocks: (prev.workBlocks || []).map((b, idx) => idx === index ? { ...b, title: e.target.value } : b)
                              }))}
                              className="flex-1 bg-transparent border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                              placeholder="Work block name"
                            />
                            <select
                              value={block.weekPattern || 'default'}
                              onChange={(e) => setConstraints(prev => ({
                                ...prev,
                                workBlocks: (prev.workBlocks || []).map((b, idx) => idx === index ? { ...b, weekPattern: e.target.value as 'default' | 'A' | 'B' } : b)
                              }))}
                              className="bg-card/60 border border-border rounded-lg px-3 py-2 text-xs font-semibold text-foreground"
                            >
                              {WEEK_PATTERN_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => setConstraints(prev => ({
                                ...prev,
                                workBlocks: (prev.workBlocks || []).filter((_, idx) => idx !== index)
                              }))}
                              className="text-xs text-rose-400 hover:text-rose-300"
                            >
                              Remove
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {DAY_LABELS.map((label, dayIdx) => {
                              const isActive = block.days?.includes(dayIdx);
                              return (
                                <button
                                  key={`${block.id}-${label}`}
                                  type="button"
                                  onClick={() => setConstraints(prev => ({
                                    ...prev,
                                    workBlocks: (prev.workBlocks || []).map((b, idx) => {
                                      if (idx !== index) return b;
                                      const days = b.days || [];
                                      const nextDays = days.includes(dayIdx)
                                        ? days.filter(d => d !== dayIdx)
                                        : [...days, dayIdx].sort((a, b) => a - b);
                                      return { ...b, days: nextDays };
                                    })
                                  }))}
                                  className={`px-2 py-1 rounded-lg text-xs font-semibold border transition-all ${isActive ? 'bg-primary/20 border-primary text-primary' : 'bg-card/60 border-border text-muted-foreground'}`}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="flex items-center gap-2 bg-card/60 border border-border rounded-lg px-3 py-2">
                              <span className="text-xs text-muted-foreground">From</span>
                              <input
                                type="time"
                                value={block.start}
                                onChange={(e) => setConstraints(prev => ({
                                  ...prev,
                                  workBlocks: (prev.workBlocks || []).map((b, idx) => idx === index ? { ...b, start: e.target.value } : b)
                                }))}
                                className="bg-transparent text-foreground text-sm focus:outline-none w-full text-right font-mono"
                              />
                            </div>
                            <div className="flex items-center gap-2 bg-card/60 border border-border rounded-lg px-3 py-2">
                              <span className="text-xs text-muted-foreground">To</span>
                              <input
                                type="time"
                                value={block.end}
                                onChange={(e) => setConstraints(prev => ({
                                  ...prev,
                                  workBlocks: (prev.workBlocks || []).map((b, idx) => idx === index ? { ...b, end: e.target.value } : b)
                                }))}
                                className="bg-transparent text-foreground text-sm focus:outline-none w-full text-right font-mono"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Blocked Slots */}
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <label className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Other Blocked Times</label>
                        <button
                          type="button"
                          onClick={() => setConstraints(prev => ({
                            ...prev,
                            blockedSlots: [
                              ...(prev.blockedSlots || []),
                              {
                                id: `blocked-${Date.now()}`,
                                title: 'Blocked',
                                days: [0, 1, 2, 3, 4],
                                start: '12:00',
                                end: '13:00',
                                type: 'personal',
                                isFlexible: true,
                                weekPattern: 'default',
                              }
                            ]
                          }))}
                          className="text-xs font-semibold text-primary hover:text-primary/80"
                        >
                          + Add Blocked Slot
                        </button>
                      </div>
                      {(constraints.blockedSlots || []).length === 0 && (
                        <p className="text-xs text-muted-foreground">Add commute, meals, childcare, or personal commitments.</p>
                      )}
                      {(constraints.blockedSlots || []).map((block, index) => (
                        <div key={block.id} className="p-4 rounded-xl border border-border bg-card/60 space-y-3">
                          <div className="flex flex-col md:flex-row md:items-center gap-3">
                            <input
                              value={block.title}
                              onChange={(e) => setConstraints(prev => ({
                                ...prev,
                                blockedSlots: (prev.blockedSlots || []).map((b, idx) => idx === index ? { ...b, title: e.target.value } : b)
                              }))}
                              className="flex-1 bg-transparent border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                              placeholder="Blocked slot name"
                            />
                            <select
                              value={block.type}
                              onChange={(e) => setConstraints(prev => ({
                                ...prev,
                                blockedSlots: (prev.blockedSlots || []).map((b, idx) => idx === index ? { ...b, type: e.target.value as TimeBlock['type'] } : b)
                              }))}
                              className="bg-card/60 border border-border rounded-lg px-3 py-2 text-xs font-semibold text-foreground"
                            >
                              <option value="personal">Personal</option>
                              <option value="commute">Commute</option>
                              <option value="meal">Meal</option>
                              <option value="other">Other</option>
                            </select>
                            <select
                              value={block.weekPattern || 'default'}
                              onChange={(e) => setConstraints(prev => ({
                                ...prev,
                                blockedSlots: (prev.blockedSlots || []).map((b, idx) => idx === index ? { ...b, weekPattern: e.target.value as 'default' | 'A' | 'B' } : b)
                              }))}
                              className="bg-card/60 border border-border rounded-lg px-3 py-2 text-xs font-semibold text-foreground"
                            >
                              {WEEK_PATTERN_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => setConstraints(prev => ({
                                ...prev,
                                blockedSlots: (prev.blockedSlots || []).filter((_, idx) => idx !== index)
                              }))}
                              className="text-xs text-rose-400 hover:text-rose-300"
                            >
                              Remove
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {DAY_LABELS.map((label, dayIdx) => {
                              const isActive = block.days?.includes(dayIdx);
                              return (
                                <button
                                  key={`${block.id}-${label}`}
                                  type="button"
                                  onClick={() => setConstraints(prev => ({
                                    ...prev,
                                    blockedSlots: (prev.blockedSlots || []).map((b, idx) => {
                                      if (idx !== index) return b;
                                      const days = b.days || [];
                                      const nextDays = days.includes(dayIdx)
                                        ? days.filter(d => d !== dayIdx)
                                        : [...days, dayIdx].sort((a, b) => a - b);
                                      return { ...b, days: nextDays };
                                    })
                                  }))}
                                  className={`px-2 py-1 rounded-lg text-xs font-semibold border transition-all ${isActive ? 'bg-primary/20 border-primary text-primary' : 'bg-card/60 border-border text-muted-foreground'}`}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="flex items-center gap-2 bg-card/60 border border-border rounded-lg px-3 py-2">
                              <span className="text-xs text-muted-foreground">From</span>
                              <input
                                type="time"
                                value={block.start}
                                onChange={(e) => setConstraints(prev => ({
                                  ...prev,
                                  blockedSlots: (prev.blockedSlots || []).map((b, idx) => idx === index ? { ...b, start: e.target.value } : b)
                                }))}
                                className="bg-transparent text-foreground text-sm focus:outline-none w-full text-right font-mono"
                              />
                            </div>
                            <div className="flex items-center gap-2 bg-card/60 border border-border rounded-lg px-3 py-2">
                              <span className="text-xs text-muted-foreground">To</span>
                              <input
                                type="time"
                                value={block.end}
                                onChange={(e) => setConstraints(prev => ({
                                  ...prev,
                                  blockedSlots: (prev.blockedSlots || []).map((b, idx) => idx === index ? { ...b, end: e.target.value } : b)
                                }))}
                                className="bg-transparent text-foreground text-sm focus:outline-none w-full text-right font-mono"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Sleep Schedule */}
                    <div className="flex flex-col gap-2">
                      <label className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Sleep Schedule</label>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 flex items-center gap-3 bg-card/60 border border-border rounded-lg px-4 py-3">
                          <span className="material-symbols-outlined text-muted-foreground text-[18px]">dark_mode</span>
                          <input
                            type="time"
                            value={constraints.sleepStart || '22:30'}
                            onChange={(e) => setConstraints(prev => ({ ...prev, sleepStart: e.target.value }))}
                            className="bg-transparent text-foreground text-base focus:outline-none w-full text-right font-mono"
                          />
                        </div>
                        <span className="text-muted-foreground/60 font-light">→</span>
                        <div className="flex-1 flex items-center gap-3 bg-card/60 border border-border rounded-lg px-4 py-3">
                          <span className="material-symbols-outlined text-muted-foreground text-[18px]">light_mode</span>
                          <input
                            type="time"
                            value={constraints.sleepEnd || '06:30'}
                            onChange={(e) => setConstraints(prev => ({ ...prev, sleepEnd: e.target.value }))}
                            className="bg-transparent text-foreground text-base focus:outline-none w-full text-right font-mono"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Peak Productivity */}
                    <div className="flex flex-col gap-2">
                      <label className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Peak Productivity</label>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 flex items-center gap-3 bg-card/60 border border-border rounded-lg px-4 py-3">
                          <span className="material-symbols-outlined text-primary text-[18px]">bolt</span>
                          <input
                            type="time"
                            value={constraints.peakStart || '09:00'}
                            onChange={(e) => setConstraints(prev => ({ ...prev, peakStart: e.target.value }))}
                            className="bg-transparent text-foreground text-base focus:outline-none w-full text-right font-mono"
                          />
                        </div>
                        <span className="text-muted-foreground/60 font-light">→</span>
                        <div className="flex-1 flex items-center gap-3 bg-card/60 border border-border rounded-lg px-4 py-3">
                          <span className="material-symbols-outlined text-primary text-[18px]">bolt</span>
                          <input
                            type="time"
                            value={constraints.peakEnd || '12:00'}
                            onChange={(e) => setConstraints(prev => ({ ...prev, peakEnd: e.target.value }))}
                            className="bg-transparent text-foreground text-base focus:outline-none w-full text-right font-mono"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Time Exceptions */}
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <label className="text-muted-foreground text-xs font-medium uppercase tracking-wider">One-Off Exceptions</label>
                        <button
                          type="button"
                          onClick={() => setConstraints(prev => ({
                            ...prev,
                            timeExceptions: [
                              ...(prev.timeExceptions || []),
                              {
                                id: `exception-${Date.now()}`,
                                date: format(new Date(), 'yyyy-MM-dd'),
                                start: '09:00',
                                end: '10:00',
                                isBlocked: true,
                                reason: '',
                              },
                            ],
                          }))}
                          className="text-xs font-semibold text-primary hover:text-primary/80"
                        >
                          + Add Exception
                        </button>
                      </div>
                      {(constraints.timeExceptions || []).length === 0 && (
                        <p className="text-xs text-muted-foreground">Add date-specific blocks or extra availability.</p>
                      )}
                      {(constraints.timeExceptions || []).map((ex, index) => (
                        <div key={ex.id} className="p-4 rounded-xl border border-border bg-card/60 space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <input
                              type="date"
                              value={ex.date}
                              onChange={(e) => setConstraints(prev => ({
                                ...prev,
                                timeExceptions: (prev.timeExceptions || []).map((item, idx) => idx === index ? { ...item, date: e.target.value } : item)
                              }))}
                              className="bg-transparent border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                            />
                            <input
                              type="time"
                              value={ex.start}
                              onChange={(e) => setConstraints(prev => ({
                                ...prev,
                                timeExceptions: (prev.timeExceptions || []).map((item, idx) => idx === index ? { ...item, start: e.target.value } : item)
                              }))}
                              className="bg-transparent border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono"
                            />
                            <input
                              type="time"
                              value={ex.end}
                              onChange={(e) => setConstraints(prev => ({
                                ...prev,
                                timeExceptions: (prev.timeExceptions || []).map((item, idx) => idx === index ? { ...item, end: e.target.value } : item)
                              }))}
                              className="bg-transparent border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono"
                            />
                            <select
                              value={ex.isBlocked ? 'blocked' : 'available'}
                              onChange={(e) => setConstraints(prev => ({
                                ...prev,
                                timeExceptions: (prev.timeExceptions || []).map((item, idx) => idx === index ? { ...item, isBlocked: e.target.value === 'blocked' } : item)
                              }))}
                              className="bg-card/60 border border-border rounded-lg px-3 py-2 text-xs font-semibold text-foreground"
                            >
                              <option value="blocked">Blocked</option>
                              <option value="available">Available</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-3">
                            <input
                              value={ex.reason || ''}
                              onChange={(e) => setConstraints(prev => ({
                                ...prev,
                                timeExceptions: (prev.timeExceptions || []).map((item, idx) => idx === index ? { ...item, reason: e.target.value } : item)
                              }))}
                              className="flex-1 bg-transparent border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                              placeholder="Reason (optional)"
                            />
                            <button
                              type="button"
                              onClick={() => setConstraints(prev => ({
                                ...prev,
                                timeExceptions: (prev.timeExceptions || []).filter((_, idx) => idx !== index)
                              }))}
                              className="text-xs text-rose-400 hover:text-rose-300"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 space-y-3">
                <button
                  onClick={handleProfileSubmit}
                  disabled={!profile.name || !profile.role}
                  data-wt="ob-profile-continue"
                  className="w-full bg-brand-gradient glow-button hover:brightness-110 active:scale-[0.98] transition-all text-primary-foreground h-14 rounded-xl font-bold text-lg flex items-center justify-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>Continue Journey</span>
                  <span className="material-symbols-outlined">arrow_forward</span>
                </button>
                <button
                  onClick={() => {
                    // Skip with default profile values
                    setProfile(prev => ({
                      ...prev,
                      name: prev.name || 'Dreamer',
                      role: prev.role || 'Aspiring'
                    }));
                    setStep(1);
                  }}
                  className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
                >
                  Skip for now - I'll fill this later
                </button>
              </div>
            </div>
          </div>
        )}

        {(step === 1 || isAddGoalMode) && (
          <div className="max-w-[1000px] w-full mx-auto flex flex-col items-center gap-6 h-full animate-in fade-in slide-in-from-bottom-5 duration-500 pt-8 lg:pt-16">

            {/* Header Area */}
            <div className="flex flex-col items-center text-center gap-6 w-full max-w-2xl relative z-20">
              <h1 className="text-foreground text-4xl lg:text-5xl font-extrabold leading-tight tracking-tight">
                What's your <span className="text-primary">ambition</span>?
              </h1>
            </div>

            {/* Centered Search-Style Input */}
            <div className="w-full max-w-2xl relative z-20">
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
                  <span className="material-symbols-outlined text-muted-foreground group-focus-within:text-primary transition-colors text-2xl">search_sparkle</span>
                </div>
                <input
                  type="text"
                  value={ambitionInput}
                  onChange={(e) => {
                    setAmbitionInput(e.target.value);
                    setAmbitionAnalysisError(null);
                  }}
                  data-wt="ob-ambition-input"
                  className="w-full pl-14 pr-6 py-5 rounded-full bg-card/60 border border-border text-foreground placeholder:text-muted-foreground text-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:bg-card/80 transition-all shadow-lg backdrop-blur-md"
                  placeholder="Describe your ideal reality... e.g., 'Run a marathon by November'"
                />
              </div>

              {/* Sub-Header moved below Input */}
            </div>

            {/* Bubble Cloud - Centered Below */}
            <div className="relative w-full flex-1 min-h-[400px] max-h-[600px] -mt-10 overflow-hidden mask-gradient-b" data-wt="ob-ambition-bubbles">
              {/* Manual limiting logic passed to FloatingBubbles or handled here via props transparency if supported, 
                  but user asked specifically to "limit selection to 10". 
                  The `handleGoalToggle` function already needs a check for this limit.
               */}
              <FloatingBubbles
                goals={[...POPULAR_GOALS].slice(0, 25)}
                selectedGoals={selectedGoals}
                onToggle={(goal) => {
                  if (selectedGoals.includes(goal) || selectedGoals.length < 10) {
                    handleGoalToggle(goal);
                  }
                }}
                containerClassName="absolute inset-0"
              />
            </div>

            {ambitionAnalysisError && (
              <div className="w-full max-w-2xl rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
                <p>{ambitionAnalysisError}</p>
                <button
                  type="button"
                  onClick={handleAmbitionsSubmit}
                  className="mt-2 inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-500 hover:bg-rose-500/20 transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">refresh</span>
                  Retry analysis
                </button>
              </div>
            )}

            {/* Action Button - Floating Bottom */}
            <div className="fixed bottom-12 z-50 animate-in slide-in-from-bottom-10 duration-700 delay-300">
              <button
                onClick={handleAmbitionsSubmit}
                disabled={selectedGoals.length === 0 && !ambitionInput.trim()}
                data-wt="ob-ambition-continue"
                className="flex items-center justify-center gap-3 px-8 py-3 rounded-full bg-brand-gradient glow-button text-primary-foreground font-bold text-lg shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                <span>Continue</span>
                <span className="material-symbols-outlined fill-1">auto_awesome</span>
              </button>
            </div>

          </div>
        )}
      </main>

      {walkthroughActive && (
        <WalkthroughOverlay
          steps={walkthroughSteps}
          stepIndex={walkthroughStepIndex}
          onNext={handleWalkthroughNext}
          onBack={handleWalkthroughBack}
          onSkip={handleWalkthroughSkip}
          onComplete={handleWalkthroughNext}
        />
      )}

      <footer className="fixed bottom-0 w-full p-4 pointer-events-none z-0">
        <div className="text-center">
          <p className="text-muted-foreground/40 text-xs font-mono tracking-widest">dlulu life ambition engine v2.0</p>
        </div>
      </footer>
    </div >
  );
};

export default Onboarding;
