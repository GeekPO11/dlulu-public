// =============================================================================
// ANALYTICS - Mixpanel Integration
// Product analytics utility for tracking user behavior and conversions
// =============================================================================

/// <reference types="vite/client" />

// Mixpanel SDK Interface (from CDN script)
interface MixpanelSDK {
    init: (token: string, config?: Record<string, unknown>) => void;
    identify: (userId: string) => void;
    track: (event: string, properties?: Record<string, unknown>) => void;
    people: {
        set: (properties: Record<string, unknown>) => void;
        set_once: (properties: Record<string, unknown>) => void;
        increment: (property: string | Record<string, number>, value?: number) => void;
    };
    register: (properties: Record<string, unknown>) => void;
    reset: () => void;
    time_event: (eventName: string) => void;
    get_distinct_id: () => string;
}

// Global Window Extension
declare global {
    interface Window {
        mixpanel?: MixpanelSDK;
    }
}

// =============================================================================
// Configuration
// =============================================================================

const IS_DEV = import.meta.env.DEV;
const MIXPANEL_TOKEN = import.meta.env.VITE_MIXPANEL_TOKEN || '';
const MIXPANEL_DEBUG = import.meta.env.VITE_MIXPANEL_DEBUG === 'true';
const ENABLED = !!MIXPANEL_TOKEN && (import.meta.env.VITE_MIXPANEL_ENABLED !== 'false');

// PII redaction patterns (shared with logger)
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SENSITIVE_KEYS = new Set([
    'email', 'password', 'token', 'access_token', 'refresh_token',
    'secret', 'api_key', 'authorization', 'credit_card', 'ssn'
]);

const RAW_CONSOLE = {
    log: console.log.bind(console),
    debug: console.debug.bind(console),
    warn: console.warn.bind(console),
};

// =============================================================================
// Types
// =============================================================================

export interface AnalyticsProperties {
    [key: string]: string | number | boolean | string[] | undefined | null;
}

export interface UserProperties {
    user_id?: string;
    signup_date?: string;
    signup_method?: string;
    plan_id?: string;
    subscription_status?: string;
    chronotype?: string;
    energy_level?: string;
    total_goals_created?: number;
    first_goal_date?: string;
    [key: string]: string | number | boolean | undefined;
}

// =============================================================================
// Event Names (Type-safe)
// =============================================================================

export const AnalyticsEvents = {
    // Acquisition
    LANDING_PAGE_VIEWED: 'landing_page_viewed',
    AUTH_SIGNUP_STARTED: 'auth_signup_started',
    AUTH_SIGNUP_COMPLETED: 'auth_signup_completed',
    AUTH_SIGNIN_COMPLETED: 'auth_signin_completed',
    AUTH_SIGNOUT_COMPLETED: 'auth_signout_completed',
    AUTH_PASSWORD_RESET_REQUESTED: 'auth_password_reset_requested',

    // Onboarding
    ONBOARDING_STARTED: 'onboarding_started',
    ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
    ONBOARDING_STEP_SKIPPED: 'onboarding_step_skipped',
    ONBOARDING_COMPLETED: 'onboarding_completed',
    ONBOARDING_ABANDONED: 'onboarding_abandoned',

    // Goals
    GOAL_CREATED: 'goal_created',
    GOAL_VIEWED: 'goal_viewed',
    GOAL_EDITED: 'goal_edited',
    GOAL_PAUSED: 'goal_paused',
    GOAL_RESUMED: 'goal_resumed',
    GOAL_ABANDONED: 'goal_abandoned',
    GOAL_COMPLETED: 'goal_completed',
    PHASE_COMPLETED: 'phase_completed',
    MILESTONE_COMPLETED: 'milestone_completed',
    TASK_COMPLETED: 'task_completed',
    SUBTASK_COMPLETED: 'subtask_completed',

    // Chat
    CHAT_SESSION_STARTED: 'chat_session_started',
    CHAT_MESSAGE_SENT: 'chat_message_sent',
    CHAT_SUGGESTION_USED: 'chat_suggestion_used',
    CHAT_ACTION_EXECUTED: 'chat_action_executed',
    CHAT_SESSION_ENDED: 'chat_session_ended',

    // Calendar
    CALENDAR_VIEWED: 'calendar_viewed',
    SCHEDULE_GENERATED: 'schedule_generated',
    SCHEDULE_CLEARED: 'schedule_cleared',
    EVENT_CREATED: 'event_created',
    EVENT_COMPLETED: 'event_completed',
    EVENT_RESCHEDULED: 'event_rescheduled',
    EVENT_DELETED: 'event_deleted',

    // Revenue
    PRICING_PAGE_VIEWED: 'pricing_page_viewed',
    CHECKOUT_STARTED: 'checkout_started',
    CHECKOUT_COMPLETED: 'checkout_completed',
    CHECKOUT_ABANDONED: 'checkout_abandoned',
    SUBSCRIPTION_ACTIVATED: 'subscription_activated',
    SUBSCRIPTION_UPGRADED: 'subscription_upgraded',
    SUBSCRIPTION_DOWNGRADED: 'subscription_downgraded',
    SUBSCRIPTION_CANCELLED: 'subscription_cancelled',
    SUBSCRIPTION_RENEWED: 'subscription_renewed',
    BILLING_PORTAL_OPENED: 'billing_portal_opened',

    // Settings & Account
    SETTINGS_VIEWED: 'settings_viewed',
    PROFILE_UPDATED: 'profile_updated',
    ACCOUNT_DELETED: 'account_deleted',
    UPGRADE_GATE_SHOWN: 'upgrade_gate_shown',
    UPGRADE_GATE_CLICKED: 'upgrade_gate_clicked',
    PASSWORD_RESET_COMPLETED: 'password_reset_completed',

    // Page Views
    PAGE_VIEWED: 'page_viewed',
} as const;

