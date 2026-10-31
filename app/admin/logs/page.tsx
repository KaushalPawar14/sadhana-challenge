'use client';

import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Search, Filter, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { friendlyError } from '@/lib/errors';
import { CompetitionSelect, pickDefaultCompetition, useCompetitions } from '../_shared';

// View-only for every admin role: logs are the source data of the points ledger, so they are never
// edited or deleted from the UI (corrections go through bonus / adjustment points by the HOD).

interface LogRow {
  id: string; user_id: string; log_date: string; chanting_rounds: number; points_earned: number;
  is_late_submission: boolean; source: string | null; submitted_at: string; users: { full_name: string | null } | null;
}
interface LedgerRow {
  id: string; user_id: string; source: string; points: number; activity_date: string; note: string | null;
  created_at: string; users: { full_name: string | null } | null;
}

const SOURCE_LABEL: Record<string, string> = {
  chanting: '📿 Chanting', reading: '📖 Reading', quiz_bonus: '🧠 Quiz bonus', manual_bonus: '🌟 HOD bonus', adjustment: '⚖️ Adjustment',
};

export default function AdminLogs() {
  const { list: competitions, loading: compLoading } = useCompetitions();
  const [compId, setCompId] = useState('');
  const [tab, setTab] = useState<'logs' | 'ledger'>('logs');
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [search, setSearch] = useState('');
  const [onlyLate, setOnlyLate] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!compId && competitions.length) setCompId(pickDefaultCompetition(competitions)?.id || '');
  }, [competitions, compId]);

  useEffect(() => {
    if (!compId) { setIsLoading(false); return; }
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      const [l, p] = await Promise.all([
        supabase.from('activity_logs')
          .select('id,user_id,log_date,chanting_rounds,points_earned,is_late_submission,source,submitted_at,users(full_name)')
          .eq('competition_id', compId).order('submitted_at', { ascending: false }).limit(1000),
        supabase.from('points_ledger')
          .select('id,user_id,source,points,activity_date,note,created_at,users(full_name)')
          .eq('competition_id', compId).order('created_at', { ascending: false }).limit(1000),
      ]);
      if (cancelled) return;
      if (l.error) toast.error(friendlyError(l.error));
      if (p.error) toast.error(friendlyError(p.error));
      setLogs((l.data as any as LogRow[]) || []);
      setLedger((p.data as any as LedgerRow[]) || []);
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [compId]);

  const q = search.toLowerCase();
  const filteredLogs = logs.filter((l) => (!q || l.users?.full_name?.toLowerCase().includes(q)) && (!onlyLate || l.is_late_submission));
  const filteredLedger = ledger.filter((l) => !q || l.users?.full_name?.toLowerCase().includes(q));

  const tabCls = (t: string) => `px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer transition-all ${tab === t ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:bg-slate-100'}`;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900">Activity Logs</h2>
          <p className="text-slate-500 font-bold text-sm">Every submission and every point entry (latest 1000 per list)</p>
        </div>
        {!compLoading && <CompetitionSelect list={competitions} value={compId} onChange={setCompId} />}
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input type="text" placeholder="Search by student name…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3.5 bg-white rounded-2xl border border-slate-100 shadow-sm focus:border-indigo-500 outline-none font-bold" />
        </div>
        {tab === 'logs' && (
          <button onClick={() => setOnlyLate(!onlyLate)}
            className={`flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl font-black text-sm shadow-sm cursor-pointer ${onlyLate ? 'bg-amber-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
            <Filter size={18} /> {onlyLate ? 'Showing late only' : 'Filter late'}
          </button>
        )}
      </div>

      <div className="inline-flex gap-1 bg-white border border-slate-100 rounded-2xl p-1 shadow-sm">
        <button className={tabCls('logs')} onClick={() => setTab('logs')}>Daily logs ({filteredLogs.length})</button>
        <button className={tabCls('ledger')} onClick={() => setTab('ledger')}>Points ledger ({filteredLedger.length})</button>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          {tab === 'logs' ? (
            <table className="w-full text-left min-w-[640px]">
              <thead className="bg-slate-50">
                <tr>{['Student', 'Log date', 'Rounds', 'Points', 'Status', 'Source'].map((h) => <th key={h} className="p-4 sm:p-5 font-black text-slate-400 uppercase text-[10px] tracking-widest">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {isLoading ? (
                  <tr><td colSpan={6} className="p-10 text-center text-slate-400 font-bold">Loading…</td></tr>
                ) : filteredLogs.length === 0 ? (
                  <tr><td colSpan={6} className="p-10 text-center text-slate-400 font-bold">No logs found.</td></tr>
                ) : filteredLogs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/50">
                    <td className="p-4 sm:p-5 font-bold text-slate-900">{l.users?.full_name}</td>
                    <td className="p-4 sm:p-5 font-bold text-slate-600">{l.log_date}</td>
                    <td className="p-4 sm:p-5 text-xs font-bold text-slate-500">📿 {l.chanting_rounds}</td>
                    <td className="p-4 sm:p-5 font-black text-indigo-600">+{l.points_earned}</td>
                    <td className="p-4 sm:p-5">
                      {l.is_late_submission
                        ? <span className="flex items-center gap-1 text-amber-500 text-[10px] font-black uppercase"><AlertCircle size={12} /> Late</span>
                        : <span className="flex items-center gap-1 text-emerald-500 text-[10px] font-black uppercase"><CheckCircle2 size={12} /> On time</span>}
                    </td>
                    <td className="p-4 sm:p-5 text-[10px] font-black uppercase text-slate-400">{l.source === 'auto' ? 'Auto (Japa counter)' : 'Manual'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left min-w-[640px]">
              <thead className="bg-slate-50">
                <tr>{['Student', 'Date', 'Type', 'Points', 'Note'].map((h) => <th key={h} className="p-4 sm:p-5 font-black text-slate-400 uppercase text-[10px] tracking-widest">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {isLoading ? (
                  <tr><td colSpan={5} className="p-10 text-center text-slate-400 font-bold">Loading…</td></tr>
                ) : filteredLedger.length === 0 ? (
                  <tr><td colSpan={5} className="p-10 text-center text-slate-400 font-bold">No entries found.</td></tr>
                ) : filteredLedger.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/50">
                    <td className="p-4 sm:p-5 font-bold text-slate-900">{l.users?.full_name}</td>
                    <td className="p-4 sm:p-5 font-bold text-slate-600">{l.activity_date}</td>
                    <td className="p-4 sm:p-5 text-xs font-bold text-slate-600">{SOURCE_LABEL[l.source] || l.source}</td>
                    <td className={`p-4 sm:p-5 font-black ${Number(l.points) < 0 ? 'text-red-600' : 'text-indigo-600'}`}>{Number(l.points) > 0 ? '+' : ''}{Number(l.points)}</td>
                    <td className="p-4 sm:p-5 text-xs font-medium text-slate-500 max-w-xs truncate">{l.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
