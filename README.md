# Resident Secretary

A Chrome MV3 browser extension that activates on `Cmd+Shift+Space`, captures voice commands via Vapi, and executes intelligent browser actions using a multi-agent AI pipeline.

## Architecture

```
User Voice → Vapi → Agent A (Voice Concierge) → Coordinator → Agent B (Workspace Executor) → Browser Action
```

## Project Structure

```
orbyai/
├── extension/          # Chrome MV3 Extension
│   ├── manifest.json
│   ├── background.js   # Service worker
│   ├── content_script.js
│   ├── overlay.css
│   └── popup/
├── backend/            # Next.js 14 TypeScript API
│   ├── src/
│   │   ├── app/api/voice/   # Main voice endpoint
│   │   ├── app/api/stream/  # SSE streaming
│   │   ├── lib/             # Agent A, B, Coordinator, Supabase
│   │   └── types/
│   ├── supabase/schema.sql
│   └── .env.example
└── README.md
```

## Quick Start

### Backend
```bash
cd backend
npm install
cp .env.example .env.local
# Fill in your API keys
npm run dev
```

### Chrome Extension
1. Open Chrome → `chrome://extensions`
2. Enable **Developer Mode**
3. Click **Load unpacked** → select `extension/` folder
4. Press `Cmd+Shift+Space` on any page

## Agent Pipeline

| Agent | Model | Role |
|-------|-------|------|
| Agent A | GPT-4o (Deploy AI) | Intent classification, routing |
| Agent B | GPT-4o (Deploy AI) | Action payload generation |

## Action Types
- `fill_field` — Fill form inputs
- `click` — Click elements
- `copy_clipboard` — Copy text
- `inject_overlay` — Inject HTML overlay
- `navigate` — Navigate to URL
- `open_tab` — Open new tab
- `scroll_to` — Scroll to element

## Environment Variables
See `backend/.env.example` for all required variables.

## Mock Mode
Set `USE_MOCKS=true` in `.env.local` to run without API keys.
