# Repo Map — Evidence-Based Analysis

> Generated: 2026-02-03  
> Purpose: Ground all pricing decisions in actual codebase evidence.

---

## 1. Repo Structure Overview

```
dlulu/
├── App.tsx                    # Main React application (87KB)
├── components/                # 44 React components
│   ├── Onboarding.tsx         # Multi-step onboarding (96KB)
│   ├── GoalLibrary.tsx        # Goal management (64KB)
│   ├── CalendarView.tsx       # Calendar/scheduling (103KB)
│   ├── ChatAssistant.tsx      # AI chat interface (30KB)
│   ├── PhaseExplorer.tsx      # Roadmap visualization (189KB)
│   └── Dashboard.tsx          # Main dashboard (35KB)
├── services/gemini/           # AI service layer (12 files)
│   ├── client.ts              # Gemini API client
│   ├── scheduling.ts          # AI-powered scheduling
│   ├── planning.ts            # Blueprint generation
│   └── chatbot.ts             # Chatbot logic
├── lib/                       # Shared utilities
│   ├── supabase.ts            # Supabase client config
│   ├── hooks/                 # Custom React hooks
│   └── api/                   # API transformers
├── supabase/
│   ├── functions/             # 12+ Edge Functions
│   └── migrations/            # 14 DB migrations
└── types.ts                   # Type definitions (23KB)
```

---

## 2. Tech Stack Detection (with Evidence)

### Languages & Frameworks
| Technology | Evidence |
|------------|----------|
| **TypeScript** | `[tsconfig.json]`, all `.ts`/`.tsx` files |
| **React 19** | `[package.json > dependencies > react: "^19.2.3"]` |
| **Vite** | `[vite.config.ts]`, `[package.json > devDependencies > vite]` |
| **Tailwind CSS** | `[tailwind.config.js]`, `[package.json > tailwindcss]` |
| **Radix UI** | `[package.json > @radix-ui/*]` — 10 packages |

### Backend & Persistence
| Technology | Evidence |
|------------|----------|
| **Supabase** | `[package.json > @supabase/supabase-js: "^2.89.0"]` |
| **PostgreSQL** | `[supabase/migrations/*.sql]` — 14 migration files |
| **Supabase Auth** | `[lib/supabase.ts > auth.signUp, auth.signInWithPassword, auth.signInWithOAuth]` |
| **Supabase Edge Functions** | `[supabase/config.toml]` — 12 functions configured |
| **Row Level Security** | `[supabase/migrations/20241230000001_rls_policies.sql]` |

### Infrastructure & Deploy
| Technology | Evidence |
|------------|----------|
| **Supabase Hosting** | `[lib/supabase.ts > FALLBACK_SUPABASE_URL: "ahqwdgacvbwkekztmmij.supabase.co"]` |
| **Deno (Edge Functions)** | `[supabase/functions/_shared/gemini.ts > Deno.env.get]` |
| **No Docker** | No Dockerfile found in repo |
| **No K8s/Terraform** | No infrastructure-as-code files found |

### AI & LLM
| Technology | Evidence |
|------------|----------|
| **Google Gemini** | `[supabase/functions/_shared/gemini.ts > gemini-3-flash-preview]` |
| **Gemini 3 Flash** | `[services/gemini/client.ts > MODEL: 'gemini-3-flash-preview']` |
| **No OpenAI** | Only mentioned in `[components/LandingPage.tsx]` as example — not integrated |

### No Queues/Jobs Detected
| Technology | Evidence |
|------------|----------|
| **No Kafka/SQS/RabbitMQ** | No message queue imports found |
| **No Cron Workers** | No cron configuration detected |
| **Edge Functions only** | All async work via Supabase Edge Functions |

---

## 3. Third-Party Integrations

| Integration | Status | Evidence |
|-------------|--------|----------|
| **Supabase** | ✅ Active | `[lib/supabase.ts]` — primary backend |
| **Google Gemini API** | ✅ Active | `[supabase/functions/_shared/gemini.ts]` |
| **Google OAuth** | ✅ Active | `[lib/supabase.ts > signInWithOAuth({ provider: 'google' })]` |
| **Google Calendar** | 🚧 Scaffold only | `[supabase/functions/sync-google-calendar/index.ts > "not implemented yet"]` |
| **Stripe** | ❌ Not found | No Stripe imports or references |
| **Twilio/Email** | 🔶 Supabase Email | `[supabase/email-templates/]` — uses Supabase built-in email |
| **Analytics** | 🔶 Middleware.io | `[ABOUT.md > Observability: Middleware.io]` |

---

## 4. Pricing-Relevant Hotspots

### 4.1 Expensive Operations (Cost Drivers)

