// Bộ phân tích HTML: biến trang truyện / trang chương thành dữ liệu cho app.
// Có bộ chuyên cho giao diện kiểu TruyệnFull và bộ "tổng quát" dựa trên heuristic
// cho các trang còn lại.

export const parseHtml = (html) => new DOMParser().parseFromString(html, 'text/html');

export const absUrl = (href, base) => {
  if (!href || /^(javascript:|#|mailto:)/i.test(href.trim())) return null;
  try { return new URL(href, base).href; } catch (e) { return null; }
};

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'INS', 'BUTTON', 'FORM', 'SELECT', 'SVG', 'IMG']);
const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'SECTION', 'ARTICLE', 'BLOCKQUOTE', 'TR', 'PRE', 'HR']);
const JUNK_SELECTOR = '.ads, .ad, [class*="ads-"], [id*="ads"], .adsbygoogle, .chapter-nav, .comment, .comments, .social';

// Dòng quảng cáo/watermark hay chèn vào giữa chương.
const JUNK_LINE = /(bạn đang đọc truyện|đọc truyện (online|chữ|full)|nguồn\s*:|truyenfull|tàng thư viện|metruyen|wikidich|truyện được (lấy|cập nhật)|www\.|https?:\/\/|\.com\b|\.vn\b|\.net\b)/i;

// Chuyển một phần tử HTML thành văn bản thuần, giữ ngắt đoạn.
export function htmlToText(el) {
  if (!el) return '';
  const root = el.cloneNode(true);
  root.querySelectorAll?.(JUNK_SELECTOR).forEach((n) => n.remove());
  let out = '';
  const walk = (node) => {
    if (node.nodeType === 3) { out += node.nodeValue.replace(/\s+/g, ' '); return; }
    if (node.nodeType !== 1 || SKIP_TAGS.has(node.tagName)) return;
    if (node.tagName === 'BR') { out += '\n'; return; }
    const block = BLOCK_TAGS.has(node.tagName);
    if (block) out += '\n';
    node.childNodes.forEach(walk);
    if (block) out += '\n';
  };
  walk(root);
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !(l.length < 160 && JUNK_LINE.test(l)))
    .join('\n\n');
}

// Lấy số chương từ tiêu đề: "Chương 12", "Chapter 3", "第十二章"...
const CN_DIGITS = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const CN_UNITS = { 十: 10, 百: 100, 千: 1000, 万: 10000 };
const parseChineseNumber = (s) => {
  let total = 0, cur = 0;
  for (const ch of s) {
    if (ch in CN_DIGITS) cur = CN_DIGITS[ch];
    else if (ch in CN_UNITS) { total += (cur || 1) * CN_UNITS[ch]; cur = 0; }
  }
  return total + cur;
};

export const chapterNumber = (title) => {
  const m = (title || '').match(/(?:chương|chuong|chapter|chap|ch\.|hồi|quyển)\s*(\d+)/i) || (title || '').match(/第\s*(\d+)\s*[章节回]/);
  if (m) return parseInt(m[1], 10);
  const cn = (title || '').match(/第\s*([零〇一二两三四五六七八九十百千万]+)\s*[章节回]/);
  return cn ? parseChineseNumber(cn[1]) : null;
};

const CHAPTER_LINK = /^\s*(chương|chuong|chapter|chap\b|ch\.\s*\d|hồi\s*\d|quyển|第\s*[\d零〇一二两三四五六七八九十百千万]+\s*[章节回])/i;
const NEXT_LINK = /(chương|chap(ter)?)\s*(sau|tiếp|kế)|^\s*(next|tiếp|sau)\b|下一[章页节]|→|»|›/i;

const dedupeChapters = (list) => {
  const seen = new Set();
  return list.filter((c) => c.url && !seen.has(c.url) && seen.add(c.url));
};

