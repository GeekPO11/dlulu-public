# dlulu life: Agentic Calendar System Reference

> **Version:** 2.0.0  
> **Date:** January 31, 2026  
> **Purpose:** Comprehensive reference for building a production-grade agentic calendar system
> **Audience:** AI Coding Agents, Technical Architects, Developers

---

## 1. Executive Summary

dlulu life is an **AI Ambition Engine** that transforms high-level ambitions into actionable daily calendar events. The core philosophy is:

> *"AI does NOT calculate dates/times - AI is bad at date math. We deterministically calculate available time slots and assign tasks to slots in order."*

This document provides a complete technical reference for the agentic calendar subsystem, covering:
- Product architecture and data model
- Core scheduling algorithms
- Integration with external calendars
- Industry best practices from 2025-2026

---

## 2. Product Architecture

### 2.1 Data Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        dlulu life DATA HIERARCHY                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  UserProfile                             TimeConstraints                    │
│  ├── name, role, bio                     ├── sleepStart/sleepEnd           │
│  ├── chronotype (early_bird/night_owl)   ├── peakStart/peakEnd             │
│  ├── workStyle (deep_work/pomodoro)      └── workBlocks[], blockedSlots[]  │
│  └── energyLevel                                                            │
│                                                                             │
│  Goal (table: goals)                                                        │
│  ├── title, category, timeline, estimated_weeks                             │
│  ├── strategy_overview, critical_gaps[]                                     │
│  ├── frequency (sessions/week), duration (minutes/session)                  │
│  ├── preferred_time (morning/afternoon/evening/flexible)                    │
│  ├── energy_cost (high/medium/low)                                          │
│  └── Phase[] (1:N)                                                          │
│       ├── number, title, description                                        │
│       ├── start_week, end_week, focus[]                                     │
│       └── Milestone[] (1:N)                                                 │
│            ├── title, description, target_week, is_completed                │
│            └── Task[] (1:N)                                                 │
│                 ├── title, is_completed, times_per_week                     │
│                 └── SubTask[] (1:N)                                         │
│                      └── title, is_completed, is_manual                     │
│                                                                             │
│  CalendarEvent (table: calendar_events)                                     │
│  ├── summary, description, location                                         │
│  ├── start_datetime, end_datetime (TIMESTAMPTZ - always UTC)                │
│  ├── timezone (IANA string for display)                                     │
│  ├── goal_id, phase_id, milestone_id, task_id → Foreign keys to hierarchy   │
│  ├── event_type, priority, energy_cost                                      │
│  ├── **difficulty (1-5)** → Cognitive load for slot scoring                 │
│  ├── **is_locked (boolean)** → Commitment device, prevents auto-reschedule  │
│  ├── **cognitive_type** → deep_work/shallow_work/learning/creative/admin    │
│  ├── **ai_confidence_score (0-100)** → AI scheduling confidence             │
│  ├── status (scheduled/in_progress/completed/skipped/missed)                │
│  ├── source (ambitionos/google_calendar/manual)                             │
│  ├── sync_status (local_only/synced/pending_sync/sync_error)                │
│  ├── external_event_id → Google Calendar ID                                 │
│  ├── reschedule_count, original_start_datetime                              │
│  └── ai_metadata (JSONB) → progress, scheduling rationale, roadmap_snapshot │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Key TypeScript Interfaces

