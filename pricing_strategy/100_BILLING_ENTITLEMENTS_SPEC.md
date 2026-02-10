# Billing & Entitlements Specification

> **Status**: Technical Spec (Draft)
> **Stack**: Stripe (Billing) + Supabase (Database/Edge Functions)

---

## 1. Plan Definitions & Entitlements

| Plan ID | Name | Price | Entitlements JSON |
|:---|:---|:---|:---|
| `free` | Dreamer | $0 | `{ "goals": 1, "tokens": 100000, "sync": false, "throttle": false }` |
| `pro_monthly` | Achiever | $10/mo | `{ "goals": 9999, "tokens": 2000000, "sync": true, "throttle": true }` |
| `pro_annual` | Achiever (Yearly) | $100/yr | `{ "goals": 9999, "tokens": 3000000, "sync": true, "throttle": true }` |

*Note: "throttle: true" means soft cap logic applies. Free has "throttle: false" meaning Hard Stop logic applies.*

---

## 2. Data Model Schema

### A. User Profile (Plan State)
Extensions to `profiles` table for fast access to entitlement state.
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan_tier text DEFAULT 'free'; -- 'free', 'pro'
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_status text; -- 'active', 'past_due', 'canceled'
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id text;
```

### B. Subscriptions Table (Source of Truth)
Maps Stripe webhooks to local state.
```sql
CREATE TABLE subscriptions (
  id text PRIMARY KEY, -- Stripe Subscription ID (sub_...)
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  status text NOT NULL, -- 'active', 'trialing', 'past_due', 'canceled'
  price_id text NOT NULL,
  cancel_at_period_end boolean DEFAULT false,
  current_period_end timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);
```

### C. Configurable Entitlements & Overrides (New)
See `104_CONFIG_AND_EARLY_ADOPTER_SPEC.md` for full schema.
*   `plan_entitlements`: Defines the limits (goals, tokens) for each plan ID.
*   `user_entitlement_overrides`: grants 'pro_early' to specific users (e.g., first 100).

### D. Usage Periods (Quota Tracking)
Already defined in `95_ENFORCEMENT_IMPLEMENTATION_PLAN.md`.
*   Fields: `user_id`, `period_start`, `period_end`, `token_usage`, `active_goal_count`.
*   **Logic update**: `period_end` should align with `subscriptions.current_period_end` for paid users.

---

## 3. Stripe Design

### Products & Prices
1.  **Product**: "dlulu Pro"
    *   **Price 1**: $10 USD / Month (`price_pro_monthly`)
    *   **Price 2**: $100 USD / Year (`price_pro_annual`)

### Webhook Handling
*   `checkout.session.completed`: Grant access immediately. Upsert `subscriptions` table. Update `profiles.plan_tier = 'pro'`.
*   `customer.subscription.updated`: Handle renewals, cancellations (set `cancel_at_period_end`).
*   `customer.subscription.deleted`: Downgrade logic. Set `profiles.plan_tier = 'free'`.
*   `invoice.payment_failed`: Update status to `past_due`. Grace period handled by Stripe settings (usually 14 days), then `deleted`.

### Customer Portal
Enable Stripe Customer Portal for:
*   Updating payment methods.
*   Downloading invoices.
*   Cancelling subscription.
*   Switching plans (Monthly <-> Annual).

---

## 4. Entitlement Resolution Logic

**The "Get Entitlements" Function (`/_shared/entitlements.ts`)**
1.  **Check Overrides**: Query `user_entitlement_overrides`. If valid record found -> Return `pro_early` entitlements.
2.  **Check Stripe**: Query `subscriptions` table for active record.
    *   If `active` OR `past_due` (grace period) -> Return Pro entitlements (`pro_monthly`/`pro_annual`).
    *   If `canceled` AND `current_period_end > now()` -> Return Pro entitlements.
3.  **Default**: Return Free entitlements.

**Note**: All limits (goals count, token caps) are fetched from the `plan_entitlements` table using the resolved plan ID. Do NOT hardcode "100,000" in TS.

---

## 5. Enforcement Points

### A. Middleware Gates (`/_shared/gate.ts`)
*   **Goal Creation**:
    *   If `plan == free`, count `active_goals`. If >= 1, Throw `403-Upgrade`.
*   **Calendar Sync**:
    *   If `plan == free`, API calls to `/sync-google-calendar` reject with `403-Upgrade`.
*   **Token Hard Stop (Free Only)**:
    *   If `usage > 100k`, API calls to `/chat` reject with `403-Quota`.

### B. Throttle Logic (Pro Only)
*   Inside `/chat` edge function:
    *   If `usage > 2M` (Pro) or `3M` (Annual):
        *   Inject `await new Promise(r => setTimeout(r, 3000));` (Artificial Latency).
        *   Switch `MODEL` from `flash` to `flash-8b` (if available/cheaper) or keep same.
        *   Add header `X-Throttle-Active: true`.

---

## 6. Security & consistency
1.  **Webhook Signatures**: Must verify `stripe-signature` header using `STRIPE_WEBHOOK_SECRET` in Edge Function.
2.  **Idempotency**: `checkout.session.completed` might fire multiple times. `UPSERT` on `subscriptions` table using `id` as key.
3.  **RLS**: `subscriptions` table should be readable by `user_id` (so they can see their own status) but writeable ONLY by `service_role` (webhooks).

---

## 7. Migration Plan
*   **Early Adopter Program**:
    *   The first **100 users** will be automatically assigned to `pro_early` via DB trigger.
    *   No Stripe subscription needed for them.
    *   This replaces the "30 Day Trial" idea.
    *   Later users default to `free`.
