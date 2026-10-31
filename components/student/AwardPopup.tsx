'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { supabase } from '@/lib/supabaseClient';
import { AwardIcon } from '@/components/student/AwardIcons';
import { formatLong } from '@/lib/ist';

interface PendingAward {
  id: string;
  award_name: string;
  description: string | null;
  icon_key: string | null;
  image_url: string | null;
  competition_title: string;
  custom_message: string | null;
  rank: number | null;
  unlock_date: string;
}

/**
 * Celebratory popup for unlocked awards the student has not seen yet.
 * The check runs server-side on every page load (rpc get_pending_award_popups); dismissing calls
 * mark_award_seen so the popup never repeats.
 */
export const AwardPopup = () => {
  const pathname = usePathname();
  const [queue, setQueue] = useState<PendingAward[]>([]);
  const current = queue[0];

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_pending_award_popups');
    if (!error && Array.isArray(data)) setQueue(data as PendingAward[]);
  }, []);

  // every page load / navigation
  useEffect(() => {
    load();
  }, [pathname, load]);

  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => {
      confetti({ particleCount: 160, spread: 80, origin: { y: 0.55 } });
    }, 250);
    return () => clearTimeout(t);
  }, [current?.id]);

  const dismiss = async () => {
    if (!current) return;
    const id = current.id;
    setQueue((q) => q.slice(1)); // optimistic: next one (if any) shows immediately
    await supabase.rpc('mark_award_seen', { p_id: id });
  };

  return (
    <AnimatePresence>
      {current && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm"
          />
          <motion.div
            key={current.id}
            initial={{ scale: 0.85, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 220 }}
            className="relative w-full max-w-sm bg-white rounded-[2.5rem] p-8 text-center shadow-2xl border border-amber-100 overflow-hidden"
          >
            <div className="absolute -top-16 -left-16 w-48 h-48 bg-amber-300/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-indigo-400/20 rounded-full blur-3xl pointer-events-none" />

            <p className="relative text-[10px] font-black text-amber-600 uppercase tracking-[0.25em] mb-3">
              🎉 You won an award!
            </p>
            <div className="relative w-36 h-36 mx-auto mb-4">
              <AwardIcon iconKey={current.icon_key} imageUrl={current.image_url} />
            </div>
            <h2 className="relative text-2xl font-black text-slate-900 mb-1">{current.award_name}</h2>
            <p className="relative text-xs font-bold text-indigo-600 mb-4">
              {current.competition_title}
              {current.rank ? ` · Rank #${current.rank}` : ''}
            </p>
            {current.description && (
              <p className="relative text-xs text-slate-500 leading-relaxed mb-4">{current.description}</p>
            )}
            {current.custom_message && (
              <p className="relative text-sm font-bold text-slate-700 bg-amber-50 border border-amber-100 rounded-2xl p-3 mb-4">
                “{current.custom_message}”
              </p>
            )}
            <p className="relative text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">
              Unlocked {formatLong(current.unlock_date)}
              {queue.length > 1 ? ` · ${queue.length - 1} more` : ''}
            </p>
            <button
              onClick={dismiss}
              className="relative w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-2xl font-black text-sm shadow-lg shadow-orange-500/20 transition-all cursor-pointer"
            >
              Haribol! 🙏
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
