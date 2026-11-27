import {
  splitParagraphs, countWords, minutesToRead, minutesLeft, readPrefs, savePrefs, readPosition, savePosition, DEFAULT_READER_PREFS,
} from './readerUtils';

beforeEach(() => localStorage.clear());

test('tách đoạn, bỏ dòng trống', () => {
  expect(splitParagraphs('Một.\n\n  Hai.  \n\n\nBa.')).toEqual(['Một.', 'Hai.', 'Ba.']);
  expect(splitParagraphs('')).toEqual([]);
});

test('ước lượng thời gian đọc', () => {
  expect(countWords('một hai  ba\nbốn')).toBe(4);
  expect(minutesToRead(0)).toBe(1);
  expect(minutesToRead(2200)).toBe(10);
  expect(minutesLeft(2200, 0)).toBe(10);
  expect(minutesLeft(2200, 0.5)).toBe(5);
  expect(minutesLeft(2200, 1)).toBe(0);
  expect(minutesLeft(0, 0.3)).toBeNull();
});

test('cài đặt: mặc định, theo chế độ tối, và bỏ giá trị lạ', () => {
  expect(readPrefs()).toEqual(DEFAULT_READER_PREFS);
  expect(readPrefs(true).theme).toBe('dark');
  savePrefs({ theme: 'black', fontSize: 99, font: 'comic', width: 'wide' });
  const p = readPrefs(true);
  expect(p.theme).toBe('black');
  expect(p.fontSize).toBe(40);
  expect(p.font).toBe(DEFAULT_READER_PREFS.font);
  expect(p.width).toBe('wide');
});

test('nhớ vị trí đọc theo truyện', () => {
  expect(readPosition('a')).toBeNull();
  savePosition('a', 7, 0.42);
  savePosition('b', 1, 2);
  expect(readPosition('a')).toEqual({ i: 7, r: 0.42 });
  expect(readPosition('b')).toEqual({ i: 1, r: 1 });
});
