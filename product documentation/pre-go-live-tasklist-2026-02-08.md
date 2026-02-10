# Pre-Go-Live Tasklist (2026-02-08)

## P0 (Must pass before launch)
- [x] Enforce non-Pro goal limit (max 1 active goal on free) in dashboard/goals add-goal entry points.
- [x] Block accidental onboarding entry for add-goal when entitlement limit is reached.
- [x] Fix blueprint navigation guardrails:
  - [x] Back action available from first blueprint to Status Check.
  - [x] Right arrow disabled on last/only blueprint (no unintended publish/proceed).
- [x] Lock down `debug_logs` access to `service_role` only.
- [x] Replace non-idempotent usage metering with event-idempotent `record_usage_event`.
- [x] Build and run critical regression suite.

## P1 (Required for strong launch quality)
- [x] Unify onboarding top navigation/header patterns.
- [x] Standardize feasibility review status colors and labels (`Low`/`Medium`/`High`).
- [x] Replace priority/safety ambiguity with explicit level mapping.
- [x] Rename theme labels to Gen Z-safe and non-copyright names.
- [x] Keep brown/orange theme named `Original`.
- [x] Add add-goal upgrade continuation flow after successful upgrade.
- [x] Add explicit post-upgrade unlock messaging in checkout flow.
- [x] Add reusable automation scripts for repeated quality checks.
- [x] Consolidate DB changes into one push-safe migration file for today.

## P2 (Post-launch backlog)
- [ ] Full live browser walkthrough on local `http://127.0.0.1:3000` (requires elevated run permission).
- [ ] End-to-end Stripe happy-path and cancel-path runbook with screenshots.
- [ ] Product tour UX polish pass:
  - [ ] Reduce tooltip overlap on narrow viewports.
  - [ ] Add explicit skip/resume persistence validation.
- [ ] Add Playwright e2e specs for upgrade-gated add-goal path.
- [ ] Add size optimization follow-up for large JS chunk warning in production build.
