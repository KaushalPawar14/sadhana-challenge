'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Flame, Trophy, Award, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { supabase } from '@/lib/supabaseClient';

interface UserProfileModalProps {
  userId: string;
  onClose: () => void;
}

export const UserProfileModal = ({ userId, onClose }: UserProfileModalProps) => {
  const [profile, setProfile] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, [userId]);

  const fetchProfile = async () => {
    setIsLoading(true);
    const { data: userData } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    setProfile(userData);

    try {
      const res = await fetch(`/api/user-logs?userId=${userId}`);
      if (res.ok) {
        const payload = await res.json();
        const activityLogs = Array.isArray(payload) ? payload : [];

        // Generate last 7 days chart data
        const last7 = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 6; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(today.getDate() - i);

          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const dStr = `${year}-${month}-${day}`;

          const log = activityLogs.find((l: any) => l.log_date === dStr);

          const chantingPts = log && userData?.target_chanting > 0
            ? (log.chanting_rounds / userData.target_chanting) * 8
            : 0;
          const readingPts = log && userData?.target_reading > 0
            ? (log.reading_minutes / userData.target_reading) * 30
            : 0;

          last7.push({
            date: d.toLocaleDateString('en-US', { weekday: 'short' }),
            dateFull: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            Chanting: Math.round(chantingPts),
            Reading: Math.round(readingPts)
          });
        }

        setChartData(last7);
      } else {
        setChartData([]);
      }
    } catch (e) {
      console.error('Failed to fetch activity logs:', e);
      setChartData([]);
    }

    setIsLoading(false);
  };

  if (!userId) return null;

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
        className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
      >
        <button onClick={onClose} className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 transition-colors z-10">
          <X size={24} />
        </button>

        {isLoading ? (
          <div className="p-20 flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : profile && (
          <div className="flex flex-col md:flex-row h-full">
            {/* Left Sidebar Profile Info */}
            <div className="md:w-64 bg-slate-50 p-8 flex flex-col items-center text-center border-b md:border-b-0 md:border-r border-slate-100">
              <div className="w-24 h-24 bg-indigo-100 rounded-3xl flex items-center justify-center text-4xl mb-6 shadow-inner">
                {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="w-full h-full rounded-3xl object-cover" /> : '🧘'}
              </div>
              <h2 className="text-xl font-black text-slate-800 mb-1">{profile.full_name}</h2>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">{profile.department}</p>

              <div className="grid grid-cols-1 w-full gap-3">
                <div className="bg-white p-3 rounded-2xl border border-slate-100 flex items-center gap-3">
                  <Trophy className="text-amber-500" size={18} />
                  <div className="text-left">
                    <p className="text-[10px] font-bold text-slate-400 uppercase leading-none mb-1">Total Points</p>
                    <p className="text-sm font-black text-slate-800">{profile.total_points?.toLocaleString()}</p>
                  </div>
                </div>
                <div className="bg-white p-3 rounded-2xl border border-slate-100 flex items-center gap-3">
                  <Flame className="text-orange-500" size={18} />
                  <div className="text-left">
                    <p className="text-[10px] font-bold text-slate-400 uppercase leading-none mb-1">Best Streak</p>
                    <p className="text-sm font-black text-slate-800">{profile.best_streak} Days</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Main Content */}
            <div className="flex-1 p-8 md:p-10">
              <div className="flex items-center gap-2 mb-8">
                <TrendingUp className="text-indigo-600" size={20} />
                <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm">Last 7 Days Performance</h3>
              </div>

              <div className="h-64 w-full mb-8">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                    />
                    <YAxis hide />
                    <Tooltip
                      cursor={{ fill: '#f8fafc' }}
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          const chantingVal = payload.find((p: any) => p.dataKey === 'Chanting')?.value || 0;
                          const readingVal = payload.find((p: any) => p.dataKey === 'Reading')?.value || 0;

                          return (
                            <div className="bg-white/95 backdrop-blur-sm p-4 rounded-2xl shadow-xl border border-slate-100/80 text-left min-w-[150px] z-50">
                              <p className="text-xs font-black text-slate-800 mb-2">{label}</p>
                              {Number(chantingVal) > 0 && (
                                <p className="text-[11px] font-bold text-orange-500 flex items-center gap-1.5 mb-1">
                                  <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
                                  Chanting: {chantingVal} pts
                                </p>
                              )}
                              {Number(readingVal) > 0 && (
                                <p className="text-[11px] font-bold text-teal-600 flex items-center gap-1.5 mb-1">
                                  <span className="w-2 h-2 rounded-full bg-teal-500 inline-block" />
                                  Reading: {readingVal} pts
                                </p>
                              )}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="Chanting" stackId="a" fill="#f97316" />
                    <Bar dataKey="Reading" stackId="a" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Commitment Section */}
              <div className="border-t border-slate-100 pt-6">
                <div className="flex items-center gap-2 mb-3.5 justify-center md:justify-start">
                  <span className="text-sm">🎯</span>
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest leading-none">
                    Daily Sadhana Commitment
                  </h4>
                </div>

                <div className="grid grid-cols-2 gap-3 bg-slate-50/50 p-4 rounded-2xl border border-slate-100/50">
                  <div className="text-center border-r border-slate-200/50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Chanting</p>
                    <p className="text-base font-black text-slate-800">{profile.target_chanting} Rounds</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Reading</p>
                    <p className="text-base font-black text-slate-800">{profile.target_reading} Min</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};
