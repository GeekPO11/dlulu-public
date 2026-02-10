import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import LandingPage from './components/LandingPage';
import ReleaseNotes from './components/ReleaseNotes';
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';
// COMMENTED OUT: Sprint feature - to be worked on later
// import SprintView from './components/SprintView';
import CalendarView from './components/CalendarView';
import GoalLibrary from './components/GoalLibrary';
import CommitmentDetail from './components/CommitmentDetail';
import EventDetailModal from './components/EventDetailModal';
import CreateEventModal from './components/CreateEventModal';
import AddGoalModal from './components/AddGoalModal';
import ResetPasswordPage from './components/ResetPasswordPage';
import SettingsPage from './components/SettingsPage';
import PricingPage from './components/PricingPage';
import CheckoutModal from './components/CheckoutModal';
import UpgradeGateModal from './components/UpgradeGateModal';
import FullChatView from './components/FullChatView';
import WalkthroughOverlay, { type WalkthroughStep } from './components/WalkthroughOverlay';
import { Button } from './components/ui/button';
import { Avatar, AvatarFallback } from './components/ui/avatar';
import { Badge } from './components/ui/badge';
import { cn } from './lib/utils';
import { logger } from './lib/logger';
import { analytics, AnalyticsEvents } from './lib/analytics';
import { Home, Target, Calendar, LogOut, Settings } from 'lucide-react';
import FloatingDock from './components/FloatingDock';
import AppHeader from './components/AppHeader';
import { supabase } from './lib/supabase';
// Zap icon commented out with Sprint feature
import type {
  UserProfile,
  Goal,
  Commitment,
  TimeConstraints,
  HistoryEntry,
  SubTask,
  UserPreferences,
} from './types';
import type {
  CalendarEvent,
} from './constants/calendarTypes';
import { useSupabaseData } from './lib/hooks/useSupabaseData';
import { generateGoalSchedule } from './services/gemini';

// =============================================================================
// Date/Time Helper Functions
// =============================================================================

const getTimeFromDateTime = (dateTime: string | Date | undefined): string | null => {
  if (!dateTime) return null;
  try {
    if (typeof dateTime === 'string') {
      if (dateTime.includes('T')) return dateTime.slice(11, 16);
      return null;
    }
    if (dateTime instanceof Date) {
      return `${dateTime.getHours().toString().padStart(2, '0')}:${dateTime.getMinutes().toString().padStart(2, '0')}`;
    }
    return null;
  } catch { return null; }
};

const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + (minutes || 0);
};

const calculateGoalProgressFromPhases = (phases: Goal['phases']): number => {
  let totalItems = 0;
  let completedItems = 0;

  phases.forEach((phase) => {
    phase.milestones.forEach((milestone) => {
      const tasks = milestone.tasks || [];
      if (tasks.length > 0) {
        tasks.forEach((task) => {
          if (task.isStrikethrough) return;
          const subTasks = (task.subTasks || []).filter((st) => !st.isStrikethrough);
          if (subTasks.length > 0) {
            subTasks.forEach((subtask) => {
              totalItems += 1;
              if (subtask.isCompleted) completedItems += 1;
            });
          } else {
            totalItems += 1;
            if (task.isCompleted) completedItems += 1;
          }
        });
      } else {
        totalItems += 1;
        if (milestone.isCompleted) completedItems += 1;
      }
    });
  });

  return totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
};

