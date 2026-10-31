'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import {
  Shield, Trash2, Plus, X, BookOpen, Volume2, Sparkles, ExternalLink, FileText, ChevronDown,
  Play, Pause, HelpCircle, Loader2, ShieldCheck, Timer,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import { friendlyError } from '@/lib/errors';
import { ViewOnlyNote } from '../_shared';

// ---------- types ----------
type Lang = 'Hindi' | 'English' | 'Gujarati';
interface Book { id: string; title: string; language: Lang; pdf_link: string; created_at: string }
interface Audiobook {
  id: string; category: string; title: string; audio_url: string; language: string | null;
  duration_seconds: number | null; created_at: string; questionCount: number;
}
interface ParsedQuestion { question_text: string; options: string[]; correct_answer: string; isValid: boolean; errors: string[] }
interface AdminRow { id: string; email: string; role: string }

const ROLE_COLS = [
  { key: 'HOD', title: 'Folk HOD', icon: '👑', cls: 'bg-amber-100/90 border-amber-300 text-amber-950' },
  { key: 'FOLK_GUIDE', title: 'Folk Guide', icon: '🚩', cls: 'bg-emerald-100/90 border-emerald-300 text-emerald-950' },
  { key: 'FOLK_ENABLER_MALE', title: 'Folk Enablers (Male)', icon: '👨', cls: 'bg-indigo-100/90 border-indigo-300 text-indigo-950' },
  { key: 'FOLK_ENABLER_FEMALE', title: 'Folk Enablers (Female)', icon: '👩', cls: 'bg-rose-100/90 border-rose-300 text-rose-950' },
];
const roleLabel = (r: string) => ROLE_COLS.find((c) => c.key === r)?.title ? `${ROLE_COLS.find((c) => c.key === r)!.icon} ${ROLE_COLS.find((c) => c.key === r)!.title}` : r;

/** Loads an audio file's metadata in the browser to read its duration (seconds). */
function probeDuration(url: string, timeoutMs = 15000): Promise<number | null> {
  return new Promise((resolve) => {
    const a = new Audio();
    const done = (v: number | null) => { a.removeAttribute('src'); a.load(); resolve(v); };
    const t = setTimeout(() => done(null), timeoutMs);
    a.preload = 'metadata';
    a.onloadedmetadata = () => { clearTimeout(t); done(Number.isFinite(a.duration) && a.duration > 0 ? Math.round(a.duration) : null); };
    a.onerror = () => { clearTimeout(t); done(null); };
    a.src = url;
  });
}

const fmtDuration = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : 'unknown');

