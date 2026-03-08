# Slack Capture — Optional Add-on

Add a Slack channel as a capture interface. Type a thought, it gets embedded, classified, and stored automatically.

This is optional — the MCP server already lets any connected AI capture thoughts. Slack adds a quick-capture channel for when you're not in an AI conversation.

## Setup

### 1. Create the Slack App

Click to create with pre-configured permissions:

**[Create Slack App from Manifest](https://api.slack.com/apps?new_app=1&manifest_yaml=display_information%3A%0A%20%20name%3A%20Open%20Brain%0A%20%20description%3A%20Captures%20thoughts%20to%20your%20personal%20knowledge%20base%0A%20%20background_color%3A%20%22%232c2d30%22%0Afeatures%3A%0A%20%20bot_user%3A%0A%20%20%20%20display_name%3A%20Open%20Brain%0A%20%20%20%20always_online%3A%20true%0Aoauth_config%3A%0A%20%20scopes%3A%0A%20%20%20%20bot%3A%0A%20%20%20%20%20%20-%20channels%3Ahistory%0A%20%20%20%20%20%20-%20groups%3Ahistory%0A%20%20%20%20%20%20-%20chat%3Awrite%0Asettings%3A%0A%20%20event_subscriptions%3A%0A%20%20%20%20bot_events%3A%0A%20%20%20%20%20%20-%20message.channels%0A%20%20%20%20%20%20-%20message.groups%0A%20%20org_deploy_enabled%3A%20false%0A%20%20socket_mode_enabled%3A%20false%0A%20%20token_rotation_enabled%3A%20false)**

After creating:
1. **Install to Workspace** → Allow
2. Copy the **Bot User OAuth Token** (starts with `xoxb-`)
3. Create a private channel (e.g., `#capture`) and type `/invite @Open Brain`
4. Get the **Channel ID**: right-click channel → View channel details → scroll to bottom

### 2. Deploy the Capture Function

Copy `slack/ingest-thought/` to `supabase/functions/`:

```bash
cp -r slack/ingest-thought supabase/functions/
```

Set the Slack secrets:

```bash
supabase secrets set SLACK_BOT_TOKEN=xoxb-your-token SLACK_CAPTURE_CHANNEL=C0your-channel-id
```

Deploy:

```bash
supabase functions deploy ingest-thought --no-verify-jwt
```

### 3. Connect Slack Events

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → your Open Brain app
2. **Event Subscriptions** → Enable Events
3. Paste your Edge Function URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/ingest-thought`
4. Wait for the green checkmark
5. Add bot events: `message.channels` and `message.groups` (you need both)
6. **Save Changes**

### 4. Test

Type in your capture channel:

> Sarah mentioned she's thinking about leaving her job to start a consulting business

You should see a threaded reply:

```
Captured as person_note — career, consulting
People: Sarah
Action items: Check in with Sarah about consulting plans
```

## Troubleshooting

**"Request URL not verified"** — Re-deploy: `supabase functions deploy ingest-thought --no-verify-jwt`

**Messages not captured** — Verify both `message.channels` AND `message.groups` are in Event Subscriptions. Check the bot is invited to the channel.

**Duplicate entries** — Slack retries after 3s. The function filters retries via `x-slack-retry-num` header, but edge cases can occur.

**No reply in Slack** — Check bot token and `chat:write` scope. If you added the scope after installing, reinstall the app.
