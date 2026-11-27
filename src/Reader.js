import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ArrowLeft, List, Type, Play, Pause, Loader, X, RefreshCw } from 'lucide-react';
import {
  READER_THEMES, READER_FONTS, READER_WIDTHS, DEFAULT_READER_PREFS,
  readPrefs, savePrefs, readPosition, savePosition, splitParagraphs, buildParagraphs, countWords, minutesToRead, minutesLeft, clamp,
} from './readerUtils';

// Giao diện (thanh công cụ, nút) luôn dùng phông hệ thống, chỉ phần chữ truyện đổi kiểu theo cài đặt.
const UI_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// Một đoạn văn. Mỗi từ là một <span data-w=chỉ số> để tô sáng từ đang đọc và để tìm vị trí trên màn hình.
// memo: khi từ đang đọc nhảy sang từ khác chỉ đoạn chứa từ đó (và đoạn vừa đọc xong) được vẽ lại.
const Paragraph = React.memo(function Paragraph({ tokens, active, done, hl, dim, align }) {
  return (
    <p style={{ margin: '0 0 0.85em', textAlign: align, color: done ? dim : undefined }}>
      {tokens.map((tk, k) => (tk.i < 0
        ? tk.t
        : <span key={k} data-w={tk.i} style={tk.i === active ? { background: hl, borderRadius: 4, boxShadow: `0 0 0 2px ${hl}` } : undefined}>{tk.t}</span>))}
    </p>
  );
});