const formatTimeEnd = (startTime: string, durationMinutes: number): string => {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = startMinutes + durationMinutes;
  const hours = Math.floor(endMinutes / 60);
  const minutes = endMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

const getLocalTimeZone = (): string => {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
};

// Helper to extract date string (YYYY-MM-DD) from dateTime
const getDateFromDateTime = (dateTime: string | Date | undefined): string | null => {
  if (!dateTime) return null;
  try {
    if (typeof dateTime === 'string') {
      // If it's an ISO datetime string like "2025-01-01T09:00:00"
      if (dateTime.includes('T')) return dateTime.slice(0, 10);
      // If it's already a date string like "2025-01-01"
      if (dateTime.match(/^\d{4}-\d{2}-\d{2}$/)) return dateTime;
      return null;
    }
    if (dateTime instanceof Date) {
      const year = dateTime.getFullYear();
      const month = (dateTime.getMonth() + 1).toString().padStart(2, '0');
      const day = dateTime.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return null;
  } catch { return null; }
};

// =============================================================================
// View Types
// =============================================================================

// UPDATED: Removed 'sprint' - feature commented out for now
type AppView = 'landing' | 'onboarding' | 'dashboard' | 'calendar' | 'goals' | 'releaseNotes' | 'resetPassword' | 'settings' | 'chat' | 'pricing';

type ProductTourStep = WalkthroughStep & {
  view: AppView;
  optional?: boolean;
  waitFor?: () => boolean;
  canProceed?: () => boolean;
  skipWhen?: () => boolean;
  primaryLabel?: string;
};

// =============================================================================
// Main App Component
// =============================================================================

const App: React.FC = () => {
  // =============================================================================
  // SUPABASE DATA HOOK - Real-time sync with database
  // =============================================================================
  const {
    isAuthenticated,
    authUser,
    isLoading: supabaseLoading,
    error: supabaseError,
    user: supabaseUser,
    constraints: supabaseConstraints,
    goals: supabaseGoals,
    calendarEvents: supabaseCalendarEvents,
    calendarSchemaCapabilities,
    storageMode,
    setStorageMode,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    updateProfile,
    updateConstraints: updateSupabaseConstraints,
    createGoal,
    updateGoal,
    deleteGoal,
    updateGoalStatus,
    createPhase,
    updatePhase,
    deletePhase,
    createMilestone,
    updateMilestone,
    toggleMilestone,
    deleteMilestone,
    createTask,
    updateTask,
    setTaskCompletion,
    toggleTask,
    deleteTask,
    createSubTask,
    updateSubTask: updateSupabaseSubTask,
    toggleSubTask,
    deleteSubTask,
    createEvent,
    updateEvent,
    deleteEvent,
    deleteEventsByGoalId,
    refreshGoals,
    refreshEvents,
    resetPassword,
    updatePassword,
  } = useSupabaseData();

  // Core State
  const [view, setView] = useState<AppView>(() => {
    // Check for reset password URL on initial load to avoid race condition with auth redirect
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      const hash = window.location.hash;
      if (path === '/reset-password' || hash.includes('type=recovery')) {
        // Password reset URL detected
        return 'resetPassword';
      }
    }
    return 'landing';
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingGoal, setIsAddingGoal] = useState(false);
  const [targetGoalId, setTargetGoalId] = useState<string | undefined>(undefined);
  const [pendingAmbition, setPendingAmbition] = useState<string | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    const stored = sessionStorage.getItem('dlulu_onboarding_ambition');
    return stored || undefined;
  });
  const [upgradeGateOpen, setUpgradeGateOpen] = useState(false);
  const [upgradeGateMaxGoals, setUpgradeGateMaxGoals] = useState<number | null>(1);
  const [upgradeCheckoutOpen, setUpgradeCheckoutOpen] = useState(false);
  const [resumeAddGoalAfterUpgrade, setResumeAddGoalAfterUpgrade] = useState(false);
  const onboardingPersistenceInFlightRef = useRef(false);

  // Local state that syncs with Supabase
  const [user, setUser] = useState<UserProfile | null>(null);
  const [constraints, setConstraints] = useState<TimeConstraints | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);

  // Calendar State
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);

  // Sync Supabase data to local state
  useEffect(() => {
    if (supabaseUser) setUser(supabaseUser);
  }, [supabaseUser]);

  useEffect(() => {
    if (supabaseConstraints) setConstraints(supabaseConstraints);
  }, [supabaseConstraints]);

  useEffect(() => {
    if (supabaseGoals.length > 0 || isAuthenticated) {
      setGoals(supabaseGoals);
    }
  }, [supabaseGoals, isAuthenticated]);

  useEffect(() => {
    if (supabaseCalendarEvents.length > 0 || isAuthenticated) {
      setCalendarEvents(supabaseCalendarEvents);
    }
  }, [supabaseCalendarEvents, isAuthenticated]);

  const resolveClientEntitlements = useCallback(async (userId: string) => {
    const now = new Date();

    const { data: override, error: overrideError } = await supabase
      .from('user_entitlement_overrides')
      .select('override_plan_id, starts_at, ends_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (overrideError) {
      throw overrideError;
    }

    const overrideActive = override && (!override.starts_at || new Date(override.starts_at) <= now)
      && (!override.ends_at || new Date(override.ends_at) > now);

    const { data: subscription, error: subscriptionError } = await supabase
      .from('subscriptions')
      .select('plan_id, status, current_period_end')
      .eq('user_id', userId)
      .order('current_period_end', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subscriptionError) {
      throw subscriptionError;
    }

    let planId = 'free';
    if (overrideActive && override?.override_plan_id) {
      planId = override.override_plan_id;
    } else if (subscription?.plan_id) {
      const status = String(subscription.status || '').toLowerCase();
      const periodEnd = subscription.current_period_end ? new Date(subscription.current_period_end) : null;
      const active =
        ['active', 'trialing', 'past_due'].includes(status) ||
        (status === 'canceled' && periodEnd && periodEnd > now);
      if (active) {
        planId = subscription.plan_id;
      }
    }

    const { data: plan, error: planError } = await supabase
      .from('plan_entitlements')
      .select('plan_id, max_active_goals')
      .eq('plan_id', planId)
      .maybeSingle();

    if (planError || !plan) {
      throw planError || new Error('Missing plan entitlements');
    }

    return {
      planId: plan.plan_id,
      maxActiveGoals: plan.max_active_goals ?? null,
    };
  }, []);

  const resolveActiveGoalsCount = useCallback(async (userId: string) => {
    const fallbackCount = supabaseGoals.filter(goal =>
      goal.status === 'active' || goal.status === 'planning'
    ).length;

    try {
      const { data, error } = await supabase
        .from('goals')
        .select('id')
        .eq('user_id', userId)
        .in('status', ['active', 'planning']);

      if (error) {
        throw error;
      }

      return (data || []).length;
    } catch (error) {
      logger.warn('[App] Failed to resolve active goals count from database; using in-memory fallback', error, { userId, fallbackCount });
      return fallbackCount;
    }
  }, [supabaseGoals]);

  // Update view based on auth state
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // Auth state changed
      logger.debug('Auth state changed', {
        supabaseLoading,
        isAuthenticated,
        goalsCount: supabaseGoals.length,
        currentView: view,
      });

      if (supabaseLoading) return;

      const hasPendingAmbition = Boolean(pendingAmbition && pendingAmbition.trim());

      if (isAuthenticated) {
        if (
          hasPendingAmbition
          && (view === 'landing' || (view === 'onboarding' && !isAddingGoal))
          && !upgradeGateOpen
        ) {
          const userId = user?.id || authUser?.id;

          if (!userId) {
            if (!cancelled) setIsLoading(false);
            return;
          }

          const activeGoalsCount = await resolveActiveGoalsCount(userId);
          if (cancelled) return;
          const isExistingPlanner = activeGoalsCount > 0;

          // New user path: skip entitlement roundtrip and continue full onboarding flow.
          if (!isExistingPlanner) {
            logger.info('[App] Resuming onboarding from pending ambition (new user flow)', {
              hasPendingAmbition,
              activeGoalsCount,
            });
            setIsAddingGoal(false);
            setInitialAmbition(pendingAmbition);
            setPendingAmbition(undefined);
            if (typeof window !== 'undefined') {
              sessionStorage.removeItem('dlulu_onboarding_ambition');
            }
            setView('onboarding');
            if (!cancelled) setIsLoading(false);
            return;
          }

          try {
            const entitlements = await resolveClientEntitlements(userId);
            if (cancelled) return;

            const isFreePlan = entitlements.planId === 'free' || entitlements.planId === 'staging_free';
            const goalLimitReached =
              isFreePlan
              && entitlements.maxActiveGoals !== null
              && activeGoalsCount >= entitlements.maxActiveGoals;

            if (goalLimitReached) {
              setUpgradeGateMaxGoals(entitlements.maxActiveGoals);
              setIsAddingGoal(false);
              setUpgradeGateOpen(true);
              setView('dashboard');
            } else {
              logger.info('[App] Resuming onboarding from pending ambition (add-goal flow)', {
                activeGoalsCount,
                planId: entitlements.planId,
                maxActiveGoals: entitlements.maxActiveGoals,
              });
              setIsAddingGoal(true);
              setInitialAmbition(pendingAmbition);
              setPendingAmbition(undefined);
              if (typeof window !== 'undefined') {
                sessionStorage.removeItem('dlulu_onboarding_ambition');
              }
              setView('onboarding');
            }
          } catch (err) {
            logger.warn('[App] Failed to resolve entitlements for pending ambition', err);
            if (cancelled) return;
            setIsAddingGoal(isExistingPlanner);
            setInitialAmbition(pendingAmbition);
            setPendingAmbition(undefined);
            if (typeof window !== 'undefined') {
              sessionStorage.removeItem('dlulu_onboarding_ambition');
            }
            setView('onboarding');
          }

          if (!cancelled) setIsLoading(false);
          return;
        }

        // Handle redirection logic
        // We check 'landing' (initial load) OR 'onboarding' (if we were auto-redirected there erroneously)
        // We do NOT redirect if isAddingGoal is true (user explicitly clicked Add Goal)
        if (view === 'landing' || (view === 'onboarding' && !isAddingGoal)) {
          if (supabaseGoals.length > 0) {
            // Existing user with goals, going to dashboard
            setView('dashboard');
          } else if (view === 'landing') {
            // Only redirect to onboarding from landing if strictly 0 goals
            // Don't auto-redirect - let user interact with landing page first
            // They can select goals and click "Start Manifesting" which will call handleStartOnboarding
            // Auto-redirect only happens on initial page load, not on subsequent visits
            // New user on landing page - waiting for user action
          }
        }
      } else {
        // Not authenticated - redirect to landing if on a protected route
        const isPublicView = view === 'landing' || view === 'resetPassword' || view === 'releaseNotes';
        if (!isPublicView) {
          // Not authenticated, redirecting to landing
          setView('landing');
        }
      }

      if (!cancelled) setIsLoading(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    supabaseLoading,
    isAuthenticated,
    supabaseGoals,
    view,
    isAddingGoal,
    pendingAmbition,
    upgradeGateOpen,
    resolveClientEntitlements,
    resolveActiveGoalsCount,
    user?.id,
    authUser?.id,
  ]);

  // Check for reset-password URL on mount
  useEffect(() => {
    const path = window.location.pathname;
    const hash = window.location.hash;

    // Supabase sends the reset token in the URL hash for password recovery
    // The URL looks like: /reset-password#access_token=...&type=recovery
    if (path === '/reset-password' || hash.includes('type=recovery')) {
      // Password reset URL detected
      setView('resetPassword');
    }
  }, []);

  useEffect(() => {
    if (supabaseLoading || !isAuthenticated) return;
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    if (checkout === 'success' || checkout === 'cancel') {
      setView('pricing');
    }
  }, [supabaseLoading, isAuthenticated]);

  // =============================================================================
  // Analytics Initialization & Tracking
  // =============================================================================

  // Initialize analytics on mount
  useEffect(() => {
    analytics.init();
  }, []);

  // Identify user when authenticated
  useEffect(() => {
    if (!isAuthenticated || !authUser?.id) {
      analytics.reset();
      return;
    }

    analytics.identify(authUser.id, {
      signup_date: authUser.created_at ? new Date(authUser.created_at).toISOString().split('T')[0] : undefined,
      plan_id: 'free', // Will be updated when plan is loaded
    });

    // Set user properties from profile
    if (supabaseUser) {
      analytics.setUserProperties({
        chronotype: supabaseUser.chronotype,
        energy_level: supabaseUser.energyLevel,
      });
    }
  }, [isAuthenticated, authUser?.id, authUser?.created_at, supabaseUser]);

  // Track page views on view changes
  useEffect(() => {
    if (view) {
      analytics.trackPageView(view);
    }
  }, [view]);

  // UI State
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedCommitment, setSelectedCommitment] = useState<Commitment | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [initialAmbition, setInitialAmbition] = useState<string | undefined>(undefined);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showCreateEventModal, setShowCreateEventModal] = useState(false);
  const [showAddGoalModal, setShowAddGoalModal] = useState(false);
  const [eventModalInitialDate, setEventModalInitialDate] = useState<Date | undefined>(undefined);
  const [eventModalInitialTime, setEventModalInitialTime] = useState<string | undefined>(undefined);

  const walkthroughSeen = !!user?.userPreferences?.walkthrough?.onboardingSeen;
  const productTourSeen = !!user?.userPreferences?.walkthrough?.productTourSeen;
  const [productTourActive, setProductTourActive] = useState(false);
  const [productTourStepIndex, setProductTourStepIndex] = useState(0);
  const [productTourContext, setProductTourContext] = useState({ goalDetailOpen: false });
  const [pendingProductTourLaunch, setPendingProductTourLaunch] = useState(false);

  const handleGoalDetailOpen = useCallback((_goalId: string) => {
    setProductTourContext((prev) =>
      prev.goalDetailOpen ? prev : { ...prev, goalDetailOpen: true }
    );
  }, []);

  const handleGoalDetailClose = useCallback(() => {
    setProductTourContext((prev) =>
      prev.goalDetailOpen ? { ...prev, goalDetailOpen: false } : prev
    );
  }, []);

  const markProductTourSeen = useCallback(() => {
    if (!user) return;
    const nextPreferences: UserPreferences = {
      ...(user.userPreferences || {}),
      walkthrough: {
        ...(user.userPreferences?.walkthrough || {}),
        productTourSeen: true,
      },
    };
    updateProfile({ userPreferences: nextPreferences });
  }, [user, updateProfile]);

  const startProductTour = useCallback(() => {
    if (view !== 'dashboard') {
      setView('dashboard');
    }
    setProductTourContext({ goalDetailOpen: false });
    setProductTourStepIndex(0);
    setProductTourActive(true);
  }, [view]);

  const finishProductTour = useCallback(() => {
    setProductTourActive(false);
    setProductTourStepIndex(0);
    markProductTourSeen();
  }, [markProductTourSeen]);

  const skipProductTour = useCallback(() => {
    setProductTourActive(false);
    setProductTourStepIndex(0);
    markProductTourSeen();
  }, [markProductTourSeen]);



  // =============================================================================
  // Computed Values
  // =============================================================================

  const hasActiveGoals = useMemo(() => goals.some(goal => goal.status === 'active'), [goals]);

  const productTourSteps = useMemo<ProductTourStep[]>(() => [
    {
      id: 'dash-title',
      view: 'dashboard',
      selector: '[data-wt="dash-title"]',
      title: 'Welcome to Your Dashboard',
      body: 'This is your command center for daily progress and momentum.',
      placement: 'bottom',
    },
    {
      id: 'dash-focus',
      view: 'dashboard',
      selector: '[data-wt="dash-focus"]',
      title: 'Focus for Today',
      body: 'High-leverage actions are surfaced here to keep you on track.',
      placement: 'bottom',
    },
    {
      id: 'dash-goals',
      view: 'dashboard',
      selector: '[data-wt="dash-goals"]',
      title: 'Your Ambitions',
      body: 'Track progress across all active ambitions at a glance.',
      placement: 'top',
    },
    {
      id: 'dash-add-goal',
      view: 'dashboard',
      selector: '[data-wt="dash-add-goal"]',
      title: 'Start Something New',
      body: 'Create a new ambition any time you’re ready.',
      placement: 'top',
    },
    {
      id: 'dock-goals',
      view: 'dashboard',
      selector: '[data-wt="dock-goals"]',
      title: 'Go to Ambitions',
      body: 'Click Ambitions to manage your full roadmap.',
      placement: 'top',
      waitFor: () => view === 'goals',
      canProceed: () => view === 'goals',
    },
    {
      id: 'goals-tabs',
      view: 'goals',
      selector: '[data-wt="goals-tabs"]',
      title: 'Ambition Status',
      body: 'Filter ambitions by active, completed, paused, or abandoned.',
      placement: 'bottom',
    },
    {
      id: 'goals-card-first',
      view: 'goals',
      selector: '[data-wt="goals-card-first"]',
      title: 'Open an Ambition',
      body: 'Click an ambition card to see deep progress and actions.',
      placement: 'top',
      waitFor: () => productTourContext.goalDetailOpen,
      canProceed: () => productTourContext.goalDetailOpen,
      optional: true,
      skipWhen: () => !hasActiveGoals,
    },
    {
      id: 'goal-header',
      view: 'goals',
      selector: '[data-wt="goal-header"]',
      title: 'Ambition Overview',
      body: 'Here’s the summary, status, and your next milestone.',
      placement: 'bottom',
      optional: true,
      skipWhen: () => !productTourContext.goalDetailOpen,
    },
    {
      id: 'goal-tabs',
      view: 'goals',
      selector: '[data-wt="goal-tabs"]',
      title: 'Explore the Plan',
      body: 'Jump between overview, phases, calendar, and analytics.',
      placement: 'bottom',
      optional: true,
      skipWhen: () => !productTourContext.goalDetailOpen,
    },
    {
      id: 'goal-schedule',
      view: 'goals',
      selector: '[data-wt="goal-schedule"]',
      title: 'Schedule Sessions',
      body: 'Generate or rebuild a calendar schedule for this ambition.',
      placement: 'left',
      optional: true,
      skipWhen: () => !productTourContext.goalDetailOpen,
    },
    {
      id: 'goal-ask-coach',
      view: 'goals',
      selector: '[data-wt="goal-ask-coach"]',
      title: 'Ask Solulu',
      body: 'Get AI guidance specific to this ambition.',
      placement: 'top',
      optional: true,
      skipWhen: () => !productTourContext.goalDetailOpen,
    },
    {
      id: 'goal-back',
      view: 'goals',
      selector: '[data-wt="goal-back"]',
      title: 'Back to Ambitions',
      body: 'Return to your full ambition list.',
      placement: 'bottom',
      waitFor: () => !productTourContext.goalDetailOpen,
      canProceed: () => !productTourContext.goalDetailOpen,
      optional: true,
      skipWhen: () => !productTourContext.goalDetailOpen,
    },
    {
      id: 'dock-calendar',
      view: 'goals',
      selector: '[data-wt="dock-calendar"]',
      title: 'Go to Calendar',
      body: 'Click Calendar to plan and manage sessions.',
      placement: 'top',
      waitFor: () => view === 'calendar',
      canProceed: () => view === 'calendar',
    },
    {
      id: 'calendar-header',
      view: 'calendar',
      selector: '[data-wt="calendar-header"]',
      title: 'Calendar Overview',
      body: 'See your schedule and upcoming focus windows.',
      placement: 'bottom',
    },
    {
      id: 'calendar-viewmode',
      view: 'calendar',
      selector: '[data-wt="calendar-viewmode"]',
      title: 'Change Views',
      body: 'Switch between year, month, week, and day views.',
      placement: 'bottom',
    },
    {
      id: 'calendar-year-navigation',
      view: 'calendar',
      selector: '[data-wt="calendar-year-month-card"]',
      title: 'Year Navigation',
      body: 'In year view, tap a month card to jump into that month.',
      placement: 'top',
      optional: true,
      skipWhen: () => typeof document !== 'undefined' && !document.querySelector('[data-wt="calendar-year-month-card"]'),
    },
    {
      id: 'calendar-year-markers',
      view: 'calendar',
      selector: '[data-wt="calendar-year-marker"]',
      title: 'Booked Day Markers',
      body: 'Theme-colored circles show which dates already have scheduled sessions.',
      placement: 'top',
      optional: true,
      skipWhen: () => typeof document !== 'undefined' && !document.querySelector('[data-wt="calendar-year-marker"]'),
    },
    {
      id: 'calendar-new-event',
      view: 'calendar',
      selector: '[data-wt="calendar-new-event"]',
      title: 'Create an Event',
      body: 'Add a session or task directly to your calendar.',
      placement: 'top',
      waitFor: () => showCreateEventModal,
      canProceed: () => showCreateEventModal,
    },
    {
      id: 'create-event-title',
      view: 'calendar',
      selector: '[data-wt="create-event-title"]',
      title: 'Event Title',
      body: 'Give this session a clear, descriptive name.',
      placement: 'bottom',
      optional: true,
      skipWhen: () => !showCreateEventModal,
    },
    {
      id: 'create-event-datetime',
      view: 'calendar',
      selector: '[data-wt="create-event-datetime"]',
      title: 'Date & Time',
      body: 'Pick when this session should happen.',
      placement: 'bottom',
      optional: true,
      skipWhen: () => !showCreateEventModal,
    },
    {
      id: 'create-event-save',
      view: 'calendar',
      selector: '[data-wt="create-event-save"]',
      title: 'Save the Event',
      body: 'Create the event to place it on your calendar.',
      placement: 'top',
      optional: true,
      skipWhen: () => !showCreateEventModal,
    },
    {
      id: 'calendar-event',
      view: 'calendar',
      selector: '[data-wt="calendar-event"]',
      title: 'Open an Event',
      body: 'Click an event to view details and mark progress.',
      placement: 'top',
      waitFor: () => !!selectedEvent,
      canProceed: () => !!selectedEvent,
      optional: true,
      skipWhen: () => calendarEvents.length === 0,
    },
    {
      id: 'event-detail-title',
      view: 'calendar',
      selector: '[data-wt="event-detail-title"]',
      title: 'Event Details',
      body: 'Edit the title and description here.',
      placement: 'bottom',
      optional: true,
      skipWhen: () => !selectedEvent,
    },
    {
      id: 'event-detail-complete',
      view: 'calendar',
      selector: '[data-wt="event-detail-complete"]',
      title: 'Mark Complete',
      body: 'Toggle completion to track your progress.',
      placement: 'bottom',
      optional: true,
      skipWhen: () => !selectedEvent,
    },
    {
      id: 'event-detail-save',
      view: 'calendar',
      selector: '[data-wt="event-detail-save"]',
      title: 'Save Changes',
      body: 'Persist updates to this event.',
      placement: 'top',
      optional: true,
      skipWhen: () => !selectedEvent,
    },
    {
      id: 'dock-chat',
      view: 'calendar',
      selector: '[data-wt="dock-chat"]',
      title: 'Go to Chat',
      body: 'Talk to Solulu for guidance or help.',
      placement: 'top',
      waitFor: () => view === 'chat',
      canProceed: () => view === 'chat',
    },
    {
      id: 'chat-suggestions',
      view: 'chat',
      selector: '[data-wt="chat-suggestions"]',
      title: 'Quick Prompts',
      body: 'Tap a suggestion to get started quickly.',
      placement: 'top',
    },
    {
      id: 'chat-input',
      view: 'chat',
      selector: '[data-wt="chat-input"]',
      title: 'Chat Input',
      body: 'Ask anything or create new ambitions here.',
      placement: 'top',
    },
    {
      id: 'chat-send',
      view: 'chat',
      selector: '[data-wt="chat-send"]',
      title: 'Send Message',
      body: 'Send your message to Solulu.',
      placement: 'left',
    },
    {
      id: 'chat-settings',
      view: 'chat',
      selector: '[data-wt="chat-settings"]',
      title: 'Go to Settings',
      body: 'Manage your profile and preferences.',
      placement: 'top',
      waitFor: () => view === 'settings',
      canProceed: () => view === 'settings',
    },
    {
      id: 'settings-profile',
      view: 'settings',
      selector: '[data-wt="settings-profile"]',
      title: 'Profile Settings',
      body: 'Update your profile and preferences here.',
      placement: 'top',
    },
    {
      id: 'settings-replay-tour',
      view: 'settings',
      selector: '[data-wt="settings-replay-tour"]',
      title: 'Replay Any Time',
      body: 'You can replay the tour whenever you want.',
      placement: 'bottom',
    },
    {
      id: 'settings-finish',
      view: 'settings',
      selector: '[data-wt="settings-profile"]',
      title: 'You’re All Set',
      body: 'You’re ready to start making progress.',
      placement: 'top',
      primaryLabel: 'Finish Tour',
    },
  ], [
    view,
    hasActiveGoals,
    productTourContext.goalDetailOpen,
    showCreateEventModal,
    selectedEvent,
    calendarEvents.length,
  ]);

  const currentProductTourStep = productTourSteps[productTourStepIndex];
  const productTourVisible = productTourActive && currentProductTourStep && view === currentProductTourStep.view;
  const productTourCanProceed = currentProductTourStep?.canProceed
    ? currentProductTourStep.canProceed()
    : currentProductTourStep?.waitFor
      ? currentProductTourStep.waitFor()
      : true;
  const productTourIsWaiting = !!currentProductTourStep?.waitFor && !productTourCanProceed;

  const advanceProductTour = useCallback(() => {
    setProductTourStepIndex(prev => {
      const next = prev + 1;
      if (next >= productTourSteps.length) {
        finishProductTour();
        return prev;
      }
      return next;
    });
  }, [productTourSteps.length, finishProductTour]);

  const handleProductTourBack = useCallback(() => {
    setProductTourStepIndex(prev => Math.max(0, prev - 1));
  }, []);

  // =============================================================================
  // Persistence
  // =============================================================================

  const STORAGE_KEY = 'delululife_v1';

  // =============================================================================
  // PERSISTENCE - Supabase handles most data, localStorage for UI state only
  // =============================================================================

  // Load commitments from localStorage (not in Supabase yet)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved, (key, value) => {
          // Restore Date objects
          if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
            return new Date(value);
          }
          return value;
        });

        // Only load local-only data
        if (data.commitments) setCommitments(data.commitments);
      }
    } catch (e) {
      logger.error('Failed to load local state', e);
    }
  }, []);

  // Save local-only data to localStorage (commitments)
  useEffect(() => {
    if (isLoading) return;
    if (view === 'landing' || view === 'onboarding') return;

    try {
      // Only save data not in Supabase
      const data = {
        commitments,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      logger.error('Failed to save local state', e);
    }
  }, [commitments, isLoading, view]);

  // =============================================================================
  // Handlers
  // =============================================================================

  const handleStartOnboarding = useCallback((ambition?: string) => {
    if (ambition && typeof window !== 'undefined') {
      sessionStorage.setItem('dlulu_onboarding_ambition', ambition);
    }
    setInitialAmbition(ambition);

    const userId = user?.id || authUser?.id;
    if (!userId) {
      setPendingAmbition(ambition);
      setIsAddingGoal(false);
      setView('onboarding');
      return;
    }

    void (async () => {
      const activeGoalsCount = await resolveActiveGoalsCount(userId);
      const isRequestingNewGoal = activeGoalsCount > 0;

      if (!isRequestingNewGoal) {
        setPendingAmbition(undefined);
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('dlulu_onboarding_ambition');
        }
        setIsAddingGoal(false);
        setView('onboarding');
        return;
      }

      try {
        const entitlements = await resolveClientEntitlements(userId);
        const isFreePlan = entitlements.planId === 'free' || entitlements.planId === 'staging_free';
        const maxGoals = entitlements.maxActiveGoals ?? 1;
        const limitReached = isFreePlan && activeGoalsCount >= maxGoals;

        if (limitReached) {
          setPendingAmbition(ambition);
          setUpgradeGateMaxGoals(maxGoals);
          setResumeAddGoalAfterUpgrade(true);
          setIsAddingGoal(false);
          setUpgradeGateOpen(true);
          setView('dashboard');
          return;
        }
      } catch (error) {
        logger.warn('[App] Failed entitlement check for landing add-goal request', error, { userId, activeGoalsCount });
        if (activeGoalsCount >= 1) {
          setPendingAmbition(ambition);
          setUpgradeGateMaxGoals(1);
          setResumeAddGoalAfterUpgrade(true);
          setIsAddingGoal(false);
          setUpgradeGateOpen(true);
          setView('dashboard');
          return;
        }
      }

      setPendingAmbition(undefined);
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('dlulu_onboarding_ambition');
      }
      setIsAddingGoal(true);
      setView('onboarding');
    })();
  }, [authUser?.id, resolveActiveGoalsCount, resolveClientEntitlements, user?.id]);

  const handleStartAddGoalFlow = useCallback(async (
    ambition?: string,
    options?: { skipEntitlementCheck?: boolean }
  ) => {
    const skipEntitlementCheck = !!options?.skipEntitlementCheck;
    const userId = user?.id || authUser?.id;

    const openUpgradeGate = (maxGoals: number | null) => {
      setUpgradeGateMaxGoals(maxGoals ?? 1);
      setResumeAddGoalAfterUpgrade(true);
      if (ambition && typeof window !== 'undefined') {
        sessionStorage.setItem('dlulu_onboarding_ambition', ambition);
        setPendingAmbition(ambition);
      } else {
        setPendingAmbition(undefined);
      }
      setUpgradeGateOpen(true);
    };

    const continueToOnboarding = () => {
      setInitialAmbition(ambition);
      setIsAddingGoal(true);
      setPendingAmbition(undefined);
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('dlulu_onboarding_ambition');
      }
      setView('onboarding');
    };

    if (!userId) {
      continueToOnboarding();
      return;
    }

    if (skipEntitlementCheck) {
      continueToOnboarding();
      return;
    }

    const activeGoalsCount = await resolveActiveGoalsCount(userId);

    try {
      const entitlements = await resolveClientEntitlements(userId);
      const isFreePlan = entitlements.planId === 'free' || entitlements.planId === 'staging_free';
      const maxGoals = entitlements.maxActiveGoals ?? 1;
      const limitReached = isFreePlan && activeGoalsCount >= maxGoals;

      if (limitReached) {
        openUpgradeGate(maxGoals);
        return;
      }

      continueToOnboarding();
    } catch (error) {
      logger.warn('[App] Failed entitlement check while starting add-goal flow', error);
      if (activeGoalsCount >= 1) {
        openUpgradeGate(1);
        return;
      }
      continueToOnboarding();
    }
  }, [authUser?.id, resolveActiveGoalsCount, resolveClientEntitlements, user?.id]);

  const handleDismissUpgradeGate = useCallback(() => {
    setUpgradeGateOpen(false);
    setResumeAddGoalAfterUpgrade(false);
    setPendingAmbition(undefined);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('dlulu_onboarding_ambition');
    }
  }, []);

  const handleUpgradeFromGate = useCallback(() => {
    setUpgradeGateOpen(false);
    setUpgradeCheckoutOpen(true);
  }, []);

  const handleViewPlansFromGate = useCallback(() => {
    setUpgradeGateOpen(false);
    setResumeAddGoalAfterUpgrade(true);
    setView('pricing');
  }, []);

  const handleWalkthroughComplete = useCallback(() => {
    if (!user) return;
    const nextPreferences: UserPreferences = {
      ...(user.userPreferences || {}),
      walkthrough: {
        ...(user.userPreferences?.walkthrough || {}),
        onboardingSeen: true,
      },
    };
    updateProfile({ userPreferences: nextPreferences });
  }, [user, updateProfile]);

  // Also handle auto-redirect case - preserve initialAmbition if it exists
  useEffect(() => {
    if (!supabaseLoading && isAuthenticated && view === 'landing') {
      if (supabaseGoals.length === 0 && initialAmbition) {
        // User came from landing page with selected goals, preserve them
        // New user with ambition, redirecting to onboarding
        setView('onboarding');
      } else if (supabaseGoals.length === 0) {
        // New user without initialAmbition
        // New user detected, redirecting to onboarding
        setView('onboarding');
      }
    }
  }, [supabaseLoading, isAuthenticated, view, supabaseGoals.length, initialAmbition]);

  useEffect(() => {
    if (!pendingProductTourLaunch) return;
    if (productTourSeen || isAddingGoal) {
      setPendingProductTourLaunch(false);
      return;
    }
    if (view === 'dashboard') {
      startProductTour();
      setPendingProductTourLaunch(false);
    }
  }, [pendingProductTourLaunch, productTourSeen, isAddingGoal, view, startProductTour]);

  useEffect(() => {
    if (!productTourActive || !currentProductTourStep) return;

    if (currentProductTourStep.waitFor && currentProductTourStep.waitFor()) {
      advanceProductTour();
      return;
    }

    if (view !== currentProductTourStep.view) return;

    if (currentProductTourStep.optional && currentProductTourStep.skipWhen?.()) {
      advanceProductTour();
      return;
    }

    if (currentProductTourStep.optional && !currentProductTourStep.waitFor) {
      const timer = window.setTimeout(() => {
        const target = document.querySelector(currentProductTourStep.selector);
        if (!target) {
          advanceProductTour();
        }
      }, 600);

      return () => window.clearTimeout(timer);
    }
  }, [
    productTourActive,
    currentProductTourStep,
    view,
    advanceProductTour,
  ]);

  useEffect(() => {
    if (productTourStepIndex >= productTourSteps.length && productTourSteps.length > 0) {
      setProductTourStepIndex(productTourSteps.length - 1);
    }
  }, [productTourStepIndex, productTourSteps.length]);

  useEffect(() => {
    if (view !== 'goals' && productTourContext.goalDetailOpen) {
      setProductTourContext({ goalDetailOpen: false });
    }
  }, [view, productTourContext.goalDetailOpen]);

  // Auth handlers - now using Supabase
  const handleSignUp = useCallback(async (email: string, password: string, name?: string, ambition?: string) => {
    // Signing up user
    if (ambition) {
      // Preserving ambition before sign up
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('dlulu_onboarding_ambition', ambition);
      }
      setPendingAmbition(ambition);
      setInitialAmbition(ambition);
    }
    return await signUp(email, password, name || email.split('@')[0]);
  }, [signUp]);

  const handleSignIn = useCallback(async (email: string, password: string, ambition?: string) => {
    // Signing in user
    if (ambition) {
      // Preserving ambition before sign in
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('dlulu_onboarding_ambition', ambition);
      }
      setPendingAmbition(ambition);
      setInitialAmbition(ambition);
    }
    return await signIn(email, password);
  }, [signIn]);

  const handleSignInWithGoogle = useCallback(async () => {
    // Signing in with Google
    if (typeof window !== 'undefined') {
      const storedAmbition = sessionStorage.getItem('dlulu_onboarding_ambition');
      if (storedAmbition) {
        setPendingAmbition(storedAmbition);
        setInitialAmbition(storedAmbition);
      }
    }
    return await signInWithGoogle();
  }, [signInWithGoogle]);

  const handleOnboardingComplete = useCallback(async (
    profile: UserProfile,
    newConstraints: TimeConstraints,
    newGoals: Goal[],
    _commitments?: Commitment[],
    _events?: CalendarEvent[]
  ) => {
    if (onboardingPersistenceInFlightRef.current) {
      logger.warn('[App] Ignoring duplicate onboarding completion while persistence is in flight');
      return;
    }

    onboardingPersistenceInFlightRef.current = true;

    try {
      // Onboarding complete, saving to database

      // Update local state immediately for UI context
      if (!isAddingGoal) {
        setUser(profile);
        setConstraints(newConstraints);
        setCommitments([]);
        setCalendarEvents([]);
      }

      if (!isAddingGoal) {
        // Save profile to database
        try {
          await updateProfile(profile);
        } catch (err) {
          logger.error('[App] Failed to save profile', err);
        }

        // Save constraints to database
        try {
          await updateSupabaseConstraints(newConstraints);
        } catch (err) {
          logger.error('[App] Failed to save constraints', err);
        }
      }

      const savedGoals: Goal[] = [];
      const failedGoalTitles: string[] = [];
      for (const goal of newGoals) {
        try {
          const savedGoal = await createGoal({
            title: goal.title,
            originalInput: goal.originalInput,
            category: goal.category,
            timeline: goal.timeline,
            estimatedWeeks: goal.estimatedWeeks,
            strategyOverview: goal.strategyOverview,
            criticalGaps: goal.criticalGaps,
            overviewGenerated: goal.overviewGenerated,
            behaviorPlan: goal.behaviorPlan,
            priorityWeight: goal.priorityWeight,
            riskLevel: goal.riskLevel,
            riskAcknowledgedAt: goal.riskAcknowledgedAt,
            intakeQuestions: goal.intakeQuestions,
            intakeAnswers: goal.intakeAnswers,
            intakeSummary: goal.intakeSummary,
            intakeSchemaVersion: goal.intakeSchemaVersion,
            intakeUpdatedAt: goal.intakeUpdatedAt,
            preferredTime: goal.preferredTime,
            frequency: goal.frequency,
            duration: goal.duration,
            energyCost: goal.energyCost,
            preferredDays: goal.preferredDays,
            status: 'active',
          });

          if (!savedGoal) {
            logger.error('[App] Failed to create goal', new Error('Create goal returned null'), { goalTitle: goal.title });
            failedGoalTitles.push(goal.title);
            continue;
          }

          for (const phase of goal.phases || []) {
            const savedPhase = await createPhase(savedGoal.id, {
              number: phase.number,
              title: phase.title,
              description: phase.description,
              startWeek: phase.startWeek,
              endWeek: phase.endWeek,
              estimatedDuration: phase.estimatedDuration,
              focus: phase.focus,
              coachAdvice: phase.coachAdvice,
              status: phase.status || 'upcoming',
            });

            if (!savedPhase) {
              logger.error('[App] Failed to create phase', new Error('Create phase returned null'), { phaseTitle: phase.title });
              continue;
            }

            for (const milestone of phase.milestones || []) {
              const savedMilestone = await createMilestone(savedPhase.id, savedGoal.id, {
                title: milestone.title,
                description: milestone.description,
                targetWeek: milestone.targetWeek,
                order: milestone.order,
              });

              if (savedMilestone) {
                for (const task of milestone.tasks || []) {
                  const savedTask = await createTask(savedMilestone.id, {
                    title: task.title,
                    description: task.description,
                    order: task.order,
                    startDay: task.startDay,
                    endDay: task.endDay,
                    durationDays: task.durationDays,
                    timesPerWeek: task.timesPerWeek,
                  });

                  if (savedTask) {
                    for (const subtask of task.subTasks || []) {
                      await createSubTask(savedTask.id, {
                        title: subtask.title,
                        order: subtask.order,
                        taskId: savedTask.id,
                      });
                    }
                  }
                }
              }
            }
          }

          savedGoals.push(savedGoal);
        } catch (err) {
          logger.error('[App] Error saving goal', err, { goalTitle: goal.title });
          failedGoalTitles.push(goal.title);
        }
      }

      logger.info('[App] Onboarding persistence summary', {
        mode: isAddingGoal ? 'add-goal' : 'new-user',
        requestedGoals: newGoals.length,
        savedGoals: savedGoals.length,
        failedGoals: failedGoalTitles.length,
        failedGoalTitles,
        profilePersisted: !isAddingGoal,
        constraintsPersisted: !isAddingGoal,
      });

      if (newGoals.length > 0 && savedGoals.length === 0) {
        throw new Error('Unable to persist generated goals. Please retry once.');
      }

      await refreshGoals();

      setIsAddingGoal(false);
      if (!isAddingGoal) {
        setPendingProductTourLaunch(true);
      }
      setView('dashboard');
    } catch (error) {
      logger.error('[App] Onboarding completion failed', error);
      alert(error instanceof Error ? error.message : 'Failed to save onboarding data. Please retry.');
    } finally {
      onboardingPersistenceInFlightRef.current = false;
    }
  }, [isAddingGoal, updateProfile, updateSupabaseConstraints, createGoal, createPhase, createMilestone, createTask, createSubTask, refreshGoals]);

  const handleCommitmentAction = useCallback((
    id: string,
    action: 'done' | 'skip' | 'snooze',
    data?: any
  ) => {
    setCommitments(prev => prev.map(c => {
      if (c.id !== id) return c;

      switch (action) {
        case 'done':
          return { ...c, status: 'completed', completedAt: new Date(), updatedAt: new Date() };
        case 'skip':
          return { ...c, status: 'skipped', skippedReason: data, updatedAt: new Date() };
        case 'snooze':
          const snoozeMinutes = typeof data === 'number' ? data : 30;
          const newStart = new Date(c.start.getTime() + snoozeMinutes * 60000);
          const newEnd = new Date(c.end.getTime() + snoozeMinutes * 60000);
          return { ...c, status: 'snoozed', start: newStart, end: newEnd, snoozedTo: newStart, updatedAt: new Date() };
        default:
          return c;
      }
    }));

    setSelectedCommitment(null);
  }, []);

  // Calendar Event Handlers
  const handleEventClick = useCallback((event: CalendarEvent) => {
    // Recurring instances are generated client-side; edit the parent series.
    if (event.recurringEventId) {
      const parent = calendarEvents.find(e => e.id === event.recurringEventId);
      setSelectedEvent(parent || event);
      return;
    }
    setSelectedEvent(event);
  }, [calendarEvents]);

  const handleCalendarEventUpdate = useCallback(async (eventId: string, updates: Partial<CalendarEvent>) => {
    await updateEvent(eventId, updates);
    // Keep the modal displaying the latest version after refresh
    setSelectedEvent(prev => (prev && prev.id === eventId ? { ...prev, ...updates } as CalendarEvent : prev));
  }, [updateEvent]);

  const handleCalendarEventDelete = useCallback(async (eventId: string) => {
    await deleteEvent(eventId);
    setSelectedEvent(null);
  }, [deleteEvent]);

  const handleMilestoneToggle = useCallback(async (
    goalId: string,
    phaseId: string,
    milestoneId: string,
    completed: boolean,
    notes?: string
  ) => {
    // Save to database
    await updateMilestone(milestoneId, {
      isCompleted: completed,
      userNotes: notes
    });

    setGoals(prev => prev.map(goal => {
      if (goal.id !== goalId) return goal;

      const updatedPhases = goal.phases.map(phase => {
        if (phase.id !== phaseId) return phase;

        const updatedMilestones = phase.milestones.map(m => {
          if (m.id !== milestoneId) return m;
          return {
            ...m,
            isCompleted: completed,
            completedAt: completed ? new Date() : undefined,
            userNotes: notes,
          };
        });

        return { ...phase, milestones: updatedMilestones };
      });

      const overallProgress = calculateGoalProgressFromPhases(updatedPhases);

      // Add history entry
      const historyEntry: HistoryEntry = {
        id: `history-${Date.now()}`,
        goalId,
        timestamp: new Date(),
        type: completed ? 'milestone_completed' : 'note_added',
        details: {
          milestoneId,
          phaseId,
          notes,
        },
      };

      return {
        ...goal,
        phases: updatedPhases,
        overallProgress,
        history: [...(goal.history || []), historyEntry],
        updatedAt: new Date(),
      };
    }));

  }, [updateMilestone]);

  const handleLogout = useCallback(async () => {
    // Sign out from Supabase (clears storage)
    await signOut();

    // Clear local state
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    setConstraints(null);
    setGoals([]);
    setCommitments([]);
    setCalendarEvents([]);

    // Force a hard reload to ensure all memory/state is wiped
    // This resolves issues with stale tokens or state persistence
    window.location.href = '/';
  }, [signOut]);

  // Handle sub-task toggle (saves to database)
  const handleSubTaskToggle = useCallback(async (
    goalId: string,
    phaseId: string,
    milestoneId: string,
    subTaskId: string,
    completed: boolean
  ) => {
    // Save to database
    await updateSupabaseSubTask(subTaskId, { isCompleted: completed });

    setGoals(prev => prev.map(goal => {
      if (goal.id !== goalId) return goal;

      const updatedPhases = goal.phases.map(phase => {
        if (phase.id !== phaseId) return phase;

        const updatedMilestones = phase.milestones.map(m => {
          if (m.id !== milestoneId) return m;

          const updatedTasks = (m.tasks || []).map(task => {
            const updatedSubTasks = (task.subTasks || []).map(st => {
              if (st.id !== subTaskId) return st;
              return {
                ...st,
                isCompleted: completed,
                completedAt: completed ? new Date() : undefined,
                updatedAt: new Date(),
              };
            });

            return { ...task, subTasks: updatedSubTasks };
          });

          return { ...m, tasks: updatedTasks };
        });

        return { ...phase, milestones: updatedMilestones };
      });

      const overallProgress = calculateGoalProgressFromPhases(updatedPhases);

      return {
        ...goal,
        phases: updatedPhases,
        overallProgress,
        updatedAt: new Date(),
      };
    }));
  }, [updateSupabaseSubTask]);

  // Handle adding a new task to a milestone (saves to database)
  const handleAddTask = useCallback(async (
    goalId: string,
    phaseId: string,
    milestoneId: string,
    title: string
  ) => {
    // Create a Task (not SubTask) under the milestone
    const savedTask = await createTask(milestoneId, {
      title,
      order: 999,
    });

    if (!savedTask) {
      logger.error('[App] Failed to save task to database', new Error('Create task returned null'), { milestoneId });
      return;
    }

    // Task created

    // Refresh goals to get the updated task list
    await refreshGoals();
  }, [createTask, refreshGoals]);

  // Handle adding a new sub-task to a Task (saves to database)
  const handleAddSubTask = useCallback(async (
    taskId: string,
    title: string
  ) => {
    // Create a SubTask under the Task
    const savedSubTask = await createSubTask(taskId, {
      title,
      order: 999,
      isManual: true,
    });

    if (!savedSubTask) {
      logger.error('[App] Failed to save subtask to database', new Error('Create subtask returned null'), { taskId });
      return;
    }

    // SubTask created

    // Refresh goals to get the updated subtask list
    await refreshGoals();
  }, [createSubTask, refreshGoals]);

  // Handle adding a new phase to a goal (saves to database)
  const handleAddPhase = useCallback(async (
    goalId: string,
    phaseData: Partial<Phase>
  ) => {
    // Find the goal to get the current phase count
    const goal = goals.find(g => g.id === goalId);
    const phaseNumber = (goal?.phases.length || 0) + 1;

    // Create Phase in database
    const savedPhase = await createPhase(goalId, {
      number: phaseNumber,
      title: phaseData.title || `Phase ${phaseNumber}`,
      description: phaseData.description || '',
      startWeek: phaseData.startWeek || 1,
      endWeek: phaseData.endWeek || 4,
    });

    if (!savedPhase) {
      logger.error('[App] Failed to save phase to database', new Error('Create phase returned null'), { goalId });
      alert('Failed to create phase. Please try again.');
      return;
    }

    // Phase created

    // Refresh goals to get the updated phase list
    await refreshGoals();
  }, [goals, createPhase, refreshGoals]);

  // Handle adding a new milestone to a phase (saves to database)
  const handleAddMilestone = useCallback(async (
    goalId: string,
    phaseId: string,
    milestoneData: Partial<Milestone>
  ) => {
    // Find the phase to get the current milestone count
    const goal = goals.find(g => g.id === goalId);
    const phase = goal?.phases.find(p => p.id === phaseId);
    const order = (phase?.milestones.length || 0) + 1;

    // Create Milestone in database
    const savedMilestone = await createMilestone(phaseId, goalId, {
      title: milestoneData.title || `Milestone ${order}`,
      description: milestoneData.description,
      targetWeek: milestoneData.targetWeek,
      order,
    });

    if (!savedMilestone) {
      logger.error('[App] Failed to save milestone to database', new Error('Create milestone returned null'), { phaseId, goalId });
      alert('Failed to create milestone. Please try again.');
      return;
    }

    // Milestone created

    // Refresh goals to get the updated milestone list
    await refreshGoals();
  }, [goals, createMilestone, refreshGoals]);

  // Handle goal update (from GoalLibrary refinements)
  const handleGoalUpdate = useCallback((updatedGoal: Goal) => {
    setGoals(prev => prev.map(g => g.id === updatedGoal.id ? updatedGoal : g));
    void updateGoal(updatedGoal.id, {
      title: updatedGoal.title,
      strategyOverview: updatedGoal.strategyOverview,
      criticalGaps: updatedGoal.criticalGaps,
      overviewGenerated: updatedGoal.overviewGenerated,
      behaviorPlan: updatedGoal.behaviorPlan,
      priorityWeight: updatedGoal.priorityWeight,
      riskLevel: updatedGoal.riskLevel,
      riskAcknowledgedAt: updatedGoal.riskAcknowledgedAt,
      status: updatedGoal.status,
      overallProgress: updatedGoal.overallProgress,
      currentPhaseIndex: updatedGoal.currentPhaseIndex,
      isScheduled: updatedGoal.isScheduled,
      preferredTime: updatedGoal.preferredTime,
      frequency: updatedGoal.frequency,
      duration: updatedGoal.duration,
      energyCost: updatedGoal.energyCost,
      preferredDays: updatedGoal.preferredDays,
    });
  }, [updateGoal]);

  // =============================================================================
  // GOAL STATUS CHANGE HANDLER
  // =============================================================================
  // This handler manages all goal status transitions:
  // - active → paused: Goal is temporarily paused, events remain
  // - active → abandoned: Goal is abandoned, ALL CALENDAR EVENTS ARE DELETED
  // - active → completed: Goal is marked complete, all phases/milestones/subtasks marked complete
  // - paused → active: Goal is resumed
  //
  // IMPORTANT: When a goal is ABANDONED:
  // 1. All calendar events for this goal are PERMANENTLY DELETED from the database
  // 2. All calendar events are removed from local state
  // 3. The goal's isScheduled flag is set to false
  // 4. The goal is moved to the "Abandoned" tab in the Goal Library
  // =============================================================================
  const handleGoalStatusChange = useCallback(async (goalId: string, status: Goal['status']) => {
    // Goal status changing

    // =========================================================================
    // PAUSE/ABANDON LOGIC: Delete all calendar events when a goal is paused or abandoned
    // This ensures the user's calendar is cleaned up
    // On resume, user can re-schedule the calendar
    // =========================================================================
    if (status === 'paused' || status === 'abandoned') {
      try {
        // Step 1: Delete all calendar events for this goal from the DATABASE
        const deletedCount = await deleteEventsByGoalId(goalId);
        logger.info('[App] Deleted calendar events for goal status change', {
          goalId,
          status,
          deletedCount,
        });

        // Step 2: Remove all calendar events from LOCAL STATE
        setCalendarEvents(prev => prev.filter(e => (e.goalId || e.ambitionOsMeta?.goalId) !== goalId));
      } catch (error) {
        logger.error('[App] Error deleting events during status change', error, { goalId, status });
        // Continue with status change even if event deletion fails
      }
    }

    // Persist status to database
    await updateGoalStatus(goalId, status);
    if (status === 'paused' || status === 'abandoned') {
      void updateGoal(goalId, { isScheduled: false });
    }

    // Update local state with new status and any status-specific changes
    setGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g;

      // Base updates for all status changes
      const updates: Partial<Goal> = {
        status,
        updatedAt: new Date(),
      };

      // =========================================================================
      // PAUSED/ABANDONED: Mark goal as no longer scheduled since events are deleted
      // =========================================================================
      if (status === 'paused' || status === 'abandoned') {
        updates.isScheduled = false;
      }

      // =========================================================================
      // COMPLETED: Mark all phases, milestones, and subtasks as complete
      // =========================================================================
      if (status === 'completed') {
        updates.overallProgress = 100;
        updates.phases = g.phases.map(phase => ({
          ...phase,
          status: 'completed' as const,
          progress: 100,
          milestones: phase.milestones.map(m => ({
            ...m,
            isCompleted: true,
            completedAt: new Date(),
            tasks: (m.tasks || []).map(task => ({
              ...task,
              isCompleted: true,
              completedAt: new Date(),
              subTasks: (task.subTasks || []).map(st => ({
                ...st,
                isCompleted: true,
                completedAt: new Date(),
              })),
            })),
          })),
        }));
      }

      return { ...g, ...updates };
    }));

    // Goal status changed
  }, [updateGoalStatus, deleteEventsByGoalId, updateGoal]);

  // =============================================================================
  // PERMANENT GOAL DELETION HANDLER
  // =============================================================================
  // This handler PERMANENTLY deletes a goal and all its associated data:
  // - The goal record is deleted from the database
  // - All phases, milestones, and subtasks are deleted (cascade)
  // - Any remaining calendar events are deleted (cleanup)
  // - The goal is removed from local state
  //
  // IMPORTANT: This action CANNOT BE UNDONE. The goal must already be in
  // "abandoned" status before this can be called (enforced by UI).
  // =============================================================================
  const handleDeleteGoal = useCallback(async (goalId: string) => {
    // Permanently deleting goal

    try {
      // Step 1: Delete goal from database (cascades to phases/milestones/subtasks)
      await deleteGoal(goalId);
      // Goal deleted from database

      // Step 2: Remove goal from local state
      setGoals(prev => prev.filter(g => g.id !== goalId));

      // Step 3: Cleanup - remove any orphaned calendar events (should already be gone)
      setCalendarEvents(prev => prev.filter(e => e.goalId !== goalId));

      // Goal permanently deleted
    } catch (error) {
      logger.error('[App] Error deleting goal', error, { goalId });
    }
  }, [deleteGoal]);

  // =============================================================================
  // CLEAR CALENDAR EVENTS HANDLER
  // =============================================================================
  // This handler clears all calendar events for a goal WITHOUT deleting the goal:
  // - All calendar events for the goal are deleted from the database
  // - All calendar events are removed from local state
  // - The goal's isScheduled flag is set to false
  // - The goal remains ACTIVE and can be rescheduled later
  //
  // Use case: User wants to rebuild their calendar from scratch, or their
  // schedule has changed significantly and they need to reschedule.
  // =============================================================================
  const handleClearEvents = useCallback(async (goalId: string) => {
    // Clearing calendar events for goal

    try {
      // Step 1: Delete events from DATABASE
      const deletedCount = await deleteEventsByGoalId(goalId);
      // Deleted calendar events from database

      // Step 2: Remove events from LOCAL STATE
      setCalendarEvents(prev => prev.filter(e => (e.goalId || e.ambitionOsMeta?.goalId) !== goalId));

      // Step 3: Mark goal as no longer scheduled so "Build Calendar" button reappears
      setGoals(prev => prev.map(g =>
        g.id === goalId ? { ...g, isScheduled: false } : g
      ));
      void updateGoal(goalId, { isScheduled: false });

      // Calendar events cleared for goal
    } catch (error) {
      logger.error('[App] Error clearing events', error, { goalId });
    }
  }, [deleteEventsByGoalId, updateGoal]);

  // =============================================================================
  // Chatbot Action Handlers
  // =============================================================================

  const handleChatAddGoal = useCallback(async (goalData: Partial<Goal> | Goal) => {
    // Check if this is a full Goal object (has phases and id)
    if ('phases' in goalData && goalData.phases && goalData.phases.length > 0) {
      // Full goal with roadmap - SAVE TO DATABASE
      // Saving full goal with roadmap to database

      try {
        // Create the goal in DB
        const savedGoal = await createGoal({
          title: goalData.title,
          originalInput: goalData.originalInput || goalData.title,
          category: goalData.category,
          timeline: goalData.timeline,
          estimatedWeeks: goalData.estimatedWeeks,
          strategyOverview: goalData.strategyOverview,
          criticalGaps: goalData.criticalGaps,
          overviewGenerated: goalData.overviewGenerated,
          behaviorPlan: goalData.behaviorPlan,
          priorityWeight: goalData.priorityWeight,
          riskLevel: goalData.riskLevel,
          riskAcknowledgedAt: goalData.riskAcknowledgedAt,
          intakeQuestions: goalData.intakeQuestions,
          intakeAnswers: goalData.intakeAnswers,
          intakeSummary: goalData.intakeSummary,
          intakeSchemaVersion: goalData.intakeSchemaVersion,
          intakeUpdatedAt: goalData.intakeUpdatedAt,
          preferredTime: goalData.preferredTime,
          frequency: goalData.frequency,
          duration: goalData.duration,
          energyCost: goalData.energyCost,
          preferredDays: goalData.preferredDays,
          status: 'active',
        });

        if (!savedGoal) {
          logger.error('[Chatbot] Failed to create goal in DB');
          return;
        }

        // Goal saved to DB, creating phases

        // Create phases, milestones, tasks, and subtasks
        let phasesCreated = 0;
        let milestonesCreated = 0;
        let tasksCreated = 0;
        let subtasksCreated = 0;

        for (const phase of goalData.phases || []) {
          // Creating phase
          const savedPhase = await createPhase(savedGoal.id, {
            number: phase.number,
            title: phase.title,
            description: phase.description,
            startWeek: phase.startWeek,
            endWeek: phase.endWeek,
            estimatedDuration: phase.estimatedDuration,
            focus: phase.focus,
            coachAdvice: phase.coachAdvice,
            status: phase.status || 'upcoming',
          });

          if (!savedPhase) {
            logger.error('[Chatbot] Failed to create phase', new Error('Create phase returned null'), { phaseTitle: phase.title });
            continue;
          }
          phasesCreated++;

          for (const milestone of phase.milestones || []) {
            const savedMilestone = await createMilestone(savedPhase.id, savedGoal.id, {
              title: milestone.title,
              description: milestone.description,
              targetWeek: milestone.targetWeek,
              order: milestone.order,
            });

            if (savedMilestone) {
              milestonesCreated++;

              // Create tasks for this milestone (4-level hierarchy)
              for (const task of (milestone as any).tasks || []) {
                const savedTask = await createTask(savedMilestone.id, {
                  title: task.title,
                  description: task.description,
                  order: task.order,
                  startDay: task.startDay,
                  endDay: task.endDay,
                  durationDays: task.durationDays,
                  timesPerWeek: task.timesPerWeek,
                });

                if (savedTask) {
                  tasksCreated++;
                  // Create subtasks for this task
                  for (const subtask of task.subTasks || []) {
                    const savedSubtask = await createSubTask(savedTask.id, {
                      title: subtask.title,
                      order: subtask.order,
                      isManual: false,
                      taskId: savedTask.id, // Explicitly set taskId
                    });
                    if (savedSubtask) subtasksCreated++;
                  }
                }
              }
            }
          }
        }

        // Full goal saved with all hierarchy

        // Refresh goals from DB to get proper IDs
        await refreshGoals();

        // Added full goal with roadmap
        logger.info('Added full goal with roadmap', {
          phases: goalData.phases?.length || 0,
          milestones: goalData.phases?.reduce((acc: number, p: any) => acc + (p.milestones?.length || 0), 0) || 0,
        });
      } catch (err) {
        logger.error('[Chatbot] Error saving goal to DB', err);
      }
    } else {
      // Basic goal without phases - create shell in DB
      const savedGoal = await createGoal({
        title: goalData.title || 'New Ambition',
        originalInput: goalData.title || '',
        category: goalData.category || 'personal',
        timeline: goalData.timeline || '3 months',
        estimatedWeeks: 12,
        strategyOverview: goalData.strategyOverview,
        criticalGaps: goalData.criticalGaps,
        overviewGenerated: goalData.overviewGenerated,
        behaviorPlan: goalData.behaviorPlan,
        priorityWeight: goalData.priorityWeight,
        riskLevel: goalData.riskLevel,
        riskAcknowledgedAt: goalData.riskAcknowledgedAt,
        intakeQuestions: goalData.intakeQuestions,
        intakeAnswers: goalData.intakeAnswers,
        intakeSummary: goalData.intakeSummary,
        intakeSchemaVersion: goalData.intakeSchemaVersion,
        intakeUpdatedAt: goalData.intakeUpdatedAt,
        preferredTime: goalData.preferredTime || 'flexible',
        frequency: goalData.frequency || 3,
        duration: goalData.duration || 60,
        energyCost: goalData.energyCost || 'medium',
        preferredDays: goalData.preferredDays,
        status: 'planning',
      });

      if (savedGoal) {
        await refreshGoals();
        // Added basic goal to DB
      } else {
        logger.error('[Chatbot] Failed to create basic goal in DB');
      }
    }
  }, [createGoal, createPhase, createMilestone, createSubTask, refreshGoals]);

  const handleChatEditGoal = useCallback(async (goalId: string, updates: Partial<Goal>) => {
    await updateGoal(goalId, updates);
    await refreshGoals();
  }, [updateGoal, refreshGoals]);

  const handleChatAddMilestone = useCallback(async (
    goalId: string,
    phaseId: string,
    milestoneData: Partial<import('./types').Milestone>
  ) => {
    // Adding milestone to DB

    // Find the phase to get the order
    const goal = goals.find(g => g.id === goalId);
    const phase = goal?.phases.find(p => p.id === phaseId);
    const order = (phase?.milestones.length || 0) + 1;

    // Create in database
    const savedMilestone = await createMilestone(phaseId, goalId, {
      title: milestoneData.title || 'New Milestone',
      description: milestoneData.description,
      targetWeek: milestoneData.targetWeek,
      order,
    });

    if (savedMilestone) {
      const tasks = (milestoneData as any)?.tasks as Partial<import('./types').Task>[] | undefined;
      if (Array.isArray(tasks) && tasks.length > 0) {
        for (const task of tasks) {
          const savedTask = await createTask(savedMilestone.id, {
            title: task.title || 'New Task',
            description: task.description,
            order: task.order,
            startDay: task.startDay,
            endDay: task.endDay,
            durationDays: task.durationDays,
            timesPerWeek: task.timesPerWeek,
          });
          if (!savedTask) continue;

          for (const subtask of task.subTasks || []) {
            await createSubTask(savedTask.id, {
              title: subtask.title || 'New Subtask',
              order: subtask.order,
              isManual: false,
            });
          }
        }
      }

      await refreshGoals();
    } else {
      logger.error('[Chatbot] Failed to save milestone to DB');
    }
  }, [goals, createMilestone, createTask, createSubTask, refreshGoals]);

  const handleChatCompleteMilestone = useCallback(async (milestoneId: string) => {
    // Completing milestone in DB

    // Toggle milestone in database
    await toggleMilestone(milestoneId);

    // Refresh to get updated progress calculations
    await refreshGoals();

    // Milestone completed
  }, [toggleMilestone, refreshGoals]);

  const handleChatAddSubTask = useCallback(async (
    taskId: string,
    subtaskData: Partial<SubTask>
  ) => {
    const savedSubTask = await createSubTask(taskId, { title: subtaskData.title || 'New Subtask' });

    if (savedSubTask) {
      await refreshGoals();
    } else {
      logger.error('[Chatbot] Failed to save subtask to DB');
    }
  }, [createSubTask, refreshGoals]);

  const handleChatAddTask = useCallback(async (
    milestoneId: string,
    taskData: Partial<import('./types').Task>
  ) => {
    const savedTask = await createTask(milestoneId, {
      title: taskData.title || 'New Task',
      description: taskData.description,
      order: taskData.order,
      startDay: taskData.startDay,
      endDay: taskData.endDay,
      durationDays: taskData.durationDays,
      timesPerWeek: taskData.timesPerWeek,
    });

    if (savedTask) {
      await refreshGoals();
    } else {
      logger.error('[Chatbot] Failed to save task to DB');
    }
  }, [createTask, refreshGoals]);

  const handleChatEditTask = useCallback(async (taskId: string, updates: Partial<import('./types').Task>) => {
    await updateTask(taskId, updates);
    await refreshGoals();
  }, [updateTask, refreshGoals]);

  const handleChatCompleteTask = useCallback(async (taskId: string) => {
    await setTaskCompletion(taskId, true);
  }, [setTaskCompletion]);

  const handleChatDeleteTask = useCallback(async (taskId: string) => {
    await deleteTask(taskId);
    await refreshGoals();
  }, [deleteTask, refreshGoals]);

  const handleChatCompleteSubTask = useCallback(async (subtaskId: string) => {
    // Completing subtask in DB

    // Toggle subtask in database
    await toggleSubTask(subtaskId);

    // Refresh to get updated data
    await refreshGoals();

    // Subtask completed
  }, [toggleSubTask, refreshGoals]);

  const handleChatAddNote = useCallback((targetType: string, targetId: string, note: string) => {
    if (targetType === 'goal') {
      setGoals(prev => prev.map(g => {
        if (g.id !== targetId) return g;
        const historyEntry: HistoryEntry = {
          id: `history-${Date.now()}`,
          goalId: targetId,
          timestamp: new Date(),
          type: 'note_added',
          details: { notes: note },
        };
        return {
          ...g,
          history: [...(g.history || []), historyEntry],
          updatedAt: new Date(),
        };
      }));
    } else if (targetType === 'milestone') {
      const milestone = goals.flatMap(g => g.phases.flatMap(p => p.milestones)).find(m => m.id === targetId);
      const updatedNotes = milestone?.userNotes ? `${milestone.userNotes}\n${note}` : note;
      updateMilestone(targetId, { userNotes: updatedNotes });
      refreshGoals();
    }
    // Added note
  }, [goals, updateMilestone, refreshGoals]);

  const handleChatCreateEvent = useCallback(async (eventData: Partial<CalendarEvent>) => {
    await createEvent(eventData);
    await refreshEvents();
  }, [createEvent, refreshEvents]);

  const handleChatEditEvent = useCallback(async (eventId: string, updates: Partial<CalendarEvent>) => {
    await updateEvent(eventId, updates);
    await refreshEvents();
  }, [updateEvent, refreshEvents]);

  const handleChatDeleteEvent = useCallback(async (eventId: string) => {
    await deleteEvent(eventId);
    await refreshEvents();
  }, [deleteEvent, refreshEvents]);


  const handleChatDeleteGoal = useCallback(async (goalId: string) => {
    await deleteGoal(goalId);
    await refreshGoals();
  }, [deleteGoal, refreshGoals]);

  const handleChatAddPhase = useCallback(async (goalId: string, phaseData: Partial<import('./types').Phase>) => {
    const goal = goals.find(g => g.id === goalId);
    const nextNumber = (goal?.phases.length || 0) + 1;

    const savedPhase = await createPhase(goalId, {
      number: phaseData.number || nextNumber,
      title: phaseData.title || 'New Phase',
      description: phaseData.description || '',
      startWeek: phaseData.startWeek || 1,
      endWeek: phaseData.endWeek || 4,
      estimatedDuration: phaseData.estimatedDuration,
      focus: phaseData.focus || [],
      status: phaseData.status || 'upcoming',
    });

    if (!savedPhase) {
      logger.error('[Chatbot] Failed to create phase via chat', new Error('Create phase returned null'), { goalId });
      return;
    }

    const milestones = (phaseData as any)?.milestones as Partial<import('./types').Milestone>[] | undefined;
    if (Array.isArray(milestones) && milestones.length > 0) {
      for (const milestone of milestones) {
        const savedMilestone = await createMilestone(savedPhase.id, goalId, {
          title: milestone.title || 'New Milestone',
          description: milestone.description,
          targetWeek: milestone.targetWeek,
          order: milestone.order,
        });
        if (!savedMilestone) continue;

        const tasks = (milestone as any).tasks as Partial<import('./types').Task>[] | undefined;
        if (Array.isArray(tasks) && tasks.length > 0) {
          for (const task of tasks) {
            const savedTask = await createTask(savedMilestone.id, {
              title: task.title || 'New Task',
              description: task.description,
              order: task.order,
              startDay: task.startDay,
              endDay: task.endDay,
              durationDays: task.durationDays,
              timesPerWeek: task.timesPerWeek,
            });
            if (!savedTask) continue;

            for (const subtask of task.subTasks || []) {
              await createSubTask(savedTask.id, {
                title: subtask.title || 'New Subtask',
                order: subtask.order,
                isManual: false,
              });
            }
          }
        }
      }
    }

    await refreshGoals();
  }, [goals, createPhase, createMilestone, createTask, createSubTask, refreshGoals]);

  const handleChatEditPhase = useCallback(async (phaseId: string, updates: Partial<import('./types').Phase>) => {
    await updatePhase(phaseId, updates);
    await refreshGoals();
  }, [updatePhase, refreshGoals]);

  const handleChatDeletePhase = useCallback(async (phaseId: string) => {
    await deletePhase(phaseId);
    await refreshGoals();
  }, [deletePhase, refreshGoals]);

  const handleChatEditMilestone = useCallback(async (milestoneId: string, updates: Partial<import('./types').Milestone>) => {
    await updateMilestone(milestoneId, updates);
    await refreshGoals();
  }, [updateMilestone, refreshGoals]);

  const handleChatDeleteMilestone = useCallback(async (milestoneId: string) => {
    await deleteMilestone(milestoneId);
    await refreshGoals();
  }, [deleteMilestone, refreshGoals]);

  const handleChatEditSubTask = useCallback(async (subtaskId: string, updates: Partial<SubTask>) => {
    await updateSupabaseSubTask(subtaskId, updates);
    await refreshGoals();
  }, [updateSupabaseSubTask, refreshGoals]);

  const handleChatDeleteSubTask = useCallback(async (subtaskId: string, strikethrough?: boolean) => {
    if (strikethrough) {
      await updateSupabaseSubTask(subtaskId, { isStrikethrough: true });
    } else {
      await deleteSubTask(subtaskId);
    }
    await refreshGoals();
  }, [updateSupabaseSubTask, deleteSubTask, refreshGoals]);

  // Handle goal scheduled (from GoalLibrary "Build Calendar" button)
  const handleGoalScheduled = useCallback(async (
    goalId: string,
    newEvents: CalendarEvent[]
  ) => {
    logger.info('[App] handleGoalScheduled called', {
      goalId,
      eventCount: newEvents.length,
    });

    try {
      // If newEvents is empty, the Edge Function already saved events directly to DB.
      // We only need to refresh. If newEvents has items, it's from legacy client-side scheduling.
      if (newEvents.length > 0) {
        logger.info('[App] Saving events from client-side scheduling', { count: newEvents.length });
        // Clear existing events for this goal to avoid duplicates
        await deleteEventsByGoalId(goalId);

        // Insert new events created by the client-side scheduler
        for (const event of newEvents) {
          await createEvent({
            ...event,
            goalId: event.goalId || goalId,
          });
        }
      } else {
        logger.debug('[App] Events already saved by Edge Function, just refreshing');
      }

      // Refresh events from database to get the newly inserted events with their real DB IDs
      await refreshEvents();
      await refreshGoals(); // Also refresh goals to get isScheduled status

      // Mark goal and all phases as scheduled
      setGoals(prev => prev.map(g => {
        if (g.id !== goalId) return g;
        return {
          ...g,
          isScheduled: true,
          phases: g.phases.map(p => ({ ...p, isScheduled: true })),
          updatedAt: new Date(),
        };
      }));

    } catch (error) {
      logger.error('[App] Failed to save scheduled events', error, { goalId });
    }
  }, [refreshEvents, refreshGoals, deleteEventsByGoalId, createEvent]);

  const handleChatBuildSchedule = useCallback(async (goalId: string, options?: { startDate?: string }) => {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) {
      logger.error('[App] Goal not found for scheduling', new Error('Goal not found for scheduling'), { goalId });
      return;
    }

    const startDate = options?.startDate ? new Date(options.startDate) : new Date();
    if (Number.isNaN(startDate.getTime())) {
      logger.error('[App] Invalid start date for scheduling', new Error('Invalid start date for scheduling'), { startDate: options?.startDate });
      return;
    }

    setView('goals');

    try {
      logger.info('[App] Chat requested schedule build for goal', { goalId });
      const result = await generateGoalSchedule({
        profile: user || {},
        goal,
        constraints: constraints || undefined,
        existingEvents: calendarEvents,
        startDate,
      });

      await handleGoalScheduled(goalId, []);
    } catch (error) {
      logger.error('[App] Chat schedule build failed', error, { goalId });
    }
  }, [goals, user, constraints, calendarEvents, handleGoalScheduled]);

  const handleChatClearSchedule = useCallback(async (goalId: string) => {
    await handleClearEvents(goalId);
  }, [handleClearEvents]);



  // ... (existing imports)

  // [Removed DesktopSidebar and MobileNavBar components]

  // ... (inside App component render)

  // Main App Views (Dashboard, Goals, Calendar, Sprint)
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/40 text-foreground">

      {/* Main Content Area - No sidebar margin anymore */}
      <div className="min-h-screen">
        {/* AI Assistant Search Bar */}
        {/* Chat Assistant (Floating) - REMOVED for FullChatView */}

        {/* Page Content */}
        <div className={cn(
          "w-full", // Removed global padding to allow pages to be edge-to-edge if they want
          view === 'calendar' && "h-screen"
        )}>
          {view === 'landing' && (
            <LandingPage
              onStartOnboarding={handleStartOnboarding}
              onSignUp={handleSignUp}
              onSignIn={handleSignIn}
              onSignInWithGoogle={handleSignInWithGoogle}
              onResetPassword={resetPassword}
              onShowReleaseNotes={() => setView('releaseNotes')}
            />
          )}

          {view === 'onboarding' && (
            <Onboarding
              onComplete={handleOnboardingComplete}
              onBack={() => {
                if (isAddingGoal) {
                  setIsAddingGoal(false);
                  setView('dashboard');
                } else {
                  setView('landing');
                }
              }}
              initialAmbition={initialAmbition}
              initialProfile={{
                id: user?.id || authUser?.id || '',
                name: user?.name || authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || '',
                role: user?.role || '',
                roleContext: user?.roleContext || '',
                bio: user?.bio || '',
                chronotype: user?.chronotype || 'flexible',
                energyLevel: user?.energyLevel || 'balanced',
                workStyle: user?.workStyle || 'flow',
              }}
              initialConstraints={constraints || undefined}
              initialStep={isAddingGoal ? 1 : 0}
              isAddGoalMode={isAddingGoal}
              existingGoals={goals}
              walkthroughSeen={walkthroughSeen}
              onWalkthroughComplete={handleWalkthroughComplete}
            />
          )}

          {view === 'resetPassword' && (
            <ResetPasswordPage
              onUpdatePassword={updatePassword}
              onBackToLanding={() => setView('landing')}
            />
          )}

          {view === 'releaseNotes' && (
            <ReleaseNotes onBack={() => setView('landing')} />
          )}

          {view === 'dashboard' && user && (
            <Dashboard
              user={user}
              goals={goals}
              calendarEvents={calendarEvents}
              onNavigateToGoals={(goalId) => {
                setTargetGoalId(goalId);
                setView('goals');
              }}
              onNavigateToCalendar={() => setView('calendar')}
              onNavigateToSettings={() => setView('settings')}
              onNavigateToChat={() => setView('chat')}
              onLogout={signOut}
              onAddGoal={() => {
                void handleStartAddGoalFlow();
              }}
            />
          )}

          {view === 'calendar' && (
            <div className="min-h-screen bg-background text-foreground">
              <AppHeader
                userName={user?.name}
                userInitial={user?.name?.charAt(0) || 'U'}
                onNavigateToSettings={() => setView('settings')}
                onLogout={signOut}
              />
              <CalendarView
                events={calendarEvents}
                goals={goals}
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
                onEventClick={handleEventClick}
                constraints={constraints ? { peakStart: constraints.peakStart, peakEnd: constraints.peakEnd } : undefined}
                onEventUpdate={(updatedEvent, meta) => {
                  // Always update local state for immediate UI feedback (especially during resize preview)
                  setCalendarEvents(prev => prev.map(e => e.id === updatedEvent.id ? updatedEvent : e));

                  // Only persist to DB on commit (drag end / resize end)
                  if (meta?.mode === 'commit') {
                    // Safety: never persist updates for virtual recurring instances
                    if (updatedEvent.recurringEventId && updatedEvent.recurringEventId !== updatedEvent.id) {
                      logger.warn('[Calendar] Ignoring update for virtual recurring instance', { eventId: updatedEvent.id });
                      refreshEvents().catch((err) => {
                        logger.error('[Calendar] Failed to refresh events after virtual update skip', err, { eventId: updatedEvent.id });
                      });
                      return;
                    }

                    updateEvent(updatedEvent.id, {
                      start: updatedEvent.start,
                      end: updatedEvent.end,
                      isAllDay: updatedEvent.isAllDay,
                      rescheduleCount: updatedEvent.rescheduleCount,
                      originalStartDatetime: updatedEvent.originalStartDatetime,
                      ambitionOsMeta: updatedEvent.ambitionOsMeta
                        ? {
                          rescheduleCount: updatedEvent.ambitionOsMeta.rescheduleCount,
                          originalStart: updatedEvent.ambitionOsMeta.originalStart,
                        }
                        : undefined,
                    }).catch((err) => {
                      logger.error('[Calendar] Failed to persist event update', err, { eventId: updatedEvent.id });
                    });
                  }
                }}
                onTimeSlotClick={(date, time) => {
                  setEventModalInitialDate(date);
                  setEventModalInitialTime(time);
                  setShowCreateEventModal(true);
                }}
                onCreateEvent={() => {
                  setEventModalInitialDate(new Date());
                  setEventModalInitialTime(undefined);
                  setShowCreateEventModal(true);
                }}
                hideHeader={true}
                userProfile={user ? { name: user.name } : undefined}
              />
            </div>
          )}

          {view === 'goals' && (
            <div className="min-h-screen bg-background text-foreground">
              <AppHeader
                userName={user?.name}
                userInitial={user?.name?.charAt(0) || 'U'}
                onNavigateToSettings={() => setView('settings')}
                onLogout={signOut}
              />
              <GoalLibrary
                goals={goals}
                onGoalClick={() => { }}
                onMilestoneToggle={handleMilestoneToggle}
                onSubTaskToggle={handleSubTaskToggle}
                onAddPhase={handleAddPhase}
                onAddMilestone={handleAddMilestone}
                onAddTask={handleAddTask}
                onAddSubTask={handleAddSubTask}
                onGoalUpdate={handleGoalUpdate}
                onGoalStatusChange={handleGoalStatusChange}
                onDeleteGoal={handleDeleteGoal}
                onClearEvents={handleClearEvents}
                existingEvents={calendarEvents}
                userProfile={user || undefined}
                constraints={constraints || undefined}
                onGoalScheduled={handleGoalScheduled}
                targetGoalId={targetGoalId}
                onAddGoal={() => {
                  void handleStartAddGoalFlow();
                }}
                onAskCoach={(goalId) => {
                  // Navigate to chat with this goal focused
                  setTargetGoalId(goalId);
                  setView('chat');
                }}
                onGoalDetailOpen={handleGoalDetailOpen}
                onGoalDetailClose={handleGoalDetailClose}
                calendarSchemaCapabilities={calendarSchemaCapabilities}
                onEventComplete={async (eventId) => {
                  // Mark the calendar event as completed
                  try {
                    await updateEvent(eventId, {
                      status: 'completed',
                      ambitionOsMeta: { isCompleted: true }
                    } as any);
                    await refreshEvents();
                    // Event marked as complete
                  } catch (error) {
                    logger.error('[App] Failed to mark event complete', error, { eventId });
                  }
                }}
                onEventUpdate={async (eventId, updates) => {
                  await updateEvent(eventId, updates);
                }}
                onEventDelete={async (eventId) => {
                  await deleteEvent(eventId);
                }}
                onTaskToggleById={async (taskId) => {
                  await toggleTask(taskId);
                }}
                onSubTaskToggleById={async (subtaskId) => {
                  await toggleSubTask(subtaskId);
                }}
                // CRUD callbacks for edit/delete buttons
                onPhaseUpdate={updatePhase}
                onPhaseDelete={deletePhase}
                onMilestoneUpdate={updateMilestone}
                onMilestoneDelete={deleteMilestone}
                onTaskUpdate={updateTask}
                onTaskDelete={deleteTask}
                onTaskToggle={async (taskId, completed) => {
                  await setTaskCompletion(taskId, completed);
                }}
                onSubTaskUpdate={updateSupabaseSubTask}
                onSubTaskDelete={deleteSubTask}
              />
            </div>
          )}

          {view === 'settings' && user && (
            <div className="min-h-screen bg-background text-foreground">
              <AppHeader
                userName={user?.name}
                userInitial={user?.name?.charAt(0) || 'U'}
                onNavigateToSettings={() => setView('settings')}
                onLogout={signOut}
              />
              <SettingsPage
                user={user}
                onBack={() => setView('dashboard')}
                onAccountDeleted={async () => {
                  // Account is deleted server-side; ensure local session/cache is cleared before reload.
                  try {
                    await signOut();
                  } finally {
                    setView('landing');
                    window.location.reload();
                  }
                }}
                onSignOut={signOut}
                onProfileUpdate={async (updates) => {
                  await updateProfile(updates);
                }}
                onReplayTour={startProductTour}
                storageMode={storageMode}
                onStorageModeChange={setStorageMode}
                onNavigateToPricing={() => {
                  setResumeAddGoalAfterUpgrade(false);
                  setView('pricing');
                }}
              />
            </div>
          )}
          {view === 'pricing' && user && (
            <div className="min-h-screen bg-background text-foreground">
              <PricingPage
                user={user}
                onBack={() => setView('dashboard')}
                onNavigateToSettings={() => setView('settings')}
                onUpgradeActivated={resumeAddGoalAfterUpgrade ? (() => {
                  setResumeAddGoalAfterUpgrade(false);
                  void refreshGoals();
                  void refreshEvents();
                  void handleStartAddGoalFlow(pendingAmbition, { skipEntitlementCheck: true });
                }) : undefined}
              />
            </div>
          )}
        </div>
      </div>

      {/* Full Page Chat View - Rendered outside main layout for total control */}
      {view === 'chat' && user && (
        <div className="fixed inset-0 z-50 bg-background">
          <FullChatView
            userProfile={user}
            goals={goals}
            constraints={constraints || {
              workBlocks: [],
              sleepStart: '23:00',
              sleepEnd: '07:00',
              peakStart: '09:00',
              peakEnd: '11:00',
              blockedSlots: []
            }}
            calendarEvents={calendarEvents}
            currentView={view as any}
            focusedGoalId={targetGoalId}
            onAddGoal={handleChatAddGoal}
            onEditGoal={handleChatEditGoal}
            onDeleteGoal={handleChatDeleteGoal}
            onAddPhase={handleChatAddPhase}
            onEditPhase={handleChatEditPhase}
            onDeletePhase={handleChatDeletePhase}
            onAddMilestone={handleChatAddMilestone}
            onEditMilestone={handleChatEditMilestone}
            onCompleteMilestone={handleChatCompleteMilestone}
            onDeleteMilestone={handleChatDeleteMilestone}
            onAddTask={handleChatAddTask}
            onEditTask={handleChatEditTask}
            onCompleteTask={handleChatCompleteTask}
            onDeleteTask={handleChatDeleteTask}
            onAddSubTask={handleChatAddSubTask}
            onEditSubTask={handleChatEditSubTask}
            onCompleteSubTask={handleChatCompleteSubTask}
            onDeleteSubTask={handleChatDeleteSubTask}
            onAddNote={handleChatAddNote}
            onCreateEvent={handleChatCreateEvent}
            onEditEvent={handleChatEditEvent}
            onDeleteEvent={handleChatDeleteEvent}
            onBuildSchedule={handleChatBuildSchedule}
            onClearSchedule={handleChatClearSchedule}
            onNavigate={(targetView) => setView(targetView)}
          />
        </div>
      )}

      {/* Global Floating Dock Navigation - Only show on app views */}
      {['dashboard', 'goals', 'calendar', 'settings'].includes(view) && (
        <FloatingDock
          activeTab={view as 'dashboard' | 'goals' | 'calendar' | 'settings' | 'chat'}
          onNavigateToDashboard={() => setView('dashboard')}
          onNavigateToGoals={() => { setTargetGoalId(undefined); setView('goals'); }}
          onNavigateToCalendar={() => setView('calendar')}
          onNavigateToSettings={() => setView('settings')}
          onNavigateToChat={() => setView('chat')}
        />
      )}

      {productTourVisible && currentProductTourStep && (
        <WalkthroughOverlay
          steps={productTourSteps}
          stepIndex={productTourStepIndex}
          onNext={advanceProductTour}
          onBack={handleProductTourBack}
          onSkip={skipProductTour}
          onComplete={finishProductTour}
          canProceed={productTourCanProceed}
          primaryLabel={currentProductTourStep.primaryLabel}
          isWaiting={productTourIsWaiting}
        />
      )}

      <UpgradeGateModal
        open={upgradeGateOpen}
        maxActiveGoals={upgradeGateMaxGoals}
        onUpgrade={handleUpgradeFromGate}
        onDismiss={handleDismissUpgradeGate}
        onViewPlans={handleViewPlansFromGate}
      />
      <CheckoutModal
        open={upgradeCheckoutOpen}
        onOpenChange={setUpgradeCheckoutOpen}
        planId="pro_monthly"
        planLabel="Pro Monthly"
        userId={user?.id || authUser?.id}
        onUpgradeActivated={() => {
          setUpgradeCheckoutOpen(false);
          setUpgradeGateOpen(false);
          setResumeAddGoalAfterUpgrade(false);
          void refreshGoals();
          void refreshEvents();
          void handleStartAddGoalFlow(pendingAmbition, { skipEntitlementCheck: true });
        }}
      />

      {/* Task Detail Modal */}
      {
        selectedEvent && (
          <EventDetailModal
            isOpen={!!selectedEvent}
            event={selectedEvent}
            goals={goals}
            calendarSchemaCapabilities={calendarSchemaCapabilities}
            userProfile={user || undefined}
            constraints={constraints || undefined}
            calendarEvents={calendarEvents}
            onClose={() => setSelectedEvent(null)}
            onSave={async (updates) => {
              await handleCalendarEventUpdate(selectedEvent.id, updates);
            }}
            onDelete={async () => {
              await handleCalendarEventDelete(selectedEvent.id);
            }}
            onToggleTask={async (taskId) => {
              await toggleTask(taskId);
            }}
            onToggleSubTask={async (subtaskId) => {
              await toggleSubTask(subtaskId);
            }}
          />
        )
      }

      {/* Commitment Detail Modal (legacy) */}
      {
        selectedCommitment && (
          <CommitmentDetail
            commitment={selectedCommitment}
            goal={goals.find(g => g.id === selectedCommitment.goalId)}
            onClose={() => setSelectedCommitment(null)}
            onAction={(action, data) => handleCommitmentAction(selectedCommitment.id, action as any, data)}
          />
        )
      }

      {/* Create Event Modal */}
      <CreateEventModal
        isOpen={showCreateEventModal}
        onClose={() => setShowCreateEventModal(false)}
        onSave={async (eventDraft) => {
          const created = await createEvent(eventDraft);
          if (!created) {
            throw new Error('Failed to create event');
          }
        }}
        goals={goals}
        initialDate={eventModalInitialDate}
        initialTime={eventModalInitialTime}
        existingEvents={calendarEvents}
      />

      {/* Add Goal Modal */}
      <AddGoalModal
        isOpen={showAddGoalModal}
        onClose={() => setShowAddGoalModal(false)}
        onSave={async (goal) => {
          // Saving new goal from AddGoalModal

          try {
            // 1. Create the goal in database
            const savedGoal = await createGoal({
              title: goal.title,
              originalInput: goal.originalInput,
              category: goal.category,
              timeline: goal.timeline,
              estimatedWeeks: goal.estimatedWeeks,
              strategyOverview: goal.strategyOverview,
              criticalGaps: goal.criticalGaps,
              overviewGenerated: goal.overviewGenerated,
              behaviorPlan: goal.behaviorPlan,
              priorityWeight: goal.priorityWeight,
              riskLevel: goal.riskLevel,
              riskAcknowledgedAt: goal.riskAcknowledgedAt,
              intakeQuestions: goal.intakeQuestions,
              intakeAnswers: goal.intakeAnswers,
              intakeSummary: goal.intakeSummary,
              intakeSchemaVersion: goal.intakeSchemaVersion,
              intakeUpdatedAt: goal.intakeUpdatedAt,
              preferredTime: goal.preferredTime,
              frequency: goal.frequency,
              duration: goal.duration,
              energyCost: goal.energyCost,
              preferredDays: goal.preferredDays,
              status: 'active',
            });

            if (!savedGoal) {
              logger.error('[App] Failed to create goal in database');
              return;
            }

            // Goal created in DB

            // 2. Create phases, milestones, and subtasks
            for (const phase of goal.phases || []) {
              const savedPhase = await createPhase(savedGoal.id, {
                number: phase.number,
                title: phase.title,
                description: phase.description,
                startWeek: phase.startWeek,
                endWeek: phase.endWeek,
                estimatedDuration: phase.estimatedDuration,
                focus: phase.focus,
                coachAdvice: phase.coachAdvice,
                status: phase.status || 'upcoming',
              });

              if (!savedPhase) {
                logger.error('[App] Failed to create phase', new Error('Create phase returned null'), { phaseTitle: phase.title });
                continue;
              }

              // Create milestones for this phase
              for (const milestone of phase.milestones || []) {
                const savedMilestone = await createMilestone(savedPhase.id, savedGoal.id, {
                  title: milestone.title,
                  description: milestone.description,
                  targetWeek: milestone.targetWeek,
                  order: milestone.order,
                });

                if (!savedMilestone) {
                  logger.error('[App] Failed to create milestone', new Error('Create milestone returned null'), { milestoneTitle: milestone.title });
                  continue;
                }

                const tasksToCreate = Array.isArray((milestone as any).tasks)
                  ? (milestone as any).tasks
                  : [];

                for (const task of tasksToCreate) {
                  const savedTask = await createTask(savedMilestone.id, {
                    title: task.title,
                    description: task.description,
                    order: task.order,
                    startDay: task.startDay,
                    endDay: task.endDay,
                    durationDays: task.durationDays,
                    timesPerWeek: task.timesPerWeek,
                  });

                  if (!savedTask) continue;

                  for (const subtask of task.subTasks || []) {
                    await createSubTask(savedTask.id, {
                      title: subtask.title,
                      order: subtask.order,
                      isManual: false,
                    });
                  }
                }
              }
            }

            // 3. Refresh goals to get complete data from DB
            await refreshGoals();

            // Goal saved with all phases, milestones, and subtasks
            setShowAddGoalModal(false);

          } catch (err) {
            logger.error('[App] Error saving goal', err, { goalTitle: goal.title });
          }
        }}
        userProfile={user || {}}
        existingGoals={goals}
      />
    </div >
  );
};

export default App;
