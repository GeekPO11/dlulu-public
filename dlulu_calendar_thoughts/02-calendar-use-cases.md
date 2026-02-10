# dlulu life: Complete Calendar Use Cases

> **Version:** 2.0.0  
> **Date:** January 31, 2026  
> **Authors:** Market Research • Product Management • Business Systems Analysis  
> **Purpose:** Exhaustive catalog of calendar use cases with acceptance criteria

---

## Document Structure

This document is organized according to Business Systems Analysis best practices:
1. **Actor Definitions** - Who interacts with the system
2. **Use Case Categories** - Grouped by feature area
3. **Detailed Use Cases** - Full specification with preconditions, flows, and acceptance criteria
4. **Gap Analysis** - Current state vs. desired state
5. **Priority Matrix** - Effort/Impact analysis

---

## 1. Actor Definitions

| Actor | Description |
|-------|-------------|
| **New User** | Unauthenticated visitor on landing page |
| **Onboarding User** | Authenticated user going through initial setup |
| **Active User** | Authenticated user with existing ambitions and calendar |
| **Returning User** | User who previously abandoned or completed ambitions |
| **External Calendar** | Google Calendar (OAuth-authenticated) |
| **AI Agent** | Gemini-powered background processing |
| **Scheduled Job** | Cron-triggered background task |

---

## 2. Use Case Categories

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DLULU CALENDAR USE CASE MAP                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  A. ONBOARDING & SETUP              B. GOAL-BASED SCHEDULING               │
│  ├── UC-A1: Set Sleep Hours         ├── UC-B1: Generate Goal Schedule      │
│  ├── UC-A2: Set Work Hours          ├── UC-B2: Session Packing             │
│  ├── UC-A3: Set Peak Hours          ├── UC-B3: Phase-Based Deadlines       │
│  ├── UC-A4: Import Work Roster      ├── UC-B4: Milestone Reminders         │
│  └── UC-A5: Set Preferred Time      └── UC-B5: Task Duration Estimation    │
│                                                                             │
│  C. MANUAL EVENT MANAGEMENT         D. RECURRING EVENTS (HABITS)           │
│  ├── UC-C1: Create Event            ├── UC-D1: Create Recurring Habit      │
│  ├── UC-C2: View Event Details      ├── UC-D2: Edit Single Instance        │
│  ├── UC-C3: Edit Event              ├── UC-D3: Edit All Future Instances   │
│  ├── UC-C4: Delete Event            ├── UC-D4: Skip Instance               │
│  ├── UC-C5: Drag to Reschedule      └── UC-D5: Track Habit Streak          │
│  └── UC-C6: Resize Event Duration                                          │
│                                                                             │
│  E. EXTERNAL SYNC                   F. INTELLIGENT FEATURES                │
│  ├── UC-E1: Connect Google Cal      ├── UC-F1: Conflict Detection          │
│  ├── UC-E2: Import Events           ├── UC-F2: Auto-Reschedule Missed      │
│  ├── UC-E3: Push to Google          ├── UC-F3: Energy-Based Matching       │
│  ├── UC-E4: Receive Webhook         ├── UC-F4: Focus Time Protection       │
│  └── UC-E5: Conflict Resolution     └── UC-F5: Deadline Compression        │
│                                                                             │
│  G. VISUALIZATION & NAVIGATION      H. PROGRESS & TRACKING                 │
│  ├── UC-G1: Year View               ├── UC-H1: Mark Event Complete         │
│  ├── UC-G2: Month View              ├── UC-H2: Skip Event                  │
│  ├── UC-G3: Week View               ├── UC-H3: View Goal Progress          │
│  ├── UC-G4: Day View                ├── UC-H4: View Session History        │
│  └── UC-G5: Filter Events           └── UC-H5: Export Progress Report      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed Use Cases

---

### Category A: Onboarding & Setup

---

#### UC-A1: Set Sleep Hours

| Field | Value |
|-------|-------|
| **ID** | UC-A1 |
| **Name** | Set Sleep Hours |
| **Actor** | Onboarding User |
| **Priority** | High |
| **Current Status** | ✅ Implemented |

**Description:**  
User configures their sleep schedule during onboarding so the system avoids scheduling ambition sessions during sleep.

**Preconditions:**
- User is authenticated
- User is on Step 4 (Your Schedule) of onboarding

**Main Flow:**
1. System displays time pickers for "Bedtime" and "Wake Time"
2. User sets bedtime (default: 22:30)
3. User sets wake time (default: 06:30)
4. System stores values in `time_constraints` table
5. System displays confirmation

**Alternative Flows:**
- A1: User skips (uses defaults)

