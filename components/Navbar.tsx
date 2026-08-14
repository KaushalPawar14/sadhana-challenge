'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { LogOut, Trophy, User, Award, LayoutDashboard, Sparkles, Radio, BookOpen } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';

export const Navbar = () => {
  const pathname = usePathname();
  const { isAdmin, signOut, user } = useAuthStore();

  const showUpcomingNotice = (itemName: string) => {
    toast.custom((t) => (
      <div
        className={`${
          t.visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        } max-w-sm w-full bg-white shadow-2xl rounded-[2rem] pointer-events-auto flex p-6 border border-slate-100 relative overflow-hidden transition-all duration-300 ease-out text-left`}
      >
        {/* Glow decoration */}
        <div className="absolute -top-10 -right-10 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl" />

        <div className="flex-1 flex gap-4 items-start">
          <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 flex-shrink-0 border border-indigo-100/30">
            {itemName === 'Books' ? (
              <BookOpen size={24} className="animate-pulse" />
            ) : (
              <Radio size={24} className="animate-pulse" />
            )}
          </div>
          <div>
            <p className="text-sm font-black text-slate-800 tracking-tight">{itemName}</p>
            <p className="text-xs font-bold text-slate-500 mt-1 leading-relaxed">
              {itemName === 'Books'
                ? 'Coming soon along with quizzes'
                : 'This segment is currently in production and will be updated soon. Stay tuned for expert audio podcasts and engaging spiritual quizzes!'}
            </p>
          </div>
        </div>
      </div>
    ), { duration: 4000, position: 'bottom-right' });
  };

  const navItems: Array<{ name: string; href: string; icon: any; isUpcoming?: boolean }> = [
    { name: 'Leaderboard', href: '/leaderboard', icon: Trophy },
    { name: 'Profile', href: '/profile', icon: User },
    { name: 'Awards', href: '/awards', icon: Award },
    // { name: 'Podcast', href: '/podcast', icon: Radio },
    // { name: 'Books', href: '/books', icon: BookOpen },
  ];

  if (isAdmin) {
    navItems.unshift({ name: 'Admin', href: '/admin', icon: LayoutDashboard });
  }

  // Don't show navbar on login, onboarding, or admin pages
  if (pathname === '/' || pathname === '/onboarding' || pathname.startsWith('/admin')) return null;

  return (
    <>
      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 px-6 py-2 md:hidden z-50 flex justify-around items-center">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={(e) => {
                if (item.isUpcoming) {
                  e.preventDefault();
                  showUpcomingNotice(item.name);
                }
              }}
              className={`flex flex-col items-center gap-1 transition-all ${
                isActive ? 'text-indigo-600 scale-110' : 'text-slate-500'
              }`}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-bold uppercase tracking-tighter">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Desktop Sidebar */}
      <nav className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-slate-200 p-6 flex-col z-50">
        <div className="flex items-center gap-3 mb-12 px-2">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <Sparkles size={24} />
          </div>
          <span className="font-black text-xl tracking-tight text-slate-800">SADHANA</span>
        </div>

        <div className="flex-1 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={(e) => {
                  if (item.isUpcoming) {
                    e.preventDefault();
                    showUpcomingNotice(item.name);
                  }
                }}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-600 font-bold shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-indigo-500'
                }`}
              >
                <Icon size={20} />
                <span>{item.name}</span>
                {isActive && (
                  <motion.div
                    layoutId="activeTab"
                    className="ml-auto w-1.5 h-1.5 bg-indigo-600 rounded-full"
                  />
                )}
              </Link>
            );
          })}
        </div>

        {user && (
          <div className="mt-auto pt-6 border-t border-slate-100">
            <div className="flex items-center gap-3 px-2 mb-6">
              <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold">
                {user.email?.[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">{user.user_metadata?.full_name || 'User'}</p>
                <p className="text-xs text-slate-500 truncate">{user.email}</p>
              </div>
            </div>
            <button
              onClick={() => signOut()}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all font-semibold"
            >
              <LogOut size={20} />
              <span>Sign Out</span>
            </button>
          </div>
        )}
      </nav>
    </>
  );
};
