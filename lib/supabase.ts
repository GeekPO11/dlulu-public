// =============================================================================
// SUPABASE CLIENT CONFIGURATION
// Main Supabase client for the Delulu Life application
// =============================================================================

import { createClient } from '@supabase/supabase-js';
import { logger } from './logger';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const hasConfiguredSupabase = Boolean(supabaseUrl && supabaseAnonKey);
const allowLocalFallback =
  import.meta.env.DEV && import.meta.env.VITE_USE_LOCAL_SUPABASE === 'true';
const missingSupabaseConfigMessage =
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env, then restart the dev server.';

if (!hasConfiguredSupabase) {
  const modeMessage = allowLocalFallback
    ? 'Using local Supabase fallback at http://127.0.0.1:54321 (VITE_USE_LOCAL_SUPABASE=true).'
    : missingSupabaseConfigMessage;
  console.error(modeMessage);
}

const resolvedSupabaseUrl = hasConfiguredSupabase
  ? supabaseUrl
  : allowLocalFallback
    ? 'http://127.0.0.1:54321'
    : 'https://invalid.supabase.local';
const resolvedSupabaseAnonKey = hasConfiguredSupabase
  ? supabaseAnonKey
  : allowLocalFallback
    ? 'test-anon-key'
    : 'missing-anon-key';
const supabaseConfigError = hasConfiguredSupabase || allowLocalFallback
  ? null
  : missingSupabaseConfigMessage;

const createConfigError = () =>
  ({
    name: 'SupabaseConfigError',
    message: supabaseConfigError || missingSupabaseConfigMessage,
    status: 500,
  } as any);

// Create Supabase client
export const supabase = createClient<Database>(
  resolvedSupabaseUrl,
  resolvedSupabaseAnonKey,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  }
);

// =============================================================================
// SESSION CACHING
// Cached session updated by onAuthStateChange - prevents redundant getSession() calls
// =============================================================================

import type { Session } from '@supabase/supabase-js';

let cachedSession: Session | null = null;
const AUTH_HASH_TOKEN_RE = /(access_token=|refresh_token=|provider_token=)/i;

const clearAuthHashTokensFromUrl = () => {
  if (typeof window === 'undefined') return;
  const hash = window.location.hash || '';
  if (!AUTH_HASH_TOKEN_RE.test(hash)) return;
  const cleanUrl = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState({}, document.title, cleanUrl);
};

// Initialize session cache from auth state changes
supabase.auth.onAuthStateChange((event, session) => {
  cachedSession = session;
  if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    clearAuthHashTokensFromUrl();
  }
  // Session cached
});

// Get cached session (sync, no network call)
export function getCachedSession(): Session | null {
  return cachedSession;
}

// =============================================================================
// AUTH HELPERS
// =============================================================================

export const auth = {
  /**
   * Sign up with email and password
   */
  signUp: async (email: string, password: string, name: string) => {
    if (supabaseConfigError) {
      return { data: null, error: createConfigError() };
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name }
      }
    });
    return { data, error };
  },

  /**
   * Sign in with email and password
   */
  signIn: async (email: string, password: string) => {
    if (supabaseConfigError) {
      return { data: null, error: createConfigError() };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    return { data, error };
  },

  /**
   * Sign in with Google OAuth
   */
  signInWithGoogle: async () => {
    if (supabaseConfigError) {
      return { data: null, error: createConfigError() };
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent'
        }
      }
    });
    return { data, error };
  },

  /**
   * Sign out
   */
  signOut: async () => {
    // 1. Clear Supabase auth
    const { error } = await supabase.auth.signOut();

    // 2. Explicitly clear all local storage and session storage
    // This ensures no stale tokens or data persist
    localStorage.clear();
    sessionStorage.clear();

    // 3. Clear project-specific auth key if present.
    const projectRef = (() => {
      try {
        return new URL(resolvedSupabaseUrl).hostname.split('.')[0];
      } catch {
        return null;
      }
    })();
    if (projectRef) {
      localStorage.removeItem(`sb-${projectRef}-auth-token`);
    }

    return { error };
  },

  /**
   * Get current user
   */
  getUser: async () => {
    if (supabaseConfigError) {
      return { user: null, error: createConfigError() };
    }

    const { data: { user }, error } = await supabase.auth.getUser();
    return { user, error };
  },

  /**
   * Get current session
   */
  getSession: async () => {
    if (supabaseConfigError) {
      return { session: null, error: createConfigError() };
    }

    const { data: { session }, error } = await supabase.auth.getSession();
    return { session, error };
  },

  /**
   * Listen to auth state changes
   */
  onAuthStateChange: (callback: (event: string, session: any) => void) => {
    return supabase.auth.onAuthStateChange(callback);
  },

  /**
   * Reset password
   */
  resetPassword: async (email: string) => {
    if (supabaseConfigError) {
      return { data: null, error: createConfigError() };
    }

    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    });
    return { data, error };
  },

  /**
   * Update password
   */
  updatePassword: async (newPassword: string) => {
    if (supabaseConfigError) {
      return { data: null, error: createConfigError() };
    }

    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    });
    return { data, error };
  }
};

