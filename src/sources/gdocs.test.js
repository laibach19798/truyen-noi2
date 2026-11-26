import { splitDocChapters } from './gdocs';

test('tách chương theo tiêu đề, bỏ tên truyện và dòng "Quyển"', () => {
  const text = '﻿TẪN MỆNH LỤC\r\nQuyển 1: Rìa Sương Mù\r\nCHƯƠNG 1: XÁC CHẾT TRONG MƯA MUỐI\r\nĐoạn một.\r\n\r\n\r\n\r\nĐoạn hai.\r\nCHƯƠNG 2: LÁI BUÔN\r\nĐoạn ba, nhắc tới chương 1 trong câu.\r\n';
  expect(splitDocChapters(text)).toEqual([
    { title: 'Chương 1: XÁC CHẾT TRONG MƯA MUỐI', content: 'Đoạn một.\n\nĐoạn hai.' },
    { title: 'Chương 2: LÁI BUÔN', content: 'Đoạn ba, nhắc tới chương 1 trong câu.' },
  ]);
});

test('tên truyện đứng trước tiêu đề chương trên cùng dòng', () => {
  const chapters = splitDocChapters('TRO TÀN DƯỚI ĐÁY CỐC CHƯƠNG 3: BÀN LÀM VIỆC\nNội dung ba.\nCHƯƠNG 4: GIÓ NGƯỢC\nNội dung bốn.');
  expect(chapters.map((c) => c.title)).toEqual(['Chương 3: BÀN LÀM VIỆC', 'Chương 4: GIÓ NGƯỢC']);
});

test('tài liệu không có tiêu đề chương thành một chương', () => {
  expect(splitDocChapters('Một truyện ngắn.\nHết.')).toEqual([{ title: 'Toàn văn', content: 'Một truyện ngắn.\nHết.' }]);
  expect(splitDocChapters('  \n ')).toEqual([]);
});
