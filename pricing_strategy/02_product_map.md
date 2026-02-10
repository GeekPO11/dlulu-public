# Product Map — Feature to Value/Metric

> **Purpose**: Map features to potential pricing metrics and value.
> **Generated**: 2026-02-03

| Feature | User Value | Trigger (Where Used) | Frequency (Est.) | Measurable Signal | Good Pricing Metric? | Evidence |
|:---|:---|:---|:---|:---|:---|:---|
| **Ambition Analysis** | Clarity on goal complexity | Onboarding | One-off / Rare | Function Call `analyze-ambitions` | **N** (Barrier to entry) | `[supabase/functions/analyze-ambitions]` |
| **Blueprint Generation** | "Magic" breakdown of complex goals | Creating new goal | Low (1-5/mo) | Function Call `generate-blueprint` | **Y** (Per Goal Pricing) | `[supabase/functions/generate-blueprint]` |
| **Full Schedule** | Actionable time-blocks on calendar | Weekly planning | Medium (1-4/mo) | Function Call `generate-schedule` | **Y** (Value-add feature) | `[supabase/functions/generate-schedule]` |
| **AI Chat** | Contextual help & unblocking | Daily usage | High (Daily) | `chat_messages` rows or tokens | **Y** (Usage/Tokens) | `[chat/index.ts]` |
| **Goal Library** | Organization of multiple ambitions | Dashboard | Continuous | `goals` table row count | **Y** (Tiered Limits) | `[components/GoalLibrary.tsx]` |
| **Roadmap Refinement** | Adapting plan to reality | Phase Explorer | Low/Medium | Function Call `refine-roadmap` | **N** (Retention feature) | `[supabase/functions/refine-roadmap]` |
| **Daily Quote** | Motivation | Dashboard load | Daily | Function Call `daily-quote` | **N** (Commodity) | `[supabase/functions/daily-quote]` |
| **Calendar Sync** | Integration with life | Settings | Continuous | Sync API calls | **Y** (Premium Gate) | `[supabase/functions/sync-google-calendar]` (Scaffold) |
| **History/Archives** | Retrospection | Profile/History | Rare | `history_entries` rows | **N** (Data retention only) | `[types.ts > HistoryEntry]` |
| **Task Breakdown** | Granularity | Task View | Medium | `subtasks` row count | **N** (Too granular) | `[types.ts > SubTask]` |

## Analysis of Metrics

1. **Number of Goals**: Strong candidate for tiered pricing (e.g., Free: 1 active goal, Pro: Unlimited). Easy to understand and measure (`goals` table count).
2. **AI Tokens/Usage**: Best for "pay-as-you-go" or fair use limits. Chat is the highest variance driver. `chat_messages` already tracks tokens.
3. **Advanced Features**: "Generative Scheduling" and "Calendar Sync" are clear Pro differentiators.

## Assumptions Logged
- *Frequency estimates are based on typical productivity app patterns, not actual analytics (see 90_assumptions_log.md).*
