'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { LogIn } from 'lucide-react';
import Link from 'next/link';
import { isSupabaseConfigured, supabase } from '@/lib/supabaseClient';

export default function LoginPage() {
  const handleGoogleLogin = async () => {
    if (!isSupabaseConfigured) return;
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // 3. Use window.location.origin so it works in production too!
        redirectTo: `${window.location.origin}/auth/callback`,
        // 4. Force Google to grant offline access (prevents token bugs later)
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-[#FF9933] via-[#4A148C] to-[#2E0854]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="w-full max-w-md"
      >
        <div className="bg-white/10 backdrop-blur-xl p-10 rounded-[2.5rem] border border-white/20 shadow-2xl text-center">
          <motion.div
            animate={{
              scale: [1, 1.1, 1],
              rotate: [0, 5, -5, 0]
            }}
            transition={{ duration: 5, repeat: Infinity }}
            className="inline-block mb-6"
          >
            <div className="w-20 h-20 bg-gradient-to-tr from-orange-400 to-yellow-300 rounded-full flex items-center justify-center shadow-lg shadow-orange-500/30">
              <span className="text-4xl">🪷</span>
            </div>
          </motion.div>

          <h1 className="text-4xl font-black text-white mb-3 tracking-tight">
            FOLK Surat
          </h1>
          <p className="text-orange-200 font-medium mb-12 opacity-90">
            Illuminate your spiritual journey
          </p>

          <button
            onClick={handleGoogleLogin}
            disabled={!isSupabaseConfigured}
            className="w-full group relative flex items-center justify-center gap-3 bg-[#FFD700] hover:bg-[#FFC400] text-[#4A148C] py-4 px-6 rounded-2xl font-bold text-lg transition-all duration-300 transform hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(255,215,0,0.4)] overflow-hidden"
          >
            <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-12" />
            <LogIn size={22} className="relative z-10" />
            <span className="relative z-10">Continue with Google</span>
          </button>

          {!isSupabaseConfigured && (
            <div className="mt-5 rounded-2xl border border-white/20 bg-white/10 p-4 text-left">
              <p className="text-xs font-bold leading-5 text-white/75">
                Google OAuth credentials are not present in this local build. The private dashboard preview remains available with synthetic data.
              </p>
              <Link href="/admin" className="mt-3 inline-flex text-sm font-black text-yellow-300 underline underline-offset-4">
                Open private MVP preview
              </Link>
            </div>
          )}

          <p className="mt-8 text-xs text-white/40 uppercase tracking-[0.2em]">
            Your daily spiritual-growth companion
          </p>
        </div>
      </motion.div>
    </main>
  );
}
