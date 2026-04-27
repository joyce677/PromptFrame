# PromptFrame

PromptFrame is a Vite, React, TypeScript, Node, and SQLite app for browsing, searching, collecting, importing, and exporting AI image prompts.

## Features

- Responsive grid and list views
- Keyword search, quick filters, and sorting
- Detail modal with image metadata and prompt copy
- Favorites and recent searches stored locally
- Read-only original tags and editable user tags
- Shared JSON import and export
- Server-side SQLite persistence

## Development

```bash
npm install
npm run dev
```

The development command starts both the Node API server and Vite. The Vite dev server proxies `/api/*` to the Node server.

## Build

```bash
npm run build
npm run start
```

## Docker Deployment

Build and run the app on a new server with Docker Compose:

```bash
docker compose up -d --build
```

Open:

```text
http://server-ip:8080
```

Use a different host port if needed:

```bash
PROMPT_FRAME_PORT=3000 docker compose up -d --build
```

Stop the service:

```bash
docker compose down
```

Imported gallery data is stored in the `prompt-frame-data` Docker volume and survives container rebuilds and restarts.

## Data

Gallery data is intentionally not committed to this repository.

You can import JSON from the app UI. Imported JSON is written to the server-side SQLite database and becomes visible to all users.

By default the SQLite file is created at `.data/prompt-frame.sqlite` in local development and `/data/prompt-frame.sqlite` in Docker. Override it with `DATABASE_PATH`.

Supported fields:

- `post_number`
- `username`
- `post_url`
- `image_url`
- `thumb_url`
- `title`
- `info`
- `prompt`
- `image_index`
- `original_tags`
- `user_tags`
