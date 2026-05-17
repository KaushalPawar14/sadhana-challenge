'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

interface HeatmapProps {
  logs: any[];
  startDate: string;
  targets: { chanting: number; reading: number; hearing: number };
}

export const ConsistencyHeatmap = ({ logs, startDate, targets }: HeatmapProps) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = Array.from({ length: 26 }, (_, i) => {
    const [year, month, day] = startDate ? startDate.split('-').map(Number) : [2026, 1, 1];
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + i);

    const yStr = date.getFullYear();
    const mStr = String(date.getMonth() + 1).padStart(2, '0');
    const dStr = String(date.getDate()).padStart(2, '0');
    const dateStr = `${yStr}-${mStr}-${dStr}`;

    const log = logs.find(l => l.log_date === dateStr);

    let completion = 0;
    if (log) {
      const c = targets.chanting > 0 ? Math.min(1, log.chanting_rounds / targets.chanting) : 1;
      const r = targets.reading > 0 ? Math.min(1, log.reading_minutes / targets.reading) : 1;
      completion = ((c + r) / 2) * 100;
    }

    const dTime = new Date(date).setHours(0, 0, 0, 0);
    const tTime = new Date(today).setHours(0, 0, 0, 0);

    return {
      date: dateStr,
      isToday: dTime === tTime,
      isFuture: dTime > tTime,
      completion,
      log
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
        <div key={day.date} className="relative">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: i * 0.02 }}
            className={`
              aspect-square rounded-xl flex items-center justify-center relative transition-all
              ${getColor(day.completion, day.isFuture)}
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