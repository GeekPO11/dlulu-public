import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type PlanSource = 'override' | 'subscription' | 'default';

export interface Entitlements {
  plan_id: string;
  max_active_goals: number | null;
  token_hard_cap: number | null;
  token_soft_cap: number | null;
  calendar_sync_enabled: boolean;
  warning_thresholds: Record<string, number>;
  throttle_policy: Record<string, any> | null;
}

export interface UsageSummary {
  token_usage: number;
  tokens_input_used: number;
  tokens_output_used: number;
  active_goal_count: number;
  period_start: string;
  period_end: string;
}

type PlanCacheEntry = {
  fetchedAt: number;
  entitlementsByPlan: Map<string, Entitlements>;
};

const PLAN_CACHE_TTL_MS = 60_000;
let PLAN_CACHE: PlanCacheEntry | null = null;

const STAGING_ENV_VALUES = new Set(['staging', 'stage', 'test']);

const getEnv = (key: string) => Deno.env.get(key) ?? '';

const getEnvironment = () => {
  return (getEnv('MW_ENV') || getEnv('ENVIRONMENT') || 'production').toLowerCase();
};

const getMonthlyPeriodWindowUtc = (now: Date) => {
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
  return { periodStart, periodEnd };
};

async function loadPlanCache(supabaseClient: SupabaseClient) {
  const now = Date.now();
  if (PLAN_CACHE && now - PLAN_CACHE.fetchedAt < PLAN_CACHE_TTL_MS) {
    return PLAN_CACHE;
  }

  const { data, error } = await supabaseClient
    .from('plan_entitlements')
    .select('*');

  if (error) {
    throw new Error(`Failed to load plan entitlements: ${error.message}`);
  }

  const entitlementsByPlan = new Map<string, Entitlements>();
  for (const row of data || []) {
    entitlementsByPlan.set(row.plan_id, {
      plan_id: row.plan_id,
      max_active_goals: row.max_active_goals ?? null,
      token_hard_cap: row.token_hard_cap ?? null,
      token_soft_cap: row.token_soft_cap ?? null,
      calendar_sync_enabled: row.calendar_sync_enabled ?? false,
      warning_thresholds: row.warning_thresholds ?? {},
      throttle_policy: row.throttle_policy ?? null,
    });
  }

  PLAN_CACHE = { fetchedAt: now, entitlementsByPlan };
  return PLAN_CACHE;
}

