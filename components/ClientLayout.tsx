'use client';

import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Navbar } from "@/components/Navbar";
import { AwardPopup } from '@/components/student/AwardPopup';
import { useAuthStore } from '@/store/authStore';

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const isAdminPath = pathname?.startsWith('/admin');
  // award popups: signed-in student pages only (not login, onboarding, auth or admin screens)
  const showAwardPopup = !!user && pathname !== '/' && pathname !== '/onboarding' && !pathname?.startsWith('/auth') && !isAdminPath;

  useEffect(() => {
    const applyTheme = () => {
      const savedTheme = localStorage.getItem('app_theme') || 'default';
      const root = document.documentElement;
      root.classList.remove('theme-dark', 'theme-cream');
      if (savedTheme === 'dark') {
        root.classList.add('theme-dark');
      } else if (savedTheme === 'cream') {
        root.classList.add('theme-cream');
      }
    };

    applyTheme();
    window.addEventListener('theme-change', applyTheme);
    return () => window.removeEventListener('theme-change', applyTheme);
  }, []);

  return (
    <>
      <Navbar />
      <main className={`${!isAdminPath ? 'md:ml-64' : ''} pb-24 md:pb-8 min-h-screen`}>
        <div className={`${!isAdminPath ? 'max-w-6xl mx-auto' : ''}`}>
          {children}
        </div>
      </main>
      {showAwardPopup && <AwardPopup />}
    </>
  );
}
