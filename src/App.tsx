import {
  AlertCircle,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Box,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  Filter,
  Flag,
  Grid3X3,
  Image as ImageIcon,
  Layers,
  Link2,
  List,
  Loader2,
  Maximize2,
  Moon,
  Palette,
  Save,
  Search,
  Sparkles,
  Star,
  SunMedium,
  Tag,
  TrendingUp,
  Upload,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Category, GalleryItem, GalleryStats, SortMode, ThemeMode, ViewMode } from "./types";
import {
  CATEGORIES,
  computeStats,
  getAllTags,
  getDisplayTitle,
  getOriginalTags,
  getPromptPreview,
  itemKey,
  itemSearchText,
  matchesCategory,
  topTags,
} from "./utils";

const API_ITEMS_URL = `${import.meta.env.BASE_URL}api/items`;
const API_IMPORT_URL = `${import.meta.env.BASE_URL}api/import`;
const FAVORITES_KEY = "linux-do-gallery:favorites";
const RECENT_SEARCHES_KEY = "linux-do-gallery:recent-searches";
const THEME_KEY = "linux-do-gallery:theme";
const USER_TAGS_KEY = "linux-do-gallery:user-tags";

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function useStoredState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => readStored(key, fallback));

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // localStorage can fail in private mode; the app should keep working.
    }
  }, [key, value]);

  return [value, setValue] as const;
}

function normalizeTagList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((tag) => String(tag || "").trim()).filter(Boolean))).slice(0, 24);
}

function normalizeImportedItems(value: unknown): { items: GalleryItem[]; invalid: number } {
  const source = Array.isArray(value)
    ? value
    : typeof value === "object" && value
      ? Array.isArray((value as { items?: unknown }).items)
        ? (value as { items: unknown[] }).items
        : Array.isArray((value as { data?: unknown }).data)
          ? (value as { data: unknown[] }).data
          : []
      : [];

  const items: GalleryItem[] = [];
  let invalid = 0;

  for (const entry of source) {
    if (!entry || typeof entry !== "object") {
      invalid += 1;
      continue;
    }

    const record = entry as Partial<GalleryItem>;
    const postNumber = Number(record.post_number);
    const imageIndex = Number(record.image_index || 1);
    const imageUrl = String(record.image_url || "").trim();
    const username = String(record.username || "").trim();

    if (!Number.isFinite(postNumber) || !imageUrl || !username) {
      invalid += 1;
      continue;
    }

    items.push({
      post_number: postNumber,
      username,
      post_url: String(record.post_url || ""),
      image_url: imageUrl,
      thumb_url: String(record.thumb_url || imageUrl),
      title: String(record.title || `第${postNumber}层-图${imageIndex}`),
      info: String(record.info || ""),
      prompt: String(record.prompt || "未提供"),
      image_index: Number.isFinite(imageIndex) ? imageIndex : 1,
      original_tags: normalizeTagList(record.original_tags),
      user_tags: normalizeTagList(record.user_tags),
    });
  }

  return { items, invalid };
}

async function requestGalleryItems() {
  const response = await fetch(API_ITEMS_URL);
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return [];

  const payload = (await response.json()) as unknown;
  return normalizeImportedItems(payload).items;
}