```typescript
// From types.ts - User scheduling preferences (with preferences JSONB)
export interface UserProfile {
  chronotype: 'early_bird' | 'night_owl' | 'midday_peak' | 'flexible';
  workStyle: 'deep_work' | 'pomodoro' | 'flow' | 'reactive' | 'balanced';
  energyLevel: 'high_octane' | 'balanced' | 'recovery';
  userPreferences?: {  // NEW: JSONB for granular settings
    workingHours: { start: string; end: string };
    deepWorkLimitHours: number;
    breakFrequencyMinutes: number;
    protectedTimes: string[];
  };
}

// From types.ts - Goal scheduling configuration
export interface Goal {
  preferredTime: 'morning' | 'afternoon' | 'evening' | 'flexible';
  frequency: number;         // sessions per week
  duration: number;          // minutes per session
  energyCost: 'high' | 'medium' | 'low';
  preferredDays?: number[];  // 0=Mon, 6=Sun
  isScheduled?: boolean;
}

// NEW: Task with intelligence fields (propagates to calendar events)
export interface Task {
  id: string;
  title: string;
  difficulty: 1 | 2 | 3 | 4 | 5;  // Cognitive load
  cognitiveType: 'deep_work' | 'shallow_work' | 'learning' | 'creative' | 'admin';
  estimatedMinutes: number;
  dependencies: string[];  // Task IDs that must complete first
}

// From calendarTypes.ts - Full event structure (with new intelligence fields)
export interface CalendarEvent {
  // Core fields...
  difficulty?: 1 | 2 | 3 | 4 | 5;      // NEW: For slot scoring
  isLocked?: boolean;                   // NEW: Commitment device
  cognitiveType?: CognitiveType;        // NEW: For task batching
  aiConfidenceScore?: number;           // NEW: 0-100 AI confidence
  schedulingReasoning?: string;         // NEW: AI explanation
  // See constants/calendarTypes.ts for complete definition
}

export type CognitiveType = 'deep_work' | 'shallow_work' | 'learning' | 'creative' | 'admin';
```

---

## 3. Core Scheduling Algorithm

### 3.1 The Deterministic Approach

**Critical Design Decision:** AI generates the *what* (ambitions, phases, tasks), but NOT the *when*. Date/time calculations are handled by deterministic algorithms.

```
┌─────────────────────────────────────────────────────────────────┐
│              SCHEDULING PIPELINE (generate-schedule)            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  INPUT:                                                         │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                │
│  │   Goal     │  │   User     │  │  Existing  │                │
│  │  (with all │  │ Constraints│  │   Events   │                │
│  │   tasks)   │  │            │  │            │                │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘                │
│        │               │               │                        │
│        ▼               ▼               ▼                        │
│  ┌─────────────────────────────────────────────────────┐       │
│  │  STEP 1: Load goal with phases→milestones→tasks     │       │
│  └─────────────────────────────────────────────────────┘       │
│                         │                                       │
│                         ▼                                       │
│  ┌─────────────────────────────────────────────────────┐       │
│  │  STEP 2: Load user constraints (sleep, work, peak)  │       │
│  └─────────────────────────────────────────────────────┘       │
│                         │                                       │
│                         ▼                                       │
│  ┌─────────────────────────────────────────────────────┐       │
│  │  STEP 3: Fetch existing calendar events             │       │
│  │          to avoid scheduling conflicts              │       │
│  └─────────────────────────────────────────────────────┘       │
│                         │                                       │
│                         ▼                                       │
│  ┌─────────────────────────────────────────────────────┐       │
│  │  STEP 4: Extract tasks (lowest schedulable level)   │       │
│  │  Priority: SubTasks > Tasks > Milestones            │       │
│  │  Skip: is_completed=true OR is_strikethrough=true   │       │
│  └─────────────────────────────────────────────────────┘       │
│                         │                                       │
│                         ▼                                       │
│  ┌─────────────────────────────────────────────────────┐       │
│  │  STEP 5: Generate available time slots              │       │
│  │  - Iterate each day for goal duration               │       │
│  │  - Exclude sleep hours                              │       │
│  │  - Exclude work blocks                              │       │
│  │  - Exclude blocked slots                            │       │
│  │  - Exclude times with existing events               │       │
│  └─────────────────────────────────────────────────────┘       │
│                         │                                       │
│                         ▼                                       │
│  ┌─────────────────────────────────────────────────────┐       │
│  │  STEP 6: Distribute tasks into sessions             │       │
│  │  - sessionsPerWeek = goal.frequency                 │       │
│  │  - minutesPerSession = goal.duration                │       │
│  │  - Pack multiple tasks if tasks > sessions          │       │
│  │  - Prefer slots near goal.preferredTime             │       │
│  └─────────────────────────────────────────────────────┘       │
│                         │                                       │
│                         ▼                                       │
│  OUTPUT: CalendarEvent[] (inserted to calendar_events)          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Session Packing Algorithm

When there are more tasks than available sessions, multiple tasks are packed into a single calendar event:

```javascript
// From generate-schedule/index.ts
const sessionsPerWeek = Math.max(1, Number(goal.frequency || 3));
const minutesPerSession = Math.max(15, Number(goal.duration || 60));
const totalSessionsWanted = goalWeeks * sessionsPerWeek;

