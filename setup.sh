#!/usr/bin/env bash
set -euo pipefail

STATE_FILE=".setup-state"

echo "========================================"
echo "  Open Brain — Setup"
echo "========================================"
echo ""

# Check for supabase CLI
if ! command -v supabase &> /dev/null; then
  echo "Error: Supabase CLI not found."
  echo ""
  echo "Install it:"
  echo "  Mac:     brew install supabase/tap/supabase"
  echo "  Windows: scoop bucket add supabase https://github.com/supabase/scoop-bucket.git && scoop install supabase"
  echo "  Other:   npm install -g supabase"
  exit 1
fi

echo "Supabase CLI found: $(supabase --version)"
echo ""

# Check if logged in
echo "Checking Supabase login..."
if ! supabase projects list &> /dev/null; then
  echo "You need to log in to Supabase first."
  supabase login
fi
echo ""

# Load previous state if it exists
PREV_PROJECT_REF=""
PREV_OPENROUTER_KEY=""
PREV_MCP_KEY=""
if [[ -f "$STATE_FILE" ]]; then
  # shellcheck source=/dev/null
  source "$STATE_FILE"
  PREV_PROJECT_REF="${PROJECT_REF:-}"
  PREV_OPENROUTER_KEY="${OPENROUTER_KEY:-}"
  PREV_MCP_KEY="${MCP_KEY:-}"
  echo "Found previous setup. Press Enter to keep existing values."
  echo ""
fi

# Collect credentials (with defaults from previous run)
echo "--- Credentials ---"
echo "You need a Supabase project and an OpenRouter API key."
echo ""

if [[ -n "$PREV_PROJECT_REF" ]]; then
  read -rp "Supabase Project Ref [${PREV_PROJECT_REF}]: " PROJECT_REF
  PROJECT_REF="${PROJECT_REF:-$PREV_PROJECT_REF}"
else
  read -rp "Supabase Project Ref (from dashboard URL): " PROJECT_REF
fi

if [[ -n "$PREV_OPENROUTER_KEY" ]]; then
  MASKED="${PREV_OPENROUTER_KEY:0:8}...${PREV_OPENROUTER_KEY: -4}"
  read -rp "OpenRouter API Key [${MASKED}]: " OPENROUTER_KEY
  OPENROUTER_KEY="${OPENROUTER_KEY:-$PREV_OPENROUTER_KEY}"
else
  read -rp "OpenRouter API Key: " OPENROUTER_KEY
fi

if [[ -n "$PREV_MCP_KEY" ]]; then
  echo ""
  read -rp "Regenerate MCP access key? (y/N): " REGEN
  if [[ "$REGEN" =~ ^[Yy]$ ]]; then
    MCP_KEY=$(openssl rand -hex 32)
    echo "Generated new key: ${MCP_KEY:0:8}..."
  else
    MCP_KEY="$PREV_MCP_KEY"
    echo "Keeping existing key: ${MCP_KEY:0:8}..."
  fi
else
  echo ""
  echo "--- Generating MCP access key ---"
  MCP_KEY=$(openssl rand -hex 32)
  echo "Generated: ${MCP_KEY:0:8}..."
fi
echo ""

# Save state for next run
cat > "$STATE_FILE" <<EOF
PROJECT_REF="$PROJECT_REF"
OPENROUTER_KEY="$OPENROUTER_KEY"
MCP_KEY="$MCP_KEY"
EOF
chmod 600 "$STATE_FILE"

# Link project
echo "--- Linking to Supabase project ---"
supabase link --project-ref "$PROJECT_REF"
echo ""

# Push database migrations
echo "--- Applying database migrations ---"
supabase db push
echo ""

# Set secrets
echo "--- Setting secrets ---"
supabase secrets set \
  OPENROUTER_API_KEY="$OPENROUTER_KEY" \
  MCP_ACCESS_KEY="$MCP_KEY"
echo ""

# Deploy MCP server
echo "--- Deploying MCP Server ---"
supabase functions deploy open-brain-mcp --no-verify-jwt
echo ""

# Optional: Slack capture
echo "--- Slack Capture (Optional) ---"
read -rp "Set up Slack quick-capture channel? (y/N): " SETUP_SLACK
if [[ "$SETUP_SLACK" =~ ^[Yy]$ ]]; then
  read -rp "Slack Bot Token (xoxb-...): " SLACK_BOT_TOKEN
  read -rp "Slack Channel ID (C0...): " SLACK_CAPTURE_CHANNEL

  echo "Copying ingest function..."
  cp -r slack/ingest-thought supabase/functions/

  echo "Setting Slack secrets..."
  supabase secrets set \
    SLACK_BOT_TOKEN="$SLACK_BOT_TOKEN" \
    SLACK_CAPTURE_CHANNEL="$SLACK_CAPTURE_CHANNEL"

  echo "Deploying ingest-thought function..."
  supabase functions deploy ingest-thought --no-verify-jwt

  SLACK_URL="https://${PROJECT_REF}.supabase.co/functions/v1/ingest-thought"
  echo ""
  echo "Slack capture deployed!"
  echo ""
  echo "Final step: go to api.slack.com/apps → your app → Event Subscriptions"
  echo "  Request URL: $SLACK_URL"
  echo "  Bot events: message.channels, message.groups"
  echo ""
fi

# Print summary
MCP_URL="https://${PROJECT_REF}.supabase.co/functions/v1/open-brain-mcp"
MCP_CONN_URL="${MCP_URL}?key=${MCP_KEY}"

echo "========================================"
echo "  Setup Complete!"
echo "========================================"
echo ""
echo "SAVE THESE — you need them to connect your AIs:"
echo ""
echo "MCP Access Key:"
echo "  $MCP_KEY"
echo ""
echo "MCP Server URL:"
echo "  $MCP_URL"
echo ""
echo "MCP Connection URL (for Claude Desktop / ChatGPT):"
echo "  $MCP_CONN_URL"
echo ""
echo "--- Connect Your AIs ---"
echo ""
echo "Claude Desktop:"
echo "  Settings → Connectors → Add custom connector"
echo "  URL: $MCP_CONN_URL"
echo ""
echo "Claude Code:"
echo "  claude mcp add --transport http open-brain $MCP_URL --header \"x-brain-key: $MCP_KEY\""
echo ""
echo "ChatGPT (paid plans):"
echo "  Settings → Apps & Connectors → Developer Mode ON → Create"
echo "  URL: $MCP_CONN_URL"
echo "  Auth: None"
echo ""
echo "Gemini CLI:"
echo "  gemini mcp add -t http open-brain $MCP_URL -H \"x-brain-key: $MCP_KEY\""
echo ""
echo "--- First Thing To Do ---"
echo ""
echo "Migrate your memories! See the skills/ folder for instructions per client."
echo "Then test by asking a DIFFERENT AI about something you just migrated."
echo ""
echo "--- Optional: Add Slack Capture ---"
echo ""
echo "See slack/SETUP.md to add a Slack channel for quick capture."
echo ""
