// Tải HTML từ trang khác qua proxy CORS (ưu tiên proxy riêng /api/proxy,
// sau đó là proxy do người dùng cấu hình, cuối cùng là các proxy công cộng).

const TIMEOUT_MS = 25000;
const CUSTOM_PROXY_KEY = 'customProxy';

export const getCustomProxy = () => {
  try { return localStorage.getItem(CUSTOM_PROXY_KEY) || ''; } catch (e) { return ''; }
};

export const setCustomProxy = (value) => {
  try {
    if (value) localStorage.setItem(CUSTOM_PROXY_KEY, value.trim());
    else localStorage.removeItem(CUSTOM_PROXY_KEY);
  } catch (e) {}
};

// Proxy tuỳ chỉnh: có `{url}` thì thay vào, không thì nối URL đã mã hoá vào cuối.
const customProxyUrl = (template, url) => template.includes('{url}')
  ? template.replace('{url}', encodeURIComponent(url))
  : template + encodeURIComponent(url);

const buildProxies = () => {
  const list = [];
  // Proxy riêng do người dùng nhập (vd. Cloudflare Worker) được thử trước: nó tồn tại chính là vì
  // nhiều trang chặn máy chủ của app.
  const custom = getCustomProxy();
  if (custom) list.push({ name: 'custom', build: (u) => customProxyUrl(custom, u) });
  list.push(
    { name: 'self', build: (u) => `/api/proxy?url=${encodeURIComponent(u)}`, requireHeader: true },
    { name: 'allorigins', build: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` },
    { name: 'corsproxy', build: (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}` },
    { name: 'codetabs', build: (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}` },
  );
  return list;
};

let preferredProxy = null;

// Giải mã theo charset trong header/thẻ meta (hỗ trợ trang GBK/Big5 của Trung Quốc).
export const decodeHtml = (buffer, contentType = '') => {
  const bytes = new Uint8Array(buffer);
  let charset = (contentType.match(/charset=([\w-]+)/i) || [])[1];
  if (!charset) {
    const head = new TextDecoder('ascii').decode(bytes.slice(0, 2048));
    charset = (head.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1];
  }
  try {
    return new TextDecoder((charset || 'utf-8').toLowerCase()).decode(bytes);
  } catch (e) {
    return new TextDecoder('utf-8').decode(bytes);
  }
};

const fetchWithTimeout = async (url, signal) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
};

const looksLikeBlockPage = (html) =>
  html.trim().length < 50 ||
  /<title>\s*(Just a moment|Attention Required|Access denied)/i.test(html);

// Trả về { html, url } — url là địa chỉ cuối cùng sau chuyển hướng (nếu biết).
export async function fetchHtml(url, { signal } = {}) {
  const proxies = buildProxies();
  if (preferredProxy) proxies.sort((a, b) => (b.name === preferredProxy) - (a.name === preferredProxy));

  const errors = [];
  for (const proxy of proxies) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      const res = await fetchWithTimeout(proxy.build(url), signal);
      // Khi app được host tĩnh, /api/proxy sẽ trả về index.html — bỏ qua.
      if (proxy.requireHeader && !res.headers.get('x-truyen-proxy')) throw new Error('không có proxy riêng');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = decodeHtml(await res.arrayBuffer(), res.headers.get('content-type') || '');
      if (looksLikeBlockPage(html)) throw new Error('trang bị chặn hoặc rỗng');
      preferredProxy = proxy.name;
      return { html, url: res.headers.get('x-final-url') || url };
    } catch (e) {
      if (e.name === 'AbortError' && signal?.aborted) throw e;
      errors.push(`${proxy.name}: ${e.message}`);
    }
  }
  if (errors.some((e) => /^(self|custom): HTTP 403/.test(e))) {
    throw new Error('Trang này chặn máy chủ của app (HTTP 403) — thử thêm proxy riêng trong "Cài đặt nguồn & proxy"');
  }
  throw new Error(`Không tải được trang (${errors.join('; ')})`);
}

// Chạy các tác vụ async với giới hạn số luồng song song.
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
