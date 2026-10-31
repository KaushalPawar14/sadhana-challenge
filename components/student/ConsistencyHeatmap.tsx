'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { dateRange, istToday } from '@/lib/ist';

interface HeatmapProps {
  /** first / last day of the competition (IST, YYYY-MM-DD) */
  startDate: string;
  endDate: string;
  /** points scored per IST day (from the ledger) */
  dayPoints: Record<string, number>;
}

/** One box per competition day. Colour = that day's points relative to the student's best day. */
export const ConsistencyHeatmap = ({ startDate, endDate, dayPoints }: HeatmapProps) => {
  const today = istToday();
  const best = Math.max(0, ...Object.values(dayPoints));

  const days = dateRange(startDate, endDate).map((date) => {
    const pts = dayPoints[date] || 0;
    return {
      date,
      isToday: date === today,
      isFuture: date > today,
      completion: best > 0 ? Math.min(100, Math.round((pts / best) * 100)) : 0,
      pts,
    };
  });

  const getColor = (completion: number, isFuture: boolean) => {
    if (isFuture) return 'bg-slate-100';
    if (completion === 0) return 'bg-slate-200';
    if (completion < 50) return 'bg-orange-100';
    if (completion < 100) return 'bg-orange-400';
    return 'bg-amber-400';
  };

  return (
    <div className="grid grid-cols-7 gap-3">
      {days.map((day, i) => (
        <div key={day.date} className="relative" title={`${day.date}: ${day.pts} pts`}>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: Math.min(i, 40) * 0.02 }}
            className={`
              aspect-square rounded-xl flex items-center justify-center relative transition-all
              ${getColor(day.completion, day.isFuture)}
              ${day.isToday ? 'ring-2 ring-indigo-400' : ''}
              ${day.completion === 100 ? 'shadow-lg shadow-amber-200' : ''}
            `}
          >
            {day.completion === 100 && <Check size={14} className="text-white font-bold" strokeWidth={4} />}
            <span className={`text-[8px] absolute bottom-1 right-1 font-bold ${day.completion > 50 ? 'text-white' : 'text-slate-400'}`}>
              {i + 1}
            </span>
          </motion.div>
        </div>
      ))}
    </div>
  );
};
