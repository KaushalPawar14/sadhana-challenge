'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import {
  Users, ClipboardList, Zap, Trophy, Calendar, Phone, Filter, Search, Sparkles, X, MessageSquare, Check, Copy, ExternalLink,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import { friendlyError } from '@/lib/errors';
import { dateRange, formatLong, istToday } from '@/lib/ist';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { CompetitionSelect, StatusBadge, fetchAll, pickDefaultCompetition, useCompetitions } from './_shared';

interface StudentRow { id: string; full_name: string | null; mobile: string | null; gender: 'M' | 'F' | null; department: string | null }
interface LedgerRow { user_id: string; activity_date: string; source: string; points: number }
interface LogRow { user_id: string; log_date: string; chanting_rounds: number }
interface TotalRow { user_id: string; total: number; current_streak: number }
interface DayDetail { rounds: number | null; points: number }

type StatusFilter = 'ALL' | 'MISSING_TODAY' | 'ANY_MISSED' | 'COMPLETED_ALL' | 'MESSAGED' | 'NOT_MESSAGED';

export default function AdminDashboard() {
  const { adminRole } = useAuthStore();
  const { list: competitions, loading: compLoading } = useCompetitions();
  const [compId, setCompId] = useState('');

  const [users, setUsers] = useState<StudentRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [totals, setTotals] = useState<Record<string, TotalRow>>({});
  const [isLoading, setIsLoading] = useState(true);

  const [genderFilter, setGenderFilter] = useState<'ALL' | 'M' | 'F'>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [remindedUserIds, setRemindedUserIds] = useState<Set<string>>(new Set());
  const [selectedStudent, setSelectedStudent] = useState<(StudentRow & { missed: string[] }) | null>(null);
  const [customMsg, setCustomMsg] = useState('');
  const [copied, setCopied] = useState(false);

  const todayStr = istToday();
  const comp = competitions.find((c) => c.id === compId);

  // students (RLS scopes them for Guides / Enablers)
  useEffect(() => {
    (async () => {
      try {
        setUsers(await fetchAll<StudentRow>((from, to) =>
          supabase.from('users').select('id,full_name,mobile,gender,department').eq('is_onboarded', true).order('full_name').range(from, to)));
      } catch (err) { toast.error(friendlyError(err)); }
    })();
    try {
      const saved = localStorage.getItem(`reminded_students_${istToday()}`);
      if (saved) setRemindedUserIds(new Set(JSON.parse(saved)));
    } catch { /* ignore corrupt storage */ }
  }, []);

  useEffect(() => {
    if (!compId && competitions.length) setCompId(pickDefaultCompetition(competitions)?.id || '');
  }, [competitions, compId]);

  // competition data
  useEffect(() => {
    if (!compId) { setIsLoading(false); return; }
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const [l, a, t] = await Promise.all([
          fetchAll<LedgerRow>((from, to) => supabase.from('points_ledger')
            .select('user_id,activity_date,source,points').eq('competition_id', compId).in('source', ['chanting', 'reading']).range(from, to)),
          fetchAll<LogRow>((from, to) => supabase.from('activity_logs')
            .select('user_id,log_date,chanting_rounds').eq('competition_id', compId).range(from, to)),
          fetchAll<TotalRow>((from, to) => supabase.from('competition_totals')
            .select('user_id,total,current_streak').eq('competition_id', compId).range(from, to)),
        ]);
        if (cancelled) return;
        setLedger(l); setLogs(a); setTotals(Object.fromEntries(t.map((r) => [r.user_id, r])));
      } catch (err) { toast.error(friendlyError(err)); }
      if (!cancelled) setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [compId]);

  const markMessaged = (userId: string) => {
    setRemindedUserIds((prev) => {
      const next = new Set(prev).add(userId);
      try { localStorage.setItem(`reminded_students_${istToday()}`, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
      return next;
    });
  };

  const scopedUsers = useMemo(() => {
    if (adminRole === 'FOLK_GUIDE' || adminRole === 'FOLK_ENABLER_MALE') return users.filter((u) => u.gender === 'M');
    if (adminRole === 'FOLK_ENABLER_FEMALE') return users.filter((u) => u.gender === 'F');
    return users;
  }, [users, adminRole]);

  // days of THIS competition up to today (never padded from log dates)
  const elapsedDates = useMemo(() => {
    if (!comp || todayStr < comp.start_date) return [];
    return dateRange(comp.start_date, comp.end_date < todayStr ? comp.end_date : todayStr);
  }, [comp, todayStr]);

  const { daysByUser, detailByUser } = useMemo(() => {
    const days = new Map<string, Set<string>>();
    const detail = new Map<string, Map<string, DayDetail>>();
    for (const r of ledger) {
      if (!days.has(r.user_id)) days.set(r.user_id, new Set());
      days.get(r.user_id)!.add(r.activity_date);
      if (!detail.has(r.user_id)) detail.set(r.user_id, new Map());
      const m = detail.get(r.user_id)!;
      const cur = m.get(r.activity_date) || { rounds: null, points: 0 };
      cur.points += Number(r.points);
      m.set(r.activity_date, cur);
    }
    for (const l of logs) {
      const m = detail.get(l.user_id);
      const cur = m?.get(l.log_date);
      if (cur) cur.rounds = l.chanting_rounds;
    }
    return { daysByUser: days, detailByUser: detail };
  }, [ledger, logs]);

  const scopedIds = useMemo(() => new Set(scopedUsers.map((u) => u.id)), [scopedUsers]);
  const loggedTodayCount = scopedUsers.filter((u) => daysByUser.get(u.id)?.has(todayStr)).length;
  const totalPoints = Object.values(totals).filter((t) => scopedIds.has(t.user_id)).reduce((s, t) => s + Number(t.total || 0), 0);
  const completion = Math.round((loggedTodayCount / (scopedUsers.length || 1)) * 100);
  const showsChanting = comp ? comp.type !== 'reading' : true;

  const filtered = scopedUsers.filter((u) => {
    if (adminRole === 'HOD' && genderFilter !== 'ALL' && u.gender !== genderFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!(u.full_name?.toLowerCase().includes(q) || u.department?.toLowerCase().includes(q) || u.mobile?.includes(q))) return false;
    }
    const done = daysByUser.get(u.id) || new Set<string>();
    const missed = elapsedDates.filter((d) => !done.has(d)).length;
    if (statusFilter === 'MISSING_TODAY' && done.has(todayStr)) return false;
    if (statusFilter === 'ANY_MISSED' && missed === 0) return false;
    if (statusFilter === 'COMPLETED_ALL' && missed > 0) return false;
    if (statusFilter === 'MESSAGED' && !remindedUserIds.has(u.id)) return false;
    if (statusFilter === 'NOT_MESSAGED' && (remindedUserIds.has(u.id) || missed === 0)) return false;
    return true;
  });

  const openStudent = (u: StudentRow) => {
    if (!comp) return;
    const done = daysByUser.get(u.id) || new Set<string>();
    const missed = elapsedDates.filter((d) => !done.has(d));
    const first = (u.full_name || 'Student').trim().split(/\s+/)[0] || 'Student';
    const list = missed.map((d) => `• Day ${elapsedDates.indexOf(d) + 1}: ${d}`).join('\n');
    const link = typeof window !== 'undefined' ? window.location.origin + '/' : '';
    setSelectedStudent({ ...u, missed });
    setCustomMsg(
      missed.length > 0
        ? `Hare Krishna ${first}! \u{1F64F}\n\nThis is a gentle reminder for the "${comp.title}" (${formatLong(comp.start_date)} – ${formatLong(comp.end_date)}). You have pending logs for:\n${list}\n\nPlease update your sadhana today:\n${link}`
        : `Hare Krishna ${first}! \u{1F64F}\n\nGreat job keeping up with "${comp.title}"! Keep going! \u{1F4FF}\u{2728}`
    );
    setCopied(false);
  };

  const copyMsg = () => {
    navigator.clipboard.writeText((customMsg || '').normalize('NFC'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sendWhatsApp = (u: StudentRow) => {
    if (!u.mobile) return;
    markMessaged(u.id);
    const msg = (customMsg || '').normalize('NFC');
    navigator.clipboard.writeText(msg).catch(() => {});
    const digits = u.mobile.replace(/\D/g, '');
    const phone = digits.length === 10 ? `91${digits}` : digits;
    const encoded = encodeURIComponent(msg);
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) window.location.href = `whatsapp://send?phone=${phone}&text=${encoded}`;
    else window.open(`https://web.whatsapp.com/send?phone=${phone}&text=${encoded}`, '_blank', 'noopener,noreferrer');
  };

  if (compLoading || (isLoading && !comp)) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <Sparkles className="w-8 h-8 animate-spin text-indigo-600 mb-3" />
        <p className="text-slate-600 font-black text-sm tracking-wide">Loading analytics…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Admin Dashboard</h2>
          <p className="text-slate-500 font-bold text-xs sm:text-sm mt-0.5">Attendance matrix & student follow-up</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <CompetitionSelect list={competitions} value={compId} onChange={setCompId} />
          <ThemeSwitcher />
        </div>
      </div>

      {!comp ? (
        <div className="p-10 text-center bg-white rounded-3xl border border-dashed border-slate-200 text-slate-400 font-bold">No competition yet. Create one under “Competitions”.</div>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap text-xs font-bold text-slate-500">
            <StatusBadge status={comp.status} />
            <span>{formatLong(comp.start_date)} → {formatLong(comp.end_date)}</span>
            {comp.status === 'scheduled' && <span className="text-sky-600">Starts in {Math.max(1, Math.round((new Date(comp.start_date).getTime() - new Date(todayStr).getTime()) / 86400000))} day(s)</span>}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
            {[
              { label: 'Total Students', val: scopedUsers.length, icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50/80 border-indigo-100' },
              { label: 'Active Today', val: loggedTodayCount, icon: ClipboardList, color: 'text-emerald-600', bg: 'bg-emerald-50/80 border-emerald-100' },
              { label: 'Total Points', val: Math.round(totalPoints).toLocaleString(), icon: Trophy, color: 'text-amber-600', bg: 'bg-amber-50/80 border-amber-100' },
              { label: 'Completion Today', val: `${completion}%`, icon: Zap, color: 'text-purple-600', bg: 'bg-purple-50/80 border-purple-100' },
            ].map((m, i) => (
              <motion.div key={m.label} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-100 shadow-xs flex items-center gap-3">
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl ${m.bg} ${m.color} border flex items-center justify-center flex-shrink-0`}><m.icon className="w-5 h-5 sm:w-6 sm:h-6" /></div>
                <div className="min-w-0">
                  <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1 truncate">{m.label}</p>
                  <p className="text-base sm:text-2xl font-black text-slate-900 leading-none">{m.val}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="bg-white rounded-3xl sm:rounded-[2.5rem] p-4 sm:p-6 md:p-8 border border-slate-100 shadow-xl space-y-6">
            <div className="space-y-4 border-b border-slate-100 pb-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><Calendar className="text-indigo-600" size={20} /> Attendance & daily score matrix</h3>
                {adminRole === 'HOD' ? (
                  <div className="flex items-center gap-1 bg-slate-100/70 border border-slate-200/50 p-1 rounded-xl self-start sm:self-auto admin-gender-filter-container">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 hidden sm:inline">Gender:</span>
                    {(['ALL', 'M', 'F'] as const).map((g) => (
                      <button key={g} onClick={() => setGenderFilter(g)}
                        className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer ${genderFilter === g
                          ? g === 'ALL' ? 'bg-white text-indigo-700 shadow-xs font-black admin-gender-btn-all-active'
                            : g === 'M' ? 'bg-indigo-600 text-white font-black admin-gender-btn-m-active' : 'bg-pink-600 text-white font-black admin-gender-btn-f-active'
                          : 'text-slate-500 hover:text-slate-800 admin-gender-btn-inactive'}`}>
                        {g === 'ALL' ? 'All' : g === 'M' ? '👨 Male' : '👩 Female'}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className={`px-3.5 py-2 rounded-xl font-bold text-xs border self-start sm:self-auto ${adminRole === 'FOLK_ENABLER_FEMALE' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-indigo-50 border-indigo-200 text-indigo-800'}`}>
                    {adminRole === 'FOLK_ENABLER_FEMALE' ? '♀️ Female participants only' : '♂️ Male participants only'}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input type="text" placeholder="Search by name, department, mobile…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 rounded-2xl border border-slate-200/80 focus:border-indigo-500 focus:bg-white text-xs sm:text-sm font-bold outline-none" />
                </div>
                <div className="relative">
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    className="w-full py-2.5 px-3 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 cursor-pointer appearance-none">
                    <option value="ALL">All attendance status</option>
                    <option value="MISSING_TODAY">🚨 Missing today</option>
                    <option value="ANY_MISSED">⚠️ Missed any day</option>
                    <option value="COMPLETED_ALL">🏆 100% completed</option>
                    <option value="MESSAGED">💬 Messaged (reminded)</option>
                    <option value="NOT_MESSAGED">⏳ Pending follow-up</option>
                  </select>
                  <Filter className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs font-bold text-slate-500 flex-wrap gap-2 pb-1">
              <span>Showing <strong className="text-indigo-600 font-black">{filtered.length}</strong> students</span>
              <div className="flex items-center gap-3 text-[10px] sm:text-[11px] font-black flex-wrap">
                <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200"><span className="w-2 h-2 bg-emerald-500 rounded-xs" /> Logged ({showsChanting ? 'rounds + ' : ''}points)</span>
                <span className="flex items-center gap-1 text-red-700 bg-red-50 px-2 py-0.5 rounded-md border border-red-200"><span className="w-2 h-2 bg-red-500 rounded-xs" /> Missed</span>
              </div>
            </div>

            {isLoading ? (
              <div className="py-10 text-center text-slate-400 font-bold text-sm">Loading…</div>
            ) : elapsedDates.length === 0 ? (
              <div className="p-8 text-center bg-slate-50/80 rounded-2xl text-slate-400 font-bold text-sm border border-dashed border-slate-200">This competition has not started yet.</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center bg-slate-50/80 rounded-2xl text-slate-400 font-bold text-sm border border-dashed border-slate-200">No students match your filters.</div>
            ) : (
              <div className="space-y-3">
                {filtered.map((u) => {
                  const done = daysByUser.get(u.id) || new Set<string>();
                  const detail = detailByUser.get(u.id);
                  const missed = elapsedDates.filter((d) => !done.has(d)).length;
                  const messaged = remindedUserIds.has(u.id);
                  return (
                    <div key={u.id} className="bg-slate-50/80 border border-slate-200/60 rounded-2xl p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-indigo-300 hover:shadow-xs transition-all group">
                      <div onClick={() => openStudent(u)} className="w-full md:w-64 flex-shrink-0 cursor-pointer">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-black text-slate-900 text-xs sm:text-sm group-hover:text-indigo-600 transition-colors flex items-center gap-1">
                            {u.full_name}<ExternalLink size={11} className="text-slate-400 group-hover:text-indigo-600 opacity-60" />
                          </h4>
                          {u.gender === 'M' && <span className="text-[9px] bg-indigo-100 text-indigo-700 font-black px-1.5 rounded-md">M</span>}
                          {u.gender === 'F' && <span className="text-[9px] bg-pink-100 text-pink-700 font-black px-1.5 rounded-md">F</span>}
                          {messaged ? <span className="text-[9px] bg-emerald-100 text-emerald-800 font-black px-1.5 rounded-md flex items-center gap-0.5"><Check size={9} /> Messaged</span>
                            : missed > 0 ? <span className="text-[9px] bg-amber-100 text-amber-800 font-black px-1.5 rounded-md">⏳ Pending</span> : null}
                        </div>
                        <div className="flex items-center justify-between mt-1 text-[11px] text-slate-400 font-bold">
                          <span className="truncate max-w-[140px]">{u.department || 'General'} • {Number(totals[u.id]?.total || 0).toLocaleString()} pts</span>
                          <span className={`font-black whitespace-nowrap ${missed > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{missed === 0 ? '✓ 100% logged' : `${missed} missed`}</span>
                        </div>
                      </div>
                      <div className="flex-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                        <div className="flex items-center gap-1.5 min-w-max">
                          {elapsedDates.map((d, idx) => {
                            const filled = done.has(d);
                            const dd = detail?.get(d);
                            return (
                              <button key={d} onClick={() => openStudent(u)}
                                title={`Day ${idx + 1} (${d}): ${filled ? `${dd?.rounds != null ? `${dd.rounds} rounds • ` : ''}${dd?.points ?? 0} points` : 'Missed'}`}
                                className={`min-w-[48px] h-11 px-1 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer hover:scale-105 active:scale-95 text-center text-white ${filled ? 'bg-emerald-500' : 'bg-red-500'}`}>
                                <span className="text-[9px] font-black leading-none uppercase tracking-tighter opacity-90">D{idx + 1}</span>
                                {filled ? (
                                  <>
                                    {dd?.rounds != null && <span className="text-[10px] font-black leading-tight mt-0.5">{dd.rounds}r</span>}
                                    <span className="text-[8px] font-extrabold opacity-90 leading-none">+{Math.round(dd?.points ?? 0)}p</span>
                                  </>
                                ) : <span className="text-[9px] font-bold opacity-80 leading-tight mt-0.5">Missed</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      <AnimatePresence>
        {selectedStudent && comp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.6 }} exit={{ opacity: 0 }} onClick={() => setSelectedStudent(null)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs" />
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 15 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 15 }}
              className="relative w-full max-w-lg bg-white rounded-3xl p-5 sm:p-7 shadow-2xl z-10 border border-slate-100 space-y-5 max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg sm:text-xl font-black text-slate-900">{selectedStudent.full_name}</h3>
                  <p className="text-xs font-bold text-slate-400 mt-0.5">{selectedStudent.department || 'No dept'} • 📱 {selectedStudent.mobile || 'No mobile'}</p>
                </div>
                <button onClick={() => setSelectedStudent(null)} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 cursor-pointer" aria-label="Close"><X size={18} /></button>
              </div>
              <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100 text-center">
                <div><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Points</p><p className="text-base font-black text-indigo-600">{Number(totals[selectedStudent.id]?.total || 0).toLocaleString()}</p></div>
                <div><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Streak</p><p className="text-base font-black text-orange-500">{totals[selectedStudent.id]?.current_streak || 0}d</p></div>
                <div><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Missed</p><p className={`text-base font-black ${selectedStudent.missed.length ? 'text-red-500' : 'text-emerald-600'}`}>{selectedStudent.missed.length} days</p></div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-black text-slate-700">
                  <span className="flex items-center gap-1.5"><MessageSquare size={13} className="text-indigo-600" /> WhatsApp reminder draft:</span>
                  <button onClick={copyMsg} className="text-[11px] text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer font-bold">
                    {copied ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}{copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <textarea rows={5} value={customMsg} onChange={(e) => setCustomMsg(e.target.value)} className="w-full p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs font-medium text-slate-800 outline-none focus:border-indigo-500 leading-relaxed resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                {selectedStudent.mobile ? (
                  <>
                    <a href={`tel:${selectedStudent.mobile}`} onClick={() => markMessaged(selectedStudent.id)}
                      className="flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-2xl font-bold text-xs sm:text-sm hover:bg-indigo-700 shadow-md cursor-pointer active:scale-95"><Phone size={15} /> Call</a>
                    <button onClick={() => sendWhatsApp(selectedStudent)}
                      className="flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-2xl font-bold text-xs sm:text-sm hover:bg-emerald-700 shadow-md cursor-pointer active:scale-95"><MessageSquare size={15} /> WhatsApp</button>
                  </>
                ) : <p className="col-span-2 text-center text-xs font-bold text-red-500 py-1">No registered mobile number for this student.</p>}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
