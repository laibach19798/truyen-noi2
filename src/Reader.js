import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ArrowLeft, List, Type, Headphones, Loader, X, RefreshCw } from 'lucide-react';
import {
  READER_THEMES, READER_FONTS, READER_WIDTHS, DEFAULT_READER_PREFS,
  readPrefs, savePrefs, readPosition, savePosition, splitParagraphs, countWords, minutesToRead, minutesLeft, clamp,
} from './readerUtils';

// Màn hình đọc toàn khung hình, dành cho người đọc trên điện thoại: chữ lớn, nền giấy / tối,
// thanh công cụ tự ẩn khi cuộn xuống, nhớ vị trí đọc, hiện số phút còn lại của chương.
export default function Reader({
  storyKey, storyTitle, chapters, chapterIndex, text, waiting, waitingLabel,
  darkMode, onPrev, onNext, onSelectChapter, onExit, onListen, onRefresh,
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
  const readyKey = useRef(''); // chương đã khôi phục vị trí xong; chỉ khi đó mới lưu vị trí
  const latest = useRef({});

  const t = READER_THEMES[prefs.theme];
  const font = READER_FONTS[prefs.font];
  const paragraphs = useMemo(() => splitParagraphs(text), [text]);
  const words = useMemo(() => countWords(text), [text]);
  const hasText = paragraphs.length > 0;
  const total = chapters.length;
  const chapter = chapters[chapterIndex] || {};
  const next = chapters[chapterIndex + 1];
  const left = minutesLeft(words, ratio);

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

  // Giữ màn hình sáng khi đang đọc.
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
      if (dy > 0 && top > 90) setBars(false);
      else if (dy < 0) setBars(true);
      lastTop.current = top;
    }
    const now = Date.now();
    if (readyKey.current && now - lastSave.current > 500) {
      lastSave.current = now;
      savePosition(storyKey, chapterIndex, r);
    }
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

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, background: t.bg, color: t.text, fontFamily: font.family }}>
      {/* Thanh tiến độ chương */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, zIndex: 8, background: t.line }}>
        <div style={{ height: '100%', width: `${ratio * 100}%`, background: t.accent }} />
      </div>

      {/* Thanh trên */}
      <div style={{ ...barStyle, top: 0, paddingTop: 'env(safe-area-inset-top)', transform: barsShown ? 'none' : 'translateY(-110%)', boxShadow: `0 1px 0 ${t.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '6px 6px', gap: 2, fontFamily: DEFAULT_FONT }}>
          <button style={iconBtn} onClick={onExit} aria-label="Về trang chủ"><ArrowLeft size={22} /></button>
          <div style={{ flex: 1, minWidth: 0, textAlign: 'center', lineHeight: 1.25 }}>
            <div style={{ fontSize: 11, color: t.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{storyTitle}</div>
            <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chapter.title}</div>
          </div>
          <button style={iconBtn} onClick={() => setPanel(panel === 'chapters' ? null : 'chapters')} aria-label="Danh sách chương"><List size={22} /></button>
          <button style={iconBtn} onClick={() => setPanel(panel === 'settings' ? null : 'settings')} aria-label="Cài đặt đọc"><Type size={22} /></button>
          <button style={iconBtn} onClick={onListen} aria-label="Chuyển sang nghe"><Headphones size={22} /></button>
        </div>
      </div>

      {/* Nội dung chương */}
      <div ref={scrollRef} onScroll={onScroll} onClick={onTap}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
        <div style={{
          maxWidth: READER_WIDTHS[prefs.width].max, margin: '0 auto',
          padding: 'calc(76px + env(safe-area-inset-top)) 20px calc(130px + env(safe-area-inset-bottom))',
          fontSize: prefs.fontSize, lineHeight: prefs.lineHeight, overflowWrap: 'anywhere',
        }}>
          <h2 style={{ fontSize: '1.2em', lineHeight: 1.35, fontWeight: 700, color: t.accent, margin: '0 0 6px' }}>{chapter.title}</h2>
          {hasText && (
            <div style={{ fontSize: 13, lineHeight: 1.4, color: t.muted, marginBottom: '1.4em', fontFamily: DEFAULT_FONT }}>
              Chương {chapterIndex + 1}/{total} • ~{minutesToRead(words)} phút đọc
            </div>
          )}
          {!hasText && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '60px 0', color: t.muted, fontSize: 16, fontFamily: DEFAULT_FONT }}>
              {waiting && <Loader size={20} className="animate-spin" />} {waiting ? (waitingLabel || 'Đang tải chương...') : 'Chương trống'}
            </div>
          )}
          {paragraphs.map((p, i) => (
            <p key={i} style={{ margin: '0 0 0.85em', textAlign: prefs.align }}>{p}</p>
          ))}

          {hasText && (
            <div style={{ marginTop: '2.2em', paddingTop: '1.4em', borderTop: `1px solid ${t.line}`, textAlign: 'center', fontFamily: DEFAULT_FONT }}>
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

      {/* Thanh dưới */}
      <div style={{ ...barStyle, bottom: 0, paddingBottom: 'env(safe-area-inset-bottom)', transform: barsShown ? 'none' : 'translateY(110%)', boxShadow: `0 -1px 0 ${t.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', gap: 8, fontFamily: DEFAULT_FONT }}>
          <button style={{ ...iconBtn, width: 52, height: 48, opacity: chapterIndex === 0 ? 0.3 : 1 }} onClick={onPrev} disabled={chapterIndex === 0} aria-label="Chương trước"><ChevronLeft size={26} /></button>
          <div style={{ flex: 1, textAlign: 'center', fontSize: 12.5, color: t.muted, lineHeight: 1.35 }}>
            <div style={{ color: t.text, fontWeight: 600 }}>Chương {chapterIndex + 1}/{total}</div>
            <div>{hasText ? `${Math.round(ratio * 100)}%${left !== null ? ` • còn ~${left} phút` : ''}` : '...'}</div>
          </div>
          <button style={{ ...iconBtn, width: 52, height: 48, opacity: chapterIndex >= total - 1 ? 0.3 : 1 }} onClick={onNext} disabled={chapterIndex >= total - 1} aria-label="Chương sau"><ChevronRight size={26} /></button>
        </div>
      </div>

      {/* Bảng cài đặt đọc */}
      {panel === 'settings' && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 10, background: t.bar, color: t.text, borderTopLeftRadius: 18, borderTopRightRadius: 18, boxShadow: '0 -8px 30px rgba(0,0,0,0.25)', maxHeight: '78%', overflowY: 'auto', padding: '14px 18px calc(18px + env(safe-area-inset-bottom))', fontFamily: DEFAULT_FONT }}>
          <div style={{ maxWidth: 520, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <strong style={{ fontSize: 16 }}>Cài đặt đọc</strong>
              <button style={{ ...iconBtn, width: 36, height: 36 }} onClick={() => setPanel(null)} aria-label="Đóng"><X size={20} /></button>
            </div>

            <div style={{ marginBottom: 16 }}>
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

            <div style={{ marginBottom: 16 }}>
              <div style={sectionLabel}><span>Cỡ chữ</span><span style={{ color: t.accent, fontWeight: 700 }}>{prefs.fontSize}px</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button style={{ ...iconBtn, fontSize: 15, fontWeight: 700, border: `1.5px solid ${t.line}` }} onClick={() => update({ fontSize: clamp(prefs.fontSize - 1, 15, 40) })} aria-label="Giảm cỡ chữ">A</button>
                <input type="range" min="15" max="40" step="1" value={prefs.fontSize} onChange={(e) => update({ fontSize: Number(e.target.value) })} style={{ flex: 1, accentColor: t.accent, height: 32 }} />
                <button style={{ ...iconBtn, fontSize: 24, fontWeight: 700, border: `1.5px solid ${t.line}` }} onClick={() => update({ fontSize: clamp(prefs.fontSize + 1, 15, 40) })} aria-label="Tăng cỡ chữ">A</button>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={sectionLabel}><span>Giãn dòng</span><span style={{ color: t.accent, fontWeight: 700 }}>{prefs.lineHeight.toFixed(2)}</span></div>
              <input type="range" min="1.4" max="2.4" step="0.05" value={prefs.lineHeight} onChange={(e) => update({ lineHeight: Number(e.target.value) })} style={{ width: '100%', accentColor: t.accent, height: 32 }} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={sectionLabel}><span>Kiểu chữ</span></div>
              <div style={{ display: 'flex', gap: 8 }}>
                {Object.entries(READER_FONTS).map(([key, f]) => (
                  <button key={key} onClick={() => update({ font: key })} style={{ ...chip(prefs.font === key), fontFamily: f.family }}>{f.label}</button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={sectionLabel}><span>Độ rộng cột chữ (máy tính bảng / máy tính)</span></div>
              <div style={{ display: 'flex', gap: 8 }}>
                {Object.entries(READER_WIDTHS).map(([key, w]) => (
                  <button key={key} onClick={() => update({ width: key })} style={chip(prefs.width === key)}>{w.label}</button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={sectionLabel}><span>Căn lề</span></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => update({ align: 'left' })} style={chip(prefs.align === 'left')}>Căn trái</button>
                <button onClick={() => update({ align: 'justify' })} style={chip(prefs.align === 'justify')}>Căn đều</button>
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', fontSize: 15 }}>
              <span>Giữ màn hình sáng khi đọc</span>
              <input type="checkbox" checked={prefs.keepAwake} onChange={(e) => update({ keepAwake: e.target.checked })} style={{ width: 22, height: 22, accentColor: t.accent }} />
            </label>

            <button onClick={() => { const n = { ...DEFAULT_READER_PREFS, theme: prefs.theme }; setPrefs(n); savePrefs(n); }}
              style={{ width: '100%', marginTop: 8, padding: '11px', borderRadius: 10, border: `1.5px solid ${t.line}`, background: 'transparent', color: t.muted, fontSize: 14 }}>
              Đặt lại mặc định
            </button>
          </div>
        </div>
      )}

      {/* Danh sách chương */}
      {panel === 'chapters' && (
        <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(88vw, 380px)', zIndex: 10, background: t.bar, color: t.text, boxShadow: '-8px 0 30px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', fontFamily: DEFAULT_FONT, paddingTop: 'env(safe-area-inset-top)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 8px 10px 16px', borderBottom: `1px solid ${t.line}` }}>
            <strong style={{ fontSize: 16 }}>Danh sách chương ({total})</strong>
            <button style={{ ...iconBtn, width: 36, height: 36 }} onClick={() => setPanel(null)} aria-label="Đóng"><X size={20} /></button>
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

      {toast && (
        <div style={{ position: 'absolute', left: '50%', bottom: 'calc(90px + env(safe-area-inset-bottom))', transform: 'translateX(-50%)', zIndex: 20, background: t.text, color: t.bg, padding: '10px 16px', borderRadius: 999, fontSize: 14, fontFamily: DEFAULT_FONT, boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// Giao diện (thanh công cụ, nút) luôn dùng phông hệ thống, chỉ phần chữ truyện đổi kiểu theo cài đặt.
const DEFAULT_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