async function fetchPlanEntitlements(
  supabaseClient: SupabaseClient,
  planId: string
): Promise<Entitlements> {
  const cache = await loadPlanCache(supabaseClient);
  const cached = cache.entitlementsByPlan.get(planId);
  if (cached) return cached;

  const { data, error } = await supabaseClient
    .from('plan_entitlements')
    .select('*')
    .eq('plan_id', planId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch entitlements for ${planId}: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Missing plan_entitlements row for ${planId}`);
  }

  const entitlements: Entitlements = {
    plan_id: data.plan_id,
    max_active_goals: data.max_active_goals ?? null,
    token_hard_cap: data.token_hard_cap ?? null,
    token_soft_cap: data.token_soft_cap ?? null,
    calendar_sync_enabled: data.calendar_sync_enabled ?? false,
    warning_thresholds: data.warning_thresholds ?? {},
    throttle_policy: data.throttle_policy ?? null,
  };

  cache.entitlementsByPlan.set(planId, entitlements);
  return entitlements;
}

function isOverrideActive(override: any, now: Date) {
  const startsAt = override?.starts_at ? new Date(override.starts_at) : null;
  const endsAt = override?.ends_at ? new Date(override.ends_at) : null;
  if (startsAt && startsAt > now) return false;
  if (endsAt && endsAt <= now) return false;
  return true;
}

function isSubscriptionActive(subscription: any, now: Date) {
  if (!subscription) return false;
  const status = String(subscription.status || '').toLowerCase();
  if (['active', 'trialing', 'past_due'].includes(status)) return true;
  if (status === 'canceled' && subscription.current_period_end) {
    const periodEnd = new Date(subscription.current_period_end);
    return periodEnd > now;
  }
  return false;
}

function resolvePlanId(
  override: any,
  subscription: any
): { planId: string; source: PlanSource } {
  if (override?.override_plan_id) {
    return { planId: override.override_plan_id, source: 'override' };
  }
  if (subscription?.plan_id) {
    return { planId: subscription.plan_id, source: 'subscription' };
  }
  return { planId: 'free', source: 'default' };
}

export async function resolveEntitlements(
  supabaseClient: SupabaseClient,
  userId: string
): Promise<{ entitlements: Entitlements; source: PlanSource }> {
  const now = new Date();

  const { data: override, error: overrideError } = await supabaseClient
    .from('user_entitlement_overrides')
    .select('override_plan_id, starts_at, ends_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (overrideError) {
    throw new Error(`Failed to load entitlement override: ${overrideError.message}`);
  }

  const hasActiveOverride = override && isOverrideActive(override, now);

  const { data: subscription, error: subscriptionError } = await supabaseClient
    .from('subscriptions')
    .select('plan_id, status, current_period_end')
    .eq('user_id', userId)
    .order('current_period_end', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subscriptionError) {
    throw new Error(`Failed to load subscription: ${subscriptionError.message}`);
  }

  const hasActiveSubscription = isSubscriptionActive(subscription, now);

  let { planId, source } = resolvePlanId(
    hasActiveOverride ? override : null,
    hasActiveSubscription ? subscription : null
  );

  const env = getEnvironment();
  const stagingOverridePlanId = getEnv('ENTITLEMENTS_STAGING_PLAN_ID');
  if (stagingOverridePlanId && STAGING_ENV_VALUES.has(env)) {
    planId = stagingOverridePlanId;
  }

  const entitlements = await fetchPlanEntitlements(supabaseClient, planId);
  return { entitlements, source };
}

export async function getUsageForPeriod(
  supabaseClient: SupabaseClient,
  userId: string,
  periodStart: string,
  periodEnd: string
): Promise<UsageSummary> {
  const { data, error } = await supabaseClient
    .from('user_usage_periods')
    .select('token_usage, tokens_total_used, tokens_input_used, tokens_output_used, active_goal_count')
    .eq('user_id', userId)
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load usage period: ${error.message}`);
  }

  if (!data) {
    return {
      token_usage: 0,
      tokens_input_used: 0,
      tokens_output_used: 0,
      active_goal_count: 0,
      period_start: periodStart,
      period_end: periodEnd,
    };
  }

  const tokensInput = Number(data.tokens_input_used ?? 0);
  const tokensOutput = Number(data.tokens_output_used ?? 0);
  const tokensTotal = Number(data.tokens_total_used ?? data.token_usage ?? 0);

  return {
    token_usage: tokensTotal,
    tokens_input_used: tokensInput,
    tokens_output_used: tokensOutput,
    active_goal_count: Number(data.active_goal_count || 0),
    period_start: periodStart,
    period_end: periodEnd,
  };
}

export function shouldThrottle(usage: UsageSummary, entitlements: Entitlements) {
  if (!entitlements.token_soft_cap) return false;
  return usage.token_usage >= entitlements.token_soft_cap;
}

export function shouldBlock(usage: UsageSummary, entitlements: Entitlements) {
  if (!entitlements.token_hard_cap) return false;
  return usage.token_usage >= entitlements.token_hard_cap;
}

