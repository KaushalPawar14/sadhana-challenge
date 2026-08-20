'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';
import { 
  Save, Shield, Trash2, AlertTriangle, Plus, X, 
  BookOpen, Volume2, Sparkles, Calendar, ExternalLink, 
  FileText, ChevronDown, ChevronUp, Play, Pause, HelpCircle, 
  CheckCircle, AlertCircle, Loader2, ShieldCheck, Layers 
} from 'lucide-react';
import { toast } from 'react-hot-toast';

// Types
interface Book {
  id: string;
  title: string;
  language: 'Hindi' | 'English' | 'Gujarati';
  pdf_link: string;
  created_at: string;
}

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

export default function AdminSettings() {
  const [activeTab, setActiveTab] = useState<'config' | 'whitelist' | 'books' | 'podcasts'>('config');

  // --- 1. CHALLENGE CONFIG & ADMIN WHITELIST STATE ---
  const [settings, setSettings] = useState<any>({});
  const [admins, setAdmins] = useState<any[]>([]);
  const [challengeImageUrl, setChallengeImageUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);

  // --- 2. BOOKS CMS STATE ---
  const [bookTitle, setBookTitle] = useState('');
  const [bookLanguage, setBookLanguage] = useState<'Hindi' | 'English' | 'Gujarati'>('English');
  const [pdfLink, setPdfLink] = useState('');
  const [isSubmittingBook, setIsSubmittingBook] = useState(false);
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoadingBooks, setIsLoadingBooks] = useState(false);
  const [selectedBookLanguageFilter, setSelectedBookLanguageFilter] = useState<'ALL' | 'Hindi' | 'English' | 'Gujarati'>('ALL');

  // --- 3. PODCASTS / AUDIOBOOKS CMS STATE ---
  const [podcastCategory, setPodcastCategory] = useState('F2');
  const [podcastTitle, setPodcastTitle] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [quizText, setQuizText] = useState('');
  const [podcastLanguage, setPodcastLanguage] = useState('English');
  const [parsedQuestions, setParsedQuestions] = useState<ParsedQuestion[]>([]);
  const [audiobooks, setAudiobooks] = useState<Audiobook[]>([]);
  const [isLoadingAudiobooks, setIsLoadingAudiobooks] = useState(false);
  const [isSubmittingPodcast, setIsSubmittingPodcast] = useState(false);
  const [expandedAudiobook, setExpandedAudiobook] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [audioPreviewObj, setAudioPreviewObj] = useState<HTMLAudioElement | null>(null);
  const [completionThreshold, setCompletionThreshold] = useState<number>(80);
  const [isEditingThreshold, setIsEditingThreshold] = useState(false);
  const [tempThreshold, setTempThreshold] = useState<string>('80');

  // Load Data on Mount
  useEffect(() => {
    fetchSettings();
    fetchAdmins();
    fetchBooks();
    fetchAudiobooks();
    fetchThreshold();

    return () => {
      if (audioPreviewObj) {
        audioPreviewObj.pause();
      }
    };
  }, []);

  // --- FETCHERS ---
  const fetchSettings = async () => {
    setIsLoadingSettings(true);
    const { data } = await supabase.from('app_settings').select('*');
    const settingsMap = data?.reduce((acc: any, curr: any) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    setSettings(settingsMap || {});
    setChallengeImageUrl(settingsMap?.challenge_image_url || '');
    setIsLoadingSettings(false);
  };

  const fetchAdmins = async () => {
    try {
      const res = await fetch('/api/admin-whitelist');
      if (res.ok) {
        const data = await res.json();
        setAdmins(data || []);
      }
    } catch (err) {
      console.error("Failed to load admin emails list", err);
    }
  };

  const fetchBooks = async () => {
    setIsLoadingBooks(true);
    try {
      const { data, error } = await supabase
        .from('books')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setBooks(data || []);
    } catch (err: any) {
      console.error('Error fetching books:', err);
    } finally {
      setIsLoadingBooks(false);
    }
  };

  const fetchAudiobooks = async () => {
    setIsLoadingAudiobooks(true);
    try {
      const { data: bList, error: bErr } = await supabase
        .from('audiobooks')
        .select('*')
        .order('created_at', { ascending: true });
      if (bErr) throw bErr;

      const enriched = await Promise.all(
        (bList || []).map(async (book) => {
          const { data: questions } = await supabase
            .from('quiz_questions')
            .select('*')
            .eq('audiobook_id', book.id);
          return { ...book, quiz_questions: questions || [] };
        })
      );
      setAudiobooks(enriched);
    } catch (err) {
      console.error("Error fetching audiobooks:", err);
    } finally {
      setIsLoadingAudiobooks(false);
    }
  };

  const fetchThreshold = async () => {
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'podcast_completion_threshold')
        .maybeSingle();

      if (data?.value) {
        const val = parseFloat(data.value);
        if (!isNaN(val)) {
          setCompletionThreshold(val);
          setTempThreshold(val.toString());
        }
      }
    } catch (err) {
      console.error("Error fetching threshold:", err);
    }
  };

  // --- PODCAST QUIZ PARSER EFFECT ---
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

      if (['A', 'B', 'C', 'D'].includes(correctAnswer)) {
        const idx = correctAnswer.charCodeAt(0) - 65;
        if (options[idx]) correctAnswer = options[idx];
      }

      if (!questionText) errors.push("Missing 'Question:' line.");
      if (options.length !== 4) errors.push(`Requires exactly 4 options (A, B, C, D). Found ${options.length}.`);
      if (!correctAnswer) errors.push("Missing 'Answer:' line.");
      else if (options.length === 4 && !options.includes(correctAnswer)) {
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

  // --- HANDLERS ---
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `campaign-${Date.now()}.${fileExt}`;
      const { data, error } = await supabase.storage.from('avatars').upload(fileName, file);

      if (error) {
        const { error: fbError } = await supabase.storage.from('public').upload(fileName, file);
        if (fbError) throw fbError;
        const { data: { publicUrl } } = supabase.storage.from('public').getPublicUrl(fileName);
        setChallengeImageUrl(publicUrl);
      } else {
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
        setChallengeImageUrl(publicUrl);
      }
      toast.success("Image uploaded successfully! 📸");
    } catch (err: any) {
      toast.error("Upload failed. You can paste any direct image URL! 🔗");
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpdateSetting = async (e: any) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const updates = Array.from(formData.entries()).map(([key, value]) => ({
      key,
      value: value.toString(),
      updated_at: new Date().toISOString()
    }));

    const { error } = await supabase.from('app_settings').upsert(updates);
    if (error) toast.error("Failed to update settings");
    else toast.success("Settings saved! ⚙️");
  };

  const handleAddAdmin = async (e: any) => {
    e.preventDefault();
    const email = new FormData(e.target).get('email') as string;
    try {
      const res = await fetch('/api/admin-whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      if (res.ok) {
        toast.success("Admin added successfully! 🛡️");
        fetchAdmins();
        e.target.reset();
      } else {
        const errData = await res.json();
        toast.error(errData.error || "Failed to add admin");
      }
    } catch (err) {
      toast.error("Failed to add admin email");
    }
  };

  const handleRemoveAdmin = async (id: string) => {
    if (!confirm("Are you sure you want to remove this admin?")) return;
    try {
      const res = await fetch(`/api/admin-whitelist?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success("Admin removed! 🗑️");
        fetchAdmins();
      } else {
        const errData = await res.json();
        toast.error(errData.error || "Failed to remove admin");
      }
    } catch (err) {
      toast.error("Failed to remove admin email");
    }
  };

  const handleAddBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookTitle.trim()) return toast.error('Book title is required.');
    if (!pdfLink.trim()) return toast.error('PDF link is required.');

    setIsSubmittingBook(true);
    try {
      const { data, error } = await supabase
        .from('books')
        .insert({ title: bookTitle.trim(), language: bookLanguage, pdf_link: pdfLink.trim() })
        .select()
        .single();

      if (error) throw error;
      toast.success(`"${data.title}" published to Library! 📖`);
      setBookTitle('');
      setPdfLink('');
      setBookLanguage('English');
      fetchBooks();
    } catch (err: any) {
      toast.error(err.message || 'Failed to add book.');
    } finally {
      setIsSubmittingBook(false);
    }
  };

  const handleDeleteBook = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"?`)) return;
    try {
      const { error } = await supabase.from('books').delete().eq('id', id);
      if (error) throw error;
      toast.success('Book deleted successfully.');
      setBooks(prev => prev.filter(b => b.id !== id));
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete book.');
    }
  };

  const handleToggleAudioPreview = () => {
    if (!audioUrl.trim()) return toast.error("Please enter an Audio URL first!");
    if (isPlayingPreview && audioPreviewObj) {
      audioPreviewObj.pause();
      setIsPlayingPreview(false);
    } else {
      try {
        const audio = audioPreviewObj || new Audio(audioUrl);
        if (!audioPreviewObj) setAudioPreviewObj(audio);
        audio.play();
        setIsPlayingPreview(true);
        audio.onended = () => setIsPlayingPreview(false);
      } catch (err) {
        toast.error("Invalid audio source file.");
      }
    }
  };

  const handleSaveThreshold = async () => {
    const val = parseFloat(tempThreshold);
    if (isNaN(val) || val < 1 || val > 100) {
      return toast.error("Please enter a percentage between 1 and 100.");
    }
    try {
      const { error } = await supabase.from('app_settings').upsert({
        key: 'podcast_completion_threshold',
        value: val.toString(),
        updated_at: new Date().toISOString()
      });
      if (error) throw error;
      setCompletionThreshold(val);
      setIsEditingThreshold(false);
      toast.success(`Timer threshold set to ${val}%! 🎧`);
    } catch (err) {
      toast.error("Failed to update threshold.");
    }
  };

  const handleSubmitPodcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!podcastTitle.trim()) return toast.error("Title is required.");
    if (!audioUrl.trim()) return toast.error("Audio URL is required.");
    if (parsedQuestions.length === 0) return toast.error("Add at least 1 quiz question.");
    if (parsedQuestions.some(q => !q.isValid)) return toast.error("Correct parsing errors first.");

    setIsSubmittingPodcast(true);
    try {
      const { data: newBook, error: bErr } = await supabase
        .from('audiobooks')
        .insert({ category: podcastCategory, title: podcastTitle.trim(), audio_url: audioUrl.trim(), language: podcastLanguage })
        .select()
        .single();

      if (bErr) throw bErr;

      const questionsToInsert = parsedQuestions.map(q => ({
        audiobook_id: newBook.id,
        question_text: q.question_text,
        options: q.options,
        correct_answer: q.correct_answer
      }));

      const { error: qErr } = await supabase.from('quiz_questions').insert(questionsToInsert);
      if (qErr) {
        await supabase.from('audiobooks').delete().eq('id', newBook.id);
        throw qErr;
      }

      toast.success("Podcast & Quiz published! 🎧🎉");
      setPodcastTitle('');
      setAudioUrl('');
      setQuizText('');
      fetchAudiobooks();
    } catch (err: any) {
      toast.error(err.message || "Failed to publish podcast.");
    } finally {
      setIsSubmittingPodcast(false);
    }
  };

  const handleDeleteAudiobook = async (id: string) => {
    if (!confirm("Delete this podcast course?")) return;
    try {
      const { error } = await supabase.from('audiobooks').delete().eq('id', id);
      if (error) throw error;
      toast.success("Podcast deleted.");
      setAudiobooks(prev => prev.filter(a => a.id !== id));
    } catch (err: any) {
      toast.error("Failed to delete podcast.");
    }
  };

  const handleReset = async (type: 'points' | 'streaks') => {
    const confirmText = prompt(`Type "RESET" to confirm resetting ALL ${type}:`);
    if (confirmText !== "RESET") return;

    if (type === 'points') {
      const { error: logErr } = await supabase.from('activity_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      const { error: userErr } = await supabase.from('users').update({ total_points: 0 }).neq('id', '00000000-0000-0000-0000-000000000000');
      if (logErr || userErr) toast.error("Reset failed");
      else toast.success("All points and logs reset!");
    } else {
      const { error } = await supabase.from('users').update({ streak_count: 0 }).neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) toast.error("Reset failed");
      else toast.success("All streaks reset!");
    }
  };

  // Helpers
  const filteredBooks = useMemo(() => {
    if (selectedBookLanguageFilter === 'ALL') return books;
    return books.filter(b => b.language === selectedBookLanguageFilter);
  }, [books, selectedBookLanguageFilter]);

  const bookLanguageCounts = useMemo(() => {
    const counts = { English: 0, Hindi: 0, Gujarati: 0 };
    books.forEach(b => {
      if (b.language in counts) counts[b.language as keyof typeof counts]++;
    });
    return counts;
  }, [books]);

  if (isLoadingSettings) {
    return <div className="p-10 text-slate-400 font-bold text-center">Loading Settings & CMS...</div>;
  }

  return (
    <div className="space-y-10 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Admin Settings & Content CMS</h2>
          <p className="text-slate-500 font-bold">Manage challenge configuration, security whitelist, books, and podcasts</p>
        </div>
      </div>

      {/* Modern 4-Tab Navigation Bar */}
      <div className="bg-white p-2 rounded-3xl border border-slate-100 shadow-md flex flex-wrap gap-2">
        <button
          onClick={() => setActiveTab('config')}
          className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'config'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 scale-[1.02]'
              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Save size={16} /> Challenge Config
        </button>

        <button
          onClick={() => setActiveTab('whitelist')}
          className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'whitelist'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 scale-[1.02]'
              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Shield size={16} /> Admin Whitelist
        </button>

        <button
          onClick={() => setActiveTab('books')}
          className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'books'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 scale-[1.02]'
              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <BookOpen size={16} /> Books CMS
        </button>

        <button
          onClick={() => setActiveTab('podcasts')}
          className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'podcasts'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 scale-[1.02]'
              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Volume2 size={16} /> Podcasts CMS
        </button>
      </div>

      {/* TAB CONTENT VIEWS */}
      <div className="min-h-[400px]">
        {/* --- TAB 1: CHALLENGE CONFIG --- */}
        {activeTab === 'config' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <section className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-xl max-w-3xl">
              <div className="flex items-center gap-2 mb-8">
                <Save className="text-indigo-600" size={24} />
                <h3 className="text-xl font-black text-slate-800">Challenge Configuration</h3>
              </div>
              
              <form onSubmit={handleUpdateSetting} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Challenge Name</label>
                    <input name="challenge_title" defaultValue={settings.challenge_title} className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none font-bold text-slate-700" required />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Starting Date</label>
                    <input name="challenge_start_date" type="date" defaultValue={settings.challenge_start_date} className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none font-bold text-slate-700" required />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">End Date</label>
                    <input name="challenge_end_date" type="date" defaultValue={settings.challenge_end_date} className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none font-bold text-slate-700" required />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Campaign Cover Photo (URL)</label>
                    <div className="flex gap-3 items-center">
                      <input 
                        name="challenge_image_url" 
                        type="url"
                        placeholder="https://example.com/image.jpg"
                        value={challengeImageUrl}
                        onChange={(e) => setChallengeImageUrl(e.target.value)}
                        className="flex-1 p-4 rounded-xl bg-slate-50 border-none outline-none font-bold text-slate-700 text-sm" 
                      />
                      <input 
                        type="file" 
                        id="campaign-image-upload" 
                        accept="image/*" 
                        onChange={handleImageUpload}
                        className="hidden" 
                      />
                      <label 
                        htmlFor="campaign-image-upload" 
                        className="px-5 py-4 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl font-black cursor-pointer whitespace-nowrap transition-all shadow-sm text-xs uppercase tracking-widest"
                      >
                        {isUploading ? 'Uploading...' : 'Upload File'}
                      </label>
                    </div>
                    {challengeImageUrl && (
                      <div className="mt-4 flex items-center gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <img src={challengeImageUrl} alt="Preview" className="w-12 h-12 rounded-full object-cover border-2 border-indigo-100 shadow-sm flex-shrink-0" />
                        <span className="text-xs font-bold text-slate-500 truncate flex-1">{challengeImageUrl}</span>
                      </div>
                    )}
                  </div>
                </div>

                <input type="hidden" name="log_cutoff_hour" value={settings.log_cutoff_hour || '21'} />
                <input type="hidden" name="freeze_credits_on_join" value={settings.freeze_credits_on_join || '1'} />
                <input type="hidden" name="points_per_chanting_round" value={settings.points_per_chanting_round || '8'} />
                <input type="hidden" name="points_per_reading_minute" value={settings.points_per_reading_minute || '30'} />

                <button type="submit" className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all cursor-pointer">
                  Save Challenge Settings
                </button>
              </form>
            </section>
          </motion.div>
        )}

        {/* --- TAB 2: ADMIN WHITELIST --- */}
        {activeTab === 'whitelist' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <section className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-xl max-w-2xl">
              <div className="flex items-center gap-2 mb-8">
                <Shield className="text-emerald-600" size={24} />
                <h3 className="text-xl font-black text-slate-800">Admin Whitelist</h3>
              </div>
              
              <form onSubmit={handleAddAdmin} className="flex gap-2 mb-6">
                <input name="email" type="email" required placeholder="admin@email.com" className="flex-1 p-4 rounded-xl bg-slate-50 border-none outline-none font-bold text-slate-700" />
                <button type="submit" className="px-6 py-4 bg-emerald-600 text-white rounded-xl font-black shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all cursor-pointer">
                  <Plus size={20} />
                </button>
              </form>

              <div className="space-y-2">
                {admins.map(a => (
                  <div key={a.id} className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="font-bold text-slate-700 text-sm">{a.email}</span>
                    <button onClick={() => handleRemoveAdmin(a.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-all cursor-pointer"><X size={16} /></button>
                  </div>
                ))}
              </div>
            </section>
          </motion.div>
        )}

        {/* --- TAB 3: BOOKS CMS --- */}
        {activeTab === 'books' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-10">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Form (Col 7) */}
              <section className="lg:col-span-7 bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-xl space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Sparkles className="text-indigo-600 animate-bounce" size={24} />
                    <h3 className="text-xl font-black text-slate-800">Add New Book</h3>
                  </div>
                </div>

                <form onSubmit={handleAddBook} className="space-y-5">
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Book Title</label>
                    <input
                      type="text"
                      value={bookTitle}
                      onChange={(e) => setBookTitle(e.target.value)}
                      placeholder="e.g. Bhagavad Gita As It Is"
                      className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none font-bold text-slate-700 text-sm"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Language</label>
                    <div className="relative">
                      <select
                        value={bookLanguage}
                        onChange={(e) => setBookLanguage(e.target.value as any)}
                        className="w-full p-4 pr-10 rounded-xl bg-slate-50 border-none outline-none font-bold text-slate-700 appearance-none cursor-pointer text-sm"
                      >
                        <option value="English">English</option>
                        <option value="Hindi">Hindi</option>
                        <option value="Gujarati">Gujarati</option>
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" size={18} />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Dropbox / PDF Link</label>
                    <input
                      type="url"
                      value={pdfLink}
                      onChange={(e) => setPdfLink(e.target.value)}
                      placeholder="https://www.dropbox.com/s/.../book.pdf?dl=0"
                      className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none font-bold text-slate-700 text-sm"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingBook}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black shadow-xl shadow-indigo-100 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
                  >
                    {isSubmittingBook ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
                    Publish Book to Library
                  </button>
                </form>
              </section>

              {/* Diagnostics (Col 5) */}
              <section className="lg:col-span-5 space-y-6 flex flex-col">
                <div className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-md">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <ShieldCheck size={16} className="text-indigo-600" /> Catalog Diagnostics
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-4 rounded-2xl text-center">
                      <span className="text-2xl font-black text-slate-800">{books.length}</span>
                      <p className="text-[9px] font-black text-slate-400 uppercase mt-1">Total Books</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-2xl text-center">
                      <span className="text-2xl font-black text-indigo-600">{bookLanguageCounts.English}</span>
                      <p className="text-[9px] font-black text-slate-400 uppercase mt-1">English</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-2xl text-center">
                      <span className="text-2xl font-black text-orange-600">{bookLanguageCounts.Hindi}</span>
                      <p className="text-[9px] font-black text-slate-400 uppercase mt-1">Hindi</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-2xl text-center">
                      <span className="text-2xl font-black text-purple-600">{bookLanguageCounts.Gujarati}</span>
                      <p className="text-[9px] font-black text-slate-400 uppercase mt-1">Gujarati</p>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* Catalog List */}
            <section className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-2">
                  <BookOpen className="text-indigo-600" size={22} />
                  <h3 className="text-xl font-black text-slate-800">Active Books Catalog</h3>
                </div>

                <div className="flex flex-wrap gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200/50">
                  {(['ALL', 'English', 'Hindi', 'Gujarati'] as const).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setSelectedBookLanguageFilter(lang)}
                      className={`px-3 py-1.5 text-xs font-black uppercase rounded-lg transition-all cursor-pointer ${
                        selectedBookLanguageFilter === lang ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-indigo-600'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>

              {isLoadingBooks ? (
                <div className="text-center py-8 text-slate-400 font-bold">Loading Books...</div>
              ) : filteredBooks.length === 0 ? (
                <div className="text-center py-8 text-slate-400 font-bold">No books found matching filter.</div>
              ) : (
                <div className="space-y-3">
                  {filteredBooks.map((book) => (
                    <div key={book.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText size={18} className="text-indigo-600 flex-shrink-0" />
                        <div className="min-w-0">
                          <h4 className="font-black text-slate-800 truncate text-sm">{book.title}</h4>
                          <span className="text-[10px] font-black uppercase text-indigo-600">{book.language}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <a href={book.pdf_link} target="_blank" rel="noreferrer" className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-600"><ExternalLink size={14} /></a>
                        <button onClick={() => handleDeleteBook(book.id, book.title)} className="p-2.5 bg-white border border-slate-200 rounded-xl text-red-500 cursor-pointer"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </motion.div>
        )}

        {/* --- TAB 4: PODCASTS CMS --- */}
        {activeTab === 'podcasts' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-10">
            {/* Threshold Timer Bar */}
            <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-md flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <span className="text-xl">⏱️</span>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Podcast Completion Timer</p>
                  <p className="text-sm font-black text-slate-800">Unlock Quiz At {completionThreshold}% Heard</p>
                </div>
              </div>
              {isEditingThreshold ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={tempThreshold}
                    onChange={(e) => setTempThreshold(e.target.value)}
                    className="w-16 p-2 rounded-xl bg-slate-50 font-black text-sm text-center outline-none border-2 border-indigo-200"
                  />
                  <button onClick={handleSaveThreshold} className="px-3 py-2 bg-indigo-600 text-white rounded-xl font-bold text-xs cursor-pointer">Save</button>
                  <button onClick={() => setIsEditingThreshold(false)} className="p-2 text-slate-400 font-bold text-xs cursor-pointer">✕</button>
                </div>
              ) : (
                <button onClick={() => setIsEditingThreshold(true)} className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl font-black text-xs cursor-pointer">⚙️ Adjust Timer %</button>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Podcast Form (Col 7) */}
              <section className="lg:col-span-7 bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-xl space-y-6">
                <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
                  <Sparkles className="text-indigo-600 animate-bounce" size={24} />
                  <h3 className="text-xl font-black text-slate-800">Create Podcast Course</h3>
                </div>

                <form onSubmit={handleSubmitPodcast} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase mb-2">Category Tier</label>
                      <select value={podcastCategory} onChange={(e) => setPodcastCategory(e.target.value)} className="w-full p-4 rounded-xl bg-slate-50 font-bold text-sm text-slate-700">
                        {['F2', 'F4', 'F8', 'F12', 'F16'].map(c => <option key={c} value={c}>{c} Tier</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase mb-2">Language</label>
                      <select value={podcastLanguage} onChange={(e) => setPodcastLanguage(e.target.value)} className="w-full p-4 rounded-xl bg-slate-50 font-bold text-sm text-slate-700">
                        {['English', 'Hindi', 'Gujarati'].map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase mb-2">Title</label>
                      <input type="text" value={podcastTitle} onChange={(e) => setPodcastTitle(e.target.value)} placeholder="Title..." className="w-full p-4 rounded-xl bg-slate-50 font-bold text-sm text-slate-700" required />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase mb-2">Audio File URL</label>
                    <div className="flex gap-2">
                      <input type="url" value={audioUrl} onChange={(e) => setAudioUrl(e.target.value)} placeholder="https://..." className="flex-1 p-4 rounded-xl bg-slate-50 font-bold text-sm text-slate-700" required />
                      <button type="button" onClick={handleToggleAudioPreview} className="px-4 bg-indigo-50 text-indigo-600 rounded-xl font-bold flex items-center gap-1 text-xs uppercase cursor-pointer">
                        {isPlayingPreview ? <Pause size={16} /> : <Play size={16} />} Test
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase mb-2">Automation Quiz Parser</label>
                    <textarea
                      value={quizText}
                      onChange={(e) => setQuizText(e.target.value)}
                      placeholder={`Question: What is spirituality?\nA) Chanting\nB) Sleeping\nC) Gaming\nD) Running\nAnswer: A) Chanting`}
                      className="w-full h-44 p-4 rounded-xl bg-slate-50 font-mono text-sm text-slate-700 resize-y"
                      required
                    />
                  </div>

                  <button type="submit" disabled={isSubmittingPodcast} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70">
                    <Plus size={18} /> Publish Podcast & Quiz
                  </button>
                </form>
              </section>

              {/* Real-time Render Preview (Col 5) */}
              <section className="lg:col-span-5 bg-slate-900 rounded-[2.5rem] p-6 text-white shadow-2xl flex flex-col justify-between">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                    <HelpCircle size={16} className="text-indigo-400" /> Live Quiz Preview
                  </h4>

                  <div className="max-h-[300px] overflow-y-auto space-y-4 pr-1">
                    {parsedQuestions.length === 0 ? (
                      <p className="text-xs text-slate-500 font-bold py-10 text-center">Paste formatted questions to view real-time card preview.</p>
                    ) : (
                      parsedQuestions.map((q, idx) => (
                        <div key={idx} className={`p-4 rounded-2xl border ${q.isValid ? 'bg-slate-800/50 border-slate-700' : 'bg-rose-950/30 border-rose-800'} space-y-3`}>
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-indigo-400">Q#{idx + 1}</span>
                            {q.isValid ? <span className="text-[10px] text-emerald-400 font-black">Valid</span> : <span className="text-[10px] text-rose-400 font-black">Format Error</span>}
                          </div>
                          <p className="text-xs font-bold text-slate-200">{q.question_text}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800 flex justify-between text-xs text-slate-400 font-bold">
                  <span>Detected: {parsedQuestions.length}</span>
                  <span className="text-emerald-400">Valid: {parsedQuestions.filter(q => q.isValid).length}</span>
                </div>
              </section>
            </div>

            {/* Catalog */}
            <section className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-xl">
              <h3 className="text-xl font-black text-slate-800 mb-6">Active Podcasts Catalog ({audiobooks.length})</h3>
              {isLoadingAudiobooks ? (
                <div className="text-center py-6 text-slate-400 font-bold">Loading Podcasts...</div>
              ) : audiobooks.length === 0 ? (
                <div className="text-center py-6 text-slate-400 font-bold">No podcasts uploaded yet.</div>
              ) : (
                <div className="space-y-3">
                  {audiobooks.map(a => (
                    <div key={a.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between gap-4">
                      <div>
                        <h4 className="font-black text-slate-800 text-sm">{a.title}</h4>
                        <span className="text-[10px] font-black uppercase text-indigo-600">{a.category} Tier · {a.language || 'English'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <a href={a.audio_url} target="_blank" rel="noreferrer" className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-600"><ExternalLink size={14} /></a>
                        <button onClick={() => handleDeleteAudiobook(a.id)} className="p-2.5 bg-white border border-slate-200 rounded-xl text-red-500 cursor-pointer"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </motion.div>
        )}
      </div>

      {/* --- DANGER ZONE AT THE VERY BOTTOM OF SETTINGS --- */}
      <section className="bg-red-50/90 rounded-[2.5rem] p-8 border border-red-100 shadow-xl mt-12">
        <div className="flex items-center gap-2 mb-4 text-red-600">
          <AlertTriangle size={24} />
          <h3 className="text-xl font-black">Danger Zone</h3>
        </div>
        <p className="text-xs font-bold text-red-500 mb-6 uppercase tracking-widest">Extreme caution required — Privileged System Resets</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button 
            onClick={() => handleReset('points')} 
            className="flex items-center justify-between p-5 bg-white border border-red-200 rounded-2xl text-red-600 font-black hover:bg-red-600 hover:text-white transition-all cursor-pointer group shadow-sm"
          >
            <span>Reset All Points & Activity Logs</span>
            <Trash2 size={18} className="opacity-60 group-hover:opacity-100" />
          </button>
          
          <button 
            onClick={() => handleReset('streaks')} 
            className="flex items-center justify-between p-5 bg-white border border-red-200 rounded-2xl text-red-600 font-black hover:bg-red-600 hover:text-white transition-all cursor-pointer group shadow-sm"
          >
            <span>Reset All Student Streaks</span>
            <Trash2 size={18} className="opacity-60 group-hover:opacity-100" />
          </button>
        </div>
      </section>
    </div>
  );
}
