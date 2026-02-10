-- =============================================================================
-- Pricing & Billing Validation Queries
-- Target: Supabase/Postgres
-- =============================================================================

-- 0) Data coverage window for chat_messages
SELECT
  min(created_at) AS first_message_at,
  max(created_at) AS last_message_at,
  count(*) AS message_count,
  round(extract(epoch FROM (max(created_at) - min(created_at))) / 86400, 1) AS days_covered
FROM public.chat_messages;

-- =============================================================================
-- 1) Output token ratio (assumption: ~15% output)
-- =============================================================================

-- 1a) Overall ratio (all-time)
SELECT
  sum(coalesce(tokens_output, 0)) AS tokens_output,
  sum(coalesce(tokens_input, 0)) AS tokens_input,
  round(
    sum(coalesce(tokens_output, 0))::numeric
    / NULLIF(sum(coalesce(tokens_input, 0) + coalesce(tokens_output, 0)), 0),
    4
  ) AS output_ratio
FROM public.chat_messages;

-- 1b) Overall ratio (last 30 days)
SELECT
  sum(coalesce(tokens_output, 0)) AS tokens_output,
  sum(coalesce(tokens_input, 0)) AS tokens_input,
  round(
    sum(coalesce(tokens_output, 0))::numeric
    / NULLIF(sum(coalesce(tokens_input, 0) + coalesce(tokens_output, 0)), 0),
    4
  ) AS output_ratio
FROM public.chat_messages
WHERE created_at >= now() - interval '30 days';

-- 1c) Ratio distribution by user (p50/p90/p99, last 30 days)
WITH per_user AS (
  SELECT
    user_id,
    sum(coalesce(tokens_input, 0)) AS tokens_input,
    sum(coalesce(tokens_output, 0)) AS tokens_output,
    sum(coalesce(tokens_input, 0) + coalesce(tokens_output, 0)) AS tokens_total,
    sum(coalesce(tokens_output, 0))::numeric
      / NULLIF(sum(coalesce(tokens_input, 0) + coalesce(tokens_output, 0)), 0) AS output_ratio
  FROM public.chat_messages
  WHERE created_at >= now() - interval '30 days'
  GROUP BY user_id
)
SELECT
  percentile_cont(0.50) WITHIN GROUP (ORDER BY output_ratio) AS p50_output_ratio,
  percentile_cont(0.90) WITHIN GROUP (ORDER BY output_ratio) AS p90_output_ratio,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY output_ratio) AS p99_output_ratio
FROM per_user
WHERE tokens_total > 0;

-- 1d) Ratio by day
SELECT
  date_trunc('day', created_at) AS day,
  sum(coalesce(tokens_output, 0)) AS tokens_output,
  sum(coalesce(tokens_input, 0)) AS tokens_input,
  round(
    sum(coalesce(tokens_output, 0))::numeric
    / NULLIF(sum(coalesce(tokens_input, 0) + coalesce(tokens_output, 0)), 0),
    4
  ) AS output_ratio
FROM public.chat_messages
GROUP BY 1
ORDER BY 1 DESC;

-- 1e) Ratio by week
SELECT
  date_trunc('week', created_at) AS week,
  sum(coalesce(tokens_output, 0)) AS tokens_output,
  sum(coalesce(tokens_input, 0)) AS tokens_input,
  round(
    sum(coalesce(tokens_output, 0))::numeric
    / NULLIF(sum(coalesce(tokens_input, 0) + coalesce(tokens_output, 0)), 0),
    4
  ) AS output_ratio
FROM public.chat_messages
GROUP BY 1
ORDER BY 1 DESC;

-- =============================================================================
-- 2) Monthly token usage distribution per user (last 30 days)
-- =============================================================================

