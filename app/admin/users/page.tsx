'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { Search, Award, Download, X, Filter, RotateCcw, Gift } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import { friendlyError } from '@/lib/errors';
import { formatLong } from '@/lib/ist';
import { includesChanting, includesReading, type Competition } from '@/lib/competition';
import { CompetitionSelect, ViewOnlyNote, fetchAll, pickDefaultCompetition, useCompetitions } from '../_shared';

// NOTE: there is intentionally no "delete student" action any more. Removing a student would cascade-delete
// their logs, points and awards across every competition; students are never hard-deleted from the UI.

interface StudentRow {
  id: string; full_name: string | null; mobile: string | null; gender: 'M' | 'F' | null; department: string | null;
  age: number | null; total_points: number | null; is_onboarded: boolean | null; created_at: string | null;
}
interface TotalsRow {
  user_id: string; total: number; chanting_points: number; reading_points: number; bonus_points: number;
  current_streak: number; best_streak: number;
}
interface AwardOption { id: string; competition_id: string; name: string }

const USER_COLS = 'id,full_name,mobile,gender,department,age,total_points,is_onboarded,created_at';

export default function AdminUsers() {
  const { isHod, adminRole } = useAuthStore();
  const { list: competitions, loading: compLoading } = useCompetitions();

  const [users, setUsers] = useState<StudentRow[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [totals, setTotals] = useState<Record<string, TotalsRow>>({});
  const [commitments, setCommitments] = useState<Record<string, number>>({});
  const [readingCommitments, setReadingCommitments] = useState<Record<string, number>>({});
  const [openComp, setOpenComp] = useState<Competition | null>(null);
  const [compId, setCompId] = useState('');
  const [awardOptions, setAwardOptions] = useState<AwardOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState('ALL');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [pointsFilter, setPointsFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [selectedUser, setSelectedUser] = useState<StudentRow | null>(null);
  const [modalType, setModalType] = useState<'bonus' | 'award' | null>(null);
  const [busy, setBusy] = useState(false);

  // students + emails (RLS already limits Guides / Enablers to their gender)
  useEffect(() => {
    (async () => {
      try {
        const rows = await fetchAll<StudentRow>((from, to) =>
          supabase.from('users').select(USER_COLS).order('full_name').range(from, to));
        setUsers(rows);
      } catch (err) { toast.error(friendlyError(err)); }
      setIsLoading(false);
    })();
    fetch('/api/admin/user-emails')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.emails) setEmails(d.emails); })
      .catch(() => {});
    supabase.rpc('get_active_competition').then(({ data }) => setOpenComp((data as any)?.competition ?? null));
  }, []);

  // pick a default competition once the list is in
  useEffect(() => {
    if (!compId && competitions.length) setCompId((openComp?.id) || pickDefaultCompetition(competitions)?.id || '');
  }, [competitions, openComp, compId]);

  // per-competition totals + commitments
  const loadCompetitionData = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const [t, p] = await Promise.all([
        fetchAll<TotalsRow>((from, to) => supabase.from('competition_totals')
          .select('user_id,total,chanting_points,reading_points,bonus_points,current_streak,best_streak').eq('competition_id', id).range(from, to)),
        fetchAll<any>((from, to) => supabase.from('competition_participants')
          .select('user_id,commitment_rounds,reading_commitment_minutes').eq('competition_id', id).range(from, to)),
      ]);
      setTotals(Object.fromEntries(t.map((r) => [r.user_id, r])));
      setCommitments(Object.fromEntries(p.filter((r) => r.commitment_rounds != null).map((r) => [r.user_id, r.commitment_rounds])));
      setReadingCommitments(Object.fromEntries(p.filter((r) => r.reading_commitment_minutes != null).map((r) => [r.user_id, r.reading_commitment_minutes])));
    } catch (err) { toast.error(friendlyError(err)); }
  }, []);
  useEffect(() => { loadCompetitionData(compId); }, [compId, loadCompetitionData]);

  // awards that can be granted manually (recent competitions)
  useEffect(() => {
    if (!isHod) return;
    supabase.from('competition_awards').select('id,competition_id,name').order('sort_order')
      .then(({ data }) => setAwardOptions((data as AwardOption[]) || []));
  }, [isHod]);

  const scopedUsers = useMemo(() => {
    if (adminRole === 'FOLK_GUIDE' || adminRole === 'FOLK_ENABLER_MALE') return users.filter((u) => u.gender === 'M');
    if (adminRole === 'FOLK_ENABLER_FEMALE') return users.filter((u) => u.gender === 'F');
    return users;
  }, [users, adminRole]);

  const departments = useMemo(
    () => Array.from(new Set(scopedUsers.map((u) => u.department).filter(Boolean))).sort() as string[],
    [scopedUsers]
  );

  const filtered = scopedUsers.filter((u) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      const hit = u.full_name?.toLowerCase().includes(q) || emails[u.id]?.toLowerCase().includes(q) ||
        u.department?.toLowerCase().includes(q) || u.mobile?.includes(q);
      if (!hit) return false;
    }
    if (adminRole === 'HOD' && genderFilter !== 'ALL') {
      if (genderFilter === 'UNASSIGNED' ? u.gender === 'M' || u.gender === 'F' : u.gender !== genderFilter) return false;
    }
    if (deptFilter !== 'ALL' && u.department?.toLowerCase() !== deptFilter.toLowerCase()) return false;
    const pts = totals[u.id]?.total || 0;
    if (pointsFilter === '100+' && pts < 100) return false;
    if (pointsFilter === '500+' && pts < 500) return false;
    if (pointsFilter === '0' && pts !== 0) return false;
    if (statusFilter === 'ONBOARDED' && !u.is_onboarded) return false;
    if (statusFilter === 'PENDING' && u.is_onboarded) return false;
    return true;
  });

  const hasFilters = search.trim() !== '' || genderFilter !== 'ALL' || deptFilter !== 'ALL' || pointsFilter !== 'ALL' || statusFilter !== 'ALL';
  const resetFilters = () => { setSearch(''); setGenderFilter('ALL'); setDeptFilter('ALL'); setPointsFilter('ALL'); setStatusFilter('ALL'); };

  const selectedComp = competitions.find((c) => c.id === compId);
  const canEditCommitment = isHod && !!openComp && selectedComp?.id === openComp.id;

  // ---------- HOD actions ----------
  const postUpdate = async (body: object) => {
    const res = await fetch('/api/admin/update-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Update failed');
  };

  const changeGender = async (userId: string, gender: string) => {
    try {
      await postUpdate({ userId, gender });
      toast.success(`Gender updated to ${gender}`);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, gender: gender as 'M' | 'F' } : u)));
    } catch (err) { toast.error(friendlyError(err)); }
  };

  // HOD can correct a commitment: chanting 1-16 rounds, reading 1-60 minutes (the database enforces the same limits)
  const changeCommitment = async (userId: string, kind: 'rounds' | 'minutes', value: number) => {
    if (!openComp) return;
    const max = kind === 'rounds' ? 16 : 60;
    if (value < 1 || value > max) { toast.error(kind === 'rounds' ? 'Chanting commitment must be 1 to 16 rounds.' : 'Reading commitment must be 1 to 60 minutes.'); return; }
    try {
      await postUpdate({ userId, commitment: { competitionId: openComp.id, [kind]: value } });
      toast.success(kind === 'rounds' ? `Chanting commitment set to ${value} rounds` : `Reading commitment set to ${value} minutes`);
      if (kind === 'rounds') setCommitments((prev) => ({ ...prev, [userId]: value }));
      else setReadingCommitments((prev) => ({ ...prev, [userId]: value }));
    } catch (err) { toast.error(friendlyError(err)); }
  };

  const giveBonus = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedUser) return;
    const fd = new FormData(e.currentTarget);
    const points = parseInt(String(fd.get('points')), 10);
    const title = String(fd.get('title') || '');
    setBusy(true);
    const { error } = await supabase.rpc('give_bonus', { p_user: selectedUser.id, p_points: points, p_title: title });
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    toast.success(`Gave ${points > 0 ? '+' : ''}${points} points for “${title}”`);
    setModalType(null);
    loadCompetitionData(compId);
  };

  const grantAward = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedUser) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await supabase.rpc('grant_award', {
      p_user: selectedUser.id, p_award: String(fd.get('award')), p_message: String(fd.get('message') || ''),
    });
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    toast.success('Award granted 🏅');
    setModalType(null);
  };

  const exportToCSV = () => {
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const headers = ['Name', 'Email', 'Mobile', 'Gender', 'Age', 'Department', 'Commitment (rounds)', 'Commitment (reading min)', 'Total', 'Chanting', 'Reading', 'Bonus', 'Streak', 'Joined'];
    const rows = filtered.map((u) => {
      const t = totals[u.id];
      return [q(u.full_name), q(emails[u.id]), q(u.mobile), q(u.gender), q(u.age), q(u.department), commitments[u.id] ?? '', readingCommitments[u.id] ?? '',
        t?.total ?? 0, t?.chanting_points ?? 0, t?.reading_points ?? 0, t?.bonus_points ?? 0, t?.current_streak ?? 0, q(u.created_at)];
    });
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    link.download = `sadhana_users_${selectedComp?.title?.replace(/\W+/g, '_') || 'export'}.csv`;
    link.click();
  };

  const GenderCell = ({ u }: { u: StudentRow }) =>
    isHod ? (
      <select
        value={u.gender || ''} onChange={(e) => changeGender(u.id, e.target.value)}
        className={`px-3 py-1.5 rounded-xl font-bold text-xs border outline-none cursor-pointer ${
          u.gender === 'M' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : u.gender === 'F' ? 'bg-pink-50 text-pink-700 border-pink-200' : 'bg-amber-50 text-amber-700 border-amber-300'
        }`}
      >
        <option value="" disabled>-- Gender --</option>
        <option value="M">👨 Male (M)</option>
        <option value="F">👩 Female (F)</option>
      </select>
    ) : (
      <span className={`px-2.5 py-1 rounded-lg text-xs font-black ${u.gender === 'M' ? 'bg-indigo-50 text-indigo-700' : u.gender === 'F' ? 'bg-pink-50 text-pink-700' : 'bg-amber-50 text-amber-700'}`}>{u.gender || '—'}</span>
    );

  const CommitmentCell = ({ u }: { u: StudentRow }) => {
    // show only what the selected competition type asks for
    const comp = competitions.find((c) => c.id === compId) || openComp;
    const showR = !comp || includesChanting(comp.type);
    const showM = !!comp && includesReading(comp.type);
    const field = (kind: 'rounds' | 'minutes', val: number | undefined, max: number, unit: string) =>
      canEditCommitment ? (
        <div className="flex items-center gap-1.5" key={kind}>
          <input
            key={`${u.id}-${kind}-${val ?? ''}`} type="number" min={1} max={max} defaultValue={val ?? ''} placeholder="—"
            onBlur={(e) => { const v = parseInt(e.target.value, 10); if (v > 0 && v !== val) changeCommitment(u.id, kind, v); }}
            className="w-16 p-1.5 rounded-xl text-xs font-black bg-amber-50/70 border border-amber-200/80 text-amber-800 outline-none focus:border-amber-500 text-center"
          />
          <span className="text-[10px] font-black text-slate-400 uppercase">{unit}</span>
        </div>
      ) : (
        <span className="text-xs font-black text-slate-600" key={kind}>{val != null ? `${val} ${unit}` : '—'}</span>
      );
    return (
      <div className="flex flex-col gap-1">
        {showR && field('rounds', commitments[u.id], 16, 'rds')}
        {showM && field('minutes', readingCommitments[u.id], 60, 'min')}
      </div>
    );
  };

  const Actions = ({ u }: { u: StudentRow }) =>
    isHod ? (
      <div className="flex justify-end gap-1.5">
        <button
          onClick={() => { if (!openComp?.bonus_enabled) return; setSelectedUser(u); setModalType('bonus'); }}
          disabled={!openComp?.bonus_enabled}
          title={openComp?.bonus_enabled ? 'Give bonus points' : openComp ? 'Bonus is not enabled in the running competition' : 'No competition is running'}
          className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed" aria-label="Give bonus"
        ><Gift size={18} /></button>
        <button onClick={() => { setSelectedUser(u); setModalType('award'); }} title="Grant award"
          className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-all cursor-pointer" aria-label="Grant award"><Award size={18} /></button>
      </div>
    ) : null;

  const selectCls = (on: boolean) =>
    `w-full p-3 rounded-xl border text-xs font-bold outline-none focus:border-indigo-500 cursor-pointer transition-all ${on ? 'bg-indigo-50/70 text-indigo-800 border-indigo-300' : 'bg-slate-50 border-slate-200/60 text-slate-700'}`;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900">User Management</h2>
          <p className="text-slate-500 font-bold text-sm">Students, their commitments and standing in the selected competition</p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          {!compLoading && <CompetitionSelect list={competitions} value={compId} onChange={setCompId} />}
          <button onClick={exportToCSV} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm hover:bg-slate-50 shadow-sm cursor-pointer">
            <Download size={18} /> Export CSV
          </button>
        </div>
      </div>

      {!isHod && <ViewOnlyNote role={adminRole} />}

      <div className="bg-white rounded-[2rem] p-5 sm:p-6 border border-slate-100 shadow-xl space-y-5">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="flex-1 relative w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, mobile, department…"
              className="w-full pl-12 pr-10 py-3.5 bg-slate-50 rounded-2xl border border-slate-200/60 focus:border-indigo-500 focus:bg-white outline-none font-bold text-sm text-slate-800"
            />
            {search && <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer" aria-label="Clear search"><X size={18} /></button>}
          </div>
          {hasFilters && (
            <button onClick={resetFilters} className="flex items-center gap-2 px-4 py-3.5 bg-indigo-50 text-indigo-700 rounded-2xl font-bold text-xs hover:bg-indigo-100 cursor-pointer whitespace-nowrap">
              <RotateCcw size={16} /> Reset filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Filter size={10} /> Gender</label>
            {adminRole === 'HOD' ? (
              <select value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)} className={selectCls(genderFilter !== 'ALL')}>
                <option value="ALL">All genders</option><option value="M">👨 Male</option><option value="F">👩 Female</option><option value="UNASSIGNED">❓ Unassigned</option>
              </select>
            ) : (
              <div className={`w-full p-2.5 rounded-xl border font-black text-xs text-center ${adminRole === 'FOLK_ENABLER_FEMALE' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-indigo-200 bg-indigo-50 text-indigo-800'}`}>
                {adminRole === 'FOLK_ENABLER_FEMALE' ? '♀️ Female scope only' : '♂️ Male scope only'}
              </div>
            )}
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Filter size={10} /> Department</label>
            <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className={selectCls(deptFilter !== 'ALL')}>
              <option value="ALL">All departments</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Filter size={10} /> Points</label>
            <select value={pointsFilter} onChange={(e) => setPointsFilter(e.target.value)} className={selectCls(pointsFilter !== 'ALL')}>
              <option value="ALL">All points</option><option value="100+">🏆 ≥ 100</option><option value="500+">👑 ≥ 500</option><option value="0">0 points</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Filter size={10} /> Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls(statusFilter !== 'ALL')}>
              <option value="ALL">All status</option><option value="ONBOARDED">✅ Onboarded</option><option value="PENDING">⏳ Pending</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs font-bold text-slate-500 pt-2 border-t border-slate-100">
          <span>Showing <strong className="text-indigo-600 font-black">{filtered.length}</strong> of <strong className="text-slate-800 font-black">{scopedUsers.length}</strong> students</span>
          {selectedComp && <span className="text-[10px] font-black uppercase text-slate-400">Points: {selectedComp.title}</span>}
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden">
        {/* desktop */}
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-left">
            <thead className="bg-slate-50">
              <tr>
                {['Student', 'Gender', 'Age', 'Commitment', 'Department', 'Progress', 'Status'].map((h) => (
                  <th key={h} className="p-5 font-black text-slate-400 uppercase text-[10px] tracking-widest">{h}</th>
                ))}
                {isHod && <th className="p-5 font-black text-slate-400 uppercase text-[10px] tracking-widest text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                Array(5).fill(0).map((_, i) => <tr key={i} className="animate-pulse"><td colSpan={8} className="p-10"><div className="h-4 bg-slate-100 rounded w-full" /></td></tr>)
              ) : filtered.map((u) => {
                const t = totals[u.id];
                return (
                  <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold flex-shrink-0">{u.full_name?.[0]}</div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate">{u.full_name}</p>
                          <p className="text-xs text-slate-400 truncate">{emails[u.id] || '—'}{u.mobile ? ` • 📱 ${u.mobile}` : ''}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-5"><GenderCell u={u} /></td>
                    <td className="p-5 font-bold text-slate-600">{u.age ?? '—'}</td>
                    <td className="p-5"><CommitmentCell u={u} /></td>
                    <td className="p-5 font-bold text-slate-600">{u.department}</td>
                    <td className="p-5">
                      <div className="flex items-center gap-4">
                        <div><p className="font-black text-slate-900">{Number(t?.total || 0).toLocaleString()}</p><p className="text-[10px] text-slate-400 font-black uppercase">Points</p></div>
                        <div className="h-8 w-px bg-slate-100" />
                        <div><p className="font-black text-orange-500">{t?.current_streak || 0}</p><p className="text-[10px] text-slate-400 font-black uppercase">Streak</p></div>
                      </div>
                    </td>
                    <td className="p-5">
                      {u.is_onboarded
                        ? <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase">Onboarded</span>
                        : <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-[10px] font-black uppercase">Pending</span>}
                    </td>
                    {isHod && <td className="p-5"><Actions u={u} /></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* mobile */}
        <div className="md:hidden p-4 space-y-4">
          {isLoading ? (
            <div className="py-8 text-center text-slate-400 font-bold">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-slate-400 font-bold">No students found.</div>
          ) : filtered.map((u) => {
            const t = totals[u.id];
            return (
              <div key={u.id} className="bg-slate-50 border border-slate-100 rounded-3xl p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold flex-shrink-0">{u.full_name?.[0]}</div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900 truncate">{u.full_name}</p>
                    <p className="text-xs text-slate-400 truncate">{emails[u.id] || '—'}</p>
                    {u.mobile && <p className="text-xs text-slate-400">📱 {u.mobile}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-xs border-t border-b border-slate-200/50 py-3">
                  <div><p className="font-black text-slate-900">{Number(t?.total || 0).toLocaleString()} pts</p><p className="text-[9px] text-slate-400 font-black uppercase">Points</p></div>
                  <div><p className="font-black text-orange-500">{t?.current_streak || 0} days</p><p className="text-[9px] text-slate-400 font-black uppercase">Streak</p></div>
                  <div><GenderCell u={u} /><p className="text-[9px] text-slate-400 font-black uppercase mt-0.5">Gender</p></div>
                  <div><p className="font-black text-slate-700">{u.age ?? '—'}</p><p className="text-[9px] text-slate-400 font-black uppercase">Age</p></div>
                  <div><CommitmentCell u={u} /><p className="text-[9px] text-slate-400 font-black uppercase mt-0.5">Commitment</p></div>
                  <div><p className="font-bold text-slate-600 truncate">{u.department || '—'}</p><p className="text-[9px] text-slate-400 font-black uppercase">Department</p></div>
                </div>
                <div className="flex justify-between items-center">
                  {u.is_onboarded
                    ? <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-black uppercase">Onboarded</span>
                    : <span className="px-2.5 py-1 bg-amber-50 text-amber-600 rounded-full text-[9px] font-black uppercase">Pending</span>}
                  <Actions u={u} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {isHod && modalType && selectedUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setModalType(null)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-md bg-white rounded-[2rem] p-6 sm:p-8 shadow-2xl">
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-xl font-black text-slate-800">{modalType === 'bonus' ? 'Give bonus points' : 'Grant award'}</h3>
                <button onClick={() => setModalType(null)} className="p-2 hover:bg-slate-100 rounded-full cursor-pointer" aria-label="Close"><X size={20} /></button>
              </div>
              <p className="text-sm font-bold text-slate-500 mb-4">
                For <span className="text-slate-800">{selectedUser.full_name}</span>
                {modalType === 'bonus' && openComp ? <> in <span className="text-slate-800">{openComp.title}</span></> : null}
              </p>

              {modalType === 'bonus' && (
                <form onSubmit={giveBonus} className="space-y-4">
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Reason</label>
                    <input name="title" required className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none font-bold" placeholder="e.g. Special service" />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Points (negative to deduct)</label>
                    <input name="points" type="number" required min={-10000} max={10000} className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none font-bold" placeholder="50" />
                  </div>
                  <button type="submit" disabled={busy} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black shadow-lg shadow-indigo-100 cursor-pointer disabled:opacity-60">{busy ? 'Saving…' : 'Award points'}</button>
                </form>
              )}

              {modalType === 'award' && (
                <form onSubmit={grantAward} className="space-y-4">
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Award</label>
                    <select name="award" required defaultValue="" className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none font-bold">
                      <option value="" disabled>Choose an award…</option>
                      {competitions.map((c) => {
                        const opts = awardOptions.filter((a) => a.competition_id === c.id);
                        return opts.length === 0 ? null : (
                          <optgroup key={c.id} label={`${c.title} (${formatLong(c.start_date)})`}>
                            {opts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </optgroup>
                        );
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Personal message</label>
                    <textarea name="message" className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none font-bold" placeholder="You showed exceptional grit…" />
                  </div>
                  <button type="submit" disabled={busy} className="w-full py-4 bg-amber-600 text-white rounded-xl font-black shadow-lg shadow-amber-100 cursor-pointer disabled:opacity-60">{busy ? 'Saving…' : 'Grant award'}</button>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
