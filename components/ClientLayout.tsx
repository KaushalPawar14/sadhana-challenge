'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Navbar } from "@/components/Navbar";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminPath = pathname?.startsWith('/admin');

  return (
    <>
      <Navbar />
      <main className={`${!isAdminPath ? 'md:ml-64' : ''} pb-24 md:pb-8 min-h-screen`}>
        <div className={`${!isAdminPath ? 'max-w-6xl mx-auto' : ''}`}>
          {children}
        </div>
      </main>
    </>
  );
}