**Postconditions:**
- `time_constraints.sleep_start` and `sleep_end` are set
- Scheduling excludes sleep window

**Acceptance Criteria:**
```gherkin
Given I am on the Schedule setup step
When I set bedtime to "11:00 PM" and wake time to "6:30 AM"
Then my calendar should never have events between 11:00 PM and 6:30 AM
```

---

#### UC-A2: Set Work Hours

| Field | Value |
|-------|-------|
| **ID** | UC-A2 |
| **Name** | Set Work Hours |
| **Actor** | Onboarding User |
| **Priority** | High |
| **Current Status** | ✅ Implemented |

**Description:**  
User defines their work schedule so ambition sessions are scheduled outside work hours.

**Preconditions:**
- User is on Step 4 of onboarding

**Main Flow:**
1. System displays work block configuration
2. User selects days (default: Mon-Fri, i.e., [0,1,2,3,4])
3. User sets start time (default: 09:00)
4. User sets end time (default: 17:00)
5. System stores in `time_blocks` table with `block_type='work'`

**Alternative Flows:**
- A1: User adds multiple work blocks (e.g., different times on different days)
- A2: User marks work block as "flexible" (`is_flexible=true`)

**Data Model:**
```typescript
interface TimeBlock {
  id: string;
  title: string;
  days: number[];      // 0=Mon, 6=Sun (NOT JavaScript 0=Sunday!)
  start: string;       // "09:00"
  end: string;         // "17:00"
  type: 'work' | 'personal' | 'commute' | 'meal' | 'other';
  isFlexible: boolean;
}
```

**Known Issue (GAP-013):**  
Day indexing inconsistency between DLULU (0=Mon) and JavaScript (0=Sun) can cause events on wrong days.

---

#### UC-A3: Set Peak Productivity Hours

| Field | Value |
|-------|-------|
| **ID** | UC-A3 |
| **Name** | Set Peak Productivity Hours |
| **Actor** | Onboarding User |
| **Priority** | Medium |
| **Current Status** | ⚠️ Partial (stored but not used for scheduling) |

**Description:**  
User identifies when they are most energetic to enable energy-based task matching.

**Preconditions:**
- User is on Step 4 of onboarding

**Expected Flow:**
1. System displays peak hours selector
2. User sets start (default: 09:00) and end (default: 12:00)
3. System stores in `time_constraints.peak_start` and `peak_end`

**Gap Identified:**  
- Peak hours are stored in database
- `generate-schedule` loads them
- BUT: High-energy tasks are NOT preferentially scheduled during peak hours
- The `peakMidHour` calculation exists but only affects `targetHour` for convenience, not actual energy matching

**Required Enhancement:**
```typescript
// Current (does not use energy matching)
const targetHour = preferredTime === 'morning' ? 9 : 
                   preferredTime === 'afternoon' ? 14 : 
                   preferredTime === 'evening' ? 19 : 
                   peakMidHour;

// Desired (energy-aware scheduling)
if (task.energyCost === 'high' && isPeakHour(slot)) {
  prioritizeSlot(slot);
}
```

---

#### UC-A4: Import Work Roster (Image Upload)

| Field | Value |
|-------|-------|
| **ID** | UC-A4 |
| **Name** | Import Work Roster from Image |
| **Actor** | Onboarding User (e.g., shift worker, nurse) |
| **Priority** | Medium |
| **Current Status** | ✅ Implemented |

**Description:**  
User uploads a screenshot of their work roster and AI extracts time blocks.

**Main Flow:**
1. User clicks "Upload Roster"
2. User selects image file
3. System encodes to base64
4. System calls `parseRosterImage` AI function
5. AI returns extracted TimeBlock[]
6. User confirms or edits extracted blocks
7. System saves to `time_blocks`

**AI Prompt Context:**
```
"Upload Roster" uses parseRosterImage (AI) to extract time blocks from screenshots.
```

---

#### UC-A5: Set Preferred Session Time

| Field | Value |
|-------|-------|
| **ID** | UC-A5 |
| **Name** | Set Preferred Session Time |
| **Actor** | Active User |
| **Priority** | Medium |
| **Current Status** | ✅ Implemented (per-ambition) |

**Description:**  
Each ambition can have a preferred time of day for sessions.

**Data Model:**
```typescript
interface Goal {
  preferredTime: 'morning' | 'afternoon' | 'evening' | 'flexible';
}
```

**Scheduling Logic:**
```javascript
// From generate-schedule/index.ts
const targetHour =
  preferredTime === 'morning' ? 9 :
  preferredTime === 'afternoon' ? 14 :
  preferredTime === 'evening' ? 19 :
  peakMidHour; // flexible uses peak hours
```

