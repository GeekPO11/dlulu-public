// =============================================================================
// SUPABASE DATA HOOK
// Replaces localStorage with Supabase real-time sync
// Drop-in replacement for current App.tsx state management
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, auth } from '../supabase';
import { logger } from '../logger';
import {
  transformGoalFromDb,
  transformEventFromDb,
  transformProfileFromDb,
  localToUtcIso,
} from '../api/transformers';
import type { User } from '@supabase/supabase-js';

// Types from the app
import type {
  UserProfile,
  Goal,
  TimeConstraints,
  Phase,
  Milestone,
  Task,
  SubTask,
} from '../../types';
import type { CalendarEvent } from '../../constants/calendarTypes';

type StorageMode = 'local' | 'session';

type CalendarSchemaCapabilities = {
  isLocked: boolean;
  difficulty: boolean;
  cognitiveType: boolean;
  effortMinutesAllocated: boolean;
  durationMinutes: boolean;
};

const STORAGE_MODE_KEY = 'dlulu_storage_mode';
const CACHE_KEYS = ['dlulu_profile', 'dlulu_constraints', 'dlulu_goals', 'dlulu_events'] as const;
const DEFAULT_CALENDAR_SCHEMA_CAPABILITIES: CalendarSchemaCapabilities = {
  isLocked: true,
  difficulty: true,
  cognitiveType: true,
  effortMinutesAllocated: true,
  durationMinutes: true,
};
const CALENDAR_COLUMN_TO_CAPABILITY: Record<string, keyof CalendarSchemaCapabilities> = {
  is_locked: 'isLocked',
  difficulty: 'difficulty',
  cognitive_type: 'cognitiveType',
  effort_minutes_allocated: 'effortMinutesAllocated',
  duration_minutes: 'durationMinutes',
};
const CALENDAR_CAPABILITY_TO_COLUMN: Record<keyof CalendarSchemaCapabilities, string> = {
  isLocked: 'is_locked',
  difficulty: 'difficulty',
  cognitiveType: 'cognitive_type',
  effortMinutesAllocated: 'effort_minutes_allocated',
  durationMinutes: 'duration_minutes',
};
const MISSING_COLUMN_PATTERNS = [
  /Could not find the '([^']+)' column/i,
  /column "?([a-zA-Z0-9_.]+)"? (?:of relation "[^"]+" )?does not exist/i,
];

const resolveStorageMode = (): StorageMode => {
  if (typeof window === 'undefined') return 'local';
  const stored = window.localStorage.getItem(STORAGE_MODE_KEY);
  if (stored === 'local' || stored === 'session') return stored;

  const hasLegacyCache = CACHE_KEYS.some((key) => window.localStorage.getItem(key));
  return hasLegacyCache ? 'local' : 'session';
};

const clearCachedData = (target: Storage) => {
  CACHE_KEYS.forEach((key) => target.removeItem(key));
};

const extractMissingCalendarColumn = (error: any): string | null => {
  if (!error) return null;

  const candidates = [
    typeof error?.message === 'string' ? error.message : '',
    typeof error?.details === 'string' ? error.details : '',
    typeof error?.hint === 'string' ? error.hint : '',
  ].filter(Boolean);

  for (const value of candidates) {
    for (const pattern of MISSING_COLUMN_PATTERNS) {
      const match = value.match(pattern);
      if (!match?.[1]) continue;
      const token = match[1].split('.').pop()?.replace(/"/g, '').trim();
      if (token) return token;
    }
  }

  return null;
};

const toCalendarCapability = (column: string): keyof CalendarSchemaCapabilities | null => {
  return CALENDAR_COLUMN_TO_CAPABILITY[column] || null;
};

const retryCalendarEventMutationWithoutMissingColumns = async <T>(
  operation: string,
  initialPayload: Record<string, any>,
  mutate: (payload: Record<string, any>) => Promise<{ data: T | null; error: any }>
): Promise<{ data: T | null; error: any; droppedColumns: string[] }> => {
  let payload = { ...initialPayload };
  const droppedColumns: string[] = [];
  let lastError: any = null;
  const maxAttempts = Math.min(12, Object.keys(initialPayload).length + 1);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error } = await mutate(payload);
    if (!error) {
      return { data, error: null, droppedColumns };
    }

    lastError = error;
    const missingColumn = extractMissingCalendarColumn(error);
    if (!missingColumn || !(missingColumn in payload)) {
      return { data: null, error, droppedColumns };
    }

    delete payload[missingColumn];
    droppedColumns.push(missingColumn);
  }

  logger.warn(`[Calendar] ${operation} exceeded schema fallback attempts`, {
    droppedColumns,
    payloadKeys: Object.keys(initialPayload),
  });

  return { data: null, error: lastError, droppedColumns };
};

interface UseSupabaseDataReturn {
  // Auth state
  isAuthenticated: boolean;
  authUser: User | null;
  isLoading: boolean;
  error: string | null;

  // Data
  user: UserProfile | null;
  constraints: TimeConstraints | null;
  goals: Goal[];
  calendarEvents: CalendarEvent[];
  calendarSchemaCapabilities: CalendarSchemaCapabilities;
  storageMode: StorageMode;

