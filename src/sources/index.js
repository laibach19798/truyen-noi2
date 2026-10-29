import { fetchHtml, mapLimit } from './fetcher';
import { parseHtml, pickAdapter, truyenfullAdapter, normalizeOrder } from './parsers';

export { getCustomProxy, setCustomProxy } from './fetcher';

const chapterCache = new Map();
const MAX_CACHED_CHAPTERS = 60;

// Trang dùng để tìm kiếm (giao diện TruyệnFull). Tên miền hay đổi nên cho phép sửa.
export const DEFAULT_SEARCH_ORIGIN = 'https://truyenfull.vision';

// Mở một URL bất kỳ: trang giới thiệu truyện (có mục lục) hoặc một trang chương.
// Trả về { story, chapters } — nội dung chương được tải sau (lazy).
export async function loadFromUrl(rawUrl, { onProgress, signal } = {}) {
  const url = /^https?:\/\//i.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`;
  const { html, url: finalUrl } = await fetchHtml(url, { signal });
  const doc = parseHtml(html);
  const adapter = pickAdapter(doc);

  if (adapter.isStoryPage(doc, finalUrl)) {
    const info = adapter.parseStory(doc, finalUrl);
    let chapters = info.chapters;
    if (info.pageUrls.length) {
      let done = 0;
      onProgress?.(`Đang tải mục lục 1/${info.pageUrls.length + 1}...`);
      const pages = await mapLimit(info.pageUrls, 4, async (pageUrl) => {
        try {
          const page = await fetchHtml(pageUrl, { signal });
          return adapter.parseChapterList(parseHtml(page.html), page.url);
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          return [];
        } finally {
          onProgress?.(`Đang tải mục lục ${++done + 1}/${info.pageUrls.length + 1}...`);
        }
      });
      chapters = chapters.concat(...pages);
    }
    const seen = new Set();
    chapters = normalizeOrder(chapters.filter((c) => !seen.has(c.url) && seen.add(c.url)));
    if (!chapters.length) throw new Error('Không tìm thấy danh sách chương');
    return {
      story: { title: info.title, author: info.author, cover: info.cover, description: info.description, sourceUrl: finalUrl, mode: 'index', site: adapter.name },
      chapters: chapters.map((c) => ({ title: c.title, url: c.url })),
    };
  }

  // Trang chương: đọc chương này và lần theo nút "Chương sau".
  const chapter = adapter.parseChapter(doc, finalUrl);
  if (!chapter.content || chapter.content.length < 100) throw new Error('Không tìm thấy nội dung truyện ở trang này');
  remember(finalUrl, chapter);
  return {
    story: { title: chapter.storyTitle || chapter.title, author: '', cover: '', description: '', sourceUrl: finalUrl, mode: 'follow', site: adapter.name },
    chapters: [{ title: chapter.title, url: finalUrl, content: chapter.content, nextUrl: chapter.nextUrl }],
  };
}

const remember = (url, chapter) => {
  chapterCache.set(url, chapter);
  if (chapterCache.size > MAX_CACHED_CHAPTERS) chapterCache.delete(chapterCache.keys().next().value);
};

const inflight = new Map();

// Tải nội dung một chương: { title, content, nextUrl }.
export function loadChapter(url) {
  if (chapterCache.has(url)) return Promise.resolve(chapterCache.get(url));
  if (inflight.has(url)) return inflight.get(url);
  const p = (async () => {
    const { html, url: finalUrl } = await fetchHtml(url);
    const doc = parseHtml(html);
    const chapter = pickAdapter(doc).parseChapter(doc, finalUrl);
    if (!chapter.content) throw new Error('Chương trống hoặc bị khoá');
    remember(url, chapter);
    return chapter;
  })().finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

export async function searchStories(query, origin = DEFAULT_SEARCH_ORIGIN) {
  const base = (/^https?:\/\//i.test(origin) ? origin : `https://${origin}`).replace(/\/+$/, '');
  const { html, url } = await fetchHtml(truyenfullAdapter.searchUrl(base, query));
  return truyenfullAdapter.parseSearch(parseHtml(html), url);
}