---

### Category B: Ambition-Based Scheduling

---

#### UC-B1: Generate Ambition Schedule

| Field | Value |
|-------|-------|
| **ID** | UC-B1 |
| **Name** | Generate Calendar Schedule for Ambition |
| **Actor** | Active User |
| **Priority** | Critical |
| **Current Status** | ✅ Implemented |

**Description:**  
System automatically creates calendar events for all tasks in an ambition.

**Preconditions:**
- Ambition exists with phases, milestones, and tasks
- User has constraints configured
- User clicks "Build Schedule" on ambition

**Main Flow:**
1. Frontend calls `POST /functions/v1/generate-schedule`
2. Edge Function loads ambition with all descendants
3. Function loads user constraints
4. Function fetches existing events to avoid conflicts
5. Function extracts schedulable items (SubTasks > Tasks > Milestones)
6. Function generates available time slots
7. Function distributes tasks into sessions
8. Function creates `calendar_events` records
9. Frontend refreshes calendar view

**Key Parameters:**
| Parameter | Source | Default |
|-----------|--------|---------|
| `frequency` | ambition.frequency | 3 sessions/week |
| `duration` | ambition.duration | 60 minutes |
| `estimated_weeks` | ambition.estimated_weeks | 12 weeks |
| `preferredTime` | ambition.preferred_time | 'flexible' |

**Acceptance Criteria:**
```gherkin
Given I have a goal "Learn Python" with 24 subtasks
And my goal frequency is 3 sessions per week
And my goal duration is 60 minutes
And my goal timeline is 12 weeks
When I click "Build Schedule"
Then 36 calendar events should be created (3 × 12)
And each event should contain multiple subtasks (packing)
And no events should overlap with my work hours
And no events should be during my sleep hours
```

---

#### UC-B2: Session Packing

| Field | Value |
|-------|-------|
| **ID** | UC-B2 |
| **Name** | Pack Multiple Tasks into Single Session |
| **Actor** | System (automatic) |
| **Priority** | High |
| **Current Status** | ✅ Implemented |

**Description:**  
When there are more tasks than calendar sessions, multiple tasks are grouped into a single event.

**Algorithm:**
```javascript
const sessionsCount = Math.min(totalSessionsWanted, tasks.length);
const itemsPerSession = Math.ceil(tasks.length / sessionsCount);

// Event summary: "Task A + 2 more"
// Event description: Checklist of all tasks in session
```

**Example:**
- 50 tasks, 20 sessions → 2-3 tasks per session
- Session 1: "Install Python + 2 more"
- Description:
  ```
  ☐ Install Python
  ☐ Set up IDE
  ☐ Create first file
  ```

---

#### UC-B3: Phase-Based Deadlines

| Field | Value |
|-------|-------|
| **ID** | UC-B3 |
| **Name** | Create Phase Deadline Events |
| **Actor** | System (automatic) |
| **Priority** | Medium |
| **Current Status** | ❌ Not Implemented |

**Description:**  
Each phase should have a deadline event marking when that phase should complete.

**Expected Behavior:**
```
Phase 1: Foundation (Week 1-3)
  → Creates all-day event on Week 3 Friday: "Phase 1 Deadline ⚠️"

Phase 2: Building (Week 4-8)
  → Creates all-day event on Week 8 Friday: "Phase 2 Deadline ⚠️"
```

**Required Event Type:**
```typescript
allocationType: 'milestone_deadline'
isAllDay: true
```

**Known Issue (GAP-024):**  
If implemented, milestone events should respect user constraints (currently hard-codes Friday).

---

#### UC-B4: Milestone Completion Reminders

| Field | Value |
|-------|-------|
| **ID** | UC-B4 |
| **Name** | Send Milestone Completion Reminders |
| **Actor** | Scheduled Job |
| **Priority** | Medium |
| **Current Status** | ❌ Not Implemented |

**Description:**  
Send push/email notification when milestone deadline approaches.

**Expected Flow:**
1. Cron job runs daily at 9 AM user's timezone
2. Query milestones where `target_week` matches current week
3. For each, check if milestone is incomplete
4. If incomplete, send reminder via chosen channel

**Reminder Options (from architecture doc):**
- A) Use Google Calendar reminders (requires sync)
- B) Build in-app push notifications
- C) Email notifications

---

#### UC-B5: Task Duration & Difficulty Estimation

| Field | Value |
|-------|-------|
| **ID** | UC-B5 |
| **Name** | Estimate Task Duration & Difficulty |
| **Actor** | System (automatic) + User (override) |
| **Priority** | High (upgraded from Low) |
| **Current Status** | ⚠️ Heuristic-based → Requires Enhancement |