export type AnalyticsEvent = typeof AnalyticsEvents[keyof typeof AnalyticsEvents];

// Onboarding step names for consistent tracking
export const OnboardingStepNames = [
    'profile',
    'ambitions',
    'intake_questions',
    'status_check',
    'boundaries',
    'roadmap_generation',
    'complete',
] as const;

export type OnboardingStepName = typeof OnboardingStepNames[number];

// =============================================================================
// PII Redaction
// =============================================================================

const redactValue = (value: unknown, key?: string): unknown => {
    if (key && SENSITIVE_KEYS.has(key.toLowerCase())) {
        return '[REDACTED]';
    }
    if (typeof value === 'string') {
        return value.replace(EMAIL_RE, '[REDACTED_EMAIL]');
    }
    return value;
};

const redactProperties = (props: AnalyticsProperties): AnalyticsProperties => {
    const redacted: AnalyticsProperties = {};
    for (const [key, value] of Object.entries(props)) {
        if (value !== undefined && value !== null) {
            redacted[key] = redactValue(value, key) as typeof value;
        }
    }
    return redacted;
};

// =============================================================================
// Analytics Class
// =============================================================================

class Analytics {
    private static instance: Analytics;
    private initialized = false;
    private queue: Array<{ method: string; args: unknown[] }> = [];
    private superProperties: AnalyticsProperties = {};
    private sessionStartTime: number = Date.now();
    private eventTimers: Map<string, number> = new Map();

    private constructor() {
        // Private constructor for singleton
    }

    public static getInstance(): Analytics {
        if (!Analytics.instance) {
            Analytics.instance = new Analytics();
        }
        return Analytics.instance;
    }

    // =========================================================================
    // Initialization
    // =========================================================================

