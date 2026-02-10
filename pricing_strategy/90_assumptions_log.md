# Assumptions Log (Updated)

> **Status**: Living Document
> **Last Updated**: 2026-02-04

## Active Assumptions

| ID | Assumption | Confidence | Impact | Validation Path | Status |
|:---|:---|:---|:---|:---|:---|
| A1 | **App only supports Single-User B2C.** (Evidence: `user_id` FK everywhere, no `org_id`) | High | Critical | Confirm with User. | Open |
| A3 | **Users typically have 1-5 active goals.** (Industry standard) | Low | Medium | Query `goals` table distribution. | Open |
| A4 | **Google Calendar Sync is a highly desired "Pro" feature.** | Medium | Medium | User Feedback / Surveys. | Open |
| A5 | **AI Chat token usage follows a power law.** (Few users use massive amounts) | Medium | Low | Analytics on `chat_messages`. | Open |
| A7 | **Gemini 3 Flash is the ONLY LLM.** (No OpenAI imports found) | High | Medium | Engineering confirmation. | Open |
| A8 | **Goal Creation Frequency is low (<5/mo).** (User behavior assumption) | Low | Medium | Analytics. | Open |
| A9 | **Users value "Structure" (Goals) more than "Chat".** (Hypothesis) | Medium | High | A/B Test Pricing Gates. | Open |
| A10 | **Gemini Output Tokens are ~15% of Total Tokens.** (Chat pattern guess) | Low | Medium | Query `chat_messages` avg inputs/outputs. | Open |
| A11 | **Base Ops Cost per User is $0.50/mo.** (Database/Auth/Misc) | Low | High | Check Supabase invoice vs user count. | Open |
| A12 | **Annual Users use 50% more AI than Monthly users.** | Low | Low | Monitor usage post-launch. | Open |
| A13 | **Competitor Prices used are accurate as of 2025.** (Todoist $5, Motion $34) | High | Medium | Check live pricing pages. | Open |
| A14 | **Stripe 14-day Grace Period is sufficient.** | High | Low | Standard industry practice. | Open |
| A15 | **Token Counter drift of <1% is acceptable.** | High | Low | Engineering tradeoff. | Open |
| A16 | **DB-based Entitlements Caching (60s) is fast enough.** | Medium | Medium | Load test Edge Functions. | Open |
| A17 | **First 100 User limit does not need strict atomic locking.** | High | Low | Rare race condition on user #100 is acceptable. | Open |

## Rejected/Validated Assumptions

| ID | Assumption | Outcome | Evidence | Date |
|:---|:---|:---|:---|:---|
| A2 | **Token tracking is 100% reliable.** | Rejected | `chat_messages.tokens_input/output` not written; `user_usage_periods` has no writers. | 2026-02-04 |
| A6 | **No existing billing integration.** | Resolved | Stripe Checkout/Portal/Webhook implemented. | 2026-02-04 |
