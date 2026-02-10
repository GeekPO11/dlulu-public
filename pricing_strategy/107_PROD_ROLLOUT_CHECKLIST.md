# Production Rollout Checklist — Pricing & Billing

> **Status**: Ready
> **Owner**: Release Captain
> **Date**: 2026-02-04

---

## 1) Required Environment Variables

### Supabase Edge Functions
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_PRO_ANNUAL`
- `STRIPE_SUCCESS_URL`
- `STRIPE_CANCEL_URL`
- `STRIPE_PORTAL_RETURN_URL`
- `ENTITLEMENTS_STAGING_PLAN_ID` **must be empty in prod**

### Middleware / Logging (already used by edge logger)
- `MW_LOG_TARGET`
- `MW_LOG_API_KEY`
- `MW_ACCOUNT_KEY`
- `MW_SERVICE_NAME`
- `MW_PROJECT_NAME`
- `MW_ENV`

---

## 2) Database Migrations

### Apply
- `migrations/20250204_entitlements.sql`
- `supabase/migrations/20260204_add_stripe_customer_id.sql`

### Verify
```sql
SELECT plan_id, max_active_goals, token_hard_cap, token_soft_cap, calendar_sync_enabled
FROM plan_entitlements
WHERE plan_id IN ('free','pro_monthly','pro_annual','pro_early');
```

```sql
SELECT count(*) FILTER (WHERE reason = 'early_adopter_100') AS early_adopter_count
FROM user_entitlement_overrides;
```

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'subscriptions'
  AND column_name = 'stripe_customer_id';
```

---

## 3) Stripe Webhook Setup

- Endpoint URL: `https://<PROJECT>.supabase.co/functions/v1/stripe-webhook`
- Events:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
- Verify signature:
  - Send a test event from Stripe Dashboard
  - Ensure function returns 200 and updates `subscriptions`

---

## 4) Smoke Tests (Manual)

### Free Tier
- **T1**: Create 1st goal → Success
- **T2**: Create 2nd goal → Blocked + upgrade CTA
- **T4**: Chat over token hard cap → 402/403 response
- **T8**: Generate schedule → 403 upgrade required

### Pro Tier
- Purchase Pro → Entitlements flip within 30s
- Generate schedule → Success
- Token soft cap → Request throttled (slow response)

### Early Adopter
- Pro features available without Stripe
- Settings shows “Included (Early Adopter)”

### Billing Portal
- Manage Billing opens Stripe portal session

---

## 5) Monitoring

- Webhook error rate (5xx)
- Checkout conversion: `checkout_started` → `checkout_completed`
- `limit_hit` counts (goals/tokens)
- `throttled` events
- Edge function latency spikes (chat + schedule)

---

## 6) Backout Plan

1. Disable “Upgrade” CTA in UI (feature flag or quick UI patch).
2. Set all plans to free via `plan_entitlements`:
   ```sql
   UPDATE plan_entitlements
   SET token_hard_cap = 100000,
       token_soft_cap = NULL,
       max_active_goals = 1,
       calendar_sync_enabled = false;
   ```
3. Disable Stripe webhook endpoint in Stripe Dashboard.
4. Announce rollback in internal channel.
