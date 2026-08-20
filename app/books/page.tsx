'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import {
  BookOpen, Globe, FileText, ExternalLink, Sparkles, Calendar,
  Loader2, ArrowLeft, Type, Sun, Moon, RotateCcw,
  CheckCircle, Play, ChevronRight, AlertCircle, ZoomIn, ZoomOut
} from 'lucide-react';
import { toast } from 'react-hot-toast';

// @ts-ignore
import mammoth from 'mammoth/mammoth.browser';

interface Book {
  id: string;
  title: string;
  language: 'Hindi' | 'English' | 'Gujarati';
  pdf_link: string;
  created_at: string;
}

type ReaderTheme = 'dark' | 'coffee' | 'white';

export default function BooksPage() {
  const { user } = useAuthStore();

  // Books List State
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLanguage, setSelectedLanguage] = useState<'English' | 'Hindi' | 'Gujarati'>('English');

  // Reading stats state
  const [todayReadingMinutes, setTodayReadingMinutes] = useState<number>(0);
  const [totalReadingMinutes, setTotalReadingMinutes] = useState<number>(0);

  // E-Reader Screen State
  const [activeBook, setActiveBook] = useState<Book | null>(null);
  const [readerHtml, setReaderHtml] = useState<string>('');
  const [readerLoading, setReaderLoading] = useState<boolean>(false);
  const [readerError, setReaderError] = useState<string>('');

  // E-Reader Customize Settings
  const [fontSize, setFontSize] = useState<number>(18); // Default 18px font
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>('white');

  // Bookmarking Feature States
  const [bookmarkIndex, setBookmarkIndex] = useState<number | null>(null);
  const [isBookmarkMode, setIsBookmarkMode] = useState<boolean>(false);
  const [showExitConfirm, setShowExitConfirm] = useState<boolean>(false);
  const [hasDirectedToBookmark, setHasDirectedToBookmark] = useState<boolean>(false);

  // Chapter Pagination States
  const [currentChapterIndex, setCurrentChapterIndex] = useState<number>(0);
  const [chapters, setChapters] = useState<string[]>([]);
  const [bookmarkChapterIndex, setBookmarkChapterIndex] = useState<number | null>(null);

  // Ref for scroll container
  const readerScrollRef = useRef<HTMLDivElement>(null);

  // Reading session time tracking refs
  const sessionStartTime = useRef<number | null>(null);
  const lastInteractionTime = useRef<number>(Date.now());
  const idleTimeoutId = useRef<any>(null);
  const isTracking = useRef<boolean>(false);
  const timerDisplayRef = useRef<HTMLSpanElement>(null);
  const timerIntervalId = useRef<any>(null);

  // Load reading statistics from the database
  const fetchReadingStats = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('reading_sessions')
        .select('seconds_read, created_at')
        .eq('user_id', user.id);

      if (error) throw error;

      if (data) {
        let totalSecs = 0;
        let todaySecs = 0;
        // Calculate today's date in local system timezone (YYYY-MM-DD format)
        const todayStr = new Date().toLocaleDateString('en-CA');

        data.forEach(session => {
          totalSecs += session.seconds_read;
          // Check if session date falls in today's local date
          const sessionDateStr = new Date(session.created_at).toLocaleDateString('en-CA');
          if (sessionDateStr === todayStr) {
            todaySecs += session.seconds_read;
          }
        });

        setTodayReadingMinutes(Math.round(todaySecs / 60));
        setTotalReadingMinutes(Math.round(totalSecs / 60));
      }
    } catch (err) {
      console.error('Error fetching reading stats:', err);
    }
  };

  useEffect(() => {
    fetchBooks();
    if (user) {
      fetchReadingStats();
    }
  }, [user]);

  useEffect(() => {
    if (activeBook) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [activeBook]);

  // Load bookmark from localStorage when activeBook changes
  useEffect(() => {
    if (activeBook) {
      const saved = localStorage.getItem(`bookmark_${activeBook.id}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setBookmarkIndex(parsed.index);
          if (typeof parsed.chapterIndex === 'number') {
            setBookmarkChapterIndex(parsed.chapterIndex);
            setCurrentChapterIndex(parsed.chapterIndex);
          } else {
            setBookmarkChapterIndex(0);
            setCurrentChapterIndex(0);
          }
        } catch (e) {
          console.error('Error parsing bookmark:', e);
          setBookmarkIndex(null);
          setBookmarkChapterIndex(null);
          setCurrentChapterIndex(0);
        }
      } else {
        setBookmarkIndex(null);
        setBookmarkChapterIndex(null);
        setCurrentChapterIndex(0);
      }
    } else {
      setIsBookmarkMode(false);
      setBookmarkIndex(null);
      setBookmarkChapterIndex(null);
      setCurrentChapterIndex(0);
      setChapters([]);
    }
  }, [activeBook]);

  // Apply visual highlight to the bookmarked element
  const applyBookmarkHighlight = () => {
    if (bookmarkIndex === null || bookmarkChapterIndex !== currentChapterIndex) return;
    
    // Select the reader content container
    const container = document.querySelector('.reader-content-area');
    if (!container) return;
    
    const blocks = Array.from(container.querySelectorAll('p, h1, h2, h3, h4, li'));
    const targetElement = blocks[bookmarkIndex] as HTMLElement;
    
    if (targetElement) {
      // Remove any existing bookmark highlights & badges inside this container
      container.querySelectorAll('.bookmarked-paragraph').forEach(el => {
        el.classList.remove('bookmarked-paragraph');
        const badge = el.querySelector('.bookmark-icon-badge');
        if (badge) badge.remove();
      });

      // Add highlight class
      targetElement.classList.add('bookmarked-paragraph');
      
      // Inject bookmark icon badge at the start of the element
      const badge = document.createElement('span');
      badge.className = 'bookmark-icon-badge inline-flex items-center justify-center mr-2 text-indigo-500 animate-pulse';
      badge.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" class="lucide lucide-bookmark inline-block align-middle">
          <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
        </svg>
      `;
      targetElement.prepend(badge);

      // Scroll smoothly to this element
      setTimeout(() => {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  };

  // Apply highlight whenever directed state becomes true, or customization changes
  useEffect(() => {
    if (hasDirectedToBookmark && bookmarkIndex !== null && bookmarkChapterIndex === currentChapterIndex) {
      const timer = setTimeout(() => {
        applyBookmarkHighlight();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [hasDirectedToBookmark, bookmarkIndex, bookmarkChapterIndex, currentChapterIndex, fontSize, readerTheme]);

  // Automatically scroll and highlight the bookmarked element when book content finishes loading
  useEffect(() => {
    if (!readerLoading && readerHtml && bookmarkIndex !== null && bookmarkChapterIndex === currentChapterIndex) {
      const timer = setTimeout(() => {
        setHasDirectedToBookmark(true);
      }, 150);
      return () => clearTimeout(timer);
    } else {
      setHasDirectedToBookmark(false);
    }
  }, [readerLoading, readerHtml, bookmarkIndex, bookmarkChapterIndex, currentChapterIndex]);

  // Scroll to top of container when chapter changes
  useEffect(() => {
    if (readerScrollRef.current) {
      readerScrollRef.current.scrollTop = 0;
    }
  }, [currentChapterIndex]);

  // Handle setting a bookmark
  const saveBookmark = (index: number, snippet: string) => {
    if (!activeBook) return;

    const data = {
      chapterIndex: currentChapterIndex,
      index,
      snippet: snippet.substring(0, 60),
      timestamp: new Date().toISOString()
    };

    localStorage.setItem(`bookmark_${activeBook.id}`, JSON.stringify(data));
    setBookmarkIndex(index);
    setBookmarkChapterIndex(currentChapterIndex);
    setIsBookmarkMode(false);
    toast.success('Bookmark saved! Next time you open this book, you will resume here. 🔖');
  };

  // Handle clearing a bookmark
  const handleClearBookmark = () => {
    if (!activeBook) return;
    localStorage.removeItem(`bookmark_${activeBook.id}`);
    setBookmarkIndex(null);
    setBookmarkChapterIndex(null);
    setIsBookmarkMode(false);
    
    // Clean up DOM highlights
    const container = document.querySelector('.reader-content-area');
    if (container) {
      container.querySelectorAll('.bookmarked-paragraph').forEach(el => {
        el.classList.remove('bookmarked-paragraph');
        const badge = el.querySelector('.bookmark-icon-badge');
        if (badge) badge.remove();
      });
    }
    toast.success('Bookmark removed.');
  };

  // Jump to saved bookmark (support cross-chapter pagination)
  const handleJumpToBookmark = () => {
    if (bookmarkIndex === null || bookmarkChapterIndex === null) return;
    if (currentChapterIndex !== bookmarkChapterIndex) {
      setCurrentChapterIndex(bookmarkChapterIndex);
    } else {
      applyBookmarkHighlight();
    }
  };

  // Intercept click inside the content area for bookmark targeting
  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isBookmarkMode) return;

    const target = e.target as HTMLElement;
    const blockElement = target.closest('p, h1, h2, h3, h4, li');
    if (!blockElement) return;

    const container = document.querySelector('.reader-content-area');
    if (!container) return;
    const blocks = Array.from(container.querySelectorAll('p, h1, h2, h3, h4, li'));
    const index = blocks.indexOf(blockElement);
    
    if (index !== -1) {
      saveBookmark(index, blockElement.textContent || '');
    }
  };

  // Toggle bookmark selection mode
  const handleBookmarkToggle = () => {
    setIsBookmarkMode(prev => !prev);
  };

  // Format seconds to MM:SS style
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Start updating the UI clock display without triggering React renders
  const startClockInterval = () => {
    if (timerIntervalId.current) clearInterval(timerIntervalId.current);
    timerIntervalId.current = setInterval(() => {
      if (timerDisplayRef.current && sessionStartTime.current) {
        const elapsedSecs = Math.floor((Date.now() - sessionStartTime.current) / 1000);
        timerDisplayRef.current.innerText = formatTime(elapsedSecs);
      }
    }, 1000);
  };

  const stopClockInterval = () => {
    if (timerIntervalId.current) {
      clearInterval(timerIntervalId.current);
      timerIntervalId.current = null;
    }
    if (timerDisplayRef.current) {
      timerDisplayRef.current.innerText = '00:00';
    }
  };

  // Save the reading session segment to Supabase (only if active & > 10s)
  const saveReadingSession = (isIdle = false) => {
    if (!activeBook || !sessionStartTime.current) return;

    const now = Date.now();
    const elapsedMs = now - sessionStartTime.current;
    let secondsRead = Math.floor(elapsedMs / 1000);

    // Rule: If triggered by idle timeout, subtract 180s (3 minutes)
    if (isIdle) {
      secondsRead = Math.max(0, secondsRead - 180);
    }

    // Rule: Only save if seconds_read > 10
    if (secondsRead > 10) {
      const payload = JSON.stringify({
        bookId: activeBook.id,
        secondsRead
      });

      // Data Transmission: sendBeacon or keepalive fetch
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon('/api/save-reading-session', blob);
      } else {
        fetch('/api/save-reading-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: payload,
          keepalive: true,
        }).catch((err) => console.error('Failed to send reading session:', err));
      }
    }

    // Reset start time so subsequent saves in the same view compute new time
    sessionStartTime.current = null;
  };

  // Setup Activity Monitor & Session Tracking
  useEffect(() => {
    if (activeBook && !readerLoading && chapters.length > 0) {
      // Start tracking
      isTracking.current = true;
      sessionStartTime.current = Date.now();
      lastInteractionTime.current = Date.now();
      startClockInterval();

      // Setup 3-minute idle timeout
      if (idleTimeoutId.current) clearTimeout(idleTimeoutId.current);
      idleTimeoutId.current = setTimeout(() => {
        saveReadingSession(true);
        isTracking.current = false;
        stopClockInterval();
      }, 180000);

      // Activity handler on user interaction
      const handleActivity = () => {
        lastInteractionTime.current = Date.now();
        
        if (!isTracking.current) {
          isTracking.current = true;
          sessionStartTime.current = Date.now();
          startClockInterval();
        }

        // Reset idle timeout
        if (idleTimeoutId.current) clearTimeout(idleTimeoutId.current);
        idleTimeoutId.current = setTimeout(() => {
          saveReadingSession(true);
          isTracking.current = false;
          stopClockInterval();
        }, 180000);
      };

      // Attach interaction listeners
      window.addEventListener('mousemove', handleActivity);
      window.addEventListener('touchstart', handleActivity);
      window.addEventListener('keydown', handleActivity);
      window.addEventListener('scroll', handleActivity, { passive: true });

      // Handle visibility changes (e.g. minimizing app or switching tabs)
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
          saveReadingSession(false);
          isTracking.current = false;
          stopClockInterval();
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
        // Save session on exit
        saveReadingSession(false);

        // Remove listeners
        window.removeEventListener('mousemove', handleActivity);
        window.removeEventListener('touchstart', handleActivity);
        window.removeEventListener('keydown', handleActivity);
        window.removeEventListener('scroll', handleActivity);
        document.removeEventListener('visibilitychange', handleVisibilityChange);

        if (idleTimeoutId.current) clearTimeout(idleTimeoutId.current);
        stopClockInterval();
        isTracking.current = false;
        sessionStartTime.current = null;
      };
    }
  }, [activeBook, readerLoading, chapters.length]);

  const fetchBooks = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('books')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBooks(data || []);
    } catch (err: any) {
      console.error('Error fetching books:', err);
      toast.error('Failed to load books catalog.');
    } finally {
      setIsLoading(false);
    }
  };

  // Filter books by language selection
  const filteredBooks = React.useMemo(() => {
    return books.filter(b => b.language === selectedLanguage);
  }, [books, selectedLanguage]);

  // Normalize Dropbox URLs to serve raw binary files
  const normalizeDropboxUrl = (url: string) => {
    if (!url) return '';
    let cleanUrl = url.trim();
    if (cleanUrl.includes('dropbox.com')) {
      if (cleanUrl.includes('dl=0')) {
        cleanUrl = cleanUrl.replace('dl=0', 'raw=1');
      } else if (!cleanUrl.includes('raw=1') && !cleanUrl.includes('dl=1')) {
        cleanUrl += cleanUrl.includes('?') ? '&raw=1' : '?raw=1';
      }
    }
    return cleanUrl;
  };

  // Launch Reader
  const handleOpenReader = async (book: Book) => {
    setActiveBook(book);
    setReaderLoading(true);
    setReaderError('');
    setReaderHtml('');

    const rawUrl = normalizeDropboxUrl(book.pdf_link);

    // If it is a PDF or other, we will use a fallback preview wrapper
    const isDocx = rawUrl.toLowerCase().includes('.docx') || book.title.toLowerCase().includes('docx');

    if (!isDocx) {
      // Fallback directly for non-docx documents (e.g. PDF)
      setReaderLoading(false);
      return;
    }

    try {
      const proxyUrl = `/api/fetch-book?url=${encodeURIComponent(rawUrl)}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error(`Failed to load document (${res.status})`);
      
      const buffer = await res.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
      const masterHtml = result.value || '<p className="text-center">This document contains no readable text content.</p>';
      
      setReaderHtml(masterHtml);

      // Split masterHtml into chapters using h1 tags
      const rawChapters = masterHtml.split(/(?=<h1)/i);
      let parsedChapters = rawChapters.filter((chunk: string) => {
        const trimmed = chunk.trim();
        return trimmed.length > 0 && /<h1/i.test(trimmed);
      });
      if (parsedChapters.length === 0) {
        parsedChapters = [masterHtml];
      }
      setChapters(parsedChapters);

      // Restore chapter index if bookmark exists for this book, otherwise default to 0
      const saved = localStorage.getItem(`bookmark_${book.id}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (typeof parsed.chapterIndex === 'number' && parsed.chapterIndex < parsedChapters.length) {
            setCurrentChapterIndex(parsed.chapterIndex);
          } else {
            setCurrentChapterIndex(0);
          }
        } catch (e) {
          setCurrentChapterIndex(0);
        }
      } else {
        setCurrentChapterIndex(0);
      }
    } catch (err: any) {
      console.error('Error parsing docx file:', err);
      setReaderError(
        'Unable to fetch or display this document natively. The URL may be restricted or blocked by CORS. Please use the backup link below to open the file directly.'
      );
    } finally {
      setReaderLoading(false);
    }
  };

  const handleCloseReader = () => {
    setActiveBook(null);
    setReaderHtml('');
    setReaderError('');
    fetchReadingStats();
  };

  // Exit reader with prompt checking
  const handleExitClick = () => {
    if (bookmarkIndex !== null) {
      handleCloseReader();
    } else {
      setShowExitConfirm(true);
    }
  };

  // Dynamic theme styling to bypass global stylesheet overrides
  const getThemeStyles = (theme: ReaderTheme) => {
    switch (theme) {
      case 'dark':
        return {
          container: { backgroundColor: '#1e2026', color: '#f1f5f9' },
          header: { backgroundColor: 'rgba(30, 32, 38, 0.95)', color: '#f1f5f9', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }
        };
      case 'coffee':
        return {
          container: { backgroundColor: '#ebdccb', color: '#4e3629' },
          header: { backgroundColor: 'rgba(235, 220, 203, 0.95)', color: '#4e3629', borderBottom: '1px solid rgba(0, 0, 0, 0.08)' }
        };
      default: // white
        return {
          container: { backgroundColor: '#ffffff', color: '#0f172a' },
          header: { backgroundColor: 'rgba(255, 255, 255, 0.95)', color: '#0f172a', borderBottom: '1px solid #e2e8f0' }
        };
    }
  };

  const getLanguageColor = (lang: string) => {
    switch (lang) {
      case 'Hindi': return 'bg-orange-50 border-orange-200 text-orange-700 shadow-orange-100/30';
      case 'Gujarati': return 'bg-purple-50 border-purple-200 text-purple-700 shadow-purple-100/30';
      default: return 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-indigo-100/30';
    }
  };

  return (
    <div className="pb-32 px-4 md:px-0">
      <AnimatePresence mode="wait">
        {!activeBook ? (
          /* ==========================================================================
             1. BOOKS LIST VIEW (Visual replica of Podcast screen)
             ========================================================================== */
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-10"
          >
            {/* Banner / Header */}
            <div className="relative overflow-hidden bg-gradient-to-r from-indigo-900 to-slate-900 rounded-[2.5rem] p-8 md:p-12 text-white border border-slate-800 shadow-2xl">
              <div className="absolute -top-12 -right-12 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="max-w-2xl space-y-4 relative z-10">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-500/20 text-indigo-300 rounded-full text-xs font-black uppercase tracking-wider">
                  <BookOpen size={14} className="animate-pulse" /> Sadhana Library
                </div>
                <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-tight">
                  Nourish Your Devotion
                </h2>
                <p className="text-sm md:text-base font-bold text-slate-300 leading-relaxed">
                  Access sacred scriptures and reading materials to track your daily progress. Select a language to filter the list and tap a book to launch the premium reader.
                </p>
              </div>
            </div>

            {/* Filters Bar */}
            <div className="flex flex-col lg:flex-row gap-6 justify-between items-start lg:items-center">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-wrap">
                <div>
                  <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                    <Sparkles size={20} className="text-indigo-600 animate-spin" style={{ animationDuration: '6s' }} /> Available Scriptures
                  </h3>
                  <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-wider">Expand your knowledge base</p>
                </div>

                {/* Global Language Selector Pills (Matching Podcast Style) */}
                <div className="flex gap-0.5 bg-slate-100 p-1 rounded-xl border border-slate-200/50 shadow-sm self-start sm:self-center">
                  {(['English', 'Hindi', 'Gujarati'] as const).map((lang) => {
                    const isActive = selectedLanguage === lang;
                    const shortForm = lang === 'English' ? 'ENG' : lang === 'Hindi' ? 'HIN' : 'GUJ';
                    return (
                      <button
                        key={lang}
                        onClick={() => setSelectedLanguage(lang)}
                        className={`relative px-3.5 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all cursor-pointer text-center ${
                          isActive ? 'text-white' : 'text-slate-500 hover:text-indigo-600'
                        }`}
                        style={{ minWidth: '42px' }}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="activeLanguageBg"
                            className="absolute inset-0 bg-indigo-600 rounded-lg"
                            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                          />
                        )}
                        <span className="relative z-10">{shortForm}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Reading Stats Widget */}
                <div className="flex items-center gap-4 bg-indigo-50/50 border border-indigo-100/50 px-4 py-1.5 rounded-2xl shadow-sm self-start sm:self-center">
                  <div className="flex items-center gap-2">
                    <span className="text-indigo-650 text-xs">📅</span>
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">Today's Read</p>
                      <p className="text-xs font-black text-slate-800 leading-none">{todayReadingMinutes} mins</p>
                    </div>
                  </div>
                  <div className="w-px h-6 bg-indigo-100/50" />
                  <div className="flex items-center gap-2">
                    <span className="text-indigo-650 text-xs">🏆</span>
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">Total Read</p>
                      <p className="text-xs font-black text-slate-800 leading-none">{totalReadingMinutes} mins</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Book Cards Grid */}
            {isLoading ? (
              <div className="text-center py-20 text-slate-400 font-bold flex flex-col items-center justify-center gap-3">
                <Loader2 className="animate-spin text-indigo-600" size={32} />
                <span>Loading Library Catalog...</span>
              </div>
            ) : filteredBooks.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-100 text-slate-400 font-bold">
                No books found under the selected language yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredBooks.map((book) => {
                  const isDocx = book.pdf_link.toLowerCase().includes('.docx') || book.title.toLowerCase().includes('docx');
                  return (
                    <motion.div
                      key={book.id}
                      onClick={() => handleOpenReader(book)}
                      whileHover={{ scale: 1.02, y: -6 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      className="bg-white border border-slate-100 hover:shadow-indigo-500/5 rounded-[2rem] p-6 shadow-sm flex flex-col justify-between hover:shadow-xl transition-all group relative overflow-hidden cursor-pointer"
                    >
                      {/* Header tag */}
                      <div className="flex justify-between items-start mb-6">
                        <span className={`px-3 py-1 border rounded-full text-[10px] font-black uppercase tracking-wider ${getLanguageColor(book.language)}`}>
                          {book.language} Sadhana
                        </span>
                        <span className="text-[10px] font-black text-slate-400 bg-slate-50 border border-slate-100 px-3 py-1 rounded-full uppercase tracking-wider">
                          {isDocx ? 'NATIVE DOCX' : 'PDF BOOK'}
                        </span>
                      </div>

                      {/* Body Content */}
                      <div className="space-y-3 flex-1 flex flex-col justify-between">
                        <div>
                          <h4 className="text-lg font-black text-slate-800 leading-snug group-hover:text-indigo-600 transition-colors">
                            {book.title}
                          </h4>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Spiritual Text Document</p>
                        </div>

                        <div className="flex gap-4 items-center justify-between text-xs font-bold text-slate-505 pt-4 border-t border-slate-50">
                          <span className="flex items-center gap-1.5 text-slate-400">
                            <FileText size={14} /> Ready to read
                          </span>
                        </div>
                      </div>

                      {/* Footer Buttons */}
                      <div className="mt-6">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenReader(book);
                          }}
                          className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-indigo-100"
                        >
                          Read Now
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        ) : (
          /* ==========================================================================
             2. PREMIUM E-READER VIEW (Replaces whole page view)
             ========================================================================== */
          <motion.div
            key="reader"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[100] w-screen h-screen flex flex-col overflow-hidden"
            style={getThemeStyles(readerTheme).container}
          >
            {/* Top Toolbar - Kindle-style Header */}
            <header 
              style={getThemeStyles(readerTheme).header} 
              className="px-6 py-4 flex flex-wrap items-center justify-between backdrop-blur-md select-none sticky top-0 z-30"
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={handleExitClick}
                  className="p-2 hover:bg-black/5 rounded-xl transition-all cursor-pointer flex items-center gap-1 font-bold text-xs uppercase"
                >
                  <ArrowLeft size={16} /> Exit Reader
                </button>
                <div className="w-px h-6 bg-black/10 hidden sm:block" />
                <div className="hidden sm:block">
                  <h3 className="font-black text-sm tracking-tight truncate max-w-xs">{activeBook.title}</h3>
                  <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest leading-none mt-0.5">{activeBook.language} scripture</p>
                </div>
                {/* Active Reading Timer */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-500 rounded-xl font-bold text-xs select-none shadow-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-80">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span ref={timerDisplayRef} className="font-mono tracking-wider">00:00</span>
                </div>
              </div>

              {/* Reader Controls */}
              <div className="flex items-center gap-4">
                {/* Bookmark Button */}
                {bookmarkIndex !== null ? (
                  <div 
                    style={{ 
                      backgroundColor: readerTheme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)', 
                      borderColor: readerTheme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)' 
                    }}
                    className="flex items-center border rounded-xl p-0.5"
                  >
                    <button
                      onClick={handleJumpToBookmark}
                      style={{ color: readerTheme === 'dark' ? '#818cf8' : '#4f46e5' }}
                      className="px-2.5 py-1 hover:bg-black/5 rounded-lg text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer"
                      title="Jump to Bookmark"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
                      </svg>
                      Jump
                    </button>
                    <button
                      onClick={handleClearBookmark}
                      className="p-1 hover:bg-red-500/10 text-red-500 rounded-lg cursor-pointer text-[10px] px-1.5"
                      title="Clear Bookmark"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleBookmarkToggle}
                    style={{
                      backgroundColor: isBookmarkMode 
                        ? '#f59e0b' 
                        : (readerTheme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'),
                      color: isBookmarkMode ? '#ffffff' : 'inherit'
                    }}
                    className="px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-1 transition-all cursor-pointer hover:bg-black/10"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
                    </svg>
                    {isBookmarkMode ? 'Cancel' : 'Bookmark'}
                  </button>
                )}

                {/* Font Size Customizer */}
                <div className="flex items-center gap-1 bg-black/5 p-1 rounded-xl">
                  <button
                    onClick={() => setFontSize(prev => Math.max(14, prev - 2))}
                    disabled={fontSize <= 14}
                    className="p-1.5 hover:bg-black/5 rounded-lg disabled:opacity-30 cursor-pointer"
                    title="Decrease Text Size"
                  >
                    <ZoomOut size={16} />
                  </button>
                  <span className="text-[10px] font-black w-8 text-center">{fontSize}px</span>
                  <button
                    onClick={() => setFontSize(prev => Math.min(30, prev + 2))}
                    disabled={fontSize >= 30}
                    className="p-1.5 hover:bg-black/5 rounded-lg disabled:opacity-30 cursor-pointer"
                    title="Increase Text Size"
                  >
                    <ZoomIn size={16} />
                  </button>
                </div>

                {/* Theme Selector */}
                <div className="flex gap-1.5 bg-black/5 p-1 rounded-xl">
                  {(['dark', 'coffee', 'white'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setReaderTheme(t)}
                      className={`w-6 h-6 rounded-lg border transition-all cursor-pointer relative ${
                        t === 'dark' ? 'bg-[#1e2026] border-white/20' :
                        t === 'coffee' ? 'bg-[#ebdccb] border-[#4e3629]/20' :
                        'bg-white border-black/20'
                      }`}
                      title={`${t.charAt(0).toUpperCase() + t.slice(1)} Mode`}
                    >
                      {readerTheme === t && (
                        <span className={`absolute inset-0 flex items-center justify-center text-[10px] font-black ${
                          t === 'dark' ? 'text-white' : 'text-[#4e3629]'
                        }`}>✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </header>

            {isBookmarkMode ? (
              <div className="bg-amber-500 text-white text-xs font-black text-center py-2.5 uppercase tracking-widest animate-pulse select-none z-10 shadow-md">
                📌 Tap on the paragraph or block where you want to set your bookmark.
              </div>
            ) : (bookmarkIndex !== null && hasDirectedToBookmark) ? (
              <button 
                onClick={handleClearBookmark}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white text-xs font-black text-center py-2.5 uppercase tracking-widest animate-pulse select-none z-10 shadow-md cursor-pointer block transition-colors border-none outline-none"
                title="Click to remove bookmark"
              >
                🔖 Resumed from bookmark. Click here to clear it and set a new one.
              </button>
            ) : null}

            {/* Reading Content Pane */}
            <div ref={readerScrollRef} className="flex-1 overflow-y-auto px-4 sm:px-8 md:px-16 pt-6 pb-32 sm:pb-24 flex justify-center">
              <div className="w-full max-w-7xl space-y-8">
                {readerLoading ? (
                  /* Loading Spinner */
                  <div className="flex flex-col items-center justify-center py-32 space-y-4">
                    <Loader2 className="animate-spin text-indigo-500 h-10 w-10" />
                    <p className="font-bold text-sm opacity-60">Rendering document content natively...</p>
                  </div>
                ) : readerError ? (
                  /* Parsing Failure Fallback Screen */
                  <div className="bg-red-500/10 border border-red-500/20 p-8 rounded-3xl space-y-6 text-center text-slate-800">
                    <AlertCircle className="mx-auto text-red-500" size={40} />
                    <div>
                      <h4 className="font-black text-lg text-red-600">Native Reader Unavailable</h4>
                      <p className="text-sm font-bold opacity-80 mt-2 max-w-md mx-auto leading-relaxed">
                        {readerError}
                      </p>
                    </div>
                    <div className="pt-4 flex flex-col sm:flex-row justify-center gap-3">
                      <a
                        href={normalizeDropboxUrl(activeBook.pdf_link)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all inline-flex items-center justify-center gap-1.5 shadow-lg shadow-red-500/10"
                      >
                        <ExternalLink size={14} /> Open Direct File Link
                      </a>
                      <button
                        onClick={handleCloseReader}
                        className="px-6 py-3 bg-slate-800/10 hover:bg-slate-800/20 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                      >
                        Go Back to Library
                      </button>
                    </div>
                  </div>
                ) : chapters.length > 0 ? (
                  /* Native parsed .docx View with chapter pagination */
                  <div className="flex flex-col min-h-full">
                    <article 
                      style={{ fontSize: `${fontSize}px`, lineHeight: 1.6 }}
                      className="font-serif prose max-w-none prose-slate transition-all select-text flex-grow"
                    >
                      <div 
                        onClick={handleContentClick}
                        className={`space-y-6 reader-content-area ${isBookmarkMode ? 'selection-mode-active' : ''}`}
                        dangerouslySetInnerHTML={{ __html: chapters[currentChapterIndex] || '' }} 
                      />
                    </article>

                    {/* Pagination Controls (Enhanced for Mobile Viewport Visibility) */}
                    {chapters.length > 1 && (
                      <div className="mt-12 pt-8 pb-8 border-t border-black/10 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 select-none relative z-20">
                        <button
                          onClick={() => setCurrentChapterIndex(prev => Math.max(0, prev - 1))}
                          disabled={currentChapterIndex === 0}
                          className="w-full sm:w-auto px-6 py-3.5 bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 rounded-2xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm active:scale-95"
                        >
                          ← Previous Chapter
                        </button>
                        
                        <span className="text-xs font-black opacity-70 uppercase tracking-widest my-1 sm:my-0">
                          Chapter {currentChapterIndex + 1} of {chapters.length}
                        </span>
                        
                        <button
                          onClick={() => setCurrentChapterIndex(prev => Math.min(chapters.length - 1, prev + 1))}
                          disabled={currentChapterIndex >= chapters.length - 1}
                          className="w-full sm:w-auto px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md shadow-indigo-600/30 active:scale-95"
                        >
                          Next Chapter →
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Fallback Embedded Preview View (for non-docx/PDF links) */
                  <div className="w-full h-[70vh] flex flex-col bg-white/5 rounded-3xl overflow-hidden border border-black/5">
                    <div className="p-4 bg-black/5 border-b border-black/5 flex items-center justify-between text-xs font-bold opacity-75">
                      <span>Standard PDF Viewer Mode</span>
                      <a
                        href={normalizeDropboxUrl(activeBook.pdf_link)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:underline flex items-center gap-1"
                      >
                        <ExternalLink size={12} /> Open in new tab
                      </a>
                    </div>
                    <iframe
                      src={`https://docs.google.com/gview?url=${encodeURIComponent(normalizeDropboxUrl(activeBook.pdf_link))}&embedded=true`}
                      className="w-full flex-1 border-none bg-white"
                      title={activeBook.title}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Custom Serif Typography CSS injection */}
            <style jsx global>{`
              .font-serif {
                font-family: Georgia, Cambria, "Times New Roman", Times, serif;
              }
              .font-serif h1, .font-serif h2, .font-serif h3, .font-serif h4 {
                font-weight: 900;
                margin-top: 1.5em;
                margin-bottom: 0.5em;
                line-height: 1.25;
                color: inherit !important;
              }
              .font-serif h1 { font-size: 1.8em; }
              .font-serif h2 { font-size: 1.5em; }
              .font-serif h3 { font-size: 1.3em; }
              .font-serif p {
                margin-bottom: 1.2em;
                text-align: justify;
                color: inherit !important;
              }
              .font-serif ul, .font-serif ol {
                margin-left: 1.5em;
                margin-bottom: 1.2em;
                color: inherit !important;
              }
              .font-serif li {
                margin-bottom: 0.5em;
                color: inherit !important;
              }
              
              /* Selection Mode & Bookmark Highlights */
              .selection-mode-active p,
              .selection-mode-active h1,
              .selection-mode-active h2,
              .selection-mode-active h3,
              .selection-mode-active h4,
              .selection-mode-active li {
                cursor: pointer;
                transition: all 0.2s ease;
                position: relative;
              }
              .selection-mode-active p:hover,
              .selection-mode-active h1:hover,
              .selection-mode-active h2:hover,
              .selection-mode-active h3:hover,
              .selection-mode-active h4:hover,
              .selection-mode-active li:hover {
                background-color: rgba(99, 102, 241, 0.08);
                outline: 2px dashed #6366f1;
                border-radius: 4px;
              }
              .bookmarked-paragraph {
                background-color: rgba(99, 102, 241, 0.06) !important;
                border-left: 4px solid #6366f1 !important;
                padding-left: 12px !important;
                transition: all 0.3s ease;
              }
            `}</style>

            {/* 1. Exit Confirmation Modal */}
            <AnimatePresence>
              {showExitConfirm && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 select-none"
                  onClick={() => setShowExitConfirm(false)}
                >
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    style={{
                      backgroundColor: readerTheme === 'dark' ? '#1e2026' : (readerTheme === 'coffee' ? '#ebdccb' : '#ffffff'),
                      color: readerTheme === 'dark' ? '#f1f5f9' : '#0f172a',
                      borderColor: readerTheme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
                    }}
                    className="w-full max-w-md rounded-3xl p-6 border shadow-2xl space-y-6"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
                        </svg>
                      </div>
                      <div>
                        <h4 className="font-black text-base">Bookmark Progress?</h4>
                        <p className="text-[10px] font-bold opacity-60 uppercase tracking-wider mt-0.5">Leaving library reader</p>
                      </div>
                    </div>

                    <p className="text-sm font-bold opacity-80 leading-relaxed">
                      You haven't set a bookmark in this book yet. Would you like to mark where you are so you can easily resume next time?
                    </p>

                    <div className="flex gap-3 justify-end pt-2">
                      <button
                        onClick={() => {
                          setShowExitConfirm(false);
                          handleCloseReader();
                        }}
                        style={{
                          backgroundColor: readerTheme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
                        }}
                        className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all hover:bg-black/10 cursor-pointer"
                      >
                        No, Exit
                      </button>
                      <button
                        onClick={() => {
                          setShowExitConfirm(false);
                          setIsBookmarkMode(true);
                        }}
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-indigo-600/15 cursor-pointer"
                      >
                        Yes, Bookmark
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