// Don't create empty sessions
const sessionsCount = tasks.length >= totalSessionsWanted 
  ? totalSessionsWanted 
  : tasks.length;

// How many tasks fit in each session?
const itemsPerSession = Math.max(1, Math.ceil(tasks.length / sessionsCount));

// Result: Event summary like "Task A + 2 more"
// Description contains checklist of all packed items
```

### 3.3 Task Duration Heuristics

```javascript
// From generate-schedule/index.ts - lines 255-270
const isComplex = subtask.title.length > 50 ||
  /research|analyze|create|build|design|implement|develop/i.test(subtask.title);

durationMinutes: isComplex ? 60 : 30  // for subtasks
durationMinutes: isComplex ? 60 : 45  // for tasks without subtasks
durationMinutes: 60                    // for milestones
```

---

## 4. Timezone Handling (Critical)

### 4.1 The Golden Rule

> **Store all times as absolute UTC instants. Use timezone for display only.**

```sql
-- Database: calendar_events table
start_datetime TIMESTAMPTZ NOT NULL,  -- Always UTC internally
end_datetime TIMESTAMPTZ NOT NULL,    -- Always UTC internally
timezone VARCHAR(50) DEFAULT 'UTC',   -- User's IANA timezone for display
```

### 4.2 Conversion Flow

```
USER INPUT (Local Time)            DATABASE (UTC)              DISPLAY (Local Time)
        │                               │                              ▲
        │  Convert before insert        │                              │
        ▼                               │                              │
"2026-01-31T09:00"                      │                              │
+ timezone "America/New_York"           │                              │
        │                               │                              │
        └────────────────────────>  "2026-01-31T14:00:00Z"             │
                                        │                              │
                                        │   Convert for display        │
                                        └──────────────────────────────┘
                                                                "9:00 AM EST"
```

### 4.3 Common Timezone Bug

**WARNING:** The existing `toISODate()` utility has a known bug (GAP-027 in Gaps.md):

```typescript
// BUGGY (current implementation)
export const toISODate = (date: Date): string => {
  return date.toISOString().split('T')[0];  // Converts to UTC first!
};

