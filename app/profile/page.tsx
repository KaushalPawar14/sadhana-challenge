'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import { AvatarTier } from '@/components/student/AvatarTiers';
import { ConsistencyHeatmap } from '@/components/student/ConsistencyHeatmap';
import {
  Flame, Trophy, Shield, Zap,
  BookOpen, Edit3, Check, Info
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { toast } from 'react-hot-toast';

const TIER_NAMES: Record<number, string> = {
  1: 'Noob',
  2: 'Survivor',
  3: 'Hustler',
  4: 'Champion',
  5: 'Legend',
  6: 'Superhuman'
};

export default function ProfilePage() {
  const { user } = useAuthStore();
  const [profile, setProfile] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [bonusPointsList, setBonusPointsList] = useState<any[]>([]);
  const [quizSubmissionsList, setQuizSubmissionsList] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    target_chanting: 0,
    target_reading: 0,
    target_hearing: 0
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch Profile
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', user?.id)
        .single();

      if (userData) {
        setProfile(userData);
        setEditData({
          target_chanting: userData.target_chanting,
          target_reading: userData.target_reading,
          target_hearing: userData.target_hearing
        });
      }

      // Fetch Logs
      const { data: activityLogs } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('user_id', user?.id)
        .order('log_date', { ascending: false });
      setLogs(activityLogs || []);

      // Fetch Bonus Points
      const { data: bonusData } = await supabase
        .from('bonus_points')
        .select('*')
        .eq('user_id', user?.id);
      
      const combinedBonuses = (bonusData || []).map(b => ({
        ...b,
        title: b.title || 'Bonus'
      }));
      setBonusPointsList(combinedBonuses);

      // Fetch Quiz Submissions to include in dashboard chart
      const { data: quizData } = await supabase
        .from('quiz_submissions')
        .select(`
          points_earned,
          submitted_at,
          audiobooks:audiobooks!audiobook_id (
            title
          )
        `)
        .eq('user_id', user?.id);
      setQuizSubmissionsList(quizData || []);

      // Fetch Settings
      const { data: appSettings } = await supabase.from('app_settings').select('*');
      const settingsMap = appSettings?.reduce((acc: any, curr: any) => {
        acc[curr.key] = curr.value;
        return acc;
      }, {});
      setSettings(settingsMap || {});
    } catch (error) {
      console.error("Error loading profile hub:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const pointsBreakdown = useMemo(() => {
    if (!profile) return { chanting: 0, reading: 0 };
    return logs.reduce((acc, log) => {
      const chantingPts = profile.target_chanting > 0 
        ? (log.chanting_rounds / profile.target_chanting) * 10 
        : 0;
      const readingPts = profile.target_reading > 0 
        ? (log.reading_minutes / profile.target_reading) * 10 
        : 0;

      acc.chanting += chantingPts;
      acc.reading += readingPts;
      return acc;
    }, { chanting: 0, reading: 0 });
  }, [logs, profile]);

  const parseLocalDate = (dateStr: string) => {
    if (!dateStr) return new Date();
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const challengeProgress = useMemo(() => {
    if (!settings.challenge_start_date || !settings.challenge_end_date) {
      return { day: 0, total: 26, logs: logs.length };
    }
    const start = parseLocalDate(settings.challenge_start_date);
    start.setHours(0, 0, 0, 0);
    const end = parseLocalDate(settings.challenge_end_date);
    end.setHours(0, 0, 0, 0);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const total = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    let day = 0;
    if (today >= start) {
      if (today > end) {
        day = total;
      } else {
        day = Math.round((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      }
    }
    return { day, total, logs: logs.length };
  }, [settings, logs]);

  const chartData = useMemo(() => {
    const last14 = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);

      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dStr = `${year}-${month}-${day}`;

      const log = logs.find(l => l.log_date === dStr);

      const chantingPts = log && profile?.target_chanting > 0
        ? (log.chanting_rounds / profile.target_chanting) * 10
        : 0;
      const readingPts = log && profile?.target_reading > 0
        ? (log.reading_minutes / profile.target_reading) * 10
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
      const dayQuizzes = quizSubmissionsList.filter((q: any) => {
        const qDate = new Date(q.submitted_at);
        const y = qDate.getFullYear();
        const m = String(qDate.getMonth() + 1).padStart(2, '0');
        const dayStr = String(qDate.getDate()).padStart(2, '0');
        return `${y}-${m}-${dayStr}` === dStr;
      });
      const quizPts = dayQuizzes.reduce((acc: number, curr: any) => acc + curr.points_earned, 0);
      const quizDetails = dayQuizzes.map((q: any) => `${q.audiobooks?.title || 'Quiz'}: +${q.points_earned}`).join(', ');

      last14.push({
        date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        Chanting: Math.round(chantingPts),
        Reading: Math.round(readingPts),
        Bonus: Math.round(bonusPts),
        'Bonus Reason': bonusDetails || undefined,
        Quiz: Math.round(quizPts),
        'Quiz Details': quizDetails || undefined,
        isMissing: !log
      });
    }
    return last14;
  }, [logs, profile, bonusPointsList, quizSubmissionsList]);

  const currentTier = useMemo(() => {
    const pts = profile?.total_points || 0;
    if (pts >= 1000) return 6;
    if (pts >= 750) return 5;
    if (pts >= 500) return 4;
    if (pts >= 300) return 3;
    if (pts >= 100) return 2;
    return 1;
  }, [profile]);

  const nextTierInfo = useMemo(() => {
    const pts = profile?.total_points || 0;
    const thresholds = [100, 300, 500, 750, 1000];
    const next = thresholds.find(t => t > pts);
    if (!next) return null;
    return { points: next - pts, tier: thresholds.indexOf(next) + 2 };
  }, [profile]);

  const handleUpdateTargets = async () => {
    if (editData.target_chanting < (profile?.target_chanting || 0)) {
      toast.error("Spiritual commitments can only be increased to reach higher heights, not decreased! 🚀");
      return;
    }
    if (editData.target_reading < (profile?.target_reading || 0)) {
      toast.error("Spiritual commitments can only be increased to reach higher heights, not decreased! 🚀");
      return;
    }

    try {
      const { error } = await supabase
        .from('users')
        .update(editData)
        .eq('id', user?.id);
      if (error) throw error;
      setProfile({ ...profile, ...editData });
      setIsEditing(false);
      toast.success("Targets updated successfully!");
    } catch (e) {
      toast.error("Failed to update targets");
    }
  };

  if (isLoading) return <div className="p-20 text-center text-slate-400">Loading your spiritual hub...</div>;

  return (
    <div className="p-4 md:p-10 space-y-10">
      {/* Hero Section */}
      <section className="bg-white rounded-[3rem] p-8 md:p-12 shadow-2xl shadow-indigo-100 border border-slate-50 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50/50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

        <div className="flex flex-col items-center relative z-10">
          <div className="w-48 h-48 mb-8">
            <AvatarTier tier={currentTier} />
          </div>

          <div className="text-center mb-8">
            <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 mb-2 tracking-tight">
              {TIER_NAMES[currentTier]}
            </h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
              Your Current Level Status
            </p>
            <div className="flex items-center justify-center gap-2">
              <div className={profile?.streak_count > 7 ? 'text-orange-500' : 'text-slate-300'}>
                <Flame size={24} fill="currentColor" />
              </div>
              <span className="text-xl font-black text-slate-800">{profile?.streak_count || 0} Day Streak</span>
            </div>
          </div>

          <div className="w-full max-w-2xl">
            <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
              <span>{TIER_NAMES[1]}</span>
              <span>{TIER_NAMES[6]}</span>
            </div>
            <div className="h-4 bg-slate-100 rounded-full relative mb-4">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, ((profile?.total_points || 0) / 1000) * 100)}%` }}
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full relative shadow-lg shadow-indigo-200"
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-6 h-6 bg-white border-4 border-indigo-600 rounded-full shadow-xl" />
              </motion.div>
              {[100, 300, 500, 750].map(t => (
                <div key={t} className="absolute top-0 w-1 h-full bg-white/50" style={{ left: `${(t / 1000) * 100}%` }} />
              ))}
            </div>
            {nextTierInfo && (
              <p className="text-center text-sm font-bold text-indigo-600">
                ✨ {nextTierInfo.points} more points to reach {TIER_NAMES[nextTierInfo.tier]} level
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Stats Grid */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm text-center">
          <Trophy className="mx-auto mb-3 text-amber-500" size={32} />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Points</p>
          <p className="text-4xl font-black text-slate-900">{profile?.total_points?.toLocaleString() || 0}</p>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm text-center relative group">
          {/* Info Button with Hover Tooltip */}
          <div className="absolute top-6 right-6 text-slate-300 hover:text-indigo-500 cursor-pointer transition-colors">
            <Info size={16} />
            <div className="absolute bottom-full right-0 mb-2 w-64 p-3.5 bg-slate-900/95 backdrop-blur-sm text-white text-[11px] font-medium leading-relaxed rounded-2xl shadow-2xl opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 pointer-events-none origin-bottom-right z-30 text-left border border-slate-800">
              <strong className="block text-indigo-400 font-bold mb-1">Goal-Based Consistency 🎯</strong>
              This streak is not about how much consistent you are filling the dates; it is all about how much consistently you are achieving your goals. This is the streak out of your goals, not because of the dates you filled consistently.
            </div>
          </div>
          <Zap className="mx-auto mb-3 text-indigo-500" size={32} />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Best Streak</p>
          <p className="text-4xl font-black text-slate-900">{profile?.best_streak || 0}</p>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm text-center relative group">
          {/* Info Button with Hover Tooltip */}
          <div className="absolute top-6 right-6 text-slate-300 hover:text-emerald-500 cursor-pointer transition-colors">
            <Info size={16} />
            <div className="absolute bottom-full right-0 mb-2 w-64 p-3.5 bg-slate-900/95 backdrop-blur-sm text-white text-[11px] font-medium leading-relaxed rounded-2xl shadow-2xl opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 pointer-events-none origin-bottom-right z-30 text-left border border-slate-800">
              <strong className="block text-emerald-400 font-bold mb-1">Automatic Protection 🛡️</strong>
              Streak Shields automatically save your streak if you miss exactly 1 day. If you miss 2 or more days consecutively, the shield cannot save your streak and is not consumed.
            </div>
          </div>
          <Shield className="mx-auto mb-3 text-emerald-500" size={32} />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Streak Shields</p>
          <p className="text-4xl font-black text-slate-900">{profile?.freeze_credits || 0}</p>
        </div>
        <div className="bg-indigo-600 p-8 rounded-[2.5rem] text-white text-center shadow-xl shadow-indigo-100">
          <BookOpen className="mx-auto mb-3 opacity-60" size={32} />
          <p className="text-[10px] font-black opacity-60 uppercase tracking-widest mb-1">Challenge Day</p>
          <p className="text-4xl font-black">{challengeProgress.day} <span className="text-sm opacity-60">/ {challengeProgress.total}</span></p>
          <p className="text-[10px] font-bold mt-2 opacity-80">{challengeProgress.logs} logs submitted</p>
        </div>
      </section>

      {/* Commitments & Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <section className="lg:col-span-2 bg-white rounded-[2.5rem] p-8 border border-slate-100">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-black text-slate-800">My Commitments</h3>
            <button
              onClick={() => isEditing ? handleUpdateTargets() : setIsEditing(true)}
              className={`p-3 rounded-2xl transition-all ${isEditing ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {isEditing ? <Check size={20} /> : <Edit3 size={20} />}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { label: 'Chanting', key: 'target_chanting', icon: '📿', unit: 'Rounds', color: 'bg-orange-50 text-orange-600' },
              { label: 'Reading', key: 'target_reading', icon: '📖', unit: 'Minutes', color: 'bg-teal-50 text-teal-600' },
            ].map(item => (
              <div key={item.key} className={`p-6 rounded-3xl border border-slate-50 ${item.color.split(' ')[0]}`}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">{item.icon}</span>
                  <p className="text-sm font-bold opacity-80">{item.label}</p>
                </div>
                {isEditing ? (
                  <input
                    type="number"
                    value={(editData as any)[item.key]}
                    onChange={(e) => {
                      const newVal = parseInt(e.target.value) || 0;
                      const originalVal = (profile as any)?.[item.key] || 0;
                      if (newVal < originalVal) {
                        toast.error(`Spiritual commitments can only be increased to reach higher heights, not decreased! 🚀`, {
                          id: `decrease-prevent-${item.key}`
                        });
                        return;
                      }
                      setEditData({ ...editData, [item.key]: newVal });
                    }}
                    className="w-full bg-white/50 p-2 rounded-lg font-black text-2xl outline-none border-2 border-indigo-200"
                  />
                ) : (
                  <p className="text-3xl font-black">{(profile as any)?.[item.key] || 0} <span className="text-xs opacity-60 uppercase">{item.unit}</span></p>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-[2.5rem] p-8 border border-slate-100 flex flex-col justify-center">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6 text-center">Points Breakdown</h3>
          <div className="space-y-6">
            {[
              { label: 'Chanting', val: pointsBreakdown.chanting, color: 'bg-orange-500' },
              { label: 'Reading', val: pointsBreakdown.reading, color: 'bg-teal-500' },
            ].map(item => (
              <div key={item.label}>
                <div className="flex justify-between text-sm font-bold mb-2">
                  <span>{item.label}</span>
                  <span>{item.val.toLocaleString()} pts</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(item.val / (profile?.total_points || 1)) * 100}%` }}
                    className={`h-full ${item.color}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Graphs Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section className="bg-white rounded-[2.5rem] p-8 border border-slate-100">
          <h3 className="text-xl font-black text-slate-800 mb-8 flex items-center gap-2">
            <Zap className="text-indigo-600" size={20} /> 14-Day Performance
          </h3>
          <div className="h-80 w-full min-h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} />
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
                          {Number(readingVal) > 0 && (
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
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend iconType="circle" />
                <Bar dataKey="Chanting" stackId="a" fill="#f97316" />
                <Bar dataKey="Reading" stackId="a" fill="#14b8a6" />
                <Bar dataKey="Bonus" stackId="a" fill="#6366f1" />
                <Bar dataKey="Quiz" stackId="a" fill="#ec4899" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="bg-white rounded-[2.5rem] p-8 border border-slate-100">
          <h3 className="text-xl font-black text-slate-800 mb-8 flex items-center gap-2">
            <BookOpen className="text-indigo-600" size={20} /> Consistency Heatmap
          </h3>
          <ConsistencyHeatmap
            logs={logs}
            startDate={settings.challenge_start_date}
            targets={{
              chanting: profile?.target_chanting || 0,
              reading: profile?.target_reading || 0,
              hearing: 0
            }}
          />
          <div className="mt-8 flex justify-center gap-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-slate-200 rounded-sm" /> Missed</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-orange-100 rounded-sm" /> 1-49%</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-orange-400 rounded-sm" /> 50-99%</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-amber-400 rounded-sm" /> 100%</div>
          </div>
        </section>
      </div>
    </div>
  );
}
