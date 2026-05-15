import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, Upload, Loader, Volume2, Sun, Moon, List, X, Settings, Zap, Sparkles, Languages } from 'lucide-react';

const EDGE_TTS_API = 'https://laibach-edge-tts-vietnamese.hf.space';
const MAX_CHUNK_SIZE = 800;
const PREFETCH_CHUNKS = 3; // Tăng lên 3 để chạy nền mượt hơn
const TRANSLATE_BATCH_SIZE = 1500;
const MAX_PARALLEL_TRANSLATES = 3;

export default function StoryListenerApp() {
  const [chapters, setChapters] = useState([]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showChapterList, setShowChapterList] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [webUrl, setWebUrl] = useState('');
  const [isLoadingWeb, setIsLoadingWeb] = useState(false);
  const [speechRate, setSpeechRate] = useState(1);
  const [voiceGender, setVoiceGender] = useState('female');
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [darkMode, setDarkMode] = useState(true);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [autoNext, setAutoNext] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [fontSize, setFontSize] = useState(18);
  
  const [ttsMode, setTtsMode] = useState('edge');
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [translateEngine, setTranslateEngine] = useState('groq');
  const [translatedChapter, setTranslatedChapter] = useState('');
  const [translationProgress, setTranslationProgress] = useState(0);
  const [isTranslating, setIsTranslating] = useState(false);
  
  // REFS
  const audioRef = useRef(null);
  const nextAudioRef = useRef(null); // 🆕 Audio thứ 2 để preload
  const utteranceRef = useRef(null);
  const fileInputRef = useRef(null);
  const textContainerRef = useRef(null);
  const wordRefs = useRef([]);
  const wakeLockRef = useRef(null); // 🆕 Wake Lock
  const silentAudioRef = useRef(null); // 🆕 Audio im lặng giữ session
  
  const currentChapterIndexRef = useRef(0);
  const currentChunkIndexRef = useRef(0);
  const autoNextRef = useRef(true);
  const chaptersRef = useRef([]);
  const ttsModeRef = useRef('edge');
  const isPlayingRef = useRef(false);
  
  const audioCacheRef = useRef(new Map());
  const chunksCacheRef = useRef(new Map());
  const translateCacheRef = useRef(new Map());
  
  const currentChunkWordsRef = useRef([]);
  const currentChunkWordOffsetRef = useRef(0);
  const animationFrameRef = useRef(null);
  const translatingChapterRef = useRef(-1);

  useEffect(() => { currentChapterIndexRef.current = currentChapterIndex; }, [currentChapterIndex]);
  useEffect(() => { currentChunkIndexRef.current = currentChunkIndex; }, [currentChunkIndex]);
  useEffect(() => { autoNextRef.current = autoNext; }, [autoNext]);
  useEffect(() => { chaptersRef.current = chapters; }, [chapters]);
  useEffect(() => { ttsModeRef.current = ttsMode; }, [ttsMode]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  const theme = darkMode ? {
    bg: 'bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900',
    card: 'bg-slate-800/60 backdrop-blur-xl border-slate-700/50',
    text: 'text-slate-100', textMuted: 'text-slate-400', accent: 'text-amber-400',
    border: 'border-slate-700/50',
    input: 'bg-slate-900/50 border-slate-700 text-slate-100 placeholder-slate-500',
    button: 'bg-slate-700/50 hover:bg-slate-600/50 text-slate-100',
    buttonPrimary: 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white',
    highlight: 'bg-amber-400/40 text-amber-100', read: 'text-slate-500',
    chapterActive: 'bg-amber-500/20 text-amber-300 border-l-4 border-amber-400',
    textBg: 'bg-slate-900/50', translateBadge: 'bg-purple-500/20 text-purple-300 border-purple-500/50',
  } : {
    bg: 'bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50',
    card: 'bg-white/80 backdrop-blur-xl border-amber-200/50 shadow-lg shadow-amber-100/50',
    text: 'text-slate-900', textMuted: 'text-slate-600', accent: 'text-orange-600',
    border: 'border-amber-200/50',
    input: 'bg-white border-amber-200 text-slate-900 placeholder-slate-400',
    button: 'bg-amber-100 hover:bg-amber-200 text-slate-800',
    buttonPrimary: 'bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white',
    highlight: 'bg-orange-300 text-orange-900', read: 'text-slate-400',
    chapterActive: 'bg-orange-100 text-orange-700 border-l-4 border-orange-500',
    textBg: 'bg-amber-50/50', translateBadge: 'bg-purple-100 text-purple-700 border-purple-300',
  };

  useEffect(() => {
    const sd = localStorage.getItem('darkMode');
    if (sd !== null) setDarkMode(sd === 'true');
    const st = localStorage.getItem('ttsMode');
    if (st) setTtsMode(st);
    const str = localStorage.getItem('autoTranslate');
    if (str !== null) setAutoTranslate(str === 'true');
    const se = localStorage.getItem('translateEngine');
    if (se) setTranslateEngine(se);
  }, []);
  
  useEffect(() => { localStorage.setItem('darkMode', darkMode); }, [darkMode]);
  useEffect(() => { localStorage.setItem('ttsMode', ttsMode); }, [ttsMode]);
  useEffect(() => { localStorage.setItem('autoTranslate', autoTranslate); }, [autoTranslate]);
  useEffect(() => { localStorage.setItem('translateEngine', translateEngine); }, [translateEngine]);

  useEffect(() => {
    if (!window.JSZip) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  // ============ 🆕 WAKE LOCK - GIỮ MÀN HÌNH KHÔNG TẮT JS ============
  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        console.log('Wake Lock active');
      }
    } catch (e) {
      console.log('Wake Lock error:', e);
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    } catch (e) {}
  }, []);

  // Re-acquire wake lock khi visibility thay đổi
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isPlayingRef.current) {
        await requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [requestWakeLock]);

  // ============ 🆕 MEDIA SESSION - ĐIỀU KHIỂN TRÊN MÀN HÌNH KHÓA ============
  const setupMediaSession = useCallback((chapterTitle, chapterNum, totalChapters) => {
    if (!('mediaSession' in navigator)) return;
    
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: chapterTitle || 'Đang đọc truyện',
      artist: `Chương ${chapterNum}/${totalChapters}`,
      album: 'Truyện Nói',
      artwork: [
        { src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="%23f59e0b"/><text x="256" y="300" font-size="200" text-anchor="middle" fill="white">📖</text></svg>', sizes: '512x512', type: 'image/svg+xml' }
      ]
    });
    
    navigator.mediaSession.setActionHandler('play', () => {
      if (!isPlayingRef.current) togglePlayRef.current?.();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      if (isPlayingRef.current) togglePlayRef.current?.();
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      prevChapterRef.current?.();
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      nextChapterRef.current?.();
    });
  }, []);

  // Refs cho media session callbacks
  const togglePlayRef = useRef(null);
  const prevChapterRef = useRef(null);
  const nextChapterRef = useRef(null);

  // ============ 🆕 SILENT AUDIO - GIỮ AUDIO SESSION SỐNG ============
  const createSilentAudio = useCallback(() => {
    // Tạo 1 audio im lặng loop để giữ audio context sống
    if (silentAudioRef.current) return;
    
    // WAV header cho 1 giây im lặng
    const silentWav = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    silentAudioRef.current = new Audio(silentWav);
    silentAudioRef.current.loop = true;
    silentAudioRef.current.volume = 0.001; // Gần như im lặng
  }, []);

  // ============ TRANSLATION ============
  const splitForTranslation = (text, maxSize = TRANSLATE_BATCH_SIZE) => {
    if (!text) return [];
    const paragraphs = text.split(/\n+/).filter(p => p.trim());
    const batches = [];
    let cur = '';
    for (const para of paragraphs) {
      if ((cur + para).length > maxSize && cur) {
        batches.push(cur.trim());
        cur = para;
      } else {
        cur += (cur ? '\n\n' : '') + para;
      }
    }
    if (cur.trim()) batches.push(cur.trim());
    return batches;
  };

  const translateSingleBatch = async (text, engine = 'groq') => {
    const cacheKey = `${engine}_${text.substring(0, 100)}_${text.length}`;
    if (translateCacheRef.current.has(cacheKey)) {
      return translateCacheRef.current.get(cacheKey);
    }
    try {
      const endpoint = engine === 'groq' ? '/translate' : '/translate-google';
      const response = await fetch(`${EDGE_TTS_API}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (!response.ok) throw new Error('Translation failed');
      const data = await response.json();
      const translated = data.translated || text;
      translateCacheRef.current.set(cacheKey, translated);
      try {
        const stored = JSON.parse(localStorage.getItem('translate_cache') || '{}');
        stored[cacheKey] = translated;
        const keys = Object.keys(stored);
        if (keys.length > 100) delete stored[keys[0]];
        localStorage.setItem('translate_cache', JSON.stringify(stored));
      } catch (e) {}
      return translated;
    } catch (error) {
      if (engine === 'groq') return translateSingleBatch(text, 'google');
      return text;
    }
  };

  const translateFullChapter = async (chapterText, chapterIdx) => {
    if (!chapterText) return '';
    translatingChapterRef.current = chapterIdx;
    setIsTranslating(true);
    setTranslationProgress(0);
    
    const batches = splitForTranslation(chapterText);
    const totalBatches = batches.length;
    const results = new Array(totalBatches);
    let completed = 0;
    
    const updateProgress = () => {
      setTranslationProgress(Math.round((completed / totalBatches) * 100));
      const partial = results.map((r, i) => r || `[Đang dịch đoạn ${i + 1}...]`).join('\n\n');
      setTranslatedChapter(partial);
    };
    
    const translateBatch = async (batchText, idx) => {
      try {
        const translated = await translateSingleBatch(batchText, translateEngine);
        results[idx] = translated;
        completed++;
        if (translatingChapterRef.current === chapterIdx) updateProgress();
      } catch (e) {
        results[idx] = batchText;
        completed++;
        updateProgress();
      }
    };
    
    for (let i = 0; i < batches.length; i += MAX_PARALLEL_TRANSLATES) {
      if (translatingChapterRef.current !== chapterIdx) return null;
      const group = batches.slice(i, i + MAX_PARALLEL_TRANSLATES);
      await Promise.all(group.map((batch, gIdx) => translateBatch(batch, i + gIdx)));
    }
    
    if (translatingChapterRef.current === chapterIdx) {
      setIsTranslating(false);
      setTranslationProgress(100);
      const finalText = results.join('\n\n');
      setTranslatedChapter(finalText);
      return finalText;
    }
    return null;
  };

  useEffect(() => {
    if (!autoTranslate || chapters.length === 0) {
      setTranslatedChapter('');
      return;
    }
    const chapter = chapters[currentChapterIndex];
    if (!chapter) return;
    
    const fullCacheKey = `chapter_${currentChapterIndex}_${translateEngine}_${chapter.title}`;
    const cached = translateCacheRef.current.get(fullCacheKey);
    if (cached) { setTranslatedChapter(cached); return; }
    
    try {
      const stored = JSON.parse(localStorage.getItem('translate_cache') || '{}');
      if (stored[fullCacheKey]) {
        translateCacheRef.current.set(fullCacheKey, stored[fullCacheKey]);
        setTranslatedChapter(stored[fullCacheKey]);
        return;
      }
    } catch (e) {}
    
    translateFullChapter(chapter.content, currentChapterIndex).then(result => {
      if (result) {
        translateCacheRef.current.set(fullCacheKey, result);
        try {
          const stored = JSON.parse(localStorage.getItem('translate_cache') || '{}');
          stored[fullCacheKey] = result;
          localStorage.setItem('translate_cache', JSON.stringify(stored));
        } catch (e) {}
      }
    });
  }, [currentChapterIndex, autoTranslate, translateEngine, chapters]);

  // ============ CHUNKS ============
  const splitIntoChunks = useCallback((text, maxSize = MAX_CHUNK_SIZE) => {
    if (!text) return [];
    const paragraphs = text.split(/\n+/).filter(p => p.trim());
    const chunks = [];
    let cur = '';
    for (const para of paragraphs) {
      if (para.length > maxSize) {
        if (cur) { chunks.push(cur.trim()); cur = ''; }
        const sentences = para.split(/(?<=[.!?。！？])\s+/);
        for (const s of sentences) {
          if ((cur + s).length > maxSize && cur) {
            chunks.push(cur.trim());
            cur = s;
          } else {
            cur += (cur ? ' ' : '') + s;
          }
        }
      } else {
        if ((cur + para).length > maxSize && cur) {
          chunks.push(cur.trim());
          cur = para;
        } else {
          cur += (cur ? '\n' : '') + para;
        }
      }
    }
    if (cur.trim()) chunks.push(cur.trim());
    return chunks.filter(c => c.length > 0);
  }, []);

  const getChunksForChapter = useCallback((chapterIdx) => {
    const useText = (autoTranslate && translatedChapter && !isTranslating && chapterIdx === currentChapterIndex)
      ? translatedChapter
      : chaptersRef.current[chapterIdx]?.content;
    if (!useText) return [];
    const cacheKey = `${chapterIdx}_${autoTranslate ? 'tr' : 'org'}`;
    if (chunksCacheRef.current.has(cacheKey)) return chunksCacheRef.current.get(cacheKey);
    const chunks = splitIntoChunks(useText);
    chunksCacheRef.current.set(cacheKey, chunks);
    return chunks;
  }, [splitIntoChunks, autoTranslate, translatedChapter, isTranslating, currentChapterIndex]);

  const splitIntoWords = useCallback((text) => {
    return text.split(/(\s+)/).filter(w => w.length > 0);
  }, []);

  const allWordsOfChapter = useMemo(() => {
    if (chapters.length === 0) return { words: [], chunkOffsets: [] };
    const displayText = (autoTranslate && translatedChapter) ? translatedChapter : chapters[currentChapterIndex]?.content || '';
    const chunks = splitIntoChunks(displayText);
    const allWords = [];
    const chunkOffsets = [];
    for (const chunk of chunks) {
      chunkOffsets.push(allWords.length);
      allWords.push(...splitIntoWords(chunk));
    }
    return { words: allWords, chunkOffsets };
  }, [currentChapterIndex, chapters, autoTranslate, translatedChapter, splitIntoChunks, splitIntoWords]);

  // ============ EPUB ============
  const parseEpub = async (file) => {
    let attempts = 0;
    while (!window.JSZip && attempts < 50) {
      await new Promise(r => setTimeout(r, 100));
      attempts++;
    }
    if (!window.JSZip) throw new Error('Không tải được EPUB');
    const zip = await window.JSZip.loadAsync(file);
    const containerFile = zip.file('META-INF/container.xml');
    let opfPath = '';
    if (containerFile) {
      const xml = await containerFile.async('text');
      const m = xml.match(/full-path="([^"]+)"/);
      if (m) opfPath = m[1];
    }
    const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
    let chapterFiles = [];
    if (opfPath) {
      const opfFile = zip.file(opfPath);
      if (opfFile) {
        const opf = await opfFile.async('text');
        const items = {};
        const itemRe = /<item[^>]+id="([^"]+)"[^>]+href="([^"]+)"[^>]*media-type="application\/xhtml\+xml"/g;
        let im;
        while ((im = itemRe.exec(opf)) !== null) items[im[1]] = im[2];
        const spineRe = /<itemref[^>]+idref="([^"]+)"/g;
        let sm;
        while ((sm = spineRe.exec(opf)) !== null) {
          if (items[sm[1]]) chapterFiles.push(opfDir + items[sm[1]]);
        }
      }
    }
    if (chapterFiles.length === 0) {
      zip.forEach((path, f) => {
        if (!f.dir && /\.(x?html?|xhtml)$/i.test(path)) chapterFiles.push(path);
      });
      chapterFiles.sort();
    }
    const result = [];
    for (let i = 0; i < chapterFiles.length; i++) {
      const cf = zip.file(chapterFiles[i]);
      if (!cf) continue;
      const html = await cf.async('text');
      const doc = new DOMParser().parseFromString(html, 'text/html');
      doc.querySelectorAll('script, style').forEach(el => el.remove());
      let title = doc.querySelector('h1, h2, h3, title')?.textContent?.trim() || '';
      if (!title) title = `Chương ${i + 1}`;
      const text = doc.body?.innerText || '';
      const clean = text.replace(/\n{3,}/g, '\n\n').trim();
      if (clean.length < 50) continue;
      result.push({ title: title.substring(0, 100), content: clean });
    }
    return result;
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsLoadingFile(true);
    setErrorMsg('');
    audioCacheRef.current.clear();
    chunksCacheRef.current.clear();
    try {
      let newChapters = [];
      const fn = file.name.toLowerCase();
      if (fn.endsWith('.epub')) {
        newChapters = await parseEpub(file);
        if (newChapters.length === 0) throw new Error('EPUB rỗng');
      } else if (fn.endsWith('.html') || fn.endsWith('.htm')) {
        const text = await file.text();
        const doc = new DOMParser().parseFromString(text, 'text/html');
        doc.querySelectorAll('script, style').forEach(el => el.remove());
        newChapters = parseTextFile(doc.body?.innerText || '');
      } else {
        const text = await readFileAsText(file);
        newChapters = parseTextFile(text);
      }
      if (newChapters.length === 0) throw new Error('Không có nội dung');
      setChapters(newChapters);
      setCurrentChapterIndex(0);
      setCurrentChunkIndex(0);
      setCurrentWordIndex(-1);
      setTranslatedChapter('');
    } catch (error) {
      setErrorMsg('Lỗi: ' + error.message);
    }
    setIsLoadingFile(false);
  };

  const readFileAsText = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Không đọc được'));
    reader.readAsText(file, 'UTF-8');
  });

  const parseTextFile = (text) => {
    let arr = [];
    const re = /(?:chương|chapter|ch\.?|hồi)\s*(\d+|[ivxlcdm]+)[:\.\s]+/gi;
    const matches = [...text.matchAll(re)];
    if (matches.length > 1) {
      matches.forEach((match, index) => {
        const start = match.index;
        const end = index < matches.length - 1 ? matches[index + 1].index : text.length;
        const ct = text.substring(start, end).trim();
        const nl = ct.indexOf('\n');
        const title = nl > 0 ? ct.substring(0, nl).trim() : `Chương ${index + 1}`;
        const content = nl > 0 ? ct.substring(nl + 1).trim() : ct;
        arr.push({ title: title.substring(0, 100), content });
      });
    } else {
      const cs = 3000;
      for (let i = 0; i < text.length; i += cs) {
        arr.push({ title: `Phần ${Math.floor(i / cs) + 1}`, content: text.substring(i, i + cs) });
      }
    }
    return arr;
  };

  // ============ TTS ============
  const fetchChunkAudio = useCallback(async (chapterIdx, chunkIdx, text) => {
    const cacheKey = `${chapterIdx}_${chunkIdx}_${voiceGender}_${speechRate}_${autoTranslate ? 'tr' : 'org'}`;
    if (audioCacheRef.current.has(cacheKey)) return audioCacheRef.current.get(cacheKey);
    
    const rp = Math.round((speechRate - 1) * 100);
    const rateStr = rp >= 0 ? `+${rp}%` : `${rp}%`;
    
    const response = await fetch(`${EDGE_TTS_API}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.substring(0, 5000), voice: voiceGender, rate: rateStr })
    });
    if (!response.ok) throw new Error('TTS error');
    
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    audioCacheRef.current.set(cacheKey, url);
    
    if (audioCacheRef.current.size > 25) {
      const fk = audioCacheRef.current.keys().next().value;
      URL.revokeObjectURL(audioCacheRef.current.get(fk));
      audioCacheRef.current.delete(fk);
    }
    return url;
  }, [voiceGender, speechRate, autoTranslate]);

  const prefetchNextChunks = useCallback(async (chapterIdx, chunkIdx) => {
    const chunks = getChunksForChapter(chapterIdx);
    for (let i = 1; i <= PREFETCH_CHUNKS; i++) {
      const ni = chunkIdx + i;
      if (ni < chunks.length) {
        try { await fetchChunkAudio(chapterIdx, ni, chunks[ni]); } catch (e) {}
      } else {
        // Prefetch chapter kế tiếp
        const nextChapterChunks = getChunksForChapter(chapterIdx + 1);
        const offsetNext = ni - chunks.length;
        if (offsetNext < nextChapterChunks.length) {
          try { await fetchChunkAudio(chapterIdx + 1, offsetNext, nextChapterChunks[offsetNext]); } catch (e) {}
        }
      }
    }
  }, [fetchChunkAudio, getChunksForChapter]);

  const scrollToWord = useCallback((index) => {
    if (!autoScroll || !wordRefs.current[index] || !textContainerRef.current) return;
    const el = wordRefs.current[index];
    const c = textContainerRef.current;
    const wt = el.offsetTop;
    const ch = c.clientHeight;
    const st = c.scrollTop;
    if (wt < st + 50 || wt > st + ch - 100) {
      c.scrollTo({ top: wt - ch / 3, behavior: 'smooth' });
    }
  }, [autoScroll]);

  const startWordHighlight = useCallback(() => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    const update = () => {
      if (!audioRef.current || audioRef.current.paused || audioRef.current.ended) return;
      const ct = audioRef.current.currentTime;
      const dur = audioRef.current.duration;
      if (!dur || isNaN(dur)) {
        animationFrameRef.current = requestAnimationFrame(update);
        return;
      }
      const progress = ct / dur;
      const cw = currentChunkWordsRef.current;
      const wo = currentChunkWordOffsetRef.current;
      if (cw.length > 0) {
        let tc = 0;
        const wc = cw.map(w => { tc += w.length; return tc; });
        const target = progress * tc;
        let li = 0;
        for (let i = 0; i < wc.length; i++) {
          if (wc[i] >= target) { li = i; break; }
        }
        setCurrentWordIndex(wo + li);
        scrollToWord(wo + li);
      }
      animationFrameRef.current = requestAnimationFrame(update);
    };
    animationFrameRef.current = requestAnimationFrame(update);
  }, [scrollToWord]);

  // 🆕 Cập nhật Media Session position
  const updateMediaPosition = useCallback(() => {
    if ('mediaSession' in navigator && audioRef.current && audioRef.current.duration) {
      try {
        navigator.mediaSession.setPositionState({
          duration: audioRef.current.duration,
          playbackRate: 1,
          position: audioRef.current.currentTime
        });
      } catch (e) {}
    }
  }, []);

  const playChunk = useCallback(async (chapterIdx, chunkIdx) => {
    const chunks = getChunksForChapter(chapterIdx);
    
    if (chunkIdx >= chunks.length) {
      if (autoNextRef.current && chapterIdx + 1 < chaptersRef.current.length) {
        setCurrentChapterIndex(chapterIdx + 1);
        setCurrentChunkIndex(0);
        setTimeout(() => playChunk(chapterIdx + 1, 0), 300);
      } else {
        setIsPlaying(false);
        setCurrentWordIndex(-1);
        releaseWakeLock();
      }
      return;
    }
    
    const chunkText = chunks[chunkIdx];
    if (!chunkText) { setIsPlaying(false); return; }
    
    const cw = splitIntoWords(chunkText);
    currentChunkWordsRef.current = cw;
    let offset = 0;
    for (let i = 0; i < chunkIdx; i++) offset += splitIntoWords(chunks[i]).length;
    currentChunkWordOffsetRef.current = offset;
    setCurrentChunkIndex(chunkIdx);
    
    if (ttsModeRef.current === 'edge') {
      setIsLoadingAudio(true);
      try {
        const audioUrl = await fetchChunkAudio(chapterIdx, chunkIdx, chunkText);
        
        if (!audioRef.current) audioRef.current = new Audio();
        audioRef.current.src = audioUrl;
        audioRef.current.playbackRate = 1;
        
        audioRef.current.onloadedmetadata = () => {
          startWordHighlight();
          updateMediaPosition();
        };
        
        audioRef.current.ontimeupdate = () => {
          updateMediaPosition();
        };
        
        // 🆕 FIX: Dùng onended ổn định hơn cho background
        audioRef.current.onended = () => {
          if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
          // Chuyển chunk tiếp theo - hoạt động cả khi tắt màn hình
          playChunk(chapterIdx, chunkIdx + 1);
        };
        
        audioRef.current.onerror = () => {
          setIsLoadingAudio(false);
          setIsPlaying(false);
        };
        
        await audioRef.current.play();
        setIsLoadingAudio(false);
        setIsPlaying(true);
        
        // 🆕 Kích hoạt Wake Lock + Media Session
        await requestWakeLock();
        setupMediaSession(
          chaptersRef.current[chapterIdx]?.title,
          chapterIdx + 1,
          chaptersRef.current.length
        );
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
        }
        
        // Prefetch nhiều chunk hơn để chạy nền mượt
        setTimeout(() => prefetchNextChunks(chapterIdx, chunkIdx), 500);
      } catch (error) {
        setIsLoadingAudio(false);
        setIsPlaying(false);
        setErrorMsg('Lỗi Edge TTS, chuyển sang giọng nhanh');
        setTimeout(() => {
          setTtsMode('web');
          playChunkWebSpeech(chapterIdx, chunkIdx);
        }, 1000);
      }
    } else {
      playChunkWebSpeech(chapterIdx, chunkIdx);
    }
  }, [getChunksForChapter, splitIntoWords, fetchChunkAudio, startWordHighlight, prefetchNextChunks, requestWakeLock, releaseWakeLock, setupMediaSession, updateMediaPosition]);

  const playChunkWebSpeech = useCallback((chapterIdx, chunkIdx) => {
    const chunks = getChunksForChapter(chapterIdx);
    if (chunkIdx >= chunks.length) {
      if (autoNextRef.current && chapterIdx + 1 < chaptersRef.current.length) {
        setCurrentChapterIndex(chapterIdx + 1);
        setCurrentChunkIndex(0);
        setTimeout(() => playChunkWebSpeech(chapterIdx + 1, 0), 300);
      } else {
        setIsPlaying(false);
        releaseWakeLock();
      }
      return;
    }
    
    const chunkText = chunks[chunkIdx];
    const cw = splitIntoWords(chunkText);
    currentChunkWordsRef.current = cw;
    let offset = 0;
    for (let i = 0; i < chunkIdx; i++) offset += splitIntoWords(chunks[i]).length;
    currentChunkWordOffsetRef.current = offset;
    setCurrentChunkIndex(chunkIdx);
    
    if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
    
    utteranceRef.current = new SpeechSynthesisUtterance(chunkText);
    utteranceRef.current.lang = 'vi-VN';
    utteranceRef.current.rate = speechRate;
    utteranceRef.current.pitch = voiceGender === 'female' ? 1.1 : 0.85;
    
    const voices = window.speechSynthesis.getVoices();
    const viVoice = voices.find(v => v.lang.includes('vi')) || voices[0];
    if (viVoice) utteranceRef.current.voice = viVoice;
    
    utteranceRef.current.onboundary = (event) => {
      if (event.name === 'word' || event.name === undefined) {
        const ci = event.charIndex;
        let cc = 0, li = 0;
        for (let i = 0; i < cw.length; i++) {
          if (cc >= ci) { li = i; break; }
          cc += cw[i].length;
        }
        const gi = currentChunkWordOffsetRef.current + li;
        setCurrentWordIndex(gi);
        setTimeout(() => scrollToWord(gi), 50);
      }
    };
    
    utteranceRef.current.onend = () => {
      if (isPlayingRef.current) playChunkWebSpeech(chapterIdx, chunkIdx + 1);
    };
    
    utteranceRef.current.onerror = () => setIsPlaying(false);
    
    window.speechSynthesis.speak(utteranceRef.current);
    setIsPlaying(true);
    requestWakeLock();
    setupMediaSession(chaptersRef.current[chapterIdx]?.title, chapterIdx + 1, chaptersRef.current.length);
  }, [getChunksForChapter, splitIntoWords, speechRate, voiceGender, scrollToWord, requestWakeLock, releaseWakeLock, setupMediaSession]);

  const togglePlay = useCallback(() => {
    if (!chapters.length) return;
    if (isTranslating) {
      setErrorMsg('Đang dịch... vui lòng chờ');
      return;
    }
    
    if (isPlaying || isLoadingAudio) {
      if (ttsMode === 'edge' && audioRef.current) audioRef.current.pause();
      else window.speechSynthesis.cancel();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      setIsPlaying(false);
      setIsLoadingAudio(false);
      releaseWakeLock();
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    } else {
      // 🆕 Kích hoạt silent audio khi bắt đầu (giữ session)
      createSilentAudio();
      if (silentAudioRef.current) {
        silentAudioRef.current.play().catch(() => {});
      }
      playChunk(currentChapterIndex, currentChunkIndex);
    }
  }, [chapters, isTranslating, isPlaying, isLoadingAudio, ttsMode, currentChapterIndex, currentChunkIndex, playChunk, releaseWakeLock, createSilentAudio]);

  const stopAllAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.ontimeupdate = null;
      audioRef.current.src = '';
    }
    window.speechSynthesis.cancel();
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    setIsPlaying(false);
    setIsLoadingAudio(false);
    setCurrentWordIndex(-1);
    releaseWakeLock();
  }, [releaseWakeLock]);

  const nextChapter = useCallback(() => {
    if (currentChapterIndexRef.current < chaptersRef.current.length - 1) {
      stopAllAudio();
      setCurrentChapterIndex(currentChapterIndexRef.current + 1);
      setCurrentChunkIndex(0);
    }
  }, [stopAllAudio]);

  const prevChapter = useCallback(() => {
    if (currentChapterIndexRef.current > 0) {
      stopAllAudio();
      setCurrentChapterIndex(currentChapterIndexRef.current - 1);
      setCurrentChunkIndex(0);
    }
  }, [stopAllAudio]);

  // Sync refs cho Media Session
  useEffect(() => { togglePlayRef.current = togglePlay; }, [togglePlay]);
  useEffect(() => { prevChapterRef.current = prevChapter; }, [prevChapter]);
  useEffect(() => { nextChapterRef.current = nextChapter; }, [nextChapter]);

  const goToChapter = (idx) => {
    stopAllAudio();
    setCurrentChapterIndex(idx);
    setCurrentChunkIndex(0);
    setShowChapterList(false);
    if (textContainerRef.current) textContainerRef.current.scrollTop = 0;
  };

  const loadFromWeb = async () => {
    if (!webUrl.trim()) return;
    setIsLoadingWeb(true);
    audioCacheRef.current.clear();
    chunksCacheRef.current.clear();
    try {
      const response = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(webUrl)}`);
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      doc.querySelectorAll('script, style, nav, footer').forEach(el => el.remove());
      const newChapters = parseTextFile(doc.body.innerText);
      setChapters(newChapters);
      setCurrentChapterIndex(0);
      setCurrentChunkIndex(0);
      setWebUrl('');
    } catch (error) {
      setErrorMsg('Không tải được URL');
    }
    setIsLoadingWeb(false);
  };

  useEffect(() => {
    if (textContainerRef.current) textContainerRef.current.scrollTop = 0;
    chunksCacheRef.current.clear();
  }, [currentChapterIndex]);

  useEffect(() => {
    chunksCacheRef.current.clear();
    audioCacheRef.current.clear();
  }, [translatedChapter, autoTranslate]);

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
      if (audioRef.current) audioRef.current.pause();
      if (silentAudioRef.current) silentAudioRef.current.pause();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      audioCacheRef.current.forEach(url => URL.revokeObjectURL(url));
      releaseWakeLock();
    };
  }, [releaseWakeLock]);

  const currentChapter = chapters[currentChapterIndex] || {};
  const { words: displayWords = [] } = allWordsOfChapter;
  const chunksOfCurrentChapter = getChunksForChapter(currentChapterIndex);

  return (
    <div className={`min-h-screen ${theme.bg} ${theme.text} transition-colors duration-500`} style={{fontFamily: 'system-ui, -apple-system, sans-serif'}}>
      <div className="max-w-4xl mx-auto px-4 py-6 md:py-8">
        
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Volume2 className={`w-7 h-7 ${theme.accent}`} />
            <h1 className={`text-2xl md:text-3xl font-bold ${theme.accent}`}>Truyện Nói</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setDarkMode(!darkMode)} className={`${theme.button} p-2.5 rounded-full hover:scale-110`}>
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            {chapters.length > 0 && (
              <>
                <button onClick={() => setShowSettings(!showSettings)} className={`${theme.button} p-2.5 rounded-full hover:scale-110`}>
                  <Settings className="w-5 h-5" />
                </button>
                <button onClick={() => setShowChapterList(!showChapterList)} className={`${theme.button} p-2.5 rounded-full hover:scale-110`}>
                  <List className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
        </div>

        {chapters.length > 0 && (
          <div className={`${theme.card} border rounded-2xl p-3 mb-3 flex items-center justify-between`}>
            <div className="flex items-center gap-2">
              <Languages className={`w-5 h-5 ${autoTranslate ? theme.accent : theme.textMuted}`} />
              <div>
                <div className="text-sm font-semibold">Dịch AI tự động</div>
                <div className={`text-xs ${theme.textMuted}`}>
                  {autoTranslate ? (translateEngine === 'groq' ? '🤖 Groq AI' : '🌐 Google') : 'Đang tắt'}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {autoTranslate && (
                <button onClick={() => setTranslateEngine(translateEngine === 'groq' ? 'google' : 'groq')}
                  className={`${theme.button} px-3 py-1.5 rounded-lg text-xs`}>
                  Đổi {translateEngine === 'groq' ? 'Google' : 'Groq'}
                </button>
              )}
              <button onClick={() => setAutoTranslate(!autoTranslate)}
                className={`${autoTranslate ? theme.buttonPrimary : theme.button} px-4 py-1.5 rounded-lg text-sm font-semibold`}>
                {autoTranslate ? 'BẬT' : 'TẮT'}
              </button>
            </div>
          </div>
        )}

        <div className={`${theme.card} border rounded-2xl p-4 mb-4`}>
          <p className={`text-xs ${theme.textMuted} mb-2`}>🎤 Giọng đọc:</p>
          <div className="flex gap-2">
            <button onClick={() => { stopAllAudio(); setTtsMode('edge'); }}
              className={`flex-1 py-3 rounded-xl flex items-center justify-center gap-2 ${ttsMode === 'edge' ? theme.buttonPrimary : theme.button}`}>
              <Sparkles className="w-4 h-4" />
              <div className="text-left">
                <div className="font-semibold text-sm">Edge TTS</div>
                <div className="text-xs opacity-80">Chạy nền tốt</div>
              </div>
            </button>
            <button onClick={() => { stopAllAudio(); setTtsMode('web'); }}
              className={`flex-1 py-3 rounded-xl flex items-center justify-center gap-2 ${ttsMode === 'web' ? theme.buttonPrimary : theme.button}`}>
              <Zap className="w-4 h-4" />
              <div className="text-left">
                <div className="font-semibold text-sm">Nhanh</div>
                <div className="text-xs opacity-80">Tức thì</div>
              </div>
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-xl mb-4">
            ⚠️ {errorMsg}
          </div>
        )}

        {chapters.length === 0 && (
          <div className={`${theme.card} border rounded-2xl p-6 mb-6`}>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5" /> Tải truyện
            </h2>
            <button onClick={() => fileInputRef.current?.click()} disabled={isLoadingFile}
              className={`w-full ${theme.buttonPrimary} font-semibold py-4 rounded-xl shadow-lg mb-3 disabled:opacity-50`}>
              {isLoadingFile ? (
                <span className="flex items-center justify-center gap-2"><Loader className="w-5 h-5 animate-spin" /> Đang xử lý...</span>
              ) : '📁 Chọn file (TXT, EPUB, HTML)'}
            </button>
            <input ref={fileInputRef} type="file" accept=".txt,.epub,.html,.htm" onChange={handleFileUpload} className="hidden" />
            <div className="flex gap-2 mt-4">
              <input type="url" value={webUrl} onChange={(e) => setWebUrl(e.target.value)}
                placeholder="Hoặc dán link..."
                className={`flex-1 px-4 py-3 rounded-xl ${theme.input} border focus:outline-none focus:ring-2 focus:ring-amber-500`}
                onKeyPress={(e) => e.key === 'Enter' && loadFromWeb()} />
              <button onClick={loadFromWeb} disabled={isLoadingWeb}
                className={`${theme.buttonPrimary} font-semibold px-5 py-3 rounded-xl disabled:opacity-50`}>
                {isLoadingWeb ? <Loader className="w-5 h-5 animate-spin" /> : '🌐'}
              </button>
            </div>
          </div>
        )}

        {chapters.length > 0 && (
          <>
            {showSettings && (
              <div className={`${theme.card} border rounded-2xl p-5 mb-4 space-y-4`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">⚙️ Cài đặt</h3>
                  <button onClick={() => setShowSettings(false)} className={`${theme.button} p-1 rounded`}><X className="w-4 h-4" /></button>
                </div>
                <div>
                  <label className={`text-sm ${theme.textMuted} flex justify-between mb-1`}>
                    <span>Tốc độ</span><span className={theme.accent}>{speechRate.toFixed(1)}x</span>
                  </label>
                  <input type="range" min="0.5" max="2" step="0.1" value={speechRate}
                    onChange={(e) => { setSpeechRate(parseFloat(e.target.value)); audioCacheRef.current.clear(); }}
                    className="w-full accent-amber-500" />
                </div>
                <div>
                  <label className={`text-sm ${theme.textMuted} flex justify-between mb-1`}>
                    <span>Cỡ chữ</span><span className={theme.accent}>{fontSize}px</span>
                  </label>
                  <input type="range" min="14" max="28" step="1" value={fontSize}
                    onChange={(e) => setFontSize(parseInt(e.target.value))} className="w-full accent-amber-500" />
                </div>
                <div>
                  <label className={`text-sm ${theme.textMuted} mb-1 block`}>Giọng</label>
                  <div className="flex gap-2">
                    <button onClick={() => { setVoiceGender('female'); audioCacheRef.current.clear(); }}
                      className={`flex-1 py-2 rounded-lg ${voiceGender === 'female' ? theme.buttonPrimary : theme.button}`}>
                      👩 {ttsMode === 'edge' ? 'Hoài My' : 'Nữ'}
                    </button>
                    <button onClick={() => { setVoiceGender('male'); audioCacheRef.current.clear(); }}
                      className={`flex-1 py-2 rounded-lg ${voiceGender === 'male' ? theme.buttonPrimary : theme.button}`}>
                      👨 {ttsMode === 'edge' ? 'Nam Minh' : 'Nam'}
                    </button>
                  </div>
                </div>
                <div className="space-y-2.5 pt-2">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm">📜 Tự động cuộn</span>
                    <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} className="w-5 h-5 accent-amber-500" />
                  </label>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm">⏭️ Auto next chương</span>
                    <input type="checkbox" checked={autoNext} onChange={(e) => setAutoNext(e.target.checked)} className="w-5 h-5 accent-amber-500" />
                  </label>
                </div>
                <button onClick={() => {
                    stopAllAudio();
                    setChapters([]);
                    setShowSettings(false);
                    audioCacheRef.current.forEach(url => URL.revokeObjectURL(url));
                    audioCacheRef.current.clear();
                    chunksCacheRef.current.clear();
                    setTranslatedChapter('');
                  }}
                  className={`w-full ${theme.button} py-2 rounded-lg text-sm`}>
                  🔄 Tải truyện khác
                </button>
                <button onClick={() => {
                    translateCacheRef.current.clear();
                    localStorage.removeItem('translate_cache');
                    setErrorMsg('Đã xóa cache dịch');
                  }}
                  className={`w-full ${theme.button} py-2 rounded-lg text-sm`}>
                  🗑️ Xóa cache dịch
                </button>
              </div>
            )}

            {showChapterList && (
              <div className={`${theme.card} border rounded-2xl mb-4 overflow-hidden`}>
                <div className={`flex items-center justify-between p-4 border-b ${theme.border}`}>
                  <h3 className="font-semibold">📑 Chương ({chapters.length})</h3>
                  <button onClick={() => setShowChapterList(false)} className={`${theme.button} p-1 rounded`}><X className="w-4 h-4" /></button>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {chapters.map((ch, idx) => (
                    <button key={idx} onClick={() => goToChapter(idx)}
                      className={`w-full text-left px-4 py-3 hover:opacity-80 ${idx === currentChapterIndex ? theme.chapterActive : ''}`}>
                      <div className="font-medium">{ch.title}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className={`${theme.card} border rounded-2xl p-5 md:p-8 mb-4`}>
              <div className={`mb-5 pb-4 border-b ${theme.border}`}>
                <h2 className={`text-2xl md:text-3xl font-bold ${theme.accent} mb-1`}>{currentChapter.title}</h2>
                <p className={`text-sm ${theme.textMuted}`}>
                  Chương {currentChapterIndex + 1}/{chapters.length}
                  {chunksOfCurrentChapter.length > 1 && (
                    <span className="ml-2">• Phần {currentChunkIndex + 1}/{chunksOfCurrentChapter.length}</span>
                  )}
                  {autoTranslate && !isTranslating && (
                    <span className={`ml-2 px-2 py-0.5 rounded text-xs border ${theme.translateBadge}`}>🤖 Đã dịch</span>
                  )}
                </p>
                {isTranslating && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className={theme.accent}>🤖 Đang dịch AI...</span>
                      <span className={theme.accent}>{translationProgress}%</span>
                    </div>
                    <div className="w-full bg-slate-700/50 rounded-full h-2 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-amber-500 to-orange-600 transition-all duration-300"
                        style={{ width: `${translationProgress}%` }}></div>
                    </div>
                  </div>
                )}
              </div>

              <div ref={textContainerRef}
                className={`${theme.textBg} rounded-xl p-5 mb-6 overflow-y-auto`}
                style={{ fontSize: `${fontSize}px`, lineHeight: 1.9, height: '45vh', minHeight: '320px', maxHeight: '500px' }}>
                <div className="whitespace-pre-wrap">
                  {displayWords.map((word, idx) => (
                    <span key={idx} ref={el => wordRefs.current[idx] = el}
                      className={`transition-all duration-150 ${
                        idx === currentWordIndex ? `${theme.highlight} px-1 rounded font-semibold` : idx < currentWordIndex ? theme.read : ''
                      }`}>
                      {word}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-center gap-3 md:gap-4">
                <button onClick={prevChapter} disabled={currentChapterIndex === 0}
                  className={`${theme.button} disabled:opacity-30 p-3 md:p-4 rounded-full hover:scale-110`}>
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button onClick={togglePlay} disabled={isLoadingAudio || isTranslating}
                  className={`${theme.buttonPrimary} p-5 md:p-6 rounded-full hover:scale-110 shadow-xl disabled:opacity-50`}>
                  {isLoadingAudio ? <Loader className="w-8 h-8 animate-spin" /> : isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 ml-1" />}
                </button>
                <button onClick={nextChapter} disabled={currentChapterIndex === chapters.length - 1}
                  className={`${theme.button} disabled:opacity-30 p-3 md:p-4 rounded-full hover:scale-110`}>
                  <ChevronRight className="w-6 h-6" />
                </button>
              </div>

              <div className={`mt-4 flex flex-wrap gap-3 justify-center text-xs ${theme.textMuted}`}>
                <span className="flex items-center gap-1">
                  {ttsMode === 'edge' ? <Sparkles className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                  {ttsMode === 'edge' ? 'Edge TTS' : 'Web Speech'}
                </span>
                {autoTranslate && <span>🤖 {translateEngine === 'groq' ? 'Groq' : 'Google'}</span>}
                {autoScroll && <span>📜</span>}
                {autoNext && <span>⏭️</span>}
                <span>{speechRate.toFixed(1)}x</span>
              </div>
            </div>

            <div className={`${theme.card} border rounded-xl p-3 text-center text-xs ${theme.textMuted}`}>
              💡 <strong>Mẹo chạy nền:</strong> Dùng <strong>Edge TTS</strong> để nghe tốt khi tắt màn hình. 
              Có thể điều khiển từ màn hình khóa (như Spotify).
            </div>
          </>
        )}
      </div>
    </div>
  );
}