// =============================================================================
// EDGE FUNCTIONS HELPER
// =============================================================================

// Edge Functions URL - always use the resolved URL (either from env or fallback)
const FUNCTIONS_BASE = `${resolvedSupabaseUrl}/functions/v1`;

export async function callEdgeFunction<T>(
  functionName: string,
  body: any
): Promise<{ data: T | null; error: string | null }> {
  if (supabaseConfigError) {
    return { data: null, error: supabaseConfigError };
  }

  const requestId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const clientEnv = import.meta.env.MODE;
  const clientVersion = import.meta.env.VITE_APP_VERSION || 'unknown';

  try {
    // Always read the latest session from Supabase to avoid stale JWTs
    const result = await auth.getSession();
    const session = result.session;
    cachedSession = session || null;

    if (!session) {
      return { data: null, error: 'Not authenticated' };
    }

    const makeRequest = async (accessToken: string) => {
      return fetch(`${FUNCTIONS_BASE}/${functionName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': resolvedSupabaseAnonKey || '',
          'x-request-id': requestId,
          'x-client-env': clientEnv,
          'x-client-version': clientVersion,
        },
        body: JSON.stringify(body)
      });
    };

    let response = await makeRequest(session.access_token);

    // If token is stale, try refreshing once
    if (response.status === 401) {
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.data?.session) {
        cachedSession = refreshed.data.session;
        response = await makeRequest(refreshed.data.session.access_token);
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      let message = errorText;
      let errorKey: string | undefined;
      let errorCode: string | number | undefined;
      let serverRequestId = response.headers.get('x-request-id') || undefined;
      try {
        const parsed = JSON.parse(errorText);
        message =
          parsed?.error?.errormessage ||
          parsed?.error?.message ||
          parsed?.message ||
          errorText;
        errorKey = parsed?.error?.errorkey || parsed?.error?.key;
        errorCode = parsed?.error?.errorcode || parsed?.error?.code;
        if (!serverRequestId) {
          serverRequestId = parsed?.requestId || parsed?.request_id;
        }
      } catch {
        // Not JSON (or invalid JSON) – fall back to raw text
      }
      logger.error(`[Edge Function] ${functionName} failed`, new Error(message), {
        status: response.status,
        message,
        errorKey,
        errorCode,
        requestId,
        serverRequestId,
      });
      const diagnostic = [
        `${response.status}: ${message}`,
        errorKey ? `[${errorKey}]` : '',
        serverRequestId ? `(serverRequestId: ${serverRequestId})` : '',
      ].filter(Boolean).join(' ');
      return { data: null, error: diagnostic };
    }

    const payload = await response.json();

    if (!payload.success) {
      const message = payload?.error?.errormessage || payload?.error?.message || 'Unknown error';
      return { data: null, error: message };
    }

    return { data: payload.data, error: null };
  } catch (error: any) {
    logger.error(`[Edge Function] ${functionName} exception`, error, { requestId });
    return { data: null, error: error.message };
  }
}
