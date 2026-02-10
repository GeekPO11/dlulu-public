import { render, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import type { BehaviorPlan, Goal } from '../types';

const useSupabaseDataMock = vi.fn();
const flowControl = vi.hoisted(() => ({
  navigateToGoals: false,
  emitGoalUpdate: false,
  updatedGoal: null as Goal | null,
  completeOnboarding: false,
  onboardingPayload: null as { profile: any; constraints: any; goals: Goal[] } | null,
}));

vi.mock('../lib/hooks/useSupabaseData', () => ({
  useSupabaseData: () => useSupabaseDataMock(),
}));

vi.mock('../components/LandingPage', async () => {
  const React = await import('react');
  return { default: () => React.createElement('div', null, 'LandingPage') };
});

vi.mock('../components/Onboarding', async () => {
  const React = await import('react');
  return {
    default: (props: any) => {
      React.useEffect(() => {
        if (!flowControl.completeOnboarding || !flowControl.onboardingPayload) return;
        flowControl.completeOnboarding = false;
        const payload = flowControl.onboardingPayload;
        props.onComplete?.(payload.profile, payload.constraints, payload.goals);
      }, [props.onComplete]);
      return React.createElement('div', null, 'Onboarding');
    },
  };
});

vi.mock('../components/Dashboard', async () => {
  const React = await import('react');
  return {
    default: (props: any) => {
      React.useEffect(() => {
        if (!flowControl.navigateToGoals) return;
        flowControl.navigateToGoals = false;
        props.onNavigateToGoals?.();
      }, [props.onNavigateToGoals]);
      return React.createElement('div', null, 'Dashboard');
    },
  };
});

vi.mock('../components/GoalLibrary', async () => {
  const React = await import('react');
  return {
    default: (props: any) => {
      React.useEffect(() => {
        if (!flowControl.emitGoalUpdate || !flowControl.updatedGoal) return;
        flowControl.emitGoalUpdate = false;
        props.onGoalUpdate?.(flowControl.updatedGoal);
      }, [props.onGoalUpdate]);
      return React.createElement('div', null, 'GoalLibrary');
    },
  };
});

vi.mock('../components/ResetPasswordPage', async () => {
  const React = await import('react');
  return { default: () => React.createElement('div', null, 'ResetPasswordPage') };
});
vi.mock('../components/CalendarView', async () => {
  const React = await import('react');
  return { default: () => React.createElement('div', null, 'CalendarView') };
});
vi.mock('../components/ReleaseNotes', async () => {
  const React = await import('react');
  return { default: () => React.createElement('div', null, 'ReleaseNotes') };
});
vi.mock('../components/SettingsPage', async () => {
  const React = await import('react');
  return { default: () => React.createElement('div', null, 'SettingsPage') };
});
vi.mock('../components/FullChatView', async () => {
  const React = await import('react');
  return { default: () => React.createElement('div', null, 'FullChatView') };
});
vi.mock('../components/CommitmentDetail', async () => {
  const React = await import('react');
  return { default: () => React.createElement('div', null, 'CommitmentDetail') };
});
vi.mock('../components/EventDetailModal', async () => {
  const React = await import('react');
  return { default: () => React.createElement('div', null, 'EventDetailModal') };
});
vi.mock('../components/CreateEventModal', async () => {
  const React = await import('react');
  return { default: () => React.createElement('div', null, 'CreateEventModal') };
});
vi.mock('../components/AddGoalModal', async () => {
  const React = await import('react');
  return { default: () => React.createElement('div', null, 'AddGoalModal') };
});
vi.mock('../components/FloatingDock', async () => {
  const React = await import('react');
  return { default: () => React.createElement('div', null, 'FloatingDock') };
});
vi.mock('../components/AppHeader', async () => {
  const React = await import('react');
  return { default: () => React.createElement('div', null, 'AppHeader') };
});

import App from '../App';

const behaviorPlan: BehaviorPlan = {
  smart: {
    specific: 'Train 4 sessions per week',
    measurable: 'Track weekly distance and recovery',
    achievable: 'Increase volume by 10% max per week',
    relevant: 'Build endurance and injury resistance',
    timeBound: 'Hit race-ready volume by week 16',
  },
  woop: {
    wish: 'Finish marathon strong',
    outcome: 'Sustain pace through final 10k',
    obstacles: ['Sleep debt', 'Skipping recovery days'],
    plan: ['Lock sleep window', 'Schedule recovery as non-negotiable'],
  },
  implementationIntentions: [{ if: 'Rainy weather', then: 'Run on treadmill at same time' }],
  habitStacking: [{ anchor: 'Morning coffee', routine: '15 min mobility warmup', reward: 'Post-run playlist' }],
  frictionReduction: {
    remove: ['Late-night scrolling'],
    add: ['Pre-packed gear at door'],
  },
};

const makeGoal = (overrides: Partial<Goal> = {}): Goal => ({
  id: 'goal-1',
  title: 'Run marathon',
  originalInput: 'Run marathon',
  category: 'health',
  timeline: '6 months',
  estimatedWeeks: 24,
  strategyOverview: 'Use progressive overload and recovery.',
  criticalGaps: ['Inconsistent sleep', 'No recovery planning'],
  overviewGenerated: true,
  behaviorPlan,
  priorityWeight: 70,
  riskLevel: 'medium',
  phases: [],
  currentPhaseIndex: 0,
  overallProgress: 10,
  status: 'active',
  history: [],
  preferredTime: 'morning',
  frequency: 4,
  duration: 60,
  energyCost: 'medium',
  preferredDays: [1, 3, 5],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-02'),
  ...overrides,
});

const baseSupabase = {
  isAuthenticated: false,
  authUser: null,
  isLoading: false,
  error: null,
  user: null,
  constraints: null,
  goals: [],
  calendarEvents: [],
  signUp: vi.fn(),
  signIn: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
  updateProfile: vi.fn().mockResolvedValue(undefined),
  updateConstraints: vi.fn().mockResolvedValue(undefined),
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  deleteGoal: vi.fn(),
  updateGoalStatus: vi.fn(),
  createPhase: vi.fn().mockResolvedValue(null),
  updatePhase: vi.fn(),
  deletePhase: vi.fn(),
  createMilestone: vi.fn(),
  updateMilestone: vi.fn(),
  toggleMilestone: vi.fn(),
  deleteMilestone: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  toggleTask: vi.fn(),
  deleteTask: vi.fn(),
  createSubTask: vi.fn(),
  updateSubTask: vi.fn(),
  toggleSubTask: vi.fn(),
  deleteSubTask: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  deleteEventsByGoalId: vi.fn(),
  refreshGoals: vi.fn(),
  refreshEvents: vi.fn(),
  resetPassword: vi.fn(),
  updatePassword: vi.fn(),
};

describe('Goals view population mapping', () => {
  beforeEach(() => {
    useSupabaseDataMock.mockReset();
    flowControl.navigateToGoals = false;
    flowControl.emitGoalUpdate = false;
    flowControl.updatedGoal = null;
    flowControl.completeOnboarding = false;
    flowControl.onboardingPayload = null;
    window.history.pushState({}, '', '/');
    sessionStorage.clear();
    localStorage.clear();
  });

  it('persists behavior/critical-gap/risk fields when a goal is updated from Goals view', async () => {
    const updateGoal = vi.fn().mockResolvedValue(undefined);
    const updatedGoal = makeGoal({
      strategyOverview: 'Updated strategy',
      criticalGaps: ['Updated gap 1', 'Updated gap 2'],
      riskLevel: 'high',
      priorityWeight: 90,
    });

    flowControl.navigateToGoals = true;
    flowControl.emitGoalUpdate = true;
    flowControl.updatedGoal = updatedGoal;

    useSupabaseDataMock.mockReturnValue({
      ...baseSupabase,
      isAuthenticated: true,
      authUser: { id: 'user-1' },
      user: { id: 'user-1', name: 'Audit User', userPreferences: {} },
      goals: [makeGoal()],
      updateGoal,
    });

    render(<App />);

    await waitFor(() => {
      expect(updateGoal).toHaveBeenCalledWith(
        'goal-1',
        expect.objectContaining({
          strategyOverview: 'Updated strategy',
          criticalGaps: ['Updated gap 1', 'Updated gap 2'],
          behaviorPlan,
          priorityWeight: 90,
          riskLevel: 'high',
          preferredDays: [1, 3, 5],
        })
      );
    });
  });

  it('sends behavior/critical-gap/risk fields when creating goals from onboarding completion', async () => {
    const createGoal = vi.fn().mockResolvedValue(makeGoal({ id: 'goal-new' }));
    const newGoal = makeGoal({
      id: 'draft-goal',
      title: 'New onboarding goal',
      riskLevel: 'high',
      criticalGaps: ['Gap A', 'Gap B', 'Gap C', 'Gap D'],
      behaviorPlan,
    });

    flowControl.completeOnboarding = true;
    flowControl.onboardingPayload = {
      profile: { name: 'Audit User', role: 'Founder' },
      constraints: null,
      goals: [newGoal],
    };

    useSupabaseDataMock.mockReturnValue({
      ...baseSupabase,
      isAuthenticated: true,
      authUser: { id: 'user-1' },
      user: { id: 'user-1', name: 'Audit User', userPreferences: {} },
      goals: [],
      createGoal,
    });

    render(<App />);

    await waitFor(() => {
      expect(createGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New onboarding goal',
          criticalGaps: ['Gap A', 'Gap B', 'Gap C', 'Gap D'],
          behaviorPlan,
          riskLevel: 'high',
          overviewGenerated: true,
        })
      );
    });
  });
});
