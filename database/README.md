# AmbitionOS Database

PostgreSQL database schema and setup scripts for AmbitionOS.

## Quick Start

### Prerequisites

- PostgreSQL 15+ installed and running
- `psql` command available in PATH

### Setup

```bash
# Run the setup script
./setup.sh

# Or with seed data for testing
./setup.sh --seed

# Reset database (drops and recreates)
./setup.sh --reset
```

### Manual Setup

```bash
# Create database
createdb ambitionos

# Run schema
psql -d ambitionos -f schema.sql

# (Optional) Add seed data
psql -d ambitionos -f seed.sql
```

## Files

| File | Description |
|------|-------------|
| `schema.sql` | Complete database schema with all tables, indexes, and constraints |
| `setup.sh` | Automated setup script for local development |
| `seed.sql` | Sample data for testing and development |
| `migrations/` | Incremental schema changes (for production deployments) |

## Schema Overview

### Core Entities

- **users** - User accounts and authentication
- **user_profiles** - User preferences and settings
- **time_constraints** - Sleep/productivity windows
- **time_blocks** - Recurring blocked time (work, meals, etc.)

### Goal Management

- **goals** - User goals with AI-generated strategy
- **phases** - Goal phases with timeline
- **milestones** - Checkpoints within phases
- **sub_tasks** - Granular tasks within milestones

### Scheduling

- **calendar_events** - Calendar entries (Google Calendar compatible)
- **sprints** - Weekly sprint containers
- **sprint_tasks** - Daily tasks within sprints
- **task_comments** - User comments on tasks
- **task_attachments** - Files attached to tasks

### History & AI

- **history_entries** - Goal activity log
- **roadmaps** - Snapshot of AI-generated roadmaps
- **refinement_history** - AI refinement requests and changes

## Connection

Default connection settings:

```
Host: localhost
Port: 5432
Database: ambitionos
User: postgres
```

Connection string:
```
postgresql://postgres@localhost:5432/ambitionos
```

## Environment Variables

Override defaults with environment variables:

```bash
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_USER=postgres
export POSTGRES_DB=ambitionos
```

## Entity Relationship Diagram

```
users
  ├── user_profiles (1:1)
  ├── time_constraints (1:1)
  │     └── time_blocks (1:N)
  ├── goals (1:N)
  │     ├── phases (1:N)
  │     │     └── milestones (1:N)
  │     │           └── sub_tasks (1:N)
  │     └── history_entries (1:N)
  ├── calendar_events (1:N)
  ├── sprints (1:N)
  │     └── sprint_tasks (1:N)
  │           ├── task_comments (1:N)
  │           └── task_attachments (1:N)
  └── roadmaps (1:N)
        └── refinement_history (1:N)
```

## Migrations

Migrations are tracked in the `schema_migrations` table. Each migration runs only once.

To add a new migration:

1. Create a file in `migrations/` with format: `NNN_description.sql`
2. Write the migration SQL
3. Run `./setup.sh` to apply

Example:
```bash
# Create migration file
echo "ALTER TABLE goals ADD COLUMN priority INTEGER DEFAULT 1;" > migrations/002_add_goal_priority.sql

# Apply migration
./setup.sh
```

## Test Account

When using `--seed`, a demo account is created:

- Email: `demo@ambitionos.com`
- Password: `demo123`

This account comes with:
- 2 sample goals (Learn Python, Read 24 Books)
- Phases and milestones
- Sprint tasks for the current week
- Calendar events