// Nếu danh sách đang xếp chương mới nhất lên đầu thì đảo lại.
export const normalizeOrder = (chapters) => {
  const nums = chapters.map((c) => chapterNumber(c.title)).filter((n) => n !== null);
  if (nums.length >= 2 && nums[0] > nums[nums.length - 1]) return [...chapters].reverse();
  return chapters;
};

const sameSite = (a, b) => {
  try { return new URL(a).hostname.replace(/^www\./, '') === new URL(b).hostname.replace(/^www\./, ''); } catch (e) { return false; }
};

const metaContent = (doc, prop) =>
  doc.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`)?.getAttribute('content') || '';

// ---------------------------------------------------------------- TruyệnFull
// Giao diện dùng chung bởi truyenfull.* và nhiều trang sao chép giao diện đó.
export const truyenfullAdapter = {
  name: 'TruyệnFull',
  detect: (doc) => !!doc.querySelector('#list-chapter, #chapter-c, .list-chapter, .col-truyen-main'),

  isStoryPage: (doc) => !!doc.querySelector('#list-chapter, .list-chapter'),

  parseStory(doc, url) {
    const title = clean(doc.querySelector('h3.title, .col-info-desc h3, h1')?.textContent) || clean(doc.title);
    const author = clean(doc.querySelector('.info [itemprop="author"], .info a[href*="tac-gia"]')?.textContent);
    const cover = absUrl(doc.querySelector('.book img, .books img')?.getAttribute('src'), url) || metaContent(doc, 'og:image');
    const description = htmlToText(doc.querySelector('.desc-text, [itemprop="description"]'));
    const chapters = this.parseChapterList(doc, url);

    // Tìm số trang danh sách chương.
    let totalPages = parseInt(doc.querySelector('#total-page')?.getAttribute('value'), 10) || 1;
    doc.querySelectorAll('.pagination a[href], .pagination li a').forEach((a) => {
      const m = (a.getAttribute('href') || '').match(/trang-(\d+)/);
      if (m) totalPages = Math.max(totalPages, parseInt(m[1], 10));
    });
    const base = url.replace(/[?#].*$/, '').replace(/trang-\d+\/?$/, '').replace(/\/?$/, '/');
    const pageUrls = [];
    for (let p = 2; p <= totalPages; p++) pageUrls.push(`${base}trang-${p}/#list-chapter`);

    return { title, author, cover, description, chapters, pageUrls };
  },

  parseChapterList(doc, url) {
    return Array.from(doc.querySelectorAll('#list-chapter .list-chapter li a, ul.list-chapter li a'))
      .map((a) => ({ title: clean(a.getAttribute('title') || a.textContent), url: absUrl(a.getAttribute('href'), url) }))
      .filter((c) => c.url);
  },

  parseChapter(doc, url) {
    const title = clean(doc.querySelector('.chapter-title, a.chapter-title, h2')?.textContent) || clean(doc.title);
    const content = htmlToText(doc.querySelector('#chapter-c, .chapter-c'));
    const nextUrl = absUrl(doc.querySelector('#next_chap, a.next-chap')?.getAttribute('href'), url);
    const storyTitle = clean(doc.querySelector('a.truyen-title, .truyen-title')?.textContent);
    return { title, content, nextUrl, storyTitle };
  },

  searchUrl: (origin, query) => `${origin}/tim-kiem/?tukhoa=${encodeURIComponent(query)}`,

  parseSearch(doc, url) {
    return Array.from(doc.querySelectorAll('.list-truyen .row')).map((row) => {
      const a = row.querySelector('h3 a, .truyen-title a');
      if (!a) return null;
      const coverEl = row.querySelector('[data-image], [data-desk-image], img');
      return {
        title: clean(a.textContent),
        url: absUrl(a.getAttribute('href'), url),
        author: clean(row.querySelector('.author')?.textContent),
        cover: absUrl(coverEl?.getAttribute('data-image') || coverEl?.getAttribute('data-desk-image') || coverEl?.getAttribute('src'), url),
        info: clean(row.querySelector('.text-info, .col-xs-2')?.textContent),
      };
    }).filter((r) => r && r.url);
  },
};

