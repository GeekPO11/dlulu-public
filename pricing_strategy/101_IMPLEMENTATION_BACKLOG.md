# Implementation Backlog

> **Status**: Ready for Sprint Planning
> **Total Epics**: 8

---

## MVP Sprint Plan (The "Must Haves")
1.  **Schema**: Create `user_usage_periods` and `subscriptions` tables.
2.  **Stripe**: Set up products + Webhook handler for `checkout.session.completed` & `subscription.deleted`.
3.  **Pricing Page**: UI to click "Upgrade" and go to Stripe Checkout.
4.  **Enforcement**: Middleware to block 2nd goal (Free) and count tokens.

---

## Epics & Stories

### EPIC 1: Billing & Subscription Lifecycle (Stripe)
*   **Story 1.1: Stripe Product Setup**
    *   *AC*: Pro Monthly ($10) and Annual ($100) created in Stripe Test Mode. IDs recorded in env vars.
*   **Story 1.2: Checkout Session Edge Function**
    *   *AC*: POST `/create-checkout-session` returns a stripe URL. Supports `price_id` param. Passes `user_id` in metadata.
*   **Story 1.3: Webhook Handler (Provisioning)**
    *   *AC*: Endpoint `/stripe-webhook` verifies signature. On `checkout.session.completed`, inserts record into `subscriptions` and updates `profiles.plan_tier`. Handles idempotency.
*   **Story 1.4: Webhook Handler (Churn)**
    *   *AC*: On `customer.subscription.deleted`, updates `subscriptions.status` and sets `profiles.plan_tier` to 'free'.
*   **Story 1.5: Customer Portal**
    *   *AC*: POST `/create-portal-session` returns URL to Stripe portal for card updates/cancels.

### EPIC 2: Entitlements & Plan State
*   **Story 2.1: Database Schema Migration**
    *   *AC*: Migration file created for `subscriptions` and `profiles` updates. RLS policies applied (read-own, write-service).
*   **Story 2.2: Entitlements Utility**
    *   *AC*: `getEntitlements(user_id)` function written in `_shared`. Returns correct limits based on DB state + grace period logic.

### EPIC 3: Metering Storage
*   **Story 3.1: Usage Period Schema**
    *   *AC*: `user_usage_periods` table created. Unique constraint on `(user_id, period_start)`.
*   **Story 3.2: Token Counter Trigger**
    *   *AC*: API call (or DB trigger) increments `token_usage` in current period when `chat_messages` are saved. Handles "no active period" by creating one on fly.

### EPIC 4: Enforcement Middleware
*   **Story 4.1: Goal Creation Gate**
    *   *AC*: `create_goal` function checks `active_goals` count against entitlement. Throws 403 if limit reached.
*   **Story 4.2: Free Token Hard Stop**
    *   *AC*: `chat` function checks usage. If Free & >100k, returns 403 with specific "Quota Exceeded" error code.
*   **Story 4.3: Pro Throttler**
    *   *AC*: `chat` function sleeps for 3s if Pro & >2M tokens. Adds `X-Throttle` header.

### EPIC 5: Google Calendar Sync Gating
*   **Story 5.1: Backend Gate**
    *   *AC*: `generate-schedule` throws 403 if `plan != pro`.
*   **Story 5.2: Frontend UI State**
    *   *AC*: Toggle for "Sync" is disabled/locked for Free users with tooltip.

### EPIC 6: Pricing Page & UX Update
*   **Story 6.1: Pricing Page Implementation**
    *   *AC*: `PricingPage.tsx` built with copy from `98_PRICING_PAGE_COPY`. Connects to Checkout API.
*   **Story 6.2: Upgrade Modal**
    *   *AC*: Reusable Modal component triggered by 403-Upgrade errors. Shows feature comparison + checkout button.
*   **Story 6.3: Usage Progress Bar**
    *   *AC*: Settings page shows "Credits Used: X / Y". Visual warning at 80%.

### EPIC 7: Analytics
*   **Story 7.1: PostHog/Middleware Events**
    *   *AC*: Events `checkout_started`, `limit_hit`, `subscription_active` firing from backend/frontend.

### EPIC 9: Configurable Entitlements (New)
*   **Story 9.1: Entitlements Schema**
    *   *AC*: Create `plan_entitlements` and `user_entitlement_overrides` tables. Seed with Free/Pro/Early definitions.
*   **Story 9.2: Dynamic Resolver**
    *   *AC*: `getEntitlements` in `_shared` fetches from DB tables with caching. Should resolve Override -> Stripe -> Free.
*   **Story 9.3: Early Adopter Allocator**
    *   *AC*: Trigger on `auth.users` insert automatically adds override row IF count < 100.
*   **Story 9.4: Refactor Enforcement**
    *   *AC*: Update middleware to read limits from resolved plan object, not constants.
*   **Story 9.5: Plan Visibility Key**
    *   *AC*: Make sure frontend can see "Early Adopter" status in `profiles` to show correct badge ("Early Bird Pro").

---

## Risks & Mitigations
*   **Risk**: Webhook failure puts user in limbo.
    *   *Mitigation*: "Refresh Status" button in Settings that polls Stripe API directly to self-heal.
*   **Risk**: Token counters drift (concurrency).
    *   *Mitigation*: Atomic SQL increments (`token_usage = token_usage + X`). Accept small drift (<1%) as acceptable for soft caps.
