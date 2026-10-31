'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import { useActiveCompetition } from '@/hooks/useActiveCompetition';
import { DailyLogModal } from '@/components/student/DailyLogModal';
import { UserProfileModal } from '@/components/student/UserProfileModal';
import { Flame, Trophy, Plus, CheckCircle2, ChevronRight, BookOpen } from 'lucide-react';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { toast } from 'react-hot-toast';
import { friendlyError } from '@/lib/errors';
import { formatDMY, formatLong, istToday } from '@/lib/ist';
import {
  buildRulesText, includesChanting, includesReading, statusLabel, typeLabel,
  type AwardView, type Competition, type FeedEvent, type LeaderboardRow,
} from '@/lib/competition';

const FEED_LIMIT = 15;
const FEED_COLUMNS = 'id,competition_id,user_id,kind,full_name,avatar_url,department,gender,detail,delta,streak,visible_from,created_at';

const num = (v: unknown) => (v == null ? 0 : Number(v));
const pts = (v: number) => (Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 1 }));

interface MyState {
  competition_id: string | null;
  loggable_dates?: string[];
  commitment?: number | null;
}

const normalizeRow = (r: any): LeaderboardRow => ({
  ...r,
  rank: num(r.rank),
  total: num(r.total),
  chanting_points: num(r.chanting_points),
  reading_points: num(r.reading_points),
  bonus_points: num(r.bonus_points),
  current_streak: num(r.current_streak),
  best_streak: num(r.best_streak),
});

const rerank = (rows: LeaderboardRow[]): LeaderboardRow[] =>
  [...rows].sort((a, b) => b.total - a.total).map((r, i) => ({ ...r, rank: i + 1 }));

