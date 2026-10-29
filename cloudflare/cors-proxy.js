// Proxy CORS chạy trên Cloudflare Workers (miễn phí) — dùng khi trang truyện chặn máy chủ Vercel.
// Cách dùng: dán file này vào một Worker mới, deploy, rồi nhập vào app
// ("Cài đặt nguồn & proxy" → "Proxy CORS riêng"): https://<tên-worker>.<tài-khoản>.workers.dev/?url={url}
const MAX_BYTES = 5 * 1024 * 1024;

const isPrivateHost = (h) =>
  /^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(h);

export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'X-Final-Url',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    let url;
    try { url = new URL(new URL(request.url).searchParams.get('url')); } catch (e) { url = null; }
    if (!url || !/^https?:$/.test(url.protocol) || isPrivateHost(url.hostname)) {
      return new Response('URL không hợp lệ', { status: 400, headers: cors });
    }

    const upstream = await fetch(url.href, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TruyenNoi/1.0; +https://github.com/laibach19798/truyen-noi2)',
        'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'vi,en;q=0.8,zh;q=0.6',
      },
    });
    const body = await upstream.arrayBuffer();
    if (body.byteLength > MAX_BYTES) return new Response('Trang quá lớn', { status: 502, headers: cors });

    return new Response(body, {
      status: upstream.status,
      headers: {
        ...cors,
        'Content-Type': upstream.headers.get('content-type') || 'text/html',
        'X-Final-Url': upstream.url,
        'Cache-Control': 'public, max-age=300',
      },
    });
  },
};