export default function AdminSettings() {
  const { isHod, adminRole } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'whitelist' | 'books' | 'podcasts'>('books');

  // ---- admin whitelist ----
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [meEmail, setMeEmail] = useState('');
  const [newRole, setNewRole] = useState('FOLK_ENABLER_MALE');

  // ---- books ----
  const [books, setBooks] = useState<Book[]>([]);
  const [booksLoading, setBooksLoading] = useState(true);
  const [bookTitle, setBookTitle] = useState('');
  const [bookLang, setBookLang] = useState<Lang>('English');
  const [pdfLink, setPdfLink] = useState('');
  const [submittingBook, setSubmittingBook] = useState(false);
  const [bookFilter, setBookFilter] = useState<'ALL' | Lang>('ALL');

  // ---- podcasts ----
  const [audiobooks, setAudiobooks] = useState<Audiobook[]>([]);
  const [podcastsLoading, setPodcastsLoading] = useState(true);
  const [pCategory, setPCategory] = useState('F2');
  const [pLang, setPLang] = useState('English');
  const [pTitle, setPTitle] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [quizText, setQuizText] = useState('');
  const [parsed, setParsed] = useState<ParsedQuestion[]>([]);
  const [submittingPodcast, setSubmittingPodcast] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const [detecting, setDetecting] = useState(false);

  // ---------- loaders ----------
  const fetchAdmins = async () => {
    try {
      const res = await fetch('/api/admin-whitelist');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data?.admins)) setAdmins(data.admins);
      if (data?.currentUserEmail) setMeEmail(String(data.currentUserEmail).toLowerCase());
    } catch { /* roster is optional */ }
  };

  const fetchBooks = async () => {
    setBooksLoading(true);
    const { data, error } = await supabase.from('books').select('id,title,language,pdf_link,created_at').order('created_at', { ascending: false });
    if (error) toast.error(friendlyError(error));
    setBooks((data as Book[]) || []);
    setBooksLoading(false);
  };

  const fetchAudiobooks = async () => {
    setPodcastsLoading(true);
    const [{ data: ab, error }, { data: qs }] = await Promise.all([
      supabase.from('audiobooks').select('id,category,title,audio_url,language,duration_seconds,created_at').order('created_at', { ascending: true }),
      supabase.from('quiz_questions').select('audiobook_id'),
    ]);
    if (error) toast.error(friendlyError(error));
    const counts: Record<string, number> = {};
    (qs || []).forEach((q: any) => { counts[q.audiobook_id] = (counts[q.audiobook_id] || 0) + 1; });
    setAudiobooks(((ab as any[]) || []).map((a) => ({ ...a, questionCount: counts[a.id] || 0 })));
    setPodcastsLoading(false);
  };

  useEffect(() => {
    fetchAdmins();
    fetchBooks();
    fetchAudiobooks();
    return () => { previewRef.current?.pause(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- quiz paste-parser ----------
  useEffect(() => {
    if (!quizText.trim()) { setParsed([]); return; }
    const blocks = quizText.split(/(?=Question:)/i);
    const list: ParsedQuestion[] = [];
    blocks.forEach((block, index) => {
      const trimmed = block.trim();
      if (!trimmed) return;
      const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
      let questionText = '';
      const options: string[] = [];
      let correct = '';
      const errors: string[] = [];
      lines.forEach((line) => {
        if (line.toLowerCase().startsWith('question:')) questionText = line.substring(9).trim();
        else if (line.match(/^[A-D][)\.\s-]/i)) options.push(line.replace(/^[A-D][)\.\s-]/i, '').trim());
        else if (line.toLowerCase().startsWith('answer:')) {
          const raw = line.substring(7).trim();
          const letter = raw.match(/^([A-D])[)\.\s-]?$/i);
          correct = letter ? letter[1].toUpperCase() : raw.replace(/^[A-D][)\.\s-]/i, '').trim();
        }
      });
      if (['A', 'B', 'C', 'D'].includes(correct)) {
        const idx = correct.charCodeAt(0) - 65;
        if (options[idx]) correct = options[idx];
      }
      if (!questionText) errors.push("Missing 'Question:' line.");
      if (options.length !== 4) errors.push(`Requires exactly 4 options (A, B, C, D). Found ${options.length}.`);
      if (!correct) errors.push("Missing 'Answer:' line.");
      else if (options.length === 4 && !options.includes(correct)) errors.push(`Correct answer "${correct}" is not one of the 4 options.`);
      list.push({ question_text: questionText || `Question Block #${index + 1}`, options, correct_answer: correct, isValid: errors.length === 0, errors });
    });
    setParsed(list);
  }, [quizText]);

  // ---------- whitelist actions (HOD only; the API enforces it too) ----------
  const callWhitelist = async (method: 'POST' | 'PUT' | 'DELETE', body?: object, qs = '') => {
    const res = await fetch(`/api/admin-whitelist${qs}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  };

  const addAdmin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const email = String(new FormData(form).get('email') || '');
    try {
      await callWhitelist('POST', { email, role: newRole });
      toast.success(`Admin added as ${roleLabel(newRole)} 🛡️`);
      form.reset();
      fetchAdmins();
    } catch (err) { toast.error(friendlyError(err)); }
  };

  const changeRole = async (id: string, role: string) => {
    try {
      await callWhitelist('PUT', { id, role });
      toast.success(`Role updated to ${roleLabel(role)}`);
      setAdmins((prev) => prev.map((a) => (a.id === id ? { ...a, role } : a)));
    } catch (err) { toast.error(friendlyError(err)); fetchAdmins(); }
  };

  const removeAdmin = async (id: string) => {
    if (!confirm('Remove this admin?')) return;
    try {
      await callWhitelist('DELETE', undefined, `?id=${encodeURIComponent(id)}`);
      toast.success('Admin removed');
      fetchAdmins();
    } catch (err) { toast.error(friendlyError(err)); }
  };

  // ---------- books ----------
  const addBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookTitle.trim() || !pdfLink.trim()) return toast.error('Title and link are required.');
    setSubmittingBook(true);
    const { error } = await supabase.from('books').insert({ title: bookTitle.trim(), language: bookLang, pdf_link: pdfLink.trim() });
    setSubmittingBook(false);
    if (error) return toast.error(friendlyError(error));
    toast.success(`"${bookTitle.trim()}" published to the Library 📖`);
    setBookTitle(''); setPdfLink(''); setBookLang('English');
    fetchBooks();
  };

  const deleteBook = async (b: Book) => {
    // deleting a book would cascade-delete the reading sessions that already earned points
    const { count } = await supabase.from('reading_sessions').select('session_id', { count: 'exact', head: true }).eq('book_id', b.id);
    if (count && count > 0) {
      return toast.error(`"${b.title}" has ${count} reading sessions and cannot be deleted (it would remove students' reading history).`);
    }
    if (!confirm(`Delete "${b.title}"?`)) return;
    const { error } = await supabase.from('books').delete().eq('id', b.id);
    if (error) return toast.error(friendlyError(error));
    toast.success('Book deleted');
    setBooks((prev) => prev.filter((x) => x.id !== b.id));
  };

  // ---------- podcasts ----------
  const togglePreview = () => {
    if (!audioUrl.trim()) return toast.error('Enter an audio URL first.');
    if (previewPlaying && previewRef.current) { previewRef.current.pause(); setPreviewPlaying(false); return; }
    if (!previewRef.current || previewRef.current.src !== audioUrl.trim()) {
      previewRef.current?.pause();
      const a = new Audio(audioUrl.trim());
      a.onloadedmetadata = () => { if (Number.isFinite(a.duration) && a.duration > 0) setAudioDuration(Math.round(a.duration)); };
      a.onended = () => setPreviewPlaying(false);
      a.onerror = () => { setPreviewPlaying(false); toast.error('Could not load that audio file.'); };
      previewRef.current = a;
    }
    previewRef.current.play().then(() => setPreviewPlaying(true)).catch(() => toast.error('Could not play that audio file.'));
  };

  const submitPodcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pTitle.trim()) return toast.error('Title is required.');
    if (!audioUrl.trim()) return toast.error('Audio URL is required.');
    if (parsed.length === 0) return toast.error('Add at least 1 quiz question.');
    if (parsed.some((q) => !q.isValid)) return toast.error('Fix the quiz format errors first.');
    setSubmittingPodcast(true);
    try {
      let duration = audioDuration;
      if (!duration) duration = await probeDuration(audioUrl.trim());
      const { error } = await supabase.rpc('hod_save_audiobook', {
        p: {
          category: pCategory, title: pTitle.trim(), audio_url: audioUrl.trim(), language: pLang,
          duration_seconds: duration,
          questions: parsed.map((q) => ({ question_text: q.question_text, options: q.options, correct_answer: q.correct_answer })),
        },
      });
      if (error) throw error;
      toast.success(duration ? 'Podcast & quiz published 🎧' : 'Published — duration could not be read; use "Detect missing durations".');
      setPTitle(''); setAudioUrl(''); setQuizText(''); setAudioDuration(null);
      fetchAudiobooks();
    } catch (err) { toast.error(friendlyError(err)); }
    finally { setSubmittingPodcast(false); }
  };

  const deleteAudiobook = async (a: Audiobook) => {
    // quiz submissions / listening progress cascade with the audiobook
    const { count } = await supabase.from('quiz_submissions').select('id', { count: 'exact', head: true }).eq('audiobook_id', a.id);
    if (count && count > 0) return toast.error(`"${a.title}" already has ${count} quiz submission(s) and cannot be deleted.`);
    if (!confirm(`Delete "${a.title}" and its quiz?`)) return;
    const { error } = await supabase.from('audiobooks').delete().eq('id', a.id);
    if (error) return toast.error(friendlyError(error));
    toast.success('Podcast deleted');
    setAudiobooks((prev) => prev.filter((x) => x.id !== a.id));
  };

  const detectDurations = async () => {
    const missing = audiobooks.filter((a) => !a.duration_seconds);
    if (missing.length === 0) return toast.success('Every audiobook already has a duration.');
    setDetecting(true);
    let ok = 0;
    for (const a of missing) {
      const secs = await probeDuration(a.audio_url);
      if (!secs) continue;
      const { error } = await supabase.rpc('hod_set_audiobook_duration', { p_id: a.id, p_seconds: secs });
      if (!error) ok++;
    }
    setDetecting(false);
    toast.success(`Detected ${ok} of ${missing.length} durations.`);
    fetchAudiobooks();
  };

  // ---------- derived ----------
  const filteredBooks = useMemo(() => (bookFilter === 'ALL' ? books : books.filter((b) => b.language === bookFilter)), [books, bookFilter]);
  const adminsByRole = useMemo(() => {
    const map: Record<string, AdminRow[]> = { HOD: [], FOLK_GUIDE: [], FOLK_ENABLER_MALE: [], FOLK_ENABLER_FEMALE: [] };
    admins.forEach((a) => { (map[a.role] || map.FOLK_ENABLER_MALE).push(a); });
    return map;
  }, [admins]);
  const missingDurations = audiobooks.filter((a) => !a.duration_seconds).length;

  const tabCls = (t: string) =>
    `flex-1 min-w-[130px] flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer ${
      activeTab === t ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 scale-[1.02]' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
    }`;
  const inputCls = 'w-full p-4 rounded-xl bg-slate-50 border-none outline-none font-bold text-slate-700 text-sm';

  return (
    <div className="space-y-8 pb-16">
      <div>
        <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Settings & Content CMS</h2>
        <p className="text-slate-500 font-bold text-sm">Admin roster, books and podcasts. Competitions are managed under “Competitions”.</p>
      </div>

      {!isHod && <ViewOnlyNote role={adminRole} />}

      <div className="bg-white p-2 rounded-3xl border border-slate-100 shadow-md flex flex-wrap gap-2">
        <button onClick={() => setActiveTab('books')} className={tabCls('books')}><BookOpen size={16} /> Books</button>
        <button onClick={() => setActiveTab('podcasts')} className={tabCls('podcasts')}><Volume2 size={16} /> Podcasts</button>
        <button onClick={() => setActiveTab('whitelist')} className={tabCls('whitelist')}><Shield size={16} /> Admin roster</button>
      </div>

      {/* ---------------- ADMIN ROSTER ---------------- */}
      {activeTab === 'whitelist' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
          {isHod && (
            <section className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-100 shadow-xl space-y-5">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <Shield className="text-emerald-600" size={22} />
                <h3 className="text-lg font-black text-slate-800">Add an admin</h3>
              </div>
              <form onSubmit={addAdmin} className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                <div className="sm:col-span-6">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Email</label>
                  <input name="email" type="email" required placeholder="admin@email.com" className={inputCls} />
                </div>
                <div className="sm:col-span-4">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Role</label>
                  <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className={`${inputCls} cursor-pointer`}>
                    {ROLE_COLS.map((r) => <option key={r.key} value={r.key}>{r.icon} {r.title}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2 flex items-end">
                  <button type="submit" className="w-full py-4 bg-emerald-600 text-white rounded-xl font-black hover:bg-emerald-700 transition-all cursor-pointer flex items-center justify-center gap-1 text-sm">
                    <Plus size={18} /> Add
                  </button>
                </div>
              </form>
              <p className="text-[11px] text-slate-500 font-medium">Guides and Enablers can view their students’ data but cannot change anything. Only the HOD can write.</p>
            </section>
          )}

          <section className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-100 shadow-xl space-y-5">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-800">Admin roster</h3>
              <span className="text-xs font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full">{admins.length} admins</span>
            </div>
            {admins.length === 0 ? (
              <p className="text-center py-6 text-slate-400 font-bold text-sm">No admins to show.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {ROLE_COLS.filter((c) => (adminsByRole[c.key] || []).length > 0 || isHod).map((col) => (
                  <div key={col.key} className="bg-slate-50/70 border border-slate-200/80 rounded-3xl p-4 space-y-3">
                    <div className={`p-3 rounded-2xl border flex items-center justify-between ${col.cls}`}>
                      <span className="font-black text-xs sm:text-sm">{col.icon} {col.title}</span>
                      <span className="px-2.5 py-0.5 rounded-full font-black text-xs bg-white/70">{(adminsByRole[col.key] || []).length}</span>
                    </div>
                    {(adminsByRole[col.key] || []).length === 0 ? (
                      <p className="text-xs font-bold text-slate-400 text-center py-4">None</p>
                    ) : (adminsByRole[col.key] || []).map((a) => (
                      <div key={a.id} className="bg-white p-3.5 rounded-2xl border border-slate-200/80 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-800 text-xs truncate" title={a.email}>{a.email}{a.email.toLowerCase() === meEmail ? ' (you)' : ''}</span>
                          {isHod && a.email.toLowerCase() !== meEmail && (
                            <button onClick={() => removeAdmin(a.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-xl cursor-pointer" title="Remove admin" aria-label="Remove admin"><X size={15} /></button>
                          )}
                        </div>
                        {isHod && a.email.toLowerCase() !== meEmail && (
                          <select value={a.role} onChange={(e) => changeRole(a.id, e.target.value)} className="w-full px-3 py-2 rounded-xl text-xs font-black border border-slate-300 bg-white outline-none cursor-pointer">
                            {ROLE_COLS.map((r) => <option key={r.key} value={r.key}>{r.icon} {r.title}</option>)}
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
        </motion.div>
      )}

      {/* ---------------- BOOKS ---------------- */}
      {activeTab === 'books' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
          {isHod && (
            <section className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-100 shadow-xl space-y-5">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <Sparkles className="text-indigo-600" size={22} />
                <h3 className="text-lg font-black text-slate-800">Add a book</h3>
              </div>
              <form onSubmit={addBook} className="space-y-4">
                <input value={bookTitle} onChange={(e) => setBookTitle(e.target.value)} placeholder="Book title, e.g. Bhagavad Gita As It Is" className={inputCls} required />
                <div className="relative">
                  <select value={bookLang} onChange={(e) => setBookLang(e.target.value as Lang)} className={`${inputCls} appearance-none cursor-pointer pr-10`}>
                    <option>English</option><option>Hindi</option><option>Gujarati</option>
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" size={18} />
                </div>
                <input type="url" value={pdfLink} onChange={(e) => setPdfLink(e.target.value)} placeholder="Dropbox / PDF / .docx link" className={inputCls} required />
                <button type="submit" disabled={submittingBook} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70">
                  {submittingBook ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />} Publish book
                </button>
              </form>
            </section>
          )}

          <section className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-100 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><BookOpen className="text-indigo-600" size={20} /> Books ({books.length})</h3>
              <div className="flex flex-wrap gap-1.5 bg-slate-50 p-1.5 rounded-xl border border-slate-200/50">
                {(['ALL', 'English', 'Hindi', 'Gujarati'] as const).map((l) => (
                  <button key={l} onClick={() => setBookFilter(l)} className={`px-3 py-1.5 text-xs font-black uppercase rounded-lg cursor-pointer ${bookFilter === l ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-indigo-600'}`}>{l}</button>
                ))}
              </div>
            </div>
            {booksLoading ? (
              <p className="text-center py-6 text-slate-400 font-bold">Loading…</p>
            ) : filteredBooks.length === 0 ? (
              <p className="text-center py-6 text-slate-400 font-bold">No books found.</p>
            ) : (
              <div className="space-y-3">
                {filteredBooks.map((b) => (
                  <div key={b.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText size={18} className="text-indigo-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <h4 className="font-black text-slate-800 truncate text-sm">{b.title}</h4>
                        <span className="text-[10px] font-black uppercase text-indigo-600">{b.language}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <a href={b.pdf_link} target="_blank" rel="noreferrer" className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-600" aria-label="Open book"><ExternalLink size={14} /></a>
                      {isHod && <button onClick={() => deleteBook(b)} className="p-2.5 bg-white border border-slate-200 rounded-xl text-red-500 cursor-pointer" aria-label="Delete book"><Trash2 size={14} /></button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </motion.div>
      )}

      {/* ---------------- PODCASTS ---------------- */}
      {activeTab === 'podcasts' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
          <div className="flex gap-2 p-4 rounded-2xl bg-sky-50 border border-sky-100 text-sky-900 text-xs font-bold">
            <Timer size={16} className="flex-shrink-0 mt-0.5" />
            The “listen % to unlock the quiz” is now a setting of each competition (Competitions → Advanced scoring). Quizzes are graded on the server; correct answers are never sent to students.
          </div>

          {isHod && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <section className="lg:col-span-7 bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-100 shadow-xl space-y-5">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                  <Sparkles className="text-indigo-600" size={22} />
                  <h3 className="text-lg font-black text-slate-800">Create podcast course</h3>
                </div>
                <form onSubmit={submitPodcast} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <select value={pCategory} onChange={(e) => setPCategory(e.target.value)} className={inputCls} aria-label="Category">
                      {['F2', 'F4', 'F8', 'F12', 'F16'].map((c) => <option key={c} value={c}>{c} Tier</option>)}
                    </select>
                    <select value={pLang} onChange={(e) => setPLang(e.target.value)} className={inputCls} aria-label="Language">
                      {['English', 'Hindi', 'Gujarati'].map((l) => <option key={l}>{l}</option>)}
                    </select>
                    <input value={pTitle} onChange={(e) => setPTitle(e.target.value)} placeholder="Title…" className={inputCls} required />
                  </div>
                  <div>
                    <div className="flex gap-2">
                      <input type="url" value={audioUrl} onChange={(e) => { setAudioUrl(e.target.value); setAudioDuration(null); }} placeholder="Audio file URL https://…" className={`${inputCls} flex-1`} required />
                      <button type="button" onClick={togglePreview} className="px-4 bg-indigo-50 text-indigo-600 rounded-xl font-bold flex items-center gap-1 text-xs uppercase cursor-pointer">
                        {previewPlaying ? <Pause size={16} /> : <Play size={16} />} Test
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium mt-1">Duration: <strong>{fmtDuration(audioDuration)}</strong> (read automatically when you press Test or publish).</p>
                  </div>
                  <textarea
                    value={quizText} onChange={(e) => setQuizText(e.target.value)} required
                    placeholder={`Question: What is spirituality?\nA) Chanting\nB) Sleeping\nC) Gaming\nD) Running\nAnswer: A) Chanting`}
                    className="w-full h-44 p-4 rounded-xl bg-slate-50 font-mono text-sm text-slate-700 resize-y outline-none"
                  />
                  <button type="submit" disabled={submittingPodcast} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70">
                    {submittingPodcast ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />} Publish podcast & quiz
                  </button>
                </form>
              </section>

              <section className="lg:col-span-5 bg-slate-900 rounded-[2rem] p-6 text-white shadow-2xl flex flex-col justify-between">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2"><HelpCircle size={16} className="text-indigo-400" /> Live quiz preview</h4>
                  <div className="max-h-[300px] overflow-y-auto space-y-3 pr-1">
                    {parsed.length === 0 ? (
                      <p className="text-xs text-slate-500 font-bold py-10 text-center">Paste formatted questions to preview them.</p>
                    ) : parsed.map((q, idx) => (
                      <div key={idx} className={`p-4 rounded-2xl border space-y-2 ${q.isValid ? 'bg-slate-800/50 border-slate-700' : 'bg-rose-950/30 border-rose-800'}`}>
                        <div className="flex justify-between text-xs">
                          <span className="font-bold text-indigo-400">Q#{idx + 1}</span>
                          {q.isValid ? <span className="text-[10px] text-emerald-400 font-black">Valid</span> : <span className="text-[10px] text-rose-400 font-black">Format error</span>}
                        </div>
                        <p className="text-xs font-bold text-slate-200">{q.question_text}</p>
                        {q.errors.map((er, i) => <p key={i} className="text-[10px] text-rose-300">{er}</p>)}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="pt-4 border-t border-slate-800 flex justify-between text-xs text-slate-400 font-bold">
                  <span>Detected: {parsed.length}</span>
                  <span className="text-emerald-400">Valid: {parsed.filter((q) => q.isValid).length}</span>
                </div>
              </section>
            </div>
          )}

          <section className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-100 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-lg font-black text-slate-800">Podcasts catalog ({audiobooks.length})</h3>
              {isHod && (
                <button onClick={detectDurations} disabled={detecting || missingDurations === 0}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50">
                  {detecting ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                  Detect missing durations ({missingDurations})
                </button>
              )}
            </div>
            {missingDurations > 0 && (
              <p className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3">
                {missingDurations} audiobook(s) have no stored duration. The server needs the duration to confirm that a student really listened.
              </p>
            )}
            {podcastsLoading ? (
              <p className="text-center py-6 text-slate-400 font-bold">Loading…</p>
            ) : audiobooks.length === 0 ? (
              <p className="text-center py-6 text-slate-400 font-bold">No podcasts uploaded yet.</p>
            ) : (
              <div className="space-y-3">
                {audiobooks.map((a) => (
                  <div key={a.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="font-black text-slate-800 text-sm truncate">{a.title}</h4>
                      <span className="text-[10px] font-black uppercase text-indigo-600">
                        {a.category} Tier · {a.language || 'English'} · {a.questionCount} question{a.questionCount === 1 ? '' : 's'} · {fmtDuration(a.duration_seconds)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <a href={a.audio_url} target="_blank" rel="noreferrer" className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-600" aria-label="Open audio"><ExternalLink size={14} /></a>
                      {isHod && <button onClick={() => deleteAudiobook(a)} className="p-2.5 bg-white border border-slate-200 rounded-xl text-red-500 cursor-pointer" aria-label="Delete podcast"><Trash2 size={14} /></button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </motion.div>
      )}
    </div>
  );
}