export async function getOrCreateUsagePeriod(
  supabaseClient: SupabaseClient,
  userId: string,
  now: Date = new Date()
): Promise<UsageSummary> {
  const { periodStart, periodEnd } = getMonthlyPeriodWindowUtc(now);
  const periodStartIso = periodStart.toISOString();
  const periodEndIso = periodEnd.toISOString();

  const { error: ensureError } = await supabaseClient.rpc('ensure_usage_period', {
    p_user_id: userId,
    p_period_start: periodStartIso,
    p_period_end: periodEndIso,
  });

  if (ensureError) {
    throw new Error(`Failed to ensure usage period: ${ensureError.message}`);
  }

  return await getUsageForPeriod(supabaseClient, userId, periodStartIso, periodEndIso);
}

export async function getUsageForCurrentPeriod(
  supabaseClient: SupabaseClient,
  userId: string,
  now: Date = new Date()
): Promise<UsageSummary> {
  const { periodStart, periodEnd } = getMonthlyPeriodWindowUtc(now);
  const periodStartIso = periodStart.toISOString();
  const periodEndIso = periodEnd.toISOString();

  const { data, error } = await supabaseClient
    .from('user_usage_periods')
    .select('token_usage, tokens_total_used, tokens_input_used, tokens_output_used, active_goal_count')
    .eq('user_id', userId)
    .eq('period_start', periodStartIso)
    .eq('period_end', periodEndIso)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load usage period: ${error.message}`);
  }

  if (data) {
    const tokensInput = Number(data.tokens_input_used ?? 0);
    const tokensOutput = Number(data.tokens_output_used ?? 0);
    const tokensTotal = Number(data.tokens_total_used ?? data.token_usage ?? 0);
    return {
      token_usage: tokensTotal,
      tokens_input_used: tokensInput,
      tokens_output_used: tokensOutput,
      active_goal_count: Number(data.active_goal_count || 0),
      period_start: periodStartIso,
      period_end: periodEndIso,
    };
  }

  const { data: agg, error: aggError } = await supabaseClient.rpc('compute_token_usage', {
    p_user_id: userId,
    p_period_start: periodStartIso,
    p_period_end: periodEndIso,
  });

  if (aggError) {
    throw new Error(`Failed to compute token usage: ${aggError.message}`);
  }

  const row = Array.isArray(agg) ? agg[0] : agg;
  const tokensInput = Number(row?.tokens_input ?? 0);
  const tokensOutput = Number(row?.tokens_output ?? 0);

  const { error: seedError } = await supabaseClient.rpc('increment_usage_period', {
    p_user_id: userId,
    p_period_start: periodStartIso,
    p_period_end: periodEndIso,
    p_tokens_input: tokensInput,
    p_tokens_output: tokensOutput,
  });

  if (seedError) {
    throw new Error(`Failed to seed usage period: ${seedError.message}`);
  }

  return {
    token_usage: tokensInput + tokensOutput,
    tokens_input_used: tokensInput,
    tokens_output_used: tokensOutput,
    active_goal_count: 0,
    period_start: periodStartIso,
    period_end: periodEndIso,
  };
}

export async function recordUsageEvent(
  supabaseClient: SupabaseClient,
  eventId: string,
  userId: string,
  tokensInput: number,
  tokensOutput: number,
  now: Date = new Date()
): Promise<{ applied: boolean; period_start: string; period_end: string }> {
  if (!eventId) {
    throw new Error('Missing event_id for usage metering');
  }

  const { periodStart, periodEnd } = getMonthlyPeriodWindowUtc(now);
  const periodStartIso = periodStart.toISOString();
  const periodEndIso = periodEnd.toISOString();

  const { data, error } = await supabaseClient.rpc('record_usage_event', {
    p_event_id: eventId,
    p_user_id: userId,
    p_period_start: periodStartIso,
    p_period_end: periodEndIso,
    p_tokens_input: tokensInput,
    p_tokens_output: tokensOutput,
  });

  if (error) {
    throw new Error(`Failed to record usage event: ${error.message}`);
  }

  const applied = typeof data === 'boolean' ? data : Boolean(data);
  return { applied, period_start: periodStartIso, period_end: periodEndIso };
}