**Description:**  
System estimates how long each task will take AND assigns cognitive difficulty for slot scoring.

**Current Heuristic:**
```javascript
const isComplex = subtask.title.length > 50 ||
  /research|analyze|create|build|design|implement|develop/i.test(subtask.title);

durationMinutes: isComplex ? 60 : 30
```

**NEW: Enhanced Task Data Model:**
```typescript
interface Task {
  id: string;
  title: string;
  difficulty: 1 | 2 | 3 | 4 | 5;          // NEW: Cognitive load (1=easy, 5=hard)
  cognitiveType: CognitiveType;            // NEW: For batching similar tasks
  estimatedMinutes: number;                // NEW: Per-task duration estimate
  dependencies: string[];                  // Task IDs that must complete first
}

type CognitiveType = 'deep_work' | 'shallow_work' | 'learning' | 'creative' | 'admin';
```

**Enhanced Heuristics (AI-assisted):**
```javascript
// During blueprint generation, AI should assign:
// - difficulty: Based on task complexity keywords and user skill level
// - cognitiveType: Based on task verb (research=learning, write=creative, etc.)
// - estimatedMinutes: Based on action + complexity + planning fallacy buffer (35%)

const difficultyFromKeywords = {
  'learn|understand|research': 3,  // Learning tasks
  'build|implement|develop': 4,    // Building tasks
  'design|create|architect': 5,    // Creative/complex tasks
  'review|update|fix': 2,          // Maintenance tasks
  'schedule|send|organize': 1,     // Admin tasks
};
```

**UI Requirements:**
- Display difficulty as colored badge (1=green → 5=red)
- Allow user to override difficulty per-task
- Show cognitive type as icon/color coding

**Limitations (still exist):**
- Does not use historical completion data
- Does not consider user's personal pace

---

### Category C: Manual Event Management

---

#### UC-C1: Create Event (Manual)

| Field | Value |
|-------|-------|
| **ID** | UC-C1 |
| **Name** | Manually Create Calendar Event |
| **Actor** | Active User |
| **Priority** | High |
| **Current Status** | ✅ Implemented |

**Description:**  
User creates an event by clicking on a calendar time slot.

**Trigger:** Click on empty time slot in CalendarView

