'use client';

import React, { ReactNode, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabaseClient';
import { 
  LayoutDashboard, Users, Settings, Award, 
  ListOrdered, Eye, LogOut, ShieldCheck, BookOpen 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useAuthStore();
  const [challengeImageUrl, setChallengeImageUrl] = useState<string>('');

  useEffect(() => {
    async function fetchChallengeImage() {
      try {
        const { data } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'challenge_image_url')
          .maybeSingle();
        if (data?.value) {
          setChallengeImageUrl(data.value);
        }
      } catch (err) {
        console.error('Error loading challenge cover image:', err);
      }
    }
    fetchChallengeImage();
  }, []);

  const menuItems = [
    { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { name: 'Audiobooks', href: '/admin/audiobooks', icon: BookOpen },
    { name: 'Books', href: '/admin/books', icon: BookOpen },
    { name: 'Users', href: '/admin/users', icon: Users },
    { name: 'Settings', href: '/admin/settings', icon: Settings },
    { name: 'Logs', href: '/admin/logs', icon: ListOrdered },
  ];


  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Mobile Top Header (only visible on mobile/tablet) */}
      <header className="lg:hidden w-full bg-slate-900 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-40 select-none shadow-md">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsMobileMenuOpen(prev => !prev)}
            className="p-2 hover:bg-slate-800 rounded-xl transition-all cursor-pointer text-slate-300 hover:text-white"
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            )}
          </button>
          
          {challengeImageUrl ? (
            <img
              src={challengeImageUrl}
              alt="Challenge Logo"
              className="w-8 h-8 rounded-full object-cover border-2 border-indigo-500/30"
            />
          ) : (
            <div className="w-8 h-8 bg-indigo-500/20 rounded-full flex items-center justify-center text-indigo-400">
              <BookOpen size={16} />
            </div>
          )}
          <span className="font-black text-xs tracking-widest uppercase">Admin Panel</span>
        </div>

        <div className="w-8 h-8 bg-indigo-500/20 rounded-full flex items-center justify-center text-indigo-400 font-black text-xs">
          {user?.email?.[0].toUpperCase()}
        </div>
      </header>

      {/* Desktop Sidebar (visible only on desktop) */}
      <aside className="hidden lg:flex w-64 bg-slate-900 text-slate-300 flex-col fixed inset-y-0 z-50">
        <div className="p-8 flex flex-col items-center">
          {challengeImageUrl ? (
            <img
              src={challengeImageUrl}
              alt="Challenge Logo"
              className="w-20 h-20 rounded-full object-cover border-4 border-indigo-500/30 shadow-lg shadow-indigo-500/20"
            />
          ) : (
            <div className="w-20 h-20 bg-indigo-500/20 rounded-full flex items-center justify-center text-indigo-400 border-4 border-indigo-500/30">
              <BookOpen size={32} />
            </div>
          )}
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          {menuItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm
                  ${isActive 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
                    : 'hover:bg-slate-800 hover:text-white'}
                `}
              >
                <Icon size={18} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 mt-auto">
          <div className="bg-slate-800/50 rounded-2xl p-4 mb-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-indigo-500/20 rounded-full flex items-center justify-center text-indigo-400 font-bold">
                {user?.email?.[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate">{user?.user_metadata?.full_name || 'Admin'}</p>
                <p className="text-[10px] text-slate-500 truncate">{user?.email}</p>
              </div>
            </div>
            <Link 
              href="/leaderboard"
              className="w-full flex items-center justify-center gap-2 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-bold text-white transition-all mb-2"
            >
              <Eye size={14} /> View as Student
            </Link>
            <button 
              onClick={() => signOut()}
              className="w-full flex items-center justify-center gap-2 py-2 text-slate-400 hover:text-red-400 text-xs font-bold transition-all cursor-pointer"
            >
              <LogOut size={14} /> Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer Navigation (visible on toggle) */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            {/* Backdrop overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black z-40 lg:hidden"
            />
            {/* Sliding Panel */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
              className="fixed inset-y-0 left-0 w-72 bg-slate-900 text-slate-300 z-50 flex flex-col p-6 shadow-2xl lg:hidden"
            >
              <div className="flex items-center justify-between mb-8">
                <span className="font-black text-sm tracking-widest uppercase text-white">Navigation</span>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1 hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>

              <nav className="flex-1 space-y-2">
                {menuItems.map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`
                        flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm
                        ${isActive 
                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
                          : 'hover:bg-slate-800 hover:text-white'}
                      `}
                    >
                      <Icon size={18} />
                      {item.name}
                    </Link>
                  );
                })}
              </nav>

              <div className="mt-auto">
                <div className="bg-slate-800/50 rounded-2xl p-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-indigo-500/20 rounded-full flex items-center justify-center text-indigo-400 font-bold">
                      {user?.email?.[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate">{user?.user_metadata?.full_name || 'Admin'}</p>
                      <p className="text-[10px] text-slate-500 truncate">{user?.email}</p>
                    </div>
                  </div>
                  <Link 
                    href="/leaderboard"
                    className="w-full flex items-center justify-center gap-2 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-bold text-white transition-all mb-2"
                  >
                    <Eye size={14} /> View as Student
                  </Link>
                  <button 
                    onClick={() => signOut()}
                    className="w-full flex items-center justify-center gap-2 py-2 text-slate-400 hover:text-red-400 text-xs font-bold transition-all cursor-pointer"
                  >
                    <LogOut size={14} /> Sign Out
                  </button>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="flex-grow lg:ml-64 p-4 sm:p-8 md:p-12 transition-all">
        <div className="max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
