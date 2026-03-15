# Remember

Remember is a macOS-first cross-platform desktop app built with Electron + React + TypeScript for local file ingestion, AI-powered tagging, and semantic search.

## Features

- Drag-and-drop and native file picker ingestion (`Cmd/Ctrl + O`)
- Supported files: PDF, TXT, DOCX, PNG, JPG, JPEG, WEBP
- Local file copy storage under Electron user data directory
- Multi-provider AI analysis pipeline (OpenAI-compatible endpoints + custom base URL)
- Bounded AI processing queue (max concurrency 3)
- SQLite storage for files, analysis results, tags, and settings
- SQLite FTS5 full-text search over filenames, summaries, topics, OCR, entities, and tags
- Library grid/list view with status indicators and per-file retry/manual analyze actions
- File detail modal with preview, summary/tags/entities/sentiment/colors
- Manual tag add/remove and global tag cloud filtering
- Search and filters (file type, dominant color, sentiment, upload date)
- Localhost REST API (`/status`, `/search`, `/tags`, `/ingest`) backed by SQLite + ingestion services
- Multi-folder sync with automatic ingestion of newly added supported files
- Automatic removal of synced files when they are deleted from watched folders
- 6-hour heartbeat summaries (plus change-triggered sync runs) with concise counts + top file/tag items
- Dark/light mode via system preference
- Settings panel for API key, auto-analyze toggle, watch-folder management, and full library reset

## Tech Stack

- Electron + React + Vite
- TypeScript throughout
- SQLite via `better-sqlite3`
- OpenAI-compatible APIs (OpenAI, OpenRouter, Groq, Together, Fireworks, DeepInfra, Ollama, or custom)
- Tailwind CSS
- Zustand for UI state

## Project Structure

```text
src/
  main/        # Electron main process, IPC, services, DB bootstrap
  renderer/    # React app entry
  components/  # Shared UI components
  pages/       # Library/Search/Tags/Settings views
  hooks/       # Data and debounce hooks
  store/       # Zustand UI state
  lib/
    ai/        # AI prompts
    db/        # SQLite schema file
    parsers/   # PDF/TXT/DOCX extractors
    utils/     # Shared helpers
  shared/      # Shared TypeScript types
electron/      # Electron-related config placeholders
```

## Requirements

- Node.js 20+
- npm 10+
- macOS recommended (works cross-platform, but tuned for macOS window chrome)

## Setup

```bash
npm install
npm run dev
```

`npm install` runs a postinstall step to rebuild native modules (notably `better-sqlite3`) for Electron.

## Setting up the OpenClaw Skill

Before setting up the skill, launch Remember at least once and ingest at least one file so the local DB exists at `~/Library/Application Support/Remember/remember.db`.

1. Install OpenClaw globally:

   ```bash
   npm i -g openclaw
   ```

2. Copy this repository's skill into your OpenClaw skills directory:

   ```bash
   cp -r ./openclaw-skill ~/.openclaw/skills/remember
   ```

3. Install the skill dependencies:

   ```bash
   cd ~/.openclaw/skills/remember && npm install
   ```

4. In your OpenClaw agent chat, run:

   ```text
   reload skills
   ```

5. Smoke-test with a finance query, for example:

   ```text
   Search my Remember library for finance documents about quarterly budget or forecast updates.
   ```

The OpenClaw skill reads Remember data directly from SQLite (read-only). Separately, Remember can expose a localhost REST API on `127.0.0.1:47821`; `GET /status` includes the latest heartbeat/sync summary.

### Example OpenClaw conversations

Use prompts like these once the skill is loaded:

- **Finance search (quick test)**
  - **You:** "Search finance files about 2024 planning, budget risk, or forecast variance."
  - **OpenClaw:** "I found matching files and ranked them by relevance. Want me to open the top result and summarize key risks?"

- **Design brief lookup**
  - **You:** "Find the latest design brief for the landing page refresh and brand updates."
  - **OpenClaw:** "I found multiple design brief documents. I can compare their summaries and highlight which one is newest."

- **Blue/teal image search**
  - **You:** "Show image files that are mostly blue or teal."
  - **OpenClaw:** "I filtered image results by dominant color and found blue/teal assets. I can narrow further to screenshots, logos, or moodboards."

- **Top topics/tags snapshot**
  - **You:** "What are the top topics and tags in my library right now?"
  - **OpenClaw:** "Here are the most frequent tags, plus a topic snapshot from recent files. Tell me which tag to drill into next."

## Configure AI provider and API key

1. Start the app.
2. Open **Settings**.
3. Choose an AI provider preset (or `Custom` and enter your own base URL).
4. Set chat and vision model names if needed.
5. Paste your provider API key and click **Save**.

The key is stored locally in Electron user data storage and encrypted when OS secure storage is available.

## Local REST API (localhost only)

When enabled in settings, Remember starts a local REST server on `127.0.0.1:<restApiPort>` (default `47821`).

- `GET /status` - app status, DB file count, REST config, and latest heartbeat metadata (including concise `lastHeartbeatSummary`)
- `GET /search?q=...` - FTS-backed search snapshot (`q` optional; empty query returns recent files)
- `GET /tags` - tag counts
- `POST /ingest` with JSON body `{ "filePath": "/absolute/path/to/file.ext" }`

## Scripts

- `npm run dev` - start renderer + main watcher + Electron
- `npm run typecheck` - run TypeScript checks for renderer and main
- `npm run build` - production build for renderer and Electron main
- `npm run package:mac` - build and package a macOS app via `electron-builder`

## SQLite Schema

Primary schema file:

- `src/lib/db/schema.sql`

Runtime DB location:

- `<Electron userData>/remember.db` (macOS default: `~/Library/Application Support/Remember/remember.db`)

## Notes

- All file metadata, tags, and analysis are stored locally.
- AI requests go to your configured provider endpoint.
- If analysis fails on a file, the UI shows an error state and allows manual retry.
