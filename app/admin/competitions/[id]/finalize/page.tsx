'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { ArrowLeft, Award, Lock, Search, UserPlus, X } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import { friendlyError } from '@/lib/errors';
import { formatLong } from '@/lib/ist';
import type { LeaderboardRow } from '@/lib/competition';
import { StatusBadge, ViewOnlyNote, useCompetitions } from '../../../_shared';

interface Winner {
  user_id: string; full_name: string | null; department: string | null; gender: string | null;
  score: number | null; rank: number; tie_order: number; tied: boolean;
}
interface Suggestion {
  competition_award_id: string; award_key: string; name: string; criterion: string; top_n: number | null;
  gender_scope: 'all' | 'M' | 'F'; unlock_date: string; winners: Winner[];
}
interface Pick { user_id: string; full_name: string | null; rank: number; message: string }

export default function FinalizePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { isHod, adminRole } = useAuthStore();
  const { list, loading: listLoading } = useCompetitions();
  const comp = list.find((c) => c.id === params.id);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [students, setStudents] = useState<LeaderboardRow[]>([]);
  const [picks, setPicks] = useState<Record<string, Pick[]>>({});
  const [search, setSearch] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [sug, lb] = await Promise.all([
        supabase.rpc('suggest_award_winners', { p_comp: params.id }),
        supabase.rpc('get_leaderboard', { p_comp: params.id }),
      ]);
      if (cancelled) return;
      if (sug.error) toast.error(friendlyError(sug.error));
      if (lb.error) toast.error(friendlyError(lb.error));
      const s = (sug.data as Suggestion[]) || [];
      setSuggestions(s);
      setStudents((lb.data as LeaderboardRow[]) || []);
      // default selection: top-N awards take everybody suggested; others take the tie-break winner only
      const initial: Record<string, Pick[]> = {};
      for (const a of s) {
        const chosen = a.criterion === 'top_n_total' ? a.winners : a.winners.filter((w) => w.tie_order === 1);
        initial[a.competition_award_id] = chosen.map((w) => ({ user_id: w.user_id, full_name: w.full_name, rank: w.rank, message: '' }));
      }
      setPicks(initial);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [params.id]);

  const total = useMemo(() => Object.values(picks).reduce((n, p) => n + p.length, 0), [picks]);

  const isPicked = (awardId: string, userId: string) => (picks[awardId] || []).some((p) => p.user_id === userId);
  const toggle = (awardId: string, w: { user_id: string; full_name: string | null; rank: number }) =>
    setPicks((prev) => {
      const cur = prev[awardId] || [];
      return {
        ...prev,
        [awardId]: cur.some((p) => p.user_id === w.user_id)
          ? cur.filter((p) => p.user_id !== w.user_id)
          : [...cur, { user_id: w.user_id, full_name: w.full_name, rank: w.rank, message: '' }],
      };
    });
  const setMessage = (awardId: string, userId: string, message: string) =>
    setPicks((prev) => ({ ...prev, [awardId]: (prev[awardId] || []).map((p) => (p.user_id === userId ? { ...p, message } : p)) }));

  const finalize = async () => {
    setSaving(true);
    const assignments = Object.entries(picks).flatMap(([awardId, ps]) =>
      ps.map((p) => ({ competition_award_id: awardId, user_id: p.user_id, rank: p.rank, custom_message: p.message.trim() || null }))
    );
    const { error } = await supabase.rpc('finalize_competition', { p_comp: params.id, p_assignments: assignments });
    setSaving(false);
    if (error) return toast.error(friendlyError(error));
    toast.success('Results finalized 🏆');
    router.replace('/admin/competitions');
  };

  if (listLoading || loading) return <div className="p-10 text-center text-slate-400 font-bold">Loading results…</div>;
  if (!comp) return <div className="p-10 text-center text-slate-500 font-bold">Competition not found.</div>;

  const canFinalize = isHod && comp.status === 'ended';

  return (
    <div className="space-y-6 pb-24 max-w-4xl">
      <Link href="/admin/competitions" className="inline-flex items-center gap-1.5 text-xs font-black text-slate-500 hover:text-indigo-600">
        <ArrowLeft size={14} /> All competitions
      </Link>
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Finalize: {comp.title}</h2>
        <StatusBadge status={comp.status} />
      </div>

      {!isHod && <ViewOnlyNote role={adminRole} />}
      {isHod && comp.status !== 'ended' && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm font-bold">
          {comp.status === 'finalized'
            ? 'This competition is already finalized.'
            : `Results can only be finalized after the competition has ended (${formatLong(comp.end_date)}).`}
        </div>
      )}

      <div className="flex gap-2 p-4 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-900 text-xs font-bold">
        <Lock size={16} className="flex-shrink-0 mt-0.5" />
        <span>
          Review the suggested winners (computed from the final totals; ties are listed together, tie-break: earliest to reach the score, then longest streak).
          You can accept, swap in another student, add a message, or leave an award unassigned. Confirming freezes the standings: later activity can never change the result.
        </span>
      </div>

      {suggestions.length === 0 && <p className="text-center text-slate-400 font-bold py-8">This competition has no awards. You can still finalize to freeze the standings.</p>}

      {suggestions.map((a) => {
        const sel = picks[a.competition_award_id] || [];
        const q = (search[a.competition_award_id] || '').toLowerCase();
        const candidates = students
          .filter((s) => (a.gender_scope === 'all' || s.gender === a.gender_scope) && !isPicked(a.competition_award_id, s.user_id))
          .filter((s) => !q || (s.full_name || '').toLowerCase().includes(q) || (s.department || '').toLowerCase().includes(q))
          .slice(0, 8);

        return (
          <section key={a.competition_award_id} className="bg-white rounded-3xl border border-slate-100 shadow-md p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><Award size={18} className="text-amber-500" /> {a.name}</h3>
                <p className="text-[11px] font-bold text-slate-400 mt-0.5">
                  {a.criterion.replace(/_/g, ' ')}{a.criterion === 'top_n_total' ? ` (top ${a.top_n})` : ''}
                  {a.gender_scope !== 'all' ? ` · ${a.gender_scope === 'M' ? 'male' : 'female'} students` : ''} · unlocks {formatLong(a.unlock_date)}
                </p>
              </div>
              <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${sel.length ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                {sel.length ? `${sel.length} selected` : 'Unassigned'}
              </span>
            </div>

            {/* suggested winners */}
            {a.winners.length === 0 ? (
              <p className="text-xs font-bold text-slate-400">No student qualifies automatically.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Suggested</p>
                {a.winners.map((w) => (
                  <label key={w.user_id} className="flex items-center gap-3 p-3 rounded-2xl border border-slate-100 bg-slate-50/70 cursor-pointer">
                    <input type="checkbox" disabled={!canFinalize} checked={isPicked(a.competition_award_id, w.user_id)} onChange={() => toggle(a.competition_award_id, w)} />
                    <span className="flex-1 min-w-0">
                      <span className="font-black text-slate-800 text-sm">{w.full_name}</span>
                      <span className="text-[11px] font-bold text-slate-400 ml-2">{w.department}</span>
                    </span>
                    {w.tied && <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">tied{w.tie_order > 1 ? ` · #${w.tie_order}` : ' · tie-break winner'}</span>}
                    <span className="text-xs font-black text-indigo-600 whitespace-nowrap">{w.score != null ? Number(w.score).toLocaleString() : '—'}</span>
                  </label>
                ))}
              </div>
            )}

            {/* chosen + messages */}
            {sel.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Winners & personal message (optional)</p>
                {sel.map((p) => (
                  <div key={p.user_id} className="flex items-center gap-2">
                    <span className="text-sm font-black text-slate-700 w-32 sm:w-44 truncate">{p.full_name}</span>
                    <input
                      value={p.message} disabled={!canFinalize}
                      onChange={(e) => setMessage(a.competition_award_id, p.user_id, e.target.value)}
                      placeholder="You showed exceptional grit…"
                      className="flex-1 min-w-0 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium outline-none focus:border-indigo-500"
                    />
                    {canFinalize && (
                      <button type="button" onClick={() => toggle(a.competition_award_id, { user_id: p.user_id, full_name: p.full_name, rank: p.rank })} aria-label="Remove winner" className="p-1.5 text-slate-400 hover:text-red-500 cursor-pointer"><X size={16} /></button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* swap in another student */}
            {canFinalize && (
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5"><UserPlus size={12} /> Add / swap in another student</p>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search[a.competition_award_id] || ''}
                    onChange={(e) => setSearch((p) => ({ ...p, [a.competition_award_id]: e.target.value }))}
                    placeholder="Search by name or department…"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold outline-none focus:border-indigo-500"
                  />
                </div>
                {q && (
                  <div className="rounded-2xl border border-slate-100 divide-y divide-slate-50 overflow-hidden">
                    {candidates.length === 0 ? (
                      <p className="p-3 text-xs font-bold text-slate-400">No match.</p>
                    ) : candidates.map((s) => (
                      <button
                        key={s.user_id} type="button"
                        onClick={() => { toggle(a.competition_award_id, { user_id: s.user_id, full_name: s.full_name, rank: 1 }); setSearch((p) => ({ ...p, [a.competition_award_id]: '' })); }}
                        className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-indigo-50 cursor-pointer"
                      >
                        <span className="text-sm font-black text-slate-700 truncate">{s.full_name} <span className="text-[11px] font-bold text-slate-400">{s.department}</span></span>
                        <span className="text-[11px] font-black text-slate-500 whitespace-nowrap">#{s.rank} · {Number(s.total).toLocaleString()} pts</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}

      {canFinalize && (
        <div className="fixed bottom-0 left-0 right-0 lg:left-64 p-3 sm:p-4 bg-white/90 backdrop-blur border-t border-slate-200 z-30">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
            <p className="text-xs font-bold text-slate-500">{total} award{total === 1 ? '' : 's'} will be given</p>
            <button onClick={() => setConfirmOpen(true)} className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm shadow-lg shadow-indigo-200 cursor-pointer">
              Review & finalize
            </button>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !saving && setConfirmOpen(false)} />
          <div className="relative w-full max-w-md bg-white rounded-[2rem] p-6 sm:p-8 shadow-2xl space-y-4" role="dialog" aria-modal="true">
            <h3 className="text-xl font-black text-slate-800">Finalize “{comp.title}”?</h3>
            <ul className="text-sm font-medium text-slate-600 space-y-1.5 list-disc pl-5">
              <li>The final standings are <strong>frozen</strong>. Later activity can never change them.</li>
              <li><strong>{total}</strong> award{total === 1 ? '' : 's'} will be saved for the students you selected; each unlocks on its own unlock date and then pops up for the winner.</li>
              <li>The competition becomes read-only. This cannot be undone.</li>
            </ul>
            <div className="flex gap-3 pt-2">
              <button disabled={saving} onClick={() => setConfirmOpen(false)} className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-700 font-black cursor-pointer">Go back</button>
              <button disabled={saving} onClick={finalize} className="flex-1 py-3 rounded-2xl bg-indigo-600 text-white font-black cursor-pointer disabled:opacity-60">{saving ? 'Finalizing…' : 'Yes, finalize'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