**Form Fields (from CreateEventModal.tsx):**
| Field | Required | Type |
|-------|----------|------|
| Title | Yes | Text |
| Date | Yes | Date picker |
| Start Time | Yes | Time picker |
| End Time | Yes | Time picker (default: start + 60 min) |
| Description | No | Textarea |
| Linked Ambition | No | Dropdown (user's ambitions) |
| Session Type | No | Dropdown (goal_session, task, habit, blocked) |
| Priority | No | Select (high, medium, low) |
| Energy Cost | No | Select (high, medium, low) |
| **Difficulty** | No | Slider (1-5) with color coding **[NEW]** |
| **Cognitive Type** | No | Dropdown (deep_work, shallow_work, learning, creative, admin) **[NEW]** |
| **Lock Event** | No | Toggle (prevents auto-reschedule) **[NEW]** |
| Recurrence | No | Pattern builder |

**Postconditions:**
- Event saved to `calendar_events`
- `source='ambitionos'`
- `sync_status='local_only'`

---

#### UC-C2: View Event Details

| Field | Value |
|-------|-------|
| **ID** | UC-C2 |
| **Name** | View Event Details |
| **Actor** | Active User |
| **Priority** | High |
| **Current Status** | ⚠️ Partial (no dedicated view modal) |

**Description:**  
User clicks on an event to see full details.

**Expected Display (from CalendarArchitecturePlan.md):**
1. Header: Title, Status Badge, **Lock Icon 🔒 (if locked) [NEW]**
2. Time: "Wed, Jan 8 · 9:00 AM - 11:00 AM EST"
3. **Difficulty Badge: ⬤⬤⬤○○ (3/5) with color [NEW]**
4. **Cognitive Type: "Deep Work" tag [NEW]**
5. Progress: "Session 2 of 4 · 50% of task completed"
6. Roadmap Context: Ambition → Phase → Task links
7. Subtasks checklist (checkable from modal)
8. **AI Confidence: 87% with reasoning tooltip [NEW]**
9. AI Reasoning (if AI-scheduled)

**Gap Identified:**  
Currently clicks open Edit mode immediately. Need dedicated View mode first.

---

#### UC-C3: Edit Event

| Field | Value |
|-------|-------|
| **ID** | UC-C3 |
| **Name** | Edit Existing Event |
| **Actor** | Active User |
| **Priority** | High |
| **Current Status** | ✅ Implemented |

**Description:**  
User modifies event details.

**Editable Fields:**
- Title, Description, Location
- Start/End time
- Linked Ambition/Phase/Milestone
- Priority, Energy Cost
- **Difficulty (1-5 slider) [NEW]**
- **Cognitive Type (dropdown) [NEW]**
- **Lock Event (toggle) [NEW]**
- Recurrence pattern

**Postconditions:**
- Event updated in database
- If synced to Google, `sync_status='pending_sync'`

---

#### UC-C4: Delete Event

| Field | Value |
|-------|-------|
| **ID** | UC-C4 |
| **Name** | Delete Event |
| **Actor** | Active User |
| **Priority** | High |
| **Current Status** | ✅ Implemented |

**Description:**  
User removes an event from calendar.

**Confirmation Required:** Yes

**Postconditions:**
- Event removed from `calendar_events`
- If synced to Google, deletion should propagate

---

#### UC-C5: Drag to Reschedule

| Field | Value |
|-------|-------|
| **ID** | UC-C5 |
| **Name** | Drag Event to New Time |
| **Actor** | Active User |
| **Priority** | High |
| **Current Status** | ⚠️ UI works, DB persistence broken (GAP-017) |

**Description:**  
User drags an event to a new day/time.

**Current Issue:**
- Draggable component is set up
- Visual update works
- `onEventUpdate` callback exists
- BUT: Database is NOT updated on drag-end

**Required Fix:**
```javascript
// In handleDragEnd
await supabase
  .from('calendar_events')
  .update({
    start_datetime: newStart,
    end_datetime: newEnd,
    original_start_datetime: wasNeverRescheduled ? originalStart : undefined,
    reschedule_count: increment
  })
  .eq('id', eventId);
```

---

#### UC-C6: Resize Event Duration

| Field | Value |
|-------|-------|
| **ID** | UC-C6 |
| **Name** | Resize Event to Change Duration |
| **Actor** | Active User |
| **Priority** | Medium |
| **Current Status** | ⚠️ Visual only (same issue as UC-C5) |

**Description:**  
User drags the bottom edge of an event to make it longer/shorter.

---

### Category D: Recurring Events (Habits)

---

#### UC-D1: Create Recurring Habit

| Field | Value |
|-------|-------|
| **ID** | UC-D1 |
| **Name** | Create Recurring Habit Event |
| **Actor** | Active User |
| **Priority** | High |
| **Current Status** | ⚠️ Schema exists, UI incomplete |

**Description:**  
User creates a habit that repeats on a schedule.

**Expected Flow:**
1. User opens Create Event modal
2. User enables "Recurring" toggle
3. User selects pattern:
   - Daily
   - Weekly (+ select days)
   - Monthly (+ select day of month)
4. User sets end condition (date, count, or never)
5. System generates RRULE string
6. System saves event with `is_recurring=true`

**RRULE Examples:**
```
Daily at 7 AM:
RRULE:FREQ=DAILY

Mon/Wed/Fri:
RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR

Every 2 weeks:
RRULE:FREQ=WEEKLY;INTERVAL=2

Until March 1:
RRULE:FREQ=DAILY;UNTIL=20260301T000000Z
```

**Current State:**
- `CalendarEvent.isRecurring` field exists
- `CalendarEvent.recurrence` field exists (string[])
- `CalendarEvent.recurrenceRule` field exists (string)
- `generateRecurringInstances()` function exists in CalendarView
- BUT: No UI to create recurring events

---

#### UC-D2: Edit Single Recurring Instance

| Field | Value |
|-------|-------|
| **ID** | UC-D2 |
| **Name** | Edit One Instance of Recurring Event |
| **Actor** | Active User |
| **Priority** | Medium |
| **Current Status** | ❌ Not Implemented |

**Description:**  
User modifies just one occurrence without affecting others.

**Expected Behavior:**
1. User clicks recurring instance
2. User edits (e.g., changes time)
3. System prompts: "Edit this event only or all future?"
4. If "This event only":
   - Create exception event
   - Store `recurring_event_id` pointing to parent
   - Mark original instance as excluded

**Known Issue (GAP-018):**
- Instance IDs are generated locally, not persisted
- Cannot edit single instance without affecting series

---

#### UC-D3: Edit All Future Instances

| Field | Value |
|-------|-------|
| **ID** | UC-D3 |
| **Name** | Edit All Future Recurring Instances |
| **Actor** | Active User |
| **Priority** | Medium |
| **Current Status** | ❌ Not Implemented |

**Description:**  
User changes all future occurrences from a given date.

**Expected Behavior:**
1. User edits recurring event
2. User selects "This and all future"
3. System ends original series at edit date
4. System creates new series starting from edit date with new pattern

---

#### UC-D4: Skip Habit Instance

| Field | Value |
|-------|-------|
| **ID** | UC-D4 |
| **Name** | Skip One Habit Instance |
| **Actor** | Active User |
| **Priority** | Medium |
| **Current Status** | ⚠️ Skip works for regular events |

**Description:**  
User marks a habit instance as skipped (with optional reason).

**Expected Flow:**
1. User clicks habit instance
2. User clicks "Skip"
3. System prompts for optional reason
4. Instance marked `status='skipped'`
5. Streak may be affected (configurable)

---

#### UC-D5: Track Habit Streak

| Field | Value |
|-------|-------|
| **ID** | UC-D5 |
| **Name** | Track and Display Habit Streak |
| **Actor** | Active User |
| **Priority** | Medium |
| **Current Status** | ❌ Not Implemented |

**Description:**  
System tracks consecutive completions of a habit.

**Expected Data (from AIMetadata):**
```typescript
aiMetadata: {
  habit: {
    streak_count: 14,
    last_completed: "2026-01-30",
    pattern_description: "Every Mon, Wed, Fri at 9am"
  }
}
```

**Display:**
- 🔥 14 day streak
- Longest: 21 days
- Completion rate: 87%

---

### Category E: External Sync

---

#### UC-E1: Connect Google Calendar

| Field | Value |
|-------|-------|
| **ID** | UC-E1 |
| **Name** | Connect Google Calendar Account |
| **Actor** | Active User |
| **Priority** | Critical |
| **Current Status** | ❌ Not Implemented |

**Description:**  
User authorizes DLULU to access their Google Calendar.

**Expected Flow:**
1. User navigates to Settings
2. User clicks "Connect Google Calendar"
3. System redirects to Google OAuth consent screen
4. User grants permissions (calendar.events scope)
5. Google redirects back with auth code
6. System exchanges code for tokens
7. System stores refresh token in `calendar_sync_tokens`
8. System performs initial sync

**Required Database:**
```sql
CREATE TABLE calendar_sync_tokens (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  provider TEXT DEFAULT 'google',
  access_token TEXT,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  sync_token TEXT,
  last_synced_at TIMESTAMPTZ
);
```

---

#### UC-E2: Import Events from Google

| Field | Value |
|-------|-------|
| **ID** | UC-E2 |
| **Name** | Import Events from Google Calendar |
| **Actor** | System (after connect) |
| **Priority** | Critical |
| **Current Status** | ❌ Not Implemented |

**Description:**  
System pulls existing Google Calendar events to display and avoid conflicts.

**Expected Behavior:**
- Import events for configurable window (e.g., -1 month to +3 months)
- Store with `source='google_calendar'`
- Do NOT allow editing Google events in DLULU (read-only display)
- Include in conflict detection for `generate-schedule`

---

#### UC-E3: Push Events to Google

| Field | Value |
|-------|-------|
| **ID** | UC-E3 |
| **Name** | Push DLULU Events to Google Calendar |
| **Actor** | System (on event create/update) |
| **Priority** | Critical |
| **Current Status** | ❌ Not Implemented |

**Description:**  
When user creates/edits an event in DLULU, it appears in Google Calendar.

**Expected Flow:**
1. Event created/updated in DLULU
2. Background job detects `sync_status='pending_sync'`
3. Job calls Google Calendar API to create/update event
4. On success: `sync_status='synced'`, `external_event_id=<googleId>`
5. On failure: `sync_status='sync_error'`

---

#### UC-E4: Receive Google Calendar Webhook

| Field | Value |
|-------|-------|
| **ID** | UC-E4 |
| **Name** | Handle Google Calendar Change Notification |
| **Actor** | External Calendar (webhook) |
| **Priority** | High |
| **Current Status** | ❌ Not Implemented |

**Description:**  
When user edits event in Google Calendar, DLULU receives notification.

**Expected Flow:**
1. Google sends POST to webhook endpoint
2. System validates `X-Goog-Channel-Token`
3. System triggers incremental sync using stored `syncToken`
4. Changes applied to `calendar_events`

---

#### UC-E5: Resolve Sync Conflicts

| Field | Value |
|-------|-------|
| **ID** | UC-E5 |
| **Name** | Resolve Bidirectional Sync Conflicts |
| **Actor** | System / Active User |
| **Priority** | High |
| **Current Status** | ❌ Not Implemented |

**Description:**  
When same event is edited in both DLULU and Google, system must resolve.

**Options:**
| Strategy | Description |
|----------|-------------|
| Last Write Wins | Most recent edit prevails (automatic) |
| DLULU Wins | Local changes always override (local-first) |
| Prompt User | Show diff and let user choose |

**Recommended:** Last Write Wins with audit trail in `history_entries`.

---

### Category F: Intelligent Features

---

#### UC-F1: Conflict Detection

| Field | Value |
|-------|-------|
| **ID** | UC-F1 |
| **Name** | Detect Scheduling Conflicts |
| **Actor** | System |
| **Priority** | High |
| **Current Status** | ⚠️ Partial (only DLULU events) |

**Description:**  
System checks for overlapping events before creating new ones.

**Current Implementation (CreateEventModal.tsx):**
```javascript
const checkForConflicts = (start: Date, end: Date): CalendarEvent | null => {
  // Only checks events already in DLULU
  return existingEvents.find(event => overlaps(event, start, end));
};
```

**Gap:**  
Does NOT check Google Calendar events (because they're not imported yet).

---

#### UC-F2: Auto-Reschedule Missed Sessions

| Field | Value |
|-------|-------|
| **ID** | UC-F2 |
| **Name** | Automatically Reschedule Missed Sessions |
| **Actor** | Scheduled Job |
| **Priority** | High |
| **Current Status** | ❌ Not Implemented |

**Description:**  
When a session time passes without completion, system reschedules it.

**Expected Flow:**
1. Cron job runs hourly
2. Query: `WHERE start_datetime < NOW() AND status = 'scheduled'`
3. For each missed event:
   - Mark `status='missed'`
   - Find next available slot
   - Create new event with same properties
   - Increment `reschedule_count`
   - Link to `original_start_datetime`

**Current Problem:**  
Events that pass remain `status='scheduled'` forever.

---

#### UC-F3: Energy-Based Task Matching

| Field | Value |
|-------|-------|
| **ID** | UC-F3 |
| **Name** | Match High-Energy Tasks to Peak Hours |
| **Actor** | System (scheduling) |
| **Priority** | Medium |
| **Current Status** | ❌ Not Implemented |

**Description:**  
Schedule tasks requiring high energy during user's peak productivity hours.

**Data Available:**
- `user_profile.chronotype` (early_bird, night_owl, etc.)
- `time_constraints.peak_start/peak_end`
- `goal.energy_cost` (high, medium, low)
- `event.energyCost` (high, medium, low)

**Expected Logic:**
```
IF task.energyCost == 'high' 
AND slot.time BETWEEN peak_start AND peak_end
THEN prioritize this slot
```

---

#### UC-F4: Protect Focus Time

| Field | Value |
|-------|-------|
| **ID** | UC-F4 |
| **Name** | Protect Dedicated Focus Time |
| **Actor** | Active User |
| **Priority** | Medium |
| **Current Status** | ⚠️ Partial (via blocked time) |

**Description:**  
User can designate blocks as "focus time" that won't be interrupted.

**Current Workaround:**  
User creates `time_block` with `type='other'` and title "Focus Time".

**Desired Enhancement:**  
- Dedicated "Focus Time" block type
- AI scheduling prioritizes deep work during focus blocks
- Integration with Google Calendar's focus time feature

---

#### UC-F5: Deadline Compression

| Field | Value |
|-------|-------|
| **ID** | UC-F5 |
| **Name** | Compress Schedule When Deadline Moves Up |
| **Actor** | Active User / System |
| **Priority** | Medium |
| **Current Status** | ❌ Not Implemented |

**Description:**  
If ambition deadline is shortened, remaining sessions are compressed.

**Expected Flow:**
1. User changes ambition timeline from 12 weeks to 8 weeks
2. System calculates remaining sessions needed
3. System calculates available slots before new deadline
4. If slots < sessions:
   - Option A: Increase frequency
   - Option B: Increase duration
   - Option C: Pack more tasks per session
   - Option D: Alert: "Not achievable - reduce scope"

---

### Category G: Visualization & Navigation

*(All implemented - brief documentation)*

---

#### UC-G1 through UC-G4: Calendar Views

| ID | View | Status |
|----|------|--------|
| UC-G1 | Year View | ✅ Implemented |
| UC-G2 | Month View | ✅ Implemented |
| UC-G3 | Week View | ✅ Implemented |
| UC-G4 | Day View | ✅ Implemented |

---

#### UC-G5: Filter Events

| Field | Value |
|-------|-------|
| **ID** | UC-G5 |
| **Name** | Filter Calendar Events |
| **Actor** | Active User |
| **Priority** | Low |
| **Current Status** | ✅ Implemented |

**Filter Options:**
- Text search (title, description)
- Event type (goal_session, task, habit, etc.)
- Source (ambitionos, google_calendar)
- Status (scheduled, completed, skipped)

---

### Category H: Progress & Tracking

---

#### UC-H1: Mark Event Complete

| Field | Value |
|-------|-------|
| **ID** | UC-H1 |
| **Name** | Mark Event as Completed |
| **Actor** | Active User |
| **Priority** | High |
| **Current Status** | ✅ Implemented |

**Description:**  
User marks a session as done, updating progress.

**Postconditions:**
- `event.status = 'completed'`
- `event.completed_at = NOW()`
- If linked to task, propagate completion check
- If all sessions for task done, task marked complete

---

#### UC-H2: Skip Event

| Field | Value |
|-------|-------|
| **ID** | UC-H2 |
| **Name** | Skip Scheduled Event |
| **Actor** | Active User |
| **Priority** | Medium |
| **Current Status** | ✅ Implemented |

**Description:**  
User explicitly skips a session with optional reason.

**Postconditions:**
- `event.status = 'skipped'`
- `event.skipped_reason = <user input>`

---

#### UC-H3: View Ambition Progress via Calendar

| Field | Value |
|-------|-------|
| **ID** | UC-H3 |
| **Name** | View Ambition Progress from Calendar |
| **Actor** | Active User |
| **Priority** | Medium |
| **Current Status** | ⚠️ Partial |

**Description:**  
Clicking on an ambition session shows overall ambition progress.

**Expected Display:**
- Sessions completed: 8 of 36
- Tasks completed: 12 of 50
- Phase: 2 of 4
- On track: Yes ✅ / Behind: 2 sessions ⚠️

---

#### UC-H4: View Session History

| Field | Value |
|-------|-------|
| **ID** | UC-H4 |
| **Name** | View Session History for Ambition |
| **Actor** | Active User |
| **Priority** | Low |
| **Current Status** | ⚠️ Available via history_entries table |

**Description:**  
User sees log of all sessions: completed, skipped, rescheduled.

---

#### UC-H5: Export Progress Report

| Field | Value |
|-------|-------|
| **ID** | UC-H5 |
| **Name** | Export Calendar/Progress Report |
| **Actor** | Active User |
| **Priority** | Low |
| **Current Status** | ❌ Not Implemented |

**Description:**  
Export calendar data as PDF, CSV, or iCal format.

---

## 4. Gap Summary

### By Priority

| Priority | Count | Examples |
|----------|-------|----------|
| **Critical (P0)** | 4 | Google sync (UC-E1, E2, E3), Auto-reschedule (UC-F2) |
| **High (P1)** | 6 | Drag persistence (UC-C5), Conflict detection (UC-F1) |
| **Medium (P2)** | 10 | Recurring habits UI, Energy matching, Streak tracking |
| **Low (P3)** | 5 | Export, phase deadlines, session history UI |

### Current vs. Desired State

| Area | Current State | Desired State |
|------|---------------|---------------|
| **Scheduling** | Works, deterministic | Add energy matching, preview |
| **Google Sync** | Not implemented | Full bidirectional |
| **Recurring** | Schema only | Full UI + exception handling |
| **Rescheduling** | Manual only | Automatic missed recovery |
| **Progress** | Basic | Session-aware, streak tracking |

---

## 5. Acceptance Test Checklist

```gherkin
# Core Scheduling
[ ] Given a goal with 50 tasks, when I build schedule, then all tasks are distributed across sessions
[ ] Given work hours 9-5, when schedule is built, no events fall within 9-5
[ ] Given sleep hours 10pm-6am, when schedule is built, no events fall within that window

# Manual Events  
[ ] Given an empty time slot, when I click it, then create event modal opens with that time pre-filled
[ ] Given an event, when I drag it to a new time, then the database is updated
[ ] Given an event, when I resize it, then the end time is updated in database

# Recurring Events
[ ] Given I create a weekly habit, when I view the month, then I see instances on each week
[ ] Given a recurring event, when I edit one instance, then only that instance changes
[ ] Given a habit with 7 completions in a row, when I view it, then I see "7 day streak"

# External Sync
[ ] Given I connect Google Calendar, when sync completes, then my Google events appear in DLULU
[ ] Given I create an event in DLULU, when sync runs, then the event appears in Google Calendar
[ ] Given an event is edited in Google, when webhook fires, then DLULU reflects the change

# Intelligent Features
[ ] Given a missed session, when 1 hour passes, then it is auto-rescheduled to next available slot
[ ] Given a high-energy task and peak hours 9-12, when scheduling, then the task is placed at 9-12
[ ] Given overlapping events, when I try to create a new event, then I see a conflict warning
```

---

*This document provides a complete catalog of calendar functionality for implementation and testing.*