// ---------------------------------------------------------------- Tổng quát
const CONTENT_SELECTORS = [
  '#chapter-c', '#chapter-content', '.chapter-content', '.chapter-c', '#chapterContent', '.reading-content',
  '.box-chap', '#content', '.content-chapter', '#chaptercontent', '#htmlContent', '.txtnav', '#booktxt',
  '.read-content', '.entry-content', 'article',
];

// Chọn phần tử có nhiều chữ "thật" nhất (ít liên kết) làm nội dung chương.
const findMainContent = (doc) => {
  for (const sel of CONTENT_SELECTORS) {
    const el = doc.querySelector(sel);
    if (el && clean(el.textContent).length > 300) return el;
  }
  let best = null, bestScore = 0;
  doc.querySelectorAll('div, article, section, td, main').forEach((el) => {
    let own = 0;
    el.childNodes.forEach((n) => {
      if (n.nodeType === 3) own += clean(n.nodeValue).length;
      else if (n.nodeType === 1 && (n.tagName === 'P' || n.tagName === 'SPAN')) own += clean(n.textContent).length;
    });
    const linkText = Array.from(el.querySelectorAll('a')).reduce((s, a) => s + clean(a.textContent).length, 0);
    const score = own - linkText * 2;
    if (score > bestScore) { bestScore = score; best = el; }
  });
  return best || doc.body;
};

export const genericAdapter = {
  name: 'Tổng quát',
  detect: () => true,

  isStoryPage(doc, url) {
    return this.parseChapterList(doc, url).length >= 3;
  },

  parseStory(doc, url) {
    const title = clean(metaContent(doc, 'og:title')) || clean(doc.querySelector('h1')?.textContent) || clean(doc.title);
    const description = clean(metaContent(doc, 'og:description') || metaContent(doc, 'description'));
    const cover = absUrl(metaContent(doc, 'og:image'), url) || '';
    const author = clean(metaContent(doc, 'og:novel:author') || metaContent(doc, 'book:author'));
    return { title, author, cover, description, chapters: this.parseChapterList(doc, url), pageUrls: [] };
  },

  parseChapterList(doc, url) {
    const links = Array.from(doc.querySelectorAll('a[href]'))
      .map((a) => ({ title: clean(a.getAttribute('title') || a.textContent), url: absUrl(a.getAttribute('href'), url) }))
      .filter((c) => c.url && c.title.length < 200 && CHAPTER_LINK.test(c.title) && sameSite(c.url, url) && c.url !== url);
    return normalizeOrder(dedupeChapters(links));
  },

  parseChapter(doc, url) {
    const main = findMainContent(doc);
    const title = clean(doc.querySelector('.chapter-title, h1, h2')?.textContent) || clean(doc.title);
    let content = htmlToText(main);
    // Bỏ tiêu đề lặp lại ở đầu nội dung.
    if (title && content.startsWith(title)) content = content.slice(title.length).trim();

    let nextUrl = absUrl(doc.querySelector('a[rel="next"], #next_chap, #next, a.next, .next a')?.getAttribute('href'), url);
    if (!nextUrl) {
      const a = Array.from(doc.querySelectorAll('a[href]')).find((el) => NEXT_LINK.test(clean(el.textContent)) && absUrl(el.getAttribute('href'), url));
      nextUrl = a ? absUrl(a.getAttribute('href'), url) : null;
    }
    if (nextUrl && (!sameSite(nextUrl, url) || nextUrl === url)) nextUrl = null;
    return { title, content, nextUrl, storyTitle: '' };
  },
};

export const ADAPTERS = [truyenfullAdapter, genericAdapter];

export const pickAdapter = (doc) => ADAPTERS.find((a) => a.detect(doc));
