import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

const port = Number(process.env.PORT || 3000);
const databasePath = process.env.DATABASE_PATH || path.join(rootDir, ".data", "prompt-frame.sqlite");

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS gallery_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_number INTEGER NOT NULL,
    username TEXT NOT NULL,
    post_url TEXT NOT NULL,
    image_url TEXT NOT NULL,
    thumb_url TEXT NOT NULL,
    title TEXT NOT NULL,
    info TEXT NOT NULL,
    prompt TEXT NOT NULL,
    image_index INTEGER NOT NULL,
    original_tags TEXT NOT NULL DEFAULT '[]',
    user_tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(image_url, post_number, image_index)
  );
`);

const selectItems = db.prepare(`
  SELECT post_number, username, post_url, image_url, thumb_url, title, info, prompt, image_index, original_tags, user_tags
  FROM gallery_items
  ORDER BY post_number DESC, image_index ASC, id DESC
`);

const insertItem = db.prepare(`
  INSERT OR IGNORE INTO gallery_items (
    post_number, username, post_url, image_url, thumb_url, title, info, prompt, image_index, original_tags, user_tags
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const selectTagsForItem = db.prepare(`
  SELECT original_tags, user_tags
  FROM gallery_items
  WHERE image_url = ? AND post_number = ? AND image_index = ?
`);

const updateTagsForItem = db.prepare(`
  UPDATE gallery_items
  SET original_tags = ?, user_tags = ?, updated_at = CURRENT_TIMESTAMP
  WHERE image_url = ? AND post_number = ? AND image_index = ?
`);

function safeJsonArray(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeTagList(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((tag) => String(tag || "").trim()).filter(Boolean))).slice(0, 24);
}

function normalizeImportedItems(value) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "object" && value
      ? Array.isArray(value.items)
        ? value.items
        : Array.isArray(value.data)
          ? value.data
          : []
      : [];

  const items = [];
  let invalid = 0;

  for (const entry of source) {
    if (!entry || typeof entry !== "object") {
      invalid += 1;
      continue;
    }

    const postNumber = Number(entry.post_number);
    const imageIndex = Number(entry.image_index || 1);
    const imageUrl = String(entry.image_url || "").trim();
    const username = String(entry.username || "").trim();

    if (!Number.isFinite(postNumber) || !imageUrl || !username) {
      invalid += 1;
      continue;
    }

    items.push({
      post_number: postNumber,
      username,
      post_url: String(entry.post_url || ""),
      image_url: imageUrl,
      thumb_url: String(entry.thumb_url || imageUrl),
      title: String(entry.title || `第${postNumber}层-图${Number.isFinite(imageIndex) ? imageIndex : 1}`),
      info: String(entry.info || ""),
      prompt: String(entry.prompt || "未提供"),
      image_index: Number.isFinite(imageIndex) ? imageIndex : 1,
      original_tags: normalizeTagList(entry.original_tags),
      user_tags: normalizeTagList(entry.user_tags),
    });
  }

  return { items, invalid };
}

function rowToItem(row) {
  return {
    post_number: row.post_number,
    username: row.username,
    post_url: row.post_url,
    image_url: row.image_url,
    thumb_url: row.thumb_url,
    title: row.title,
    info: row.info,
    prompt: row.prompt,
    image_index: row.image_index,
    original_tags: safeJsonArray(row.original_tags),
    user_tags: safeJsonArray(row.user_tags),
  };
}

function mergeTagsForDuplicate(item) {
  if (!item.original_tags.length && !item.user_tags.length) return;

  const existing = selectTagsForItem.get(item.image_url, item.post_number, item.image_index);
  if (!existing) return;

  const originalTags = Array.from(new Set([...safeJsonArray(existing.original_tags), ...item.original_tags])).slice(0, 24);
  const userTags = Array.from(new Set([...safeJsonArray(existing.user_tags), ...item.user_tags])).slice(0, 24);

  updateTagsForItem.run(
    JSON.stringify(originalTags),
    JSON.stringify(userTags),
    item.image_url,
    item.post_number,
    item.image_index,
  );
}

const app = express();

app.use(express.json({ limit: "50mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/items", (_req, res) => {
  const items = selectItems.all().map(rowToItem);
  res.json({ items });
});

app.post("/api/import", (req, res) => {
  const result = normalizeImportedItems(req.body);

  let added = 0;
  let duplicated = 0;

  try {
    db.exec("BEGIN");
    for (const item of result.items) {
      try {
        const insertResult = insertItem.run(
          item.post_number,
          item.username,
          item.post_url,
          item.image_url,
          item.thumb_url,
          item.title,
          item.info,
          item.prompt,
          item.image_index,
          JSON.stringify(item.original_tags),
          JSON.stringify(item.user_tags),
        );

        if (insertResult.changes) {
          added += 1;
        } else {
          duplicated += 1;
          mergeTagsForDuplicate(item);
        }
      } catch {
        result.invalid += 1;
      }
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  res.json({
    added,
    duplicated,
    invalid: result.invalid,
    total: selectItems.all().length,
  });
});

app.use("/assets", express.static(path.join(distDir, "assets"), { immutable: true, maxAge: "1y" }));
app.use(express.static(distDir));

app.get(/.*/, (req, res) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: "API route not found" });
    return;
  }

  const indexPath = path.join(distDir, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
    return;
  }

  res.status(404).send("Build output not found. Run npm run build first.");
});

app.use((err, _req, res, _next) => {
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }

  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(port, () => {
  console.log(`PromptFrame server listening on http://0.0.0.0:${port}`);
  console.log(`SQLite database: ${databasePath}`);
});
