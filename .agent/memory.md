# Research Memory: Goal Decomposition & Schedule Generation

> **Purpose**: Consolidated research findings to guide implementation of analysis-to-execution pipeline.
> **Last Updated**: 2026-02-01

---

## 🎯 USER REQUIREMENTS (Feb 2026 Discussion)

### Core Decisions:
1. **Auto-Regeneration**: Schedule auto-regenerates when blueprint changes OR user asks AI to improve goal
2. **Chatbot Control**: AI chatbot can trigger schedule regeneration via `build_schedule` function
3. **Duration Overrides**: AI generates task durations, user can override in calendar
4. **Timeline Conflicts**: Warn user and suggest extending deadline (not blocking)
5. **Session Frequency**: AI decides based on user's goals, calendar, and priority (NOT hardcoded)
6. **Overlapping Events**: AI must NEVER create overlaps; user can manually create them
7. **Phase Limits**: Remove arbitrary restrictions - let AI provide complete breakdown
8. **Scope**: Fix for both new AND existing goals

### Quality Standards:
- No 40-day calendars for 6-month goals
- No 30-minute sessions for 5-minute tasks (intelligent grouping required)
- Ground-truth duration estimates (realistic, not filler)
- Full timeline coverage validation

---

## 🏗️ SYSTEM ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DLULU SCHEDULING PIPELINE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  USER INPUT                                                                  │
│      │                                                                       │
│      ▼                                                                       │
│  ┌──────────────────┐                                                        │
│  │ Onboarding.tsx   │ → analyze-ambitions Edge Function                      │
│  └──────────────────┘                                                        │
│      │                                                                       │
│      ▼                                                                       │
│  ┌──────────────────┐                                                        │
│  │ StatusCheck.tsx  │ → User marks prerequisites complete/skipped            │
│  └──────────────────┘                                                        │
│      │                                                                       │
│      ▼                                                                       │
│  ┌──────────────────┐    ┌────────────────────────────────────────────────┐  │
│  │ generate-blueprint│ ← │ ISSUE: MAX_PHASES=5, no estimatedHours          │  │
│  │ Edge Function    │    │ FIX: Dynamic phases, require duration fields    │  │
│  └──────────────────┘    └────────────────────────────────────────────────┘  │
│      │                                                                       │
│      ▼                                                                       │
│  ┌──────────────────┐                                                        │
│  │ RoadmapView.tsx  │ → Displays phases/milestones/tasks                     │
│  └──────────────────┘                                                        │
│      │                                                                       │
│      ▼                                                                       │
│  ┌──────────────────┐    ┌────────────────────────────────────────────────┐  │
│  │ "Create Calendar"│ ← │ GoalLibrary.tsx L1075 → generateGoalSchedule()  │  │
│  │ Button Click     │    │ OR chatbot.ts → build_schedule function        │  │
│  └──────────────────┘    └────────────────────────────────────────────────┘  │
│      │                                                                       │
│      ▼                                                                       │
│  ┌──────────────────┐    ┌────────────────────────────────────────────────┐  │
│  │ generate-schedule│ ← │ ISSUE: Caps at goalWeeks × frequency            │  │
│  │ Edge Function    │    │ ISSUE: Hour-granularity overlap detection      │  │
│  └──────────────────┘    │ FIX: Use task count, minute-precision overlaps │  │
│      │                   └────────────────────────────────────────────────┘  │
│      ▼                                                                       │
│  ┌──────────────────┐                                                        │
│  │ Calendar Events  │ → Saved to calendar_events table                       │
│  │ in Supabase      │                                                        │
│  └──────────────────┘                                                        │
│      │                                                                       │
│      ▼                                                                       │
│  ┌──────────────────┐                                                        │
│  │ CalendarView.tsx │ → Displays events                                      │
│  └──────────────────┘                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Files & Responsibilities:

| File | Location | Current Issues |
|------|----------|----------------|
| `generate-blueprint/index.ts` | `supabase/functions/` | MAX_PHASES=5, no estimatedHours |
| `generate-schedule/index.ts` | `supabase/functions/` | Timeline caps, hour-granularity overlaps |
| `chat/index.ts` | `supabase/functions/` | `build_schedule` function exists but limited |
| `ai.ts` | `lib/api/` | Calls both Edge Functions |
| `chatbot.ts` | `services/gemini/` | Has generateGoalRoadmap(), needs regeneration logic |
| `GoalLibrary.tsx` | `components/` | handleBuildGoalCalendar at L1064 |
| `dataLimits.ts` | `constants/` | MAX values inconsistent with Edge Functions |

---

## 📚 Core Research Findings

### 1. Goal-Setting Theory (Locke & Latham, 1990, 2002)

**Five Pillars:**
1. **Clarity** - Goals must be specific and unambiguous
2. **Challenge** - Goals should stretch but remain achievable
3. **Commitment** - User buy-in is essential
4. **Feedback** - Regular progress information
5. **Task Complexity** - Complex goals MUST be decomposed

**Key Insight:** Specific + challenging goals → higher performance than "do your best"

### 2. Hierarchical Task Decomposition (Princeton 2022, ADAPT 2024)

