'use client';

import React, { ReactNode, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabaseClient';
import {
  LayoutDashboard, Users, Settings, Eye, LogOut, BookOpen, Trophy, ClipboardList, Award,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ViewOnlyNote } from './_shared';

const ROLE_LABELS: Record<string, string> = {
  HOD: '👑 Folk HOD',
  FOLK_GUIDE: '🚩 Folk Guide',
  FOLK_ENABLER_MALE: '♂️ Male Enabler',
  FOLK_ENABLER_FEMALE: '♀️ Female Enabler',
};

const menuItems = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { name: 'Competitions', href: '/admin/competitions', icon: Trophy },
  { name: 'Users', href: '/admin/users', icon: Users },
  { name: 'Logs', href: '/admin/logs', icon: ClipboardList },
  { name: 'Awards', href: '/admin/awards', icon: Award },
  { name: 'Settings & CMS', href: '/admin/settings', icon: Settings },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, signOut, adminRole, isHod } = useAuthStore();
  const [coverUrl, setCoverUrl] = useState<string>('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.rpc('get_active_competition');
        const url = (data as any)?.competition?.cover_photo_url;
        if (!cancelled && url) setCoverUrl(url);
      } catch {
        /* cover image is decorative */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { setIsMobileMenuOpen(false); }, [pathname]);

  const isActive = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(href + '/'));
  const roleLabel = adminRole ? ROLE_LABELS[adminRole] || 'Admin' : 'Admin';

  const Logo = ({ size }: { size: 'sm' | 'lg' }) =>
    coverUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={coverUrl}
        alt="Competition logo"
        className={size === 'lg' ? 'w-16 h-16 rounded-full object-cover border-4 border-indigo-500/30 shadow-lg shadow-indigo-500/20' : 'w-8 h-8 rounded-full object-cover border-2 border-indigo-500/30'}
      />
    ) : (
      <div className={size === 'lg' ? 'w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center text-indigo-400 border-4 border-indigo-500/30' : 'w-8 h-8 bg-indigo-500/20 rounded-full flex items-center justify-center text-indigo-400'}>
        <BookOpen size={size === 'lg' ? 28 : 16} />
      </div>
    );

  const NavLinks = () => (
    <>
      {menuItems.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm ${
              isActive(item.href) ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Icon size={18} />
            {item.name}
          </Link>
        );
      })}
    </>
  );

  const UserCard = () => (
    <div className="bg-slate-800/50 rounded-2xl p-4 mb-2">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 bg-indigo-500/20 rounded-full flex items-center justify-center text-indigo-400 font-bold text-xs">
          {user?.email?.[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-white truncate">{user?.user_metadata?.full_name || 'Admin'}</p>
          <p className="text-[10px] text-slate-500 truncate mb-1">{user?.email}</p>
          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/60 inline-block">
            {roleLabel}
          </span>
        </div>
      </div>
      <Link href="/leaderboard" className="w-full flex items-center justify-center gap-2 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-bold text-white transition-all mb-2">
        <Eye size={14} /> View as Student
      </Link>
      <button onClick={() => signOut()} className="w-full flex items-center justify-center gap-2 py-2 text-slate-400 hover:text-red-400 text-xs font-bold transition-all cursor-pointer">
        <LogOut size={14} /> Sign Out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Mobile top header */}
      <header className="lg:hidden w-full bg-slate-900 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-40 select-none shadow-md">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            className="p-2 hover:bg-slate-800 rounded-xl transition-all cursor-pointer text-slate-300 hover:text-white"
            aria-label="Toggle menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              {isMobileMenuOpen ? (
                <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
              ) : (
                <><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></>
              )}
            </svg>
          </button>
          <Logo size="sm" />
          <span className="font-black text-xs tracking-widest uppercase">Admin Panel</span>
        </div>
        <div className="w-8 h-8 bg-indigo-500/20 rounded-full flex items-center justify-center text-indigo-400 font-black text-xs">
          {user?.email?.[0].toUpperCase()}
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 bg-slate-900 text-slate-300 flex-col fixed inset-y-0 z-50 overflow-y-auto">
        <div className="p-6 flex flex-col items-center">
          <Logo size="lg" />
          <span className="font-black text-xs tracking-widest uppercase text-white mt-3">Admin Portal</span>
        </div>
        <nav className="flex-1 px-4 space-y-2 mt-4"><NavLinks /></nav>
        <div className="p-4 mt-auto"><UserCard /></div>
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black z-40 lg:hidden"
            />
            <motion.aside
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
              className="fixed inset-y-0 left-0 w-72 bg-slate-900 text-slate-300 z-50 flex flex-col p-6 shadow-2xl lg:hidden overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <span className="font-black text-sm tracking-widest uppercase text-white">Navigation</span>
                <button onClick={() => setIsMobileMenuOpen(false)} className="p-1 hover:bg-slate-800 rounded-lg cursor-pointer" aria-label="Close menu">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <nav className="flex-1 space-y-2"><NavLinks /></nav>
              <div className="mt-auto pt-4"><UserCard /></div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main className="flex-grow lg:ml-64 p-4 sm:p-8 md:p-12 transition-all min-w-0">
        <div className="max-w-7xl mx-auto w-full">
          {adminRole && !isHod && (
            <div className="mb-6"><ViewOnlyNote role={adminRole} /></div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
