# Context Brief — Product & Market Context

> **Status**: Draft (Repo-Grounded)
> **Last Updated**: 2026-02-03

---

## 1. Product Summary
**Product**: dlulu life (The AI Ambition Engine)
**Type**: B2C Single-User Web Application
**One-liner**: An AI-native "operating system" that compiles vague user ambitions into mathematically feasible, energy-aware schedules. `[ABOUT.md]`
**Buyer vs User**: **Same Person** (Classic B2C model). No evidence of "admin" or "manager" roles in `profiles` table.

---

## 2. Jobs-to-be-Done (JTBD)
1. **"Engineer my dream"**: Transform a high-level unstructured goal (e.g., "Learn Python") into a structured dependency tree. `[supabase/functions/generate-blueprint]`
2. **"Fit it into my real life"**: Map that plan onto a calendar that respects my sleep, work, and energy constraints. `[supabase/functions/generate-schedule]`, `[types.ts > TimeConstraints]`
3. **"Adapt when I fail"**: Re-plan the roadmap when I miss tasks without shame. `[supabase/functions/refine-roadmap]`
4. **"Keep me honest"**: Track granular progress across complex, multi-phase projects. `[components/PhaseExplorer.tsx]`
5. **"Unblock me"**: Provide instant answers and coaching specific to my current task context. `[components/ChatAssistant.tsx]`

---

## 3. Key Value Moments ("Willingness to Pay" Triggers)
1. **The Blueprint Reveal**: When the AI displays the full breakdown of phases and milestones. `[components/BlueprintReveal.tsx]`
2. **The Schedule Generation**: When abstract tasks suddenly appear as concrete blocks on the calendar. `[components/CalendarView.tsx]`
3. **The "Unstuck" Chat**: When the AI helps overcome a specific blocker contextually. `[supabase/functions/chat]`

---

## 4. Feature Inventory (Top 10)

| Feature | Code Path | Description |
|---------|-----------|-------------|
| **AI Blueprint Engine** | `[supabase/functions/generate-blueprint]` | Generates phases/milestones from raw text. |
| **Intelligent Scheduler** | `[supabase/functions/generate-schedule]` | CSP solver matching tasks to time blocks. |
| **Contextual AI Chat** | `[components/ChatAssistant.tsx]` | RAG-enabled chat with 60+ function tools. |
| **Roadmap Visualizer** | `[components/PhaseExplorer.tsx]` | Interactive mind-map of goals. |
| **Goal Library** | `[components/GoalLibrary.tsx]` | CRUD management for ambitions. |
| **Onboarding Analysis** | `[supabase/functions/analyze-ambitions]` | Initial user profiling and goal intent analysis. |
| **Daily Quote** | `[supabase/functions/daily-quote]` | Motivational content generation. |
| **Calendar View** | `[components/CalendarView.tsx]` | Custom calendar UI with time blocking. |
| **Status Check** | `[components/StatusCheck.tsx]` | Prerequisite verification flow. |
| **Progress Dashboard** | `[components/Dashboard.tsx]` | High-level metrics visualization. |

---

## 5. Differentiation Hypotheses
> *Labeled as hypotheses until validated by market response.*

- **Hypothesis 1 (The "Compiler" Frame)**: Users will pay for "compiling" goals into plans (deterministic, structured) more than they will pay for generic "chatting" (open-ended).
- **Hypothesis 2 (Energy-Awareness)**: Scheduling based on `chronotype` and `energy_level` `[types.ts]` creates higher adherence than standard time-blocking.
- **Hypothesis 3 (Living Roadmap)**: A roadmap that lives in the DB `[roadmap.ts]` and adapts is stickier than a static PDF or text plan.

---

## 6. Commercial Context (Repo-Confirmed)

### Tenancy Model
- **Confirmed**: Single-user tenancy.
- **Evidence**: `user_id` is the root foreign key on all major tables (`goals`, `calendar_events`, `profiles`).
- **Implication**: No "per seat" pricing; pricing must be user-based or usage-based.

### Cost & Value Drivers
- **Cost Driver**: Google Gemini API tokens (Input/Output). AI is used for *everything* from onboarding to daily scheduling. `[93_REPO_MAP.md > 4.1]`
- **Value Driver**: The *structure* created by the AI (Rows in `phases`, `milestones`, `calendar_events`).

### Monetization Readiness Gaps
- **Critical**: No billing integration found. `[93_REPO_MAP.md > 3]`
- **Critical**: No "Plan" column in `profiles` to distinguishing free vs paid users.
- **Critical**: Google Calendar sync is a scaffold only `[supabase/functions/sync-google-calendar]`, representing a missing premium feature.

---

## 7. Repo Evidence Pointers
- **Tech Stack**: `[93_REPO_MAP.md > Section 2]`
- **Cost Hotspots**: `[93_REPO_MAP.md > Section 4.1]`
- **Metering Ops**: `[93_REPO_MAP.md > Section 4.2]`
