'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import { useActiveCompetition } from '@/hooks/useActiveCompetition';
import { AvatarTier } from '@/components/student/AvatarTiers';
import { ConsistencyHeatmap } from '@/components/student/ConsistencyHeatmap';
import { AwardIcon } from '@/components/student/AwardIcons';
import { Flame, Trophy, Shield, Zap, BookOpen, Edit3, Check, Info, Award, Lock } from 'lucide-react';
import { BarChart, Bar, XAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { toast } from 'react-hot-toast';
import { friendlyError } from '@/lib/errors';
import { addDays, formatLong, istToday } from '@/lib/ist';
import { includesChanting, includesReading, statusLabel, typeLabel, type Competition } from '@/lib/competition';

const TIER_NAMES: Record<number, string> = {
  1: 'Noob',
  2: 'Survivor',
  3: 'Hustler',
  4: 'Champion',
  5: 'Legend',
  6: 'Superhuman',
};

interface Totals {
  total: number;
  chanting_points: number;
  reading_points: number;
  bonus_points: number;
  current_streak: number;
  best_streak: number;
  shields_left: number;
}
interface PublicProfile {
  totals: Totals | null;
  days: { date: string; chanting: number | null; reading: number | null; bonus: number | null }[];
}
interface AwardHistoryItem {
  id: string;
  award_name: string;
  description: string | null;
  icon_key: string | null;
  image_url: string | null;
  competition_title: string;
  unlock_date: string;
  unlocked: boolean;
  custom_message: string | null;
  rank: number | null;
}

const n = (v: unknown) => (v == null ? 0 : Number(v));

export default function ProfilePage() {
  const { user } = useAuthStore();
  const { data: active, loading: activeLoading } = useActiveCompetition();

  const [lifetimePoints, setLifetimePoints] = useState(0);
  const [list, setList] = useState<Competition[]>([]);
  const [listLoaded, setListLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [commitment, setCommitment] = useState<number | null>(null);
  const [awards, setAwards] = useState<AwardHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(0);
  const [readingCommitment, setReadingCommitment] = useState<number | null>(null);
  const [editMinutes, setEditMinutes] = useState(0);

  const openId = active?.competition?.id ?? null;
  const selected = list.find((c) => c.id === selectedId) ?? null;
  const isOpenSelected = !!selected && selected.id === openId;

  // lifetime total (for the level / tier) + award history across all competitions
  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: u }, { data: a }, { data: comps }] = await Promise.all([
        supabase.from('users').select('total_points').eq('id', user.id).maybeSingle(),
        supabase.rpc('get_my_awards'),
        supabase.rpc('list_competitions'),
      ]);
      setLifetimePoints(u?.total_points || 0);
      setAwards((a as AwardHistoryItem[]) || []);
      setList(((comps as Competition[]) || []).filter((c) => c.status !== 'draft' && c.status !== 'archived'));
      setListLoaded(true);
    })();
  }, [user]);

  useEffect(() => {
    if (selectedId || activeLoading || !listLoaded) return;
    setSelectedId(active?.competition?.id ?? active?.last?.id ?? list[0]?.id ?? null);
    if (!active?.competition && !active?.last && list.length === 0) setIsLoading(false);
  }, [selectedId, activeLoading, listLoaded, active, list]);

  const loadCompetition = useCallback(async (compId: string, isOpen: boolean) => {
    if (!user) return;
    setIsLoading(true);
    const [{ data: prof }, st] = await Promise.all([
      supabase.rpc('get_public_profile', { p_user: user.id, p_comp: compId }),
      isOpen ? supabase.rpc('get_my_state') : Promise.resolve({ data: null }),
    ]);
    setProfile((prof as PublicProfile) || null);
    const commit = (st.data as any)?.commitment ?? null;
    setCommitment(commit);
    setEditValue(commit ?? 0);
    const rc = (st.data as any)?.reading_commitment ?? null;
    setReadingCommitment(rc);
    setEditMinutes(rc ?? 0);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    if (selectedId) loadCompetition(selectedId, selectedId === openId);
  }, [selectedId, openId, loadCompetition]);

  const totals = profile?.totals ?? null;

  const dayPoints = useMemo(() => {
    const out: Record<string, number> = {};
    (profile?.days || []).forEach((d) => { out[d.date] = n(d.chanting) + n(d.reading) + n(d.bonus); });
    return out;
  }, [profile]);

  // last 14 days of the competition window, from the ledger (server-calculated points)
  const chartData = useMemo(() => {
    if (!selected) return [];
    const today = istToday();
    const last = selected.end_date < today ? selected.end_date : today;
    const byDay: Record<string, { c: number; r: number; b: number }> = {};
    (profile?.days || []).forEach((d) => { byDay[d.date] = { c: n(d.chanting), r: n(d.reading), b: n(d.bonus) }; });
    const rows = [];
    for (let i = 13; i >= 0; i--) {
      const date = addDays(last, -i);
      if (date < selected.start_date) continue;
      const v = byDay[date] || { c: 0, r: 0, b: 0 };
      rows.push({
        date: new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
        Chanting: Math.round(v.c), Reading: Math.round(v.r), Bonus: Math.round(v.b),
      });
    }
    return rows;
  }, [profile, selected]);

  const currentTier = useMemo(() => {
    const pts = lifetimePoints;
    if (pts >= 1000) return 6;
    if (pts >= 750) return 5;
    if (pts >= 500) return 4;
    if (pts >= 300) return 3;
    if (pts >= 100) return 2;
    return 1;
  }, [lifetimePoints]);

  const nextTierInfo = useMemo(() => {
    const thresholds = [100, 300, 500, 750, 1000];
    const next = thresholds.find((t) => t > lifetimePoints);
    if (!next) return null;
    return { points: next - lifetimePoints, tier: thresholds.indexOf(next) + 2 };
  }, [lifetimePoints]);

  // commitments can only be raised: chanting 1-16 rounds, reading 1-60 minutes (the database enforces the same)
  const handleRaiseCommitment = async () => {
    if (!isEditing) { setIsEditing(true); return; }
    const wantR = selected && includesChanting(selected.type) && commitment != null;
    const wantM = selected && includesReading(selected.type) && readingCommitment != null;
    if (wantR && (editValue < (commitment || 0) || editValue > 16)) {
      toast.error(editValue > 16 ? 'Chanting commitment can be at most 16 rounds.' : 'Commitments can only be increased, not decreased! 🚀');
      return;
    }
    if (wantM && (editMinutes < (readingCommitment || 0) || editMinutes > 60)) {
      toast.error(editMinutes > 60 ? 'Reading commitment can be at most 60 minutes.' : 'Commitments can only be increased, not decreased! 🚀');
      return;
    }
    const { error } = await supabase.rpc('set_commitment', { p_rounds: wantR ? editValue : null, p_minutes: wantM ? editMinutes : null });
    if (error) { toast.error(friendlyError(error)); return; }
    if (wantR) setCommitment(editValue);
    if (wantM) setReadingCommitment(editMinutes);
    setIsEditing(false);
    toast.success('Commitment updated!');
  };

  if (activeLoading || !listLoaded || (isLoading && selectedId)) {
    return <div className="p-20 text-center text-slate-400">Loading your spiritual hub...</div>;
  }

  const breakdown = [
    { label: 'Chanting', val: n(totals?.chanting_points), color: 'bg-orange-500', show: !selected || selected.type !== 'reading' },
    { label: 'Reading', val: n(totals?.reading_points), color: 'bg-teal-500', show: !selected || selected.type !== 'chanting' },
    { label: 'Bonus', val: n(totals?.bonus_points), color: 'bg-indigo-500', show: !!selected?.bonus_enabled || n(totals?.bonus_points) !== 0 },
  ].filter((b) => b.show);
  const totalPts = n(totals?.total);

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
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Your Current Level Status</p>
            <div className="flex items-center justify-center gap-2">
              <div className={n(totals?.current_streak) > 7 ? 'text-orange-500' : 'text-slate-300'}>
                <Flame size={24} fill="currentColor" />
              </div>
              <span className="text-xl font-black text-slate-800">{n(totals?.current_streak)} Day Streak</span>
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
                animate={{ width: `${Math.min(100, (lifetimePoints / 1000) * 100)}%` }}
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full relative shadow-lg shadow-indigo-200"
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-6 h-6 bg-white border-4 border-indigo-600 rounded-full shadow-xl" />
              </motion.div>
              {[100, 300, 500, 750].map((t) => (
                <div key={t} className="absolute top-0 w-1 h-full bg-white/50" style={{ left: `${(t / 1000) * 100}%` }} />
              ))}
            </div>
            {nextTierInfo && (
              <p className="text-center text-sm font-bold text-indigo-600">
                ✨ {nextTierInfo.points} more points to reach {TIER_NAMES[nextTierInfo.tier]} level
              </p>
            )}
            <p className="text-center text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-2">
              Level uses your lifetime points across all competitions ({lifetimePoints.toLocaleString()})
            </p>
          </div>
        </div>
      </section>

      {/* Competition selector */}
      {list.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Competition</span>
          <select
            value={selectedId ?? ''}
            onChange={(e) => { setSelectedId(e.target.value); setIsEditing(false); }}
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-700 outline-none cursor-pointer max-w-full"
          >
            {list.map((c) => (
              <option key={c.id} value={c.id}>{c.title} ({statusLabel(c.status)})</option>
            ))}
          </select>
          {selected && (
            <span className="text-xs font-bold text-slate-400">
              {typeLabel(selected.type)} · {formatLong(selected.start_date)} – {formatLong(selected.end_date)}
            </span>
          )}
        </div>
      )}

      {!selected ? (
        <div className="bg-white rounded-3xl p-10 border border-slate-100 text-center text-slate-500 font-bold">
          No competition yet. Your stats will appear here once you take part.
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm text-center">
              <Trophy className="mx-auto mb-3 text-amber-500" size={32} />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Competition Points</p>
              <p className="text-4xl font-black text-slate-900">{Math.round(totalPts).toLocaleString()}</p>
            </div>
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm text-center relative group">
              <div className="absolute top-6 right-6 text-slate-300 hover:text-indigo-500 cursor-pointer transition-colors">
                <Info size={16} />
                <div className="absolute bottom-full right-0 mb-2 w-64 p-3.5 bg-slate-900/95 backdrop-blur-sm text-white text-[11px] font-medium leading-relaxed rounded-2xl shadow-2xl opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 pointer-events-none origin-bottom-right z-30 text-left border border-slate-800">
                  <strong className="block text-indigo-400 font-bold mb-1">Consistency 🎯</strong>
                  Your streak counts consecutive days with activity in this competition.
                </div>
              </div>
              <Zap className="mx-auto mb-3 text-indigo-500" size={32} />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Best Streak</p>
              <p className="text-4xl font-black text-slate-900">{n(totals?.best_streak)}</p>
            </div>
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm text-center relative group">
              <div className="absolute top-6 right-6 text-slate-300 hover:text-emerald-500 cursor-pointer transition-colors">
                <Info size={16} />
                <div className="absolute bottom-full right-0 mb-2 w-64 p-3.5 bg-slate-900/95 backdrop-blur-sm text-white text-[11px] font-medium leading-relaxed rounded-2xl shadow-2xl opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 pointer-events-none origin-bottom-right z-30 text-left border border-slate-800">
                  <strong className="block text-emerald-400 font-bold mb-1">Automatic Protection 🛡️</strong>
                  A streak shield automatically saves your streak if you miss exactly one day.
                </div>
              </div>
              <Shield className="mx-auto mb-3 text-emerald-500" size={32} />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Streak Shields</p>
              <p className="text-4xl font-black text-slate-900">{totals ? n(totals.shields_left) : selected.config.shield_count}</p>
            </div>
            <div className="bg-indigo-600 p-8 rounded-[2.5rem] text-white text-center shadow-xl shadow-indigo-100">
              <BookOpen className="mx-auto mb-3 opacity-60" size={32} />
              <p className="text-[10px] font-black opacity-60 uppercase tracking-widest mb-1">Competition Day</p>
              <p className="text-4xl font-black">{selected.day_number} <span className="text-sm opacity-60">/ {selected.total_days}</span></p>
              <p className="text-[10px] font-bold mt-2 opacity-80">{Object.keys(dayPoints).length} active days</p>
            </div>
          </section>

          {/* Commitment & Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {(includesChanting(selected.type) || includesReading(selected.type)) && (
              <section className="lg:col-span-2 bg-white rounded-[2.5rem] p-8 border border-slate-100">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-xl font-black text-slate-800">My Commitment</h3>
                  {isOpenSelected && (commitment != null || readingCommitment != null) && (
                    <button
                      onClick={handleRaiseCommitment}
                      className={`p-3 rounded-2xl transition-all cursor-pointer ${isEditing ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                      title={isEditing ? 'Save' : 'Raise commitment'}
                    >
                      {isEditing ? <Check size={20} /> : <Edit3 size={20} />}
                    </button>
                  )}
                </div>
                <div className={`grid gap-4 ${includesChanting(selected.type) && includesReading(selected.type) ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
                  {includesChanting(selected.type) && (
                    <div className="p-6 rounded-3xl border border-slate-50 bg-orange-50 text-orange-600">
                      <div className="flex items-center gap-3 mb-4">
                        <span className="text-2xl">📿</span>
                        <p className="text-sm font-bold opacity-80">Daily chanting</p>
                      </div>
                      {isEditing && commitment != null ? (
                        <input type="number" min={commitment || 1} max={16} value={editValue}
                          onChange={(e) => setEditValue(Math.min(16, parseInt(e.target.value) || 0))}
                          className="w-full bg-white/50 p-2 rounded-lg font-black text-2xl outline-none border-2 border-indigo-200" />
                      ) : (
                        <p className="text-3xl font-black">{commitment ?? '—'} <span className="text-xs opacity-60 uppercase">Rounds</span></p>
                      )}
                      <p className="text-[11px] font-bold opacity-70 mt-3">
                        {commitment == null
                          ? isOpenSelected ? 'You must set this (1 to 16 rounds) before your first log.' : 'Commitment is set per competition.'
                          : 'Maximum 16 rounds. It can only be raised, never lowered.'}
                      </p>
                    </div>
                  )}
                  {includesReading(selected.type) && (
                    <div className="p-6 rounded-3xl border border-slate-50 bg-teal-50 text-teal-700">
                      <div className="flex items-center gap-3 mb-4">
                        <span className="text-2xl">📖</span>
                        <p className="text-sm font-bold opacity-80">Daily reading</p>
                      </div>
                      {isEditing && readingCommitment != null ? (
                        <input type="number" min={readingCommitment || 1} max={60} value={editMinutes}
                          onChange={(e) => setEditMinutes(Math.min(60, parseInt(e.target.value) || 0))}
                          className="w-full bg-white/50 p-2 rounded-lg font-black text-2xl outline-none border-2 border-teal-200" />
                      ) : (
                        <p className="text-3xl font-black">{readingCommitment ?? '—'} <span className="text-xs opacity-60 uppercase">Minutes</span></p>
                      )}
                      <p className="text-[11px] font-bold opacity-70 mt-3">
                        {readingCommitment == null
                          ? isOpenSelected ? 'You must set this (1 to 60 minutes) before you start reading.' : 'Commitment is set per competition.'
                          : 'Maximum 60 minutes. It can only be raised, never lowered.'}
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}

            <section className={`bg-white rounded-[2.5rem] p-8 border border-slate-100 flex flex-col justify-center ${(includesChanting(selected.type) || includesReading(selected.type)) ? '' : 'lg:col-span-3'}`}>
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6 text-center">Points Breakdown</h3>
              <div className="space-y-6">
                {breakdown.map((item) => (
                  <div key={item.label}>
                    <div className="flex justify-between text-sm font-bold mb-2">
                      <span>{item.label}</span>
                      <span>{Math.round(item.val).toLocaleString()} pts</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${totalPts > 0 ? Math.max(0, Math.min(100, (item.val / totalPts) * 100)) : 0}%` }}
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
                <Zap className="text-indigo-600" size={20} /> Recent Performance
              </h3>
              <div className="h-80 w-full min-h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} />
                    <Tooltip cursor={{ fill: '#f8fafc' }} />
                    <Legend iconType="circle" />
                    {includesChanting(selected.type) && <Bar dataKey="Chanting" stackId="a" fill="#f97316" />}
                    {includesReading(selected.type) && <Bar dataKey="Reading" stackId="a" fill="#14b8a6" />}
                    <Bar dataKey="Bonus" stackId="a" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="bg-white rounded-[2.5rem] p-8 border border-slate-100">
              <h3 className="text-xl font-black text-slate-800 mb-8 flex items-center gap-2">
                <BookOpen className="text-indigo-600" size={20} /> Consistency Heatmap
              </h3>
              <ConsistencyHeatmap startDate={selected.start_date} endDate={selected.end_date} dayPoints={dayPoints} />
              <div className="mt-8 flex justify-center gap-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-slate-200 rounded-sm" /> Missed</div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-orange-100 rounded-sm" /> Light</div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-orange-400 rounded-sm" /> Good</div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-amber-400 rounded-sm" /> Best</div>
              </div>
            </section>
          </div>
        </>
      )}

      {/* Award History (all competitions) */}
      <section className="bg-white rounded-[2.5rem] p-8 border border-slate-100">
        <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
          <Award className="text-amber-500" size={22} /> Award History
        </h3>
        {awards.length === 0 ? (
          <p className="text-sm font-bold text-slate-400">No awards yet. Keep going — your name could be here! 🌟</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {awards.map((a) => (
              <div key={a.id} className={`flex items-center gap-4 p-4 rounded-3xl border ${a.unlocked ? 'bg-amber-50/40 border-amber-100' : 'bg-slate-50 border-slate-100'}`}>
                <div className="w-14 h-14 flex-shrink-0">
                  <AwardIcon iconKey={a.icon_key} imageUrl={a.image_url} />
                </div>
                <div className="min-w-0">
                  <p className="font-black text-slate-800 text-sm truncate">{a.award_name}</p>
                  <p className="text-[11px] font-bold text-indigo-600 truncate">{a.competition_title}</p>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5 flex items-center gap-1">
                    {a.unlocked ? <>Unlocked {formatLong(a.unlock_date)}</> : <><Lock size={10} /> Unlocks {formatLong(a.unlock_date)}</>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
