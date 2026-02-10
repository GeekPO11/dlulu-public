-- =============================================================================
-- AmbitionOS Seed Data
-- For local development and testing
-- =============================================================================
--
-- Run this after schema.sql to populate with test data:
-- psql -U postgres -d ambitionos -f seed.sql
--
-- =============================================================================

-- =============================================================================
-- TEST USER
-- Email: demo@ambitionos.com
-- Password: demo123 (bcrypt hash below)
-- =============================================================================

INSERT INTO users (id, email, password_hash, email_verified, is_active)
VALUES (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'demo@ambitionos.com',
    '$2b$10$K4r8h6EXAOoQKJzJPq6Zu.7H.4IfVBVnJQPd0xL3mF7vY8vL5WXWW',
    true,
    true
) ON CONFLICT (email) DO NOTHING;

-- =============================================================================
-- USER PROFILE
-- =============================================================================

INSERT INTO user_profiles (id, user_id, name, role, role_context, bio, chronotype, work_style, energy_level)
VALUES (
    'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'Demo User',
    'Software Developer',
    'Full-stack development at a tech startup',
    'Passionate about learning and personal growth. Looking to balance career advancement with health and personal development goals.',
    'early_bird',
    'deep_work',
    'balanced'
) ON CONFLICT (user_id) DO NOTHING;

-- =============================================================================
-- TIME CONSTRAINTS
-- =============================================================================

INSERT INTO time_constraints (id, user_id, sleep_start, sleep_end, peak_start, peak_end)
VALUES (
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    '22:30',
    '06:30',
    '09:00',
    '12:00'
) ON CONFLICT (user_id) DO NOTHING;

-- =============================================================================
-- TIME BLOCKS (Work Schedule)
-- =============================================================================

INSERT INTO time_blocks (id, user_id, constraint_id, title, block_type, days, start_time, end_time, is_flexible)
VALUES 
    -- Work hours (Mon-Fri) - dlulu indexing: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri
    (
        'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'Work',
        'work',
        ARRAY[0, 1, 2, 3, 4],
        '09:00',
        '17:00',
        false
    ),
    -- Lunch break (Mon-Fri) - dlulu indexing: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri
    (
        'd1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'Lunch Break',
        'meal',
        ARRAY[0, 1, 2, 3, 4],
        '12:00',
        '13:00',
        true
    ),
    -- Morning commute (Mon-Fri) - dlulu indexing: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri
    (
        'd2eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'Commute',
        'commute',
        ARRAY[0, 1, 2, 3, 4],
        '08:00',
        '09:00',
        false
    )
ON CONFLICT DO NOTHING;

-- =============================================================================
-- SAMPLE GOAL: Learn Python
-- =============================================================================

INSERT INTO goals (
    id, user_id, title, original_input, category, timeline, estimated_weeks,
    strategy_overview, critical_gaps, current_phase_index, overall_progress,
    status, preferred_time, frequency, duration, energy_cost
)
VALUES (
    'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'Learn Python Programming',
    'I want to learn Python for data analysis and automation',
    'learning',
    '12 weeks',
    12,
    'Build a solid Python foundation starting with syntax basics, progressing through data structures and object-oriented programming, then applying skills to real data analysis projects.',
    ARRAY['No prior programming experience', 'Need structured learning path', 'Requires consistent practice time'],
    1,
    25.0,
    'active',
    'morning',
    3,
    60,
    'high'
) ON CONFLICT DO NOTHING;

-- Phases for Python Goal
INSERT INTO phases (id, goal_id, number, title, description, start_week, end_week, focus, status, progress)
VALUES 
    (
        'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        1,
        'Foundation',
        'Learn Python basics including variables, data types, operators, and control flow',
        1, 4,
        ARRAY['Basic Syntax', 'Variables & Types', 'Control Flow', 'Functions'],
        'active',
        50.0
    ),
    (
        'f1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        2,
        'Data Structures & OOP',
        'Master Python data structures and object-oriented programming concepts',
        5, 8,
        ARRAY['Lists & Dictionaries', 'Sets & Tuples', 'Classes', 'Inheritance'],
        'upcoming',
        0.0
    ),
    (
        'f2eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        3,
        'Data Analysis Project',
        'Apply Python skills to a real data analysis project using pandas and matplotlib',
        9, 12,
        ARRAY['Pandas Basics', 'Data Cleaning', 'Visualization', 'Final Project'],
        'upcoming',
        0.0
    )
ON CONFLICT DO NOTHING;

-- Milestones for Phase 1
INSERT INTO milestones (id, phase_id, goal_id, title, description, is_completed, display_order, target_week)
VALUES 
    (
        'g0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'Set up Python development environment',
        'Install Python, VS Code, and configure environment',
        true,
        1,
        1
    ),
    (
        'g1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'Complete basic syntax module',
        'Learn variables, data types, and operators',
        true,
        2,
        2
    ),
    (
        'g2eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'Master control flow statements',
        'if/else, loops, and comprehensions',
        false,
        3,
        3
    ),
    (
        'g3eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'Build first Python project',
        'Create a simple calculator or number guessing game',
        false,
        4,
        4
    )
ON CONFLICT DO NOTHING;

-- Sub-tasks for first milestone
INSERT INTO sub_tasks (id, milestone_id, title, is_completed, display_order)
VALUES 
    (
        'h0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'g0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'Download and install Python 3.12',
        true,
        1
    ),
    (
        'h1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'g0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'Install VS Code with Python extension',
        true,
        2
    ),
    (
        'h2eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'g0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'Configure virtual environment',
        true,
        3
    ),
    (
        'h3eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'g0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'Run first Hello World program',
        true,
        4
    )
