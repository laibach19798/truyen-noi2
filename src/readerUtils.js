// Hàm thuần cho màn hình đọc (Reader.js): tách đoạn, ước lượng thời gian đọc, lưu cài đặt / vị trí.

export const READER_THEMES = {
  paper: { label: 'Giấy', bg: '#f4ecd8', text: '#3b3226', muted: '#8a7b63', bar: '#ebe1c8', line: '#d9cdb0', accent: '#b45309', hl: 'rgba(180,83,9,0.28)', dim: '#a89a80' },
  light: { label: 'Sáng', bg: '#ffffff', text: '#1f2937', muted: '#6b7280', bar: '#f3f4f6', line: '#e5e7eb', accent: '#c2410c', hl: 'rgba(234,88,12,0.22)', dim: '#9ca3af' },
  dark: { label: 'Tối', bg: '#1e232b', text: '#d4d8de', muted: '#8b94a1', bar: '#272d37', line: '#364050', accent: '#fbbf24', hl: 'rgba(251,191,36,0.30)', dim: '#6b7280' },
  black: { label: 'Đen', bg: '#000000', text: '#b8bcc4', muted: '#6b7280', bar: '#111418', line: '#262b33', accent: '#f59e0b', hl: 'rgba(245,158,11,0.30)', dim: '#4b5563' },
};

export const READER_FONTS = {
  // Georgia thiếu các chữ tiếng Việt hai dấu (ấ, ắ, ế, ầ...) nên dấu bị rời khỏi chữ; Literata (tải từ Google Fonts,
  // xem public/index.html) hỗ trợ đủ tiếng Việt. Phông dự phòng đều có chữ Việt.
  serif: { label: 'Có chân', family: '"Literata", "Noto Serif", "Times New Roman", Cambria, serif' },
  sans: { label: 'Không chân', family: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
};

export const READER_WIDTHS = { narrow: { label: 'Hẹp', max: 560 }, medium: { label: 'Vừa', max: 680 }, wide: { label: 'Rộng', max: 860 } };

export const DEFAULT_READER_PREFS = {
  fontSize: 21, lineHeight: 1.85, font: 'serif', width: 'medium', align: 'left', theme: 'paper', keepAwake: true,
};

const PREFS_KEY = 'readerPrefs';
const POS_PREFIX = 'readerPos:';

export function readPrefs(darkMode = false) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch (e) {}
  const prefs = { ...DEFAULT_READER_PREFS, ...(darkMode && !saved.theme ? { theme: 'dark' } : {}), ...saved };
  // Giá trị lạ (từ bản cũ / sửa tay) thì quay về mặc định.
  if (!READER_THEMES[prefs.theme]) prefs.theme = DEFAULT_READER_PREFS.theme;
  if (!READER_FONTS[prefs.font]) prefs.font = DEFAULT_READER_PREFS.font;
  if (!READER_WIDTHS[prefs.width]) prefs.width = DEFAULT_READER_PREFS.width;
  prefs.fontSize = clamp(Number(prefs.fontSize) || DEFAULT_READER_PREFS.fontSize, 15, 40);
  prefs.lineHeight = clamp(Number(prefs.lineHeight) || DEFAULT_READER_PREFS.lineHeight, 1.4, 2.4);
  return prefs;
}

export function savePrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {}
}

// Vị trí đọc: chương nào, đã cuộn tới bao nhiêu phần (0..1). Mỗi truyện lưu một vị trí.
export function readPosition(storyKey) {
  try {
    const p = JSON.parse(localStorage.getItem(POS_PREFIX + storyKey) || 'null');
    return p && Number.isFinite(p.i) && Number.isFinite(p.r) ? p : null;
  } catch (e) { return null; }
}

export function savePosition(storyKey, chapterIndex, ratio) {
  try { localStorage.setItem(POS_PREFIX + storyKey, JSON.stringify({ i: chapterIndex, r: clamp(ratio, 0, 1) })); } catch (e) {}
}

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export const splitParagraphs = (text) => (text || '').split(/\n+/).map((p) => p.trim()).filter(Boolean);

// Tốc độ đọc thầm ~220 từ/phút (tiếng Việt, tính theo âm tiết cách nhau bằng khoảng trắng).
export const countWords = (text) => (text ? (text.match(/\S+/g) || []).length : 0);
export const minutesToRead = (words) => Math.max(1, Math.round(words / 220));

// Số phút còn lại khi đã đọc `ratio` của chương; null nếu chưa có chữ.
export function minutesLeft(words, ratio) {
  if (!words) return null;
  const left = Math.ceil((words * (1 - clamp(ratio, 0, 1))) / 220);
  return left;
}

// ============ ĐỌC + NGHE TRONG MỘT MÀN HÌNH ============
// Trình phát chia chương thành các đoạn (chunk) rồi thành "từ" (kể cả khoảng trắng); chỉ số từ toàn chương dùng để tô sáng.
// buildParagraphs dựng lại đoạn văn từ danh sách từ đó, giữ nguyên chỉ số để tô sáng đúng chỗ.
//  - tokens: các từ của cả chương, nối theo thứ tự các chunk
//  - breakStarts: chỉ số từ mở đầu một chunk mà chunk trước kết thúc ở cuối đoạn văn (xuống đoạn mới)
//  - softStarts: chỉ số từ mở đầu một chunk tách giữa chừng một đoạn dài (chỉ thêm một dấu cách)
// Trả về mảng đoạn; mỗi đoạn là mảng { t: chữ, i: chỉ số từ (-1 nếu chỉ là dấu cách thêm vào) }.
export function buildParagraphs(tokens, breakStarts = new Set(), softStarts = new Set()) {
  const paragraphs = [];
  let cur = [];
  const flush = () => { if (cur.length) paragraphs.push(cur); cur = []; };
  tokens.forEach((t, i) => {
    if (i > 0 && breakStarts.has(i)) flush();
    if (i > 0 && softStarts.has(i)) cur.push({ t: ' ', i: -1 });
    if (/^\s+$/.test(t) && t.includes('\n')) { flush(); return; }
    cur.push({ t, i });
  });
  flush();
  return paragraphs;
}

// Chunk chứa từ số `wordIndex` (chunkOffsets[k] là chỉ số từ đầu tiên của chunk k).
export function chunkOfWord(chunkOffsets, wordIndex) {
  let k = 0;
  for (let j = 0; j < chunkOffsets.length; j++) {
    if (chunkOffsets[j] <= wordIndex) k = j; else break;
  }
  return k;
}
