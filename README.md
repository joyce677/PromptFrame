# PromptFrame

PromptFrame is a Vite, React, and TypeScript app for browsing, searching, collecting, importing, and exporting AI image prompts.

## Features

- Responsive grid and list views
- Keyword search, quick filters, and sorting
- Detail modal with image metadata and prompt copy
- Favorites and recent searches stored locally
- Read-only original tags and editable user tags
- JSON import and export

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
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

## Data

Gallery data is intentionally not committed to this repository.

You can import JSON from the app UI. Imported JSON is appended in the current browser session and does not modify repository files.

For local-only seed data, create `public/data/gallery.json`. The `public/data/` directory is ignored by Git and Docker builds.

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
