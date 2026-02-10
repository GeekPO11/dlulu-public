# Implementation Checklist

> **Goal**: Ship Configurable Pricing & Early Adopter Program.

## Phase 1: Database & Foundation
- [ ] **Migration**: Create `20250204_entitlements.sql`.
    - [ ] `plan_entitlements` table.
    - [ ] `user_entitlement_overrides` table.
    - [ ] `subscriptions` table.
    - [ ] Seed constants (Free: 1 goal/100k, Pro: Infinite/10M, Early: Infinite/10M).
- [ ] **Trigger**: Implement `early_adopter_assign` trigger on `auth.users` (Limit 100).
- [ ] **Secrets**: Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` to Supabase Dashboard.
- [ ] **Shared Logic**: Create `_shared/entitlements.ts` (Resolver).
- [ ] **Shared Logic**: Create `_shared/metering.ts` (Usage aggregation).

## Phase 2: Edge Functions (Enforcement)
- [ ] **Chat**: Modify `chat/index.ts`.
    - [ ] Import `getEntitlements` and `trackUsage`.
    - [ ] **Step A**: Gate `create_goal` tool availability based on goal count.
    - [ ] **Step B**: Check token usage before Gemini call.
    - [ ] **Step C**: Record token usage after Gemini call.
- [ ] **Schedule**: Modify `generate-schedule/index.ts`.
    - [ ] Gate execution based on `calendar_sync_enabled`.
- [ ] **Stripe Webhook**: Create `stripe-webhook` function.
    - [ ] Handle `customer.subscription.*` events.
    - [ ] Update `subscriptions` table.

## Phase 3: Frontend UX
- [ ] **State**: Create `useEntitlements` hook (swr/tanstack-query).
    - [ ] Returns `{ plan, limits, usage, isEarlyAdopter }`.
- [ ] **Goal Library**:
    - [ ] Gating logic on "Add Goal" button.
    - [ ] Upgrade Modal component.
- [ ] **Settings**:
    - [ ] Show Plan Badge.
    - [ ] Show Usage Bars (Goals, Tokens).
    - [ ] "Restore Purchase" / "Manage Subscription" buttons.
- [ ] **Chat**:
    - [ ] Handle "Limit Reached" errors gracefully (Toast/Modal).

## Phase 4: Verification (QA)
- [ ] **T10**: New User Signup (User #<100) -> Check DB for `pro_early` override.
- [ ] **T12**: New User Signup (User #101) -> Check DB for `free` entitlement.
- [ ] **T8**: Free user -> Try `generate-schedule` -> Expect 403.
- [ ] **T9**: Pro user -> Try `generate-schedule` -> Expect Success.

## Phase 5: Launch
- [ ] **Deploy**: `supabase functions deploy`.
- [ ] **Config**: Set `early_adopter_limit` in DB if using `app_config`.
- [ ] **Monitor**: Watch `handle_new_user_entitlement` logs for first 100 users.
