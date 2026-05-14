import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, Upload, Loader, Volume2, Sun, Moon, List, X, Settings, Zap, Sparkles } from 'lucide-react';

// 🔧 URL Hugging Face Space
const EDGE_TTS_API = 'https://laibach-edge-tts-vietnamese.hf.space';

// ⚙️ Cấu hình
const MAX_CHUNK_SIZE = 800; // Chia text thành chunks nhỏ ~800 chars (audio ~30-40s)
const PREFETCH_CHUNKS = 2; // Tải trước 2 chunk kế tiếp

export default function StoryListenerApp() {
  // STATE chính
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
  
  // REFS - dùng để tránh stale closure
  const audioRef = useRef(null);
  const utteranceRef = useRef(null);
  const fileInputRef = useRef(null);
  const textContainerRef = useRef(null);
  const wordRefs = useRef([]);
  
  const currentChapterIndexRef = useRef(0);
  const currentChunkIndexRef = useRef(0);
  const autoNextRef = useRef(true);
  const chaptersRef = useRef([]);
  const ttsModeRef = useRef('edge');
  const isPlayingRef = useRef(false);
  
  // CACHE: Lưu audio đã tải để không tải lại
  const audioCacheRef = useRef(new Map()); // key: "chapterIdx_chunkIdx_voice_rate"
  const chunksCacheRef = useRef(new Map()); // key: chapterIdx, value: chunks[]
  
  // Word timing - tính theo từng chunk
  const currentChunkWordsRef = useRef([]);
  const currentChunkWordOffsetRef = useRef(0); // word index của chunk này trong toàn chapter
  
  // Animation frame ID
  const animationFrameRef = useRef(null);

  // Sync refs
  useEffect(() => { currentChapterIndexRef.current = currentChapterIndex; }, [currentChapterIndex]);
  useEffect(() => { currentChunkIndexRef.current = currentChunkIndex; }, [currentChunkIndex]);
  useEffect(() => { autoNextRef.current = autoNext; }, [autoNext]);
  useEffect(() => { chaptersRef.current = chapters; }, [chapters]);
  useEffect(() => { ttsModeRef.current = ttsMode; }, [ttsMode]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // ============ THEME ============
  const theme = darkMode ? {
    bg: 'bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900',
    card: 'bg-slate-800/60 backdrop-blur-xl border-slate-700/50',
    text: 'text-slate-100',
    textMuted: 'text-slate-400',
    accent: 'text-amber-400',
    border: 'border-slate-700/50',
    input: 'bg-slate-900/50 border-slate-700 text-slate-100 placeholder-slate-500',
    button: 'bg-slate-700/50 hover:bg-slate-600/50 text-slate-100',
    buttonPrimary: 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white',
    highlight: 'bg-amber-400/40 text-amber-100',
    read: 'text-slate-500',
    chapterActive: 'bg-amber-500/20 text-amber-300 border-l-4 border-amber-400',
    textBg: 'bg-slate-900/50',
  } : {
    bg: 'bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50',
    card: 'bg-white/80 backdrop-blur-xl border-amber-200/50 shadow-lg shadow-amber-100/50',
    text: 'text-slate-900',
    textMuted: 'text-slate-600',
    accent: 'text-orange-600',
    border: 'border-amber-200/50',
    input: 'bg-white border-amber-200 text-slate-900 placeholder-slate-400',
    button: 'bg-amber-100 hover:bg-amber-200 text-slate-800',
    buttonPrimary: 'bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white',
    highlight: 'bg-orange-300 text-orange-900',
    read: 'text-slate-400',
    chapterActive: 'bg-orange-100 text-orange-700 border-l-4 border-orange-500',
    textBg: 'bg-amber-50/50',
  };

  // LOAD SETTINGS
  useEffect(() => {
    const savedDark = localStorage.getItem('darkMode');
    if (savedDark !== null) setDarkMode(savedDark === 'true');
    const savedTts = localStorage.getItem('ttsMode');
    if (savedTts) setTtsMode(savedTts);
  }, []);
  
  useEffect(() => {
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);
  
  useEffect(() => {
    localStorage.setItem('ttsMode', ttsMode);
  }, [ttsMode]);

  // Load JSZip
  useEffect(() => {
    if (!window.JSZip) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  // ============ FIX 1: CHIA TEXT THÀNH CHUNKS ============
  // Chia text thành chunks nhỏ, ngắt ở dấu câu để mượt hơn
  const splitIntoChunks = useCallback((text, maxSize = MAX_CHUNK_SIZE) => {
    if (!text) return [];
    
    // Chia theo đoạn (paragraph) trước
    const paragraphs = text.split(/\n+/).filter(p => p.trim());
    const chunks = [];
    let currentChunk = '';
    
    for (const para of paragraphs) {
      // Nếu paragraph quá dài, chia nhỏ hơn
      if (para.length > maxSize) {
        // Push chunk hiện tại
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }
        
        // Chia paragraph theo câu
        const sentences = para.split(/(?<=[.!?。！？\n])\s+/);
        for (const sentence of sentences) {
          if ((currentChunk + sentence).length > maxSize && currentChunk) {
            chunks.push(currentChunk.trim());
            currentChunk = sentence;
          } else {
            currentChunk += (currentChunk ? ' ' : '') + sentence;
          }
        }
      } else {
        // Paragraph ngắn, ghép vào chunk hiện tại
        if ((currentChunk + para).length > maxSize && currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = para;
        } else {
          currentChunk += (currentChunk ? '\n' : '') + para;
        }
      }
    }
    
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks.filter(c => c.length > 0);
  }, []);

  // Lấy chunks cho 1 chapter (có cache)
  const getChunksForChapter = useCallback((chapterIdx) => {
    if (chunksCacheRef.current.has(chapterIdx)) {
      return chunksCacheRef.current.get(chapterIdx);
    }
    
    const chapter = chaptersRef.current[chapterIdx];
    if (!chapter) return [];
    
    const chunks = splitIntoChunks(chapter.content);
    chunksCacheRef.current.set(chapterIdx, chunks);
    return chunks;
  }, [splitIntoChunks]);

  // Tách words từ chunk
  const splitIntoWords = useCallback((text) => {
    return text.split(/(\s+)/).filter(w => w.length > 0);
  }, []);

  // Lấy tất cả words của chapter (để hiển thị)
  const allWordsOfChapter = useMemo(() => {
    if (chapters.length === 0) return [];
    const chunks = getChunksForChapter(currentChapterIndex);
    const allWords = [];
    const chunkOffsets = []; // word index bắt đầu của mỗi chunk
    
    for (const chunk of chunks) {
      chunkOffsets.push(allWords.length);
      const words = splitIntoWords(chunk);
      allWords.push(...words);
    }
    
    return { words: allWords, chunkOffsets };
  }, [currentChapterIndex, chapters, getChunksForChapter, splitIntoWords]);

  // ============ EPUB PARSER ============
  const parseEpub = async (file) => {
    let attempts = 0;
    while (!window.JSZip && attempts < 50) {
      await new Promise(r => setTimeout(r, 100));
      attempts++;
    }
    if (!window.JSZip) throw new Error('Không thể tải thư viện EPUB');

    const zip = await window.JSZip.loadAsync(file);
    const containerFile = zip.file('META-INF/container.xml');
    let opfPath = '';
    
    if (containerFile) {
      const containerXml = await containerFile.async('text');
      const opfMatch = containerXml.match(/full-path="([^"]+)"/);
      if (opfMatch) opfPath = opfMatch[1];
    }

    const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
    let chapterFiles = [];
    
    if (opfPath) {
      const opfFile = zip.file(opfPath);
      if (opfFile) {
        const opfContent = await opfFile.async('text');
        const manifestItems = {};
        const itemRegex = /<item[^>]+id="([^"]+)"[^>]+href="([^"]+)"[^>]*media-type="application\/xhtml\+xml"/g;
        let itemMatch;
        while ((itemMatch = itemRegex.exec(opfContent)) !== null) {
          manifestItems[itemMatch[1]] = itemMatch[2];
        }
        const spineRegex = /<itemref[^>]+idref="([^"]+)"/g;
        let spineMatch;
        while ((spineMatch = spineRegex.exec(opfContent)) !== null) {
          if (manifestItems[spineMatch[1]]) {
            chapterFiles.push(opfDir + manifestItems[spineMatch[1]]);
          }
        }
      }
    }

    if (chapterFiles.length === 0) {
      zip.forEach((path, fileObj) => {
        if (!fileObj.dir && /\.(x?html?|xhtml)$/i.test(path)) {
          chapterFiles.push(path);
        }
      });
      chapterFiles.sort();
    }

    const result = [];
    for (let i = 0; i < chapterFiles.length; i++) {
      const chapterFile = zip.file(chapterFiles[i]);
      if (!chapterFile) continue;
      const html = await chapterFile.async('text');
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      doc.querySelectorAll('script, style').forEach(el => el.remove());
      let title = doc.querySelector('h1, h2, h3, title')?.textContent?.trim() || '';
      if (!title) title = `Chương ${i + 1}`;
      const text = doc.body?.innerText || doc.body?.textContent || '';
      const cleanText = text.replace(/\n{3,}/g, '\n\n').trim();
      if (cleanText.length < 50) continue;
      result.push({ title: title.substring(0, 100), content: cleanText });
    }
    return result;
  };

  // ============ FILE HANDLING ============
  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsLoadingFile(true);
    setErrorMsg('');
    
    // Clear all caches
    audioCacheRef.current.clear();
    chunksCacheRef.current.clear();
    
    try {
      let newChapters = [];
      const fileName = file.name.toLowerCase();
      if (fileName.endsWith('.epub')) {
        newChapters = await parseEpub(file);
        if (newChapters.length === 0) throw new Error('EPUB không có nội dung');
      } else if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
        const text = await file.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
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
    } catch (error) {
      setErrorMsg('Lỗi: ' + error.message);
    }
    setIsLoadingFile(false);
  };

  const readFileAsText = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Không đọc được'));
      reader.readAsText(file, 'UTF-8');
    });
  };

  const parseTextFile = (text) => {
    let chapterArray = [];
    const chapterPattern = /(?:chương|chapter|ch\.?|hồi)\s*(\d+|[ivxlcdm]+)[:\.\s]+/gi;
    const matches = [...text.matchAll(chapterPattern)];
    if (matches.length > 1) {
      matches.forEach((match, index) => {
        const startIndex = match.index;
        const endIndex = index < matches.length - 1 ? matches[index + 1].index : text.length;
        const chapterText = text.substring(startIndex, endIndex).trim();
        const firstNewline = chapterText.indexOf('\n');
        const title = firstNewline > 0 ? chapterText.substring(0, firstNewline).trim() : `Chương ${index + 1}`;
        const content = firstNewline > 0 ? chapterText.substring(firstNewline + 1).trim() : chapterText;
        chapterArray.push({ title: title.substring(0, 100), content });
      });
    } else {
      const chunkSize = 3000;
      for (let i = 0; i < text.length; i += chunkSize) {
        chapterArray.push({
          title: `Phần ${Math.floor(i / chunkSize) + 1}`,
          content: text.substring(i, i + chunkSize),
        });
      }
    }
    return chapterArray;
  };

  // ============ FIX 2: FETCH EDGE TTS VỚI CACHE ============
  const fetchChunkAudio = useCallback(async (chapterIdx, chunkIdx, text) => {
    const cacheKey = `${chapterIdx}_${chunkIdx}_${voiceGender}_${speechRate}`;
    
    // Trả về từ cache nếu có
    if (audioCacheRef.current.has(cacheKey)) {
      return audioCacheRef.current.get(cacheKey);
    }
    
    const ratePercent = Math.round((speechRate - 1) * 100);
    const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;
    
    const response = await fetch(`${EDGE_TTS_API}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text.substring(0, 5000),
        voice: voiceGender,
        rate: rateStr
      })
    });
    
    if (!response.ok) {
      throw new Error('Không kết nối được Edge TTS');
    }
    
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    audioCacheRef.current.set(cacheKey, url);
    
    // Giới hạn cache: chỉ giữ 20 audio gần nhất
    if (audioCacheRef.current.size > 20) {
      const firstKey = audioCacheRef.current.keys().next().value;
      const oldUrl = audioCacheRef.current.get(firstKey);
      URL.revokeObjectURL(oldUrl);
      audioCacheRef.current.delete(firstKey);
    }
    
    return url;
  }, [voiceGender, speechRate]);

  // Prefetch chunks tiếp theo
  const prefetchNextChunks = useCallback(async (chapterIdx, chunkIdx) => {
    const chunks = getChunksForChapter(chapterIdx);
    
    for (let i = 1; i <= PREFETCH_CHUNKS; i++) {
      const nextChunkIdx = chunkIdx + i;
      
      // Prefetch trong cùng chapter
      if (nextChunkIdx < chunks.length) {
        try {
          await fetchChunkAudio(chapterIdx, nextChunkIdx, chunks[nextChunkIdx]);
        } catch (e) {
          console.log('Prefetch error:', e);
        }
      } 
      // Hoặc prefetch chapter kế tiếp
      else if (chapterIdx + 1 < chaptersRef.current.length) {
        const nextChapterChunks = getChunksForChapter(chapterIdx + 1);
        const offsetInNext = nextChunkIdx - chunks.length;
        if (offsetInNext < nextChapterChunks.length) {
          try {
            await fetchChunkAudio(chapterIdx + 1, offsetInNext, nextChapterChunks[offsetInNext]);
          } catch (e) {}
        }
      }
    }
  }, [fetchChunkAudio, getChunksForChapter]);

  // ============ FIX 3: HIGHLIGHT KHỚP VỚI AUDIO ============
  const scrollToWord = useCallback((index) => {
    if (!autoScroll || !wordRefs.current[index] || !textContainerRef.current) return;
    const wordEl = wordRefs.current[index];
    const container = textContainerRef.current;
    const wordTop = wordEl.offsetTop;
    const containerHeight = container.clientHeight;
    const scrollTop = container.scrollTop;
    if (wordTop < scrollTop + 50 || wordTop > scrollTop + containerHeight - 100) {
      container.scrollTo({ top: wordTop - containerHeight / 3, behavior: 'smooth' });
    }
  }, [autoScroll]);

  // Highlight word theo thời gian audio - chính xác hơn
  const startWordHighlight = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    const updateHighlight = () => {
      if (!audioRef.current || audioRef.current.paused || audioRef.current.ended) {
        return;
      }
      
      const currentTime = audioRef.current.currentTime;
      const duration = audioRef.current.duration;
      
      if (!duration || isNaN(duration)) {
        animationFrameRef.current = requestAnimationFrame(updateHighlight);
        return;
      }
      
      const progress = currentTime / duration;
      const chunkWords = currentChunkWordsRef.current;
      const wordOffset = currentChunkWordOffsetRef.current;
      
      if (chunkWords.length > 0) {
        // Tính total chars để phân bổ thời gian theo độ dài từ
        let totalChars = 0;
        const wordChars = chunkWords.map(w => {
          totalChars += w.length;
          return totalChars;
        });
        
        // Tìm word hiện tại dựa trên progress
        const targetChars = progress * totalChars;
        let localWordIdx = 0;
        for (let i = 0; i < wordChars.length; i++) {
          if (wordChars[i] >= targetChars) {
            localWordIdx = i;
            break;
          }
        }
        
        const globalWordIdx = wordOffset + localWordIdx;
        setCurrentWordIndex(globalWordIdx);
        scrollToWord(globalWordIdx);
      }
      
      animationFrameRef.current = requestAnimationFrame(updateHighlight);
    };
    
    animationFrameRef.current = requestAnimationFrame(updateHighlight);
  }, [scrollToWord]);

  // ============ FIX 4: PHÁT CHUNK + AUTO NEXT ĐÚNG ============
  const playChunk = useCallback(async (chapterIdx, chunkIdx) => {
    const chunks = getChunksForChapter(chapterIdx);
    
    // Hết chunks trong chapter này
    if (chunkIdx >= chunks.length) {
      // Chỉ auto next khi đã phát HẾT chương
      if (autoNextRef.current && chapterIdx + 1 < chaptersRef.current.length) {
        setCurrentChapterIndex(chapterIdx + 1);
        setCurrentChunkIndex(0);
        // Đợi state update rồi mới play
        setTimeout(() => {
          playChunk(chapterIdx + 1, 0);
        }, 500);
      } else {
        setIsPlaying(false);
        setCurrentWordIndex(-1);
      }
      return;
    }
    
    const chunkText = chunks[chunkIdx];
    if (!chunkText) {
      setIsPlaying(false);
      return;
    }
    
    // Update word tracking cho chunk này
    const chunkWords = splitIntoWords(chunkText);
    currentChunkWordsRef.current = chunkWords;
    
    // Tính word offset (index của chunk này trong toàn chapter)
    let offset = 0;
    for (let i = 0; i < chunkIdx; i++) {
      offset += splitIntoWords(chunks[i]).length;
    }
    currentChunkWordOffsetRef.current = offset;
    
    setCurrentChunkIndex(chunkIdx);
    
    if (ttsModeRef.current === 'edge') {
      setIsLoadingAudio(true);
      try {
        const audioUrl = await fetchChunkAudio(chapterIdx, chunkIdx, chunkText);
        
        if (!audioRef.current) {
          audioRef.current = new Audio();
        }
        
        audioRef.current.src = audioUrl;
        audioRef.current.playbackRate = 1;
        
        audioRef.current.onloadedmetadata = () => {
          startWordHighlight();
        };
        
        // FIX: Chỉ chuyển chunk khi audio THẬT SỰ ended
        audioRef.current.onended = () => {
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
          }
          
          // Kiểm tra: có phải đã play hết audio không?
          const audio = audioRef.current;
          if (audio && audio.currentTime >= audio.duration - 0.1) {
            // Đã hết → chuyển chunk tiếp theo
            playChunk(chapterIdx, chunkIdx + 1);
          } else {
            // Chưa hết mà bị stop → không auto next
            setIsPlaying(false);
          }
        };
        
        audioRef.current.onerror = () => {
          setIsLoadingAudio(false);
          setIsPlaying(false);
          setErrorMsg('Lỗi phát audio');
        };
        
        await audioRef.current.play();
        setIsLoadingAudio(false);
        setIsPlaying(true);
        
        // Prefetch chunks kế tiếp
        setTimeout(() => prefetchNextChunks(chapterIdx, chunkIdx), 1000);
        
      } catch (error) {
        setIsLoadingAudio(false);
        setIsPlaying(false);
        setErrorMsg('Không kết nối Edge TTS. Chuyển sang giọng nhanh.');
        setTimeout(() => {
          setTtsMode('web');
          playChunkWebSpeech(chapterIdx, chunkIdx);
        }, 1000);
      }
    } else {
      playChunkWebSpeech(chapterIdx, chunkIdx);
    }
  }, [getChunksForChapter, splitIntoWords, fetchChunkAudio, startWordHighlight, prefetchNextChunks]);

  // Web Speech cho 1 chunk
  const playChunkWebSpeech = useCallback((chapterIdx, chunkIdx) => {
    const chunks = getChunksForChapter(chapterIdx);
    if (chunkIdx >= chunks.length) {
      if (autoNextRef.current && chapterIdx + 1 < chaptersRef.current.length) {
        setCurrentChapterIndex(chapterIdx + 1);
        setCurrentChunkIndex(0);
        setTimeout(() => playChunkWebSpeech(chapterIdx + 1, 0), 500);
      } else {
        setIsPlaying(false);
      }
      return;
    }
    
    const chunkText = chunks[chunkIdx];
    const chunkWords = splitIntoWords(chunkText);
    currentChunkWordsRef.current = chunkWords;
    
    let offset = 0;
    for (let i = 0; i < chunkIdx; i++) {
      offset += splitIntoWords(chunks[i]).length;
    }
    currentChunkWordOffsetRef.current = offset;
    
    setCurrentChunkIndex(chunkIdx);
    
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
    
    utteranceRef.current = new SpeechSynthesisUtterance(chunkText);
    utteranceRef.current.lang = 'vi-VN';
    utteranceRef.current.rate = speechRate;
    utteranceRef.current.pitch = voiceGender === 'female' ? 1.1 : 0.85;
    
    const voices = window.speechSynthesis.getVoices();
    const viVoice = voices.find(v => v.lang.includes('vi')) || voices[0];
    if (viVoice) utteranceRef.current.voice = viVoice;
    
    // Highlight theo onboundary của Web Speech
    utteranceRef.current.onboundary = (event) => {
      if (event.name === 'word' || event.name === undefined) {
        const charIndex = event.charIndex;
        let currentChar = 0;
        let localWordIdx = 0;
        for (let i = 0; i < chunkWords.length; i++) {
          if (currentChar >= charIndex) { localWordIdx = i; break; }
          currentChar += chunkWords[i].length;
          localWordIdx = i;
        }
        const globalWordIdx = currentChunkWordOffsetRef.current + localWordIdx;
        setCurrentWordIndex(globalWordIdx);
        setTimeout(() => scrollToWord(globalWordIdx), 50);
      }
    };
    
    utteranceRef.current.onend = () => {
      // Đảm bảo chỉ next khi thực sự hết
      if (isPlayingRef.current) {
        playChunkWebSpeech(chapterIdx, chunkIdx + 1);
      }
    };
    
    utteranceRef.current.onerror = () => {
      setIsPlaying(false);
    };
    
    window.speechSynthesis.speak(utteranceRef.current);
    setIsPlaying(true);
  }, [getChunksForChapter, splitIntoWords, speechRate, voiceGender, scrollToWord]);

  // ============ PLAY/PAUSE ============
  const togglePlay = () => {
    if (!chapters.length) return;

    if (isPlaying || isLoadingAudio) {
      // PAUSE
      if (ttsMode === 'edge' && audioRef.current) {
        audioRef.current.pause();
      } else {
        window.speechSynthesis.cancel();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      setIsPlaying(false);
      setIsLoadingAudio(false);
    } else {
      // PLAY - tiếp tục từ chunk hiện tại
      playChunk(currentChapterIndex, currentChunkIndex);
    }
  };

  // ============ NAVIGATION ============
  const stopAllAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null; // Disable onended
      audioRef.current.src = '';
    }
    window.speechSynthesis.cancel();
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    setIsPlaying(false);
    setIsLoadingAudio(false);
    setCurrentWordIndex(-1);
  }, []);

  const nextChapter = () => {
    if (currentChapterIndex < chapters.length - 1) {
      stopAllAudio();
      setCurrentChapterIndex(currentChapterIndex + 1);
      setCurrentChunkIndex(0);
    }
  };

  const prevChapter = () => {
    if (currentChapterIndex > 0) {
      stopAllAudio();
      setCurrentChapterIndex(currentChapterIndex - 1);
      setCurrentChunkIndex(0);
    }
  };

  // FIX: Click chương → load chương đó ngay, không load từ đầu file
  const goToChapter = (idx) => {
    stopAllAudio();
    setCurrentChapterIndex(idx);
    setCurrentChunkIndex(0);
    setShowChapterList(false);
    // Scroll text về đầu
    if (textContainerRef.current) {
      textContainerRef.current.scrollTop = 0;
    }
  };

  // ============ WEB LOADING ============
  const loadFromWeb = async () => {
    if (!webUrl.trim()) return;
    setIsLoadingWeb(true);
    audioCacheRef.current.clear();
    chunksCacheRef.current.clear();
    try {
      const response = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(webUrl)}`);
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      doc.querySelectorAll('script, style, nav, footer').forEach(el => el.remove());
      const newChapters = parseTextFile(doc.body.innerText);
      setChapters(newChapters);
      setCurrentChapterIndex(0);
      setCurrentChunkIndex(0);
      setWebUrl('');
    } catch (error) {
      setErrorMsg('Không thể tải URL');
    }
    setIsLoadingWeb(false);
  };

  // Khi đổi chapter, reset chunk index
  useEffect(() => {
    if (textContainerRef.current) {
      textContainerRef.current.scrollTop = 0;
    }
  }, [currentChapterIndex]);

  // Cleanup
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
      if (audioRef.current) audioRef.current.pause();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      // Cleanup audio URLs
      audioCacheRef.current.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const currentChapter = chapters[currentChapterIndex] || {};
  const { words: displayWords = [] } = allWordsOfChapter || {};
  const chunksOfCurrentChapter = getChunksForChapter(currentChapterIndex);

  return (
    <div className={`min-h-screen ${theme.bg} ${theme.text} transition-colors duration-500`} style={{fontFamily: 'system-ui, -apple-system, sans-serif'}}>
      <div className="max-w-4xl mx-auto px-4 py-6 md:py-8">
        
        {/* HEADER */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Volume2 className={`w-7 h-7 ${theme.accent}`} />
            <h1 className={`text-2xl md:text-3xl font-bold ${theme.accent}`}>
              Truyện Nói
            </h1>
          </div>
          
          <div className="flex gap-2">
            <button onClick={() => setDarkMode(!darkMode)}
              className={`${theme.button} p-2.5 rounded-full hover:scale-110`}>
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            
            {chapters.length > 0 && (
              <>
                <button onClick={() => setShowSettings(!showSettings)}
                  className={`${theme.button} p-2.5 rounded-full hover:scale-110`}>
                  <Settings className="w-5 h-5" />
                </button>
                <button onClick={() => setShowChapterList(!showChapterList)}
                  className={`${theme.button} p-2.5 rounded-full hover:scale-110`}>
                  <List className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* TTS MODE */}
        <div className={`${theme.card} border rounded-2xl p-4 mb-4`}>
          <p className={`text-xs ${theme.textMuted} mb-2`}>🎤 Chọn giọng đọc:</p>
          <div className="flex gap-2">
            <button onClick={() => { stopAllAudio(); setTtsMode('edge'); }}
              className={`flex-1 py-3 rounded-xl flex items-center justify-center gap-2 ${
                ttsMode === 'edge' ? theme.buttonPrimary : theme.button
              }`}>
              <Sparkles className="w-4 h-4" />
              <div className="text-left">
                <div className="font-semibold text-sm">Edge TTS</div>
                <div className="text-xs opacity-80">Giọng hay</div>
              </div>
            </button>
            <button onClick={() => { stopAllAudio(); setTtsMode('web'); }}
              className={`flex-1 py-3 rounded-xl flex items-center justify-center gap-2 ${
                ttsMode === 'web' ? theme.buttonPrimary : theme.button
              }`}>
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

        {/* UPLOAD */}
        {chapters.length === 0 && (
          <div className={`${theme.card} border rounded-2xl p-6 mb-6`}>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5" /> Tải truyện
            </h2>
            
            <button onClick={() => fileInputRef.current?.click()}
              disabled={isLoadingFile}
              className={`w-full ${theme.buttonPrimary} font-semibold py-4 rounded-xl shadow-lg mb-3 disabled:opacity-50`}>
              {isLoadingFile ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader className="w-5 h-5 animate-spin" /> Đang xử lý...
                </span>
              ) : '📁 Chọn file (TXT, EPUB, HTML)'}
            </button>
            <input ref={fileInputRef} type="file" accept=".txt,.epub,.html,.htm"
              onChange={handleFileUpload} className="hidden" />

            <div className="flex gap-2 mt-4">
              <input type="url" value={webUrl}
                onChange={(e) => setWebUrl(e.target.value)}
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
            {/* SETTINGS */}
            {showSettings && (
              <div className={`${theme.card} border rounded-2xl p-5 mb-4 space-y-4`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">⚙️ Cài đặt</h3>
                  <button onClick={() => setShowSettings(false)} className={`${theme.button} p-1 rounded`}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                <div>
                  <label className={`text-sm ${theme.textMuted} flex justify-between mb-1`}>
                    <span>Tốc độ</span>
                    <span className={theme.accent}>{speechRate.toFixed(1)}x</span>
                  </label>
                  <input type="range" min="0.5" max="2" step="0.1" value={speechRate}
                    onChange={(e) => {
                      setSpeechRate(parseFloat(e.target.value));
                      audioCacheRef.current.clear(); // Clear cache khi đổi tốc độ
                    }}
                    className="w-full accent-amber-500" />
                </div>

                <div>
                  <label className={`text-sm ${theme.textMuted} flex justify-between mb-1`}>
                    <span>Cỡ chữ</span>
                    <span className={theme.accent}>{fontSize}px</span>
                  </label>
                  <input type="range" min="14" max="28" step="1" value={fontSize}
                    onChange={(e) => setFontSize(parseInt(e.target.value))}
                    className="w-full accent-amber-500" />
                </div>

                <div>
                  <label className={`text-sm ${theme.textMuted} mb-1 block`}>Giọng</label>
                  <div className="flex gap-2">
                    <button onClick={() => {
                        setVoiceGender('female');
                        audioCacheRef.current.clear();
                      }}
                      className={`flex-1 py-2 rounded-lg ${voiceGender === 'female' ? theme.buttonPrimary : theme.button}`}>
                      👩 {ttsMode === 'edge' ? 'Hoài My' : 'Nữ'}
                    </button>
                    <button onClick={() => {
                        setVoiceGender('male');
                        audioCacheRef.current.clear();
                      }}
                      className={`flex-1 py-2 rounded-lg ${voiceGender === 'male' ? theme.buttonPrimary : theme.button}`}>
                      👨 {ttsMode === 'edge' ? 'Nam Minh' : 'Nam'}
                    </button>
                  </div>
                </div>

                <div className="space-y-2.5 pt-2">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm">📜 Tự động cuộn</span>
                    <input type="checkbox" checked={autoScroll}
                      onChange={(e) => setAutoScroll(e.target.checked)}
                      className="w-5 h-5 accent-amber-500" />
                  </label>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm">⏭️ Auto next chương</span>
                    <input type="checkbox" checked={autoNext}
                      onChange={(e) => setAutoNext(e.target.checked)}
                      className="w-5 h-5 accent-amber-500" />
                  </label>
                </div>

                <button onClick={() => {
                    stopAllAudio();
                    setChapters([]);
                    setShowSettings(false);
                    audioCacheRef.current.forEach(url => URL.revokeObjectURL(url));
                    audioCacheRef.current.clear();
                    chunksCacheRef.current.clear();
                  }}
                  className={`w-full ${theme.button} py-2 rounded-lg text-sm`}>
                  🔄 Tải truyện khác
                </button>
              </div>
            )}

            {/* CHAPTER LIST */}
            {showChapterList && (
              <div className={`${theme.card} border rounded-2xl mb-4 overflow-hidden`}>
                <div className={`flex items-center justify-between p-4 border-b ${theme.border}`}>
                  <h3 className="font-semibold">📑 Chương ({chapters.length})</h3>
                  <button onClick={() => setShowChapterList(false)} className={`${theme.button} p-1 rounded`}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {chapters.map((ch, idx) => (
                    <button key={idx} onClick={() => goToChapter(idx)}
                      className={`w-full text-left px-4 py-3 hover:opacity-80 ${
                        idx === currentChapterIndex ? theme.chapterActive : ''
                      }`}>
                      <div className="font-medium">{ch.title}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* MAIN READER */}
            <div className={`${theme.card} border rounded-2xl p-5 md:p-8 mb-4`}>
              <div className={`mb-5 pb-4 border-b ${theme.border}`}>
                <h2 className={`text-2xl md:text-3xl font-bold ${theme.accent} mb-1`}>
                  {currentChapter.title}
                </h2>
                <p className={`text-sm ${theme.textMuted}`}>
                  Chương {currentChapterIndex + 1} / {chapters.length}
                  {chunksOfCurrentChapter.length > 1 && (
                    <span className="ml-2">
                      • Phần {currentChunkIndex + 1}/{chunksOfCurrentChapter.length}
                    </span>
                  )}
                  {isLoadingAudio && (
                    <span className={`ml-2 ${theme.accent} animate-pulse`}>
                      ⏳ Đang tải...
                    </span>
                  )}
                  {isPlaying && !isLoadingAudio && (
                    <span className={`ml-2 ${theme.accent} animate-pulse`}>🔊 Đang phát</span>
                  )}
                </p>
              </div>

              <div ref={textContainerRef}
                className={`${theme.textBg} rounded-xl p-5 mb-6 overflow-y-auto`}
                style={{ fontSize: `${fontSize}px`, lineHeight: 1.9, height: '45vh', minHeight: '320px', maxHeight: '500px' }}>
                <div className="whitespace-pre-wrap">
                  {displayWords.map((word, idx) => (
                    <span key={idx} ref={el => wordRefs.current[idx] = el}
                      className={`transition-all duration-150 ${
                        idx === currentWordIndex 
                          ? `${theme.highlight} px-1 rounded font-semibold` 
                          : idx < currentWordIndex ? theme.read : ''
                      }`}>
                      {word}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-center gap-3 md:gap-4">
                <button onClick={prevChapter}
                  disabled={currentChapterIndex === 0}
                  className={`${theme.button} disabled:opacity-30 p-3 md:p-4 rounded-full hover:scale-110`}>
                  <ChevronLeft className="w-6 h-6" />
                </button>

                <button onClick={togglePlay} disabled={isLoadingAudio}
                  className={`${theme.buttonPrimary} p-5 md:p-6 rounded-full hover:scale-110 shadow-xl disabled:opacity-50`}>
                  {isLoadingAudio ? (
                    <Loader className="w-8 h-8 animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="w-8 h-8" />
                  ) : (
                    <Play className="w-8 h-8 ml-1" />
                  )}
                </button>

                <button onClick={nextChapter}
                  disabled={currentChapterIndex === chapters.length - 1}
                  className={`${theme.button} disabled:opacity-30 p-3 md:p-4 rounded-full hover:scale-110`}>
                  <ChevronRight className="w-6 h-6" />
                </button>
              </div>

              <div className={`mt-4 flex flex-wrap gap-3 justify-center text-xs ${theme.textMuted}`}>
                <span className="flex items-center gap-1">
                  {ttsMode === 'edge' ? <Sparkles className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                  {ttsMode === 'edge' ? 'Edge TTS' : 'Web Speech'}
                </span>
                {autoScroll && <span>📜</span>}
                {autoNext && <span>⏭️</span>}
                <span>{speechRate.toFixed(1)}x</span>
              </div>
            </div>

            <div className={`text-center text-xs ${theme.textMuted}`}>
              💡 Tắt màn hình vẫn nghe được
            </div>
          </>
        )}
      </div>
    </div>
  );
}
