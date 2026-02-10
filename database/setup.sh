#!/bin/bash
# =============================================================================
# AmbitionOS Database Setup Script
# =============================================================================
#
# This script sets up the PostgreSQL database for local development.
#
# Prerequisites:
# - PostgreSQL 15+ installed and running
# - psql command available in PATH
#
# Usage:
#   ./setup.sh              # Creates database with default settings
#   ./setup.sh --reset      # Drops and recreates database
#   ./setup.sh --seed       # Creates database with seed data
#
# =============================================================================

set -e

# Configuration (can be overridden with environment variables)
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_NAME="${POSTGRES_DB:-ambitionos}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Functions
print_header() {
    echo -e "\n${BLUE}==============================================================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}==============================================================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

check_postgres() {
    print_header "Checking PostgreSQL Connection"
    
    if ! command -v psql &> /dev/null; then
        print_error "psql command not found. Please install PostgreSQL."
        exit 1
    fi
    
    if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c '\q' 2>/dev/null; then
        print_error "Cannot connect to PostgreSQL at $DB_HOST:$DB_PORT"
        echo ""
        echo "Please ensure:"
        echo "  1. PostgreSQL is installed and running"
        echo "  2. User '$DB_USER' exists and can connect"
        echo ""
        echo "On macOS with Homebrew:"
        echo "  brew install postgresql@15"
        echo "  brew services start postgresql@15"
        echo ""
        echo "On Ubuntu/Debian:"
        echo "  sudo apt install postgresql postgresql-contrib"
        echo "  sudo systemctl start postgresql"
        exit 1
    fi
    
    print_success "PostgreSQL connection successful"
}

create_database() {
    print_header "Creating Database"
    
    # Check if database exists
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
        if [ "$1" == "--reset" ]; then
            print_warning "Database '$DB_NAME' exists. Dropping..."
            psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "DROP DATABASE $DB_NAME;" 2>/dev/null || true
        else
            print_warning "Database '$DB_NAME' already exists. Use --reset to recreate."
            return 0
        fi
    fi
    
    # Create database
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "CREATE DATABASE $DB_NAME;"
    print_success "Database '$DB_NAME' created"
}

run_schema() {
    print_header "Running Schema"
    
    if [ ! -f "$SCRIPT_DIR/schema.sql" ]; then
        print_error "schema.sql not found in $SCRIPT_DIR"
        exit 1
    fi
    
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SCRIPT_DIR/schema.sql"
    print_success "Schema applied successfully"
}

run_migrations() {
    print_header "Running Migrations"
    
    MIGRATIONS_DIR="$SCRIPT_DIR/migrations"
    
    if [ ! -d "$MIGRATIONS_DIR" ]; then
        print_warning "No migrations directory found. Skipping."
        return 0
    fi
    
    # Create migrations tracking table if not exists
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version VARCHAR(255) PRIMARY KEY,
            applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    "
    
    # Run each migration file
    for migration in "$MIGRATIONS_DIR"/*.sql; do
        if [ -f "$migration" ]; then
            VERSION=$(basename "$migration" .sql)
            
            # Check if already applied
            APPLIED=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc \
                "SELECT 1 FROM schema_migrations WHERE version = '$VERSION';")
            
            if [ "$APPLIED" != "1" ]; then
                echo "  Applying: $VERSION"
                psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$migration"
                psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c \
                    "INSERT INTO schema_migrations (version) VALUES ('$VERSION');"
                print_success "Applied: $VERSION"
            else
                echo "  Skipping: $VERSION (already applied)"
            fi
        fi
    done
    
    print_success "Migrations complete"
}

run_seed() {
    print_header "Seeding Database"
    
    SEED_FILE="$SCRIPT_DIR/seed.sql"
    
    if [ ! -f "$SEED_FILE" ]; then
        print_warning "No seed.sql found. Skipping."
        return 0
    fi
    
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SEED_FILE"
    print_success "Seed data inserted"
}

show_summary() {
    print_header "Setup Complete"
    
    echo "Database: $DB_NAME"
    echo "Host: $DB_HOST:$DB_PORT"
    echo "User: $DB_USER"
    echo ""
    echo "Connection string:"
    echo "  postgresql://$DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"
    echo ""
    echo "To connect:"
    echo "  psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"
    echo ""
    
    # Show table counts
    echo "Tables created:"
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name;
    " 2>/dev/null | head -30
}

# Main execution
main() {
    print_header "AmbitionOS Database Setup"
    
    RESET=""
    SEED=""
    
    # Parse arguments
    for arg in "$@"; do
        case $arg in
            --reset)
                RESET="--reset"
                ;;
            --seed)
                SEED="--seed"
                ;;
            --help|-h)
                echo "Usage: ./setup.sh [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --reset    Drop and recreate database"
                echo "  --seed     Insert seed data after setup"
                echo "  --help     Show this help message"
                echo ""
                echo "Environment Variables:"
                echo "  POSTGRES_HOST    Database host (default: localhost)"
                echo "  POSTGRES_PORT    Database port (default: 5432)"
                echo "  POSTGRES_USER    Database user (default: postgres)"
                echo "  POSTGRES_DB      Database name (default: ambitionos)"
                exit 0
                ;;
        esac
    done
    
    check_postgres
    create_database "$RESET"
    run_schema
    run_migrations
    
    if [ -n "$SEED" ]; then
        run_seed
    fi
    
    show_summary
}

main "$@"