// FIX REQUIRED
export const toISODate = (date: Date): string => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
```

---

## 5. Database Schema Reference

### 5.1 calendar_events Table

```sql
CREATE TABLE calendar_events (
  id                  UUID PRIMARY KEY,
  user_id             UUID NOT NULL REFERENCES users(id),
  
  -- Display
  summary             VARCHAR(255) NOT NULL,
  description         TEXT,
  location            VARCHAR(255),
  
  -- Timing (CRITICAL: always store UTC)
  start_datetime      TIMESTAMPTZ NOT NULL,
  end_datetime        TIMESTAMPTZ NOT NULL,
  start_date          DATE,           -- For all-day events
  end_date            DATE,
  timezone            VARCHAR(50) DEFAULT 'UTC',
  
  -- Roadmap Links (updated to include task_id)
  goal_id             UUID REFERENCES goals(id) ON DELETE SET NULL,
  phase_id            UUID REFERENCES phases(id) ON DELETE SET NULL,
  milestone_id        UUID REFERENCES milestones(id) ON DELETE SET NULL,
  task_id             UUID REFERENCES tasks(id) ON DELETE SET NULL,  -- NEW
  
  -- Event Classification
  event_type          VARCHAR(30) DEFAULT 'goal_session',
  -- Valid: 'goal_session', 'milestone_deadline', 'habit', 'task', 'blocked'
  
  energy_cost         VARCHAR(10),    -- 'high', 'medium', 'low'
  status              VARCHAR(20) DEFAULT 'scheduled',
  -- Valid: 'scheduled', 'in_progress', 'completed', 'skipped', 'rescheduled', 'missed'
  
  -- NEW: Intelligence Fields (Research-Backed)
  difficulty          INTEGER DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),  -- Slot scoring
  is_locked           BOOLEAN DEFAULT FALSE,  -- Commitment device
  cognitive_type      cognitive_type DEFAULT 'shallow_work',  -- Task batching
  ai_confidence_score INTEGER DEFAULT 0 CHECK (ai_confidence_score BETWEEN 0 AND 100),
  scheduling_reasoning TEXT,  -- AI transparency
  
  -- Rescheduling
  rationale           TEXT,           -- AI reasoning for this slot
  reschedule_count    INTEGER DEFAULT 0,
  original_start      TIMESTAMPTZ,
  
  -- Recurrence
  recurrence_rule     JSONB,
  is_recurring        BOOLEAN DEFAULT FALSE,
  
  -- External Sync
  source              VARCHAR(20) DEFAULT 'ambitionos',
  -- Valid: 'ambitionos', 'google_calendar', 'outlook', 'imported'
  sync_status         VARCHAR(20) DEFAULT 'local_only',
  -- Valid: 'local_only', 'synced', 'pending_sync', 'sync_error'
  external_event_id   VARCHAR(255),   -- Google Calendar event ID
  
  -- Timestamps
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
```

### 5.2 Schema Gaps Status

> ✅ = Resolved in Section 6.0 migration | ⏳ = Planned | ❌ = Not yet addressed

| Field | Purpose | Status | Notes |
|-------|---------|--------|-------|
| `difficulty` | Slot scoring (1-5) | ✅ | Added in intelligence migration |
| `is_locked` | Commitment device | ✅ | Added in intelligence migration |
| `cognitive_type` | Task batching | ✅ | Added in intelligence migration |
| `ai_confidence_score` | AI transparency | ✅ | Added in intelligence migration |
| `task_id` | Link to specific task | ✅ | Added in intelligence migration |
| `user_preferences` | JSONB on profiles | ✅ | Added in intelligence migration |
| `allocation_type` | 'task_session' / 'habit' | ⏳ | Already in pulled schema |
| `session_index` | Which session (1, 2...) | ⏳ | Already in pulled schema |
| `total_sessions` | Out of N total | ⏳ | Already in pulled schema |
| `ai_metadata` | JSONB for context | ⏳ | Already in pulled schema |
| `recurring_event_id` | Parent for instances | ⏳ | Already in pulled schema |
| `color_id` | Google Calendar color | ❌ | Low priority |
| `skipped_reason` | Why event skipped | ⏳ | Already in pulled schema |

### 5.3 Tasks Table Enhancement (NEW)

> Research shows task-level difficulty and cognitive type should propagate to calendar events during scheduling.

```sql
-- Enhancement for tasks table
ALTER TABLE tasks
  ADD COLUMN difficulty INTEGER DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),
  ADD COLUMN cognitive_type cognitive_type DEFAULT 'shallow_work',
  ADD COLUMN estimated_minutes INTEGER DEFAULT 60;
  
-- Index for efficient querying during schedule generation  
CREATE INDEX idx_tasks_difficulty ON tasks(difficulty);
CREATE INDEX idx_tasks_cognitive ON tasks(cognitive_type);
```

---

## 6. Google Calendar Integration

### 6.1 OAuth 2.0 Scopes

```
REQUIRED:
├── https://www.googleapis.com/auth/calendar.events
│   → Create, read, update, delete events
│
OPTIONAL (for read-only import):
├── https://www.googleapis.com/auth/calendar.readonly
│   → List calendars, read events
│
OPTIONAL (for smart scheduling):
└── https://www.googleapis.com/auth/calendar.settings.readonly
    → Read user's calendar settings (first day of week, etc.)
```

### 6.2 Incremental Sync Pattern

```javascript
// Initial Full Sync
const { data } = await calendar.events.list({
  calendarId: 'primary',
  maxResults: 2500,
});
const syncToken = data.nextSyncToken;
storeSyncToken(userId, syncToken);

