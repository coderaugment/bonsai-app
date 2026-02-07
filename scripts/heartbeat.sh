#!/bin/bash
# heartbeat.sh - Periodic dispatch runner for Bonsai agent system
#
# Invoked by cron/launchd every 5 minutes to dispatch agents for
# research, planning, and implementation phases of ticket lifecycle.
#
# Usage:
#   ./heartbeat.sh          # Production mode (bonsai.db)
#   ./heartbeat.sh dev      # Development mode (bonsai-dev.db)

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEBAPP_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$HOME/.bonsai/logs"
LOG_FILE="$LOG_DIR/heartbeat.log"
LOCK_FILE="$HOME/.bonsai/heartbeat.lock"

# Environment (dev or prod)
BONSAI_ENV="${1:-prod}"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Lock file check (prevent concurrent runs)
if [ -f "$LOCK_FILE" ]; then
    PID=$(cat "$LOCK_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo "$(date -Iseconds) Heartbeat already running (PID $PID)" >> "$LOG_FILE"
        exit 0
    fi
    # Stale lock file - remove it
    rm -f "$LOCK_FILE"
fi

# Create lock file
echo $$ > "$LOCK_FILE"
trap "rm -f '$LOCK_FILE'" EXIT

# Log rotation (keep last 7 days)
find "$LOG_DIR" -name "heartbeat-*.log" -mtime +7 -delete 2>/dev/null || true

# Source env file for API keys (GEMINI_API_KEY, etc.)
ENV_FILE="$WEBAPP_DIR/.env.development"
if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
fi

# Run dispatch
echo "$(date -Iseconds) === Heartbeat starting (env=$BONSAI_ENV) ===" >> "$LOG_FILE"
cd "$WEBAPP_DIR"
BONSAI_ENV="$BONSAI_ENV" npx tsx scripts/heartbeat-dispatch.ts >> "$LOG_FILE" 2>&1
EXIT_CODE=$?
echo "$(date -Iseconds) === Heartbeat completed (exit=$EXIT_CODE) ===" >> "$LOG_FILE"

exit $EXIT_CODE
