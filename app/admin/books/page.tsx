'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';
import {
  BookOpen, Plus, Trash2, Globe, FileText,
  ExternalLink, Sparkles, AlertCircle, Calendar,
  ShieldCheck, Loader2, ChevronDown
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface Book {
  id: string;
  title: string;
  language: 'Hindi' | 'English' | 'Gujarati';
  pdf_link: string;
  created_at: string;
}

export default function AdminBooksCMS() {
  // CMS/Admin Form State
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState<'Hindi' | 'English' | 'Gujarati'>('English');
  const [pdfLink, setPdfLink] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Books List State
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLanguageFilter, setSelectedLanguageFilter] = useState<'ALL' | 'Hindi' | 'English' | 'Gujarati'>('ALL');

  useEffect(() => {
    fetchBooks();
  }, []);

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

  const handleAddBook = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) return toast.error('Book title is required.');
    if (!pdfLink.trim()) return toast.error('PDF link is required.');
    if (!pdfLink.startsWith('http://') && !pdfLink.startsWith('https://')) {
      return toast.error('Please enter a valid HTTP/HTTPS URL.');
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('books')
        .insert({
          title: title.trim(),
          language,
          pdf_link: pdfLink.trim(),
        })
        .select()
        .single();

      if (error) throw error;

      toast.success(`"${data.title}" successfully added to the library! 📖🎉`);
      setTitle('');
      setPdfLink('');
      setLanguage('English');
      fetchBooks(); // Refresh list
    } catch (err: any) {
      console.error('Error adding book:', err);
      toast.error(err.message || 'Failed to add book.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteBook = async (id: string, bookTitle: string) => {
    if (!confirm(`Are you sure you want to delete "${bookTitle}"? This cannot be undone.`)) return;

    try {
      const { error } = await supabase
        .from('books')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Book deleted successfully.');
      setBooks(prev => prev.filter(b => b.id !== id));
    } catch (err: any) {
      console.error('Error deleting book:', err);
      toast.error(err.message || 'Failed to delete book.');
    }
  };

  // Filter books by language selection
  const filteredBooks = React.useMemo(() => {
    if (selectedLanguageFilter === 'ALL') return books;
    return books.filter(b => b.language === selectedLanguageFilter);
  }, [books, selectedLanguageFilter]);

  // Style tags for languages
  const getLanguageBadgeStyles = (lang: string) => {
    switch (lang) {
      case 'Hindi':
        return 'bg-orange-50 border-orange-200 text-orange-700 shadow-orange-100/30';
      case 'Gujarati':
        return 'bg-purple-50 border-purple-200 text-purple-700 shadow-purple-100/30';
      default: // English
        return 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-indigo-100/30';
    }
  };

  // Language count helpers
  const languageCounts = React.useMemo(() => {
    const counts = { English: 0, Hindi: 0, Gujarati: 0 };
    books.forEach(b => {
      if (b.language in counts) {
        counts[b.language as keyof typeof counts]++;
      }
    });
    return counts;
  }, [books]);

  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <BookOpen size={32} className="text-indigo-600 animate-pulse" /> Books CMS
          </h2>
          <p className="text-slate-500 font-bold">Manage spiritual textbooks and active scriptures catalog</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Creation Module Form (Left Side - Col 7) */}
        <section className="lg:col-span-7 bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-xl space-y-8">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Sparkles className="text-indigo-600 animate-bounce" size={24} />
              <h3 className="text-xl font-black text-slate-800">Add New Book</h3>
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 bg-slate-50 px-3 py-1 rounded-full">Library Management</span>
          </div>

          <form onSubmit={handleAddBook} className="space-y-6">
            <div className="space-y-4">
              {/* Title input */}
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Book Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Bhagavad Gita As It Is"
                  className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none font-bold text-slate-700 placeholder-slate-300 focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                  required
                />
              </div>

              {/* Language selection dropdown */}
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Language</label>
                <div className="relative">
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as any)}
                    className="w-full p-4 pr-10 rounded-xl bg-slate-50 border-none outline-none font-bold text-slate-700 appearance-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer text-sm"
                  >
                    <option value="English">English</option>
                    <option value="Hindi">Hindi</option>
                    <option value="Gujarati">Gujarati</option>
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" size={18} />
                </div>
              </div>

              {/* PDF link */}
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Dropbox Book Link</label>
                <input
                  type="url"
                  value={pdfLink}
                  onChange={(e) => setPdfLink(e.target.value)}
                  placeholder="https://www.dropbox.com/s/.../book.pdf?dl=0"
                  className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none font-bold text-slate-700 placeholder-slate-300 focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                  required
                />
                <p className="text-[10px] text-slate-400 font-bold mt-2 leading-relaxed">
                  💡 Paste direct download/viewable URL to avoid rendering issues.
                </p>
              </div>
            </div>

            {/* Submit Action */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black shadow-xl shadow-indigo-100 hover:shadow-indigo-200 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-75 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin h-5 w-5" />
                  Publishing Book...
                </>
              ) : (
                <>
                  <Plus size={18} />
                  Publish Book to Library
                </>
              )}
            </button>
          </form>
        </section>

        {/* Diagnostic Panel (Right Side - Col 5) */}
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
                <span className="text-2xl font-black text-indigo-600">{languageCounts.English}</span>
                <p className="text-[9px] font-black text-slate-400 uppercase mt-1">English</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl text-center">
                <span className="text-2xl font-black text-orange-600">{languageCounts.Hindi}</span>
                <p className="text-[9px] font-black text-slate-400 uppercase mt-1">Hindi</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl text-center">
                <span className="text-2xl font-black text-purple-600">{languageCounts.Gujarati}</span>
                <p className="text-[9px] font-black text-slate-400 uppercase mt-1">Gujarati</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 rounded-[2.5rem] p-6 border border-slate-800 text-white shadow-2xl flex-1 flex flex-col justify-center text-center space-y-3">
            <BookOpen size={48} className="mx-auto text-indigo-400 animate-pulse" />
            <h4 className="text-sm font-black uppercase tracking-widest text-slate-300">Fast Sync Active</h4>
            <p className="text-xs text-slate-500 font-bold max-w-xs mx-auto leading-relaxed">
              Books posted here are instantly visible to all student devices in the app library. RLS ensures student telemetry remains tamper-proof.
            </p>
          </div>
        </section>
      </div>

      {/* Catalog List */}
      <section className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8">
          <div className="flex items-center gap-2">
            <BookOpen className="text-indigo-600" size={24} />
            <h3 className="text-xl font-black text-slate-800">Active Books Catalog</h3>
          </div>

          <div className="flex flex-wrap gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200/50">
            {(['ALL', 'English', 'Hindi', 'Gujarati'] as const).map((lang) => {
              const isActive = selectedLanguageFilter === lang;
              return (
                <button
                  key={lang}
                  onClick={() => setSelectedLanguageFilter(lang)}
                  className={`px-3 py-1.5 text-xs font-black uppercase rounded-lg transition-all ${isActive ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-indigo-600'
                    }`}
                >
                  {lang}
                </button>
              );
            })}
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-slate-400 font-bold">Refreshing Catalog...</div>
        ) : filteredBooks.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-slate-100 rounded-3xl text-slate-400 font-bold">
            No books found matching this filter.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredBooks.map((book) => (
              <div
                key={book.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-100 gap-4 hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="w-10 h-10 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 flex-shrink-0">
                    <FileText size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-black text-slate-800 truncate text-base">{book.title}</h4>
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 border rounded-md shadow-sm ${getLanguageBadgeStyles(book.language)}`}>
                        {book.language}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-[11px] font-bold text-slate-400">
                      <span className="flex items-center gap-1">
                        <Calendar size={12} /> {new Date(book.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 justify-end">
                  <a
                    href={book.pdf_link}
                    target="_blank"
                    rel="noreferrer"
                    className="p-3 bg-white hover:bg-slate-100 border border-slate-100 rounded-xl text-slate-600 transition-all"
                    title="Open Link"
                  >
                    <ExternalLink size={16} />
                  </a>
                  <button
                    onClick={() => handleDeleteBook(book.id, book.title)}
                    className="p-3 bg-white hover:bg-red-50 border border-slate-100 rounded-xl text-red-500 transition-all"
                    title="Delete Course"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