  // Auth actions
  signUp: (email: string, password: string, name: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;

  // Profile actions
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  updateConstraints: (updates: Partial<TimeConstraints>) => Promise<void>;

  // Goal actions
  createGoal: (goal: Partial<Goal>) => Promise<Goal | null>;
  updateGoal: (goalId: string, updates: Partial<Goal>) => Promise<void>;
  deleteGoal: (goalId: string) => Promise<void>;
  updateGoalStatus: (goalId: string, status: Goal['status']) => Promise<void>;

  // Phase actions
  createPhase: (goalId: string, phase: Partial<Phase>) => Promise<Phase | null>;
  updatePhase: (phaseId: string, updates: Partial<Phase>) => Promise<void>;
  deletePhase: (phaseId: string) => Promise<void>;

  // Milestone actions
  createMilestone: (phaseId: string, goalId: string, milestone: Partial<Milestone>) => Promise<Milestone | null>;
  updateMilestone: (milestoneId: string, updates: Partial<Milestone>) => Promise<void>;
  toggleMilestone: (milestoneId: string) => Promise<void>;
  deleteMilestone: (milestoneId: string) => Promise<void>;

  // Task actions (NEW: layer between milestone and subtask)
  createTask: (milestoneId: string, task: Partial<Task>) => Promise<Task | null>;
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
  setTaskCompletion: (taskId: string, completed: boolean) => Promise<void>;
  toggleTask: (taskId: string) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;

  // SubTask actions (taskId is now required - legacy milestone support removed)
  createSubTask: (taskId: string, subtaskData: { title: string; order?: number; isManual?: boolean }) => Promise<SubTask | null>;
  updateSubTask: (subtaskId: string, updates: Partial<SubTask>) => Promise<void>;
  toggleSubTask: (subtaskId: string) => Promise<void>;
  deleteSubTask: (subtaskId: string) => Promise<void>;

  // Calendar actions
  createEvent: (event: Partial<CalendarEvent>) => Promise<CalendarEvent | null>;
  updateEvent: (eventId: string, updates: Partial<CalendarEvent>) => Promise<void>;
  deleteEvent: (eventId: string) => Promise<void>;
  deleteEventsByGoalId: (goalId: string) => Promise<number>;

  // Refresh
  refreshGoals: () => Promise<void>;
  refreshEvents: () => Promise<void>;

  setStorageMode: (mode: StorageMode) => void;
}

export function useSupabaseData(): UseSupabaseDataReturn {
  // Auth state
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [storageMode, setStorageModeState] = useState<StorageMode>(() => resolveStorageMode());
  const storage = storageMode === 'local' ? localStorage : sessionStorage;
  const backupStorage = storageMode === 'local' ? sessionStorage : localStorage;
  // Never trust cached profile presence as authenticated state.
  // Auth status must come from Supabase session events.
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data state
  // Data state - INITIALIZE FROM CACHE
  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const cached = storage.getItem('dlulu_profile');
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });

  const [constraints, setConstraints] = useState<TimeConstraints | null>(() => {
    try {
      const cached = storage.getItem('dlulu_constraints');
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });

  const [goals, setGoals] = useState<Goal[]>(() => {
    try {
      const cached = storage.getItem('dlulu_goals');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });

  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(() => {
    try {
      const cached = storage.getItem('dlulu_events');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [calendarSchemaCapabilities, setCalendarSchemaCapabilities] = useState<CalendarSchemaCapabilities>(
    DEFAULT_CALENDAR_SCHEMA_CAPABILITIES
  );

  // Track loading to prevent concurrent loads
  const loadingUserIdRef = useRef<string | null>(null);
  const hasInitializedRef = useRef(false);
  const loadedUserIdRef = useRef<string | null>(null);
  // Track sign out state to prevent zombie writes to localStorage
  const isSigningOutRef = useRef(false);

  const markMissingCalendarColumns = useCallback((missingColumns: string[]) => {
    if (!Array.isArray(missingColumns) || missingColumns.length === 0) return;
    setCalendarSchemaCapabilities((previous) => {
      let changed = false;
      const next = { ...previous };
      for (const column of missingColumns) {
        const capability = toCalendarCapability(column);
        if (!capability) continue;
        if (next[capability]) {
          next[capability] = false;
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, []);

  const refreshCalendarSchemaCapabilities = useCallback(async (userIdOverride?: string) => {
    const userId = userIdOverride || authUser?.id;
    if (!userId) return;

    const pendingCapabilities = new Set<keyof CalendarSchemaCapabilities>(Object.keys(CALENDAR_CAPABILITY_TO_COLUMN) as Array<keyof CalendarSchemaCapabilities>);
    const discoveredMissing: string[] = [];

    while (pendingCapabilities.size > 0) {
      const selectColumns = ['id'];
      pendingCapabilities.forEach((capability) => {
        selectColumns.push(CALENDAR_CAPABILITY_TO_COLUMN[capability]);
      });

      const { error } = await supabase
        .from('calendar_events')
        .select(selectColumns.join(','))
        .eq('user_id', userId)
        .limit(1);

      if (!error) break;

      const missingColumn = extractMissingCalendarColumn(error);
      if (!missingColumn) {
        logger.warn('[Calendar] Unable to infer schema capabilities', {
          message: error?.message,
          code: error?.code,
        });
        break;
      }

      const capability = toCalendarCapability(missingColumn);
      if (!capability || !pendingCapabilities.has(capability)) {
        break;
      }

      pendingCapabilities.delete(capability);
      discoveredMissing.push(missingColumn);
    }

    const nextCapabilities: CalendarSchemaCapabilities = { ...DEFAULT_CALENDAR_SCHEMA_CAPABILITIES };
    discoveredMissing.forEach((column) => {
      const capability = toCalendarCapability(column);
      if (capability) nextCapabilities[capability] = false;
    });

    setCalendarSchemaCapabilities(nextCapabilities);
  }, [authUser]);

  // =============================================================================
  // CACHE PERSISTENCE
  // =============================================================================

  useEffect(() => {
    if (user && !isSigningOutRef.current) storage.setItem('dlulu_profile', JSON.stringify(user));
  }, [user, storage]);

  useEffect(() => {
    if (constraints && !isSigningOutRef.current) storage.setItem('dlulu_constraints', JSON.stringify(constraints));
  }, [constraints, storage]);

  useEffect(() => {
    if (!isSigningOutRef.current) {
      storage.setItem('dlulu_goals', JSON.stringify(goals));
    }
  }, [goals, storage]);

  useEffect(() => {
    if (!isSigningOutRef.current) {
      storage.setItem('dlulu_events', JSON.stringify(calendarEvents));
    }
  }, [calendarEvents, storage]);

  // =============================================================================
  // AUTH STATE LISTENER
  // =============================================================================

  useEffect(() => {
    // Only use onAuthStateChange - it fires INITIAL_SESSION on mount
    // This avoids the race condition between getSession() and onAuthStateChange
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Auth state change detected

        // SYNC: Update auth state immediately (no network calls here)
        setAuthUser(session?.user ?? null);
        setIsAuthenticated(!!session?.user);

        if (session?.user) {
          // Reset sign-out guard when a valid session exists
          isSigningOutRef.current = false;
          logger.setContext({ userId: session.user.id });

          // KEY FIX: Check if we've already loaded data for this user
          // This prevents double-loading when SIGNED_IN fires before INITIAL_SESSION
          const alreadyLoadedForThisUser = loadedUserIdRef.current === session.user.id;
          const alreadyLoadingForThisUser = loadingUserIdRef.current === session.user.id;

          if (alreadyLoadedForThisUser || alreadyLoadingForThisUser) {
            // Already loaded data for this user - skip all data loading
            // Already loaded data for this user, skipping
            setIsLoading(false);
            return;
          }

          // DISPATCH async work OUTSIDE callback using setTimeout (prevents deadlocks)
          if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
            // Load data on first auth event (whichever fires first)
            hasInitializedRef.current = true; // Set BEFORE loading to prevent race
            setTimeout(() => {
              loadingUserIdRef.current = session.user.id;
              loadUserData(session.user)
                .then((success) => {
                  if (success) {
                    loadedUserIdRef.current = session.user.id;
                  } else {
                    loadedUserIdRef.current = null;
                  }
                })
                .finally(() => {
                  loadingUserIdRef.current = null;
                });
            }, 0);
          }
          else if (event === 'TOKEN_REFRESHED') {
            // Just token refresh - DO NOT reload data, just update session cache
            // Token refreshed, keeping existing data
            // isLoading should already be false, but ensure it
            setIsLoading(false);
          }
        } else {
          // Clear data on logout (event === 'SIGNED_OUT')
          setUser(null);
          setConstraints(null);
          setGoals([]);
          setCalendarEvents([]);
          setCalendarSchemaCapabilities(DEFAULT_CALENDAR_SCHEMA_CAPABILITIES);

          // Clear cache from both storage scopes
          clearCachedData(storage);
          clearCachedData(backupStorage);

          setIsLoading(false);
          hasInitializedRef.current = false; // Reset on logout
          loadedUserIdRef.current = null;
          logger.clearContext('userId');
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // =============================================================================
  // DATA LOADING
  // =============================================================================

  const loadUserData = async (sessionUser: User): Promise<boolean> => {
    const userId = sessionUser.id;
    // Loading user data
    let success = true;

    // CRITICAL: Only show loading spinner if we don't have any profile data yet
    // This allows "stale-while-revalidate" - show old data while fetching new
    if (!user) {
      setIsLoading(true);
    } else {
      // Background refresh - keeping existing UI visible
    }

    try {
      // STEP 1: Use the session user data directly - no need to call getUser() again!
      // The session from onAuthStateChange is already authenticated and valid
      const defaultProfile: UserProfile = {
        id: sessionUser.id,
        name: sessionUser.user_metadata?.full_name || sessionUser.email?.split('@')[0] || 'User',
        role: '',
        bio: '',
        chronotype: 'flexible',
        workStyle: 'flow',
        energyLevel: 'balanced',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setUser(defaultProfile);
      // Using session profile

      // STEP 3: Try to fetch real profile from DB
      let profileLoaded = false;
      // Fetching profile from DB

      // Direct fetch - no complex timeout logic, Supabase has its own timeouts
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) {
        logger.warn('[Data] Profile fetch error', { message: profileError.message, code: profileError.code });
      } else if (profile) {
        setUser(transformProfileFromDb(profile));
        profileLoaded = true;
        // Profile loaded from DB
      } else {
        // No profile exists in DB yet
      }

      // STEP 4: If no profile in DB, try to create one
      // This is important for new users who just signed up via OAuth
      if (!profileLoaded) {
        // No profile found, attempting to create
        try {
          const { error: upsertError } = await supabase.from('profiles').upsert({
            id: sessionUser.id,
            email: sessionUser.email,
            name: defaultProfile.name,
          }, { onConflict: 'id' });

          if (upsertError) {
            logger.error('[Data] Profile upsert failed', upsertError, { message: upsertError.message });
          } else {
            // Profile created/updated in DB successfully
          }
        } catch (upsertErr: any) {
          logger.error('[Data] Profile upsert exception', upsertErr, { message: upsertErr.message });
        }
      }

      // Load constraints (use maybeSingle to handle new users with no record)
      const { data: constraintsData } = await supabase
        .from('time_constraints')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (constraintsData) {
        // Load time blocks
        const { data: timeBlocks } = await supabase
          .from('time_blocks')
          .select('*')
          .eq('user_id', userId);

        const { data: timeExceptions } = await (supabase as any)
          .from('time_exceptions')
          .select('*')
          .eq('user_id', userId);

        setConstraints({
          workBlocks: timeBlocks?.filter(b => b.block_type === 'work').map(transformTimeBlock) || [],
          blockedSlots: timeBlocks?.filter(b => b.block_type !== 'work').map(transformTimeBlock) || [],
          sleepStart: constraintsData.sleep_start,
          sleepEnd: constraintsData.sleep_end,
          peakStart: constraintsData.peak_start,
          peakEnd: constraintsData.peak_end,
          timeExceptions: timeExceptions?.map(transformTimeException) || [],
        });
      }

      // Load goals with nested data (with timeout)
      // Loading goals
      try {
        await Promise.race([
          refreshGoals(userId),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Goals fetch timed out')), 8000))
        ]);
        // Goals loaded successfully
      } catch (goalsErr: any) {
        logger.error('[Data] Error loading goals', goalsErr, { message: goalsErr.message });
        setGoals([]); // Set empty array on failure
      }

      // Load calendar events (with timeout)
      // Loading calendar events
      try {
        await Promise.race([
          refreshEvents(userId),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Events fetch timed out')), 8000))
        ]);
        // Events loaded successfully
      } catch (eventsErr: any) {
        logger.error('[Data] Error loading events', eventsErr, { message: eventsErr.message });
        setCalendarEvents([]); // Set empty array on failure
      }

      try {
        await refreshCalendarSchemaCapabilities(userId);
      } catch (schemaErr: any) {
        logger.warn('[Calendar] Failed to refresh schema capabilities', {
          message: schemaErr?.message,
        });
      }

    } catch (err: any) {
      success = false;
      logger.error('[Data] Error loading user data', err);
      setError(err.message);
    } finally {
      // Finished loading
      setIsLoading(false);
    }
    return success;
  };

  const transformTimeBlock = (block: any) => ({
    id: block.id,
    title: block.title,
    days: block.days,
    start: block.start_time,
    end: block.end_time,
    type: block.block_type,
    isFlexible: block.is_flexible,
    weekPattern: block.week_pattern || 'default',
    timezone: block.timezone || undefined,
  });

  const transformTimeException = (exception: any) => ({
    id: exception.id,
    date: exception.date,
    start: exception.start_time,
    end: exception.end_time,
    isBlocked: exception.is_blocked ?? true,
    reason: exception.reason || undefined,
    createdAt: exception.created_at ? new Date(exception.created_at) : undefined,
    updatedAt: exception.updated_at ? new Date(exception.updated_at) : undefined,
  });

  // =============================================================================
  // REFRESH FUNCTIONS
  // =============================================================================

  const refreshGoals = useCallback(async (userIdOverride?: string) => {
    const userId = userIdOverride || authUser?.id;
    if (!userId) {
      // No userId available, skipping refresh
      return;
    }

    // Fetching goals for refresh
    const { data, error } = await supabase
      .from('goals')
      .select(`
        *,
        phases (
          *,
          milestones (
            *,
            tasks (*,
              subtasks (*)
            )
          )
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('[Data] Error loading goals', error);
      return;
    }

    // Goals loaded from DB
    setGoals(data?.map(transformGoalFromDb) || []);
  }, [authUser]);

  const refreshEvents = useCallback(async (userIdOverride?: string) => {
    const userId = userIdOverride || authUser?.id;
    if (!userId) return;

    // Load events for next 12 months (extended from 3 to support longer goals)
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 1);
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 12); // Extended from 3 to 12 months

    logger.debug('[Data] Refreshing events', {
      userId,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    });

    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('user_id', userId)
      .gte('start_datetime', startDate.toISOString())
      .lte('end_datetime', endDate.toISOString())
      .order('start_datetime', { ascending: true });

    if (error) {
      logger.error('[Data] Error loading events', error);
      return;
    }

    logger.debug('[Data] Loaded events from DB', { count: data?.length || 0 });
    if (data && data.length > 0) {
      logger.debug('[Data] Sample event goal_id', { goalId: data[0].goal_id });
    }

    setCalendarEvents(data?.map(transformEventFromDb) || []);
  }, [authUser]);

  // =============================================================================
  // AUTH ACTIONS
  // =============================================================================

  const mapAuthErrorMessage = (rawError: unknown): string => {
    const message = (() => {
      if (typeof rawError === 'string') return rawError;
      if (rawError && typeof rawError === 'object' && 'message' in rawError) {
        const maybeMessage = (rawError as { message?: unknown }).message;
        if (typeof maybeMessage === 'string') return maybeMessage;
      }
      return '';
    })();

    if (!message) {
      return 'Authentication failed. Please try again.';
    }

    if (
      message.includes('Failed to fetch') ||
      message.includes('NetworkError') ||
      message.includes('ERR_CONNECTION_REFUSED')
    ) {
      return 'Cannot reach Supabase Auth. Check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY and confirm the project is reachable.';
    }

    return message;
  };

  const signUp = async (email: string, password: string, name: string) => {
    let data: any = null;
    let error: any = null;

    try {
      const response = await auth.signUp(email, password, name);
      data = response.data;
      error = response.error;
    } catch (err) {
      const normalizedError = mapAuthErrorMessage(err);
      return { error: normalizedError, needsEmailVerification: false };
    }

    // Handle specific error cases
    if (error) {
      const normalizedError = mapAuthErrorMessage(error);

      // 422 typically means user already exists or email not confirmed
      if (normalizedError.includes('already registered')) {
        return {
          error: 'This email is already registered. Please sign in instead.',
          needsEmailVerification: false
        };
      }
      if (normalizedError.includes('email') && normalizedError.includes('confirm')) {
        return {
          error: 'Please check your email and verify your account.',
          needsEmailVerification: true
        };
      }
      return { error: normalizedError, needsEmailVerification: false };
    }

    // Check if email confirmation is required
    // Supabase returns user but with identities empty when email confirmation is pending
    if (data?.user && !data.session) {
      return {
        error: null,
        needsEmailVerification: true,
        message: 'Please check your email to verify your account before signing in.'
      };
    }

    return { error: null, needsEmailVerification: false };
  };

  const signIn = async (email: string, password: string) => {
    let error: any = null;
    try {
      const response = await auth.signIn(email, password);
      error = response.error;
    } catch (err) {
      const normalizedError = mapAuthErrorMessage(err);
      return { error: normalizedError, needsEmailVerification: false };
    }

    if (error) {
      const normalizedError = mapAuthErrorMessage(error);

      // Handle specific Supabase auth errors
      if (normalizedError.includes('Email not confirmed')) {
        return {
          error: 'Please verify your email address before signing in. Check your inbox for a verification link.',
          needsEmailVerification: true
        };
      }
      if (normalizedError.includes('Invalid login credentials')) {
        return {
          error: 'Invalid email or password. Please check your credentials and try again.',
          needsEmailVerification: false
        };
      }
      return { error: normalizedError, needsEmailVerification: false };
    }

    return { error: null, needsEmailVerification: false };
  };

  const signInWithGoogle = async () => {
    const { error } = await auth.signInWithGoogle();
    return { error: error?.message || null };
  };

  const signOut = async () => {
    // Set flag to prevent persistence effects from writing back to storage
    isSigningOutRef.current = true;

    // Clear cache immediately to prevent zombie sessions
    clearCachedData(storage);
    clearCachedData(backupStorage);

    await auth.signOut();
  };

  const setStorageMode = useCallback((mode: StorageMode) => {
    if (mode === storageMode) return;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_MODE_KEY, mode);
    }

    const nextStorage = mode === 'local' ? localStorage : sessionStorage;
    const previousStorage = mode === 'local' ? sessionStorage : localStorage;

    clearCachedData(nextStorage);
    if (user) nextStorage.setItem('dlulu_profile', JSON.stringify(user));
    if (constraints) nextStorage.setItem('dlulu_constraints', JSON.stringify(constraints));
    nextStorage.setItem('dlulu_goals', JSON.stringify(goals));
    nextStorage.setItem('dlulu_events', JSON.stringify(calendarEvents));

    clearCachedData(previousStorage);
    setStorageModeState(mode);
  }, [storageMode, user, constraints, goals, calendarEvents]);

  const resetPassword = async (email: string) => {
    const { error } = await auth.resetPassword(email);
    return { error: error?.message || null };
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await auth.updatePassword(newPassword);
    return { error: error?.message || null };
  };

  // =============================================================================
  // PROFILE ACTIONS
  // =============================================================================

  const updateProfile = useCallback(async (updates: Partial<UserProfile>) => {
    if (!authUser) return;

    const dbUpdates: any = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.role !== undefined) dbUpdates.role = updates.role;
    if (updates.roleContext !== undefined) dbUpdates.role_context = updates.roleContext;
    if (updates.bio !== undefined) dbUpdates.bio = updates.bio;
    if (updates.chronotype !== undefined) dbUpdates.chronotype = updates.chronotype;
    if (updates.workStyle !== undefined) {
      const normalizedWorkStyle = updates.workStyle === 'balanced' ? 'flow' : updates.workStyle;
      dbUpdates.work_style = normalizedWorkStyle;
    }
    if (updates.energyLevel !== undefined) dbUpdates.energy_level = updates.energyLevel;
    if (updates.userPreferences !== undefined) dbUpdates.user_preferences = updates.userPreferences;

    const { error } = await supabase
      .from('profiles')
      .update(dbUpdates)
      .eq('id', authUser.id);

    if (error) {
      logger.error('Error updating profile', error);
      return;
    }

    // Optimistic update
    setUser(prev => prev ? { ...prev, ...updates } : null);
  }, [authUser]);

  const updateConstraints = useCallback(async (updates: Partial<TimeConstraints>) => {
    if (!authUser) return;

    const dbUpdates: any = {};
    if (updates.sleepStart !== undefined) dbUpdates.sleep_start = updates.sleepStart;
    if (updates.sleepEnd !== undefined) dbUpdates.sleep_end = updates.sleepEnd;
    if (updates.peakStart !== undefined) dbUpdates.peak_start = updates.peakStart;
    if (updates.peakEnd !== undefined) dbUpdates.peak_end = updates.peakEnd;

    // Upsert constraints
    const { error } = await supabase
      .from('time_constraints')
      .upsert({ user_id: authUser.id, ...dbUpdates }, { onConflict: 'user_id' });

    if (error) {
      logger.error('Error updating constraints', error);
      return;
    }

    // Save work blocks to time_blocks table
    if (updates.workBlocks !== undefined) {
      // First, delete existing work blocks for this user
      await supabase
        .from('time_blocks')
        .delete()
        .eq('user_id', authUser.id)
        .eq('block_type', 'work');

      if (updates.workBlocks.length > 0) {
        // Insert new work blocks
        const workBlocksToInsert = updates.workBlocks.map(block => ({
          user_id: authUser.id,
          block_type: 'work',
          title: block.title || 'Work Hours',
          days: block.days || [0, 1, 2, 3, 4], // Default weekdays (Mon-Fri, dlulu indexing: 0=Mon)
          start_time: block.start || '09:00',
          end_time: block.end || '17:00',
          is_flexible: block.isFlexible || false,
          week_pattern: block.weekPattern || 'default',
          timezone: block.timezone || null,
        }));

        const { error: workError } = await supabase
          .from('time_blocks')
          .insert(workBlocksToInsert as any);

        if (workError) {
          logger.error('Error saving work blocks', workError);
        } else {
          // Work blocks saved
        }
      }
    }

    // Save blocked slots to time_blocks table
    if (updates.blockedSlots !== undefined) {
      // First, delete existing blocked slots for this user
      await supabase
        .from('time_blocks')
        .delete()
        .eq('user_id', authUser.id)
        .neq('block_type', 'work');

      if (updates.blockedSlots.length > 0) {
        // Insert new blocked slots
        const blockedSlotsToInsert = updates.blockedSlots.map(block => ({
          user_id: authUser.id,
          block_type: block.type || 'blocked',
          title: block.title || 'Blocked Time',
          days: block.days && block.days.length > 0 ? block.days : [0, 1, 2, 3, 4], // Default weekdays (Mon-Fri, dlulu indexing: 0=Mon)
          start_time: block.start || '00:00',
          end_time: block.end || '00:00',
          is_flexible: block.isFlexible || false,
          week_pattern: block.weekPattern || 'default',
          timezone: block.timezone || null,
        }));

        const { error: blockedError } = await supabase
          .from('time_blocks')
          .insert(blockedSlotsToInsert as any);

        if (blockedError) {
          logger.error('Error saving blocked slots', blockedError);
        } else {
          // Blocked slots saved
        }
      }
    }

    // Save time exceptions (date-specific overrides)
    if (updates.timeExceptions !== undefined) {
      await (supabase as any)
        .from('time_exceptions')
        .delete()
        .eq('user_id', authUser.id);

      if (updates.timeExceptions.length > 0) {
        const exceptionsToInsert = updates.timeExceptions.map(ex => ({
          user_id: authUser.id,
          date: ex.date,
          start_time: ex.start || '00:00',
          end_time: ex.end || '00:00',
          is_blocked: ex.isBlocked !== false,
          reason: ex.reason || null,
        }));

        const { error: exceptionError } = await (supabase as any)
          .from('time_exceptions')
          .insert(exceptionsToInsert);

        if (exceptionError) {
          logger.error('Error saving time exceptions', exceptionError);
        }
      }
    }

    setConstraints(prev => prev ? { ...prev, ...updates } : null);
  }, [authUser]);

  // =============================================================================
  // GOAL ACTIONS
  // =============================================================================

  const createGoal = useCallback(async (goal: Partial<Goal>): Promise<Goal | null> => {
    if (!authUser) return null;

    // Valid category values for the goal_category enum in PostgreSQL
    const VALID_CATEGORIES = ['health', 'career', 'learning', 'personal', 'financial', 'relationships'];

    // Validate and map category to a valid enum value
    let validCategory = goal.category?.toLowerCase() || 'personal';
    if (!VALID_CATEGORIES.includes(validCategory)) {
      // Map common AI-generated categories to valid ones
      const categoryMap: Record<string, string> = {
        'housing': 'financial', 'home': 'financial', 'real_estate': 'financial', 'property': 'financial',
        'fitness': 'health', 'wellness': 'health', 'exercise': 'health', 'nutrition': 'health',
        'education': 'learning', 'skill': 'learning', 'skills': 'learning', 'study': 'learning',
        'professional': 'career', 'work': 'career', 'business': 'career', 'job': 'career',
        'social': 'relationships', 'family': 'relationships', 'dating': 'relationships',
        'self': 'personal', 'growth': 'personal', 'mindset': 'personal', 'lifestyle': 'personal',
        'money': 'financial', 'wealth': 'financial', 'investment': 'financial', 'savings': 'financial',
        'habit': 'personal', 'habits': 'personal', 'routine': 'personal', 'productivity': 'personal',
        'mental': 'health', 'mental_health': 'health', 'emotional': 'personal', 'spiritual': 'personal',
        'creative': 'personal', 'creativity': 'personal', 'art': 'personal', 'music': 'personal',
        'communication': 'personal', 'language': 'learning', 'writing': 'learning',
        'entrepreneurship': 'career', 'startup': 'career', 'side_hustle': 'career',
      };
      validCategory = categoryMap[validCategory] || 'personal';
      // Mapped invalid category to valid one
    }

    // Valid energy_cost values for the priority_level enum
    const VALID_ENERGY_COSTS = ['high', 'medium', 'low'];
    let validEnergyCost = goal.energyCost?.toLowerCase() || 'medium';
    if (!VALID_ENERGY_COSTS.includes(validEnergyCost)) {
      // Map common AI-generated energy levels to valid ones
      const energyMap: Record<string, string> = {
        'moderate': 'medium', 'normal': 'medium', 'average': 'medium', 'standard': 'medium',
        'intense': 'high', 'demanding': 'high', 'challenging': 'high', 'difficult': 'high',
        'easy': 'low', 'light': 'low', 'minimal': 'low', 'simple': 'low', 'relaxed': 'low',
      };
      validEnergyCost = energyMap[validEnergyCost] || 'medium';
      // Mapped invalid energy_cost to valid one
    }

    // Validate preferred_time
    const VALID_TIMES = ['morning', 'afternoon', 'evening', 'flexible'];
    let validPreferredTime = goal.preferredTime?.toLowerCase() || 'flexible';
    if (!VALID_TIMES.includes(validPreferredTime)) {
      validPreferredTime = 'flexible';
      // Mapped invalid preferred_time to flexible
    }

    // Validate frequency (1-7)
    let validFrequency = goal.frequency || 3;
    if (validFrequency < 1) validFrequency = 1;
    if (validFrequency > 7) validFrequency = 7;

    // Validate duration (15-180)
    let validDuration = goal.duration || 60;
    if (validDuration < 15) validDuration = 15;
    if (validDuration > 180) validDuration = 180;

    const { data, error } = await supabase
      .from('goals')
      .insert({
        user_id: authUser.id,
        title: goal.title,
        original_input: goal.originalInput,
        category: validCategory,
        timeline: goal.timeline,
        estimated_weeks: goal.estimatedWeeks,
        strategy_overview: goal.strategyOverview,
        critical_gaps: goal.criticalGaps,
        overview_generated: goal.overviewGenerated ?? false,
        behavior_plan: goal.behaviorPlan || {},
        priority_weight: goal.priorityWeight ?? 50,
        risk_level: goal.riskLevel || 'low',
        risk_acknowledged_at: goal.riskAcknowledgedAt || null,
        intake_questions: goal.intakeQuestions ?? null,
        intake_answers: goal.intakeAnswers ?? null,
        intake_summary: goal.intakeSummary ?? null,
        intake_schema_version: goal.intakeSchemaVersion ?? null,
        intake_updated_at: goal.intakeUpdatedAt ?? null,
        preferred_time: validPreferredTime,
        frequency: validFrequency,
        duration: validDuration,
        energy_cost: validEnergyCost,
        preferred_days: goal.preferredDays,
        status: (goal.status || 'planning') as any,
      } as any)
      .select()
      .single();

    if (error) {
      logger.error('[Data] createGoal: FAILED', error, {
        goalTitle: goal.title,
        originalCategory: goal.category,
        validatedCategory: validCategory,
        originalEnergyCost: goal.energyCost,
        validatedEnergyCost: validEnergyCost,
        errorCode: error.code,
        errorMessage: error.message,
        errorDetails: error.details,
        errorHint: error.hint,
      });
      return null;
    }

    const newGoal = transformGoalFromDb(data);
    setGoals(prev => [newGoal, ...prev]);
    return newGoal;
  }, [authUser]);

  const updateGoal = useCallback(async (goalId: string, updates: Partial<Goal>) => {
    const dbUpdates: any = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.strategyOverview !== undefined) dbUpdates.strategy_overview = updates.strategyOverview;
    if (updates.criticalGaps !== undefined) dbUpdates.critical_gaps = updates.criticalGaps;
    if (updates.overviewGenerated !== undefined) dbUpdates.overview_generated = updates.overviewGenerated;
    if (updates.behaviorPlan !== undefined) dbUpdates.behavior_plan = updates.behaviorPlan;
    if (updates.priorityWeight !== undefined) dbUpdates.priority_weight = updates.priorityWeight;
    if (updates.riskLevel !== undefined) dbUpdates.risk_level = updates.riskLevel;
    if (updates.riskAcknowledgedAt !== undefined) dbUpdates.risk_acknowledged_at = updates.riskAcknowledgedAt;
    if (updates.intakeQuestions !== undefined) dbUpdates.intake_questions = updates.intakeQuestions;
    if (updates.intakeAnswers !== undefined) dbUpdates.intake_answers = updates.intakeAnswers;
    if (updates.intakeSummary !== undefined) dbUpdates.intake_summary = updates.intakeSummary;
    if (updates.intakeSchemaVersion !== undefined) dbUpdates.intake_schema_version = updates.intakeSchemaVersion;
    if (updates.intakeUpdatedAt !== undefined) dbUpdates.intake_updated_at = updates.intakeUpdatedAt;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.overallProgress !== undefined) dbUpdates.overall_progress = updates.overallProgress;
    if (updates.currentPhaseIndex !== undefined) dbUpdates.current_phase_index = updates.currentPhaseIndex;
    if (updates.isScheduled !== undefined) dbUpdates.is_scheduled = updates.isScheduled;
    if (updates.preferredTime !== undefined) dbUpdates.preferred_time = updates.preferredTime;
    if (updates.frequency !== undefined) dbUpdates.frequency = updates.frequency;
    if (updates.duration !== undefined) dbUpdates.duration = updates.duration;
    if (updates.energyCost !== undefined) dbUpdates.energy_cost = updates.energyCost;
    if (updates.preferredDays !== undefined) dbUpdates.preferred_days = updates.preferredDays;

    const { error } = await supabase
      .from('goals')
      .update(dbUpdates)
      .eq('id', goalId);

    if (error) {
      logger.error('Error updating goal', error);
      return;
    }

    // Optimistic update
    setGoals(prev => prev.map(g => g.id === goalId ? { ...g, ...updates } : g));
  }, []);

  const deleteGoal = useCallback(async (goalId: string) => {
    const { error } = await supabase
      .from('goals')
      .delete()
      .eq('id', goalId);

    if (error) {
      logger.error('Error deleting goal', error);
      return;
    }

    setGoals(prev => prev.filter(g => g.id !== goalId));
  }, []);

  const updateGoalStatus = useCallback(async (goalId: string, status: Goal['status']) => {
    const updates: any = { status };
    if (status === 'completed') {
      updates.overall_progress = 100;
    }
    await updateGoal(goalId, updates);
  }, [updateGoal]);

  // =============================================================================
  // PHASE ACTIONS
  // =============================================================================

  const createPhase = useCallback(async (goalId: string, phase: Partial<Phase>): Promise<Phase | null> => {
    if (!authUser) return null;

    const { data, error } = await supabase
      .from('phases')
      .insert({
        user_id: authUser.id,
        goal_id: goalId,
        phase_number: phase.number || 1,
        title: phase.title,
        description: phase.description,
        start_week: phase.startWeek || 1,
        end_week: phase.endWeek || 4,
        estimated_duration: phase.estimatedDuration,
        focus: phase.focus,
        coach_advice: phase.coachAdvice,
        status: phase.status || 'upcoming',
      })
      .select()
      .single();

    if (error) {
      logger.error('[Data] Error creating phase', error);
      return null;
    }

    // Phase created
    // Don't refresh here - caller will refresh after all phases are created
    // Return raw data - caller should use the ID for linking, not the full typed object
    return data as any;
  }, [authUser]);

  const updatePhase = useCallback(async (phaseId: string, updates: Partial<Phase>) => {
    const dbUpdates: any = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.progress !== undefined) dbUpdates.progress = updates.progress;
    if (updates.coachAdvice !== undefined) dbUpdates.coach_advice = updates.coachAdvice;

    const { error } = await supabase
      .from('phases')
      .update(dbUpdates)
      .eq('id', phaseId);

    if (error) {
      logger.error('Error updating phase', error);
      return;
    }

    await refreshGoals();
  }, [refreshGoals]);

  const deletePhase = useCallback(async (phaseId: string) => {
    const { error } = await supabase
      .from('phases')
      .delete()
      .eq('id', phaseId);

    if (error) {
      logger.error('Error deleting phase', error);
      return;
    }

    await refreshGoals();
  }, [refreshGoals]);

  // =============================================================================
  // MILESTONE ACTIONS
  // =============================================================================

  const createMilestone = useCallback(async (
    phaseId: string,
    goalId: string,
    milestone: Partial<Milestone>
  ): Promise<Milestone | null> => {
    if (!authUser) return null;

    const { data, error } = await supabase
      .from('milestones')
      .insert({
        user_id: authUser.id,
        phase_id: phaseId,
        goal_id: goalId,
        title: milestone.title,
        description: milestone.description,
        display_order: milestone.order || 0,
        target_week: milestone.targetWeek,
      })
      .select()
      .single();

    if (error) {
      logger.error('[Data] Error creating milestone', error);
      return null;
    }

    // Milestone created
    // Don't refresh here - caller will refresh after all milestones are created
    // Return raw data - caller should use the ID for linking, not the full typed object
    return data as any;
  }, [authUser]);

  const updateMilestone = useCallback(async (milestoneId: string, updates: Partial<Milestone>) => {
    const dbUpdates: any = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.isCompleted !== undefined) {
      dbUpdates.is_completed = updates.isCompleted;
      dbUpdates.completed_at = updates.isCompleted ? new Date().toISOString() : null;
    }
    if (updates.userNotes !== undefined) dbUpdates.user_notes = updates.userNotes;

    const { error } = await supabase
      .from('milestones')
      .update(dbUpdates)
      .eq('id', milestoneId);

    if (error) {
      logger.error('Error updating milestone', error);
      return;
    }

    // CASCADE UP: Check if all milestones in the goal are complete
    if (updates.isCompleted === true) {
      // Get the milestone's goal_id
      const { data: milestoneData } = await supabase
        .from('milestones')
        .select('goal_id')
        .eq('id', milestoneId)
        .single();

      if (milestoneData?.goal_id) {
        // Get all milestones for this goal
        const { data: allMilestones } = await supabase
          .from('milestones')
          .select('id, is_completed')
          .eq('goal_id', milestoneData.goal_id);

        if (allMilestones && allMilestones.length > 0) {
          const completedCount = allMilestones.filter(m => m.is_completed).length;
          const totalCount = allMilestones.length;
          const progress = Math.round((completedCount / totalCount) * 100);

          // Update goal progress
          const goalUpdates: any = { overall_progress: progress };

          // If all milestones complete, mark goal as completed
          if (completedCount === totalCount) {
            goalUpdates.status = 'completed';
            // All milestones complete - marking goal as completed
          }

          await supabase
            .from('goals')
            .update(goalUpdates)
            .eq('id', milestoneData.goal_id);
        }
      }
    }

    await refreshGoals();
  }, [refreshGoals]);

  const toggleMilestone = useCallback(async (milestoneId: string) => {
    // Get current state
    const { data } = await supabase
      .from('milestones')
      .select('is_completed')
      .eq('id', milestoneId)
      .single();

    if (data) {
      await updateMilestone(milestoneId, { isCompleted: !data.is_completed });
    }
  }, [updateMilestone]);

  const deleteMilestone = useCallback(async (milestoneId: string) => {
    const { error } = await supabase
      .from('milestones')
      .delete()
      .eq('id', milestoneId);

    if (error) {
      logger.error('Error deleting milestone', error);
      return;
    }

    await refreshGoals();
  }, [refreshGoals]);

  // =============================================================================
  // TASK ACTIONS (NEW: layer between milestone and subtask)
  // =============================================================================

  const createTask = useCallback(async (
    milestoneId: string,
    task: Partial<Task>
  ): Promise<Task | null> => {
    if (!authUser) return null;

    // First, get the milestone to find phase_id and goal_id
    const { data: milestoneData } = await supabase
      .from('milestones')
      .select('phase_id, goal_id')
      .eq('id', milestoneId)
      .single();

    // Note: Using 'any' cast because tasks table may not be in generated types yet
    const { data, error } = await (supabase as any)
      .from('tasks')
      .insert({
        user_id: authUser.id,
        milestone_id: milestoneId,
        phase_id: milestoneData?.phase_id || task.phaseId,
        goal_id: milestoneData?.goal_id || task.goalId,
        title: task.title,
        description: task.description,
        display_order: task.order || 0,
        start_day: task.startDay,
        end_day: task.endDay,
        duration_days: task.durationDays,
        times_per_week: task.timesPerWeek,
        difficulty: task.difficulty,
        cognitive_type: task.cognitiveType,
        estimated_minutes: task.estimatedMinutes,
      })
      .select()
      .single();

    if (error) {
      logger.error('[Data] Error creating task', error);
      return null;
    }

    // Task created
    // Don't refresh here - caller will refresh after all tasks are created
    return data as Task;
  }, [authUser]);

  const updateTask = useCallback(async (taskId: string, updates: Partial<Task>) => {
    const dbUpdates: any = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.isCompleted !== undefined) {
      dbUpdates.is_completed = updates.isCompleted;
      dbUpdates.completed_at = updates.isCompleted ? new Date().toISOString() : null;
    }
    if (updates.isStrikethrough !== undefined) dbUpdates.is_strikethrough = updates.isStrikethrough;
    if (updates.strikethroughReason !== undefined) dbUpdates.strikethrough_reason = updates.strikethroughReason;
    if (updates.order !== undefined) dbUpdates.display_order = updates.order;
    if (updates.startDay !== undefined) dbUpdates.start_day = updates.startDay;
    if (updates.endDay !== undefined) dbUpdates.end_day = updates.endDay;
    if (updates.durationDays !== undefined) dbUpdates.duration_days = updates.durationDays;
    if (updates.timesPerWeek !== undefined) dbUpdates.times_per_week = updates.timesPerWeek;
    if (updates.difficulty !== undefined) dbUpdates.difficulty = updates.difficulty;
    if (updates.cognitiveType !== undefined) dbUpdates.cognitive_type = updates.cognitiveType;
    if (updates.estimatedMinutes !== undefined) dbUpdates.estimated_minutes = updates.estimatedMinutes;

    // Note: Using 'any' cast because tasks table may not be in generated types yet
    const { error } = await (supabase as any)
      .from('tasks')
      .update(dbUpdates)
      .eq('id', taskId);

    if (error) {
      logger.error('Error updating task', error);
      return;
    }

    await refreshGoals();
  }, [refreshGoals]);

  const setTaskCompletion = useCallback(async (taskId: string, completed: boolean) => {
    const completedAt = completed ? new Date().toISOString() : null;

    const { error: taskError } = await (supabase as any)
      .from('tasks')
      .update({ is_completed: completed, completed_at: completedAt })
      .eq('id', taskId);

    if (taskError) {
      logger.error('Error updating task completion', taskError);
      return;
    }

    const { error: subtaskError } = await (supabase as any)
      .from('subtasks')
      .update({ is_completed: completed, completed_at: completedAt })
      .eq('task_id', taskId);

    if (subtaskError) {
      logger.error('Error updating subtasks completion', subtaskError, { taskId });
    }

    await refreshGoals();
  }, [refreshGoals]);

  const toggleTask = useCallback(async (taskId: string) => {
    // Note: Using 'any' cast because tasks table may not be in generated types yet
    const { data } = await (supabase as any)
      .from('tasks')
      .select('is_completed')
      .eq('id', taskId)
      .single();

    if (data) {
      await setTaskCompletion(taskId, !data.is_completed);
    }
  }, [setTaskCompletion]);

  const deleteTask = useCallback(async (taskId: string) => {
    // Note: Using 'any' cast because tasks table may not be in generated types yet
    const { error } = await (supabase as any)
      .from('tasks')
      .delete()
      .eq('id', taskId);

    if (error) {
      logger.error('Error deleting task', error);
      return;
    }

    await refreshGoals();
  }, [refreshGoals]);

  // =============================================================================
  // SUBTASK ACTIONS
  // =============================================================================

  const createSubTask = useCallback(async (
    taskId: string,
    subtaskData: { title: string; order?: number; isManual?: boolean }
  ): Promise<SubTask | null> => {
    if (!authUser) return null;

    // Simplified: taskId is now required (no more legacy milestone support)
    // Get the task to find its milestone_id
    const { data: taskData } = await (supabase as any)
      .from('tasks')
      .select('id, milestone_id')
      .eq('id', taskId)
      .single();

    if (!taskData) {
      logger.error('[Data] Error: Task not found', new Error('Task not found'), { taskId });
      return null;
    }

    // Build insert data - task_id is now required
    const insertData: any = {
      user_id: authUser.id,
      task_id: taskId,
      milestone_id: taskData.milestone_id,
      title: subtaskData.title,
      display_order: subtaskData.order ?? 0,
      is_manual: subtaskData.isManual ?? false,
    };

    // Insert into subtasks table
    const { data, error } = await supabase
      .from('subtasks')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      logger.error('Error creating subtask', error);
      return null;
    }

    // Don't refresh here - caller will refresh after all subtasks are created
    return data as SubTask;
  }, [authUser]);

  const updateSubTask = useCallback(async (subtaskId: string, updates: Partial<SubTask>) => {
    const dbUpdates: any = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.isCompleted !== undefined) {
      dbUpdates.is_completed = updates.isCompleted;
      dbUpdates.completed_at = updates.isCompleted ? new Date().toISOString() : null;
    }
    if (updates.isStrikethrough !== undefined) dbUpdates.is_strikethrough = updates.isStrikethrough;
    if (updates.strikethroughReason !== undefined) dbUpdates.strikethrough_reason = updates.strikethroughReason;

    const { error } = await supabase
      .from('subtasks')
      .update(dbUpdates)
      .eq('id', subtaskId);

    if (error) {
      logger.error('Error updating subtask', error);
      return;
    }

    await refreshGoals();
  }, [refreshGoals]);

  const toggleSubTask = useCallback(async (subtaskId: string) => {
    // Note: Using 'any' cast because the subtasks table may not be in generated types yet
    const { data } = await (supabase as any)
      .from('subtasks')
      .select('is_completed')
      .eq('id', subtaskId)
      .single();

    if (data) {
      await updateSubTask(subtaskId, { isCompleted: !data.is_completed });
    }
  }, [updateSubTask]);

  const deleteSubTask = useCallback(async (subtaskId: string) => {
    const { error } = await supabase
      .from('subtasks')
      .delete()
      .eq('id', subtaskId);

    if (error) {
      logger.error('Error deleting subtask', error);
      return;
    }

    await refreshGoals();
  }, [refreshGoals]);

  // =============================================================================
  // CALENDAR EVENT ACTIONS
  // =============================================================================

  const resolveCalendarEventField = <T>(
    fieldName: string,
    topLevelValue: T | undefined,
    legacyValue: T | undefined
  ): T | undefined => {
    if (topLevelValue !== undefined && legacyValue !== undefined && topLevelValue !== legacyValue) {
      throw new Error(`[CalendarEvent] Conflicting values for "${fieldName}" (top-level vs ambitionOsMeta).`);
    }
    return topLevelValue ?? legacyValue;
  };

  const toLocalDateString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const buildCalendarEventItems = (
    eventId: string,
    eventData: Partial<CalendarEvent> & {
      goalId?: string;
      phaseId?: string;
      milestoneId?: string;
      taskId?: string;
      subtaskId?: string;
      task_ids?: string[];
      subtask_ids?: string[];
    }
  ) => {
    const base = {
      calendar_event_id: eventId,
      goal_id: eventData.goalId || null,
      phase_id: eventData.phaseId || null,
      milestone_id: eventData.milestoneId || null,
    };

    const items: any[] = [];
    const pushItem = (taskId?: string, subtaskId?: string) => {
      if (!taskId && !subtaskId) return;
      items.push({
        ...base,
        task_id: taskId || null,
        subtask_id: subtaskId || null,
        display_order: items.length,
      });
    };

    if (eventData.taskId || eventData.subtaskId) {
      pushItem(eventData.taskId, eventData.subtaskId);
    }

    if (Array.isArray(eventData.task_ids)) {
      eventData.task_ids.forEach(taskId => pushItem(taskId, undefined));
    }

    if (Array.isArray(eventData.subtask_ids)) {
      eventData.subtask_ids.forEach(subtaskId => pushItem(undefined, subtaskId));
    }

    return items;
  };

  const createEvent = useCallback(async (event: Partial<CalendarEvent>): Promise<CalendarEvent | null> => {
    if (!authUser) return null;

    if (!event.summary) {
      throw new Error('[CalendarEvent] createEvent requires "summary".');
    }
    if (!event.start?.dateTime || !event.end?.dateTime) {
      throw new Error('[CalendarEvent] createEvent currently requires start.dateTime and end.dateTime.');
    }

    const goalId = resolveCalendarEventField('goalId', event.goalId, event.ambitionOsMeta?.goalId);
    const phaseId = resolveCalendarEventField('phaseId', event.phaseId, event.ambitionOsMeta?.phaseId);
    const milestoneId = resolveCalendarEventField('milestoneId', event.milestoneId, event.ambitionOsMeta?.milestoneId);

    const eventType = resolveCalendarEventField('eventType', event.eventType, event.ambitionOsMeta?.eventType) || 'task';
    const priority = resolveCalendarEventField('priority', event.priority, event.ambitionOsMeta?.priority) || 'medium';
    const energyCost = resolveCalendarEventField('energyCost', event.energyCost, event.ambitionOsMeta?.energyCost) || 'medium';
    const status = resolveCalendarEventField('status', event.status, event.ambitionOsMeta?.status) || 'scheduled';
    const rationale = resolveCalendarEventField('rationale', event.rationale, event.ambitionOsMeta?.rationale);
    const isAllDay = !!event.isAllDay || (!!event.start?.date && !event.start?.dateTime);

    // Convert datetime strings to proper UTC ISO format
    // This fixes the "time is broken" issue where local times were interpreted as UTC
    const startDateTimeUtc = localToUtcIso(event.start.dateTime);
    const endDateTimeUtc = localToUtcIso(event.end.dateTime);

    const deriveAllocationType = () => {
      if (event.allocationType) return event.allocationType;
      if (event.eventType === 'habit') return 'habit_instance';
      if (event.eventType === 'milestone_deadline') return 'milestone_deadline';
      if (event.eventType === 'blocked') return 'blocked';
      if (event.source === 'ambitionos' || event.eventType === 'goal_session') return 'task_session';
      return 'manual';
    };

    const computedDurationMinutes = (() => {
      if (event.durationMinutes !== undefined) return event.durationMinutes;
      if (!startDateTimeUtc || !endDateTimeUtc) return undefined;
      const startMs = new Date(startDateTimeUtc).getTime();
      const endMs = new Date(endDateTimeUtc).getTime();
      if (Number.isNaN(startMs) || Number.isNaN(endMs)) return undefined;
      return Math.max(1, Math.round((endMs - startMs) / (1000 * 60)));
    })();

    let startDateOnly: string | null = null;
    let endDateOnly: string | null = null;

    if (isAllDay) {
      if (event.start?.date) {
        startDateOnly = event.start.date;
      } else if (startDateTimeUtc) {
        startDateOnly = toLocalDateString(new Date(startDateTimeUtc));
      }

      if (event.end?.date) {
        endDateOnly = event.end.date;
      } else if (endDateTimeUtc) {
        endDateOnly = toLocalDateString(new Date(endDateTimeUtc));
      }

      if (startDateOnly) {
        const startDate = new Date(`${startDateOnly}T00:00:00`);
        let endDate = endDateOnly ? new Date(`${endDateOnly}T00:00:00`) : null;
        if (!endDate || endDate.getTime() <= startDate.getTime()) {
          endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + 1);
        }
        endDateOnly = toLocalDateString(endDate);
      }
    }

    const createPayload = {
      user_id: authUser.id,
      summary: event.summary,
      description: event.description,
      location: event.location,
      start_datetime: startDateTimeUtc,
      end_datetime: endDateTimeUtc,
      start_date: isAllDay ? startDateOnly : null,
      end_date: isAllDay ? endDateOnly : null,
      timezone: event.start.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      is_all_day: isAllDay,

      // Links
      goal_id: goalId,
      phase_id: phaseId,
      milestone_id: milestoneId,
      roadmap_task_id: event.roadmapTaskId,

      // Classification
      event_type: eventType,
      priority,
      energy_cost: energyCost,
      status,
      rationale,

      // Recurrence
      is_recurring: !!event.isRecurring,
      recurrence_rule: event.isRecurring
        ? {
          rule: event.recurrenceRule || (event.recurrence?.[0]?.replace(/^RRULE:/, '') ?? null),
          recurrence: event.recurrence || [],
        }
        : null,

      // Task linkage (optional)
      task_id: event.taskId,
      subtask_id: event.subtaskId,

      // Allocation & session tracking
      allocation_type: deriveAllocationType(),
      session_index: event.sessionIndex,
      total_sessions: event.totalSessions,
      duration_minutes: computedDurationMinutes,
      effort_minutes_allocated: event.effortMinutesAllocated ?? computedDurationMinutes,


      // Intelligence fields
      difficulty: event.difficulty,
      is_locked: event.isLocked,
      cognitive_type: event.cognitiveType,
      ai_confidence_score: event.aiConfidenceScore,
      scheduling_reasoning: event.schedulingReasoning,
      ai_metadata: event.aiMetadata,

      // Completion tracking
      completed_at: event.completedAt,
      skipped_reason: event.skippedReason,

      // Sync
      source: event.source || 'manual',
      sync_status: event.syncStatus || 'local_only',
      external_event_id: event.externalId,
    };

    const { data, error, droppedColumns } = await retryCalendarEventMutationWithoutMissingColumns<any>(
      'create event',
      createPayload,
      async (payload) => {
        const { data, error } = await supabase
          .from('calendar_events')
          .insert(payload)
          .select()
          .single();
        return { data, error };
      }
    );

    if (droppedColumns.length > 0) {
      markMissingCalendarColumns(droppedColumns);
      logger.warn('[Calendar] Created event with schema fallback (missing columns)', {
        droppedColumns,
        eventSummary: event.summary,
      });
    }

    if (error) {
      logger.error('Error creating event', error, {
        payloadKeys: Object.keys(createPayload),
      });
      return null;
    }

    const newEvent = transformEventFromDb(data);
    const eventItems = buildCalendarEventItems(data.id, {
      goalId,
      phaseId,
      milestoneId,
      taskId: event.taskId,
      subtaskId: event.subtaskId,
      task_ids: (event as any).task_ids,
      subtask_ids: (event as any).subtask_ids,
    });

    if (eventItems.length > 0) {
      const { error: itemsError } = await (supabase as any)
        .from('calendar_event_items')
        .insert(eventItems);

      if (itemsError) {
        logger.error('Error creating calendar event items', itemsError);
      }
    }

    setCalendarEvents(prev => [...prev, newEvent]);
    return newEvent;
  }, [authUser, markMissingCalendarColumns]);

  const updateEvent = useCallback(async (eventId: string, updates: Partial<CalendarEvent>) => {
    const dbUpdates: any = {};
    if (updates.summary !== undefined) dbUpdates.summary = updates.summary;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.location !== undefined) dbUpdates.location = updates.location;

    // Timing - convert to proper UTC ISO format
    const nextStartUtc = updates.start?.dateTime !== undefined ? localToUtcIso(updates.start.dateTime) : undefined;
    const nextEndUtc = updates.end?.dateTime !== undefined ? localToUtcIso(updates.end.dateTime) : undefined;
    if (nextStartUtc !== undefined) dbUpdates.start_datetime = nextStartUtc;
    if (nextEndUtc !== undefined) dbUpdates.end_datetime = nextEndUtc;
    if (updates.start?.timeZone !== undefined) dbUpdates.timezone = updates.start.timeZone;
    if (updates.isAllDay !== undefined) dbUpdates.is_all_day = updates.isAllDay;
    if (updates.isAllDay === undefined && (updates.start?.date || updates.end?.date)) {
      dbUpdates.is_all_day = true;
    }
    if (updates.durationMinutes !== undefined) dbUpdates.duration_minutes = updates.durationMinutes;
    if (updates.effortMinutesAllocated !== undefined) dbUpdates.effort_minutes_allocated = updates.effortMinutesAllocated;

    const shouldUpdateAllDayDates = (
      updates.isAllDay !== undefined ||
      updates.start?.date !== undefined ||
      updates.end?.date !== undefined
    );

    if (updates.isAllDay === false) {
      dbUpdates.start_date = null;
      dbUpdates.end_date = null;
    } else if (shouldUpdateAllDayDates) {
      let startDateOnly = updates.start?.date ?? (nextStartUtc ? toLocalDateString(new Date(nextStartUtc)) : null);
      let endDateOnly = updates.end?.date ?? (nextEndUtc ? toLocalDateString(new Date(nextEndUtc)) : null);

      if (startDateOnly) {
        const startDate = new Date(`${startDateOnly}T00:00:00`);
        let endDate = endDateOnly ? new Date(`${endDateOnly}T00:00:00`) : null;
        if (!endDate || endDate.getTime() <= startDate.getTime()) {
          endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + 1);
        }
        endDateOnly = toLocalDateString(endDate);
      }

      if (startDateOnly !== null) dbUpdates.start_date = startDateOnly;
      if (endDateOnly !== null) dbUpdates.end_date = endDateOnly;
    }

    if (updates.durationMinutes === undefined && nextStartUtc && nextEndUtc) {
      const startMs = new Date(nextStartUtc).getTime();
      const endMs = new Date(nextEndUtc).getTime();
      if (!Number.isNaN(startMs) && !Number.isNaN(endMs)) {
        dbUpdates.duration_minutes = Math.max(1, Math.round((endMs - startMs) / (1000 * 60)));
      }
    }

    // Links
    if (updates.goalId !== undefined) dbUpdates.goal_id = updates.goalId;
    if (updates.phaseId !== undefined) dbUpdates.phase_id = updates.phaseId;
    if (updates.milestoneId !== undefined) dbUpdates.milestone_id = updates.milestoneId;
    if (updates.roadmapTaskId !== undefined) dbUpdates.roadmap_task_id = updates.roadmapTaskId;
    if (updates.taskId !== undefined) dbUpdates.task_id = updates.taskId;
    if (updates.subtaskId !== undefined) dbUpdates.subtask_id = updates.subtaskId;

    // Classification (top-level or legacy)
    const resolvedStatus = resolveCalendarEventField('status', updates.status, updates.ambitionOsMeta?.status);
    if (resolvedStatus !== undefined) dbUpdates.status = resolvedStatus;

    const resolvedEventType = resolveCalendarEventField('eventType', updates.eventType, updates.ambitionOsMeta?.eventType);
    if (resolvedEventType !== undefined) dbUpdates.event_type = resolvedEventType;

    const resolvedPriority = resolveCalendarEventField('priority', updates.priority, updates.ambitionOsMeta?.priority);
    if (resolvedPriority !== undefined) dbUpdates.priority = resolvedPriority;

    const resolvedEnergyCost = resolveCalendarEventField('energyCost', updates.energyCost, updates.ambitionOsMeta?.energyCost);
    if (resolvedEnergyCost !== undefined) dbUpdates.energy_cost = resolvedEnergyCost;

    const resolvedRationale = resolveCalendarEventField('rationale', updates.rationale, updates.ambitionOsMeta?.rationale);
    if (resolvedRationale !== undefined) dbUpdates.rationale = resolvedRationale;

    // Reschedule tracking (stored in DB as reschedule_count + original_start_datetime)
    const resolvedRescheduleCount = resolveCalendarEventField(
      'rescheduleCount',
      updates.rescheduleCount,
      updates.ambitionOsMeta?.rescheduleCount
    );
    if (resolvedRescheduleCount !== undefined) dbUpdates.reschedule_count = resolvedRescheduleCount;

    const resolvedOriginalStart = resolveCalendarEventField(
      'originalStartDatetime',
      updates.originalStartDatetime,
      updates.ambitionOsMeta?.originalStart
    );
    if (resolvedOriginalStart !== undefined) dbUpdates.original_start_datetime = resolvedOriginalStart;

    if (updates.skippedReason !== undefined) dbUpdates.skipped_reason = updates.skippedReason;
    if (updates.completedAt !== undefined) dbUpdates.completed_at = updates.completedAt;

    // Allocation & session tracking
    if (updates.allocationType !== undefined) dbUpdates.allocation_type = updates.allocationType;
    if (updates.sessionIndex !== undefined) dbUpdates.session_index = updates.sessionIndex;
    if (updates.totalSessions !== undefined) dbUpdates.total_sessions = updates.totalSessions;

    // Intelligence fields
    if (updates.difficulty !== undefined) dbUpdates.difficulty = updates.difficulty;
    if (updates.isLocked !== undefined) dbUpdates.is_locked = updates.isLocked;
    if (updates.cognitiveType !== undefined) dbUpdates.cognitive_type = updates.cognitiveType;
    if (updates.aiConfidenceScore !== undefined) dbUpdates.ai_confidence_score = updates.aiConfidenceScore;
    if (updates.schedulingReasoning !== undefined) dbUpdates.scheduling_reasoning = updates.schedulingReasoning;
    if (updates.aiMetadata !== undefined) dbUpdates.ai_metadata = updates.aiMetadata;

    // Recurrence
    if (updates.isRecurring !== undefined) dbUpdates.is_recurring = updates.isRecurring;
    if (updates.isRecurring === false) dbUpdates.recurrence_rule = null;
    if (updates.recurrenceRule !== undefined || updates.recurrence !== undefined) {
      const rule = updates.recurrenceRule || updates.recurrence?.[0]?.replace(/^RRULE:/, '');
      dbUpdates.recurrence_rule = rule
        ? { rule, recurrence: updates.recurrence || [`RRULE:${rule}`] }
        : null;
    }

    // Sync
    if (updates.source !== undefined) dbUpdates.source = updates.source;
    if (updates.syncStatus !== undefined) dbUpdates.sync_status = updates.syncStatus;
    if (updates.externalId !== undefined) dbUpdates.external_event_id = updates.externalId;

    if (Object.keys(dbUpdates).length === 0) return;

    const { error, droppedColumns } = await retryCalendarEventMutationWithoutMissingColumns<null>(
      'update event',
      dbUpdates,
      async (payload) => {
        const { error } = await supabase
          .from('calendar_events')
          .update(payload)
          .eq('id', eventId);
        return { data: null, error };
      }
    );

    const schemaFallbackMessage = droppedColumns.length > 0
      ? `Calendar schema is missing column(s): ${droppedColumns.join(', ')}. Run latest Supabase migrations to persist all event fields.`
      : null;

    if (droppedColumns.length > 0) {
      markMissingCalendarColumns(droppedColumns);
      logger.warn('[Calendar] Updated event with schema fallback (missing columns)', {
        eventId,
        droppedColumns,
      });
    }

    if (error) {
      logger.error('Error updating event', error, {
        eventId,
        payloadKeys: Object.keys(dbUpdates),
      });
      throw new Error(error?.message || 'Failed to update calendar event.');
    }

    const shouldSyncItems = (
      updates.goalId !== undefined ||
      updates.phaseId !== undefined ||
      updates.milestoneId !== undefined ||
      updates.taskId !== undefined ||
      updates.subtaskId !== undefined ||
      (updates as any).task_ids !== undefined ||
      (updates as any).subtask_ids !== undefined
    );

    if (shouldSyncItems) {
      const { data: updatedEvent } = await supabase
        .from('calendar_events')
        .select('id, goal_id, phase_id, milestone_id, task_id, subtask_id')
        .eq('id', eventId)
        .maybeSingle();

      await (supabase as any)
        .from('calendar_event_items')
        .delete()
        .eq('calendar_event_id', eventId);

      const eventItems = buildCalendarEventItems(eventId, {
        goalId: updates.goalId ?? updatedEvent?.goal_id ?? undefined,
        phaseId: updates.phaseId ?? updatedEvent?.phase_id ?? undefined,
        milestoneId: updates.milestoneId ?? updatedEvent?.milestone_id ?? undefined,
        taskId: updates.taskId ?? updatedEvent?.task_id ?? undefined,
        subtaskId: updates.subtaskId ?? updatedEvent?.subtask_id ?? undefined,
        task_ids: (updates as any).task_ids,
        subtask_ids: (updates as any).subtask_ids,
      });

      if (eventItems.length > 0) {
        const { error: itemsError } = await (supabase as any)
          .from('calendar_event_items')
          .insert(eventItems);

        if (itemsError) {
          logger.error('Error updating calendar event items', itemsError);
        }
      }
    }

    await refreshEvents();

    if (schemaFallbackMessage) {
      throw new Error(schemaFallbackMessage);
    }
  }, [refreshEvents, markMissingCalendarColumns]);

  const deleteEvent = useCallback(async (eventId: string) => {
    const { error } = await supabase
      .from('calendar_events')
      .delete()
      .eq('id', eventId);

    if (error) {
      logger.error('Error deleting event', error);
      return;
    }

    setCalendarEvents(prev => prev.filter(e => e.id !== eventId));
  }, []);

  // Delete all calendar events for a specific goal
  const deleteEventsByGoalId = useCallback(async (goalId: string) => {
    // Deleting all calendar events for goal

    const { error: itemsError } = await (supabase as any)
      .from('calendar_event_items')
      .delete()
      .eq('goal_id', goalId);

    if (itemsError) {
      logger.error('Error deleting calendar event items by goal', itemsError, { goalId });
      return 0;
    }

    const { data: deletedEvents, error } = await supabase
      .from('calendar_events')
      .delete()
      .eq('goal_id', goalId)
      .select();

    if (error) {
      logger.error('Error deleting events by goal', error, { goalId });
      return 0;
    }

    const deletedCount = deletedEvents?.length || 0;
    // Calendar events deleted

    setCalendarEvents(prev => prev.filter(e => e.goalId !== goalId));
    return deletedCount;
  }, []);

  // =============================================================================
  // RETURN
  // =============================================================================

  return {
    // Auth state
    isAuthenticated,
    authUser,
    isLoading,
    error,

    // Data
    user,
    constraints,
    goals,
    calendarEvents,
    calendarSchemaCapabilities,
    storageMode,

    // Auth actions
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    resetPassword,
    updatePassword,

    // Profile actions
    updateProfile,
    updateConstraints,

    // Goal actions
    createGoal,
    updateGoal,
    deleteGoal,
    updateGoalStatus,

    // Phase actions
    createPhase,
    updatePhase,
    deletePhase,

    // Milestone actions
    createMilestone,
    updateMilestone,
    toggleMilestone,
    deleteMilestone,

    // Task actions
    createTask,
    updateTask,
    setTaskCompletion,
    toggleTask,
    deleteTask,

    // SubTask actions
    createSubTask,
    updateSubTask,
    toggleSubTask,
    deleteSubTask,

    // Calendar actions
    createEvent,
    updateEvent,
    deleteEvent,
    deleteEventsByGoalId,

    // Refresh
    refreshGoals,
    refreshEvents,

    setStorageMode,
  };
}