| Operation | Location | Cost Type | Notes |
|-----------|----------|-----------|-------|
| **AI Blueprint Generation** | `[supabase/functions/generate-blueprint/]` | Gemini API | Complex prompts, large output |
| **AI Ambition Analysis** | `[supabase/functions/analyze-ambitions/]` | Gemini API | Onboarding step |
| **AI Chat** | `[supabase/functions/chat/]` | Gemini API | **60+ function definitions**, high token usage |
| **AI Schedule Generation** | `[supabase/functions/generate-schedule/]` | Gemini API | Per-goal scheduling |
| **AI Goal Overview** | `[supabase/functions/generate-goal-overview/]` | Gemini API | Strategy + gaps |
| **AI Roadmap Refinement** | `[supabase/functions/refine-roadmap/]` | Gemini API | Iterative updates |
| **AI Phase Refinement** | `[supabase/functions/refine-phase/]` | Gemini API | Per-phase iteration |
| **AI Goal Strategy** | `[supabase/functions/analyze-goal-strategy/]` | Gemini API | Strategy analysis |
| **Daily Quote** | `[supabase/functions/daily-quote/]` | Gemini API | Low cost, simple |

### 4.2 Usage Metering Opportunities

| Metric | Location | How to Meter |
|--------|----------|--------------|
| **Goals Created** | `[goals table]`, `[chat/index.ts > create_goal]` | Count rows per user |
| **AI Chat Messages** | `[chat_messages table]`, `[chat/index.ts]` | Count rows per user |
| **Chat Sessions** | `[chat_sessions table]` | Count active sessions |
| **Calendar Events** | `[calendar_events table]` | Count events created |
| **Phases/Milestones/Tasks** | `[phases, milestones, tasks tables]` | Count per goal |
| **Edge Function Invocations** | Supabase Dashboard | Aggregate calls per user |
| **Token Usage** | `[chat_messages table > tokens_input, tokens_output]` | Already tracked! |

### 4.3 Token Tracking (Already Implemented!)
```sql
-- [product documentation/current schema.sql > chat_messages]
tokens_input integer,
tokens_output integer,
latency_ms integer,
```
> **KEY FINDING**: Token usage is already tracked in the database. This can be used for usage-based billing.

---

## 5. Plan Gating Feasibility

### 5.1 Where to Enforce Limits

| Enforcement Point | Location | Implementation |
|-------------------|----------|----------------|
| **API Middleware** | `[supabase/functions/_shared/auth.ts]` | Add limit checks before processing |
| **Edge Function Entry** | Each `index.ts` in `[supabase/functions/*/]` | Check user plan before execution |
| **Database RLS** | `[supabase/migrations/20241230000001_rls_policies.sql]` | Can add row limits |
| **Frontend** | `[components/*.tsx]` | UI-level gating (cosmetic) |

### 5.2 Tenancy Model

| Concept | Status | Evidence |
|---------|--------|----------|
| **User-level tenancy** | ✅ Yes | All tables have `user_id` FK to `auth.users` |
| **Organization/Team** | ❌ Not implemented | No `org_id`, `workspace_id`, or team tables |
| **Workspace** | ❌ Not implemented | No multi-workspace support |

> **INFERENCE (logged in assumptions)**: App is currently B2C single-user. B2B with team plans would require schema changes.

### 5.3 User Profile for Plan Storage

The `profiles` table can store plan information:
```sql
-- [product documentation/current schema.sql > profiles]
id uuid NOT NULL,
email text NOT NULL,
-- Could add: plan_tier text, plan_expires_at timestamp
```

---

## 6. Database Schema Summary (Pricing-Relevant)

| Table | Row Count Proxy | Pricing Relevance |
|-------|-----------------|-------------------|
| `profiles` | 1 per user | User account |
| `goals` | ~3-10 per user | **Primary value metric candidate** |
| `phases` | ~3-5 per goal | Secondary metric |
| `milestones` | ~5-10 per phase | Secondary metric |
| `tasks` | ~3-8 per milestone | Granular metric |
| `subtasks` | ~2-5 per task | Granular metric |
| `calendar_events` | 10-50+ per user | **Metering candidate** |
| `chat_messages` | High (10-100+/session) | **Cost driver** |
| `chat_sessions` | 1-5 per user | Session tracking |
| `attachments` | Low | Storage cost if used |

---

## 7. What I Could NOT Confirm from the Repo

| Item | Status | Why Unknown |
|------|--------|-------------|
| **Actual Gemini API costs** | ❌ Not in repo | Requires billing data from Google Cloud |
| **Supabase tier/costs** | ❌ Not in repo | Requires Supabase dashboard access |
| **Current user count** | ❌ Not in repo | Requires database query |
| **Average tokens per request** | 🔶 Partial | Schema tracks it, but need aggregates |
| **Monthly active users** | ❌ Not in repo | Requires analytics |
| **Revenue (if any)** | ❌ Not in repo | No billing integration detected |
| **Stripe integration** | ❌ Not found | No billing code exists |
| **Google Calendar sync status** | 🔶 Scaffold only | Marked as "not implemented yet" |
| **File upload/storage usage** | 🔶 Schema exists | `attachments` table exists, usage unknown |

---

## 8. Key Findings Summary

1. **AI is the primary cost driver** — 12+ Edge Functions calling Gemini API
2. **Token usage already tracked** — `chat_messages.tokens_input/output` can power usage billing
3. **No billing integration exists** — Stripe or similar needs to be added
4. **B2C single-user model** — No team/org support currently
5. **Goals are the core value unit** — Natural candidate for tiered limits
6. **Chat is high-frequency** — Likely biggest token consumer per user