WITH per_user_30d AS (
  SELECT
    user_id,
    sum(coalesce(tokens_input, 0)) AS tokens_input,
    sum(coalesce(tokens_output, 0)) AS tokens_output,
    sum(coalesce(tokens_input, 0) + coalesce(tokens_output, 0)) AS tokens_total
  FROM public.chat_messages
  WHERE created_at >= now() - interval '30 days'
  GROUP BY user_id
)
SELECT
  percentile_cont(0.50) WITHIN GROUP (ORDER BY tokens_total) AS p50_total,
  percentile_cont(0.75) WITHIN GROUP (ORDER BY tokens_total) AS p75_total,
  percentile_cont(0.90) WITHIN GROUP (ORDER BY tokens_total) AS p90_total,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY tokens_total) AS p95_total,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY tokens_total) AS p99_total,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY tokens_input) AS p50_input,
  percentile_cont(0.75) WITHIN GROUP (ORDER BY tokens_input) AS p75_input,
  percentile_cont(0.90) WITHIN GROUP (ORDER BY tokens_input) AS p90_input,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY tokens_input) AS p95_input,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY tokens_input) AS p99_input,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY tokens_output) AS p50_output,
  percentile_cont(0.75) WITHIN GROUP (ORDER BY tokens_output) AS p75_output,
  percentile_cont(0.90) WITHIN GROUP (ORDER BY tokens_output) AS p90_output,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY tokens_output) AS p95_output,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY tokens_output) AS p99_output
FROM per_user_30d;

-- =============================================================================
-- 3) Cap impact simulation (last 30 days)
-- =============================================================================

WITH per_user_30d AS (
  SELECT
    user_id,
    sum(coalesce(tokens_input, 0) + coalesce(tokens_output, 0)) AS tokens_total
  FROM public.chat_messages
  WHERE created_at >= now() - interval '30 days'
  GROUP BY user_id
)
SELECT
  count(*) AS users_with_activity,
  count(*) FILTER (WHERE tokens_total > 100000) AS users_over_free_cap,
  round(100.0 * count(*) FILTER (WHERE tokens_total > 100000) / NULLIF(count(*), 0), 2) AS pct_over_free_cap,
  count(*) FILTER (WHERE tokens_total > 2000000) AS users_over_pro_soft_cap,
  round(100.0 * count(*) FILTER (WHERE tokens_total > 2000000) / NULLIF(count(*), 0), 2) AS pct_over_pro_soft_cap,
  count(*) FILTER (WHERE tokens_total > 3000000) AS users_over_annual_soft_cap,
  round(100.0 * count(*) FILTER (WHERE tokens_total > 3000000) / NULLIF(count(*), 0), 2) AS pct_over_annual_soft_cap
FROM per_user_30d;

-- =============================================================================
-- 4) Early adopter allocation check (should never exceed 100)
-- =============================================================================

SELECT
  count(*) FILTER (WHERE reason = 'early_adopter_100') AS early_adopter_count
FROM public.user_entitlement_overrides;

SELECT
  u.id AS user_id,
  u.created_at,
  COALESCE(o.override_plan_id, 'free') AS override_plan_id,
  (o.override_plan_id = 'pro_early') AS has_pro_early,
  o.reason
FROM auth.users u
LEFT JOIN public.user_entitlement_overrides o
  ON o.user_id = u.id AND o.reason = 'early_adopter_100'
ORDER BY u.created_at ASC
LIMIT 105;

-- =============================================================================
-- 5) Subscription correctness checks
-- =============================================================================

-- 5a) Subscriptions by status
SELECT status, count(*) AS count
FROM public.subscriptions
GROUP BY status
ORDER BY count DESC;

-- 5b) Users with stripe_customer_id but no active subscription
SELECT
  user_id,
  stripe_customer_id,
  status,
  current_period_end
FROM public.subscriptions
WHERE stripe_customer_id IS NOT NULL
  AND NOT (
    status IN ('active', 'trialing', 'past_due')
    OR (status = 'canceled' AND current_period_end > now())
  );

-- 5c) Active subscriptions missing plan_id mapping
SELECT
  id AS subscription_id,
  user_id,
  status,
  price_id,
  plan_id
FROM public.subscriptions
WHERE (
    status IN ('active', 'trialing', 'past_due')
    OR (status = 'canceled' AND current_period_end > now())
  )
  AND (
    plan_id IS NULL
    OR plan_id = ''
    OR plan_id NOT IN (SELECT plan_id FROM public.plan_entitlements)
  );