    /**
     * Initialize Mixpanel SDK with project token
     */
    public init(): void {
        if (!ENABLED) {
            if (IS_DEV) {
                RAW_CONSOLE.debug('[Analytics] Disabled - no token or explicitly disabled');
            }
            return;
        }

        if (this.initialized) {
            return;
        }

        if (typeof window === 'undefined' || !window.mixpanel) {
            // SDK not loaded yet, retry after delay
            setTimeout(() => this.init(), 100);
            return;
        }

        try {
            window.mixpanel.init(MIXPANEL_TOKEN, {
                debug: MIXPANEL_DEBUG,
                track_pageview: false, // We handle this manually
                persistence: 'localStorage',
                ignore_dnt: false, // Respect Do Not Track
                // @ts-ignore - autocapture is valid in JS SDK but missing in some type definitions
                autocapture: true,
            });

            this.initialized = true;
            this.sessionStartTime = Date.now();

            // Flush queued events
            this.flushQueue();

            if (IS_DEV || MIXPANEL_DEBUG) {
                RAW_CONSOLE.log('[Analytics] Initialized');
            }
        } catch (e) {
            if (IS_DEV) {
                RAW_CONSOLE.warn('[Analytics] Failed to initialize:', e);
            }
        }
    }

    /**
     * Flush queued events after SDK loads
     */
    private flushQueue(): void {
        if (!this.initialized || !window.mixpanel) return;

        const queued = [...this.queue];
        this.queue = [];

        for (const { method, args } of queued) {
            try {
                (this as any)[method](...args);
            } catch (e) {
                if (IS_DEV) {
                    RAW_CONSOLE.warn('[Analytics] Failed to flush queued event:', e);
                }
            }
        }
    }

    /**
     * Enqueue event if SDK not ready
     */
    private enqueue(method: string, ...args: unknown[]): boolean {
        if (this.initialized && window.mixpanel) {
            return false;
        }
        if (this.queue.length < 100) {
            this.queue.push({ method, args });
        }
        return true;
    }

    // =========================================================================
    // User Identity
    // =========================================================================

    /**
     * Identify user and set user properties
     */
    public identify(userId: string, properties?: UserProperties): void {
        if (!ENABLED) return;

        if (this.enqueue('identify', userId, properties)) return;

        try {
            window.mixpanel!.identify(userId);

            if (properties) {
                const redacted = redactProperties(properties as AnalyticsProperties);
                window.mixpanel!.people.set(redacted);
            }

            // Set user_id as super property
            this.register({ user_id: userId });

            if (IS_DEV || MIXPANEL_DEBUG) {
                RAW_CONSOLE.log('[Analytics] Identified user:', userId);
            }
        } catch (e) {
            if (IS_DEV) {
                RAW_CONSOLE.warn('[Analytics] Failed to identify:', e);
            }
        }
    }

    /**
     * Set properties that only get set once (e.g., signup_date)
     */
    public setOnce(properties: UserProperties): void {
        if (!ENABLED) return;

        if (this.enqueue('setOnce', properties)) return;

        try {
            const redacted = redactProperties(properties as AnalyticsProperties);
            window.mixpanel!.people.set_once(redacted);
        } catch (e) {
            if (IS_DEV) {
                RAW_CONSOLE.warn('[Analytics] Failed to set_once:', e);
            }
        }
    }

    /**
     * Update user properties
     */
    public setUserProperties(properties: UserProperties): void {
        if (!ENABLED) return;

        if (this.enqueue('setUserProperties', properties)) return;

        try {
            const redacted = redactProperties(properties as AnalyticsProperties);
            window.mixpanel!.people.set(redacted);

            if (IS_DEV || MIXPANEL_DEBUG) {
                RAW_CONSOLE.log('[Analytics] Set user properties:', redacted);
            }
        } catch (e) {
            if (IS_DEV) {
                RAW_CONSOLE.warn('[Analytics] Failed to set user properties:', e);
            }
        }
    }

    /**
     * Increment a numeric user property
     */
    public increment(property: string, value: number = 1): void {
        if (!ENABLED) return;

        if (this.enqueue('increment', property, value)) return;

        try {
            window.mixpanel!.people.increment(property, value);
        } catch (e) {
            if (IS_DEV) {
                RAW_CONSOLE.warn('[Analytics] Failed to increment:', e);
            }
        }
    }

    /**
     * Register super properties (attached to all events)
     */
    public register(properties: AnalyticsProperties): void {
        if (!ENABLED) return;

        this.superProperties = { ...this.superProperties, ...properties };

        if (this.enqueue('register', properties)) return;

        try {
            const redacted = redactProperties(properties);
            window.mixpanel!.register(redacted);
        } catch (e) {
            if (IS_DEV) {
                RAW_CONSOLE.warn('[Analytics] Failed to register:', e);
            }
        }
    }

