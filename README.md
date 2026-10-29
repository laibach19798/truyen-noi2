# Truyện Nói

Web nghe truyện audio: lấy truyện từ các trang khác (hoặc từ file TXT/EPUB/HTML) rồi đọc bằng giọng Edge TTS / giọng của trình duyệt, có highlight chữ, tự chuyển chương, điều khiển từ màn hình khoá và dịch AI cho truyện tiếng Trung.

## Lấy truyện từ trang khác

- **Tìm truyện** theo tên truyện hoặc tác giả, cùng lúc ở hai nơi:
  - trên các trang truyện có ô tìm kiếm kiểu TruyệnFull (`/tim-kiem/?tukhoa=`), mặc định truyenfull.vision và truyenhoan.com — không cần key, thêm/bớt trang trong "Cài đặt nguồn & proxy";
  - trên toàn web qua `api/search.js`: dùng Brave Search API nếu có biến môi trường `BRAVE_API_KEY` (https://api-dashboard.search.brave.com — từ 2026 có $5 tín dụng/tháng nhưng phải nhập thẻ), không có thì thử DuckDuckGo. DuckDuckGo thường chặn máy chủ Vercel (HTTP 403). Google và Cốc Cốc không có API tìm kiếm dùng được.
- **Dán link trang truyện** (trang có mục lục): app tải toàn bộ danh sách chương (kể cả nhiều trang mục lục), nội dung từng chương chỉ được tải khi cần và tải trước chương kế tiếp. Trang chỉ hiện vài chương nhưng link có dạng `/chuong-N` thì app tự dựng đủ mục lục.
- **Dán link một chương** bất kỳ: app tìm phần nội dung chính và lần theo nút "Chương sau" để đọc nối tiếp.
- **Tủ truyện**: truyện đã mở và chương đang nghe được lưu trong trình duyệt để nghe tiếp.

Bộ phân tích nằm trong `src/sources/`: có bộ chuyên cho giao diện TruyệnFull và bộ tổng quát (heuristic) cho các trang khác. Muốn hỗ trợ thêm một trang, thêm một adapter vào `src/sources/parsers.js`.

## Proxy CORS

Trình duyệt không cho đọc HTML trang khác trực tiếp, nên app gọi qua proxy:

1. `/api/proxy` của chính app (file `api/proxy.js`) — tự có khi chạy `npm start`, `npm run serve` hoặc deploy lên Vercel.
2. Proxy riêng do bạn nhập trong phần cài đặt (ví dụ một Cloudflare Worker).
3. Các proxy công cộng (allorigins, corsproxy.io, codetabs) — không ổn định, chỉ là phương án dự phòng.

## Giọng đọc Edge TTS và dịch

- `api/tts.py` và `api/translate.py` là hàm Python chạy trên Vercel (thư viện `edge-tts` ghi trong `requirements.txt`). Từ 10/2026 Microsoft chỉ nhận `edge-tts` >= 7.3.0, bản cũ bị lỗi 403.
- Dịch bằng Groq cần đặt biến môi trường `GROQ_API_KEY` trong Vercel (Settings → Environment Variables). Không có key thì dùng Google Translate.
- Khi app không có các hàm này (chạy `npm start` hoặc host tĩnh), app dùng server dự phòng trên Hugging Face.

## Chạy

```bash
npm install
npm start                        # dev, có sẵn /api/proxy
npm run build && npm run serve   # tự host bản build + proxy (PORT mặc định 3000)
npm test                         # test bộ phân tích
```

Lưu ý: nhiều trang truyện có chống bot (Cloudflare) hoặc tải nội dung bằng JavaScript; các trang đó có thể không lấy được qua proxy. Hãy tôn trọng điều khoản và bản quyền của trang nguồn.
