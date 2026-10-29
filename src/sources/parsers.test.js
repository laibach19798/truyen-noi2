import { parseHtml, pickAdapter, truyenfullAdapter, genericAdapter, chapterNumber, htmlToText, fillSequentialChapters, normalizeOrder } from './parsers';

const STORY_URL = 'https://truyenfull.example/tien-nghich/';

const truyenfullStory = `
<html><head><title>Tiên Nghịch</title></head><body>
<div class="col-truyen-main">
  <div class="books"><div class="book"><img src="/cover.jpg"></div></div>
  <h3 class="title">Tiên Nghịch</h3>
  <div class="info"><a itemprop="author" href="/tac-gia/nhi-can/">Nhĩ Căn</a></div>
  <div class="desc-text">Thuận vi phàm, nghịch tắc tiên.<br>Chỉ ở trong điên đảo.</div>
  <div id="list-chapter">
    <ul class="list-chapter">
      <li><a href="/tien-nghich/chuong-1/" title="Chương 1: Ly hương">Chương 1: Ly hương</a></li>
      <li><a href="/tien-nghich/chuong-2/" title="Chương 2: Đạo">Chương 2: Đạo</a></li>
    </ul>
    <ul class="pagination">
      <li><a href="/tien-nghich/trang-2/#list-chapter">2</a></li>
      <li><a href="/tien-nghich/trang-41/#list-chapter">Cuối</a></li>
    </ul>
  </div>
</div></body></html>`;

const truyenfullChapter = `
<html><body>
<a class="truyen-title" href="/tien-nghich/">Tiên Nghịch</a>
<a class="chapter-title" href="/tien-nghich/chuong-1/">Chương 1: Ly hương</a>
<div id="chapter-c">Đoạn một của chương.<br><br>Đoạn hai của chương.
<div class="ads">Quảng cáo</div><script>alert(1)</script>
<p>Bạn đang đọc truyện tại truyenfull</p></div>
<a id="next_chap" href="/tien-nghich/chuong-2/">Chương sau</a>
</body></html>`;

const longText = 'Hắn ngồi im lặng nhìn ra ngoài cửa sổ, trong lòng suy nghĩ rất nhiều chuyện. '.repeat(10);
const genericChapter = `
<html><head><title>Chương 5 - Truyện ABC</title></head><body>
<nav><a href="/">Trang chủ</a><a href="/the-loai">Thể loại</a></nav>
<h1>Chương 5: Gặp gỡ</h1>
<div class="reader"><p>${longText}</p><p>${longText}</p></div>
<a href="/truyen-abc/chuong-4">Chương trước</a>
<a href="/truyen-abc/chuong-6">Chương sau</a>
</body></html>`;

const genericIndex = `
<html><head><meta property="og:title" content="Truyện ABC"></head><body>
<ul>
  <li><a href="/truyen-abc/chuong-3">Chương 3</a></li>
  <li><a href="/truyen-abc/chuong-2">Chương 2</a></li>
  <li><a href="/truyen-abc/chuong-1">Chương 1</a></li>
  <li><a href="https://other.site/chuong-9">Chương 9</a></li>
</ul></body></html>`;

test('trang truyện TruyệnFull: thông tin, mục lục và phân trang', () => {
  const doc = parseHtml(truyenfullStory);
  expect(pickAdapter(doc)).toBe(truyenfullAdapter);
  expect(truyenfullAdapter.isStoryPage(doc)).toBe(true);
  const info = truyenfullAdapter.parseStory(doc, STORY_URL);
  expect(info.title).toBe('Tiên Nghịch');
  expect(info.author).toBe('Nhĩ Căn');
  expect(info.cover).toBe('https://truyenfull.example/cover.jpg');
  expect(info.chapters).toEqual([
    { title: 'Chương 1: Ly hương', url: 'https://truyenfull.example/tien-nghich/chuong-1/' },
    { title: 'Chương 2: Đạo', url: 'https://truyenfull.example/tien-nghich/chuong-2/' },
  ]);
  expect(info.pageUrls).toHaveLength(40);
  expect(info.pageUrls[0]).toBe('https://truyenfull.example/tien-nghich/trang-2/#list-chapter');
});

test('trang chương TruyệnFull: nội dung sạch và link chương sau', () => {
  const doc = parseHtml(truyenfullChapter);
  const url = 'https://truyenfull.example/tien-nghich/chuong-1/';
  expect(truyenfullAdapter.isStoryPage(doc)).toBe(false);
  const ch = truyenfullAdapter.parseChapter(doc, url);
  expect(ch.title).toBe('Chương 1: Ly hương');
  expect(ch.content).toBe('Đoạn một của chương.\n\nĐoạn hai của chương.');
  expect(ch.nextUrl).toBe('https://truyenfull.example/tien-nghich/chuong-2/');
  expect(ch.storyTitle).toBe('Tiên Nghịch');
});

test('trang chương bất kỳ: tìm nội dung chính và nút chương sau', () => {
  const doc = parseHtml(genericChapter);
  const url = 'https://abc.example/truyen-abc/chuong-5';
  expect(pickAdapter(doc)).toBe(genericAdapter);
  expect(genericAdapter.isStoryPage(doc, url)).toBe(false);
  const ch = genericAdapter.parseChapter(doc, url);
  expect(ch.title).toBe('Chương 5: Gặp gỡ');
  expect(ch.content).toContain('Hắn ngồi im lặng');
  expect(ch.content).not.toContain('Trang chủ');
  expect(ch.nextUrl).toBe('https://abc.example/truyen-abc/chuong-6');
});