ON CONFLICT DO NOTHING;

-- =============================================================================
-- SAMPLE GOAL: Read 24 Books
-- =============================================================================

INSERT INTO goals (
    id, user_id, title, original_input, category, timeline, estimated_weeks,
    strategy_overview, current_phase_index, overall_progress, status,
    preferred_time, frequency, duration, energy_cost
)
VALUES (
    'e1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'Read 24 Books This Year',
    'I want to read 2 books per month to expand my knowledge',
    'personal',
    '52 weeks',
    52,
    'Build a consistent reading habit by scheduling daily reading sessions and tracking progress. Mix fiction and non-fiction for balanced learning.',
    1,
    10.0,
    'active',
    'evening',
    7,
    30,
    'low'
) ON CONFLICT DO NOTHING;

-- Phases for Reading Goal
INSERT INTO phases (id, goal_id, number, title, description, start_week, end_week, focus, status, progress)
VALUES 
    (
        'f3eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'e1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        1,
        'Build Reading Habit',
        'Establish daily reading routine with easier books',
        1, 13,
        ARRAY['Daily Reading', 'Book Selection', 'Note Taking'],
        'active',
        40.0
    ),
    (
        'f4eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'e1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        2,
        'Accelerate & Challenge',
        'Increase reading speed and tackle more challenging material',
        14, 39,
        ARRAY['Speed Reading', 'Non-Fiction Focus', 'Book Reviews'],
        'upcoming',
        0.0
    ),
    (
        'f5eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'e1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        3,
        'Mastery & Reflection',
        'Complete remaining books and reflect on learnings',
        40, 52,
        ARRAY['Complete Goal', 'Annual Review', 'Share Learnings'],
        'upcoming',
        0.0
    )
ON CONFLICT DO NOTHING;

-- =============================================================================
-- SAMPLE SPRINT (Current Week)
-- =============================================================================

INSERT INTO sprints (id, user_id, week_start, week_end, total_tasks, completed_tasks, progress, status)
VALUES (
    'i0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::INTEGER,
    CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::INTEGER + 6,
    5,
    2,
    40.0,
    'active'
) ON CONFLICT DO NOTHING;

-- Sprint Tasks
INSERT INTO sprint_tasks (
    id, sprint_id, title, description, goal_id, goal_title,
    scheduled_date, scheduled_time, duration, priority, energy_cost, status
)
VALUES 
    (
        'j0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'i0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'Python: Control Flow Practice',
        'Complete exercises on if/else statements and loops',
        'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'Learn Python Programming',
        CURRENT_DATE,
        '07:00',
        60,
        'high',
        'high',
        'todo'
    ),
    (
        'j1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'i0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'Read: Atomic Habits (30 pages)',
        'Continue reading Atomic Habits',
        'e1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'Read 24 Books This Year',
        CURRENT_DATE,
        '21:00',
        30,
        'medium',
        'low',
        'completed'
    ),
    (
        'j2eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'i0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'Python: Functions Chapter',
        'Learn about function definitions and scope',
        'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'Learn Python Programming',
        CURRENT_DATE + 1,
        '07:00',
        60,
        'high',
        'high',
        'todo'
    )
ON CONFLICT DO NOTHING;

-- =============================================================================
-- SAMPLE CALENDAR EVENTS
-- =============================================================================

INSERT INTO calendar_events (
    id, user_id, summary, description, start_datetime, end_datetime, timezone,
    source, sync_status, goal_id, phase_id, event_type, energy_cost, status
)
VALUES 
    (
        'k0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'Python: Control Flow Practice',
        'Phase 1 - Foundation: Complete exercises on if/else statements and loops',
        CURRENT_DATE + TIME '07:00',
        CURRENT_DATE + TIME '08:00',
        'America/Los_Angeles',
        'ambitionos',
        'local_only',
        'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'goal_session',
        'high',
        'scheduled'
    ),
    (
        'k1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'Evening Reading Session',
        'Read Atomic Habits - targeting 30 pages',
        CURRENT_DATE + TIME '21:00',
        CURRENT_DATE + TIME '21:30',
        'America/Los_Angeles',
        'ambitionos',
        'local_only',
        'e1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'f3eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'goal_session',
        'low',
        'scheduled'
    )
ON CONFLICT DO NOTHING;

-- =============================================================================
-- HISTORY ENTRIES
-- =============================================================================

INSERT INTO history_entries (id, goal_id, user_id, event_type, details)
VALUES 
    (
        'l0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'goal_created',
        '{"source": "onboarding", "initial_timeline": "12 weeks"}'::JSONB
    ),
    (
        'l1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'milestone_completed',
        '{"milestone": "Set up Python development environment", "week": 1}'::JSONB
    ),
    (
        'l2eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'e1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'goal_created',
        '{"source": "onboarding", "initial_timeline": "52 weeks"}'::JSONB
    )
ON CONFLICT DO NOTHING;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
    user_count INTEGER;
    goal_count INTEGER;
    phase_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO user_count FROM users;
    SELECT COUNT(*) INTO goal_count FROM goals;
    SELECT COUNT(*) INTO phase_count FROM phases;
    
    RAISE NOTICE 'Seed data inserted:';
    RAISE NOTICE '  Users: %', user_count;
    RAISE NOTICE '  Goals: %', goal_count;
    RAISE NOTICE '  Phases: %', phase_count;
END;
$$;

SELECT 'Seed data successfully inserted!' AS status;


