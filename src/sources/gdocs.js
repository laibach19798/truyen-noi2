// Đọc truyện từ Google Docs (tài liệu mở quyền "ai có link đều xem được"):
// tải bản văn bản thuần qua /export?format=txt rồi tách chương theo dòng "CHƯƠNG N: ...".
import { fetchHtml } from './fetcher';
import { parseHtml } from './parsers';

export const googleDocUrl = (id) => `https://docs.google.com/document/d/${id}/edit`;

// Dòng tiêu đề chương; cho phép tên truyện in hoa đứng trước trên cùng dòng ("TRO TÀN... CHƯƠNG 3: ...").
// Phần đứng trước phải in hoa, để câu văn kiểu "...nội dung chương 1. Nhân vật..." không bị coi là tiêu đề.
const CHAPTER_LINE = /^(?:(.{0,80}?)\s)?(chương|chapter|hồi)\s+(\d+)\s*(?:[:.\-–—]\s*(.*))?$/i;
const matchChapterLine = (line) => {
  const m = line.length < 200 && line.match(CHAPTER_LINE);
  if (!m || (m[1] && m[1] !== m[1].toUpperCase())) return null;
  return { number: m[3], name: (m[4] || '').trim() };
};
const VOLUME_LINE = /^(quyển|tập|phần)\s+\d+\b/i;

export function splitDocChapters(text) {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const chapters = [];
  let current = null;
  for (const raw of lines) {
    const line = raw.trim();
    const m = matchChapterLine(line);
    if (m) {
      current = { title: `Chương ${m.number}${m.name ? `: ${m.name}` : ''}`, lines: [] };
      chapters.push(current);
    } else if (current && !VOLUME_LINE.test(line)) {
      current.lines.push(line);
    }
  }
  const toContent = (ls) => ls.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const result = chapters
    .map((c) => ({ title: c.title, content: toContent(c.lines) }))
    .filter((c) => c.content);
  // Tài liệu không có tiêu đề chương: cả tài liệu là một chương.
  if (!result.length) {
    const content = toContent(lines.map((l) => l.trim()));
    return content ? [{ title: 'Toàn văn', content }] : [];
  }
  return result;
}

export async function loadGoogleDoc(id) {
  // Thêm mốc thời gian để proxy (máy chủ lưu tạm trang ~10 phút) luôn trả bản mới nhất của tài liệu.
  const { html: text } = await fetchHtml(`https://docs.google.com/document/d/${id}/export?format=txt&t=${Date.now()}`);
  // Tài liệu riêng tư: Google trả về trang đăng nhập (HTML) thay vì văn bản.
  if (/^\s*</.test(text)) throw new Error('Tài liệu chưa mở quyền "Bất kỳ ai có đường liên kết đều xem được"');
  const chapters = splitDocChapters(text);
  if (!chapters.length) throw new Error('Tài liệu trống');
  return chapters;
}

// ============ THƯ MỤC GOOGLE DRIVE ============
// Mỗi chương là một Google Docs riêng trong một thư mục công khai ("Bất kỳ ai có đường liên kết").
// Viết thêm một tệp chương mới vào thư mục thì lần cập nhật sau sẽ tự thấy; nội dung từng chương chỉ tải khi cần nghe.
export const driveFolderUrl = (id) => `https://drive.google.com/drive/folders/${id}`;
export const docExportUrl = (id) => `https://docs.google.com/document/d/${id}/export?format=txt`;
export const isGoogleDocExportUrl = (url) => /^https:\/\/docs\.google\.com\/document\/d\/[\w-]+\/export\?/.test(url || '');

// "Chương 01: Mực Tro" -> { n: 1, title: "Chương 1: Mực Tro" }; tiêu đề không theo mẫu thì n = null.
const readChapterTitle = (raw) => {
  const text = raw.trim();
  const m = matchChapterLine(text);
  return m
    ? { n: Number(m.number), title: `Chương ${Number(m.number)}${m.name ? `: ${m.name}` : ''}` }
    : { n: null, title: text };
};

// Đọc trang liệt kê thư mục (embeddedfolderview): chỉ lấy các Google Docs, xếp theo số chương.
export function parseDriveFolder(html) {
  const doc = parseHtml(html);
  const entries = [];
  doc.querySelectorAll('.flip-entry').forEach((el, i) => {
    const id = (el.id || '').replace(/^entry-/, '');
    const raw = el.querySelector('.flip-entry-title')?.textContent;
    const icon = el.querySelector('.flip-entry-list-icon img')?.getAttribute('src') || '';
    if (id && raw && icon.includes('google-apps.document')) entries.push({ id, i, ...readChapterTitle(raw) });
  });
  return entries
    .sort((a, b) => (a.n ?? Infinity) - (b.n ?? Infinity) || a.i - b.i)
    .map((e) => ({ title: e.title, url: docExportUrl(e.id) }));
}

export async function listDriveFolder(folderId) {
  // Mốc thời gian để proxy không trả bản danh sách cũ khi vừa thêm chương.
  const { html } = await fetchHtml(`https://drive.google.com/embeddedfolderview?id=${folderId}&t=${Date.now()}`);
  const chapters = parseDriveFolder(html);
  if (!chapters.length) throw new Error('Thư mục chưa có chương nào (hoặc chưa mở quyền "Bất kỳ ai có đường liên kết đều xem được")');
  return chapters;
}

// Đọc một chương (một Google Docs): { title, content, nextUrl } giống các nguồn khác.
export async function loadDriveChapter(url) {
  const { html: text } = await fetchHtml(`${url}&t=${Date.now()}`);
  if (/^\s*</.test(text)) throw new Error('Chương chưa mở quyền "Bất kỳ ai có đường liên kết đều xem được"');
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const first = lines.findIndex((l) => l.trim());
  const heading = first >= 0 && matchChapterLine(lines[first].trim());
  const body = (heading ? lines.slice(first + 1) : lines).map((l) => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { title: heading ? readChapterTitle(lines[first]).title : '', content: body, nextUrl: '' };
}
