# DB Migration Push Guide (2026-02-08)

## Push this migration file for today's release
- `supabase/migrations/20260208171000_pregolive_consolidated_fixes.sql`

## Why this file
- It consolidates the mixed P0/P1 DB changes into one idempotent migration.
- It includes security, billing integrity, plan cap correction, and profile billing columns.
- It is safe to apply on environments that already have partial prior migrations.

## Included fixes
- `subscriptions`: `stripe_customer_id` + index + RLS policies.
- `plan_entitlements`: public read policy + corrected plan caps.
- `debug_logs`: removal of open policy, service-role-only access.
- `usage_events` + idempotent `record_usage_event`.
- `profiles`: billing metadata columns.

## Mixed files status
- Existing mixed files are retained for history/context.
- For this release push, use only the consolidated migration above.
