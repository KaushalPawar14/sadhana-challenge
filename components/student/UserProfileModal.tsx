'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Flame, Trophy, Award, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '@/lib/supabaseClient';
import { addDays, istToday } from '@/lib/ist';
import { friendlyError } from '@/lib/errors';
import type { CompetitionType } from '@/lib/competition';

interface UserProfileModalProps {
  userId: string;
  competitionId: string;
  competitionType?: CompetitionType;
  /** last day of the competition: the 7-day chart never goes beyond it */
  endDate?: string;
  onClose: () => void;
}

interface PublicProfile {
  user: { id: string; full_name: string | null; avatar_url: string | null; department: string | null; gender: string | null };
  totals: { total: number; chanting_points: number; reading_points: number; bonus_points: number; current_streak: number; best_streak: number } | null;
  days: { date: string; chanting: number | null; reading: number | null; bonus: number | null }[];
  awards: { award_name: string; competition_title: string; unlock_date: string }[];
}

/** Public view of another student: public columns only (no phone number), loaded through get_public_profile. */
export const UserProfileModal = ({ userId, competitionId, competitionType = 'chanting', endDate, onClose }: UserProfileModalProps) => {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError('');
      const { data, error: err } = await supabase.rpc('get_public_profile', { p_user: userId, p_comp: competitionId });
      if (cancelled) return;
      if (err) {
        setError(friendlyError(err));
        setIsLoading(false);
        return;
      }
      const p = data as PublicProfile | null;
      setProfile(p);

      // last 7 days, ending today (IST) or on the competition's last day
      const today = istToday();
      const last = endDate && endDate < today ? endDate : today;
      const byDay: Record<string, { chanting: number; reading: number; bonus: number }> = {};
      (p?.days || []).forEach((d) => {
        byDay[d.date] = { chanting: Number(d.chanting || 0), reading: Number(d.reading || 0), bonus: Number(d.bonus || 0) };
      });
      const rows = [];
      for (let i = 6; i >= 0; i--) {
        const date = addDays(last, -i);
        const v = byDay[date] || { chanting: 0, reading: 0, bonus: 0 };
        rows.push({
          date: new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
          dateFull: date,
          Chanting: Math.round(v.chanting),
          Reading: Math.round(v.reading),
          Bonus: Math.round(v.bonus),
        });
      }
      setChartData(rows);
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId, competitionId, endDate]);

  if (!userId) return null;

  const showChanting = competitionType !== 'reading';
  const showReading = competitionType !== 'chanting';

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
      />

      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
      >
        <button onClick={onClose} className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 transition-colors z-20">
          <X size={24} />
        </button>

        {isLoading ? (
          <div className="p-20 flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : error || !profile ? (
          <div className="p-16 text-center text-slate-500 font-bold">{error || 'Profile not available.'}</div>
        ) : (
          <div className="flex flex-col md:flex-row overflow-y-auto md:overflow-hidden h-full flex-1 scrollbar-thin">
            {/* Left Sidebar Profile Info */}
            <div className="md:w-64 bg-slate-50 p-8 flex flex-col items-center text-center border-b md:border-b-0 md:border-r border-slate-100 md:overflow-y-auto scrollbar-none flex-shrink-0">
              <div className="w-24 h-24 bg-indigo-100 rounded-3xl flex items-center justify-center text-4xl mb-6 shadow-inner">
                {profile.user.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.user.avatar_url} alt="" className="w-full h-full rounded-3xl object-cover" />
                ) : '🧘'}
              </div>
              <h2 className="text-xl font-black text-slate-800 mb-1">{profile.user.full_name}</h2>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">{profile.user.department}</p>

              <div className="grid grid-cols-1 w-full gap-3">
                <div className="bg-white p-3 rounded-2xl border border-slate-100 flex items-center gap-3">
                  <Trophy className="text-amber-500" size={18} />
                  <div className="text-left">
                    <p className="text-[10px] font-bold text-slate-400 uppercase leading-none mb-1">Points</p>
                    <p className="text-sm font-black text-slate-800">{Math.round(Number(profile.totals?.total || 0)).toLocaleString()}</p>
                  </div>
                </div>
                <div className="bg-white p-3 rounded-2xl border border-slate-100 flex items-center gap-3">
                  <Flame className="text-orange-500" size={18} />
                  <div className="text-left">
                    <p className="text-[10px] font-bold text-slate-400 uppercase leading-none mb-1">Best Streak</p>
                    <p className="text-sm font-black text-slate-800">{profile.totals?.best_streak || 0} Days</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Main Content */}
            <div className="flex-1 p-8 md:p-10 md:overflow-y-auto scrollbar-thin">
              <div className="flex items-center gap-2 mb-8">
                <TrendingUp className="text-indigo-600" size={20} />
                <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm">Last 7 Days Performance</h3>
              </div>

              <div className="h-48 w-full mb-6">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} />
                    <YAxis hide />
                    <Tooltip
                      cursor={{ fill: '#f8fafc' }}
                      content={({ active, payload, label }) => {
                        if (!active || !payload || !payload.length) return null;
                        const v = (k: string) => Number(payload.find((p: any) => p.dataKey === k)?.value || 0);
                        return (
                          <div className="bg-white/95 backdrop-blur-sm p-4 rounded-2xl shadow-xl border border-slate-100/80 text-left min-w-[150px] z-50">
                            <p className="text-xs font-black text-slate-800 mb-2">{label}</p>
                            {v('Chanting') > 0 && <p className="text-[11px] font-bold text-orange-500">Chanting: {v('Chanting')} pts</p>}
                            {v('Reading') > 0 && <p className="text-[11px] font-bold text-teal-600">Reading: {v('Reading')} pts</p>}
                            {v('Bonus') > 0 && <p className="text-[11px] font-bold text-indigo-600">Bonus: {v('Bonus')} pts</p>}
                          </div>
                        );
                      }}
                    />
                    {showChanting && <Bar dataKey="Chanting" stackId="a" fill="#f97316" />}
                    {showReading && <Bar dataKey="Reading" stackId="a" fill="#14b8a6" />}
                    <Bar dataKey="Bonus" stackId="a" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Awards unlocked so far */}
              {profile.awards.length > 0 && (
                <div className="border-t border-slate-100 pt-6">
                  <div className="flex items-center gap-2 mb-3.5">
                    <Award size={14} className="text-amber-500" />
                    <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest leading-none">Awards</h4>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {profile.awards.map((a, i) => (
                      <span key={i} className="px-3 py-1.5 bg-amber-50 border border-amber-100 text-amber-700 rounded-full text-[11px] font-black">
                        🏅 {a.award_name} · {a.competition_title}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};
