'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createBrowserClient } from '@supabase/ssr';
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

export default function ProfilePage() {
  const { user } = useAuthStore();
  const [profile, setProfile] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    target_chanting: 0,
    target_reading: 0,
    target_hearing: 0
  });
  const [isLoading, setIsLoading] = useState(true);

  // Initialize the browser client so it can pass authentication cookies safely
  const [supabase] = useState(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ));

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
    return logs.reduce((acc, log) => {
      const chantingPts = log.chanting_rounds * parseInt(settings.points_per_chanting_round || '2');
      const readingPts = log.reading_minutes * parseInt(settings.points_per_reading_minute || '1');
      const hearingPts = log.hearing_minutes * parseInt(settings.points_per_hearing_minute || '1');

      acc.chanting += chantingPts;
      acc.reading += readingPts;
      acc.hearing += hearingPts;
      return acc;
    }, { chanting: 0, reading: 0, hearing: 0 });
  }, [logs, settings]);

  const challengeProgress = useMemo(() => {
    if (!settings.challenge_start_date) return { day: 0, logs: 0 };
    const start = new Date(settings.challenge_start_date);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - start.getTime());
    const day = Math.min(26, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    return { day, logs: logs.length };
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

      last14.push({
        date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        Chanting: log ? log.chanting_rounds * parseInt(settings.points_per_chanting_round || '2') : 0,
        Reading: log ? log.reading_minutes * parseInt(settings.points_per_reading_minute || '1') : 0,
        Hearing: log ? log.hearing_minutes * parseInt(settings.points_per_hearing_minute || '1') : 0,
        isMissing: !log
      });
    }
    return last14;
  }, [logs, settings]);

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
            <h1 className="text-3xl font-black text-slate-900 mb-2">Level {currentTier} Sadhaka</h1>
            <div className="flex items-center justify-center gap-2">
              <div className={profile?.streak_count > 7 ? 'text-orange-500' : 'text-slate-300'}>
                <Flame size={24} fill="currentColor" />
              </div>
              <span className="text-xl font-black text-slate-800">{profile?.streak_count || 0} Day Streak</span>
            </div>
          </div>

          <div className="w-full max-w-2xl">
            <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
              <span>Tier 1</span>
              <span>Tier 6</span>
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
                ✨ {nextTierInfo.points} more points to reach Tier {nextTierInfo.tier}
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
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm text-center">
          <Zap className="mx-auto mb-3 text-indigo-500" size={32} />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Best Streak</p>
          <p className="text-4xl font-black text-slate-900">{profile?.best_streak || 0}</p>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm text-center">
          <Shield className="mx-auto mb-3 text-emerald-500" size={32} />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Streak Shields</p>
          <p className="text-4xl font-black text-slate-900">{profile?.freeze_credits || 0}</p>
        </div>
        <div className="bg-indigo-600 p-8 rounded-[2.5rem] text-white text-center shadow-xl shadow-indigo-100">
          <BookOpen className="mx-auto mb-3 opacity-60" size={32} />
          <p className="text-[10px] font-black opacity-60 uppercase tracking-widest mb-1">Challenge Day</p>
          <p className="text-4xl font-black">{challengeProgress.day} <span className="text-sm opacity-60">/ 26</span></p>
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { label: 'Chanting', key: 'target_chanting', icon: '📿', unit: 'Rounds', color: 'bg-orange-50 text-orange-600' },
              { label: 'Reading', key: 'target_reading', icon: '📖', unit: 'Minutes', color: 'bg-teal-50 text-teal-600' },
              { label: 'Hearing', key: 'target_hearing', icon: '🎧', unit: 'Minutes', color: 'bg-purple-50 text-purple-600' },
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
                    onChange={(e) => setEditData({ ...editData, [item.key]: parseInt(e.target.value) || 0 })}
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
              { label: 'Hearing', val: pointsBreakdown.hearing, color: 'bg-purple-500' },
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
                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                <Legend iconType="circle" />
                <Bar dataKey="Chanting" stackId="a" fill="#f97316" />
                <Bar dataKey="Reading" stackId="a" fill="#14b8a6" />
                <Bar dataKey="Hearing" stackId="a" fill="#a855f7" radius={[4, 4, 0, 0]} />
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
              hearing: profile?.target_hearing || 0
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