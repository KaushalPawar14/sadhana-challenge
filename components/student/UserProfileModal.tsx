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

    // Fetch Admin Bonus Points
    const { data: bonusData } = await supabase
      .from('bonus_points')
      .select('*')
      .eq('user_id', userId);
    
    const bonusPointsList = (bonusData || []).map(b => ({
      ...b,
      title: b.title || 'Bonus'
    }));

    // Fetch Quiz Submissions to include in history chart
    const { data: quizData } = await supabase
      .from('quiz_submissions')
      .select(`
        points_earned,
        submitted_at,
        audiobooks:audiobooks!audiobook_id (
          title
        )
      `)
      .eq('user_id', userId);

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
            ? (log.chanting_rounds / userData.target_chanting) * 10
            : 0;
          const readingPts = log && userData?.target_reading > 0
            ? (log.reading_minutes / userData.target_reading) * 10
            : 0;

          // Find bonuses for this day
          const dayBonuses = bonusPointsList.filter((b: any) => {
            const bDate = new Date(b.given_at);
            const y = bDate.getFullYear();
            const m = String(bDate.getMonth() + 1).padStart(2, '0');
            const dayStr = String(bDate.getDate()).padStart(2, '0');
            return `${y}-${m}-${dayStr}` === dStr;
          });
          const bonusPts = dayBonuses.reduce((acc: number, curr: any) => acc + curr.points, 0);
          const bonusDetails = dayBonuses.map((b: any) => `${b.title || 'Bonus'}: +${b.points}`).join(', ');

          // Find quizzes for this day
          const dayQuizzes = (quizData || []).filter((q: any) => {
            const qDate = new Date(q.submitted_at);
            const y = qDate.getFullYear();
            const m = String(qDate.getMonth() + 1).padStart(2, '0');
            const dayStr = String(qDate.getDate()).padStart(2, '0');
            return `${y}-${m}-${dayStr}` === dStr;
          });
          const quizPts = dayQuizzes.reduce((acc: number, curr: any) => acc + curr.points_earned, 0);
          const quizDetails = dayQuizzes.map((q: any) => `${q.audiobooks?.title || 'Quiz'}: +${q.points_earned}`).join(', ');

          last7.push({
            date: d.toLocaleDateString('en-US', { weekday: 'short' }),
            dateFull: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            Chanting: Math.round(chantingPts),
            Reading: Math.round(readingPts),
            Bonus: Math.round(bonusPts),
            'Bonus Reason': bonusDetails || undefined,
            Quiz: Math.round(quizPts),
            'Quiz Details': quizDetails || undefined
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
        className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
      >
        <button onClick={onClose} className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 transition-colors z-20">
          <X size={24} />
        </button>

        {isLoading ? (
          <div className="p-20 flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : profile && (
          <div className="flex flex-col md:flex-row overflow-y-auto md:overflow-hidden h-full flex-1 scrollbar-thin">
            {/* Left Sidebar Profile Info */}
            <div className="md:w-64 bg-slate-50 p-8 flex flex-col items-center text-center border-b md:border-b-0 md:border-r border-slate-100 md:overflow-y-auto scrollbar-none flex-shrink-0">
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
            <div className="flex-1 p-8 md:p-10 md:overflow-y-auto scrollbar-thin">
              <div className="flex items-center gap-2 mb-8">
                <TrendingUp className="text-indigo-600" size={20} />
                <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm">Last 7 Days Performance</h3>
              </div>

              <div className="h-48 w-full mb-6">
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
                          const bonusVal = payload.find((p: any) => p.dataKey === 'Bonus')?.value || 0;
                          const reasonVal = payload[0]?.payload?.['Bonus Reason'];
                          const quizVal = payload.find((p: any) => p.dataKey === 'Quiz')?.value || 0;
                          const quizReasonVal = payload[0]?.payload?.['Quiz Details'];
 
                          return (
                            <div className="bg-white/95 backdrop-blur-sm p-4 rounded-2xl shadow-xl border border-slate-100/80 text-left min-w-[150px] z-50">
                              <p className="text-xs font-black text-slate-800 mb-2">{label}</p>
                              {Number(chantingVal) > 0 && (
                                <p className="text-[11px] font-bold text-orange-500 flex items-center gap-1.5 mb-1">
                                  <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
                                  Chanting: {chantingVal} pts
                                </p>
                              )}
                              {/* {Number(readingVal) > 0 && (
                                <p className="text-[11px] font-bold text-teal-600 flex items-center gap-1.5 mb-1">
                                  <span className="w-2 h-2 rounded-full bg-teal-500 inline-block" />
                                  Reading: {readingVal} pts
                                </p>
                              )}
                              {Number(bonusVal) > 0 && (
                                <div className="mt-1 pt-1 border-t border-slate-100">
                                  <p className="text-[11px] font-bold text-indigo-600 flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
                                    Bonus: {bonusVal} pts
                                  </p>
                                  {reasonVal && (
                                    <p className="text-[9px] text-slate-400 font-semibold leading-normal ml-3.5 italic">
                                      {reasonVal}
                                    </p>
                                  )}
                                </div>
                              )}
                              {Number(quizVal) > 0 && (
                                <div className="mt-1 pt-1 border-t border-slate-100">
                                  <p className="text-[11px] font-bold text-pink-500 flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-pink-500 inline-block" />
                                    Quiz: {quizVal} pts
                                  </p>
                                  {quizReasonVal && (
                                    <p className="text-[9px] text-slate-400 font-semibold leading-normal ml-3.5 italic">
                                      {quizReasonVal}
                                    </p>
                                  )}
                                </div>
                              )} */}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="Chanting" stackId="a" fill="#f97316" radius={[4, 4, 0, 0]} />
                    {/* <Bar dataKey="Reading" stackId="a" fill="#14b8a6" /> */}
                    {/* <Bar dataKey="Bonus" stackId="a" fill="#6366f1" /> */}
                    {/* <Bar dataKey="Quiz" stackId="a" fill="#ec4899" radius={[4, 4, 0, 0]} /> */}
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

                <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100/50 text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Chanting</p>
                  <p className="text-base font-black text-slate-800">{profile.target_chanting} Rounds</p>
                  {/* <div className="text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Reading</p>
                    <p className="text-base font-black text-slate-800">{profile.target_reading} Min</p>
                  </div> */}
                </div>
              </div>

              </div>
            </div>
        )}
      </motion.div>
    </div>
  );
};
