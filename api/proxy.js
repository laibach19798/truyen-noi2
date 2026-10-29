// Proxy CORS dùng cho việc lấy HTML từ các trang truyện khác.
// Chạy được như Vercel Serverless Function (api/proxy.js), trong dev server
// của CRA (src/setupProxy.js) và trong server.js khi tự host.
const net = require('net');

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 20000;

const isPrivateHost = (hostname) => {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (net.isIPv4(h)) {
    const [a, b] = h.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (net.isIPv6(h)) return h === '::1' || h === '::' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80') || h.startsWith('::ffff:');
  return false;
};

module.exports = async function proxy(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Expose-Headers', 'X-Truyen-Proxy, X-Final-Url');
  res.setHeader('X-Truyen-Proxy', '1');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }

  const target = new URL(req.url, 'http://localhost').searchParams.get('url');
  let url;
  try { url = new URL(target); } catch (e) { url = null; }
  if (!url || !/^https?:$/.test(url.protocol) || isPrivateHost(url.hostname)) {
    res.statusCode = 400;
    return res.end('URL không hợp lệ');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const upstream = await fetch(url.href, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TruyenNoi/1.0; +https://github.com/laibach19798/truyen-noi2)',
        'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'vi,en;q=0.8,zh;q=0.6',
      },
    });
    const finalUrl = new URL(upstream.url);
    if (isPrivateHost(finalUrl.hostname)) throw new Error('Chuyển hướng không hợp lệ');

    const chunks = [];
    let size = 0;
    for await (const chunk of upstream.body) {
      size += chunk.length;
      if (size > MAX_BYTES) throw new Error('Trang quá lớn');
      chunks.push(chunk);
    }
    res.statusCode = upstream.status;
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/html');
    res.setHeader('X-Final-Url', upstream.url);
    res.setHeader('Cache-Control', 'public, s-maxage=600, max-age=300');
    res.end(Buffer.concat(chunks));
  } catch (e) {
    res.statusCode = 502;
    res.end('Lỗi proxy: ' + e.message);
  } finally {
    clearTimeout(timer);
  }
};
