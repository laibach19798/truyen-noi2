// Tìm truyện trên toàn web. GET /api/search?q=...&type=story|author
// Dùng Brave Search API nếu có biến môi trường BRAVE_API_KEY (miễn phí tại
// https://api-dashboard.search.brave.com), không có thì thử DuckDuckGo bản HTML.
// (Google đã ngừng cấp Custom Search API cho người dùng mới.)

const TIMEOUT_MS = 15000;
const UA = 'Mozilla/5.0 (compatible; TruyenNoi/1.0; +https://github.com/laibach19798/truyen-noi2)';

const { buildQuery, decodeEntities, rankResults, parseDuckDuckGo } = require('../src/sources/webSearchParse');

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function searchBrave(query, key) {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=20`;
  const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json', 'X-Subscription-Token': key } });
  if (!res.ok) throw new Error(`Brave HTTP ${res.status}`);
  const data = await res.json();
  return (data.web?.results || []).map((r) => ({
    title: decodeEntities(r.title || ''), url: r.url, description: decodeEntities(r.description || ''),
  }));
}

async function searchDuckDuckGo(query) {
  const res = await fetchWithTimeout(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=vn-vi`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'vi,en;q=0.8' },
  });
  if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`);
  const results = parseDuckDuckGo(await res.text());
  if (!results.length) throw new Error('DuckDuckGo không trả kết quả (có thể bị giới hạn)');
  return results;
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Expose-Headers', 'X-Truyen-Proxy');
  res.setHeader('X-Truyen-Proxy', '1');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const params = new URL(req.url, 'http://localhost').searchParams;
  const q = (params.get('q') || '').trim().slice(0, 200);
  if (!q) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'Thiếu từ khoá' }));
  }
  const query = buildQuery(q, params.get('type'));
  const errors = [];
  const providers = [];
  if (process.env.BRAVE_API_KEY) providers.push(['brave', () => searchBrave(query, process.env.BRAVE_API_KEY)]);
  providers.push(['duckduckgo', () => searchDuckDuckGo(query)]);

  for (const [name, run] of providers) {
    try {
      const results = rankResults(await run());
      res.setHeader('Cache-Control', 'public, s-maxage=3600, max-age=600');
      return res.end(JSON.stringify({ provider: name, results }));
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
    }
  }
  res.statusCode = 502;
  const hint = process.env.BRAVE_API_KEY ? '' : ' — thêm BRAVE_API_KEY trong Vercel để tìm trên web ổn định';
  res.end(JSON.stringify({ error: `${errors.join('; ')}${hint}` }));
}

module.exports = handler;
module.exports.parseDuckDuckGo = parseDuckDuckGo;
module.exports.rankResults = rankResults;
module.exports.buildQuery = buildQuery;
