// Đọc truyện từ Google Docs (tài liệu mở quyền "ai có link đều xem được"):
// tải bản văn bản thuần qua /export?format=txt rồi tách chương theo dòng "CHƯƠNG N: ...".
import { fetchHtml } from './fetcher';

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
