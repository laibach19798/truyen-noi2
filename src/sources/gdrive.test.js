import { parseDriveFolder, docExportUrl } from './gdocs';

const entry = (id, title, type = 'document') =>
  `<div class="flip-entry" id="entry-${id}"><div class="flip-entry-info"><a href="#"><div class="flip-entry-list-icon"><img src="https://drive-thirdparty.googleusercontent.com/16/type/application/vnd.google-apps.${type}" alt=""/></div><div class="flip-entry-title">${title}</div></a></div></div>`;

test('liệt kê thư mục: chỉ lấy Google Docs, xếp theo số chương, chuẩn hoá tiêu đề', () => {
  const html = '<html><body>' + [
    entry('bbb', 'Chương 10: Vết Bầm'),
    entry('ccc', 'Ghi chú', 'spreadsheet'),
    entry('aaa', 'Chương 02: Tro Lạnh'),
    entry('ddd', 'Dàn ý'),
    entry('eee', 'Chương 01: Mực Tro'),
  ].join('') + '</body></html>';
  expect(parseDriveFolder(html)).toEqual([
    { title: 'Chương 1: Mực Tro', url: docExportUrl('eee') },
    { title: 'Chương 2: Tro Lạnh', url: docExportUrl('aaa') },
    { title: 'Chương 10: Vết Bầm', url: docExportUrl('bbb') },
    { title: 'Dàn ý', url: docExportUrl('ddd') },
  ]);
});

test('thư mục không có tài liệu', () => {
  expect(parseDriveFolder('<html><body></body></html>')).toEqual([]);
});
