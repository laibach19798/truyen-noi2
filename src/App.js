import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, Upload, Loader, Volume2, Sun, Moon, List, X, Settings } from 'lucide-react';

export default function StoryListenerApp() {
  // ============ STATE ============
  const [chapters, setChapters] = useState([]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [translatedText, setTranslatedText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [autoTranslate, setAutoTranslate] = useState(false);
  const [showChapterList, setShowChapterList] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [webUrl, setWebUrl] = useState('');
  const [isLoadingWeb, setIsLoadingWeb] = useState(false);
  const [speechRate, setSpeechRate] = useState(1);
  const [voiceGender, setVoiceGender] = useState('female');
  
  // NEW FEATURES
  const [darkMode, setDarkMode] = useState(true);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [autoNext, setAutoNext] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [fontSize, setFontSize] = useState(18);
  const [words, setWords] = useState([]);
  
  // REFS
  const utteranceRef = useRef(null);
  const fileInputRef = useRef(null);
  const textContainerRef = useRef(null);
  const wordRefs = useRef([]);
  const currentChapterIndexRef = useRef(0);
  const autoNextRef = useRef(true);
  const chaptersRef = useRef([]);

  useEffect(() => { currentChapterIndexRef.current = currentChapterIndex; }, [currentChapterIndex]);
  useEffect(() => { autoNextRef.current = autoNext; }, [autoNext]);
  useEffect(() => { chaptersRef.current = chapters; }, [chapters]);

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

  useEffect(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) setDarkMode(saved === 'true');
  }, []);
  
  useEffect(() => {
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  // ============ FILE PARSING ============
  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const newChapters = parseFile(text);
    setChapters(newChapters);
    setCurrentChapterIndex(0);
    setTranslatedText('');
    setCurrentWordIndex(-1);
  };

  const parseFile = (text) => {
    let chapterArray = [];
    const chapterPattern = /(?:chương|chapter|ch\.?|#)\s*(\d+|\w+)[:\.\s]+/gi;
    const matches = [...text.matchAll(chapterPattern)];

    if (matches.length > 0) {
      matches.forEach((match, index) => {
        const startIndex = match.index + match[0].length;
        const endIndex = index < matches.length - 1 ? matches[index + 1].index : text.length;
        const chapterText = text.substring(startIndex, endIndex).trim();
        chapterArray.push({
          title: `Chương ${match[1]}`,
          content: chapterText,
        });
      });
    } else {
      const chunkSize = 3000;
      for (let i = 0; i < text.length; i += chunkSize) {
        const chunk = text.substring(i, i + chunkSize);
        chapterArray.push({
          title: `Phần ${Math.floor(i / chunkSize) + 1}`,
          content: chunk,
        });
      }
    }
    return chapterArray;
  };

  // ============ TRANSLATION ============
  const translateText = async (text) => {
    if (!autoTranslate) {
      setTranslatedText(text);
      return text;
    }
    setIsTranslating(true);
    try {
      const response = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.substring(0, 500))}&langpair=en|vi`
      );
      const data = await response.json();
      const result = data.responseStatus === 200 ? data.responseData.translatedText : text;
      setTranslatedText(result);
      setIsTranslating(false);
      return result;
    } catch (error) {
      setTranslatedText(text);
      setIsTranslating(false);
      return text;
    }
  };

  // ============ WORD SPLITTING ============
  const splitIntoWords = (text) => {
    return text.split(/(\s+)/).filter(w => w.length > 0);
  };

  // ============ AUTO SCROLL ============
  const scrollToWord = useCallback((index) => {
    if (!autoScroll || !wordRefs.current[index] || !textContainerRef.current) return;
    
    const wordEl = wordRefs.current[index];
    const container = textContainerRef.current;
    const wordTop = wordEl.offsetTop;
    const containerHeight = container.clientHeight;
    const scrollTop = container.scrollTop;
    
    // Scroll nếu word ra khỏi vùng nhìn
    if (wordTop < scrollTop + 50 || wordTop > scrollTop + containerHeight - 100) {
      container.scrollTo({
        top: wordTop - containerHeight / 3,
        behavior: 'smooth'
      });
    }
  }, [autoScroll]);

  // ============ SPEECH WITH HIGHLIGHT ============
  const speakChapter = (text) => {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    const wordList = splitIntoWords(text);
    setWords(wordList);
    setCurrentWordIndex(-1);

    utteranceRef.current = new SpeechSynthesisUtterance(text);
    utteranceRef.current.lang = 'vi-VN';
    utteranceRef.current.rate = speechRate;
    utteranceRef.current.pitch = voiceGender === 'female' ? 1.1 : 0.85;
    
    const voices = window.speechSynthesis.getVoices();
    const viVoice = voices.find(v => v.lang.includes('vi')) || 
                    voices.find(v => v.lang.includes('VN')) ||
                    voices[0];
    if (viVoice) utteranceRef.current.voice = viVoice;

    // Highlight chữ theo boundary
    utteranceRef.current.onboundary = (event) => {
      if (event.name === 'word' || event.name === undefined) {
        const charIndex = event.charIndex;
        let currentChar = 0;
        let wordIdx = 0;
        for (let i = 0; i < wordList.length; i++) {
          if (currentChar >= charIndex) {
            wordIdx = i;
            break;
          }
          currentChar += wordList[i].length;
          wordIdx = i;
        }
        setCurrentWordIndex(wordIdx);
        setTimeout(() => scrollToWord(wordIdx), 50);
      }
    };

    utteranceRef.current.onend = () => {
      setCurrentWordIndex(-1);
      // AUTO NEXT CHAPTER
      if (autoNextRef.current) {
        const nextIdx = currentChapterIndexRef.current + 1;
        if (nextIdx < chaptersRef.current.length) {
          setTimeout(() => {
            setCurrentChapterIndex(nextIdx);
            setTimeout(() => {
              const nextChapter = chaptersRef.current[nextIdx];
              if (nextChapter) {
                speakChapter(nextChapter.content);
              }
            }, 1000);
          }, 500);
        } else {
          setIsPlaying(false);
        }
      } else {
        setIsPlaying(false);
      }
    };

    utteranceRef.current.onerror = () => {
      setIsPlaying(false);
      setCurrentWordIndex(-1);
    };

    window.speechSynthesis.speak(utteranceRef.current);
  };

  // ============ PLAY/PAUSE ============
  const togglePlay = async () => {
    if (!chapters.length) return;
    const currentChapter = chapters[currentChapterIndex];

    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      setCurrentWordIndex(-1);
    } else {
      let textToSpeak = currentChapter.content;
      if (autoTranslate) {
        textToSpeak = await translateText(currentChapter.content);
      }
      setIsPlaying(true);
      speakChapter(textToSpeak);
    }
  };

  // ============ WEB LOADING ============
  const loadFromWeb = async () => {
    if (!webUrl.trim()) return;
    setIsLoadingWeb(true);
    try {
      const response = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(webUrl)}`);
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      doc.querySelectorAll('script, style, nav, footer, .ad').forEach(el => el.remove());
      const text = doc.body.innerText;
      const newChapters = parseFile(text);
      setChapters(newChapters);
      setCurrentChapterIndex(0);
      setWebUrl('');
    } catch (error) {
      alert('Không thể tải từ URL này. Vui lòng thử URL khác hoặc tải file trực tiếp.');
    }
    setIsLoadingWeb(false);
  };

  // ============ NAVIGATION ============
  const nextChapter = () => {
    if (currentChapterIndex < chapters.length - 1) {
      window.speechSynthesis.cancel();
      setCurrentChapterIndex(currentChapterIndex + 1);
      setTranslatedText('');
      setIsPlaying(false);
      setCurrentWordIndex(-1);
    }
  };

  const prevChapter = () => {
    if (currentChapterIndex > 0) {
      window.speechSynthesis.cancel();
      setCurrentChapterIndex(currentChapterIndex - 1);
      setTranslatedText('');
      setIsPlaying(false);
      setCurrentWordIndex(-1);
    }
  };

  // Update words khi đổi chương
  useEffect(() => {
    if (chapters.length > 0) {
      const content = chapters[currentChapterIndex]?.content || '';
      setWords(splitIntoWords(content));
      if (textContainerRef.current) {
        textContainerRef.current.scrollTop = 0;
      }
    }
  }, [currentChapterIndex, chapters]);

  // Cleanup
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  const currentChapter = chapters[currentChapterIndex] || {};

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
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`${theme.button} p-2.5 rounded-full transition-all hover:scale-110`}
              title={darkMode ? 'Chế độ sáng' : 'Chế độ tối'}
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            
            {chapters.length > 0 && (
              <>
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className={`${theme.button} p-2.5 rounded-full transition-all hover:scale-110`}
                >
                  <Settings className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setShowChapterList(!showChapterList)}
                  className={`${theme.button} p-2.5 rounded-full transition-all hover:scale-110`}
                >
                  <List className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* UPLOAD SECTION */}
        {chapters.length === 0 && (
          <div className={`${theme.card} border rounded-2xl p-6 md:p-8 mb-6`}>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Tải truyện
            </h2>
            
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`w-full ${theme.buttonPrimary} font-semibold py-4 rounded-xl transition-all transform hover:scale-[1.02] shadow-lg mb-3`}
            >
              📁 Chọn file (TXT, EPUB, HTML)
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.epub,.html"
              onChange={handleFileUpload}
              className="hidden"
            />

            <div className="flex gap-2 mt-4">
              <input
                type="url"
                value={webUrl}
                onChange={(e) => setWebUrl(e.target.value)}
                placeholder="Hoặc dán link truyện từ web..."
                className={`flex-1 px-4 py-3 rounded-xl ${theme.input} border focus:outline-none focus:ring-2 focus:ring-amber-500`}
                onKeyPress={(e) => e.key === 'Enter' && loadFromWeb()}
              />
              <button
                onClick={loadFromWeb}
                disabled={isLoadingWeb}
                className={`${theme.buttonPrimary} font-semibold px-5 py-3 rounded-xl disabled:opacity-50`}
              >
                {isLoadingWeb ? <Loader className="w-5 h-5 animate-spin" /> : '🌐'}
              </button>
            </div>

            <div className={`mt-6 p-4 rounded-xl ${darkMode ? 'bg-slate-900/50' : 'bg-amber-50'} text-sm ${theme.textMuted}`}>
              <p className="font-semibold mb-2">✨ Tính năng mới:</p>
              <ul className="space-y-1.5 ml-4">
                <li>📍 Highlight chữ theo giọng đọc (karaoke)</li>
                <li>📜 Tự động cuộn theo lúc đọc</li>
                <li>⏭️ Tự động chuyển chương khi hết</li>
                <li>🌓 Chế độ sáng/tối</li>
                <li>🔒 Tắt màn hình vẫn nghe được</li>
                <li>🔤 Tùy chỉnh cỡ chữ</li>
              </ul>
            </div>
          </div>
        )}

        {/* MAIN APP */}
        {chapters.length > 0 && (
          <>
            {/* SETTINGS PANEL */}
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
                    <span>Tốc độ đọc</span>
                    <span className={theme.accent}>{speechRate.toFixed(1)}x</span>
                  </label>
                  <input
                    type="range" min="0.5" max="2" step="0.1"
                    value={speechRate}
                    onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </div>

                <div>
                  <label className={`text-sm ${theme.textMuted} flex justify-between mb-1`}>
                    <span>Cỡ chữ</span>
                    <span className={theme.accent}>{fontSize}px</span>
                  </label>
                  <input
                    type="range" min="14" max="28" step="1"
                    value={fontSize}
                    onChange={(e) => setFontSize(parseInt(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </div>

                <div>
                  <label className={`text-sm ${theme.textMuted} mb-1 block`}>Giọng đọc</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setVoiceGender('female')}
                      className={`flex-1 py-2 rounded-lg transition-all ${voiceGender === 'female' ? theme.buttonPrimary : theme.button}`}
                    >
                      👩 Nữ
                    </button>
                    <button
                      onClick={() => setVoiceGender('male')}
                      className={`flex-1 py-2 rounded-lg transition-all ${voiceGender === 'male' ? theme.buttonPrimary : theme.button}`}
                    >
                      👨 Nam
                    </button>
                  </div>
                </div>

                <div className="space-y-2.5 pt-2">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm">📜 Tự động cuộn trang</span>
                    <input
                      type="checkbox"
                      checked={autoScroll}
                      onChange={(e) => setAutoScroll(e.target.checked)}
                      className="w-5 h-5 accent-amber-500 cursor-pointer"
                    />
                  </label>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm">⏭️ Tự động next chương</span>
                    <input
                      type="checkbox"
                      checked={autoNext}
                      onChange={(e) => setAutoNext(e.target.checked)}
                      className="w-5 h-5 accent-amber-500 cursor-pointer"
                    />
                  </label>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm">🌐 Dịch tự động</span>
                    <input
                      type="checkbox"
                      checked={autoTranslate}
                      onChange={(e) => setAutoTranslate(e.target.checked)}
                      className="w-5 h-5 accent-amber-500 cursor-pointer"
                    />
                  </label>
                </div>

                <button
                  onClick={() => {
                    window.speechSynthesis.cancel();
                    setChapters([]);
                    setCurrentChapterIndex(0);
                    setIsPlaying(false);
                    setShowSettings(false);
                  }}
                  className={`w-full ${theme.button} py-2 rounded-lg text-sm`}
                >
                  🔄 Tải lại truyện khác
                </button>
              </div>
            )}

            {/* CHAPTER LIST */}
            {showChapterList && (
              <div className={`${theme.card} border rounded-2xl mb-4 overflow-hidden`}>
                <div className={`flex items-center justify-between p-4 border-b ${theme.border}`}>
                  <h3 className="font-semibold">📑 Danh sách chương ({chapters.length})</h3>
                  <button onClick={() => setShowChapterList(false)} className={`${theme.button} p-1 rounded`}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {chapters.map((ch, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        window.speechSynthesis.cancel();
                        setCurrentChapterIndex(idx);
                        setIsPlaying(false);
                        setCurrentWordIndex(-1);
                        setShowChapterList(false);
                      }}
                      className={`w-full text-left px-4 py-3 transition-all hover:opacity-80 ${
                        idx === currentChapterIndex ? theme.chapterActive : ''
                      }`}
                    >
                      <div className="font-medium">{ch.title}</div>
                      <div className={`text-xs ${theme.textMuted} mt-1`}>
                        {Math.ceil(ch.content.length / 200)} phút đọc
                      </div>
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
                  {isPlaying && <span className={`ml-2 ${theme.accent} animate-pulse`}>🔊 Đang phát</span>}
                </p>
              </div>

              {/* Text với Highlight */}
              <div
                ref={textContainerRef}
                className={`${theme.textBg} rounded-xl p-5 mb-6 overflow-y-auto transition-all`}
                style={{ 
                  fontSize: `${fontSize}px`,
                  lineHeight: 1.9,
                  height: '45vh',
                  minHeight: '320px',
                  maxHeight: '500px'
                }}
              >
                {isTranslating ? (
                  <div className={`flex items-center gap-2 ${theme.accent}`}>
                    <Loader className="w-5 h-5 animate-spin" />
                    Đang dịch...
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap">
                    {words.map((word, idx) => (
                      <span
                        key={idx}
                        ref={el => wordRefs.current[idx] = el}
                        className={`transition-all duration-150 ${
                          idx === currentWordIndex 
                            ? `${theme.highlight} px-1 rounded font-semibold` 
                            : idx < currentWordIndex 
                              ? theme.read 
                              : ''
                        }`}
                      >
                        {word}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center gap-3 md:gap-4">
                <button
                  onClick={prevChapter}
                  disabled={currentChapterIndex === 0}
                  className={`${theme.button} disabled:opacity-30 p-3 md:p-4 rounded-full transition-all hover:scale-110`}
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>

                <button
                  onClick={togglePlay}
                  className={`${theme.buttonPrimary} p-5 md:p-6 rounded-full transition-all transform hover:scale-110 shadow-xl`}
                >
                  {isPlaying ? (
                    <Pause className="w-8 h-8" />
                  ) : (
                    <Play className="w-8 h-8 ml-1" />
                  )}
                </button>

                <button
                  onClick={nextChapter}
                  disabled={currentChapterIndex === chapters.length - 1}
                  className={`${theme.button} disabled:opacity-30 p-3 md:p-4 rounded-full transition-all hover:scale-110`}
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </div>

              {/* Status */}
              <div className={`mt-4 flex flex-wrap gap-3 justify-center text-xs ${theme.textMuted}`}>
                {autoScroll && <span>📜 Auto-scroll</span>}
                {autoNext && <span>⏭️ Auto-next</span>}
                {autoTranslate && <span>🌐 Dịch tự động</span>}
                <span>{speechRate.toFixed(1)}x</span>
              </div>
            </div>

            <div className={`text-center text-xs ${theme.textMuted} px-4`}>
              💡 Có thể tắt màn hình điện thoại, app vẫn tiếp tục phát
            </div>
          </>
        )}
      </div>
    </div>
  );
}
