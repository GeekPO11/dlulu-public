-- =============================================================================
-- AmbitionOS Database Schema
-- PostgreSQL 15+
-- =============================================================================
-- 
-- Run this script to create all tables:
-- psql -U postgres -d ambitionos -f schema.sql
--
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- USERS & AUTHENTICATION
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    email_verified  BOOLEAN DEFAULT FALSE,
    is_active       BOOLEAN DEFAULT TRUE,
    
    -- OAuth (future)
    oauth_provider  VARCHAR(50),
    oauth_id        VARCHAR(255),
    
    -- Timestamps
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at   TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT users_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_oauth ON users(oauth_provider, oauth_id) WHERE oauth_provider IS NOT NULL;

-- =============================================================================
-- USER PROFILES
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_profiles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    
    -- Basic Info
    name            VARCHAR(100) NOT NULL,
    role            VARCHAR(100) NOT NULL,
    role_context    VARCHAR(200),
    bio             TEXT,
    
    -- Productivity Settings
    chronotype      VARCHAR(20) NOT NULL DEFAULT 'flexible',
    work_style      VARCHAR(20) NOT NULL DEFAULT 'balanced',
    energy_level    VARCHAR(20) NOT NULL DEFAULT 'balanced',
    
    -- Timestamps
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT profile_chronotype_check CHECK (chronotype IN ('early_bird', 'night_owl', 'midday_peak', 'flexible')),
    CONSTRAINT profile_work_style_check CHECK (work_style IN ('deep_work', 'pomodoro', 'flow', 'reactive')),
    CONSTRAINT profile_energy_level_check CHECK (energy_level IN ('high_octane', 'balanced', 'recovery'))
);

CREATE INDEX IF NOT EXISTS idx_profiles_user ON user_profiles(user_id);

-- =============================================================================
-- TIME CONSTRAINTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS time_constraints (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    
    -- Sleep Window
    sleep_start     TIME NOT NULL DEFAULT '22:30',
    sleep_end       TIME NOT NULL DEFAULT '06:30',
    
    -- Peak Productivity
    peak_start      TIME DEFAULT '09:00',
    peak_end        TIME DEFAULT '12:00',
    
    -- Timestamps
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_constraints_user ON time_constraints(user_id);

-- =============================================================================
-- TIME BLOCKS
-- =============================================================================

CREATE TABLE IF NOT EXISTS time_blocks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    constraint_id   UUID REFERENCES time_constraints(id) ON DELETE CASCADE,
    
    -- Block Info
    title           VARCHAR(100) NOT NULL,
    block_type      VARCHAR(20) NOT NULL,
    days            INTEGER[] NOT NULL,
    start_time      TIME NOT NULL,
    end_time        TIME NOT NULL,
    is_flexible     BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT time_block_type_check CHECK (block_type IN ('work', 'personal', 'commute', 'meal', 'other')),
    CONSTRAINT time_block_days_check CHECK (array_length(days, 1) > 0)
);

CREATE INDEX IF NOT EXISTS idx_time_blocks_user ON time_blocks(user_id);
CREATE INDEX IF NOT EXISTS idx_time_blocks_constraint ON time_blocks(constraint_id);

-- =============================================================================
-- GOALS
-- =============================================================================

CREATE TABLE IF NOT EXISTS goals (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Basic Info
    title               VARCHAR(255) NOT NULL,
    original_input      TEXT,
    category            VARCHAR(20) NOT NULL,
    timeline            VARCHAR(50),
    estimated_weeks     INTEGER,
    
    -- AI-Generated Strategy
    strategy_overview   TEXT,
    critical_gaps       TEXT[],
    
    -- Tracking
    current_phase_index INTEGER DEFAULT 0,
    overall_progress    DECIMAL(5,2) DEFAULT 0,
    status              VARCHAR(20) NOT NULL DEFAULT 'planning',
    is_scheduled        BOOLEAN DEFAULT FALSE,
    
    -- Scheduling Preferences
    preferred_time      VARCHAR(20) DEFAULT 'flexible',
    frequency           INTEGER DEFAULT 3,
    duration            INTEGER DEFAULT 60,
    energy_cost         VARCHAR(10) DEFAULT 'medium',
    preferred_days      INTEGER[],
    
    -- Timestamps
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT goal_category_check CHECK (category IN ('health', 'career', 'learning', 'personal', 'financial', 'relationships')),
    CONSTRAINT goal_status_check CHECK (status IN ('planning', 'active', 'paused', 'completed', 'abandoned')),
    CONSTRAINT goal_time_check CHECK (preferred_time IN ('morning', 'afternoon', 'evening', 'flexible')),
    CONSTRAINT goal_energy_check CHECK (energy_cost IN ('high', 'medium', 'low')),
    CONSTRAINT goal_progress_check CHECK (overall_progress >= 0 AND overall_progress <= 100)
);

CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
CREATE INDEX IF NOT EXISTS idx_goals_category ON goals(category);

-- =============================================================================
-- PHASES
-- =============================================================================

CREATE TABLE IF NOT EXISTS phases (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goal_id             UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    
    -- Phase Info
    number              INTEGER NOT NULL,
    title               VARCHAR(255) NOT NULL,
    description         TEXT,
    
    -- Timeline
    start_week          INTEGER NOT NULL,
    end_week            INTEGER NOT NULL,
    estimated_duration  VARCHAR(50),
    
    -- Focus Areas
    focus               TEXT[],
    
    -- Status
    status              VARCHAR(20) DEFAULT 'upcoming',
    progress            DECIMAL(5,2) DEFAULT 0,
    is_scheduled        BOOLEAN DEFAULT FALSE,
    
    -- AI Coaching
    coach_advice        TEXT,
    
    -- Timestamps
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT phase_status_check CHECK (status IN ('upcoming', 'active', 'completed')),
    CONSTRAINT phase_number_positive CHECK (number > 0),
    CONSTRAINT phase_week_order CHECK (end_week >= start_week)
);

CREATE INDEX IF NOT EXISTS idx_phases_goal ON phases(goal_id);
CREATE INDEX IF NOT EXISTS idx_phases_status ON phases(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_phases_goal_number ON phases(goal_id, number);

-- =============================================================================
-- MILESTONES
-- =============================================================================

CREATE TABLE IF NOT EXISTS milestones (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phase_id        UUID NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
    goal_id         UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    
    -- Milestone Info
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    
    -- Status
    is_completed    BOOLEAN DEFAULT FALSE,
    completed_at    TIMESTAMP WITH TIME ZONE,
    
    -- User Notes
    user_notes      TEXT,
    
    -- Ordering
    display_order   INTEGER DEFAULT 0,
    target_week     INTEGER,
    
    -- Timestamps
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_milestones_phase ON milestones(phase_id);
CREATE INDEX IF NOT EXISTS idx_milestones_goal ON milestones(goal_id);
CREATE INDEX IF NOT EXISTS idx_milestones_completed ON milestones(is_completed);

-- =============================================================================
-- TASKS (Layer between Milestones and SubTasks)
-- Hierarchy: Goal → Phase → Milestone → Task → SubTask
-- =============================================================================

CREATE TABLE IF NOT EXISTS tasks (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    milestone_id        UUID NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
    phase_id            UUID REFERENCES phases(id) ON DELETE CASCADE,
    goal_id             UUID REFERENCES goals(id) ON DELETE CASCADE,
    user_id             UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Task Info
    title               VARCHAR(255) NOT NULL,
    description         TEXT,
    
    -- Status
    is_completed        BOOLEAN DEFAULT FALSE,
    completed_at        TIMESTAMP WITH TIME ZONE,
    
    -- Flags
    is_strikethrough    BOOLEAN DEFAULT FALSE,
    strikethrough_reason TEXT,
    
    -- Scheduling hints
    start_day           INTEGER,
    end_day             INTEGER,
    duration_days       INTEGER,
    times_per_week      INTEGER DEFAULT 1,
    
    -- Ordering
    display_order       INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_milestone ON tasks(milestone_id);
CREATE INDEX IF NOT EXISTS idx_tasks_phase ON tasks(phase_id);
CREATE INDEX IF NOT EXISTS idx_tasks_goal ON tasks(goal_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(is_completed);

-- =============================================================================
-- SUB-TASKS
-- =============================================================================

CREATE TABLE IF NOT EXISTS sub_tasks (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id             UUID REFERENCES tasks(id) ON DELETE CASCADE,
    milestone_id        UUID REFERENCES milestones(id) ON DELETE CASCADE,
    
    -- Task Info
    title               VARCHAR(255) NOT NULL,
    description         TEXT,
    
    -- Status
    is_completed        BOOLEAN DEFAULT FALSE,
    completed_at        TIMESTAMP WITH TIME ZONE,
    
    -- Flags
    is_manual           BOOLEAN DEFAULT FALSE,
    is_strikethrough    BOOLEAN DEFAULT FALSE,
    strikethrough_reason TEXT,
    
    -- Ordering
    display_order       INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_tasks_task ON sub_tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_sub_tasks_milestone ON sub_tasks(milestone_id);
CREATE INDEX IF NOT EXISTS idx_sub_tasks_completed ON sub_tasks(is_completed);

-- =============================================================================
-- CALENDAR EVENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS calendar_events (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Basic Event Info
    summary             VARCHAR(255) NOT NULL,
    description         TEXT,
    location            VARCHAR(255),
    
    -- Timing
    start_datetime      TIMESTAMP WITH TIME ZONE NOT NULL,
    end_datetime        TIMESTAMP WITH TIME ZONE NOT NULL,
    start_date          DATE,
    end_date            DATE,
    timezone            VARCHAR(50) DEFAULT 'UTC',
    
    -- Display
    color_id            VARCHAR(10),
    
    -- Sync Status
    source              VARCHAR(20) NOT NULL DEFAULT 'ambitionos',
    sync_status         VARCHAR(20) DEFAULT 'local_only',
    external_event_id   VARCHAR(255),
    
    -- AmbitionOS Metadata
    goal_id             UUID REFERENCES goals(id) ON DELETE SET NULL,
    phase_id            UUID REFERENCES phases(id) ON DELETE SET NULL,
    milestone_id        UUID REFERENCES milestones(id) ON DELETE SET NULL,
    
    event_type          VARCHAR(30) NOT NULL DEFAULT 'goal_session',
    energy_cost         VARCHAR(10),
    status              VARCHAR(20) DEFAULT 'scheduled',
    rationale           TEXT,
    reschedule_count    INTEGER DEFAULT 0,
    original_start      TIMESTAMP WITH TIME ZONE,
    
    -- Recurrence
    recurrence_rule     JSONB,
    is_recurring        BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT event_source_check CHECK (source IN ('ambitionos', 'google_calendar', 'outlook', 'imported')),
    CONSTRAINT event_sync_check CHECK (sync_status IN ('local_only', 'synced', 'pending_sync', 'sync_error')),
    CONSTRAINT event_type_check CHECK (event_type IN ('goal_session', 'milestone_deadline', 'habit', 'task', 'blocked'))
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_user ON calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_goal ON calendar_events(goal_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON calendar_events(start_datetime);
CREATE INDEX IF NOT EXISTS idx_calendar_events_date_range ON calendar_events(start_datetime, end_datetime);
CREATE INDEX IF NOT EXISTS idx_calendar_events_sync ON calendar_events(sync_status);

-- =============================================================================
-- SPRINTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS sprints (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Week Info
    week_start      DATE NOT NULL,
    week_end        DATE NOT NULL,
    
    -- Progress
    total_tasks     INTEGER DEFAULT 0,
    completed_tasks INTEGER DEFAULT 0,
    progress        DECIMAL(5,2) DEFAULT 0,
    
    -- Status
    status          VARCHAR(20) DEFAULT 'active',
    
    -- Timestamps
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT sprint_status_check CHECK (status IN ('planning', 'active', 'completed', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_sprints_user ON sprints(user_id);
CREATE INDEX IF NOT EXISTS idx_sprints_week ON sprints(week_start);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sprints_user_week ON sprints(user_id, week_start);

-- =============================================================================
-- SPRINT TASKS
-- =============================================================================

CREATE TABLE IF NOT EXISTS sprint_tasks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sprint_id       UUID NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
    
    -- Task Info
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    
    -- Links
    goal_id         UUID REFERENCES goals(id) ON DELETE SET NULL,
    goal_title      VARCHAR(255),
    phase_id        UUID REFERENCES phases(id) ON DELETE SET NULL,
    phase_title     VARCHAR(255),
    milestone_id    UUID REFERENCES milestones(id) ON DELETE SET NULL,
    calendar_event_id UUID REFERENCES calendar_events(id) ON DELETE SET NULL,
    
    -- Scheduling
    scheduled_date  DATE NOT NULL,
    scheduled_time  TIME,
    duration        INTEGER,
    is_all_day      BOOLEAN DEFAULT FALSE,
    is_recurring    BOOLEAN DEFAULT FALSE,
    
    -- Priority & Energy
    priority        VARCHAR(10) DEFAULT 'medium',
    energy_cost     VARCHAR(10),
    
    -- Status
    status          VARCHAR(20) DEFAULT 'todo',
    completed_at    TIMESTAMP WITH TIME ZONE,
    
    -- User Data
    notes           TEXT,
    
    -- Timestamps
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT task_priority_check CHECK (priority IN ('high', 'medium', 'low')),
    CONSTRAINT task_status_check CHECK (status IN ('todo', 'in_progress', 'completed', 'skipped', 'rescheduled'))
);

CREATE INDEX IF NOT EXISTS idx_sprint_tasks_sprint ON sprint_tasks(sprint_id);
CREATE INDEX IF NOT EXISTS idx_sprint_tasks_goal ON sprint_tasks(goal_id);
CREATE INDEX IF NOT EXISTS idx_sprint_tasks_date ON sprint_tasks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_sprint_tasks_status ON sprint_tasks(status);

-- =============================================================================
-- TASK COMMENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS task_comments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id         UUID NOT NULL REFERENCES sprint_tasks(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Comment Content
    content         TEXT NOT NULL,
    
    -- Timestamps
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_user ON task_comments(user_id);

-- =============================================================================
-- TASK ATTACHMENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS task_attachments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id         UUID NOT NULL REFERENCES sprint_tasks(id) ON DELETE CASCADE,
    
    -- Attachment Info
    filename        VARCHAR(255) NOT NULL,
    file_type       VARCHAR(50),
    file_size       INTEGER,
    storage_url     TEXT NOT NULL,
    
    -- Timestamps
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id);

-- =============================================================================
-- HISTORY ENTRIES
-- =============================================================================

CREATE TABLE IF NOT EXISTS history_entries (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goal_id         UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Event Info
    event_type      VARCHAR(30) NOT NULL,
    
    -- Details (JSONB for flexibility)
    details         JSONB,
    
    -- Timestamps
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_history_goal ON history_entries(goal_id);
CREATE INDEX IF NOT EXISTS idx_history_user ON history_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_history_type ON history_entries(event_type);
CREATE INDEX IF NOT EXISTS idx_history_created ON history_entries(created_at DESC);

-- =============================================================================
-- ROADMAPS (Snapshot storage)
-- =============================================================================

CREATE TABLE IF NOT EXISTS roadmaps (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Roadmap Data
    roadmap_data    JSONB NOT NULL,
    
    -- Metadata
    total_weeks     INTEGER,
    start_date      DATE,
    version         INTEGER DEFAULT 1,
    
    -- Timestamps
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roadmaps_user ON roadmaps(user_id);

-- =============================================================================
-- REFINEMENT HISTORY
-- =============================================================================

CREATE TABLE IF NOT EXISTS refinement_history (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    roadmap_id      UUID REFERENCES roadmaps(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Request/Response
    user_request    TEXT NOT NULL,
    ai_summary      TEXT,
    changes         JSONB,
    
    -- Context
    focused_goal_id UUID,
    focused_phase_id UUID,
    
    -- Timestamps
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refinement_roadmap ON refinement_history(roadmap_id);
CREATE INDEX IF NOT EXISTS idx_refinement_user ON refinement_history(user_id);

-- =============================================================================
-- TRIGGERS FOR updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to all tables with updated_at
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE column_name = 'updated_at' 
        AND table_schema = 'public'
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS update_%s_updated_at ON %s;
            CREATE TRIGGER update_%s_updated_at
            BEFORE UPDATE ON %s
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
        ', t, t, t, t);
    END LOOP;
END;
$$;

-- =============================================================================
-- SEED DATA (Optional - for testing)
-- =============================================================================

-- Insert a test user (password: 'password123')
-- INSERT INTO users (email, password_hash) VALUES 
-- ('test@ambitionos.com', '$2b$10$rIC.Qp1LG1jSK4z.rMvpOeL3MxHxJr1WfRw7Y8xg5M0b5cXXXXXXX');

-- =============================================================================
-- END OF SCHEMA
-- =============================================================================


