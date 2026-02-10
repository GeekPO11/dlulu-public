import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

const useSupabaseDataMock = vi.fn();
const landingControl = vi.hoisted(() => ({ autoStart: false }));

vi.mock('../lib/hooks/useSupabaseData', () => ({
  useSupabaseData: () => useSupabaseDataMock(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const result =
        table === 'subscriptions'
          ? { data: { plan_id: 'pro' }, error: null }
          : table === 'plan_entitlements'
            ? { data: { plan_id: 'pro', max_active_goals: null }, error: null }
            : { data: null, error: null };

      const query: any = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => result,
      };

      return query;
    },
  },
}));

vi.mock('../components/LandingPage', async () => {
  const React = await import('react');
  return {
    default: (props: any) => {
      React.useEffect(() => {
        if (!landingControl.autoStart) return;
        landingControl.autoStart = false;
        props.onStartOnboarding?.('Test ambition');
      }, [props.onStartOnboarding]);
      return React.createElement('div', null, 'LandingPage');
    },
  };
});

vi.mock('../components/Onboarding', async () => {
  const React = await import('react');
  return {
    default: (props: any) => React.createElement(
      'div',
      null,
      props?.isAddGoalMode ? 'Onboarding (Add Goal)' : 'Onboarding (New User)'
    ),
  };
});

vi.mock('../components/Dashboard', async () => {
  const React = await import('react');
  return {
    default: () => React.createElement('div', null, 'Dashboard'),
  };
});

vi.mock('../components/ResetPasswordPage', async () => {
  const React = await import('react');
  return {
    default: () => React.createElement('div', null, 'ResetPasswordPage'),
  };
});

vi.mock('../components/CalendarView', async () => {
  const React = await import('react');
  return {
    default: () => React.createElement('div', null, 'CalendarView'),
  };
});

vi.mock('../components/GoalLibrary', async () => {
  const React = await import('react');
  return {
    default: () => React.createElement('div', null, 'GoalLibrary'),
  };
});

vi.mock('../components/ReleaseNotes', async () => {
  const React = await import('react');
  return {
    default: () => React.createElement('div', null, 'ReleaseNotes'),
  };
});

vi.mock('../components/SettingsPage', async () => {
  const React = await import('react');
  return {
    default: () => React.createElement('div', null, 'SettingsPage'),
  };
});

vi.mock('../components/FullChatView', async () => {
  const React = await import('react');
  return {
    default: () => React.createElement('div', null, 'FullChatView'),
  };
});

vi.mock('../components/CommitmentDetail', async () => {
  const React = await import('react');
  return {
    default: () => React.createElement('div', null, 'CommitmentDetail'),
  };
});

vi.mock('../components/EventDetailModal', async () => {
  const React = await import('react');
  return {
    default: () => React.createElement('div', null, 'EventDetailModal'),
  };
});

vi.mock('../components/CreateEventModal', async () => {
  const React = await import('react');
  return {
    default: () => React.createElement('div', null, 'CreateEventModal'),
  };
});

vi.mock('../components/AddGoalModal', async () => {
  const React = await import('react');
  return {
    default: () => React.createElement('div', null, 'AddGoalModal'),
  };
});

vi.mock('../components/FloatingDock', async () => {
  const React = await import('react');
  return {
    default: () => React.createElement('div', null, 'FloatingDock'),
  };
});

vi.mock('../components/AppHeader', async () => {
  const React = await import('react');
  return {
    default: () => React.createElement('div', null, 'AppHeader'),
  };
});

import App from '../App';

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
  updateProfile: vi.fn(),
  updateConstraints: vi.fn(),
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  deleteGoal: vi.fn(),
  updateGoalStatus: vi.fn(),
  createPhase: vi.fn(),
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

describe('App routing', () => {
  beforeEach(() => {
    useSupabaseDataMock.mockReset();
    window.history.pushState({}, '', '/');
    landingControl.autoStart = false;
    sessionStorage.clear();
    localStorage.clear();
  });

  it('shows reset password view when URL indicates recovery', async () => {
    window.history.pushState({}, '', '/reset-password');

    useSupabaseDataMock.mockReturnValue({
      ...baseSupabase,
      isAuthenticated: false,
    });

    render(<App />);

    expect(
      await screen.findByText(/ResetPasswordPage/i)
    ).toBeInTheDocument();
  });

  it('shows reset password view when hash contains recovery token', async () => {
    window.history.pushState({}, '', '/#type=recovery');

    useSupabaseDataMock.mockReturnValue({
      ...baseSupabase,
      isAuthenticated: false,
    });

    render(<App />);

    expect(
      await screen.findByText(/ResetPasswordPage/i)
    ).toBeInTheDocument();
  });

  it('routes authenticated users with goals to dashboard', async () => {
    useSupabaseDataMock.mockReturnValue({
      ...baseSupabase,
      isAuthenticated: true,
      user: { id: 'user-1', name: 'Test' },
      goals: [{ id: 'goal-1' }],
    });

    render(<App />);

    await waitFor(() =>
      expect(screen.getByText(/Dashboard/i)).toBeInTheDocument()
    );
  });

  it('navigates to onboarding when landing triggers start', async () => {
    landingControl.autoStart = true;

    useSupabaseDataMock.mockReturnValue({
      ...baseSupabase,
      isAuthenticated: true,
      user: { id: 'user-1', name: 'Test' },
    });

    render(<App />);

    await waitFor(() =>
      expect(screen.getByText(/Onboarding \(New User\)/i)).toBeInTheDocument()
    );
  });

  it('keeps pending-ambition users without goals in full onboarding mode', async () => {
    sessionStorage.setItem('dlulu_onboarding_ambition', 'Lose weight');

    useSupabaseDataMock.mockReturnValue({
      ...baseSupabase,
      isAuthenticated: true,
      authUser: { id: 'user-1' },
      user: { id: 'user-1', name: 'Test' },
      goals: [],
    });

    render(<App />);

    await waitFor(() =>
      expect(screen.getByText(/Onboarding \(New User\)/i)).toBeInTheDocument()
    );
  });

  it('routes pending-ambition users with active goals into add-goal onboarding mode', async () => {
    sessionStorage.setItem('dlulu_onboarding_ambition', 'Launch a startup');

    useSupabaseDataMock.mockReturnValue({
      ...baseSupabase,
      isAuthenticated: true,
      authUser: { id: 'user-1' },
      user: { id: 'user-1', name: 'Test' },
      goals: [{ id: 'goal-1', status: 'active' }],
    });

    render(<App />);

    await waitFor(() =>
      expect(screen.getByText(/Onboarding \(Add Goal\)/i)).toBeInTheDocument()
    );
  });
});
