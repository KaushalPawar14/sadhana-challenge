'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';
import {
  BookOpen, Volume2, HelpCircle, CheckCircle,
  AlertCircle, Sparkles, Plus, Trash2, Calendar,
  ExternalLink, FileText, ChevronDown, ChevronUp, Play, Pause
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface ParsedQuestion {
  question_text: string;
  options: string[];
  correct_answer: string;
  isValid: boolean;
  errors: string[];
}

interface Audiobook {
  id: string;
  category: string;
  title: string;
  audio_url: string;
  created_at: string;
  language?: string;
  quiz_questions?: any[];
}

export default function AudiobooksCMS() {
  // Form State
  const [category, setCategory] = useState('F2');
  const [title, setTitle] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [quizText, setQuizText] = useState('');
  const [language, setLanguage] = useState('English');

  // Parsed Questions
  const [parsedQuestions, setParsedQuestions] = useState<ParsedQuestion[]>([]);

  // CMS Lists & UI State
  const [audiobooks, setAudiobooks] = useState<Audiobook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedAudiobook, setExpandedAudiobook] = useState<string | null>(null);

  // Audio Play Preview State
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [audioPreviewObj, setAudioPreviewObj] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetchAudiobooks();
    return () => {
      if (audioPreviewObj) {
        audioPreviewObj.pause();
      }
    };
  }, []);

  // Update parsed questions in real-time as text is typed
  useEffect(() => {
    if (!quizText.trim()) {
      setParsedQuestions([]);
      return;
    }

    const blocks = quizText.split(/(?=Question:)/i);
    const parsedList: ParsedQuestion[] = [];

    blocks.forEach((block, index) => {
      const trimmedBlock = block.trim();
      if (!trimmedBlock) return;

      const lines = trimmedBlock.split('\n').map(l => l.trim()).filter(Boolean);
      let questionText = '';
      const options: string[] = [];
      let correctAnswer = '';
      const errors: string[] = [];

      lines.forEach(line => {
        if (line.toLowerCase().startsWith('question:')) {
          questionText = line.substring(9).trim();
        } else if (line.match(/^[A-D][\)\.\s\-]/i)) {
          const optText = line.replace(/^[A-D][\)\.\s\-]/i, '').trim();
          options.push(optText);
        } else if (line.toLowerCase().startsWith('answer:')) {
          const rawAns = line.substring(7).trim();
          const letterMatch = rawAns.match(/^([A-D])[\)\.\s\-]?$/i);
          if (letterMatch) {
            correctAnswer = letterMatch[1].toUpperCase();
          } else {
            correctAnswer = rawAns.replace(/^[A-D][\)\.\s\-]/i, '').trim();
          }
        }
      });

      // Handle letter conversion fallback
      if (['A', 'B', 'C', 'D'].includes(correctAnswer)) {
        const idx = correctAnswer.charCodeAt(0) - 65; // A=0, B=1...
        if (options[idx]) {
          correctAnswer = options[idx];
        }
      }

      // Validations
      if (!questionText) {
        errors.push("Missing 'Question: What is...' line.");
      }
      if (options.length !== 4) {
        errors.push(`Requires exactly 4 options (A, B, C, D). Found ${options.length}.`);
      }
      if (!correctAnswer) {
        errors.push("Missing 'Answer: ...' line.");
      } else if (options.length === 4 && !options.includes(correctAnswer)) {
        errors.push(`Correct answer "${correctAnswer}" is not one of the 4 options.`);
      }

      parsedList.push({
        question_text: questionText || `Question Block #${index + 1}`,
        options,
        correct_answer: correctAnswer,
        isValid: errors.length === 0,
        errors
      });
    });

    setParsedQuestions(parsedList);
  }, [quizText]);

  // Fetch Existing Audiobooks with Quizzes
  const fetchAudiobooks = async () => {
    setIsLoading(true);
    try {
      const { data: books, error: booksError } = await supabase
        .from('audiobooks')
        .select('*')
        .order('created_at', { ascending: true });

      if (booksError) throw booksError;

      // Fetch questions for each audiobook
      const enrichedBooks = await Promise.all(
        (books || []).map(async (book) => {
          const { data: questions } = await supabase
            .from('quiz_questions')
            .select('*')
            .eq('audiobook_id', book.id);
          return {
            ...book,
            quiz_questions: questions || []
          };
        })
      );

      setAudiobooks(enrichedBooks);
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load audiobooks list");
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle Audio Preview Playback
  const handleToggleAudioPreview = () => {
    if (!audioUrl.trim()) {
      toast.error("Please enter a valid Audio URL first!");
      return;
    }

    if (isPlayingPreview && audioPreviewObj) {
      audioPreviewObj.pause();
      setIsPlayingPreview(false);
    } else {
      try {
        const audio = audioPreviewObj || new Audio(audioUrl);
        if (!audioPreviewObj) {
          setAudioPreviewObj(audio);
        }
        audio.play();
        setIsPlayingPreview(true);
        audio.onended = () => setIsPlayingPreview(false);
      } catch (err) {
        toast.error("Invalid audio source file or URL format.");
      }
    }
  };

  // Submit Transaction Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) return toast.error("Audiobook Title is required.");
    if (!audioUrl.trim()) return toast.error("Audio URL is required.");
    if (parsedQuestions.length === 0) return toast.error("Please add at least 1 quiz question.");

    // Check if any parsed question has validation errors
    const invalidQuestions = parsedQuestions.filter(q => !q.isValid);
    if (invalidQuestions.length > 0) {
      return toast.error("Please correct the formatting errors in your quiz data.");
    }

    setIsSubmitting(true);

    try {
      // 1. Transaction Step 1: Insert Audiobook
      const { data: newBook, error: bookError } = await supabase
        .from('audiobooks')
        .insert({
          category,
          title: title.trim(),
          audio_url: audioUrl.trim(),
          language
        })
        .select()
        .single();

      if (bookError) throw bookError;

      // 2. Transaction Step 2: Batch Insert Questions
      const questionsToInsert = parsedQuestions.map(q => ({
        audiobook_id: newBook.id,
        question_text: q.question_text,
        options: q.options,
        correct_answer: q.correct_answer
      }));

      const { error: quizError } = await supabase
        .from('quiz_questions')
        .insert(questionsToInsert);

      if (quizError) {
        // Rollback Audiobook insertion if quiz insertion fails to protect integrity
        await supabase.from('audiobooks').delete().eq('id', newBook.id);
        throw quizError;
      }

      toast.success("Audiobook and Quizzes published successfully! 🎧🎉");

      // Reset Form State
      setTitle('');
      setAudioUrl('');
      setQuizText('');
      setCategory('F2');
      setLanguage('English');
      if (audioPreviewObj) {
        audioPreviewObj.pause();
        setAudioPreviewObj(null);
        setIsPlayingPreview(false);
      }

      // Refresh list
      fetchAudiobooks();

    } catch (err: any) {
      console.error("Publication error:", err);
      toast.error(err.message || "Failed to publish audiobook CMS content.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Audiobook Handler
  const handleDeleteAudiobook = async (id: string) => {
    if (!confirm("Are you sure you want to delete this audiobook and all its associated quiz questions? This cannot be undone!")) return;

    try {
      const { error } = await supabase
        .from('audiobooks')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success("Audiobook deleted successfully");
      setAudiobooks(prev => prev.filter(b => b.id !== id));
      if (expandedAudiobook === id) setExpandedAudiobook(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete audiobook");
    }
  };

  // Style tags for Category Tiers
  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'F2': return 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-indigo-100/40';
      case 'F4': return 'bg-sky-50 border-sky-200 text-sky-700 shadow-sky-100/40';
      case 'F8': return 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-emerald-100/40';
      case 'F12': return 'bg-amber-50 border-amber-200 text-amber-700 shadow-amber-100/40';
      case 'F16': return 'bg-purple-50 border-purple-200 text-purple-700 shadow-purple-100/40';
      default: return 'bg-slate-50 border-slate-200 text-slate-700';
    }
  };

  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Volume2 size={32} className="text-indigo-600 animate-pulse" /> Audiobooks & Quizzes CMS
          </h2>
          <p className="text-slate-500 font-bold">Automate and deploy tiered audiobook courses and quiz challenges</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">

        {/* Creation Module Form (Left Side - Col 7) */}
        <section className="lg:col-span-7 bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-xl space-y-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="text-indigo-600 animate-bounce" size={24} />
              <h3 className="text-xl font-black text-slate-800">Create Audiobook Course</h3>
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 bg-slate-50 px-3 py-1 rounded-full">Automated Parser Included</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

              {/* Category selector */}
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Category Tier</label>
                <div className="relative">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full p-4 pr-10 rounded-xl bg-slate-50 border-none outline-none font-bold text-slate-700 appearance-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer"
                  >
                    {['F2', 'F4', 'F8', 'F12', 'F16'].map(lvl => (
                      <option key={lvl} value={lvl}>{lvl} Sadhana Tier</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" size={18} />
                </div>
              </div>

              {/* Language selector */}
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Language</label>
                <div className="relative">
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full p-4 pr-10 rounded-xl bg-slate-50 border-none outline-none font-bold text-slate-700 appearance-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer"
                  >
                    {['English', 'Hindi', 'Gujarati'].map(lang => (
                      <option key={lang} value={lang}>{lang}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" size={18} />
                </div>
              </div>

              {/* Audiobook Title */}
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Audiobook Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Nectar of Instruction Chapter 1"
                  className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none font-bold text-slate-700 placeholder-slate-300 focus:ring-2 focus:ring-indigo-500 transition-all"
                  required
                />
              </div>

              {/* Audio URL Input with Player Preview */}
              <div className="col-span-1 md:col-span-3">
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Audio File URL (Cloudflare R2, S3, etc.)</label>
                <div className="flex gap-3">
                  <input
                    type="url"
                    value={audioUrl}
                    onChange={(e) => setAudioUrl(e.target.value)}
                    placeholder="https://storage.cloudflare.com/audiobooks/noi-ch1.mp3"
                    className="flex-1 p-4 rounded-xl bg-slate-50 border-none outline-none font-bold text-slate-700 placeholder-slate-300 focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                    required
                  />
                  <button
                    type="button"
                    onClick={handleToggleAudioPreview}
                    className="px-5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl font-bold flex items-center gap-2 transition-all"
                    title="Instant Audio Preview"
                  >
                    {isPlayingPreview ? <Pause size={18} /> : <Play size={18} />}
                    <span className="hidden sm:inline text-xs uppercase tracking-wider font-black">Test Link</span>
                  </button>
                </div>
              </div>

              {/* Automation Quiz Data Textarea */}
              <div className="col-span-1 md:col-span-3">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">Automation Quiz Data Parser</label>
                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">Fast Auto-Mapping</span>
                </div>
                <textarea
                  value={quizText}
                  onChange={(e) => setQuizText(e.target.value)}
                  placeholder={`Question: What is the main focus?\nA) Chanting\nB) Reading\nC) Philosophy\nD) Meditation\nAnswer: A) Chanting`}
                  className="w-full h-56 p-4 rounded-xl bg-slate-50 border-none outline-none font-mono text-sm text-slate-700 placeholder-slate-300 focus:ring-2 focus:ring-indigo-500 transition-all resize-y"
                  required
                />
                <p className="text-[10px] text-slate-400 font-bold mt-2 leading-relaxed">
                  💡 **Parser Standard Format:** Paste blocks separated by empty lines. Ensure each contains exactly: `Question: 'Text'`, 4 options beginning with `A) `, `B) `, `C) `, `D) `, and `Answer: A) 'Text'` (or just `Answer: A`).
                </p>
              </div>

            </div>

            {/* Submit Action */}
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              <Plus size={20} />
              {isSubmitting ? 'Publishing Course...' : 'Publish Audiobook & Quizzes'}
            </button>
          </form>
        </section>

        {/* Real-time Visualizer & Student View Preview (Right Side - Col 5) */}
        <section className="lg:col-span-5 space-y-6 flex flex-col">

          {/* Parser Stats Summary */}
          <div className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-md">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <FileText size={16} className="text-indigo-600" /> Parser Engine Diagnostics
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 p-4 rounded-2xl text-center">
                <span className="text-2xl font-black text-slate-800">{parsedQuestions.length}</span>
                <p className="text-[9px] font-black text-slate-400 uppercase mt-1">Questions Detected</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl text-center">
                <span className={`text-2xl font-black ${parsedQuestions.length > 0 && parsedQuestions.every(q => q.isValid) ? 'text-emerald-500' : parsedQuestions.length === 0 ? 'text-slate-400' : 'text-rose-500'}`}>
                  {parsedQuestions.length === 0 ? '0' : parsedQuestions.filter(q => q.isValid).length}
                </span>
                <p className="text-[9px] font-black text-slate-400 uppercase mt-1">Ready for Import</p>
              </div>
            </div>
          </div>

          {/* Real-time Render Preview */}
          <div className="bg-slate-900 rounded-[2.5rem] p-6 border border-slate-800 text-white shadow-2xl flex-1 flex flex-col min-h-[350px]">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <HelpCircle size={18} className="text-indigo-400" />
                <h4 className="text-sm font-black uppercase tracking-widest text-slate-300">Live Student Quiz Preview</h4>
              </div>
              <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Sparkles size={8} /> Active
              </span>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[350px] space-y-6 pr-2 custom-scrollbar">
              <AnimatePresence mode="popLayout">
                {parsedQuestions.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-full flex flex-col items-center justify-center text-center text-slate-500 p-8 my-auto"
                  >
                    <BookOpen size={48} className="text-slate-700 mb-3 animate-pulse" />
                    <p className="font-bold text-sm text-slate-400">Waiting for Quiz Data input...</p>
                    <p className="text-xs text-slate-600 mt-1">Paste formatted questions to see a real-time responsive quiz card mock.</p>
                  </motion.div>
                ) : (
                  parsedQuestions.map((q, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-5 rounded-2xl border ${q.isValid ? 'bg-slate-800/40 border-slate-800' : 'bg-rose-950/20 border-rose-900/50'} space-y-4`}
                    >
                      {/* Question Index & Validation */}
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-black text-indigo-400 uppercase tracking-widest">Question #{idx + 1}</span>
                        {q.isValid ? (
                          <span className="flex items-center gap-1 text-[10px] font-black text-emerald-400"><CheckCircle size={12} /> Valid</span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] font-black text-rose-400"><AlertCircle size={12} /> Format Error</span>
                        )}
                      </div>

                      {/* Question text */}
                      <p className="font-bold text-slate-200 text-sm leading-snug">{q.question_text}</p>

                      {/* Display options */}
                      <div className="grid grid-cols-1 gap-2">
                        {q.options.map((opt, oIdx) => {
                          const letter = String.fromCharCode(65 + oIdx);
                          const isCorrect = opt === q.correct_answer;
                          return (
                            <div
                              key={oIdx}
                              className={`flex items-center justify-between p-3 rounded-xl text-xs font-bold transition-all ${isCorrect
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-slate-800 text-slate-400 border border-transparent'
                                }`}
                            >
                              <span>{letter}) {opt}</span>
                              {isCorrect && <CheckCircle size={14} className="text-emerald-400" />}
                            </div>
                          );
                        })}
                      </div>

                      {/* Show Parsing Errors */}
                      {!q.isValid && (
                        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-[10px] text-rose-300 font-bold space-y-1">
                          {q.errors.map((err, eIdx) => (
                            <p key={eIdx} className="flex items-center gap-1">⚠️ {err}</p>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </div>

        </section>
      </div>

      {/* Existing Audiobook Catalog & CMS Management */}
      <section className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-xl">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <BookOpen className="text-indigo-600" size={24} />
            <h3 className="text-xl font-black text-slate-800">Active Course Catalog</h3>
          </div>
          <span className="text-xs font-black text-slate-500 bg-slate-50 px-4 py-2 rounded-full shadow-sm">{audiobooks.length} Audiobooks Deployed</span>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-slate-400 font-bold">Refreshing Audiobook Catalog...</div>
        ) : audiobooks.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-slate-100 rounded-3xl text-slate-400 font-bold">
            No audiobooks uploaded yet. Create your first chapter above!
          </div>
        ) : (
          <div className="space-y-4">
            {audiobooks.map((book) => {
              const isExpanded = expandedAudiobook === book.id;
              return (
                <div
                  key={book.id}
                  className="border border-slate-100 rounded-3xl overflow-hidden shadow-sm transition-all"
                >
                  {/* Audiobook Row Header */}
                  <div
                    onClick={() => setExpandedAudiobook(isExpanded ? null : book.id)}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-6 bg-slate-50/50 hover:bg-slate-50 cursor-pointer transition-all gap-4"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <span className={`px-3 py-1.5 border rounded-full text-xs font-black shadow-sm ${getCategoryColor(book.category)}`}>
                        {book.category} Level
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-black text-slate-800 truncate text-base">{book.title}</h4>
                          <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 border rounded-md shadow-sm ${
                            book.language === 'Hindi'
                              ? 'bg-orange-50 text-orange-600 border-orange-100'
                              : book.language === 'Gujarati'
                              ? 'bg-purple-50 text-purple-600 border-purple-100'
                              : 'bg-indigo-50 text-indigo-600 border-indigo-100'
                          }`}>
                            {book.language || 'English'}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-[11px] font-bold text-slate-400">
                          <span className="flex items-center gap-1"><Calendar size={12} /> {new Date(book.created_at).toLocaleDateString()}</span>
                          <span className="flex items-center gap-1"><HelpCircle size={12} /> {book.quiz_questions?.length || 0} Questions</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 justify-end">
                      <a
                        href={book.audio_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-3 bg-white hover:bg-slate-100 border border-slate-100 rounded-xl text-slate-600 transition-all"
                        title="Open Raw Audio URL"
                      >
                        <ExternalLink size={16} />
                      </a>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAudiobook(book.id);
                        }}
                        className="p-3 bg-white hover:bg-red-50 border border-slate-100 rounded-xl text-red-500 transition-all"
                        title="Delete Course"
                      >
                        <Trash2 size={16} />
                      </button>
                      <div className="p-3 text-slate-400">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>
                  </div>

                  {/* Expandable Quiz list */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        exit={{ height: 0 }}
                        className="bg-white border-t border-slate-100 overflow-hidden"
                      >
                        <div className="p-6 space-y-5">
                          <h5 className="text-xs font-black uppercase text-slate-400 tracking-wider">Deployable Course Quizzes</h5>
                          {book.quiz_questions && book.quiz_questions.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {book.quiz_questions.map((q: any, qIdx: number) => (
                                <div key={q.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                                  <span className="text-[10px] font-black text-indigo-600 uppercase">Quiz Q#{qIdx + 1}</span>
                                  <p className="font-bold text-slate-800 text-xs leading-snug">{q.question_text}</p>

                                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                                    {q.options.map((opt: string, oIdx: number) => {
                                      const letter = String.fromCharCode(65 + oIdx);
                                      const isCorrect = opt === q.correct_answer;
                                      return (
                                        <div
                                          key={oIdx}
                                          className={`p-2 rounded-lg font-bold border transition-all ${isCorrect
                                              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                              : 'bg-white text-slate-500 border-transparent'
                                            }`}
                                        >
                                          {letter}) {opt}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs font-bold text-slate-400">No quizzes attached to this audiobook.</p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