// Màn hình đọc toàn khung hình, vừa đọc vừa nghe: chữ lớn, 4 nền, thanh công cụ tự ẩn khi cuộn, nhớ vị trí đọc,
// nút phát giọng đọc ở thanh dưới; khi nghe, từ đang đọc được tô sáng và trang tự cuộn theo.
export default function Reader({
  storyKey, storyTitle, chapters, chapterIndex, text, words, breakStarts, softStarts, waiting, waitingLabel,
  darkMode, onPrev, onNext, onSelectChapter, onExit, onRefresh, message, onDismissMessage, audio,
}) {
  const [prefs, setPrefs] = useState(() => readPrefs(darkMode));
  const [bars, setBars] = useState(true);
  const [panel, setPanel] = useState(null); // null | 'settings' | 'chapters'
  const [ratio, setRatio] = useState(0);
  const [toast, setToast] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const scrollRef = useRef(null);
  const activeItemRef = useRef(null);
  const lastTop = useRef(0);
  const lastSave = useRef(0);
  const userScrollUntil = useRef(0); // đang tự cuộn tay thì tạm dừng tự cuộn theo giọng đọc
  const readyKey = useRef(''); // chương đã khôi phục vị trí xong; chỉ khi đó mới lưu vị trí
  const latest = useRef({});

  const t = READER_THEMES[prefs.theme];
  const font = READER_FONTS[prefs.font];
  const wordCount = useMemo(() => countWords(text), [text]);
  const paragraphs = useMemo(() => {
    if (words?.length) {
      return buildParagraphs(words, breakStarts, softStarts).map((tokens) => {
        const idx = tokens.filter((x) => x.i >= 0).map((x) => x.i);
        return { tokens, first: idx[0] ?? -1, last: idx[idx.length - 1] ?? -1 };
      });
    }
    return splitParagraphs(text).map((p) => ({ tokens: [{ t: p, i: -1 }], first: -1, last: -1 }));
  }, [words, breakStarts, softStarts, text]);
  const hasText = paragraphs.length > 0;
  const total = chapters.length;
  const chapter = chapters[chapterIndex] || {};
  const next = chapters[chapterIndex + 1];
  const left = minutesLeft(wordCount, ratio);
  const playing = !!audio?.playing;
  const current = audio?.currentWordIndex ?? -1;

  const update = (patch) => setPrefs((p) => { const n = { ...p, ...patch }; savePrefs(n); return n; });

  useEffect(() => { latest.current = { storyKey, chapterIndex, ratio }; });

  // Khoá cuộn trang phía sau trong lúc đọc.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Màu thanh trạng thái điện thoại theo nền đang đọc.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    const old = meta?.getAttribute('content');
    meta?.setAttribute('content', t.bg);
    return () => { if (old) meta?.setAttribute('content', old); };
  }, [t.bg]);

  // Giữ màn hình sáng khi đọc.
  useEffect(() => {
    if (!prefs.keepAwake || !('wakeLock' in navigator)) return undefined;
    let lock = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) lock.release().catch(() => {});
      } catch (e) {}
    };
    const onVisible = () => { if (document.visibilityState === 'visible') acquire(); };
    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, [prefs.keepAwake]);

  // Đổi chương: về đầu chương (hoặc khôi phục vị trí đã lưu khi mới mở truyện) ngay khi có chữ.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!hasText) {
      el.scrollTop = 0;
      readyKey.current = '';
      setRatio(0);
      setBars(true);
      return;
    }
    const key = `${storyKey}#${chapterIndex}`;
    if (readyKey.current === key) return;
    readyKey.current = key;
    const saved = readPosition(storyKey);
    const max = el.scrollHeight - el.clientHeight;
    const r = saved && saved.i === chapterIndex ? saved.r : 0;
    el.scrollTop = r * Math.max(0, max);
    lastTop.current = el.scrollTop;
    setRatio(r);
    savePosition(storyKey, chapterIndex, r);
  }, [storyKey, chapterIndex, hasText]);

  // Lưu vị trí lần cuối khi rời màn hình đọc.
  useEffect(() => () => {
    const { storyKey: k, chapterIndex: i, ratio: r } = latest.current;
    if (readyKey.current) savePosition(k, i, r);
  }, []);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollTop;
    const r = clamp(top / Math.max(1, el.scrollHeight - el.clientHeight), 0, 1);
    setRatio(r);
    const dy = top - lastTop.current;
    if (Math.abs(dy) > 14) {
      // Đang nghe thì giữ thanh dưới (có nút phát) hiện, vì trang tự cuộn theo giọng đọc.
      if (dy > 0 && top > 90 && !playing) setBars(false);
      else if (dy < 0) setBars(true);
      lastTop.current = top;
    }
    const now = Date.now();
    if (readyKey.current && now - lastSave.current > 500) {
      lastSave.current = now;
      savePosition(storyKey, chapterIndex, r);
    }
  };

  const noteUserScroll = () => { userScrollUntil.current = Date.now() + 5000; };

  // Tự cuộn theo từ đang đọc: chỉ cuộn khi từ đó sắp ra khỏi vùng nhìn thấy, và không cuộn khi bạn đang tự cuộn.
  useEffect(() => {
    if (!audio?.autoScroll || !playing || current < 0) return;
    if (Date.now() < userScrollUntil.current) return;
    const el = scrollRef.current;
    const word = el?.querySelector(`[data-w="${current}"]`);
    if (!word) return;
    const box = el.getBoundingClientRect();
    const r = word.getBoundingClientRect();
    const topLimit = box.top + 90;
    const bottomLimit = box.bottom - 170;
    if (r.top < topLimit || r.bottom > bottomLimit) {
      el.scrollTo({ top: el.scrollTop + (r.top - box.top) - box.height * 0.32, behavior: 'smooth' });
    }
  }, [current, playing, audio?.autoScroll]);

  // Từ đầu và cuối đang hiện trên màn hình (tìm nhị phân trên các <span data-w>, đã xếp theo thứ tự trang).
  const getView = () => {
    const el = scrollRef.current;
    if (!el) return null;
    const spans = el.querySelectorAll('[data-w]');
    if (!spans.length) return null;
    const box = el.getBoundingClientRect();
    const topEdge = box.top + 80;
    const bottomEdge = box.bottom - 150;
    let lo = 0;
    let hi = spans.length - 1;
    while (lo < hi) { // từ đầu tiên có đáy dưới mép trên
      const mid = (lo + hi) >> 1;
      if (spans[mid].getBoundingClientRect().bottom > topEdge) hi = mid; else lo = mid + 1;
    }
    const first = lo;
    lo = first;
    hi = spans.length - 1;
    while (lo < hi) { // từ cuối cùng có đỉnh trên mép dưới
      const mid = (lo + hi + 1) >> 1;
      if (spans[mid].getBoundingClientRect().top < bottomEdge) lo = mid; else hi = mid - 1;
    }
    return { first: Number(spans[first].dataset.w), last: Number(spans[lo].dataset.w) };
  };

  // Chạm vào chữ để ẩn / hiện thanh công cụ (không tính khi đang bôi đen chữ hoặc bấm nút).
  const onTap = (e) => {
    if (panel) { setPanel(null); return; }
    if (e.target.closest('button, a, input')) return;
    if (String(window.getSelection?.() || '')) return;
    setBars((b) => !b);
  };

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast((cur) => (cur === msg ? '' : cur)), 2500);
  }, []);

  const refresh = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    const added = await onRefresh();
    setRefreshing(false);
    showToast(added > 0 ? `Có ${added} chương mới` : added === 0 ? 'Chưa có chương mới' : 'Không kiểm tra được, thử lại sau');
  };

  // Phím mũi tên trái / phải đổi chương (máy tính).
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea')) return;
      if (e.key === 'ArrowRight') onNext();
      else if (e.key === 'ArrowLeft') onPrev();
      else if (e.key === 'Escape') setPanel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNext, onPrev]);

  useEffect(() => {
    if (panel === 'chapters') activeItemRef.current?.scrollIntoView({ block: 'center' });
  }, [panel]);

  const barsShown = bars || !!panel;
  const barStyle = { position: 'absolute', left: 0, right: 0, background: t.bar, color: t.text, transition: 'transform 220ms ease', zIndex: 5 };
  const iconBtn = { width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, background: 'transparent', color: 'inherit', border: 'none', flexShrink: 0 };
  const chip = (active) => ({
    flex: 1, padding: '10px 6px', borderRadius: 10, fontSize: 14, fontWeight: 600, border: `1.5px solid ${active ? t.accent : t.line}`,
    background: active ? t.accent : 'transparent', color: active ? t.bg : t.text,
  });
  const sectionLabel = { fontSize: 12, color: t.muted, marginBottom: 6, display: 'flex', justifyContent: 'space-between' };
  const block = { marginBottom: 16 };
  const switchRow = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', fontSize: 15 };
  const checkbox = { width: 22, height: 22, accentColor: t.accent };
  const noteText = message?.text || toast;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, background: t.bg, color: t.text, fontFamily: font.family }}>
      {/* Thanh tiến độ chương */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, zIndex: 8, background: t.line }}>
        <div style={{ height: '100%', width: `${ratio * 100}%`, background: t.accent }} />
      </div>

      {/* Thanh trên */}
      <div style={{ ...barStyle, top: 0, paddingTop: 'env(safe-area-inset-top)', transform: barsShown ? 'none' : 'translateY(-110%)', boxShadow: `0 1px 0 ${t.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '6px 6px', gap: 2, fontFamily: UI_FONT }}>
          <button style={iconBtn} onClick={onExit} aria-label="Về trang chủ"><ArrowLeft size={22} /></button>
          <div style={{ flex: 1, minWidth: 0, textAlign: 'center', lineHeight: 1.25 }}>
            <div style={{ fontSize: 11, color: t.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{storyTitle}</div>
            <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chapter.title}</div>
          </div>
          <button style={iconBtn} onClick={() => setPanel(panel === 'chapters' ? null : 'chapters')} aria-label="Danh sách chương"><List size={22} /></button>
          <button style={iconBtn} onClick={() => setPanel(panel === 'settings' ? null : 'settings')} aria-label="Cài đặt đọc và nghe"><Type size={22} /></button>
        </div>
      </div>

      {/* Nội dung chương */}
      <div ref={scrollRef} onScroll={onScroll} onClick={onTap} onTouchStart={noteUserScroll} onWheel={noteUserScroll}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
        <div style={{
          maxWidth: READER_WIDTHS[prefs.width].max, margin: '0 auto',
          padding: 'calc(76px + env(safe-area-inset-top)) 20px calc(160px + env(safe-area-inset-bottom))',
          fontSize: prefs.fontSize, lineHeight: prefs.lineHeight, overflowWrap: 'anywhere',
        }}>
          <h2 style={{ fontSize: '1.2em', lineHeight: 1.35, fontWeight: 700, color: t.accent, margin: '0 0 6px' }}>{chapter.title}</h2>
          {hasText && (
            <div style={{ fontSize: 13, lineHeight: 1.4, color: t.muted, marginBottom: '1.4em', fontFamily: UI_FONT }}>
              Chương {chapterIndex + 1}/{total} • ~{minutesToRead(wordCount)} phút đọc
            </div>
          )}
          {!hasText && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '60px 0', color: t.muted, fontSize: 16, fontFamily: UI_FONT }}>
              {waiting && <Loader size={20} className="animate-spin" />} {waiting ? (waitingLabel || 'Đang tải chương...') : 'Chương trống'}
            </div>
          )}
          {paragraphs.map((p, i) => (
            <Paragraph key={i} tokens={p.tokens} align={prefs.align} hl={t.hl} dim={t.dim}
              active={current >= p.first && current <= p.last && p.first >= 0 ? current : -1}
              done={current >= 0 && p.last >= 0 && p.last < current} />
          ))}

          {hasText && (
            <div style={{ marginTop: '2.2em', paddingTop: '1.4em', borderTop: `1px solid ${t.line}`, textAlign: 'center', fontFamily: UI_FONT }}>
              <div style={{ fontSize: 14, color: t.muted, marginBottom: 14 }}>
                {next ? `Hết chương ${chapterIndex + 1}` : 'Bạn đã đọc hết các chương hiện có'}
              </div>
              {next ? (
                <button onClick={onNext} style={{ width: '100%', padding: '16px 14px', borderRadius: 14, border: 'none', background: t.accent, color: t.bg, fontSize: 16, fontWeight: 700 }}>
                  Chương tiếp: {next.title} →
                </button>
              ) : onRefresh && (
                <button onClick={refresh} disabled={refreshing} style={{ width: '100%', padding: '16px 14px', borderRadius: 14, border: 'none', background: t.accent, color: t.bg, fontSize: 16, fontWeight: 700, opacity: refreshing ? 0.6 : 1 }}>
                  <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 8 }} />
                  Kiểm tra chương mới
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Thanh dưới: tiến độ + chuyển chương + nút nghe */}
      <div style={{ ...barStyle, bottom: 0, paddingBottom: 'env(safe-area-inset-bottom)', transform: barsShown ? 'none' : 'translateY(110%)', boxShadow: `0 -1px 0 ${t.line}` }}>
        <div style={{ textAlign: 'center', fontSize: 12.5, color: t.muted, lineHeight: 1.35, padding: '8px 12px 0', fontFamily: UI_FONT }}>
          Chương {chapterIndex + 1}/{total}{hasText ? ` • ${Math.round(ratio * 100)}%${left !== null ? ` • còn ~${left} phút` : ''}` : ''}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22, padding: '4px 10px 8px', fontFamily: UI_FONT }}>
          <button style={{ ...iconBtn, width: 52, height: 48, opacity: chapterIndex === 0 ? 0.3 : 1 }} onClick={onPrev} disabled={chapterIndex === 0} aria-label="Chương trước"><ChevronLeft size={28} /></button>
          {audio && (
            <button onClick={() => audio.onToggle(getView())} disabled={audio.disabled || !hasText}
              aria-label={playing ? 'Tạm dừng' : 'Nghe chương này'}
              style={{ width: 62, height: 62, borderRadius: 999, border: 'none', background: t.accent, color: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(0,0,0,0.3)', opacity: audio.disabled || !hasText ? 0.5 : 1 }}>
              {audio.busy ? <Loader size={28} className="animate-spin" /> : playing ? <Pause size={28} /> : <Play size={28} style={{ marginLeft: 3 }} />}
            </button>
          )}
          <button style={{ ...iconBtn, width: 52, height: 48, opacity: chapterIndex >= total - 1 ? 0.3 : 1 }} onClick={onNext} disabled={chapterIndex >= total - 1} aria-label="Chương sau"><ChevronRight size={28} /></button>
        </div>
      </div>

      {/* Bảng cài đặt đọc + nghe */}
      {panel === 'settings' && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 10, background: t.bar, color: t.text, borderTopLeftRadius: 18, borderTopRightRadius: 18, boxShadow: '0 -8px 30px rgba(0,0,0,0.25)', maxHeight: '82%', overflowY: 'auto', padding: '14px 18px calc(18px + env(safe-area-inset-bottom))', fontFamily: UI_FONT }}>
          <div style={{ maxWidth: 520, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <strong style={{ fontSize: 16 }}>Cài đặt đọc</strong>
              <button style={{ ...iconBtn, width: 36, height: 36 }} onClick={() => setPanel(null)} aria-label="Đóng"><X size={20} /></button>
            </div>

            <div style={block}>
              <div style={sectionLabel}><span>Nền</span></div>
              <div style={{ display: 'flex', gap: 8 }}>
                {Object.entries(READER_THEMES).map(([key, th]) => (
                  <button key={key} onClick={() => update({ theme: key })} aria-label={th.label}
                    style={{ flex: 1, height: 52, borderRadius: 12, background: th.bg, color: th.text, fontSize: 13, fontWeight: 600, border: `2.5px solid ${prefs.theme === key ? th.accent : t.line}` }}>
                    {th.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={block}>
              <div style={sectionLabel}><span>Cỡ chữ</span><span style={{ color: t.accent, fontWeight: 700 }}>{prefs.fontSize}px</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button style={{ ...iconBtn, fontSize: 15, fontWeight: 700, border: `1.5px solid ${t.line}` }} onClick={() => update({ fontSize: clamp(prefs.fontSize - 1, 15, 40) })} aria-label="Giảm cỡ chữ">A</button>
                <input type="range" min="15" max="40" step="1" value={prefs.fontSize} onChange={(e) => update({ fontSize: Number(e.target.value) })} style={{ flex: 1, accentColor: t.accent, height: 32 }} />
                <button style={{ ...iconBtn, fontSize: 24, fontWeight: 700, border: `1.5px solid ${t.line}` }} onClick={() => update({ fontSize: clamp(prefs.fontSize + 1, 15, 40) })} aria-label="Tăng cỡ chữ">A</button>
              </div>
            </div>

            <div style={block}>
              <div style={sectionLabel}><span>Giãn dòng</span><span style={{ color: t.accent, fontWeight: 700 }}>{prefs.lineHeight.toFixed(2)}</span></div>
              <input type="range" min="1.4" max="2.4" step="0.05" value={prefs.lineHeight} onChange={(e) => update({ lineHeight: Number(e.target.value) })} style={{ width: '100%', accentColor: t.accent, height: 32 }} />
            </div>

            <div style={block}>
              <div style={sectionLabel}><span>Kiểu chữ</span></div>
              <div style={{ display: 'flex', gap: 8 }}>
                {Object.entries(READER_FONTS).map(([key, f]) => (
                  <button key={key} onClick={() => update({ font: key })} style={{ ...chip(prefs.font === key), fontFamily: f.family }}>{f.label}</button>
                ))}
              </div>
            </div>

            <div style={block}>
              <div style={sectionLabel}><span>Độ rộng cột chữ (máy tính bảng / máy tính)</span></div>
              <div style={{ display: 'flex', gap: 8 }}>
                {Object.entries(READER_WIDTHS).map(([key, w]) => (
                  <button key={key} onClick={() => update({ width: key })} style={chip(prefs.width === key)}>{w.label}</button>
                ))}
              </div>
            </div>

            <div style={block}>
              <div style={sectionLabel}><span>Căn lề</span></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => update({ align: 'left' })} style={chip(prefs.align === 'left')}>Căn trái</button>
                <button onClick={() => update({ align: 'justify' })} style={chip(prefs.align === 'justify')}>Căn đều</button>
              </div>
            </div>

            <label style={switchRow}>
              <span>Giữ màn hình sáng khi đọc</span>
              <input type="checkbox" checked={prefs.keepAwake} onChange={(e) => update({ keepAwake: e.target.checked })} style={checkbox} />
            </label>

            <button onClick={() => { const n = { ...DEFAULT_READER_PREFS, theme: prefs.theme }; setPrefs(n); savePrefs(n); }}
              style={{ width: '100%', margin: '8px 0 4px', padding: '11px', borderRadius: 10, border: `1.5px solid ${t.line}`, background: 'transparent', color: t.muted, fontSize: 14 }}>
              Đặt lại mặc định
            </button>

            {audio && (
              <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${t.line}` }}>
                <strong style={{ fontSize: 16, display: 'block', marginBottom: 12 }}>Giọng đọc</strong>

                <div style={block}>
                  <div style={sectionLabel}><span>Kiểu giọng</span></div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => audio.onTtsMode('edge')} style={chip(audio.ttsMode === 'edge')}>Edge TTS<br /><small style={{ fontWeight: 400 }}>chạy nền tốt</small></button>
                    <button onClick={() => audio.onTtsMode('web')} style={chip(audio.ttsMode === 'web')}>Nhanh<br /><small style={{ fontWeight: 400 }}>tức thì</small></button>
                  </div>
                </div>

                <div style={block}>
                  <div style={sectionLabel}><span>Tốc độ</span><span style={{ color: t.accent, fontWeight: 700 }}>{audio.speechRate.toFixed(1)}x</span></div>
                  <input type="range" min="0.5" max="2" step="0.1" value={audio.speechRate} onChange={(e) => audio.onSpeechRate(parseFloat(e.target.value))} style={{ width: '100%', accentColor: t.accent, height: 32 }} />
                </div>

                <div style={block}>
                  <div style={sectionLabel}><span>Giọng</span></div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => audio.onVoiceGender('female')} style={chip(audio.voiceGender === 'female')}>👩 {audio.ttsMode === 'edge' ? 'Hoài My' : 'Nữ'}</button>
                    <button onClick={() => audio.onVoiceGender('male')} style={chip(audio.voiceGender === 'male')}>👨 {audio.ttsMode === 'edge' ? 'Nam Minh' : 'Nam'}</button>
                  </div>
                </div>

                <label style={switchRow}>
                  <span>Tự cuộn theo giọng đọc</span>
                  <input type="checkbox" checked={audio.autoScroll} onChange={(e) => audio.onAutoScroll(e.target.checked)} style={checkbox} />
                </label>
                <label style={switchRow}>
                  <span>Tự chuyển sang chương sau</span>
                  <input type="checkbox" checked={audio.autoNext} onChange={(e) => audio.onAutoNext(e.target.checked)} style={checkbox} />
                </label>

                <label style={switchRow}>
                  <span>Dịch AI tự động (truyện tiếng Trung)</span>
                  <input type="checkbox" checked={audio.autoTranslate} onChange={(e) => audio.onAutoTranslate(e.target.checked)} style={checkbox} />
                </label>
                {audio.autoTranslate && (
                  <div style={{ ...block, marginTop: 4 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => audio.onTranslateEngine('groq')} style={chip(audio.translateEngine === 'groq')}>Groq AI</button>
                      <button onClick={() => audio.onTranslateEngine('google')} style={chip(audio.translateEngine === 'google')}>Google</button>
                    </div>
                    <button onClick={audio.onClearTranslateCache}
                      style={{ width: '100%', marginTop: 10, padding: '11px', borderRadius: 10, border: `1.5px solid ${t.line}`, background: 'transparent', color: t.muted, fontSize: 14 }}>
                      Xoá bộ nhớ dịch
                    </button>
                  </div>
                )}
                <p style={{ fontSize: 12.5, color: t.muted, lineHeight: 1.5, margin: '6px 0 0' }}>
                  Dùng <strong>Edge TTS</strong> để nghe tốt khi tắt màn hình; có thể điều khiển từ màn hình khoá.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Danh sách chương */}
      {panel === 'chapters' && (
        <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(88vw, 380px)', zIndex: 10, background: t.bar, color: t.text, boxShadow: '-8px 0 30px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', fontFamily: UI_FONT, paddingTop: 'env(safe-area-inset-top)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 8px 10px 16px', borderBottom: `1px solid ${t.line}` }}>
            <strong style={{ fontSize: 16 }}>Danh sách chương ({total})</strong>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {onRefresh && (
                <button style={{ ...iconBtn, width: 36, height: 36 }} onClick={refresh} disabled={refreshing} aria-label="Kiểm tra chương mới">
                  <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
                </button>
              )}
              <button style={{ ...iconBtn, width: 36, height: 36 }} onClick={() => setPanel(null)} aria-label="Đóng"><X size={20} /></button>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 'env(safe-area-inset-bottom)' }}>
            {chapters.map((c, i) => (
              <button key={i} ref={i === chapterIndex ? activeItemRef : null} onClick={() => { setPanel(null); onSelectChapter(i); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '13px 16px', fontSize: 14.5, border: 'none', borderBottom: `1px solid ${t.line}`,
                  background: i === chapterIndex ? t.bg : 'transparent', color: i === chapterIndex ? t.accent : t.text, fontWeight: i === chapterIndex ? 700 : 400,
                  contentVisibility: 'auto', containIntrinsicSize: '48px',
                }}>
                {c.title || `Chương ${i + 1}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Thông báo / lỗi (từ ứng dụng hoặc từ nút kiểm tra chương mới) */}
      {noteText && (
        <div style={{
          position: 'absolute', left: 12, right: 12, bottom: 'calc(118px + env(safe-area-inset-bottom))', margin: '0 auto', maxWidth: 480, zIndex: 20,
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px 10px 16px', borderRadius: 14, fontSize: 14, fontFamily: UI_FONT, lineHeight: 1.4,
          background: message?.kind === 'error' ? '#7f1d1d' : t.text, color: message?.kind === 'error' ? '#fee2e2' : t.bg, boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        }}>
          <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{message?.kind === 'error' ? '⚠️ ' : ''}{noteText.length > 200 ? noteText.slice(0, 200) + '…' : noteText}</span>
          {message?.kind === 'error' && (
            <button onClick={onDismissMessage} aria-label="Đóng thông báo" style={{ ...iconBtn, width: 32, height: 32 }}><X size={18} /></button>
          )}
        </div>
      )}
    </div>
  );
}
