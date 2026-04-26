import type { Category, GalleryItem, GalleryStats } from "./types";

export const CATEGORIES: Category[] = ["全部", "海报", "城市", "人物", "插画", "国风"];

const CATEGORY_KEYWORDS: Record<Exclude<Category, "全部">, string[]> = {
  海报: ["海报", "poster", "宣传", "主视觉", "封面", "排版"],
  城市: ["城市", "杭州", "上海", "深圳", "北京", "广州", "重庆", "南京", "city", "urban"],
  人物: ["人物", "人像", "portrait", "少女", "女生", "女性", "idol", "woman", "girl", "男", "女"],
  插画: ["插画", "illustration", "anime", "动漫", "贴纸", "sticker", "卡通", "吉祥物", "chibi"],
  国风: ["国风", "古风", "中国风", "汉服", "水墨", "山水", "东方", "古代", "Chinese"],
};

export function itemKey(item: GalleryItem) {
  return `${item.post_number}-${item.image_index}-${item.image_url}`;
}

export function normalizeText(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((tag) => String(tag || "").trim())
        .filter(Boolean)
        .slice(0, 24),
    ),
  );
}

export function itemSearchText(item: GalleryItem, userTags: string[] = []) {
  return normalizeText(
    [
      item.post_number,
      item.username,
      item.title,
      item.info,
      item.prompt,
      getOriginalTags(item).join(" "),
      userTags.join(" "),
    ].join(" "),
  );
}

export function deriveTags(item: GalleryItem): string[] {
  return getOriginalTags(item);
}

export function getOriginalTags(item: GalleryItem): string[] {
  const importedTags = normalizeTags(item.original_tags);
  if (importedTags.length) return importedTags;

  const source = normalizeText([item.title, item.info, item.prompt, item.username].join(" "));
  const tags = Object.entries(CATEGORY_KEYWORDS)
    .filter(([, keywords]) => keywords.some((keyword) => source.includes(keyword.toLowerCase())))
    .map(([category]) => category);

  if (item.prompt && item.prompt !== "未提供") tags.push("Prompt");
  if (item.image_index > 1) tags.push("组图");

  return Array.from(new Set(tags)).slice(0, 4);
}

export function getAllTags(item: GalleryItem, userTags: string[] = []) {
  return Array.from(new Set([...getOriginalTags(item), ...normalizeTags(userTags)]));
}

export function matchesCategory(item: GalleryItem, category: Category) {
  if (category === "全部") return true;
  return getOriginalTags(item).includes(category);
}

export function getDisplayTitle(item: GalleryItem) {
  const prompt = (item.prompt || "").replace(/\s+/g, " ").trim();
  if (!prompt || prompt === "未提供") return item.title || `第${item.post_number}层作品`;

  const cleaned = prompt
    .replace(/^生成一张/, "")
    .replace(/^请生成/, "")
    .replace(/^Create an? /i, "")
    .replace(/^A /i, "")
    .replace(/^一张/, "")
    .trim();

  return truncateText(cleaned, 18);
}

export function getPromptPreview(item: GalleryItem, maxLength = 76) {
  const prompt = (item.prompt || "未提供").replace(/\s+/g, " ").trim();
  return truncateText(prompt, maxLength);
}

export function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trim()}...`;
}

export function computeStats(items: GalleryItem[]): GalleryStats {
  const posts = new Map<number, number>();
  for (const item of items) posts.set(item.post_number, (posts.get(item.post_number) || 0) + 1);

  return {
    images: items.length,
    posts: posts.size,
    users: new Set(items.map((item) => item.username)).size,
    copyablePrompts: items.filter((item) => item.prompt && item.prompt !== "未提供").length,
    multiImagePosts: Array.from(posts.values()).filter((count) => count > 1).length,
  };
}

export function topTags(items: GalleryItem[], limit = 8) {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const tag of getOriginalTags(item).filter((value) => value !== "Prompt" && value !== "组图")) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}
