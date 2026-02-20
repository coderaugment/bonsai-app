#!/usr/bin/env bash
set -e

# ════════════════════════════════════════════════════════════════════════
# BONSAI HARD RESET — Nuclear Option
# ════════════════════════════════════════════════════════════════════════
#
# This script performs a complete system reset:
# - Drops and recreates the database
# - Remigrates schema
# - Seeds with sample data
# - Deletes ALL projects in /Users/michaeloneal/development/bonsai/projects
#
# ⚠️  WARNING: THIS IS DESTRUCTIVE AND CANNOT BE UNDONE
#
# Usage:
#   ./scripts/hard-reset.sh              # Reset dev database (DEFAULT)
#   BONSAI_ENV=prod ./scripts/hard-reset.sh  # Reset prod database (dangerous!)
#
# Note: Defaults to DEVELOPMENT environment for safety
#

# ── Configuration ────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEBAPP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECTS_DIR="/Users/michaeloneal/development/bonsai/projects"
ENV="${BONSAI_ENV:-dev}"

if [ "$ENV" = "dev" ]; then
  DB_FILE="$WEBAPP_DIR/bonsai-dev.db"
  ENV_LABEL="DEVELOPMENT"
  COLOR="\033[1;33m"  # Yellow
else
  DB_FILE="$WEBAPP_DIR/bonsai.db"
  ENV_LABEL="PRODUCTION"
  COLOR="\033[1;31m"  # Red
fi

RESET="\033[0m"
BOLD="\033[1m"

# ── Safety Confirmation ──────────────────────────────────────────────────
echo
echo -e "${COLOR}╔════════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${COLOR}║                                                                ║${RESET}"
echo -e "${COLOR}║              ⚠️  BONSAI HARD RESET WARNING ⚠️                   ║${RESET}"
echo -e "${COLOR}║                                                                ║${RESET}"
echo -e "${COLOR}╚════════════════════════════════════════════════════════════════╝${RESET}"
echo
echo -e "${BOLD}Environment:${RESET} ${COLOR}${ENV_LABEL}${RESET}"
echo
echo "This will permanently delete:"
echo -e "  ${COLOR}✗${RESET} Database: ${DB_FILE}"
echo -e "  ${COLOR}✗${RESET} All projects in: ${PROJECTS_DIR}"
echo -e "  ${COLOR}✗${RESET} All worktrees, git history, uncommitted work"
echo
echo "Then recreate:"
echo -e "  ${COLOR}✓${RESET} Fresh database with schema"
echo -e "  ${COLOR}✓${RESET} Sample seed data"
echo

if [ "$ENV" = "prod" ]; then
  echo -e "${COLOR}${BOLD}YOU ARE ABOUT TO RESET THE PRODUCTION DATABASE!${RESET}"
  echo
  read -p "Type 'RESET PRODUCTION' to confirm: " confirm
  if [ "$confirm" != "RESET PRODUCTION" ]; then
    echo "Aborted."
    exit 1
  fi
else
  read -p "Type 'yes' to confirm: " confirm
  if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 1
  fi
fi

echo
echo "Starting hard reset in 3 seconds... (Ctrl+C to abort)"
sleep 1
echo "2..."
sleep 1
echo "1..."
sleep 1
echo

# ── Step 1: Delete Projects Directory ────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 1/4: Deleting projects directory..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -d "$PROJECTS_DIR" ]; then
  echo "Removing: $PROJECTS_DIR"
  rm -rf "$PROJECTS_DIR"
  echo "✓ Projects directory deleted"
else
  echo "✓ Projects directory doesn't exist (skipped)"
fi

# Recreate empty projects directory
mkdir -p "$PROJECTS_DIR"
echo "✓ Created empty projects directory"
echo

# ── Step 2: Delete Database ──────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 2/4: Deleting database..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f "$DB_FILE" ]; then
  echo "Removing: $DB_FILE"
  rm -f "$DB_FILE"
  rm -f "${DB_FILE}-shm"
  rm -f "${DB_FILE}-wal"
  echo "✓ Database deleted"
else
  echo "✓ Database doesn't exist (skipped)"
fi
echo

# ── Step 3: Recreate & Migrate Database ──────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 3/4: Creating fresh database..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$WEBAPP_DIR"

# Push schema to create fresh DB
echo "Running: npm run db:push"
if [ "$ENV" = "dev" ]; then
  BONSAI_ENV=dev npm run db:push
else
  npm run db:push
fi
echo "✓ Database schema applied"
echo

# ── Step 4: Seed Database ────────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 4/4: Seeding database..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Running: npm run db:seed"
if [ "$ENV" = "dev" ]; then
  BONSAI_ENV=dev npm run db:seed
else
  npm run db:seed
fi
echo "✓ Database seeded with sample data"
echo

# ── Complete ─────────────────────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BOLD}✓ Hard reset complete!${RESET}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "System state:"
echo "  • Database: $DB_FILE (fresh)"
echo "  • Projects directory: $PROJECTS_DIR (empty)"
echo "  • Environment: $ENV_LABEL"
echo
echo "You can now:"
echo "  1. Start the dev server: npm run dev"
echo "  2. Create new projects via the UI"
echo "  3. Import existing projects"
echo
