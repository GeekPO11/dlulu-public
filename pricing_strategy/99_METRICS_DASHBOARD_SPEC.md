# Metrics Dashboard Specification

> **Tool**: PostHog / Middleware.io / Supabase Dashboard
> **Purpose**: Track the health of the pricing strategy.

---

## 1. High-Level KPI Summary (The "Pulse")
*   **MRR**: Monthly Recurring Revenue (Stripe).
*   **Active Subscribers**: Count of `plan_tier = 'pro'`.
*   **Free-to-Paid Conversion**: (New Subs / New Signups) roughly.

---

## 2. Event Instrumentation Required

| Event Name | Properties | Trigger | Purpose |
|:---|:---|:---|:---|
| `pricing_modal_view` | `source` (limit_hit, settings, button) | User sees paywall. | Funnel top. |
| `pricing_checkout_start`| `plan` (monthly, annual) | User clicks "Upgrade". | Intent. |
| `limit_hit_goal` | `count` | User tries to add 2nd goal. | Paywall effectiveness. |
| `limit_hit_token` | `usage` | User hits 100k/2M limit. | Budget effectiveness. |
| `calendar_sync_enable` | `provider` (google) | User connects calendar. | Retention signal. |
| `blueprint_generated` | `goal_id` | AI creates plan. | Activation. |

---

## 3. SQL Dashboard Queries (Supabase)

### A. Conversion Cohort (Day 7)
*Percentage of users who upgrade within 7 days of signup.*
```sql
SELECT 
  date_trunc('week', signup_date) as cohort,
  count(*) as signups,
  count(*) filter (where plan_tier = 'pro') as upgrades,
  (count(*) filter (where plan_tier = 'pro')::float / count(*)) * 100 as conv_rate
FROM profiles
GROUP BY 1
ORDER BY 1 DESC;
```

### B. Token Usage Distribution (Cost Risk)
*Are Pro users abusing the soft cap?*
```sql
SELECT 
  plan_tier,
  avg(token_usage) as avg_tokens,
  percentile_cont(0.9) within group (order by token_usage) as p90_tokens,
  percentile_cont(0.99) within group (order by token_usage) as p99_tokens
FROM user_usage_periods
WHERE is_active_period = true
GROUP BY plan_tier;
```

### C. North Star Metric: "Weekly Executed Plans"
*Users who marked at least 1 task complete this week.*
```sql
SELECT count(distinct user_id) 
FROM tasks 
WHERE status = 'completed' 
AND completed_at > now() - interval '7 days';
```

---

## 4. Churn Analysis Taxonomy
*Ask churned users "Why?"*
*   `too_expensive`: Price sensitivity ($10 is too high).
*   `limit_frustration`: Hated the token/goal limits.
*   `no_value`: AI didn't help (Quality issue).
*   `competitor`: Switched to Motion/Todoist.