export default function LeaderboardPage() {
  const { user, isAdmin } = useAuthStore();
  const { data: active, loading: activeLoading, refresh: refreshActive } = useActiveCompetition();

  const [list, setList] = useState<Competition[]>([]);
  const [listLoaded, setListLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [stats, setStats] = useState({ participants: 0, active_today: 0 });
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [awards, setAwards] = useState<AwardView[]>([]);
  const [myState, setMyState] = useState<MyState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  const openId = active?.competition?.id ?? null;
  const selected = useMemo(
    () => list.find((c) => c.id === selectedId) ?? (active?.competition?.id === selectedId ? active.competition : null),
    [list, selectedId, active]
  );
  const isFinalized = selected?.stored_status === 'finalized';

  // ---------- competitions list ----------
  const loadList = useCallback(async () => {
    const { data } = await supabase.rpc('list_competitions');
    const visible = ((data as Competition[]) || []).filter((c) => c.status !== 'draft' && c.status !== 'archived');
    setList(visible);
    setListLoaded(true);
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  // default selection: the running competition, else the most recent one
  useEffect(() => {
    if (selectedId || activeLoading || !listLoaded) return;
    setSelectedId(active?.competition?.id ?? active?.last?.id ?? list[0]?.id ?? null);
  }, [selectedId, activeLoading, listLoaded, active, list]);

  // ---------- leaderboard + stats + feed ----------
  const loadBoard = useCallback(async (compId: string, quiet = false) => {
    if (!quiet) setIsLoading(true);
    const [lb, st, feed] = await Promise.all([
      supabase.rpc('get_leaderboard', { p_comp: compId }),
      supabase.rpc('get_competition_stats', { p_comp: compId }),
      supabase.from('activity_feed').select(FEED_COLUMNS).eq('competition_id', compId)
        .order('created_at', { ascending: false }).limit(FEED_LIMIT),
    ]);
    if (selectedIdRef.current !== compId) return; // user switched competition meanwhile
    if (lb.error) toast.error(friendlyError(lb.error));
    setRows(((lb.data as any[]) || []).map(normalizeRow));
    if (st.data) setStats(st.data as any);
    setEvents((feed.data as FeedEvent[]) || []);
    setIsLoading(false);
  }, []);

  const loadAwards = useCallback(async (compId: string) => {
    const { data } = await supabase.rpc('get_awards_view', { p_comp: compId });
    if (selectedIdRef.current === compId) setAwards((data as AwardView[]) || []);
  }, []);

  const loadMyState = useCallback(async () => {
    if (!user || isAdmin) { setMyState(null); return; }
    const { data } = await supabase.rpc('get_my_state');
    setMyState(data as MyState);
  }, [user, isAdmin]);

  useEffect(() => {
    if (!selectedId) { setIsLoading(false); return; }
    setRows([]);
    setEvents([]);
    setAwards([]);
    loadBoard(selectedId);
    if (selected?.stored_status === 'finalized') loadAwards(selectedId);
  }, [selectedId, selected?.stored_status, loadBoard, loadAwards]);

  useEffect(() => { loadMyState(); }, [loadMyState, openId]);

  // keep the Japa counter in sync with the server (it only pre-fills the log form)
  useEffect(() => {
    if (!user || isAdmin) return;
    fetch('/api/sync-chanting', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then((res) => res.json())
      .then(() => {})
      .catch(() => {});
  }, [user, isAdmin, loadBoard, loadMyState]);

  // tick for relative times
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // ---------- live feed: incremental patching ----------
  const applyEvent = useCallback((ev: FeedEvent) => {
    setEvents((prev) => (prev.some((e) => e.id === ev.id) ? prev : [ev, ...prev].slice(0, FEED_LIMIT)));
    if (ev.kind === 'award') return; // no points change
    const d = ev.delta || {};
    if (typeof d.total !== 'number') {
      if (selectedIdRef.current) loadBoard(selectedIdRef.current, true); // delta missing -> one full refetch
      return;
    }
    let missing = false;
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.user_id === ev.user_id);
      if (idx < 0) { missing = true; return prev; }
      const next = [...prev];
      const r = { ...next[idx] };
      r.total = Math.round((r.total + (d.total || 0)) * 100) / 100;
      r.chanting_points = Math.round((r.chanting_points + (d.chanting || 0)) * 100) / 100;
      r.reading_points = Math.round((r.reading_points + (d.reading || 0)) * 100) / 100;
      r.bonus_points = Math.round((r.bonus_points + (d.bonus || 0)) * 100) / 100;
      if (typeof ev.streak === 'number') {
        r.current_streak = ev.streak;
        r.best_streak = Math.max(r.best_streak, ev.streak);
      }
      next[idx] = r;
      return rerank(next);
    });
    if (missing && selectedIdRef.current) setTimeout(() => loadBoard(selectedIdRef.current!, true), 0);
    setStats((s) => ({ ...s })); // participants unchanged; active_today refreshed by the periodic refetch
  }, [loadBoard]);

  useEffect(() => {
    if (!selected || isFinalized) return;
    const compId = selected.id;
    const channel = supabase
      .channel(`activity-feed:${compId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activity_feed', filter: `competition_id=eq.${compId}` },
        (payload) => applyEvent(payload.new as FeedEvent))
      .subscribe();
    // safety net: one full refetch every minute (also refreshes today's reporting count)
    const t = setInterval(() => loadBoard(compId, true), 60000);
    return () => { supabase.removeChannel(channel); clearInterval(t); };
  }, [selected?.id, isFinalized, applyEvent, loadBoard]);

  // ---------- derived ----------
  const currentUserRow = useMemo(() => rows.find((r) => r.user_id === user?.id) ?? null, [rows, user]);
  const showBreakdown = selected?.type === 'both';
  const showBonusChip = !!selected?.bonus_enabled && !showBreakdown;
  const showStreak = !!selected && includesChanting(selected.type);

  const isOpenSelected = !!selected && selected.id === openId;
  const loggable = myState?.competition_id === selected?.id ? myState?.loggable_dates ?? [] : [];
  const canLogChanting = isOpenSelected && !!selected && (includesChanting(selected.type) || includesReading(selected.type)) && !isAdmin;
  const today = istToday();

  const afterLog = () => {
    if (selectedId) loadBoard(selectedId, true);
    loadMyState();
  };

  const relTime = (ts: string) => {
    const mins = Math.floor((now - new Date(ts).getTime()) / 60000);
    if (mins < 1) return 'Just now ⚡';
    if (mins < 60) return `${mins}m ago`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
    return formatDMY(new Date(ts).toLocaleDateString('en-CA'));
  };

  const describe = (ev: FeedEvent): { message: string; detail: string; emoji: string; style: string } => {
    const gain = num(ev.delta?.total);
    const gainText = gain > 0 ? `+${pts(gain)} Points` : '';
    switch (ev.kind) {
      case 'chanting': {
        const dates: string[] = ev.detail?.dates || [];
        return {
          message: ev.detail?.minutes != null
            ? `completed daily Sadhana: chanted ${ev.detail?.rounds ?? 0} rounds and read for ${ev.detail.minutes} min!`
            : `completed daily Sadhana: chanted ${ev.detail?.rounds ?? 0} rounds!`,
          detail: gainText, emoji: '📿', style: 'text-emerald-600 bg-emerald-50 border border-emerald-100/50',
        };
      }
      case 'reading':
        return { message: `logged ${ev.detail?.minutes ?? 0} min of book reading!`, detail: gainText, emoji: '📖', style: 'text-teal-600 bg-teal-50 border border-teal-100/50' };
      case 'quiz_bonus':
        return {
          message: `scored ${ev.detail?.score ?? 0}/${ev.detail?.max ?? 0} on the audiobook quiz "${ev.detail?.title ?? ''}"! 🧠`,
          detail: gainText, emoji: '🧠', style: 'text-amber-600 bg-amber-50 border border-amber-200/50',
        };
      case 'manual_bonus':
        return {
          message: `was awarded bonus points by the Admin: "${ev.detail?.title || 'Exceptional Devotion'}" 🌟`,
          detail: ev.detail?.points != null ? `${Number(ev.detail.points) > 0 ? '+' : ''}${ev.detail.points} Points` : gainText,
          emoji: '🌟', style: 'text-indigo-600 bg-indigo-50 border border-indigo-100/50',
        };
      case 'listen':
        return { message: `completed listening to the audiobook: "${ev.detail?.title ?? ''}"! 🎧`, detail: 'Quiz Unlocked', emoji: '🎧', style: 'text-sky-600 bg-sky-50 border border-sky-100/50' };
      case 'award':
        return { message: `unlocked the ${ev.detail?.award ?? ''} award! 🏅`, detail: 'Award Unlocked', emoji: '🏆', style: 'text-amber-700 bg-amber-50 border border-amber-200/60' };
      default:
        return { message: '', detail: '', emoji: '⚡', style: 'text-slate-600 bg-slate-50 border border-slate-100/50' };
    }
  };

  const loading = activeLoading || !listLoaded;
  const winnerAwards = awards.filter((a) => a.winners.length > 0);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto min-h-screen bg-slate-50/30">
      {/* ---------- No competition at all ---------- */}
      {!loading && !selected && (
        <div className="bg-white rounded-3xl p-10 border border-slate-100 shadow-sm text-center">
          <div className="text-5xl mb-4">🪷</div>
          <h1 className="text-2xl font-black text-slate-900 mb-2">No competition running</h1>
          {active?.next ? (
            <p className="text-sm font-bold text-slate-500">
              Next competition starts on <span className="text-indigo-600">{formatLong(active.next.start_date)}</span>: {active.next.title}
            </p>
          ) : (
            <p className="text-sm font-bold text-slate-500">Check back when the next competition is announced.</p>
          )}
        </div>
      )}

      {/* ---------- Header ---------- */}
      {selected && (
        <div className="bg-white rounded-3xl p-5 md:p-6 border border-slate-100 shadow-sm mb-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            {selected.cover_photo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selected.cover_photo_url} alt="Campaign" className="w-16 h-16 rounded-full object-cover border-2 border-indigo-100 shadow-sm flex-shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight mb-2 break-words whitespace-normal">
                {selected.title}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-full text-xs font-bold tracking-wide">
                  {typeLabel(selected.type)}{selected.bonus_enabled ? ' + Bonus' : ''}
                </span>
                {selected.status === 'active' ? (
                  <span className="px-3 py-0.5 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                    Day {selected.day_number} of {selected.total_days} · {selected.days_left === 0 ? 'last day' : `${selected.days_left} day${selected.days_left > 1 ? 's' : ''} left`}
                  </span>
                ) : (
                  <span className="px-3 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 rounded-full text-xs font-bold">
                    {statusLabel(selected.status)}
                  </span>
                )}
                <span className="text-xs font-semibold text-slate-400">
                  {formatDMY(selected.start_date)} → {formatDMY(selected.end_date)}
                </span>
                <button
                  onClick={() => setIsRulesOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 hover:bg-amber-100/70 border border-amber-100 text-amber-700 rounded-full text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95"
                >
                  📜 Rules & Score Math
                </button>
                <ThemeSwitcher />
              </div>
              {list.length > 1 && (
                <select
                  value={selectedId ?? ''}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="mt-3 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 outline-none cursor-pointer max-w-full"
                  aria-label="Choose competition"
                >
                  {list.map((c) => (
                    <option key={c.id} value={c.id}>{c.title} ({statusLabel(c.status)})</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Quick Stats Banner */}
          <div className="flex flex-wrap md:flex-nowrap gap-3 w-full md:w-auto">
            {showStreak && (
              <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-2xl flex items-center gap-3 flex-1 md:flex-initial min-w-[120px] transition-all hover:shadow-sm">
                <div className="w-9 h-9 bg-orange-100/70 rounded-xl flex items-center justify-center text-orange-600 shadow-sm">
                  <Flame size={18} fill="currentColor" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-1">Streak</p>
                  <p className="text-base font-black text-slate-800">{currentUserRow?.current_streak || 0} Days</p>
                </div>
              </div>
            )}
            <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-2xl flex items-center gap-3 flex-1 md:flex-initial min-w-[120px] transition-all hover:shadow-sm">
              <div className="w-9 h-9 bg-indigo-100/70 rounded-xl flex items-center justify-center text-indigo-600 shadow-sm">
                <Trophy size={18} fill="currentColor" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-1">Points</p>
                <p className="text-base font-black text-slate-800">{pts(currentUserRow?.total || 0)}</p>
              </div>
            </div>

            {canLogChanting && (
              loggable.length > 0 ? (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setIsLogModalOpen(true)}
                  className="bg-orange-500 hover:bg-orange-600 text-white p-3.5 rounded-2xl flex items-center justify-center gap-2 flex-1 md:flex-initial min-w-[130px] shadow-md shadow-orange-500/10 border border-orange-400/20 transition-all font-bold text-xs md:text-sm cursor-pointer whitespace-nowrap"
                >
                  <Plus size={16} />
                  <span>{loggable.includes(today) ? 'Log Activity' : 'Log Past Days ⚠️'}</span>
                </motion.button>
              ) : (
                <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 p-3.5 rounded-2xl flex items-center justify-center gap-1.5 flex-1 md:flex-initial min-w-[130px] font-bold text-[10px] md:text-xs tracking-tight text-center leading-tight">
                  <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                  <span>All Logs Filled ✓</span>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* ---------- State banners ---------- */}
      {selected && !isOpenSelected && !isFinalized && selected.status === 'scheduled' && (
        <div className="mb-6 bg-indigo-50 border border-indigo-100 text-indigo-800 rounded-2xl p-4 text-sm font-bold">
          This competition starts on {formatLong(selected.start_date)}.
        </div>
      )}
      {selected && !isFinalized && selected.status === 'ended' && (
        <div className="mb-6 bg-amber-50 border border-amber-100 text-amber-800 rounded-2xl p-4 text-sm font-bold">
          This competition has ended. Final results and awards are confirmed by the HOD.
          {active?.next && <> Next competition starts on {formatLong(active.next.start_date)}.</>}
        </div>
      )}
      {selected && !openId && selected.status === 'ended' && !active?.next && (
        <div className="mb-6 text-xs font-bold text-slate-400">No competition is running right now.</div>
      )}
      {isFinalized && (
        <div className="mb-6 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-2xl p-4 text-sm font-bold">
          🏁 Final standings{selected?.finalized_at ? ` · finalized ${formatLong(selected.finalized_at.slice(0, 10))}` : ''}.
          {' '}<Link href="/awards" className="underline">See awards</Link>
        </div>
      )}

      {selected && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Leaderboard List */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-3">
            {!isFinalized && (
              <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-500/10 text-amber-700 rounded-xl flex items-center justify-center font-black text-base shadow-2xs">📊</div>
                  <div>
                    <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest leading-none mb-1">Today&apos;s Reporting</p>
                    <p className="text-xs md:text-sm font-bold text-slate-700 leading-tight">
                      {stats.active_today === 0 ? (
                        <span>Be the first to report today! 🎯</span>
                      ) : (
                        <span><span className="font-extrabold text-emerald-600">{stats.active_today}</span> out of <span className="font-extrabold text-amber-900">{stats.participants}</span> participants reported today</span>
                      )}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full bg-white/80 border border-amber-200 text-amber-800 shadow-2xs whitespace-nowrap">
                  {stats.participants} Participants
                </span>
              </div>
            )}

            {winnerAwards.length > 0 && (
              <div className="bg-white border border-amber-100 rounded-2xl p-4 shadow-xs">
                <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-3">🏅 Winners</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {winnerAwards.map((a) => (
                    <div key={a.id} className="bg-amber-50/50 border border-amber-100/70 rounded-xl p-2.5">
                      <p className="text-[11px] font-black text-slate-800">{a.name}</p>
                      <p className="text-[11px] font-bold text-slate-500">{a.winners.map((w) => w.full_name).join(', ')}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="text-lg">🏆</span>
              <h2 className="text-lg font-black text-slate-800 tracking-tight">{isFinalized ? 'Final Standings' : 'Leaderboard Standings'}</h2>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {Array(8).fill(0).map((_, i) => (
                  <div key={i} className="h-16 bg-white rounded-2xl border border-slate-100 animate-pulse" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="py-12 text-center bg-white rounded-2xl border border-dashed border-slate-200 text-slate-400 text-sm font-semibold">
                No participants yet.
              </div>
            ) : (
              <div className="space-y-2">
                <AnimatePresence mode="popLayout">
                  {rows.map((u) => {
                    const rank = u.rank;
                    const isCurrentUser = u.user_id === user?.id;
                    const isTop3 = rank <= 3 && u.total > 0;

                    const cardStyle = rank === 1
                      ? 'bg-gradient-to-r from-amber-50/40 via-white to-amber-50/20 border-amber-300 shadow-sm shadow-amber-50/50'
                      : rank === 2
                        ? 'bg-gradient-to-r from-slate-50/50 via-white to-slate-50/30 border-slate-300 shadow-sm'
                        : rank === 3
                          ? 'bg-gradient-to-r from-orange-50/20 via-white to-orange-50/10 border-orange-300 shadow-sm'
                          : 'bg-white border-slate-100';

                    return (
                      <motion.div
                        layout
                        key={u.user_id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        onClick={() => setSelectedUserId(u.user_id)}
                        className={`group relative p-3 md:p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer hover:shadow-md hover:-translate-y-0.5 ${cardStyle} ${isCurrentUser ? 'ring-2 ring-indigo-500/40 ring-offset-1 z-10' : ''}`}
                      >
                        <div className="flex items-center gap-3.5">
                          <div className={`flex items-center justify-center w-8 h-8 rounded-xl font-black text-xs md:text-sm flex-shrink-0 ${
                            rank === 1 ? 'bg-amber-100 text-amber-800'
                              : rank === 2 ? 'bg-slate-200/80 text-slate-800'
                                : rank === 3 ? 'bg-orange-100 text-orange-800'
                                  : 'bg-slate-50 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors'}`}>
                            {rank === 1 && u.total > 0 ? '👑' : `#${rank}`}
                          </div>

                          <div className={`relative w-10 h-10 rounded-full flex items-center justify-center border bg-slate-50 overflow-hidden shadow-inner flex-shrink-0 ${
                            rank === 1 ? 'border-amber-400' : rank === 2 ? 'border-slate-300' : rank === 3 ? 'border-orange-400' : 'border-slate-200/60'}`}>
                            {u.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={u.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                            ) : (
                              <div className="w-full h-full rounded-full bg-slate-50 flex items-center justify-center font-bold text-slate-400 text-sm">{u.full_name?.[0]}</div>
                            )}
                            {isTop3 && (
                              <div className={`absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center shadow-sm border text-[9px] bg-white ${rank === 1 ? 'text-amber-500 border-amber-200' : rank === 2 ? 'text-slate-400 border-slate-200' : 'text-orange-600 border-orange-200'}`}>
                                <Trophy size={9} fill="currentColor" />
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-slate-800 truncate text-sm md:text-base flex items-center gap-1.5 leading-tight">
                              {u.full_name}
                              {isCurrentUser && (
                                <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-full uppercase tracking-wider leading-none">You</span>
                              )}
                            </h3>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate leading-none">{u.department}</p>
                              {showStreak && u.current_streak > 0 && !isFinalized && (
                                <span className="flex items-center gap-0.5 text-[9px] font-bold text-orange-500 bg-orange-50/80 border border-orange-100/10 px-1.5 py-0.5 rounded-full leading-none">
                                  <Flame size={9} fill="currentColor" /> {u.current_streak}
                                </span>
                              )}
                              {/* compact breakdown on phones */}
                              {showBreakdown && (
                                <span className="md:hidden text-[9px] font-bold text-slate-400 leading-none">
                                  📿 {pts(u.chanting_points)} · 📖 {pts(u.reading_points)} · 🌟 {pts(u.bonus_points)}
                                </span>
                              )}
                              {showBonusChip && u.bonus_points !== 0 && (
                                <span className="text-[9px] font-bold text-indigo-500 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-full leading-none">
                                  🌟 {pts(u.bonus_points)}
                                </span>
                              )}
                            </div>
                          </div>

                          {showBreakdown && (
                            <div className="hidden md:flex items-center gap-4 text-center">
                              {[['Chanting', u.chanting_points], ['Reading', u.reading_points], ['Bonus', u.bonus_points]].map(([label, v]) => (
                                <div key={label as string}>
                                  <p className="text-xs font-black text-slate-600 leading-none">{pts(v as number)}</p>
                                  <p className="text-[8px] font-bold text-slate-300 uppercase tracking-wider mt-0.5 leading-none">{label}</p>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="text-right flex items-center gap-2.5">
                            <div>
                              <p className="text-base font-black text-slate-900 group-hover:text-indigo-600 tracking-tight leading-none transition-colors">{pts(u.total)}</p>
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5 leading-none">Points</p>
                            </div>
                            <ChevronRight size={14} className="text-slate-300 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200 flex-shrink-0" />
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Right Column: Live Community Feed Sidebar */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-4 pb-32">
            <div className="flex items-center justify-between px-1 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">⚡</span>
                <h2 className="text-lg font-black text-slate-800 tracking-tight">Live Activity Feed</h2>
              </div>
              {!isFinalized && (
                <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Live</span>
                </div>
              )}
            </div>

            <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4">
              <div className="space-y-3.5 max-h-[520px] overflow-y-auto pr-1">
                {events.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-sm font-semibold">
                    No community activity yet. Be the first! 🙌
                  </div>
                ) : (
                  events.map((ev) => {
                    const d = describe(ev);
                    return (
                      <div key={ev.id} className="flex gap-3 items-start p-2.5 rounded-2xl border border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <div className="relative flex-shrink-0 w-9 h-9 rounded-full border border-slate-100 overflow-hidden bg-slate-50 shadow-inner">
                          {ev.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={ev.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center font-bold text-slate-400 text-[10px] uppercase leading-none">{ev.full_name?.[0]}</div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-800 text-xs md:text-sm leading-none">{ev.full_name}</span>
                            {ev.department && (
                              <span className="text-[8px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded leading-none uppercase tracking-wide">{ev.department}</span>
                            )}
                          </div>
                          <p className="text-slate-500 text-[11px] mt-1.5 leading-snug">{d.message}</p>
                          <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                            {d.detail && (
                              <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider ${d.style} leading-none`}>
                                <span>{d.emoji}</span>
                                <span>{d.detail}</span>
                              </div>
                            )}
                            <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest ml-auto">{relTime(ev.created_at)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Modals ---------- */}
      <DailyLogModal
        isOpen={isLogModalOpen}
        onClose={() => setIsLogModalOpen(false)}
        onSuccess={() => { afterLog(); refreshActive(); }}
      />

      <AnimatePresence>
        {selectedUserId && selected && (
          <UserProfileModal
            userId={selectedUserId}
            competitionId={selected.id}
            competitionType={selected.type}
            endDate={selected.end_date}
            onClose={() => setSelectedUserId(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isRulesOpen && selected && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsRulesOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-lg bg-white rounded-[2.5rem] p-6 md:p-8 border border-slate-100 shadow-2xl z-10 overflow-hidden text-left"
            >
              <div className="absolute -top-12 -left-12 w-32 h-32 bg-amber-400/10 rounded-full blur-2xl" />
              <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl" />

              <div className="flex items-center justify-between mb-6 relative z-10">
                <h2 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                  <span className="text-2xl">📜</span> Rules & Score Math
                </h2>
                <button
                  onClick={() => setIsRulesOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center font-black text-slate-400 hover:text-slate-600 transition-colors border border-slate-100 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 relative z-10 scrollbar-thin">
                <p className="text-xs font-black text-indigo-700 uppercase tracking-wider">{selected.title} · {typeLabel(selected.type)}</p>
                {buildRulesText(selected).map((section) => (
                  <div key={section.heading} className="bg-gradient-to-br from-indigo-50/50 to-indigo-100/10 p-4 rounded-2xl border border-indigo-100/50">
                    <h3 className="text-xs font-black text-indigo-700 uppercase tracking-wider mb-2">{section.heading}</h3>
                    <ul className="space-y-2 text-xs text-slate-600 font-bold leading-relaxed">
                      {section.items.map((item, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-orange-500 font-black mt-0.5">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex justify-end relative z-10">
                <button
                  onClick={() => setIsRulesOpen(false)}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md shadow-indigo-100 transition-all cursor-pointer"
                >
                  Got It!
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
