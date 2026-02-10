# P0/P1 Remediation Plan - 2026-02-07

## Objective
Close all P0 and P1 blockers for production trust, auth reliability, onboarding completion, billing integrity, and security posture.

## Severity Definitions
- P0: Risk of data leak, auth/billing corruption, or user-blocking failures in core journeys.
- P1: High-impact trust, compliance, and UX gaps that materially reduce conversion or retention.

## Current State (as of 2026-02-07)
- Auth/signup was failing when Supabase env vars were missing because client code silently fell back to `127.0.0.1:54321`.
- Onboarding walkthrough had phase coverage gaps previously; feasibility walkthrough coverage is now implemented and validated.
- DB integrity/security fixes exist and are now dated for today in migration filenames.

## P0 Plan

### P0-1 Auth Configuration Guardrails
- Goal: prevent silent fallback auth failures and show deterministic error messages.
- Changes:
  - `lib/supabase.ts`
  - `lib/hooks/useSupabaseData.ts`
- Actions:
  1. Require explicit Supabase env configuration unless local fallback is intentionally enabled via `VITE_USE_LOCAL_SUPABASE=true`.
  2. Return explicit config errors from auth and edge-function helpers.
  3. Normalize auth connectivity failures to user-actionable copy.
- Status: Completed in code.
- Verification:
  - Local signin/onboarding on `http://localhost:3000` with real account.
  - Targeted Vitest auth/onboarding suites passing.

### P0-2 Security Exposure Lockdown
- Goal: remove accidental debug-data exposure and unsafe access policies.
- Changes:
  - `supabase/functions/debug-state/index.ts`
  - `supabase/functions/_shared/cors.ts`
  - `supabase/migrations/20260207163000_lock_down_debug_logs.sql`
- Actions:
  1. Restrict debug endpoint execution context and response scope.
  2. Lock `debug_logs` access to `service_role` only.
- Status: Implemented; migration ready for prod push.
- Verification:
  - Run function smoke call with non-privileged token should fail.
  - Confirm RLS policy in production after migration apply.

### P0-3 Usage Metering Idempotency
- Goal: eliminate duplicate usage increments from retry/replay requests.
- Changes:
  - `supabase/migrations/20260207163100_fix_record_usage_event_idempotency.sql`
- Actions:
  1. Persist usage event IDs as unique keys.
  2. Increment usage only on first-seen event ID.
- Status: Implemented; migration ready for prod push.
- Verification:
  - Replay same event ID twice and assert second call returns no increment.

## P1 Plan

### P1-1 Plan Entitlement Data Trust
- Goal: repair and enforce plan cap values.
- Changes:
  - `supabase/migrations/20260207163200_fix_plan_entitlement_caps.sql`
- Actions:
  1. Upsert canonical entitlement values.
  2. Repair corrupted low cap values.
- Status: Implemented; migration ready for prod push.
- Verification:
  - Query `plan_entitlements` after migration and validate expected caps.

### P1-2 Onboarding Walkthrough Completeness
- Goal: ensure guided onboarding exists on all critical phases including feasibility review.
- Changes:
  - `components/Onboarding.tsx`
  - `tests/onboarding-flow.test.tsx`
  - `audit_artifacts/walkthrough_audit.mjs`
- Actions:
  1. Add feasibility walkthrough phase and targets.
  2. Render walkthrough overlay in feasibility flow.
  3. Add test coverage for feasibility walkthrough hooks.
- Status: Completed and validated.
- Verification:
  - End-to-end audit report: `audit_artifacts/walkthrough-audit-report.json`.

### P1-3 Runtime Hardening and Trust Copy
- Goal: reduce legal/trust friction and tighten runtime policy.
- Changes:
  - `index.html`
  - `components/PricingPage.tsx`
  - `components/LandingPage.tsx`
- Actions:
  1. Keep CSP baseline in shell and remove risky hardcoded values where possible.
  2. Align product copy with shipped capabilities.
- Status: In progress.
- Verification:
  - Manual smoke across landing, pricing, checkout, and settings.

### P1-4 Regression Safety Net
- Goal: keep critical auth/onboarding journeys protected by tests.
- Changes:
  - `tests/landing-page.test.tsx`
  - `tests/onboarding.test.tsx`
  - `tests/onboarding-flow.test.tsx`
  - `tests/reset-password.test.tsx`
- Actions:
  1. Update brittle selectors and assertions.
  2. Keep coverage on signup, login, reset password, and onboarding transitions.
- Status: Completed for targeted suites.
- Verification:
  - `npm test -- --run tests/onboarding-flow.test.tsx tests/onboarding.test.tsx tests/landing-page.test.tsx tests/reset-password.test.tsx`

## Deployment Order (Prod)
1. Apply P0/P1 DB migrations dated today (`20260207...`) first.
2. Deploy Supabase function changes.
3. Deploy frontend changes.
4. Run smoke suite: signup/login, onboarding, pricing, checkout, settings.

## DB Migration Naming Convention
Only push these DB files for today’s prod change set:
- `supabase/migrations/20260207163000_lock_down_debug_logs.sql`
- `supabase/migrations/20260207163100_fix_record_usage_event_idempotency.sql`
- `supabase/migrations/20260207163200_fix_plan_entitlement_caps.sql`

## Rollback Strategy
- DB: forward-only; use compensating migrations if needed.
- App/functions: standard deploy rollback to previous artifact.

## Exit Criteria
- No auth fallback to unintended localhost endpoints when env is misconfigured.
- No public debug log read/write access.
- Usage meter is idempotent by event ID.
- Onboarding walkthrough appears in profile, ambitions, status, blueprint, and feasibility phases.
- Targeted auth/onboarding tests and local flow checks pass.
