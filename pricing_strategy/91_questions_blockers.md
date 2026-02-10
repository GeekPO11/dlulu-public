# Questions & Blockers (Updated)

> **Status**: Living Document
> **Last Updated**: 2026-02-04

## Critical Blockers (Must Solve Before Final Pricing)

1.  **B1: Revenue vs Growth Priority?**
    *   Does the user want *maximum users* (Loss leader / Freemium) or *immediate revenue* (Paywall)?
    *   *Owner*: User

2.  **B3: Cost of Goods Sold (COGS) Reality?**
    *   What is the *actual* monthly bill for Supabase + Gemini right now?
    *   *Owner*: DevOps / User
    
3.  **B5: Gemini 3 Flash Pricing Confirmation**
    *   Are we definitely paying $0.50/$3.00?
    *   *Owner*: Engineering check Google Cloud Console.
    
4.  **B7: Secrets Management**
    *   Need `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` in Supabase Edge Runtime.
    *   *Owner*: DevOps.

## Data Needs

*   [ ] **Token Usage Stats**: `SELECT avg(tokens_input + tokens_output) FROM chat_messages` (Establish Fair Use Baseline)
*   [ ] **Goal Distribution**: `SELECT count(*) FROM goals GROUP BY user_id` (Validate <2 goals for Free tier)
*   [ ] **Feature Usage**: How often is `generate-schedule` called vs `chat`?
*   [ ] **Validation Queries**: See `pricing_strategy/109_VALIDATION_QUERIES.sql`

## Non-Blocker Questions
*   N1: Is there a "Team" edition roadmap? (Affects schema design)
*   N2: What is the churn rate? (Retention)
*   N3: How do we "Verify" a user for Early Adopter? (Currently trusting `auth.users` count)

## Resolved Blockers

*   **B2: Billing Infrastructure Strategy?** Resolved — Stripe implemented (2026-02-04).
*   **B8: Token Metering Pipeline Missing** Resolved — usage_events + user_usage_periods metering implemented (2026-02-04).
