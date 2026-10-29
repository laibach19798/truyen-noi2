// Phần dùng chung cho tìm kiếm trên web: dựng câu tìm, đọc trang kết quả DuckDuckGo (bản HTML),
// lọc và xếp hạng kết quả. Viết dạng CommonJS để dùng được cả trong api/search.js (Node) lẫn app.

// Trang không phải nơi đọc truyện chữ.
const BLOCKED_HOSTS = /(^|\.)(youtube\.com|youtu\.be|facebook\.com|tiktok\.com|instagram\.com|twitter\.com|x\.com|shopee\.vn|lazada\.vn|tiki\.vn|fahasa\.com|wikipedia\.org|reddit\.com|pinterest\.com|spotify\.com|google\.com|apple\.com|amazon\.com)$/i;
const STORY_HINT = /(truyen|truyện|chuong|chương|novel|doc-truyen|đọc truyện|tangthuvien|wikidich|metruyen|sangtac|ebook)/i;

const buildQuery = (q, type) => (type === 'author' ? `truyện của tác giả ${q}` : `${q} đọc truyện`);

const decodeEntities = (s) => s
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/\s+/g, ' ').trim();

// Lọc trang không liên quan, bỏ trùng tên miền + đường dẫn, đưa trang có dấu hiệu truyện lên trước.
function rankResults(results) {
  const seen = new Set();
  const cleaned = [];
  for (const r of results) {
    let url;
    try { url = new URL(r.url); } catch (e) { continue; }
    if (!/^https?:$/.test(url.protocol) || BLOCKED_HOSTS.test(url.hostname)) continue;
    const key = url.hostname.replace(/^www\./, '') + url.pathname.replace(/\/$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push({ title: r.title, url: url.href, description: r.description || '', host: url.hostname.replace(/^www\./, '') });
  }
  const score = (r) => (STORY_HINT.test(r.url) ? 2 : 0) + (STORY_HINT.test(r.title) ? 1 : 0);
  return cleaned
    .map((r, i) => ({ r, i, s: score(r) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map(({ r }) => r);
}

function parseDuckDuckGo(html) {
  const results = [];
  // Mỗi kết quả bắt đầu bằng thẻ <a class="result__a">; snippet nằm trong cùng khối.
  const blocks = html.split(/(?=<a[^>]+class="result__a")/).slice(1);
  for (const block of blocks) {
    const link = block.match(/^<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    let href = decodeEntities(link[1]);
    // Link dạng //duckduckgo.com/l/?uddg=<url thật>
    const uddg = href.match(/[?&]uddg=([^&]+)/);
    if (uddg) href = decodeURIComponent(uddg[1]);
    else if (href.startsWith('//')) href = 'https:' + href;
    if (/duckduckgo\.com\/y\.js/.test(href)) continue; // quảng cáo
    const snippet = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/);
    results.push({ title: decodeEntities(link[2]), url: href, description: decodeEntities(snippet ? snippet[1] : '') });
  }
  return results;
}

module.exports = { buildQuery, decodeEntities, rankResults, parseDuckDuckGo };