**Why hierarchies work:**
- Limited working memory (Miller's 7±2 items)
- Subgoals provide intermediate rewards
- Failures at task level don't invalidate goals
- Reduces cognitive load through chunking

**Optimal Subtask Heuristic:** 2-10 subtasks per parent task
- Fewer than 2 → task is atomic, don't split
- More than 10 → re-chunk into intermediate levels

### 3. Work Breakdown Structure (WBS) Rules

**100% Rule:** WBS must encompass 100% of project scope
- Sum of child work = 100% of parent

**8/80 Rule (Task Duration):**
- Minimum: 8 hours (1 day)
- Maximum: 80 hours (10 days / ~2 weeks)
- Work packages no longer than 1 month

**Mutual Exclusivity:** Tasks should NOT overlap

### 4. Time Estimation (PERT Formula)

```
Expected Duration = (Optimistic + 4×Most_Likely + Pessimistic) / 6
```

**Planning Fallacy:** 85% of projects underestimate time (Kahneman)
- Solution: Add 20-40% buffer automatically

### 5. Task Duration Guidelines

| Task Type | Duration Range | Scheduling |
|-----------|----------------|------------|
| Subtask (atomic action) | 15-60 min | Within session |
| Task (work unit) | 1-4 hours | Single session |
| Milestone (checkpoint) | 1-2 weeks | Multiple sessions |
| Phase (mode of work) | 2-8 weeks | Multiple milestones |
| Goal (end state) | 3-12 months | Multiple phases |

### 6. Sessions Per Week by Goal Archetype

| Archetype | Frequency | Session Duration |
|-----------|-----------|------------------|
| HABIT_BUILDING (Gym, Meditation) | 5-7x/week | 15-60 min |
| DEEP_WORK_PROJECT (Coding, Writing) | 2-4x/week | 60-180 min |
| SKILL_ACQUISITION (Languages, Music) | 3-5x/week | 30-90 min |
| MAINTENANCE (Chores, Reviews) | 1-2x/week | 30-60 min |

---

## 🔬 Key Formulas

### Goal Duration Calculation

```
Total Sessions = Sum(All Task Hours) / Avg Session Duration
Goal Weeks = Total Sessions / Sessions Per Week
```

### Task Count Estimation

```
For a 6-month (26-week) goal with 3 sessions/week:
  Total Sessions = 26 × 3 = 78 sessions
  If avg 2 tasks/session: 156 tasks needed
  
Distributed across hierarchy:
  4 phases × 5 milestones × 8 tasks = 160 tasks ✓
```

### Timeline Backward Calculation

Given: Goal deadline = 6 months, Total tasks = 150, User availability = 3 sessions/week

```
Sessions needed = 150 / 2 (tasks per session) = 75 sessions
Weeks needed = 75 / 3 = 25 weeks
Buffer (20%) = 25 × 1.2 = 30 weeks
```

---

## ⚠️ Anti-Patterns (What NOT to Do)

1. **No Arbitrary Limits** - Don't cap phases at 5 if a 6-month goal needs 8
2. **No Generic Durations** - Calculate from actual task complexity
3. **No Uniform Session Packing** - Don't assume all tasks take 30 min
4. **No Timeline Mismatch** - 6-month goal should NOT create only 40 days of events
5. **No Blind Decomposition** - AI should adapt depth to complexity

---

## 🎯 DLULU-Specific Corrections Needed

### Current State (Broken):
- `MAX_PHASES_PER_GOAL: 5` in Edge Function (too restrictive)
- Schedule calculates `goalWeeks` but uses `goal.frequency` blindly
- No task-level duration estimation
- AI doesn't calculate total time needed
- Calendar generated once, never adapts

### Correct Approach:
1. **Calculate total work hours** from all task estimates
2. **Divide by session capacity** to get total sessions
3. **Divide by weekly frequency** to get timeline
4. **Generate phases to fit timeline**, not arbitrary 5
5. **Schedule across FULL timeline**, not just 40 days

---

## 📐 Recommended Data Limits (Research-Backed)

```typescript
const RESEARCH_BACKED_LIMITS = {
  // Phases should adapt to goal timeline
  MIN_PHASES_PER_GOAL: 2,
  MAX_PHASES_PER_GOAL: 12,  // For up to 12-month goals
  WEEKS_PER_PHASE_TARGET: 4, // ~1 phase per month
  
  // Milestones tied to phases
  MIN_MILESTONES_PER_PHASE: 2,
  MAX_MILESTONES_PER_PHASE: 6,  // ~1 per week
  
  // Tasks are the schedulable units
  MIN_TASKS_PER_MILESTONE: 3,
  MAX_TASKS_PER_MILESTONE: 10,
  TASK_DURATION_MIN_HOURS: 0.5,  // 30 min
  TASK_DURATION_MAX_HOURS: 4,    // 4 hours
  
  // Subtasks are checkbox items in a session
  MIN_SUBTASKS_PER_TASK: 0,  // Optional
  MAX_SUBTASKS_PER_TASK: 8,  // Practical limit
  
  // Session scheduling
  MIN_SESSION_DURATION_MINUTES: 25,  // Pomodoro
  MAX_SESSION_DURATION_MINUTES: 180, // Deep Work max
  DEFAULT_SESSION_DURATION_MINUTES: 60,
};
```

---

## ✅ Implementation Checklist

- [ ] Modify `generate-blueprint` to use timeline-based phase count
- [ ] Add `estimatedHours` to each Task in AI prompt
- [ ] Calculate `totalGoalHours` from sum of task estimates
- [ ] Calculate `requiredWeeks` from total hours / weekly capacity
- [ ] Ensure `generate-schedule` creates events for FULL timeline
- [ ] Add overlap detection before inserting events
- [ ] Add validation: calendar end date ≥ goal deadline
