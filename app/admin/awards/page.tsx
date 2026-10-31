'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Award, Search, Undo2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import { friendlyError } from '@/lib/errors';
import { formatLong, istToday } from '@/lib/ist';
import { ViewOnlyNote } from '../_shared';

interface UserAwardRow {
  id: string; rank: number | null; unlock_date: string; custom_message: string | null; granted_at: string;
  seen_at: string | null; revoked_at: string | null; score_at_finalization: number | null;
  users: { full_name: string | null } | null;
  competition_awards: { name: string; award_key: string } | null;
  competitions: { title: string } | null;
}

export default function AdminAwards() {
  const { isHod, adminRole } = useAuthStore();
  const [rows, setRows] = useState<UserAwardRow[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('user_awards')
      .select('id,rank,unlock_date,custom_message,granted_at,seen_at,revoked_at,score_at_finalization,users(full_name),competition_awards(name,award_key),competitions(title)')
      .order('granted_at', { ascending: false });
    if (error) toast.error(friendlyError(error));
    setRows((data as any as UserAwardRow[]) || []);
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const revoke = async (id: string) => {
    if (!confirm('Revoke this award? The winner will no longer see it (the record is kept).')) return;
    const { error } = await supabase.rpc('revoke_award', { p_id: id });
    if (error) toast.error(friendlyError(error));
    else { toast.success('Award revoked'); load(); }
  };

  const q = search.toLowerCase();
  const filtered = rows.filter((r) =>
    !q || r.users?.full_name?.toLowerCase().includes(q) || r.competition_awards?.name.toLowerCase().includes(q) || r.competitions?.title.toLowerCase().includes(q));

  const stateOf = (r: UserAwardRow) =>
    r.revoked_at ? { t: 'Revoked', c: 'bg-red-50 text-red-600' }
      : r.unlock_date > istToday() ? { t: `Unlocks ${formatLong(r.unlock_date)}`, c: 'bg-amber-50 text-amber-700' }
        : { t: r.seen_at ? 'Seen' : 'Unlocked', c: 'bg-emerald-50 text-emerald-700' };

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h2 className="text-2xl sm:text-3xl font-black text-slate-900">Award Management</h2>
        <p className="text-slate-500 font-bold text-sm">Everyone who has been given an award, across all competitions</p>
      </div>
      {!isHod && <ViewOnlyNote role={adminRole} />}

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input type="text" placeholder="Search by student, award or competition…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-12 pr-4 py-3.5 bg-white rounded-2xl border border-slate-100 shadow-sm focus:border-indigo-500 outline-none font-bold" />
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[760px]">
            <thead className="bg-slate-50">
              <tr>
                {['Student', 'Award', 'Competition', 'Message', 'State'].map((h) => <th key={h} className="p-4 sm:p-5 font-black text-slate-400 uppercase text-[10px] tracking-widest">{h}</th>)}
                {isHod && <th className="p-4 sm:p-5 font-black text-slate-400 uppercase text-[10px] tracking-widest text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                <tr><td colSpan={6} className="p-10 text-center text-slate-400 font-bold">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="p-10 text-center text-slate-400 font-bold">No awards have been given yet. Finalize a competition to award its winners.</td></tr>
              ) : filtered.map((r) => {
                const st = stateOf(r);
                return (
                  <tr key={r.id} className={`hover:bg-slate-50/50 ${r.revoked_at ? 'opacity-60' : ''}`}>
                    <td className="p-4 sm:p-5 font-bold text-slate-900">{r.users?.full_name}</td>
                    <td className="p-4 sm:p-5"><span className="flex items-center gap-2 font-bold text-indigo-600"><Award size={16} /> {r.competition_awards?.name}</span></td>
                    <td className="p-4 sm:p-5 text-xs font-bold text-slate-500">{r.competitions?.title}</td>
                    <td className="p-4 sm:p-5 text-xs font-medium text-slate-500 max-w-xs truncate">{r.custom_message}</td>
                    <td className="p-4 sm:p-5"><span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${st.c}`}>{st.t}</span></td>
                    {isHod && (
                      <td className="p-4 sm:p-5 text-right">
                        {!r.revoked_at && (
                          <button onClick={() => revoke(r.id)} className="inline-flex items-center gap-1 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg text-[11px] font-black uppercase cursor-pointer" title="Revoke">
                            <Undo2 size={14} /> Revoke
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