    /**
     * Reset user identity (on logout)
     */
    public reset(): void {
        if (!ENABLED) return;

        this.superProperties = {};
        this.eventTimers.clear();

        if (!this.initialized || !window.mixpanel) return;

        try {
            window.mixpanel.reset();

            if (IS_DEV || MIXPANEL_DEBUG) {
                RAW_CONSOLE.log('[Analytics] Reset');
            }
        } catch (e) {
            if (IS_DEV) {
                RAW_CONSOLE.warn('[Analytics] Failed to reset:', e);
            }
        }
    }

    // =========================================================================
    // Event Tracking
    // =========================================================================

    /**
     * Track an event with properties
     */
    public track(event: AnalyticsEvent | string, properties?: AnalyticsProperties): void {
        if (!ENABLED) return;

        // Add automatic properties
        const enrichedProps: AnalyticsProperties = {
            ...properties,
            session_duration_seconds: Math.floor((Date.now() - this.sessionStartTime) / 1000),
        };

        // Check for timed event
        if (this.eventTimers.has(event)) {
            const startTime = this.eventTimers.get(event)!;
            enrichedProps.duration_seconds = Math.floor((Date.now() - startTime) / 1000);
            this.eventTimers.delete(event);
        }

        if (this.enqueue('track', event, enrichedProps)) {
            if (IS_DEV || MIXPANEL_DEBUG) {
                RAW_CONSOLE.log('[Analytics] Queued:', event, enrichedProps);
            }
            return;
        }

        try {
            const redacted = redactProperties(enrichedProps);
            window.mixpanel!.track(event, redacted);

            if (IS_DEV || MIXPANEL_DEBUG) {
                RAW_CONSOLE.log('[Analytics] Tracked:', event, redacted);
            }
        } catch (e) {
            if (IS_DEV) {
                RAW_CONSOLE.warn('[Analytics] Failed to track:', e);
            }
        }
    }

    /**
     * Start timing an event (call track with same name to complete)
     */
    public timeEvent(eventName: string): void {
        if (!ENABLED) return;

        this.eventTimers.set(eventName, Date.now());

        if (this.initialized && window.mixpanel) {
            try {
                window.mixpanel.time_event(eventName);
            } catch (e) {
                // Ignore - we have our own timer
            }
        }
    }

    // =========================================================================
    // Convenience Methods
    // =========================================================================

    /**
     * Track page view
     */
    public trackPageView(pageName: string, properties?: AnalyticsProperties): void {
        this.track(AnalyticsEvents.PAGE_VIEWED, {
            page_name: pageName,
            ...properties,
        });
    }

    /**
     * Track onboarding step completion
     */
    public trackOnboardingStep(
        stepIndex: number,
        stepName: OnboardingStepName,
        properties?: AnalyticsProperties
    ): void {
        this.track(AnalyticsEvents.ONBOARDING_STEP_COMPLETED, {
            step_index: stepIndex,
            step_name: stepName,
            ...properties,
        });
    }

    /**
     * Track goal creation
     */
    public trackGoalCreated(
        category: string,
        source: 'onboarding' | 'add_goal' | 'chat',
        properties?: AnalyticsProperties
    ): void {
        this.track(AnalyticsEvents.GOAL_CREATED, {
            category,
            source,
            ...properties,
        });
        this.increment('total_goals_created');
    }

    /**
     * Track checkout started
     */
    public trackCheckoutStarted(
        planId: 'pro_monthly' | 'pro_annual',
        properties?: AnalyticsProperties
    ): void {
        this.track(AnalyticsEvents.CHECKOUT_STARTED, {
            plan_id: planId,
            ...properties,
        });
    }

    /**
     * Get current distinct ID (for debugging)
     */
    public getDistinctId(): string | undefined {
        if (!this.initialized || !window.mixpanel) return undefined;
        try {
            return window.mixpanel.get_distinct_id();
        } catch {
            return undefined;
        }
    }
}

// =============================================================================
// Exports
// =============================================================================

export const analytics = Analytics.getInstance();