test('mục lục bất kỳ: lọc link khác trang và đảo thứ tự mới-nhất-trước', () => {
  const doc = parseHtml(genericIndex);
  const url = 'https://abc.example/truyen-abc';
  expect(genericAdapter.isStoryPage(doc, url)).toBe(true);
  const info = genericAdapter.parseStory(doc, url);
  expect(info.title).toBe('Truyện ABC');
  expect(info.chapters.map((c) => c.title)).toEqual(['Chương 1', 'Chương 2', 'Chương 3']);
});

test('số chương tiếng Việt, tiếng Anh, tiếng Trung', () => {
  expect(chapterNumber('Chương 12: abc')).toBe(12);
  expect(chapterNumber('Chapter 7')).toBe(7);
  expect(chapterNumber('第一百二十三章 回家')).toBe(123);
  expect(chapterNumber('第45章')).toBe(45);
  expect(chapterNumber('Lời mở đầu')).toBeNull();
});

test('htmlToText giữ ngắt đoạn', () => {
  const doc = parseHtml('<div id="x"><p>Một</p><p>Hai <b>ba</b></p>Bốn<br>Năm</div>');
  expect(htmlToText(doc.querySelector('#x'))).toBe('Một\n\nHai ba\n\nBốn\n\nNăm');
});

test('dựng lại đủ mục lục khi trang chỉ hiện vài chương /chuong-N', () => {
  const doc = parseHtml(`<a href="/truyen/abc/chuong-1">Đọc từ đầu</a><a href="/truyen/abc/chuong-500">Chương mới nhất</a>
    <a href="/truyen/abc/chuong-500"></a><a href="/truyen/abc/chuong-499"></a><a href="/truyen/abc/chuong-2">Chương 2: Tên thật</a>`);
  const list = genericAdapter.parseChapterList(doc, 'https://abc.example/truyen/abc');
  expect(list).toHaveLength(500);
  expect(list[0]).toEqual({ title: 'Chương 1', url: 'https://abc.example/truyen/abc/chuong-1' });
  expect(list[1].title).toBe('Chương 2: Tên thật');
  expect(list[499].title).toBe('Chương 500');
  expect(normalizeOrder(list)[0].title).toBe('Chương 1');
  expect(list[249]).toEqual({ title: 'Chương 250', url: 'https://abc.example/truyen/abc/chuong-250', synthetic: true });
  expect(fillSequentialChapters([{ title: 'Chương 1', url: 'https://x.example/a-hash' }])).toHaveLength(1);
});

test('bỏ dòng điều hướng lẫn trong nội dung chương', () => {
  const doc = parseHtml('<div id="x"><p>← Chương trước | Chương sau →</p><p>Chương 2092 / 1,876</p><p>Hắn chưa từng nghĩ chương sau sẽ thế nào.</p></div>');
  expect(htmlToText(doc.querySelector('#x'))).toBe('Hắn chưa từng nghĩ chương sau sẽ thế nào.');
});

test('phân trang /page/N và khung chương mới nhất lẫn trong mục lục', () => {
  const doc = parseHtml(`<div id="list-chapter"><ul class="list-chapter">
    <li><a href="/t/abc/chuong-99">Chương 99: Mới</a></li><li><a href="/t/abc/chuong-1">Chương 1: Đầu</a></li>
    <li><a href="/t/abc/chuong-2">Chương 2</a></li></ul>
    <ul class="pagination"><li><a href="https://s.example/t/abc/page/2">2</a></li><li><a href="https://s.example/t/abc/page/5">Cuối</a></li></ul></div>`);
  const info = truyenfullAdapter.parseStory(doc, 'https://s.example/t/abc');
  expect(info.pageUrls).toEqual([2, 3, 4, 5].map((n) => `https://s.example/t/abc/page/${n}`));
  expect(info.chapters.map((c) => c.title)).toEqual(['Chương 99: Mới', 'Chương 1: Đầu', 'Chương 2']);
  expect(normalizeOrder(info.chapters).map((c) => c.title)).toEqual(['Chương 1: Đầu', 'Chương 2', 'Chương 99: Mới']);
});

test('kết quả tìm kiếm TruyệnFull bỏ khung truyện hot bên cạnh', () => {
  const doc = parseHtml(`<div class="list list-truyen col-xs-12">
    <div class="row" itemscope><div data-image="https://img.example/a.jpg"></div><h3 class="truyen-title"><a href="https://tf.example/tien-nghich-chi-hau/">Tiên Nghịch Chi Hậu</a></h3><span class="author">Trần Mộc</span></div></div>
    <div class="list list-truyen list-side col-xs-12"><div class="row top-item"><h3><a href="https://tf.example/than-dao/">Thần Đạo Đan Tôn</a></h3></div></div>`);
  const results = truyenfullAdapter.parseSearch(doc, 'https://tf.example/tim-kiem/');
  expect(results).toHaveLength(1);
  expect(results[0]).toMatchObject({ title: 'Tiên Nghịch Chi Hậu', author: 'Trần Mộc', cover: 'https://img.example/a.jpg' });
});

test('bỏ ký tự vô hình chống sao chép', () => {
  const doc = parseHtml('<div id="x"><p>bát‍​‌‌ngát﻿ mênh­mông</p></div>');
  expect(htmlToText(doc.querySelector('#x'))).toBe('bátngát mênhmông');
});
