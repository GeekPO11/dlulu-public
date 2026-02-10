# Code Touchpoints Map

> **Status**: Final V1
> **Purpose**: Exact file locations for Engineering Handoff.

## 1. Database & Migrations
**Path**: `supabase/migrations/`

### A. New Migration File
Create `20250204000000_pricing_entitlements.sql` containing:
1.  **Tables**:
    *   `plan_entitlements` (Ref: `100_BILLING_SPEC` Sec 2)
    *   `user_entitlement_overrides` (Ref: `104_CONFIG_SPEC`)
    *   `subscriptions` (Ref: `100_BILLING_SPEC` Sec 3)
2.  **Seeding**:
    *   Insert `free`, `pro_monthly`, `pro_annual`, `pro_early` into `plan_entitlements`.
    *   Insert `app_config` key `early_adopter_limit` = 100.
3.  **Trigger**:
    *   Function: `handle_new_user_entitlement()`
    *   Trigger: `AFTER INSERT ON auth.users`
    *   Logic: Check `user_entitlement_overrides` count. If < 100, insert row for new user.

### B. Usage Tracking
**Table**: `user_usage_periods`
*   Ensure this table exists (if not, add to migration).
*   Columns: `user_id`, `period_start`, `period_end`, `token_usage`, `active_goal_count`.

---

## 2. Shared Entitlements Logic ("The Brain")
**New File**: `supabase/functions/_shared/entitlements.ts`

### Responsibilities
1.  **`getEntitlements(userId: string)`**:
    *   Checks `user_entitlement_overrides`.
    *   Checks `subscriptions` table.
    *   Returns `PlanEntitlements` object (merged limits).
2.  **Caching**: Use simple in-memory const `PLAN_CACHE` for `plan_entitlements` (TTL 60s). `subscriptions` must be live fetched.

---

## 3. Enforcement Points (Edge Functions)

### A. AI Chat & Goal Creation
**File**: `supabase/functions/chat/index.ts`
**Insertion Point**: Before `callGeminiAdvanced` (approx Line 926).
**Logic**:
1.  Call `getEntitlements(user.id)`.
2.  **Token Gate**:
    *   Check `usage > limit`.
    *   If Hard Limit hit: Return `Errors.paymentRequired`.
    *   If Soft Limit hit: Append "SYSTEM NOTE: Throttled Economy Mode" to prompt.
3.  **Goal Gate**:
    *   Filter `tools` array.
    *   Check `goals_count >= max_active_goals`.
    *   If limit reached: Remove `create_goal` from `ALL_FUNCTIONS` or wrap it to return a "Limit Reached" error message to the AI.

### B. Schedule Generation (Calendar)
**File**: `supabase/functions/generate-schedule/index.ts`
**Insertion Point**: Line 247 (after body parse).
**Logic**:
1.  Call `getEntitlements(user.id)`.
2.  Check `!entitlements.calendar_sync_enabled`.
3.  If false, return `403 Forbidden` with `{ code: 'UPGRADE_REQUIRED' }`.

---

## 4. Billing Integration (Stripe)

### A. Webhooks
**New Function**: `supabase/functions/stripe-webhook/index.ts`
**Logic**:
*   Handle `customer.subscription.created/updated/deleted`.
*   Upsert to `subscriptions` table.
*   **Security**: Verify signature using `STRIPE_WEBHOOK_SECRET`.

### B. Checkout
**New Function**: `supabase/functions/create-checkout/index.ts`
**Logic**:
*   Call `stripe.checkout.sessions.create`.
*   Return `{ url }`.

---

## 5. Token Metering
**File**: `supabase/functions/chat/index.ts`
**Insertion Point**: Line 976 (End of request, before return).
**Logic**:
*   Calculate `totalTokens = inputTokens + outputTokens`.
*   Call `await trackUsage(user.id, totalTokens)`.
*   **Helper**: `supabase/functions/_shared/metering.ts` (New).
    *   `trackUsage`: Upsert `user_usage_periods` row `token_usage = token_usage + delta`.

---

## 6. Frontend Touchpoints
**App**: `src/App.tsx` or `components/`

### A. Global State
*   Add `useEntitlements()` hook to fetch effective plan + limits on mount.

### B. Goal Library (Add Button)
**File**: `components/GoalLibrary.tsx`
**Insertion Point**: `onAddGoal` prop or the "Add Goal" button UI.
**Logic**:
*   Check `goals.length >= entitlements.max_active_goals`.
*   If true: Disable button or open `<UpgradeModal />`.

### C. Settings & Pricing
**File**: `components/SettingsPage.tsx`
**Logic**:
*   Show "Current Plan: [Badge]".
*   If `pro_early`, show "Early Adopter (Free Forever)".
*   If Free, show "Upgrade to Pro".

### D. Chat Assistant (Token Warnings)
**File**: `components/ChatAssistant.tsx`
**Logic**:
*   Listen for `402 Payment Required` from chat API.
*   Display "Monthly limit reached" toast.

---

## 7. Analytics Events
**File**: `lib/analytics.ts` (or similar) or inline `posthog.capture()`.

*   `limit_reached`:
    *   Context: `GoalLibrary` (Add Goal click), `ChatAssistant` (Token hard stop).
    *   Payload: `{ limit_type: 'goals' | 'tokens' | 'calendar' }`
*   `checkout_started`:
    *   Context: Pricing Modal checkouts.
*   `early_adopter_granted`:
    *   Context: `handle_new_user_entitlement` trigger (log to a table or rely on DB row presence).
