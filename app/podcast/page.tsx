'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import { useActiveCompetition } from '@/hooks/useActiveCompetition';
import {
  Radio, Play, Pause, CheckCircle, HelpCircle,
  Volume2, ShieldCheck, Sparkles, Award, ArrowRight,
  AlertCircle, ChevronRight, X, VolumeX, RotateCcw, Lock
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import confetti from 'canvas-confetti';
import { friendlyError } from '@/lib/errors';
import { mergeConfig } from '@/lib/competition';

interface Audiobook {
  id: string;
  category: string;
  title: string;
  audio_url: string;
  created_at: string;
  language?: string | null;
}

/** question as delivered to students: NO correct answer (it only exists server-side) */
interface QuizQuestion {
  id: string;
  question_text: string;
  options: string[];
}

interface ProgressRow {
  is_completed: boolean;
  listened_seconds: number;
}

interface ListenState {
  listened: number;
  required: number | null;
  completed: boolean;
}

type AnswerFlags = Record<string, { chosen: string | null; correct: boolean }>;

interface QuizResult {
  score: number;
  max_score: number;
  points_earned: number;
  answers: AnswerFlags;
}

export default function PodcastAndQuizzesPage() {
  const { user, isAdmin } = useAuthStore();
  const { loading: compLoading, competition, features } = useActiveCompetition();
  const cfg = mergeConfig(competition?.config);

  // Data State
  const [audiobooks, setAudiobooks] = useState<Audiobook[]>([]);
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({});
  const [progress, setProgress] = useState<Record<string, ProgressRow>>({});
  const [submittedQuiz, setSubmittedQuiz] = useState<Record<string, true>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ALL');
  const [selectedLanguage, setSelectedLanguage] = useState('English');

  // Custom Audio Player State
  const [playingBook, setPlayingBook] = useState<Audiobook | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  // listening is verified by the SERVER (wall-clock heartbeats); this is just what it last told us
  const [listen, setListen] = useState<ListenState | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Quiz Modal State
  const [activeQuizBook, setActiveQuizBook] = useState<Audiobook | null>(null);
  const [isCheckingProgress, setIsCheckingProgress] = useState(false);
  const [isQuizLocked, setIsQuizLocked] = useState(true);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<QuizResult | null>(null);

  const bonusOn = !!features?.podcast;

  // ---------- data ----------
  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: books, error: booksError } = await supabase
        .from('audiobooks')
        .select('id,category,title,audio_url,created_at,language')
        .order('created_at', { ascending: true });
      if (booksError) throw booksError;
      setAudiobooks((books as Audiobook[]) || []);

      // question counts only (no answers are readable by students)
      const { data: qs } = await supabase.from('quiz_questions').select('audiobook_id');
      const counts: Record<string, number> = {};
      (qs || []).forEach((q: any) => { counts[q.audiobook_id] = (counts[q.audiobook_id] || 0) + 1; });
      setQuestionCounts(counts);

      if (user && competition) {
        const [{ data: prog }, { data: subs }] = await Promise.all([
          supabase.from('user_audiobook_progress').select('audiobook_id,is_completed,listened_seconds')
            .eq('user_id', user.id).eq('competition_id', competition.id),
          supabase.from('quiz_submissions').select('audiobook_id')
            .eq('user_id', user.id).eq('competition_id', competition.id),
        ]);
        const pm: Record<string, ProgressRow> = {};
        (prog || []).forEach((p: any) => { pm[p.audiobook_id] = { is_completed: p.is_completed, listened_seconds: p.listened_seconds }; });
        setProgress(pm);
        const sm: Record<string, true> = {};
        (subs || []).forEach((s: any) => { sm[s.audiobook_id] = true; });
        setSubmittedQuiz(sm);
      }
    } catch {
      toast.error('Failed to load podcast materials.');
    } finally {
      setIsLoading(false);
    }
  }, [user, competition]);

  useEffect(() => {
    if (compLoading) return;
    if (!bonusOn && !isAdmin) { setIsLoading(false); return; }
    fetchAll();
  }, [compLoading, bonusOn, isAdmin, fetchAll]);

  // ---------- audio events ----------
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !playingBook) return;
    const book = playingBook;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = async () => {
      setDuration(audio.duration);
      if (!user || !competition || !Number.isFinite(audio.duration)) return;
      // tell the server this listen started (it records the duration and its own clock)
      const { data, error } = await supabase.rpc('start_listening', { p_audiobook: book.id, p_duration: Math.floor(audio.duration) });
      if (error) {
        toast.error(friendlyError(error));
        return;
      }
      const d = data as { listened_seconds: number; required_seconds: number | null; completed: boolean };
      setListen({ listened: d.listened_seconds, required: d.required_seconds, completed: d.completed });
      if (d.completed) setProgress((p) => ({ ...p, [book.id]: { is_completed: true, listened_seconds: d.listened_seconds } }));
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.volume = isMuted ? 0 : volume;
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playingBook?.id, user, competition?.id]);

  // heartbeat every ~10 s while audio is really playing; the SERVER decides when the threshold is met
  useEffect(() => {
    if (!playingBook || !isPlaying || !listen || listen.completed) return;
    const bookId = playingBook.id;
    const t = setInterval(async () => {
      const { data, error } = await supabase.rpc('listening_heartbeat', { p_audiobook: bookId });
      if (error) return;
      const d = data as { listened_seconds: number; required_seconds: number | null; completed: boolean };
      setListen((prev) => ({ listened: d.listened_seconds, required: d.required_seconds, completed: d.completed || !!prev?.completed }));
      if (d.completed) {
        setProgress((p) => ({ ...p, [bookId]: { is_completed: true, listened_seconds: d.listened_seconds } }));
        confetti({ particleCount: 80, spread: 60, origin: { y: 0.8 } });
        toast.success('Congratulations! Chapter completed! 🎧🎉 Quiz unlocked!');
      }
    }, 10000);
    return () => clearInterval(t);
  }, [playingBook?.id, isPlaying, listen?.completed, !!listen]);

  // stop the audio when leaving the page
  useEffect(() => {
    const audio = audioRef.current;
    return () => { audio?.pause(); };
  }, []);

  const handlePlayAudiobook = (book: Audiobook) => {
    if (playingBook?.id === book.id) {
      if (isPlaying) audioRef.current?.pause();
      else audioRef.current?.play();
    } else {
      setPlayingBook(book);
      setCurrentTime(0);
      setDuration(0);
      setIsPlaying(false);
      setListen(null);
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.src = book.audio_url;
          audioRef.current.play().catch(() => {});
        }
      }, 100);
    }
  };

  // UI Control Handlers
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) audioRef.current.volume = val;
    if (val > 0 && isMuted) setIsMuted(false);
  };

  const handleToggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    if (audioRef.current) audioRef.current.volume = nextMute ? 0 : volume;
  };

  const handleProgressSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (audioRef.current) audioRef.current.currentTime = val;
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Grouping/Filtering Audiobooks by Language and Category Tab
  const filteredBooks = React.useMemo(() => {
    return audiobooks.filter((b) => {
      if ((b.language || 'English') !== selectedLanguage) return false;
      return activeTab === 'ALL' || b.category === activeTab;
    });
  }, [audiobooks, selectedLanguage, activeTab]);

  const categoryCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    audiobooks.forEach((b) => {
      if ((b.language || 'English') === selectedLanguage) counts[b.category] = (counts[b.category] || 0) + 1;
    });
    return counts;
  }, [audiobooks, selectedLanguage]);

  const languageFilteredCount = React.useMemo(
    () => audiobooks.filter((b) => (b.language || 'English') === selectedLanguage).length,
    [audiobooks, selectedLanguage]
  );

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
  // QUIZ FLOW (questions without answers; graded on the server at the END)
  // ----------------------------------------------------
  const draftKey = (bookId: string) => (user ? `quiz_draft_${user.id}_${bookId}` : '');

  const saveDraft = (bookId: string, index: number, ans: Record<string, string>) => {
    const k = draftKey(bookId);
    if (!k) return;
    try { localStorage.setItem(k, JSON.stringify({ index, answers: ans })); } catch { /* ignore */ }
  };

  const handleStartQuiz = async (book: Audiobook) => {
    if (!user) { toast.error('Please log in to take the quiz.'); return; }
    setActiveQuizBook(book);
    setIsCheckingProgress(true);
    setIsQuizLocked(true);
    setResult(null);
    setQuestions([]);
    setAnswers({});
    setCurrentQuestionIndex(0);

    try {
      const { data, error } = await supabase.rpc('get_quiz', { p_audiobook: book.id });
      if (error) {
        if (/QUIZ_LOCKED/.test(error.message)) { setIsQuizLocked(true); return; }
        throw error;
      }
      setIsQuizLocked(false);
      const q = data as any;
      if (q.already_submitted) {
        // review: question text/options are student-readable; the server only tells us right/wrong
        const { data: qs } = await supabase.from('quiz_questions').select('id,question_text,options')
          .eq('audiobook_id', book.id).order('id');
        setQuestions((qs as QuizQuestion[]) || []);
        setResult({ score: q.score, max_score: q.max_score, points_earned: q.points_earned, answers: q.answers || {} });
        toast.success('Quiz already completed! Showing your scorecard. 🛡️');
      } else {
        setQuestions(q.questions as QuizQuestion[]);
        try {
          const saved = JSON.parse(localStorage.getItem(draftKey(book.id)) || 'null');
          if (saved && typeof saved.index === 'number') {
            setCurrentQuestionIndex(Math.min(saved.index, (q.questions as any[]).length - 1));
            setAnswers(saved.answers || {});
            toast.success('Resuming your previous quiz progress! 🛡️');
          }
        } catch { /* no draft */ }
      }
    } catch (err) {
      toast.error(friendlyError(err));
      setActiveQuizBook(null);
    } finally {
      setIsCheckingProgress(false);
    }
  };

  const handleSelectQuizOption = (opt: string) => {
    if (!activeQuizBook) return;
    const q = questions[currentQuestionIndex];
    const next = { ...answers, [q.id]: opt };
    setAnswers(next);
    saveDraft(activeQuizBook.id, currentQuestionIndex, next);
  };

  const handleSubmitQuiz = async () => {
    if (!activeQuizBook) return;
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('submit_quiz', { p_audiobook: activeQuizBook.id, p_answers: answers });
      if (error) throw error;
      const r = data as QuizResult;
      setResult(r);
      setSubmittedQuiz((s) => ({ ...s, [activeQuizBook.id]: true }));
      try { localStorage.removeItem(draftKey(activeQuizBook.id)); } catch { /* ignore */ }
      if (r.points_earned > 0) toast.success(`Awarded +${r.points_earned} points! 🏆🎉`);
      if (r.score === r.max_score) confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNextQuizQuestion = () => {
    if (!activeQuizBook) return;
    if (currentQuestionIndex + 1 < questions.length) {
      const idx = currentQuestionIndex + 1;
      setCurrentQuestionIndex(idx);
      saveDraft(activeQuizBook.id, idx, answers);
    } else {
      handleSubmitQuiz();
    }
  };

  const handleCloseQuiz = () => {
    setActiveQuizBook(null);
    fetchAll();
  };

  // ---------- gating: the page AND its data are off unless the competition has bonus ----------
  if (!compLoading && !bonusOn && !isAdmin) {
    return (
      <div className="py-20 text-center px-4">
        <div className="text-5xl mb-4">🎧</div>
        <h2 className="text-2xl font-black text-slate-800 mb-2">Audiobooks &amp; quizzes are not part of the current competition</h2>
        <p className="text-sm font-bold text-slate-500">They open when a competition with bonus points is running.</p>
      </div>
    );
  }

  const requiredPct = (b: Audiobook) => {
    if (playingBook?.id !== b.id || !listen || !listen.required) return 0;
    return Math.min(100, Math.round((listen.listened / Math.max(1, listen.required)) * 100));
  };
  const playingCompleted = !!playingBook && (progress[playingBook.id]?.is_completed || listen?.completed);
  const playingPct = playingBook ? requiredPct(playingBook) : 0;
  const currentQ = questions[currentQuestionIndex];
  const reviewMode = !!result;

  return (
    <div className="space-y-10 pb-32">

      {/* HTML5 Audio Player hidden instance */}
      <audio ref={audioRef} className="hidden" />

      {/* Banner / Welcome */}
      <div className="relative overflow-hidden bg-gradient-to-r from-indigo-900 to-slate-900 rounded-[2.5rem] p-8 md:p-12 text-white border border-slate-800 shadow-2xl">
        <div className="absolute -top-12 -right-12 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-2xl space-y-4 relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-500/20 text-indigo-300 rounded-full text-xs font-black uppercase tracking-wider">
            <Radio size={14} className="animate-pulse" /> Audiobooks &amp; Quizzes
          </div>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-tight">
            Level-Up Your Sadhana Journey
          </h2>
          <p className="text-sm md:text-base font-bold text-slate-300 leading-relaxed">
            Listen to {cfg.listen_threshold_pct}% of a chapter to unlock its quiz. Each correct answer earns {cfg.quiz_points_per_correct} bonus points
            {cfg.max_quiz_bonus != null ? ` (up to ${cfg.max_quiz_bonus} in total)` : ''}. One attempt per chapter.
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
          <div className="flex gap-0.5 bg-slate-100 p-1 rounded-xl border border-slate-200/50 shadow-sm self-start sm:self-center">
            {['English', 'Hindi', 'Gujarati'].map((lang) => {
              const isActive = selectedLanguage === lang;
              const shortForm = lang === 'English' ? 'ENG' : lang === 'Hindi' ? 'HIN' : 'GUJ';
              return (
                <button
                  key={lang}
                  onClick={() => { setSelectedLanguage(lang); setActiveTab('ALL'); }}
                  className={`relative px-3.5 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all cursor-pointer text-center ${isActive ? 'text-white' : 'text-slate-500 hover:text-indigo-600'}`}
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
                className={`relative px-4 py-2 text-xs font-black uppercase rounded-xl transition-all cursor-pointer ${isActive ? 'text-white' : 'text-slate-500 hover:text-indigo-600'}`}
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

      {/* List */}
      {isLoading ? (
        <div className="text-center py-20 text-slate-400 font-bold">Fetching Audiobook Courses...</div>
      ) : filteredBooks.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-100 text-slate-400 font-bold">
          No audiobooks posted under this category level yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBooks.map((book) => {
            const isCompleted = progress[book.id]?.is_completed;
            const isPlayingThis = playingBook?.id === book.id;
            const totalQuestions = questionCounts[book.id] || 0;
            const hasFinishedQuiz = !!submittedQuiz[book.id];

            let cardStyles = 'bg-white border-slate-100 hover:shadow-indigo-500/5';
            if (isCompleted) {
              cardStyles = hasFinishedQuiz
                ? 'bg-emerald-50/80 border-emerald-200 hover:shadow-emerald-500/5'
                : 'bg-amber-50/80 border-amber-200 hover:shadow-amber-500/5';
            }

            return (
              <motion.div
                key={book.id}
                whileHover={{ scale: 1.02, y: -6 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className={`rounded-[2rem] p-6 border shadow-sm flex flex-col justify-between hover:shadow-xl transition-all group relative overflow-hidden ${cardStyles}`}
              >
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
                      {progress[book.id]?.listened_seconds ? 'In Progress' : 'Not Started'}
                    </span>
                  )}
                </div>

                <div className="space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <h4 className="text-lg font-black text-slate-800 leading-snug group-hover:text-indigo-600 transition-colors">{book.title}</h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Spiritual Podcast Course</p>
                  </div>
                  <div className="flex gap-4 items-center justify-between text-xs font-bold text-slate-500 pt-4 border-t border-slate-50">
                    <span className="flex items-center gap-1.5">
                      <HelpCircle size={14} className="text-slate-400" /> {totalQuestions} Quiz Questions
                    </span>
                  </div>
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() => handlePlayAudiobook(book)}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${isPlayingThis && isPlaying
                      ? 'bg-indigo-50 text-indigo-600 border border-indigo-100'
                      : 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 hover:bg-indigo-700'}`}
                  >
                    {isPlayingThis && isPlaying ? (<><Pause size={14} /> Pause Listen</>) : (<><Play size={14} /> Listen Now</>)}
                  </button>

                  {isCompleted && totalQuestions > 0 && (
                    hasFinishedQuiz ? (
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

      {/* STICKY BOTTOM AUDIO PLAYER */}
      <AnimatePresence>
        {playingBook && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="fixed bottom-16 md:bottom-4 left-0 md:left-64 right-0 md:right-8 bg-slate-900 border border-slate-800 text-white p-6 shadow-2xl z-40 rounded-t-3xl md:rounded-3xl flex flex-col gap-4 max-w-6xl mx-auto"
          >
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

              {!playingCompleted && (
                <div className="hidden lg:flex items-center gap-3 bg-slate-800/40 p-2.5 rounded-2xl border border-slate-800">
                  <ShieldCheck size={16} className="text-indigo-400 animate-pulse" />
                  <div className="text-left">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Listening verified by server</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full transition-all duration-300" style={{ width: `${playingPct}%` }} />
                      </div>
                      <span className="text-[9px] font-black text-slate-300">{listen?.required ? `${playingPct}%` : '…'}</span>
                    </div>
                  </div>
                </div>
              )}

              {playingCompleted ? (
                <div className="hidden lg:flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider">
                  <CheckCircle size={12} /> Progress Saved
                </div>
              ) : null}

              <button
                onClick={() => {
                  if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
                  setPlayingBook(null);
                  setIsPlaying(false);
                  setListen(null);
                }}
                className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-white transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-xs font-bold text-slate-500 w-10 text-right">{formatTime(currentTime)}</span>
              <div className="flex-1 relative flex items-center">
                <input
                  type="range" min={0} max={duration || 100} value={currentTime} onChange={handleProgressSeek}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>
              <span className="text-xs font-bold text-slate-500 w-10">{formatTime(duration)}</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-end gap-0.5 h-6 w-16">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-0.5 bg-indigo-500 rounded-full transition-all duration-300"
                    style={{ height: isPlaying ? `${((i * 7) % 20) + 4}px` : '4px', transitionDelay: `${i * 30}ms` }}
                  />
                ))}
              </div>

              <div className="flex items-center gap-4">
                <button
                  onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10); }}
                  className="p-2 text-slate-500 hover:text-slate-100 transition-all cursor-pointer" title="Rewind 10s"
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
                  onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.min(duration, audioRef.current.currentTime + 10); }}
                  className="p-2 text-slate-500 hover:text-slate-100 transition-all cursor-pointer" title="Forward 10s"
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button onClick={handleToggleMute} className="text-slate-500 hover:text-slate-100 transition-all cursor-pointer">
                  {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                <input
                  type="range" min={0} max={1} step={0.05} value={isMuted ? 0 : volume} onChange={handleVolumeChange}
                  className="w-16 md:w-24 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* QUIZ MODAL */}
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
              <div className="absolute -top-16 -right-16 w-48 h-48 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

              <button
                onClick={handleCloseQuiz}
                className="absolute right-6 top-6 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-all cursor-pointer z-10"
              >
                <X size={20} />
              </button>

              <div className="flex items-center gap-2.5 pb-3.5 border-b border-slate-100 flex-shrink-0">
                <Award className="text-indigo-600 animate-bounce" size={24} />
                <div>
                  <h4 className="font-black text-slate-800 text-lg">Challenge Quiz</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{activeQuizBook.title}</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto pr-1.5 space-y-5 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                {isCheckingProgress ? (
                  <div className="space-y-6 animate-pulse p-2">
                    <div className="h-4 bg-slate-200 rounded-lg w-1/3" />
                    <div className="h-10 bg-slate-200 rounded-2xl w-full" />
                    <div className="space-y-3 pt-4">
                      {[1, 2, 3, 4].map((n) => (<div key={n} className="h-12 bg-slate-100 rounded-2xl w-full border border-slate-50" />))}
                    </div>
                  </div>
                ) : isQuizLocked ? (
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
                      <p className="text-sm font-bold text-slate-500 max-w-sm px-4 mt-2 leading-relaxed">
                        Listen to {cfg.listen_threshold_pct}% of this chapter to unlock the quiz. The server checks your listening time.
                      </p>
                    </div>
                    <button
                      onClick={handleCloseQuiz}
                      className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-wider hover:bg-slate-800 shadow-md transition-all cursor-pointer mt-4"
                    >
                      Go Back &amp; Listen
                    </button>
                  </motion.div>
                ) : !reviewMode && currentQ ? (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs font-black text-slate-400 uppercase tracking-widest">
                        <span>Question {currentQuestionIndex + 1} of {questions.length}</span>
                        <span className="text-indigo-600">{Object.keys(answers).length} answered</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-600 rounded-full transition-all duration-300" style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }} />
                      </div>
                    </div>

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
                          <p className="font-black text-slate-800 text-base md:text-lg leading-snug">{currentQ.question_text}</p>
                          <div className="grid grid-cols-1 gap-3">
                            {currentQ.options.map((opt, oIdx) => {
                              const letter = String.fromCharCode(65 + oIdx);
                              const isSelected = answers[currentQ.id] === opt;
                              return (
                                <motion.button
                                  key={oIdx}
                                  onClick={() => handleSelectQuizOption(opt)}
                                  whileHover={{ scale: 1.02 }}
                                  whileTap={{ scale: 0.98 }}
                                  className={`w-full flex items-center justify-between p-4 border rounded-2xl text-left text-xs font-bold transition-all cursor-pointer ${isSelected
                                    ? 'bg-indigo-50 border-indigo-300 text-indigo-900 ring-2 ring-indigo-500/20'
                                    : 'bg-slate-50 border-transparent text-slate-700 hover:bg-slate-100 hover:border-slate-200'}`}
                                >
                                  <span>{letter}) {opt}</span>
                                </motion.button>
                              );
                            })}
                          </div>
                        </motion.div>
                      </AnimatePresence>
                    </div>

                    <div className="pt-4 border-t border-slate-100 flex gap-3">
                      {currentQuestionIndex > 0 && (
                        <button
                          onClick={() => { setCurrentQuestionIndex((i) => i - 1); }}
                          className="px-5 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-wider hover:bg-slate-200 transition-all cursor-pointer"
                        >
                          Back
                        </button>
                      )}
                      <button
                        onClick={handleNextQuizQuestion}
                        disabled={!answers[currentQ.id] || isSubmitting}
                        className={`flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-wider text-white shadow-xl transition-all flex items-center justify-center gap-1 ${answers[currentQ.id]
                          ? 'bg-indigo-600 shadow-indigo-100 hover:bg-indigo-700 hover:-translate-y-0.5 cursor-pointer'
                          : 'bg-slate-200 shadow-none opacity-50 cursor-not-allowed'}`}
                      >
                        {isSubmitting ? 'Submitting...' : currentQuestionIndex + 1 < questions.length ? (<>Next Question <ArrowRight size={14} /></>) : 'Submit Quiz'}
                      </button>
                    </div>
                  </div>
                ) : result ? (
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
                          <p className="text-xl font-black text-indigo-600">{result.score} / {result.max_score}</p>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Points Gained</p>
                          <p className="text-xl font-black text-emerald-600">+{result.points_earned} Pts</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between items-center px-1">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Your answers</p>
                        <span className="text-[9px] font-bold text-rose-500 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full uppercase tracking-wider">Attempt Locked</span>
                      </div>
                      <div className="max-h-60 overflow-y-auto pr-1 space-y-3 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                        {questions.map((q, idx) => {
                          const a = result.answers[q.id];
                          return (
                            <div key={q.id} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-2">
                              <p className="text-xs font-bold text-slate-700 leading-snug">
                                <span className="text-indigo-600 font-extrabold mr-1">Q{idx + 1}.</span>{q.question_text}
                              </p>
                              <div className={`flex items-start gap-2 p-2.5 rounded-xl text-xs font-bold border ${a?.correct
                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-800'
                                : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
                                {a?.correct
                                  ? <CheckCircle size={14} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                                  : <AlertCircle size={14} className="text-rose-500 flex-shrink-0 mt-0.5" />}
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-wider leading-none mb-1">{a?.correct ? 'Correct' : 'Incorrect'}</p>
                                  <p className="text-xs font-bold">{a?.chosen ?? 'No answer'}</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <button
                      onClick={handleCloseQuiz}
                      className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-wider hover:bg-slate-800 shadow-xl transition-all cursor-pointer mt-4 text-center"
                    >
                      Finish &amp; Close
                    </button>
                  </div>
                ) : (
                  <p className="text-center text-sm font-bold text-slate-500 py-10">This quiz has no questions yet.</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
