'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import {
  Radio, Play, Pause, CheckCircle, HelpCircle,
  Volume2, ShieldCheck, Sparkles, Award, ArrowRight,
  AlertCircle, ChevronRight, X, VolumeX, RotateCcw, Lock
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import confetti from 'canvas-confetti';

interface Audiobook {
  id: string;
  category: string;
  title: string;
  audio_url: string;
  created_at: string;
  language?: string;
  quiz_questions: QuizQuestion[];
}

interface QuizQuestion {
  id: string;
  audiobook_id: string;
  question_text: string;
  options: string[];
  correct_answer: string;
}

interface UserProgress {
  [audiobookId: string]: {
    is_completed: boolean;
    completed_at?: string;
  };
}

export default function PodcastAndQuizzesPage() {
  const { user } = useAuthStore();

  // Dynamically load completion threshold percentage from app_settings (default to 80%)
  const [completionThreshold, setCompletionThreshold] = useState<number>(0.80);

  // Data State
  const [audiobooks, setAudiobooks] = useState<Audiobook[]>([]);
  const [userProgress, setUserProgress] = useState<UserProgress>({});
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ALL');

  // Custom Audio Player State
  const [playingBook, setPlayingBook] = useState<Audiobook | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);

  // Anti-Cheat Completed Tracker Ref/State
  // We use a Set to track the actual unique seconds listened to
  const uniqueListenedSecondsRef = useRef<Set<number>>(new Set());
  const [listenedSecondsCount, setListenedSecondsCount] = useState(0);
  const [hasCompletedInSession, setHasCompletedInSession] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Quiz Modal State
  const [activeQuizBook, setActiveQuizBook] = useState<Audiobook | null>(null);
  const [isCheckingProgress, setIsCheckingProgress] = useState(false);
  const [isQuizLocked, setIsQuizLocked] = useState(true);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [alreadyCompletedQuiz, setAlreadyCompletedQuiz] = useState(false);
  const [completedQuizTitles, setCompletedQuizTitles] = useState<string[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState('English');

  useEffect(() => {
    fetchAudiobooksAndProgress();
  }, [user]);

  // Audio HTML5 Events Handler Setup
  useEffect(() => {
    if (audioRef.current) {
      const audio = audioRef.current;

      const onPlay = () => setIsPlaying(true);
      const onPause = () => setIsPlaying(false);
      const onLoadedMetadata = () => {
        setDuration(audio.duration);
        // Reset anti-cheat tracker for the new loaded audiobook
        uniqueListenedSecondsRef.current.clear();
        setListenedSecondsCount(0);
        setHasCompletedInSession(false);
      };

      const onTimeUpdate = () => {
        setCurrentTime(audio.currentTime);

        // Anti-Cheat Stopwatch Tracking Logic
        // We track actual played seconds in real-time if the audio is playing and a valid duration exists
        if (playingBook && !audio.paused && audio.duration > 0) {
          const currentSecond = Math.floor(audio.currentTime);
          const isAlreadyCompleted = userProgress[playingBook.id]?.is_completed || hasCompletedInSession;

          if (!isAlreadyCompleted) {
            const uniqueSeconds = uniqueListenedSecondsRef.current;
            uniqueSeconds.add(currentSecond);
            setListenedSecondsCount(uniqueSeconds.size);

            // Completion boundary is based on threshold constant
            const targetSeconds = Math.floor(audio.duration * completionThreshold);
            if (uniqueSeconds.size >= targetSeconds && targetSeconds > 0) {
              triggerAudiobookCompletion(playingBook.id);
            }
          }
        }
      };

      audio.addEventListener('play', onPlay);
      audio.addEventListener('pause', onPause);
      audio.addEventListener('loadedmetadata', onLoadedMetadata);
      audio.addEventListener('timeupdate', onTimeUpdate);

      // Restore volume setting
      audio.volume = isMuted ? 0 : volume;

      return () => {
        audio.removeEventListener('play', onPlay);
        audio.removeEventListener('pause', onPause);
        audio.removeEventListener('loadedmetadata', onLoadedMetadata);
        audio.removeEventListener('timeupdate', onTimeUpdate);
      };
    }
  }, [playingBook, userProgress, volume, isMuted, hasCompletedInSession, completionThreshold]);

  // Fetch Audiobooks and User Progress combined
  const fetchAudiobooksAndProgress = async () => {
    setIsLoading(true);
    try {
      // 0. Fetch dynamic podcast completion threshold setting
      const { data: thresholdData } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'podcast_completion_threshold')
        .maybeSingle();

      if (thresholdData && thresholdData.value) {
        const parsedVal = parseFloat(thresholdData.value);
        if (!isNaN(parsedVal)) {
          setCompletionThreshold(parsedVal / 100);
        }
      }

      // 1. Fetch audiobooks
      const { data: books, error: booksError } = await supabase
        .from('audiobooks')
        .select('*')
        .order('created_at', { ascending: true });

      if (booksError) throw booksError;

      // 2. Fetch quizzes questions
      const { data: questions, error: qError } = await supabase
        .from('quiz_questions')
        .select('*');

      if (qError) throw qError;

      // Map questions to respective audiobooks
      const enrichedBooks = (books || []).map(b => ({
        ...b,
        quiz_questions: (questions || []).filter(q => q.audiobook_id === b.id)
      }));

      setAudiobooks(enrichedBooks);

      // 3. Fetch progress for logged-in user
      if (user) {
        const { data: progress, error: progressError } = await supabase
          .from('user_audiobook_progress')
          .select('audiobook_id, is_completed, completed_at')
          .eq('user_id', user.id);

        if (progressError) throw progressError;

        const progressMap: UserProgress = {};
        progress?.forEach(p => {
          progressMap[p.audiobook_id] = {
            is_completed: p.is_completed,
            completed_at: p.completed_at
          };
        });
        setUserProgress(progressMap);

        // 4. Fetch completed quizzes from quiz_submissions joining audiobook titles
        const { data: quizData, error: quizError } = await supabase
          .from('quiz_submissions')
          .select(`
            audiobooks:audiobooks!audiobook_id (
              title
            )
          `)
          .eq('user_id', user.id);

        if (!quizError && quizData) {
          const completedTitles = quizData
            .map((q: any) => q.audiobooks?.title)
            .filter(Boolean);
          setCompletedQuizTitles(completedTitles);
        }
      }

    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load podcast materials.");
    } finally {
      setIsLoading(false);
    }
  };

  // Trigger Supabase Upsert in background when completion is achieved (Anti-Cheat proof)
  const triggerAudiobookCompletion = async (audiobookId: string) => {
    if (!user) return;
    setHasCompletedInSession(true);

    try {
      const { error } = await supabase
        .from('user_audiobook_progress')
        .upsert({
          user_id: user.id,
          audiobook_id: audiobookId,
          is_completed: true,
          completed_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,audiobook_id'
        });

      if (error) throw error;

      // Update local state instantly
      setUserProgress(prev => ({
        ...prev,
        [audiobookId]: { is_completed: true, completed_at: new Date().toISOString() }
      }));

      // Trigger Confetti and Celebration Toast!
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.8 }
      });

      toast.success("Congratulations! Chapter Completed! 🎧🎉 Quiz Unlocked!");

    } catch (err) {
      console.error("Failed to save progress:", err);
      toast.error("Could not upload completion status.");
    }
  };

  // Play Audiobook Trigger
  const handlePlayAudiobook = (book: Audiobook) => {
    if (playingBook?.id === book.id) {
      if (isPlaying) {
        audioRef.current?.pause();
      } else {
        audioRef.current?.play();
      }
    } else {
      setPlayingBook(book);
      setCurrentTime(0);
      setDuration(0);
      setIsPlaying(false);
      // Actual play starts in loaded metadata event to prevent sync errors
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.src = book.audio_url;
          audioRef.current.play();
        }
      }, 100);
    }
  };

  // UI Control Handlers
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
    }
    if (val > 0 && isMuted) setIsMuted(false);
  };

  const handleToggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    if (audioRef.current) {
      audioRef.current.volume = nextMute ? 0 : volume;
    }
  };

  const handleProgressSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  // Format seconds to MM:SS
  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Grouping/Filtering Audiobooks by Language and Category Tab
  const filteredBooks = React.useMemo(() => {
    return audiobooks.filter(b => {
      const langMatch = (b.language || 'English') === selectedLanguage;
      if (!langMatch) return false;
      if (activeTab === 'ALL') return true;
      return b.category === activeTab;
    });
  }, [audiobooks, selectedLanguage, activeTab]);

  // Unique category counts within selected language
  const categoryCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    audiobooks.forEach(b => {
      if ((b.language || 'English') === selectedLanguage) {
        counts[b.category] = (counts[b.category] || 0) + 1;
      }
    });
    return counts;
  }, [audiobooks, selectedLanguage]);

  const languageFilteredCount = React.useMemo(() => {
    return audiobooks.filter(b => (b.language || 'English') === selectedLanguage).length;
  }, [audiobooks, selectedLanguage]);

  // Category Colors
  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'F2': return 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-indigo-100/30';
      case 'F4': return 'bg-sky-50 border-sky-200 text-sky-700 shadow-sky-100/30';
      case 'F8': return 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-emerald-100/30';
      case 'F12': return 'bg-amber-50 border-amber-200 text-amber-700 shadow-amber-100/30';
      case 'F16': return 'bg-purple-50 border-purple-200 text-purple-700 shadow-purple-100/30';
      default: return 'bg-slate-50 border-slate-200 text-slate-700';
    }
  };

  // ----------------------------------------------------
  // QUIZ ENGINE FLOW HANDLERS
  // ----------------------------------------------------
  const getQuizStorageKey = (bookId: string) => {
    if (!user || typeof window === 'undefined') return '';
    return `quiz_state_${user.id}_${bookId}`;
  };

  const saveQuizStateToStorage = (bookId: string, state: {
    currentQuestionIndex: number;
    score: number;
    selectedAnswer: string | null;
    isAnswerRevealed: boolean;
    quizCompleted: boolean;
  }) => {
    const key = getQuizStorageKey(bookId);
    if (!key) return;
    localStorage.setItem(key, JSON.stringify(state));
  };

  const loadQuizStateFromStorage = (bookId: string) => {
    const key = getQuizStorageKey(bookId);
    if (!key) return null;
    const saved = localStorage.getItem(key);
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch (e) {
      return null;
    }
  };

  const clearQuizStateFromStorage = (bookId: string) => {
    const key = getQuizStorageKey(bookId);
    if (!key) return;
    localStorage.removeItem(key);
  };

  const awardQuizPoints = async (book: Audiobook, finalScore: number) => {
    if (!user) return;
    const pointsGained = finalScore * 5;
    if (pointsGained <= 0) return;

    try {
      // 1. Fetch user's current total points from database
      const { data: userData, error: userFetchError } = await supabase
        .from('users')
        .select('total_points')
        .eq('id', user.id)
        .single();

      if (userFetchError) throw userFetchError;
      const currentTotal = userData?.total_points || 0;
      const newTotal = currentTotal + pointsGained;

      // 2. Update users table with the new points
      const { error: userUpdateError } = await supabase
        .from('users')
        .update({ total_points: newTotal })
        .eq('id', user.id);

      if (userUpdateError) throw userUpdateError;

      // 3. Insert row into quiz_submissions table to show they completed the quiz
      const { error: submitError } = await supabase
        .from('quiz_submissions')
        .insert({
          user_id: user.id,
          audiobook_id: book.id,
          score: finalScore,
          points_earned: pointsGained,
          submitted_at: new Date().toISOString()
        });

      if (submitError) {
        console.warn("Could not insert quiz_submissions record (check RLS policies):", submitError);
      }

      setCompletedQuizTitles(prev => [...prev, book.title]);

      toast.success(`Awarded +${pointsGained} points added to your dashboard! 🏆🎉`);
    } catch (err: any) {
      console.error("Error awarding quiz points:", err);
      toast.error("Failed to sync your quiz score points.");
    }
  };

  const handleStartQuiz = async (book: Audiobook) => {
    if (!user) {
      toast.error("Please log in to take the quiz.");
      return;
    }
    setActiveQuizBook(book);
    setIsCheckingProgress(true);
    setIsQuizLocked(true);

    try {
      // 1. Fetch live completion progress from database
      const { data: progressData, error: progressError } = await supabase
        .from('user_audiobook_progress')
        .select('is_completed')
        .eq('user_id', user.id)
        .eq('audiobook_id', book.id)
        .maybeSingle();

      if (progressError) throw progressError;

      // 2. Fetch fresh quiz questions
      const { data: freshQuestions, error: qError } = await supabase
        .from('quiz_questions')
        .select('*')
        .eq('audiobook_id', book.id);

      if (qError) throw qError;

      // Update the book's questions dynamically
      book.quiz_questions = freshQuestions || [];

      if (progressData?.is_completed) {
        setIsQuizLocked(false);

        // 3. Check if quiz has already been completed previously in the database
        const { data: quizData, error: quizError } = await supabase
          .from('quiz_submissions')
          .select('score')
          .eq('user_id', user.id)
          .eq('audiobook_id', book.id)
          .maybeSingle();

        if (quizData) {
          // Already completed this quiz! Force show scorecard & answers, no new starts allowed
          setAlreadyCompletedQuiz(true);
          setScore(quizData.score);
          setQuizCompleted(true);
          toast.success("Quiz already completed! Displaying your scorecard review. 🛡️");
        } else {
          setAlreadyCompletedQuiz(false);
          // 4. Load persistent state from storage if exists
          const savedState = loadQuizStateFromStorage(book.id);
          if (savedState) {
            setCurrentQuestionIndex(savedState.currentQuestionIndex);
            setScore(savedState.score);
            setSelectedAnswer(savedState.selectedAnswer);
            setIsAnswerRevealed(savedState.isAnswerRevealed);
            setQuizCompleted(savedState.quizCompleted);
            toast.success("Resuming your previous quiz progress! 🛡️");
          } else {
            // Initialize fresh state
            setCurrentQuestionIndex(0);
            setSelectedAnswer(null);
            setIsAnswerRevealed(false);
            setScore(0);
            setQuizCompleted(false);
            saveQuizStateToStorage(book.id, {
              currentQuestionIndex: 0,
              score: 0,
              selectedAnswer: null,
              isAnswerRevealed: false,
              quizCompleted: false
            });
          }
        }
      } else {
        setIsQuizLocked(true);
      }
    } catch (err) {
      console.error("Error checking quiz lock status:", err);
      toast.error("Failed to verify quiz eligibility.");
      setActiveQuizBook(null);
    } finally {
      setIsCheckingProgress(false);
    }
  };

  const handleSelectQuizOption = (opt: string) => {
    if (isAnswerRevealed || !activeQuizBook) return;
    setSelectedAnswer(opt);

    // Save selected option state
    saveQuizStateToStorage(activeQuizBook.id, {
      currentQuestionIndex,
      score,
      selectedAnswer: opt,
      isAnswerRevealed,
      quizCompleted
    });
  };

  const handleRevealQuizAnswer = () => {
    if (!selectedAnswer || !activeQuizBook) return;

    const currentQ = activeQuizBook.quiz_questions[currentQuestionIndex];
    let newScore = score;
    if (selectedAnswer === currentQ.correct_answer) {
      newScore = score + 1;
      setScore(newScore);
      toast.success("Correct answer! 🌟");
    } else {
      toast.error("Incorrect answer!");
    }

    setIsAnswerRevealed(true);

    // Save answer revealed and updated score state
    saveQuizStateToStorage(activeQuizBook.id, {
      currentQuestionIndex,
      score: newScore,
      selectedAnswer,
      isAnswerRevealed: true,
      quizCompleted
    });
  };

  const handleNextQuizQuestion = () => {
    if (!activeQuizBook) return;

    if (currentQuestionIndex + 1 < activeQuizBook.quiz_questions.length) {
      const nextIndex = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIndex);
      setSelectedAnswer(null);
      setIsAnswerRevealed(false);

      saveQuizStateToStorage(activeQuizBook.id, {
        currentQuestionIndex: nextIndex,
        score,
        selectedAnswer: null,
        isAnswerRevealed: false,
        quizCompleted: false
      });
    } else {
      // Quiz finished
      setQuizCompleted(true);

      saveQuizStateToStorage(activeQuizBook.id, {
        currentQuestionIndex,
        score,
        selectedAnswer,
        isAnswerRevealed,
        quizCompleted: true
      });

      // Call points award engine!
      awardQuizPoints(activeQuizBook, score);

      if (score === activeQuizBook.quiz_questions.length) {
        // Shower confetti on perfect score!
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.6 }
        });
      }
    }
  };

  const handleCloseQuiz = () => {
    if (activeQuizBook) {
      // Clear storage only if completely finished. Otherwise keep it locked in progress!
      if (quizCompleted) {
        clearQuizStateFromStorage(activeQuizBook.id);
      }
    }
    setActiveQuizBook(null);
  };

  return (
    <div className="space-y-10 pb-32">

      {/* HTML5 Audio Player hidden instance */}
      <audio ref={audioRef} className="hidden" />

      {/* Banner / Welcome */}
      <div className="relative overflow-hidden bg-gradient-to-r from-indigo-900 to-slate-900 rounded-[2.5rem] p-8 md:p-12 text-white border border-slate-800 shadow-2xl">
        <div className="absolute -top-12 -right-12 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-2xl space-y-4 relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-500/20 text-indigo-300 rounded-full text-xs font-black uppercase tracking-wider">
            <Radio size={14} className="animate-pulse" /> Podcast & Quizzes CMS
          </div>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-tight">
            Level-Up Your Sadhana Journey
          </h2>
          <p className="text-sm md:text-base font-bold text-slate-300 leading-relaxed">
            Listen to the authorized chapters fully to lock down your completion progress. Build your consistency daily, unlock quizzes to challenge your recall, and showcase your mastery!
          </p>
        </div>
      </div>

      {/* Filters / Categories selector */}
      <div className="flex flex-col lg:flex-row gap-6 justify-between items-start lg:items-center">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-wrap">
          <div>
            <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
              <Sparkles size={20} className="text-indigo-600 animate-spin" style={{ animationDuration: '6s' }} /> Podcast Chapters
            </h3>
            <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-wider">Grouped by Sadhana Tier Level</p>
          </div>
          {/* Global Language Selector Pills */}
          <div className="flex gap-0.5 bg-slate-100 p-1 rounded-xl border border-slate-200/50 shadow-sm self-start sm:self-center">
            {['English', 'Hindi', 'Gujarati'].map((lang) => {
              const isActive = selectedLanguage === lang;
              const shortForm = lang === 'English' ? 'ENG' : lang === 'Hindi' ? 'HIN' : 'GUJ';
              return (
                <button
                  key={lang}
                  onClick={() => {
                    setSelectedLanguage(lang);
                    setActiveTab('ALL'); // Reset level tab
                  }}
                  className={`relative px-3.5 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all cursor-pointer text-center ${isActive ? 'text-white' : 'text-slate-500 hover:text-indigo-600'
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
        </div>

        <div className="flex flex-wrap gap-2 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
          {['ALL', 'F2', 'F4', 'F8', 'F12', 'F16'].map((lvl) => {
            const isActive = activeTab === lvl;
            const count = lvl === 'ALL' ? languageFilteredCount : categoryCounts[lvl] || 0;
            return (
              <button
                key={lvl}
                onClick={() => setActiveTab(lvl)}
                className={`relative px-4 py-2 text-xs font-black uppercase rounded-xl transition-all cursor-pointer ${isActive ? 'text-white' : 'text-slate-500 hover:text-indigo-600'
                  }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeFilterBg"
                    className="absolute inset-0 bg-indigo-600 rounded-xl"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  {lvl} <span className={`text-[10px] font-bold ${isActive ? 'text-indigo-200' : 'text-slate-400'}`}>({count})</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading state */}
      {isLoading ? (
        <div className="text-center py-20 text-slate-400 font-bold">Fetching Audiobook Courses...</div>
      ) : filteredBooks.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-100 text-slate-400 font-bold">
          No audiobooks posted under this category level yet.
        </div>
      ) : (
        /* Audiobooks Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBooks.map((book) => {
            const isCompleted = userProgress[book.id]?.is_completed;
            const isPlayingThis = playingBook?.id === book.id;
            const totalQuestions = book.quiz_questions?.length || 0;
            const hasFinishedQuiz = completedQuizTitles.includes(book.title);

            let cardStyles = 'bg-white border-slate-100 hover:shadow-indigo-500/5';
            if (isCompleted) {
              if (hasFinishedQuiz) {
                cardStyles = 'bg-emerald-50/80 border-emerald-200 hover:shadow-emerald-500/5';
              } else {
                cardStyles = 'bg-amber-50/80 border-amber-200 hover:shadow-amber-500/5';
              }
            }

            return (
              <motion.div
                key={book.id}
                whileHover={{ scale: 1.02, y: -6 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className={`rounded-[2rem] p-6 border shadow-sm flex flex-col justify-between hover:shadow-xl transition-all group relative overflow-hidden ${cardStyles}`}
              >
                {/* Header tag */}
                <div className="flex justify-between items-start mb-6">
                  <span className={`px-3 py-1 border rounded-full text-[10px] font-black uppercase tracking-wider ${getCategoryColor(book.category)}`}>
                    {book.category} Sadhana
                  </span>

                  {isCompleted ? (
                    hasFinishedQuiz ? (
                      <span className="flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-emerald-100/50 border border-emerald-200 px-3 py-1 rounded-full uppercase tracking-wider shadow-sm shadow-emerald-50">
                        <CheckCircle size={12} /> Quiz Finished
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-black text-amber-600 bg-amber-100/50 border border-amber-200 px-3 py-1 rounded-full uppercase tracking-wider shadow-sm shadow-amber-50 animate-pulse">
                        ⭐ Quiz Unlocked
                      </span>
                    )
                  ) : (
                    <span className="text-[10px] font-black text-slate-400 bg-slate-50 border border-slate-100 px-3 py-1 rounded-full uppercase tracking-wider">
                      Not Started
                    </span>
                  )}
                </div>

                {/* Body Content */}
                <div className="space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <h4 className="text-lg font-black text-slate-800 leading-snug group-hover:text-indigo-600 transition-colors">
                      {book.title}
                    </h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Spiritual Podcast Course</p>
                  </div>

                  <div className="flex gap-4 items-center justify-between text-xs font-bold text-slate-500 pt-4 border-t border-slate-50">
                    <span className="flex items-center gap-1.5">
                      <HelpCircle size={14} className="text-slate-400" /> {totalQuestions} Quiz Questions
                    </span>
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="mt-6 flex gap-3">
                  {/* Play audio */}
                  <button
                    onClick={() => handlePlayAudiobook(book)}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${isPlayingThis && isPlaying
                      ? 'bg-indigo-50 text-indigo-600 border border-indigo-100'
                      : 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 hover:bg-indigo-700'
                      }`}
                  >
                    {isPlayingThis && isPlaying ? (
                      <>
                        <Pause size={14} /> Pause Listen
                      </>
                    ) : (
                      <>
                        <Play size={14} /> Listen Now
                      </>
                    )}
                  </button>

                  {/* Quiz Trigger */}
                  {isCompleted && totalQuestions > 0 && (
                    completedQuizTitles.includes(book.title) ? (
                      <button
                        onClick={() => handleStartQuiz(book)}
                        className="px-4 py-3 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all border border-slate-200 shadow-sm cursor-pointer"
                        title="View Quiz Scorecard"
                      >
                        <CheckCircle size={14} className="text-emerald-500" /> Finished
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStartQuiz(book)}
                        className="px-4 py-3 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all border border-emerald-100 shadow-sm cursor-pointer"
                        title="Challenge Quiz"
                      >
                        <Award size={14} /> Take Quiz
                      </button>
                    )
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ----------------------------------------------------
          STICKY BOTTOM HTML5 PREMIUM AUDIO PLAYER WIDGET
          ---------------------------------------------------- */}
      <AnimatePresence>
        {playingBook && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="fixed bottom-0 md:bottom-4 left-0 md:left-64 right-0 md:right-8 bg-slate-900 border border-slate-800 text-white p-6 shadow-2xl z-40 rounded-t-3xl md:rounded-3xl flex flex-col gap-4 max-w-6xl mx-auto"
          >
            {/* Top row info / details */}
            <div className="flex justify-between items-center gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 rounded-xl flex items-center justify-center flex-shrink-0 animate-pulse border border-indigo-500/10">
                  <Radio size={24} />
                </div>
                <div className="min-w-0">
                  <h4 className="font-black text-sm text-slate-100 truncate pr-2">{playingBook.title}</h4>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{playingBook.category} Level Sadhana Course</span>
                </div>
              </div>

              {/* Anti-Cheat Stopwatch visual tracker */}
              {!userProgress[playingBook.id]?.is_completed && !hasCompletedInSession && (
                <div className="hidden lg:flex items-center gap-3 bg-slate-800/40 p-2.5 rounded-2xl border border-slate-800">
                  <ShieldCheck size={16} className="text-indigo-400 animate-pulse" />
                  <div className="text-left">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Anti-Cheat Verification</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.round((listenedSecondsCount / Math.max(1, Math.floor(duration * completionThreshold))) * 100))}%` }}
                        />
                      </div>
                      <span className="text-[9px] font-black text-slate-300">
                        {Math.min(100, Math.round((listenedSecondsCount / Math.max(1, Math.floor(duration * completionThreshold))) * 100))}%
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {userProgress[playingBook.id]?.is_completed || hasCompletedInSession ? (
                <div className="hidden lg:flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider">
                  <CheckCircle size={12} /> Progress Saved
                </div>
              ) : null}

              {/* Close player */}
              <button
                onClick={() => {
                  if (audioRef.current) {
                    audioRef.current.pause();
                    audioRef.current.src = "";
                  }
                  setPlayingBook(null);
                  setIsPlaying(false);
                }}
                className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-white transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Middle row seek controls */}
            <div className="flex items-center gap-4">
              <span className="text-xs font-bold text-slate-500 w-10 text-right">{formatTime(currentTime)}</span>

              <div className="flex-1 relative flex items-center">
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  value={currentTime}
                  onChange={handleProgressSeek}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              <span className="text-xs font-bold text-slate-500 w-10">{formatTime(duration)}</span>
            </div>

            {/* Bottom Row controls */}
            <div className="flex items-center justify-between">

              {/* Sound wave graphics */}
              <div className="flex items-end gap-0.5 h-6 w-16">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-0.5 bg-indigo-500 rounded-full transition-all duration-300"
                    style={{
                      height: isPlaying ? `${Math.floor(Math.random() * 20) + 4}px` : '4px',
                      transitionDelay: `${i * 30}ms`
                    }}
                  />
                ))}
              </div>

              {/* Main Playback Actions */}
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    if (audioRef.current) {
                      audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10);
                    }
                  }}
                  className="p-2 text-slate-500 hover:text-slate-100 transition-all cursor-pointer"
                  title="Rewind 10s"
                >
                  <RotateCcw size={16} />
                </button>

                <button
                  onClick={() => handlePlayAudiobook(playingBook)}
                  className="w-12 h-12 bg-white text-slate-900 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-all cursor-pointer"
                >
                  {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
                </button>

                <button
                  onClick={() => {
                    if (audioRef.current) {
                      audioRef.current.currentTime = Math.min(duration, audioRef.current.currentTime + 10);
                    }
                  }}
                  className="p-2 text-slate-500 hover:text-slate-100 transition-all cursor-pointer"
                  title="Forward 10s"
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              {/* Volume & Audio Settings */}
              <div className="flex items-center gap-3">
                <button onClick={handleToggleMute} className="text-slate-500 hover:text-slate-100 transition-all cursor-pointer">
                  {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-16 md:w-24 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

            </div>

          </motion.div>
        )}
      </AnimatePresence>

      {/* ----------------------------------------------------
          INTERACTIVE QUIZ MODAL WIZARD
          ---------------------------------------------------- */}
      <AnimatePresence>
        {activeQuizBook && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 30 }}
              className="bg-white rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-8 max-w-xl w-full max-h-[92vh] md:max-h-[88vh] border border-slate-100 shadow-2xl relative flex flex-col gap-4 md:gap-5 overflow-hidden"
            >
              {/* Glass background decoration */}
              <div className="absolute -top-16 -right-16 w-48 h-48 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

              {/* Close Button */}
              <button
                onClick={handleCloseQuiz}
                className="absolute right-6 top-6 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-all cursor-pointer z-10"
              >
                <X size={20} />
              </button>

              {/* Quiz Banner Header */}
              <div className="flex items-center gap-2.5 pb-3.5 border-b border-slate-100 flex-shrink-0">
                <Award className="text-indigo-600 animate-bounce" size={24} />
                <div>
                  <h4 className="font-black text-slate-800 text-lg">Challenge Quiz</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{activeQuizBook.title}</p>
                </div>
              </div>

              {/* Dynamic scrollable body */}
              <div className="flex-1 overflow-y-auto pr-1.5 space-y-5 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                {isCheckingProgress ? (
                  /* Highly polished native loading skeleton */
                  <div className="space-y-6 animate-pulse p-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-200 rounded-full" />
                      <div className="space-y-2 flex-1">
                        <div className="h-4 bg-slate-200 rounded-lg w-1/3" />
                        <div className="h-3 bg-slate-100 rounded-lg w-1/4" />
                      </div>
                    </div>
                    <div className="space-y-2 pt-4">
                      <div className="h-3 bg-slate-200 rounded-full w-full" />
                      <div className="h-3 bg-slate-200 rounded-full w-2/3" />
                    </div>
                    <div className="h-10 bg-slate-200 rounded-2xl w-full" />
                    <div className="space-y-3 pt-4">
                      {[1, 2, 3, 4].map(n => (
                        <div key={n} className="h-12 bg-slate-100 rounded-2xl w-full border border-slate-50" />
                      ))}
                    </div>
                  </div>
                ) : isQuizLocked ? (
                  /* Beautiful Locked UI State */
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-8 space-y-6 flex flex-col items-center justify-center"
                  >
                    <div className="w-20 h-20 bg-rose-50 border border-rose-100 rounded-full flex items-center justify-center text-rose-500 shadow-sm shadow-rose-50">
                      <Lock size={36} className="animate-bounce" style={{ animationDuration: '3s' }} />
                    </div>
                    <div className="space-y-2">
                      <h5 className="text-xl font-black text-slate-800">Quiz Locked</h5>
                      <p className="text-xs font-bold text-rose-500 bg-rose-50 border border-rose-100 px-3 py-1 rounded-full uppercase tracking-wider inline-block">
                        Verification Denied
                      </p>
                      <p className="text-sm font-bold text-slate-500 max-w-sm px-4 mt-2 leading-relaxed">
                        Listen to the full podcast chapter to unlock this quiz.
                      </p>
                    </div>
                    <button
                      onClick={handleCloseQuiz}
                      className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-wider hover:bg-slate-800 shadow-md transition-all cursor-pointer mt-4"
                    >
                      Go Back & Listen
                    </button>
                  </motion.div>
                ) : !quizCompleted ? (
                  /* Question Wizard View (Unlocked) */
                  <div className="space-y-6">
                    {/* Progress Indicators */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs font-black text-slate-400 uppercase tracking-widest">
                        <span>Question {currentQuestionIndex + 1} of {activeQuizBook.quiz_questions.length}</span>
                        <span className="text-indigo-600">Score: {score}</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                          style={{ width: `${((currentQuestionIndex + 1) / activeQuizBook.quiz_questions.length) * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Swapping animation with AnimatePresence */}
                    <div className="relative overflow-hidden min-h-[250px]">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={currentQuestionIndex}
                          initial={{ opacity: 0, x: 120 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -120 }}
                          transition={{ type: 'spring', stiffness: 220, damping: 20 }}
                          className="space-y-4 w-full"
                        >
                          <p className="font-black text-slate-800 text-base md:text-lg leading-snug">
                            {activeQuizBook.quiz_questions[currentQuestionIndex].question_text}
                          </p>

                          {/* Choices Options List */}
                          <div className="grid grid-cols-1 gap-3">
                            {activeQuizBook.quiz_questions[currentQuestionIndex].options.map((opt, oIdx) => {
                              const letter = String.fromCharCode(65 + oIdx);
                              const isSelected = selectedAnswer === opt;
                              const isCorrect = opt === activeQuizBook.quiz_questions[currentQuestionIndex].correct_answer;
                              const isWrongSelection = isSelected && !isCorrect;

                              let optionStyle = 'bg-slate-50 border-transparent text-slate-700 hover:bg-slate-100 hover:border-slate-200';
                              if (isSelected) {
                                optionStyle = 'bg-indigo-50 border-indigo-300 text-indigo-900 ring-2 ring-indigo-500/20';
                              }
                              if (isAnswerRevealed) {
                                if (isCorrect) {
                                  optionStyle = 'bg-emerald-500/10 border-emerald-500 text-emerald-700 font-bold shadow-md shadow-emerald-50 animate-pulse';
                                } else if (isSelected) {
                                  optionStyle = 'bg-rose-50 border-rose-300 text-rose-800 ring-2 ring-rose-500/10 font-bold';
                                } else {
                                  optionStyle = 'bg-slate-50 border-transparent text-slate-400 opacity-60';
                                }
                              }

                              return (
                                <motion.button
                                  key={oIdx}
                                  onClick={() => handleSelectQuizOption(opt)}
                                  disabled={isAnswerRevealed}
                                  whileHover={!isAnswerRevealed ? { scale: 1.02 } : {}}
                                  whileTap={!isAnswerRevealed ? { scale: 0.98 } : {}}
                                  animate={
                                    isAnswerRevealed && isWrongSelection
                                      ? { x: [-10, 10, -10, 10, 0], transition: { duration: 0.4 } }
                                      : { x: 0 }
                                  }
                                  className={`w-full flex items-center justify-between p-4 border rounded-2xl text-left text-xs font-bold transition-all cursor-pointer ${optionStyle}`}
                                >
                                  <span>{letter}) {opt}</span>
                                  {isAnswerRevealed && isCorrect && <CheckCircle size={16} className="text-emerald-500" />}
                                  {isAnswerRevealed && isSelected && !isCorrect && <AlertCircle size={16} className="text-rose-500" />}
                                </motion.button>
                              );
                            })}
                          </div>
                        </motion.div>
                      </AnimatePresence>
                    </div>

                    {/* Wizard control buttons */}
                    <div className="pt-4 border-t border-slate-100">
                      {!isAnswerRevealed ? (
                        <button
                          onClick={handleRevealQuizAnswer}
                          disabled={!selectedAnswer}
                          className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-wider text-white shadow-xl transition-all cursor-pointer ${selectedAnswer
                            ? 'bg-indigo-600 shadow-indigo-100 hover:bg-indigo-700 hover:-translate-y-0.5'
                            : 'bg-slate-200 shadow-none opacity-50 cursor-not-allowed'
                            }`}
                        >
                          Submit Answer
                        </button>
                      ) : (
                        <button
                          onClick={handleNextQuizQuestion}
                          className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-xl shadow-indigo-100 hover:bg-indigo-700 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-1 cursor-pointer"
                        >
                          {currentQuestionIndex + 1 < activeQuizBook.quiz_questions.length ? (
                            <>
                              Next Question <ArrowRight size={14} />
                            </>
                          ) : (
                            "View Quiz Summary"
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Quiz Finished Summary View */
                  <div className="space-y-6 py-4 text-left">
                    <div className="text-center space-y-4">
                      <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 mx-auto border border-indigo-100/50 shadow-inner animate-pulse">
                        <Award size={42} />
                      </div>

                      <div className="space-y-1">
                        <h5 className="text-2xl font-black text-slate-800">Quiz Completed!</h5>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Performance Scorecard</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto p-4 bg-slate-50 border border-slate-100 rounded-3xl">
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Score</p>
                          <p className="text-xl font-black text-indigo-600">{score} / {activeQuizBook.quiz_questions.length}</p>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Points Gained</p>
                          <p className="text-xl font-black text-emerald-600">+{score * 5} Pts</p>
                        </div>
                      </div>
                    </div>

                    {/* Scrollable Questions & Answers Review List */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-center px-1">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Review Questions & Correct Answers</p>
                        <span className="text-[9px] font-bold text-rose-500 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full uppercase tracking-wider">Attempt Locked</span>
                      </div>

                      <div className="max-h-60 overflow-y-auto pr-1 space-y-3 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                        {activeQuizBook.quiz_questions.map((q, idx) => (
                          <div key={q.id || idx} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-2">
                            <p className="text-xs font-bold text-slate-700 leading-snug">
                              <span className="text-indigo-600 font-extrabold mr-1">Q{idx + 1}.</span>
                              {q.question_text}
                            </p>
                            <div className="flex items-start gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 p-2.5 rounded-xl text-xs font-bold">
                              <CheckCircle size={14} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-wider leading-none mb-1">Correct Answer</p>
                                <p className="text-xs font-bold">{q.correct_answer}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={handleCloseQuiz}
                      className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-wider hover:bg-slate-800 shadow-xl transition-all cursor-pointer mt-4 text-center"
                    >
                      Finish & Close
                    </button>
                  </div>
                )}
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
