// Truyện sáng tác lưu ngay trong app: public/truyen/index.json liệt kê các truyện,
// mỗi truyện có public/truyen/<slug>/chapters.json và các chương NNNN.txt
// (dòng đầu "Chương N: Tên", các đoạn cách nhau một dòng trống).

const BASE = `${process.env.PUBLIC_URL || ''}/truyen`;

export const isLocalUrl = (url) => typeof url === 'string' && url.startsWith(`${BASE}/`);

const getJson = async (url) => {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export async function listLocalStories() {
  const data = await getJson(`${BASE}/index.json`);
  return data.stories || [];
}

const pad = (n) => String(n).padStart(4, '0');

export async function loadLocalStory(entry) {
  const data = await getJson(`${BASE}/${entry.slug}/chapters.json`);
  const chapters = (data.chapters || []).map((c) => ({
    title: `Chương ${c.n}: ${c.title}`,
    url: `${BASE}/${entry.slug}/${pad(c.n)}.txt`,
  }));
  if (!chapters.length) throw new Error('Truyện chưa có chương nào');
  return {
    story: {
      title: entry.title,
      author: entry.author || '',
      cover: entry.cover || '',
      description: entry.description || '',
      sourceUrl: `${BASE}/${entry.slug}/`,
      mode: 'local',
      site: 'local',
      slug: entry.slug,
    },
    chapters,
  };
}

// Đọc một chương: { title, content, nextUrl } giống các nguồn web.
export async function loadLocalChapter(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = (await res.text()).replace(/\r\n/g, '\n').trim();
  const nl = text.indexOf('\n');
  const title = nl > 0 ? text.slice(0, nl).trim() : '';
  const content = (nl > 0 ? text.slice(nl + 1) : text)
    .replace(/^\s*\*\s*\*\s*\*\s*$/gm, '') // dấu ngắt cảnh: không đọc thành tiếng
    .replace(/\*([^*\n]+)\*/g, '$1') // bỏ dấu in nghiêng
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title, content, nextUrl: '' };
}
