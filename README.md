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

## Data

Gallery items are loaded from `public/data/gallery.json`.

Imported JSON is appended in the current browser session and does not modify the local data file.

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