// Subsequent Syncs (only changed events)
try {
  const { data } = await calendar.events.list({
    calendarId: 'primary',
    syncToken: storedSyncToken,
  });
  processChanges(data.items);
  storeSyncToken(userId, data.nextSyncToken);
} catch (error) {
  if (error.status === 410) {
    // Token expired - need full re-sync
    performFullSync();
  }
}
```

### 6.3 Webhook Notifications

```javascript
// Setup watch (expires after ~30 days)
const { data } = await calendar.events.watch({
  calendarId: 'primary',
  requestBody: {
    id: `dlulu-${userId}`,
    type: 'web_hook',
    address: 'https://your-supabase.co/functions/v1/calendar-webhook',
  },
});

// Webhook handler
serve(async (req) => {
  const resourceState = req.headers.get('X-Goog-Resource-State');
  
  if (resourceState === 'sync') {
    // Initial sync verification - just return 200
    return new Response('ok');
  }
  
  if (resourceState === 'exists' || resourceState === 'update') {
    // Something changed - trigger incremental sync
    await triggerSync(userId);
  }
  
  return new Response('ok');
});
```

### 6.4 Event Mapping: DLULU → Google

```typescript
function toGoogleEvent(event: CalendarEvent): calendar_v3.Schema$Event {
  return {
    summary: event.summary,
    description: event.description,
    location: event.location,
    start: {
      dateTime: event.start.dateTime,
      timeZone: event.start.timeZone,
    },
    end: {
      dateTime: event.end.dateTime,
      timeZone: event.end.timeZone,
    },
    colorId: event.colorId,
    recurrence: event.recurrence,
    // Extended properties for DLULU metadata
    extendedProperties: {
      private: {
        dluluEventId: event.id,
        goalId: event.goalId,
        phaseId: event.phaseId,
        source: 'dlulu',
      },
    },
  };
}
```

---

## 7. Industry Comparison (2025-2026)

### 7.1 Feature Matrix

| Feature | dlulu life | Reclaim.ai | Motion.app | Clockwise |
|---------|------------|------------|------------|-----------|
| **Ambition Hierarchy** | ✅ 5-level | ❌ None | ⚠️ Projects | ❌ None |
| **AI Strategy Generation** | ✅ Gemini | ❌ Manual | ⚠️ Limited | ❌ No |
| **Deterministic Scheduling** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **Google Calendar Sync** | ❌ Not yet | ✅ Excellent | ✅ Excellent | ✅ Excellent |
| **Bidirectional Sync** | ❌ Not yet | ✅ Yes | ✅ Yes | ✅ Yes |
| **Focus Time Protection** | ⚠️ Partial | ✅ Core feature | ✅ Yes | ✅ Core feature |
| **Auto Reschedule** | ❌ Not yet | ✅ Yes | ✅ Yes | ✅ Yes |
| **Energy/Chronotype** | ✅ Yes | ✅ Yes | ⚠️ Limited | ⚠️ Limited |
| **Habit Tracking** | ⚠️ Schema only | ✅ Yes | ⚠️ Limited | ❌ No |
| **Team Features** | ❌ No | ⚠️ Basic | ✅ Yes | ✅ Core feature |
| **Open Source** | ❌ No | ❌ No | ❌ No | ❌ No |

### 7.2 Competitive Differentiation

**dlulu life's Unique Value:**
1. **Ambition-to-Calendar Pipeline**: Only product that starts with abstract ambitions and generates a structured roadmap *before* scheduling
2. **AI Gap Analysis**: Identifies "why this might fail" before work begins
3. **5-Level Hierarchy**: Ambition → Phase → Milestone → Task → SubTask provides unmatched granularity
4. **Ambition Philosophy**: Combines productivity with personal development

**What Competitors Do Better:**
1. **Google Calendar Integration**: All competitors have production-grade sync
2. **Auto-Rescheduling**: Competitors automatically recover from missed sessions
3. **Focus Time Defense**: Reclaim.ai and Clockwise protect deep work blocks intelligently
4. **Mobile Apps**: Competitors have native iOS/Android apps

---

## 8. Recurrence Rules (RRULE)

### 8.1 Standard Patterns

```
// Daily at same time
RRULE:FREQ=DAILY

// Weekly on Mon, Wed, Fri
RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR

// Every 2 weeks on Tuesday
RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU

// Monthly on the 15th
RRULE:FREQ=MONTHLY;BYMONTHDAY=15