export default function App() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [category, setCategory] = useState<Category>("全部");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [activeItem, setActiveItem] = useState<GalleryItem | null>(null);
  const [toast, setToast] = useState("");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useStoredState<string[]>(FAVORITES_KEY, []);
  const [recentSearches, setRecentSearches] = useStoredState<string[]>(RECENT_SEARCHES_KEY, []);
  const [theme, setTheme] = useStoredState<ThemeMode>(THEME_KEY, "light");
  const [userTagsByItem, setUserTagsByItem] = useStoredState<Record<string, string[]>>(USER_TAGS_KEY, {});
  const [headerHidden, setHeaderHidden] = useState(false);
  const [compactSearchVisible, setCompactSearchVisible] = useState(false);
  const [headerSearchOpen, setHeaderSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchPanelRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const lastScrollYRef = useRef(0);
  const favoriteEntryScrollYRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function loadGallery() {
      try {
        setLoading(true);
        setError("");
        const data = await requestGalleryItems();
        if (!cancelled) setItems(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "数据加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadGallery();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY;
      const delta = y - lastScrollYRef.current;
      const searchBottom = searchPanelRef.current?.getBoundingClientRect().bottom ?? 9999;

      setCompactSearchVisible(searchBottom < 88);

      if (activeItem || headerSearchOpen) {
        setHeaderHidden(false);
      } else if (y > 120 && delta > 8) {
        setHeaderHidden(true);
      } else if (delta < -8 || y <= 24) {
        setHeaderHidden(false);
      }

      lastScrollYRef.current = y;
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [activeItem, headerSearchOpen]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    document.body.style.overflow = activeItem ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [activeItem]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 1800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const stats = useMemo(() => computeStats(items), [items]);
  const popularTags = useMemo(() => topTags(items), [items]);
  const favoriteItems = useMemo(() => {
    const favoriteSet = new Set(favorites);
    return items.filter((item) => favoriteSet.has(itemKey(item)));
  }, [favorites, items]);
  const activeFavorite = activeItem ? favorites.includes(itemKey(activeItem)) : false;

  const filteredItems = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const favoriteSet = new Set(favorites);
    const filtered = items.filter((item) => {
      const favoriteMatched = !showFavoritesOnly || favoriteSet.has(itemKey(item));
      const categoryMatched = matchesCategory(item, category);
      const queryMatched =
        !query || itemSearchText(item, userTagsByItem[itemKey(item)] || item.user_tags || []).includes(query);
      return favoriteMatched && categoryMatched && queryMatched;
    });

    return filtered.sort((a, b) => {
      const postDelta = sortMode === "newest" ? b.post_number - a.post_number : a.post_number - b.post_number;
      return postDelta || a.image_index - b.image_index;
    });
  }, [category, favorites, items, searchTerm, showFavoritesOnly, sortMode, userTagsByItem]);

  function saveCurrentSearch() {
    const query = searchTerm.trim();
    if (!query) {
      setToast("请输入搜索关键词");
      return;
    }

    setRecentSearches((current) => [query, ...current.filter((item) => item !== query)].slice(0, 6));
    setToast("已保存当前搜索");
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") saveCurrentSearch();
  }

  function commitHeaderSearch() {
    const query = searchTerm.trim();
    if (query) setRecentSearches((current) => [query, ...current.filter((item) => item !== query)].slice(0, 6));
    setHeaderSearchOpen(false);
  }

  function toggleFavorite(item: GalleryItem) {
    const key = itemKey(item);
    setFavorites((current) =>
      current.includes(key) ? current.filter((favorite) => favorite !== key) : [key, ...current],
    );
  }

  async function copyPrompt(item: GalleryItem) {
    const text = item.prompt || "未提供";
    try {
      await navigator.clipboard.writeText(text);
      setToast("提示词已复制");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();

      try {
        document.execCommand("copy");
        setToast("提示词已复制");
      } catch {
        setToast("复制失败，请手动复制");
      } finally {
        document.body.removeChild(textarea);
      }
    }
  }

  function exportCurrentResults() {
    const exportItems = filteredItems.map((item) => ({
      ...item,
      original_tags: getOriginalTags(item),
      user_tags: userTagsByItem[itemKey(item)] || item.user_tags || [],
    }));
    const blob = new Blob([JSON.stringify(exportItems, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `prompt-gallery-${category}-${filteredItems.length}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setToast("已导出当前结果");
  }

  async function importGalleryFile(file: File | null) {
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const response = await fetch(API_IMPORT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });

      const contentType = response.headers.get("content-type") || "";
      const payload = contentType.includes("application/json") ? ((await response.json()) as unknown) : null;

      if (!response.ok) {
        const message =
          payload && typeof payload === "object" && "error" in payload ? String(payload.error) : `HTTP ${response.status}`;
        throw new Error(message);
      }

      const importResult = payload as Partial<{ added: number; duplicated: number; invalid: number }>;
      const data = await requestGalleryItems();
      setItems(data);
      setError("");
      setToast(
        `导入 ${Number(importResult.added || 0)} 条，跳过 ${Number(importResult.duplicated || 0) + Number(importResult.invalid || 0)} 条`,
      );
    } catch (err) {
      setToast(err instanceof SyntaxError ? "导入失败：JSON 格式不正确" : "导入失败：服务端写入失败");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  function showFavoriteResults() {
    if (!favorites.length && !showFavoritesOnly) {
      setToast("收藏夹为空");
      return;
    }

    const scrollToPosition = (top: number) => {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top, behavior: "smooth" });
      });
    };

    if (showFavoritesOnly) {
      setShowFavoritesOnly(false);
      scrollToPosition(favoriteEntryScrollYRef.current);
    } else {
      favoriteEntryScrollYRef.current = window.scrollY;
      setSearchTerm("");
      setCategory("全部");
      setShowFavoritesOnly(true);
      scrollToPosition(0);
    }

    setViewMode("grid");
    setHeaderHidden(false);
  }

  function openRandomItem() {
    if (!filteredItems.length) {
      setToast("当前没有可随机的作品");
      return;
    }

    const index = Math.floor(Math.random() * filteredItems.length);
    setActiveItem(filteredItems[index]);
  }

  function addUserTag(item: GalleryItem, tag: string) {
    const nextTag = tag.trim();
    if (!nextTag) return;
    const key = itemKey(item);
    setUserTagsByItem((current) => ({
      ...current,
      [key]: Array.from(new Set([...(current[key] || []), nextTag])).slice(0, 24),
    }));
  }

  function removeUserTag(item: GalleryItem, tag: string) {
    const key = itemKey(item);
    setUserTagsByItem((current) => ({
      ...current,
      [key]: (current[key] || []).filter((value) => value !== tag),
    }));
  }

  return (
    <div className="app-shell" data-theme={theme}>
      <Header
        onRandom={openRandomItem}
        onExport={exportCurrentResults}
        compactSearchVisible={compactSearchVisible}
        headerHidden={headerHidden}
        headerSearchOpen={headerSearchOpen}
        onImport={() => importInputRef.current?.click()}
        onSearchSubmit={commitHeaderSearch}
        onActivateHeaderSearch={() => {
          setHeaderHidden(false);
          setHeaderSearchOpen(true);
        }}
        onCloseHeaderSearch={() => setHeaderSearchOpen(false)}
        onToggleTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        theme={theme}
      />
      <input
        ref={importInputRef}
        className="sr-only"
        type="file"
        accept="application/json,.json"
        onChange={(event) => importGalleryFile(event.target.files?.[0] || null)}
      />

      <main>
        <HeroSearch
          filteredCount={filteredItems.length}
          inputRef={searchInputRef}
          panelRef={searchPanelRef}
          onKeyDown={handleSearchKeyDown}
          onSave={saveCurrentSearch}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
        />

        <section className="page-section">
          <FilterBar
            category={category}
            setCategory={setCategory}
            setSortMode={setSortMode}
            setViewMode={setViewMode}
            sortMode={sortMode}
            viewMode={viewMode}
          />
          <StatsCards stats={stats} />
        </section>

        <section className="content-shell">
          <GalleryGrid
            error={error}
            favoriteKeys={favorites}
            items={filteredItems}
            loading={loading}
            onCopy={copyPrompt}
            onOpen={setActiveItem}
            onToggleFavorite={toggleFavorite}
            userTagsByItem={userTagsByItem}
            viewMode={viewMode}
          />

          <Sidebar
            category={category}
            favoriteItems={favoriteItems}
            onClearRecent={() => setRecentSearches([])}
            onOpenFavorite={setActiveItem}
            onPickRecent={(query) => setSearchTerm(query)}
            onPickTag={(tag) => {
              if (CATEGORIES.includes(tag as Category)) setCategory(tag as Category);
              else setSearchTerm(tag);
            }}
            onSaveSearch={saveCurrentSearch}
            onShowAllFavorites={showFavoriteResults}
            popularTags={popularTags}
            recentSearches={recentSearches}
            showFavoritesOnly={showFavoritesOnly}
            totalFavorites={favorites.length}
          />
        </section>

        <CtaBand />
      </main>

      <DetailModal
        favorite={activeFavorite}
        item={activeItem}
        items={filteredItems}
        onClose={() => setActiveItem(null)}
        onCopy={copyPrompt}
        onAddUserTag={addUserTag}
        onRemoveUserTag={removeUserTag}
        onSelect={setActiveItem}
        onToggleFavorite={toggleFavorite}
        userTags={activeItem ? userTagsByItem[itemKey(activeItem)] || activeItem.user_tags || [] : []}
      />

      <div className={`toast ${toast ? "toast-show" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}

function Header({
  compactSearchVisible,
  headerHidden,
  headerSearchOpen,
  onRandom,
  onExport,
  onImport,
  onSearchSubmit,
  onActivateHeaderSearch,
  onCloseHeaderSearch,
  onToggleTheme,
  searchTerm,
  setSearchTerm,
  theme,
}: {
  compactSearchVisible: boolean;
  headerHidden: boolean;
  headerSearchOpen: boolean;
  onRandom: () => void;
  onExport: () => void;
  onImport: () => void;
  onSearchSubmit: () => void;
  onActivateHeaderSearch: () => void;
  onCloseHeaderSearch: () => void;
  onToggleTheme: () => void;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  theme: ThemeMode;
}) {
  const headerSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (headerSearchOpen) headerSearchInputRef.current?.focus();
  }, [headerSearchOpen]);

  return (
    <header className={`topbar ${headerHidden ? "topbar-hidden" : ""}`}>
      <div className="topbar-inner">
        <a className="brand" href="/" aria-label="返回首页">
          <span className="brand-mark">D</span>
          <span>
            <strong>PromptFrame · GPT Image 2 画廊</strong>
            <small>作品浏览 · Prompt 学习 · 检索归档</small>
          </span>
        </a>

        <nav className="top-actions" aria-label="顶部操作">
          {compactSearchVisible ? (
            <div className="header-search-wrap">
              <button
                className={`circle-button header-search-trigger ${headerSearchOpen ? "active" : ""}`}
                type="button"
                onClick={onActivateHeaderSearch}
                aria-label="聚焦页眉搜索"
              >
                <Search size={20} />
              </button>
              <div className={`header-search-inline ${headerSearchOpen ? "active" : ""}`}>
                <input
                  ref={headerSearchInputRef}
                  value={searchTerm}
                  onFocus={onActivateHeaderSearch}
                  onBlur={onCloseHeaderSearch}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") onSearchSubmit();
                    if (event.key === "Escape") {
                      onCloseHeaderSearch();
                      event.currentTarget.blur();
                    }
                  }}
                  placeholder="搜索楼层 / 用户名 / Prompt 关键词"
                />
                {searchTerm ? (
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setSearchTerm("")}
                    aria-label="清空搜索"
                  >
                    <X size={16} />
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          <button className="ghost-button" type="button" onClick={onRandom}>
            <Box size={18} />
            随机看看
          </button>
          <button className="ghost-button" type="button" onClick={onExport}>
            <Download size={18} />
            导出
          </button>
          <button className="ghost-button" type="button" onClick={onImport}>
            <Upload size={18} />
            导入
          </button>
          <button
            className="circle-button theme-toggle"
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
            title={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
          >
            {theme === "dark" ? <SunMedium size={20} /> : <Moon size={20} />}
          </button>
        </nav>
      </div>
    </header>
  );
}

function HeroSearch({
  filteredCount,
  inputRef,
  panelRef,
  onKeyDown,
  onSave,
  searchTerm,
  setSearchTerm,
}: {
  filteredCount: number;
  inputRef: React.RefObject<HTMLInputElement>;
  panelRef: React.RefObject<HTMLDivElement>;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onSave: () => void;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
}) {
  return (
    <section className="hero">
      <div className="hero-art hero-art-left" aria-hidden="true">
        <span className="easel-frame" />
        <span className="easel-sun" />
        <span className="easel-hill hill-one" />
        <span className="easel-hill hill-two" />
        <span className="paint-brush" />
      </div>
      <div className="hero-art hero-art-right" aria-hidden="true">
        <span className="shape blob" />
        <span className="shape dot" />
        <span className="shape triangle" />
        <span className="shape coral" />
      </div>

      <div className="hero-copy">
        <p className="eyebrow">
          <Sparkles size={16} />
          社区作品灵感库
        </p>
        <h1>灵感画廊</h1>
        <p className="mobile-hero-subtitle">浏览作品 · 学习 Prompt · 检索归档</p>
      </div>

      <div className="search-panel" ref={panelRef}>
        <Search size={22} />
        <input
          ref={inputRef}
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="搜索楼层 / 用户名 / Prompt 关键词..."
        />
        {searchTerm ? (
          <button className="clear-search" type="button" onClick={() => setSearchTerm("")} aria-label="清空搜索">
            <X size={16} />
          </button>
        ) : null}
        <kbd>⌘ K</kbd>
      </div>

      <div className="hero-meta">
        <span>当前匹配 {filteredCount} 张作品</span>
        <button type="button" onClick={onSave}>
          <Save size={16} />
          保存当前搜索
        </button>
      </div>
    </section>
  );
}

function FilterBar({
  category,
  setCategory,
  setSortMode,
  setViewMode,
  sortMode,
  viewMode,
}: {
  category: Category;
  setCategory: (category: Category) => void;
  setSortMode: (sortMode: SortMode) => void;
  setViewMode: (viewMode: ViewMode) => void;
  sortMode: SortMode;
  viewMode: ViewMode;
}) {
  const categoryIcons: Record<Category, LucideIcon> = {
    全部: Grid3X3,
    海报: ImageIcon,
    城市: Layers,
    人物: Users,
    插画: Palette,
    国风: Sparkles,
  };

  return (
    <div className="filter-row">
      <div className="category-tabs" aria-label="分类筛选">
        {CATEGORIES.map((item) => {
          const Icon = categoryIcons[item];
          return (
            <button
              className={item === category ? "active" : ""}
              key={item}
              type="button"
              onClick={() => setCategory(item)}
            >
              <Icon className="mobile-category-icon" size={18} />
              {item}
            </button>
          );
        })}
      </div>

      <div className="view-tools">
        <label className="sort-select">
          <span className="sr-only">排序</span>
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
            <option value="newest">最新发布</option>
            <option value="oldest">最早发布</option>
          </select>
        </label>
        <div className="view-switch" aria-label="视图切换">
          <button
            className={viewMode === "grid" ? "active" : ""}
            type="button"
            onClick={() => setViewMode("grid")}
            aria-label="网格视图"
          >
            <Grid3X3 size={18} />
          </button>
          <button
            className={viewMode === "list" ? "active" : ""}
            type="button"
            onClick={() => setViewMode("list")}
            aria-label="列表视图"
          >
            <List size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

function StatsCards({ stats }: { stats: GalleryStats }) {
  const cards = [
    { label: "总作品", value: stats.images, icon: ImageIcon, tone: "indigo", detail: "已归档图片" },
    { label: "作者", value: stats.users, icon: Users, tone: "mint", detail: "社区创作者" },
    { label: "可复制 Prompt", value: stats.copyablePrompts, icon: Copy, tone: "amber", detail: "可直接复用" },
    { label: "多图帖子", value: stats.multiImagePosts, icon: Layers, tone: "rose", detail: "组图灵感" },
  ];

  return (
    <div className="stats-grid">
      {cards.map(({ detail, icon: Icon, label, tone, value }) => (
        <article className={`stat-card ${tone}`} key={label}>
          <span className="stat-icon">
            <Icon size={24} />
          </span>
          <span className="stat-text">
            <small>{label}</small>
            <strong>{value}</strong>
            <em>{detail}</em>
          </span>
          <TrendingUp className="stat-trend" size={22} />
        </article>
      ))}
    </div>
  );
}

function GalleryGrid({
  error,
  favoriteKeys,
  items,
  loading,
  onCopy,
  onOpen,
  onToggleFavorite,
  userTagsByItem,
  viewMode,
}: {
  error: string;
  favoriteKeys: string[];
  items: GalleryItem[];
  loading: boolean;
  onCopy: (item: GalleryItem) => void;
  onOpen: (item: GalleryItem) => void;
  onToggleFavorite: (item: GalleryItem) => void;
  userTagsByItem: Record<string, string[]>;
  viewMode: ViewMode;
}) {
  const favoriteSet = new Set(favoriteKeys);

  if (loading) {
    return (
      <div className="gallery-state">
        <Loader2 className="spin" size={28} />
        <span>正在加载画廊数据...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="gallery-state error-state">
        <AlertCircle size={28} />
        <strong>数据加载失败</strong>
        <span>{error}</span>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="gallery-state">
        <Search size={28} />
        <strong>没有匹配结果</strong>
        <span>换个关键词或切换分类试试。</span>
      </div>
    );
  }

  return (
    <div className={`gallery-grid ${viewMode === "list" ? "gallery-list" : ""}`}>
      {items.map((item) => {
        const key = itemKey(item);
        return (
          <GalleryCard
            favorite={favoriteSet.has(key)}
            item={item}
            key={key}
            onCopy={onCopy}
            onOpen={onOpen}
            onToggleFavorite={onToggleFavorite}
            userTags={userTagsByItem[key] || item.user_tags || []}
            viewMode={viewMode}
          />
        );
      })}
    </div>
  );
}

function GalleryCard({
  favorite,
  item,
  onCopy,
  onOpen,
  onToggleFavorite,
  userTags,
  viewMode,
}: {
  favorite: boolean;
  item: GalleryItem;
  onCopy: (item: GalleryItem) => void;
  onOpen: (item: GalleryItem) => void;
  onToggleFavorite: (item: GalleryItem) => void;
  userTags: string[];
  viewMode: ViewMode;
}) {
  const tags = getAllTags(item, userTags);

  if (viewMode === "list") {
    return (
      <article className="gallery-card list-card">
        <button className="image-button list-image-button" type="button" onClick={() => onOpen(item)} aria-label="查看作品详情">
          <img src={item.thumb_url || item.image_url} alt={getDisplayTitle(item)} loading="lazy" />
          <span className="floor-badge">#{item.post_number}</span>
          <span className="author-badge">@{item.username}</span>
        </button>

        <div className="card-body list-card-body">
          <div className="list-card-copy">
            <h3>{getDisplayTitle(item)}</h3>
            <p>{getPromptPreview(item, 110)}</p>
            <div className="tag-row">
              {(tags.length ? tags : ["灵感"]).slice(0, 5).map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <div className="list-meta-row">
              <span>
                <Copy size={14} />
                {item.prompt && item.prompt !== "未提供" ? "Prompt 可复制" : "未提供 Prompt"}
              </span>
              <span>
                <ImageIcon size={14} />
                图 {item.image_index}
              </span>
              <span>
                <Flag size={14} />
                来源活动帖
              </span>
            </div>
          </div>

          <div className="list-actions">
            <button className="detail-button" type="button" onClick={() => onOpen(item)}>
              查看详情
            </button>
            <button className="icon-action" type="button" onClick={() => onCopy(item)} aria-label="复制提示词">
              <Copy size={17} />
            </button>
            <button
              className={`icon-action ${favorite ? "active" : ""}`}
              type="button"
              onClick={() => onToggleFavorite(item)}
              aria-label={favorite ? "取消收藏" : "收藏"}
            >
              {favorite ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
            </button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="gallery-card">
      <button className="image-button" type="button" onClick={() => onOpen(item)} aria-label="查看作品详情">
        <img src={item.thumb_url || item.image_url} alt={getDisplayTitle(item)} loading="lazy" />
        <span className="floor-badge">#{item.post_number}</span>
        <span className="author-badge">@{item.username}</span>
      </button>

      <div className="card-body">
        <div>
          <h3>{getDisplayTitle(item)}</h3>
          <p>{getPromptPreview(item)}</p>
        </div>

        <div className="tag-row">
          {(tags.length ? tags : ["灵感"]).slice(0, 3).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>

        <div className="card-actions">
          <button className="detail-button" type="button" onClick={() => onOpen(item)}>
            详情
          </button>
          <button className="icon-action" type="button" onClick={() => onCopy(item)} aria-label="复制提示词">
            <Copy size={17} />
          </button>
          <button
            className={`icon-action ${favorite ? "active" : ""}`}
            type="button"
            onClick={() => onToggleFavorite(item)}
            aria-label={favorite ? "取消收藏" : "收藏"}
          >
            {favorite ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
          </button>
        </div>
      </div>
    </article>
  );
}

function Sidebar({
  category,
  favoriteItems,
  onClearRecent,
  onOpenFavorite,
  onPickRecent,
  onPickTag,
  onSaveSearch,
  onShowAllFavorites,
  popularTags,
  recentSearches,
  showFavoritesOnly,
  totalFavorites,
}: {
  category: Category;
  favoriteItems: GalleryItem[];
  onClearRecent: () => void;
  onOpenFavorite: (item: GalleryItem) => void;
  onPickRecent: (query: string) => void;
  onPickTag: (tag: string) => void;
  onSaveSearch: () => void;
  onShowAllFavorites: () => void;
  popularTags: [string, number][];
  recentSearches: string[];
  showFavoritesOnly: boolean;
  totalFavorites: number;
}) {
  return (
    <aside className="sidebar">
      <section className="side-card">
        <div className="side-title">
          <strong>快速筛选</strong>
          <Filter size={18} />
        </div>
        <p>热门标签</p>
        <div className="hot-tags">
          {popularTags.map(([tag]) => (
            <button
              className={category === tag ? "active" : ""}
              key={tag}
              type="button"
              onClick={() => onPickTag(tag)}
            >
              <Tag size={13} />
              {tag}
            </button>
          ))}
        </div>
      </section>

      <section className="side-card">
        <div className="side-title">
          <strong>最近搜索</strong>
          <button type="button" onClick={onClearRecent}>
            清空
          </button>
        </div>
        <div className="recent-list">
          {recentSearches.length ? (
            recentSearches.map((query) => (
              <button key={query} type="button" onClick={() => onPickRecent(query)}>
                <Clock3 size={15} />
                {query}
              </button>
            ))
          ) : (
            <span className="muted">按 Enter 或点击保存当前搜索。</span>
          )}
        </div>
        <button className="save-search-button" type="button" onClick={onSaveSearch}>
          <Save size={16} />
          保存当前搜索
        </button>
      </section>

      <section className="side-card">
        <div className="side-title">
          <strong>
            <Star size={18} />
            收藏夹
          </strong>
          <button type="button" onClick={onShowAllFavorites}>
            {showFavoritesOnly ? "退出收藏夹" : "查看全部"}
          </button>
        </div>
        {favoriteItems.length ? (
          <div className="favorite-grid">
            {favoriteItems.slice(0, 4).map((item) => (
              <button key={itemKey(item)} type="button" onClick={() => onOpenFavorite(item)}>
                <img src={item.thumb_url || item.image_url} alt={getDisplayTitle(item)} loading="lazy" />
              </button>
            ))}
          </div>
        ) : (
          <span className="muted">点击作品卡片右下角书签收藏。</span>
        )}
        <p className="favorite-count">共 {totalFavorites} 个收藏</p>
      </section>
    </aside>
  );
}

function CtaBand() {
  return (
    <section className="cta-band">
      <div className="palette-illustration" aria-hidden="true">
        <Palette size={62} />
      </div>
      <div>
        <h2>发现优质 Prompt，激发更多创作灵感</h2>
        <p>学习高手的提示词写法，复制、调整、应用到你的创作中。</p>
      </div>
      <a href="#root" className="cta-button">
        探索 Prompt 灵感库
        <ArrowRight size={20} />
      </a>
    </section>
  );
}

function DetailModal({
  favorite,
  item,
  items,
  onAddUserTag,
  onClose,
  onCopy,
  onRemoveUserTag,
  onSelect,
  onToggleFavorite,
  userTags,
}: {
  favorite: boolean;
  item: GalleryItem | null;
  items: GalleryItem[];
  onAddUserTag: (item: GalleryItem, tag: string) => void;
  onClose: () => void;
  onCopy: (item: GalleryItem) => void;
  onRemoveUserTag: (item: GalleryItem, tag: string) => void;
  onSelect: (item: GalleryItem) => void;
  onToggleFavorite: (item: GalleryItem) => void;
  userTags: string[];
}) {
  const [imageSize, setImageSize] = useState("读取中");
  const [newTag, setNewTag] = useState("");

  useEffect(() => {
    if (!item) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [item, onClose]);

  useEffect(() => {
    setImageSize("读取中");
    setNewTag("");
  }, [item]);

  if (!item) return null;

  const originalTags = getOriginalTags(item);
  const currentKey = itemKey(item);
  const currentIndex = items.findIndex((candidate) => itemKey(candidate) === currentKey);
  const previousItem = currentIndex > 0 ? items[currentIndex - 1] : null;
  const nextItem = currentIndex >= 0 && currentIndex < items.length - 1 ? items[currentIndex + 1] : null;
  const samePostItems = items.filter((candidate) => candidate.post_number === item.post_number);
  const relatedItems = (samePostItems.length > 1 ? samePostItems : [item, previousItem, nextItem].filter(Boolean)).slice(
    0,
    2,
  ) as GalleryItem[];

  return (
    <div className="modal-backdrop detail-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-panel detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Prompt 详情"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mobile-detail-topbar">
          <button type="button" onClick={onClose} aria-label="关闭详情">
            <ChevronLeft size={26} />
          </button>
          <strong>图片详情</strong>
          <span aria-hidden="true" />
        </div>

        <div className="detail-gallery">
          <div className="detail-image-frame">
            {previousItem ? (
              <button className="image-nav prev" type="button" onClick={() => onSelect(previousItem)} aria-label="上一张">
                <ChevronLeft size={24} />
              </button>
            ) : null}
            <img
              src={item.image_url}
              alt={getDisplayTitle(item)}
              onLoad={(event) => {
                const image = event.currentTarget;
                setImageSize(`${image.naturalWidth}×${image.naturalHeight}`);
              }}
            />
            {nextItem ? (
              <button className="image-nav next" type="button" onClick={() => onSelect(nextItem)} aria-label="下一张">
                <ChevronRight size={24} />
              </button>
            ) : null}
          </div>

          <div className="detail-thumbs">
            {relatedItems.map((candidate) => (
              <button
                className={itemKey(candidate) === currentKey ? "active" : ""}
                key={itemKey(candidate)}
                type="button"
                onClick={() => onSelect(candidate)}
              >
                <img src={candidate.thumb_url || candidate.image_url} alt={getDisplayTitle(candidate)} loading="lazy" />
              </button>
            ))}
            <button className="more-related" type="button" onClick={() => (nextItem ? onSelect(nextItem) : undefined)}>
              <span>＋</span>
              更多相关作品
            </button>
          </div>
        </div>

        <div className="modal-side detail-side">
          <div className="detail-topline">
            <button className="detail-back-button" type="button" onClick={onClose}>
              <ChevronLeft size={18} />
              作品详情
            </button>
            <button className="detail-close" type="button" onClick={onClose} aria-label="关闭详情">
              <X size={22} />
            </button>
          </div>

          <div className="detail-heading">
            <div>
              <h2>
                第{item.post_number}层 · @{item.username} · 图{item.image_index}
              </h2>
              <p>
                发布于活动归档
                <span>·</span>
                可复制 Prompt
                <Copy size={15} />
              </p>
            </div>
            <button
              className={`detail-favorite ${favorite ? "active" : ""}`}
              type="button"
              onClick={() => onToggleFavorite(item)}
              aria-label={favorite ? "取消收藏" : "收藏"}
            >
              <Star size={28} />
            </button>
          </div>

          <div className="detail-metrics">
            <MetricCard icon={Flag} label="楼层" value={String(item.post_number)} tone="blue" />
            <MetricCard icon={Users} label="作者" value={`@${item.username}`} tone="green" />
            <MetricCard icon={ImageIcon} label="图" value={`${item.image_index}/${Math.max(samePostItems.length, item.image_index)}`} tone="red" />
            <MetricCard icon={Palette} label="风格" value={originalTags[0] || "灵感"} tone="orange" />
            <MetricCard icon={Maximize2} label="尺寸" value={imageSize} tone="purple" />
          </div>

          <section className="detail-section prompt-detail">
            <h3>
              <Copy size={18} />
              <span className="desktop-prompt-title">Prompt / Metadata</span>
              <span className="mobile-prompt-title">Prompt / 提示词</span>
            </h3>
            <div className="detail-prompt-scroll">{item.prompt || "未提供"}</div>
            <div className="modal-actions detail-actions">
              <button type="button" className="primary-action" onClick={() => onCopy(item)}>
                <Copy size={18} />
                复制提示词
              </button>
              <a href={item.post_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={18} />
                打开原帖
              </a>
              <a href={item.image_url} target="_blank" rel="noopener noreferrer">
                <ImageIcon size={18} />
                打开原图
              </a>
            </div>
          </section>

          <section className="detail-section extra-detail">
            <h3>
              <Layers size={18} />
              附加信息
            </h3>
            <div className="extra-info-grid">
              <InfoCell icon={Flag} label="标题" value={`第${item.post_number}层 · 图${item.image_index}`} />
              <InfoCell icon={CalendarDays} label="发布时间" value="活动归档" />
              <InfoCell icon={Link2} label="原帖链接" value={item.post_url} />
              <InfoCell icon={ImageIcon} label="图片来源" value="活动归档" />
              <div className="info-cell tags-cell">
                <span className="info-icon">
                  <Tag size={18} />
                </span>
                <div>
                  <small>原始标签</small>
                  <div className="modal-tags detail-tags original-tags">
                    {(originalTags.length ? originalTags : ["灵感"]).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="info-cell tags-cell user-tags-cell">
                <span className="info-icon">
                  <Tag size={18} />
                </span>
                <div>
                  <small>我的标签</small>
                  <div className="modal-tags detail-tags user-tags">
                    {userTags.length ? (
                      userTags.map((tag) => (
                        <span className="editable-tag" key={tag}>
                          {tag}
                          <button type="button" onClick={() => onRemoveUserTag(item, tag)} aria-label={`删除 ${tag}`}>
                            <X size={12} />
                          </button>
                        </span>
                      ))
                    ) : (
                      <span>暂无</span>
                    )}
                  </div>
                  <form
                    className="tag-editor"
                    onSubmit={(event) => {
                      event.preventDefault();
                      onAddUserTag(item, newTag);
                      setNewTag("");
                    }}
                  >
                    <input
                      value={newTag}
                      onChange={(event) => setNewTag(event.target.value)}
                      placeholder="新增自定义标签"
                      maxLength={18}
                    />
                    <button type="submit">添加</button>
                  </form>
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  tone,
  value,
}: {
  icon: LucideIcon;
  label: string;
  tone: "blue" | "green" | "red" | "orange" | "purple";
  value: string;
}) {
  return (
    <div className={`metric-card ${tone}`}>
      <span>
        <Icon size={19} />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function InfoCell({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="info-cell">
      <span className="info-icon">
        <Icon size={18} />
      </span>
      <div>
        <small>{label}</small>
        <strong title={value}>{value}</strong>
      </div>
    </div>
  );
}
