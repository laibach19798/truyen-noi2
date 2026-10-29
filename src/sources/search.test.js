const { parseDuckDuckGo, rankResults, buildQuery } = require('../../api/search');

const ddgHtml = `
<div class="result"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D1&amp;rut=x">Tiên Nghịch tập 1</a>
<a class="result__snippet" href="#">Video</a></div>
<div class="result"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fvi.wikipedia.org%2Fwiki%2FTi%C3%AAn_Ngh%E1%BB%8Bch&amp;rut=x">Tiên Nghịch – Wikipedia</a>
<a class="result__snippet" href="#">Bách khoa</a></div>
<div class="result"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fabc.example%2Fgioi-thieu%2F&amp;rut=x">Tiên Nghịch - Nhĩ Căn</a>
<a class="result__snippet" href="#">Giới thiệu</a></div>
<div class="result"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Ftruyen.example%2Ftien-nghich%2F&amp;rut=x">Đọc truyện <b>Tiên Nghịch</b> &amp; full</a>
<a class="result__snippet" href="#">Thuận vi phàm, nghịch tắc tiên</a></div>
<div class="result"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Ftruyen.example%2Ftien-nghich&amp;rut=x">Trùng lặp</a></div>`;

test('đọc kết quả DuckDuckGo và giải mã link chuyển hướng', () => {
  const results = parseDuckDuckGo(ddgHtml);
  expect(results).toHaveLength(5);
  expect(results[3]).toEqual({
    title: 'Đọc truyện Tiên Nghịch & full',
    url: 'https://truyen.example/tien-nghich/',
    description: 'Thuận vi phàm, nghịch tắc tiên',
  });
});

test('bỏ trang không phải truyện, bỏ trùng, đưa trang truyện lên đầu', () => {
  const ranked = rankResults(parseDuckDuckGo(ddgHtml));
  expect(ranked.map((r) => r.url)).toEqual(['https://truyen.example/tien-nghich/', 'https://abc.example/gioi-thieu/']);
  expect(ranked[0].host).toBe('truyen.example');
});

test('câu tìm kiếm theo tên truyện và theo tác giả', () => {
  expect(buildQuery('Tiên Nghịch', 'story')).toBe('Tiên Nghịch đọc truyện');
  expect(buildQuery('Nhĩ Căn', 'author')).toBe('truyện của tác giả Nhĩ Căn');
});