// Monthly on 2nd Tuesday
RRULE:FREQ=MONTHLY;BYDAY=2TU

// Until a specific date
RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20260601T000000Z

// For N occurrences
RRULE:FREQ=DAILY;COUNT=30
```

### 8.2 Day Mapping

**IMPORTANT:** DLULU uses 0=Monday internally but JavaScript uses 0=Sunday.

```typescript
// DLULU internal (as documented in types.ts)
// 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun

// JavaScript Date.getDay()
// 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat

// Conversion functions needed
const dluluToJsDay = (dluluDay: number) => (dluluDay + 1) % 7;
const jsToDluluDay = (jsDay: number) => (jsDay + 6) % 7;
```

---

## 9. Known Gaps & Issues

### 9.1 Critical (Must Fix)

| ID | Issue | Location |
|----|-------|----------|
| GAP-001 | Debug logging to external server in production | useSupabaseData.ts:717 |
| GAP-002 | CRUD functions fail silently (no error returns) | useSupabaseData.ts |
| GAP-031 | No input validation on user-provided data | Throughout |

### 9.2 High Priority (Pre-Launch)

| ID | Issue | Location |
|----|-------|----------|
| GAP-017 | Event drag updates not persisted to database | CalendarView.tsx:592 |
| GAP-023 | No rate limiting or retry for AI calls | scheduling.ts:278 |
| GAP-027 | `toISODate` may return wrong date for timezones | dateUtils.ts:33 |
| GAP-032 | Inconsistent date/time handling across modules | Multiple files |

### 9.3 Calendar-Specific Gaps

| Gap | Current State | Desired State |
|-----|---------------|---------------|
| Google Calendar Sync | Not implemented | Full bidirectional sync |
| Missed Session Recovery | Events stay "scheduled" forever | Auto-reschedule on miss |
| Energy Optimization | Peak hours defined but unused | Match high-energy tasks to peak |
| Habit UI | Schema exists, no UI | Recurring pattern builder |
| Event Conflicts | Only checks DLULU events | Include Google Calendar |
| Session Preview | Events created immediately | Show preview before commit |

---

## 10. File Reference

| File | Purpose | Lines |
|------|---------|-------|
| `supabase/functions/generate-schedule/index.ts` | Core scheduling Edge Function | 910 |
| `constants/calendarTypes.ts` | TypeScript interfaces for events | 585 |
| `components/CalendarView.tsx` | Calendar UI (year/month/week/day) | 1684 |
| `components/CreateEventModal.tsx` | Event creation form | 462 |
| `lib/hooks/useSupabaseData.ts` | Data persistence layer | 1200 |
| `types.ts` | Core type definitions | 838 |
| `database/schema.sql` | Full database schema | 629 |
| `documentation/06-CALENDAR-ARCHITECTURE.md` | Architecture notes | 117 |
| `product documentation/CalendarArchitecturePlan.md` | v3 implementation spec | 675 |
| `product documentation/Gaps.md` | Known issues (35 gaps) | 753 |

---

## 11. Quick Reference: Event Creation

### 11.1 Manual Event (UI)

```typescript
// From CreateEventModal.tsx
const eventData: Partial<CalendarEvent> = {
  summary: title,
  description,
  start: { dateTime: startIso, timeZone: userTimezone },
  end: { dateTime: endIso, timeZone: userTimezone },
  goalId: selectedGoalId,
  eventType: 'goal_session',
  priority: 'medium',
  energyCost: 'medium',
  source: 'ambitionos',
  syncStatus: 'local_only',
};

await saveCalendarEvent(eventData);
```

### 11.2 AI-Generated Schedule (Edge Function)

```typescript
// From generate-schedule/index.ts
// Called via: POST /functions/v1/generate-schedule
{
  goalId: "uuid",
  startDate: "2026-02-01",
  timezone: "America/New_York",
  userConstraints: {
    sleepStart: "22:30",
    sleepEnd: "06:30",
    peakStart: "09:00",
    peakEnd: "12:00",
    workBlocks: [...],
    blockedSlots: [...]
  }
}
```

---

*This document serves as the authoritative reference for dlulu life's agentic calendar system. Consult it before making any calendar-related changes.*
