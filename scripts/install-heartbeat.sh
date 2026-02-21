#!/bin/bash
# install-heartbeat.sh - Interactive installer for Bonsai heartbeat
#
# Detects OS (macOS vs Linux), prompts for configuration, and installs
# the heartbeat dispatcher via launchd (macOS) or cron (Linux).
#
# Usage: ./install-heartbeat.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEBAPP_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$WEBAPP_DIR")"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║           Bonsai Heartbeat Installer                           ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo

# ── Detect OS ───────────────────────────────────────────────────────
if [[ "$OSTYPE" == "darwin"* ]]; then
    PLATFORM="macos"
    echo "✓ Detected: macOS (will use launchd)"
elif [[ "$OSTYPE" == "linux"* ]]; then
    PLATFORM="linux"
    echo "✓ Detected: Linux (will use cron)"
else
    echo "✗ Unsupported platform: $OSTYPE"
    echo "  Only macOS and Linux are supported."
    exit 1
fi
echo

# ── Prompt for environment ──────────────────────────────────────────
echo "Choose environment:"
echo "  dev  - Uses bonsai-dev.db (development)"
echo "  prod - Uses bonsai.db (production)"
echo
read -p "Environment (dev/prod) [dev]: " ENV
ENV="${ENV:-dev}"

if [[ "$ENV" != "dev" && "$ENV" != "prod" ]]; then
    echo "✗ Invalid environment: $ENV (must be 'dev' or 'prod')"
    exit 1
fi
echo "✓ Environment: $ENV"
echo

# ── Validate prerequisites ──────────────────────────────────────────
echo "Validating prerequisites..."

# Check for Claude CLI
CLAUDE_CLI="$HOME/.local/bin/claude"
if [[ ! -f "$CLAUDE_CLI" ]]; then
    echo "✗ Claude CLI not found at $CLAUDE_CLI"
    echo "  Install from: https://claude.ai/code"
    exit 1
fi
echo "✓ Claude CLI found: $CLAUDE_CLI"

# Check for database file
if [[ "$ENV" == "dev" ]]; then
    DB_FILE="$WEBAPP_DIR/bonsai-dev.db"
else
    DB_FILE="$WEBAPP_DIR/bonsai.db"
fi

if [[ ! -f "$DB_FILE" ]]; then
    echo "✗ Database not found: $DB_FILE"
    echo "  Run: cd webapp && npm run db:reset"
    exit 1
fi
echo "✓ Database found: $DB_FILE"

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "✗ Node.js not found in PATH"
    echo "  Install from: https://nodejs.org/"
    exit 1
fi
echo "✓ Node.js found: $(node --version)"

# Check for npx
if ! command -v npx &> /dev/null; then
    echo "✗ npx not found in PATH"
    echo "  Install Node.js which includes npx"
    exit 1
fi
echo "✓ npx found"

echo

# ── Create required directories ─────────────────────────────────────
echo "Creating directories..."
mkdir -p "$PROJECT_ROOT/.bonsai-data/logs"
mkdir -p "$PROJECT_ROOT/.bonsai-data/sessions"
echo "✓ Created: .bonsai-data/logs"
echo "✓ Created: .bonsai-data/sessions"
echo "  (Note: All data stored in project root, not home directory)"
echo

# ── Make heartbeat.sh executable ────────────────────────────────────
chmod +x "$SCRIPT_DIR/heartbeat.sh"
echo "✓ Made heartbeat.sh executable"
echo

# ── Install based on platform ───────────────────────────────────────
if [[ "$PLATFORM" == "macos" ]]; then
    echo "Installing via launchd..."
    echo

    PLIST_SRC="$SCRIPT_DIR/com.bonsai.heartbeat.plist"
    PLIST_DST="$HOME/Library/LaunchAgents/com.bonsai.heartbeat.plist"

    # Copy plist and replace placeholders
    sed "s|{USER}|$USER|g; s|{WEBAPP_PATH}|$WEBAPP_DIR|g" "$PLIST_SRC" > "$PLIST_DST.tmp"

    # Update environment in plist
    sed "s|<string>dev</string>|<string>$ENV</string>|" "$PLIST_DST.tmp" > "$PLIST_DST"
    rm "$PLIST_DST.tmp"

    echo "✓ Installed plist: $PLIST_DST"

    # Unload if already loaded (ignore errors)
    launchctl unload "$PLIST_DST" 2>/dev/null || true

    # Load the service
    launchctl load "$PLIST_DST"
    echo "✓ Loaded service: com.bonsai.heartbeat"
    echo

    # Verify it's loaded
    if launchctl list | grep -q "com.bonsai.heartbeat"; then
        echo "✓ Service is running"
        echo
        echo "Commands:"
        echo "  Status:  launchctl list | grep bonsai"
        echo "  Logs:    tail -f $PROJECT_ROOT/.bonsai-data/logs/heartbeat.log"
        echo "  Stop:    launchctl unload $PLIST_DST"
        echo "  Restart: launchctl unload $PLIST_DST && launchctl load $PLIST_DST"
    else
        echo "✗ Service failed to load (check logs)"
        exit 1
    fi
fi

if [[ "$PLATFORM" == "linux" ]]; then
    echo "Installing via cron..."
    echo

    CRON_ENTRY="*/5 * * * * $SCRIPT_DIR/heartbeat.sh $ENV"

    echo "Add this line to your crontab:"
    echo
    echo "  $CRON_ENTRY"
    echo
    echo "To install, run:"
    echo "  crontab -e"
    echo
    echo "Then paste the line above and save."
    echo

    read -p "Would you like to add it automatically? (y/N): " AUTO_INSTALL
    if [[ "$AUTO_INSTALL" =~ ^[Yy]$ ]]; then
        # Add to crontab if not already present
        (crontab -l 2>/dev/null || true; echo "$CRON_ENTRY") | sort -u | crontab -
        echo "✓ Added to crontab"
        echo
        echo "Commands:"
        echo "  View:    crontab -l"
        echo "  Edit:    crontab -e"
        echo "  Logs:    tail -f $PROJECT_ROOT/.bonsai-data/logs/heartbeat.log"
        echo "  Remove:  crontab -e (delete the line)"
    else
        echo "Skipped automatic installation."
        echo "Add the crontab entry manually when ready."
    fi
fi

echo
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    Installation Complete!                      ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo
echo "The heartbeat will run every 5 minutes and dispatch agents for:"
echo "  • Research (backlog tickets without research docs)"
echo "  • Planning (tickets with research, no plan)"
echo "  • Implementation (in_progress tickets with approved plans)"
echo
echo "Monitor logs:"
echo "  tail -f $PROJECT_ROOT/.bonsai-data/logs/heartbeat.log"
echo
echo "Test manually:"
echo "  cd $WEBAPP_DIR"
echo "  ./scripts/heartbeat.sh $ENV"
echo
echo "For more information, see:"
echo "  $SCRIPT_DIR/README.md"
echo
