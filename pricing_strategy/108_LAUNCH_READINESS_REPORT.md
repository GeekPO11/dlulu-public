# Launch Readiness Report — Pricing & Billing

> **Status**: **NO-GO (pending staging verification)**
> **Owner**: Release Captain / QA Lead
> **Date**: 2026-02-04

---

## 1) Feature Readiness Checklist (Pass/Fail Gates)

| Area | Status | Evidence | Notes |
|:---|:---|:---|:---|
| Entitlements resolver | **PASS** | `supabase/functions/_shared/entitlements.ts` | Cached plan lookup, override/subscription/default order. |
| Enforcement — Goals | **PASS (code)** | `supabase/functions/chat/index.ts` | Server-side tool gate + limit event. Needs staging verification. |
| Enforcement — Tokens | **PASS (code)** | `supabase/functions/_shared/entitlements.ts` | Metering pipeline + idempotent usage events; requires staging verification. |
| Enforcement — Schedule gate | **PASS (code)** | `supabase/functions/generate-schedule/index.ts` | Calendar sync blocked for free. Needs staging verification. |
| Early adopter trigger | **PASS (code)** | `migrations/20250204_entitlements.sql` | Advisory lock + insert on auth.users. Needs staging validation (#1–#101). |
| Stripe Checkout | **PASS (code)** | `supabase/functions/stripe-checkout/index.ts` | Metadata + client_reference_id. Needs live test. |
| Stripe Webhook mapping | **PASS (code)** | `supabase/functions/stripe-webhook/index.ts` | User resolution priority + plan mapping. Needs replay test. |
| Stripe Portal | **PASS (code)** | `supabase/functions/stripe-portal/index.ts` | Requires customer id lookup. Needs live test. |
| Frontend CTAs | **PASS (code)** | `components/GoalLibrary.tsx`, `components/SettingsPage.tsx` | Wired to edge functions. Needs UX verification. |

---

## 2) Data Readiness Checklist

| Data Signal | Status | Notes |
|:---|:---|:---|
| Token tracking present and reliable | **PASS (code)** | Usage events + period counters; verify tokens from Gemini in staging. |
| Validation queries ready | **PASS** | `pricing_strategy/109_VALIDATION_QUERIES.sql` |
| Analytics sink available | **PASS** | Middleware log sink via `_shared/logger` + `_shared/analytics` |

---

## 3) Risk Register (Top 8)

1. **Token metering accuracy** → Limits may drift if tokens missing.  
   *Mitigation*: Log missing token counts, validate usage queries weekly.  
   *Monitor*: token usage queries, limit-hit events.
2. **Webhook failures** → Subscriptions not updated.  
   *Mitigation*: Stripe retry + alert on webhook 5xx.  
   *Monitor*: webhook error rate, missing plan_id.
3. **Price→plan mapping drift** → Wrong entitlements.  
   *Mitigation*: Env var mapping + validation query.  
   *Monitor*: subscriptions with invalid plan_id.
4. **Early adopter allocation edge** → >100 overrides.  
   *Mitigation*: advisory lock in trigger.  
   *Monitor*: override count query.
5. **Throttle UX confusion** → Support burden.  
   *Mitigation*: clear messaging + analytics.  
   *Monitor*: throttled events, support tickets.
6. **Portal/checkout broken redirects** → Billing churn.  
   *Mitigation*: verify URLs in staging/prod.  
   *Monitor*: checkout_started vs checkout_completed.
7. **Plan cache staleness** → Delayed entitlement changes.  
   *Mitigation*: 60s TTL + verify in staging.  
   *Monitor*: flip latency.
8. **Analytics gaps** → No visibility post-launch.  
   *Mitigation*: ensure log sink is configured.  
   *Monitor*: event volume in Middleware.

---

## 4) Go / No-Go Criteria

**Must be green to ship:**
1. Token metering pipeline implemented and verified (limits trigger at small caps).
2. Staging test script passes (T1–T12 + billing lifecycle).
3. Stripe webhook signature verification passes and updates `subscriptions`.
4. Early adopter cap holds at 100 in staging.
5. Validation queries run without errors; output ratio p90/p99 within reasonable bounds.
6. All required env vars set in prod.

---

## 5) Post-Launch Tuning Plan (Week 1)

- Use `plan_entitlements` to adjust caps safely (no code deploy needed).
- Review `pricing_checkout_start → checkout_completed` funnel daily.
- Track token usage p95/p99 weekly; raise/lower caps accordingly.
- Monitor `limit_hit` vs `throttled` volumes for user friction.
- Validate output token ratio (target ~15%) and re-run cost model if it drifts.
