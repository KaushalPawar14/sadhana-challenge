'use client';

// Helpers shared by the admin pages (not a route).

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { Eye } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { friendlyError } from '@/lib/errors';
import { statusLabel, typeLabel, type Competition, type CompetitionStatus } from '@/lib/competition';

/** Loads every competition the admin may see (rpc list_competitions, newest first). */
export function useCompetitions() {
  const [list, setList] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_competitions');
    if (error) toast.error(friendlyError(error));
    else setList((data as Competition[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);
  return { list, loading, reload };
}

/** Active competition if there is one, else the latest non-draft one, else the first in the list. */
export function pickDefaultCompetition(list: Competition[]): Competition | undefined {
  return (
    list.find((c) => c.status === 'active') ||
    list.find((c) => ['ended', 'finalized', 'scheduled'].includes(c.status)) ||
    list[0]
  );
}

/** Pages everything out of PostgREST (it caps a single response at 1000 rows). */
export async function fetchAll<T = any>(
  build: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...((data as T[]) || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const BADGE: Record<CompetitionStatus, string> = {
  draft: 'bg-slate-100 text-slate-600 border-slate-200',
  scheduled: 'bg-sky-50 text-sky-700 border-sky-200',
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ended: 'bg-amber-50 text-amber-700 border-amber-200',
  finalized: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  archived: 'bg-slate-100 text-slate-500 border-slate-200',
};

export function StatusBadge({ status }: { status: CompetitionStatus }) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wider ${BADGE[status]}`}>
      {statusLabel(status)}
    </span>
  );
}

export function CompetitionSelect({
  list, value, onChange, className = '',
}: { list: Competition[]; value: string; onChange: (id: string) => void; className?: string }) {
  if (list.length === 0) return <span className="text-xs font-bold text-slate-400">No competitions yet</span>;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`p-2.5 rounded-xl bg-white border border-slate-200 text-xs sm:text-sm font-bold text-slate-700 outline-none focus:border-indigo-500 cursor-pointer max-w-full ${className}`}
      aria-label="Competition"
    >
      {list.map((c) => (
        <option key={c.id} value={c.id}>
          {c.title} · {statusLabel(c.status)}
        </option>
      ))}
    </select>
  );
}

export function ViewOnlyNote({ role }: { role?: string | null }) {
  return (
    <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 text-xs font-bold">
      <Eye size={14} /> View only{role ? ` (${role.replace(/_/g, ' ').toLowerCase()})` : ''} — only the HOD can make changes.
    </div>
  );
}

export function competitionSummary(c: Competition) {
  return `${typeLabel(c.type)}${c.bonus_enabled ? ' + Bonus' : ''} · ${c.start_date} → ${c.end_date}`;
}

/** Per-competition HOD actions: archive / unarchive / delete draft / rebuild totals / finalize. */
export function CompetitionActions({
  c, isHod, onDone, compact = false,
}: { c: Competition; isHod: boolean; onDone: () => void; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  if (!isHod) return null;

  const run = async (label: string, fn: () => PromiseLike<{ error: any }>) => {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) toast.error(friendlyError(error));
    else { toast.success(label); onDone(); }
  };

  const btn = `px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider border transition-all cursor-pointer disabled:opacity-50 ${compact ? '' : 'sm:px-4'}`;
  const isDraft = c.stored_status === 'draft';
  const isFinal = c.stored_status === 'finalized';
  const isArchived = c.stored_status === 'archived';

  return (
    <div className="flex flex-wrap gap-2">
      {c.status === 'ended' && (
        <Link
          href={`/admin/competitions/${c.id}/finalize`}
          className={`${btn} bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700`}
        >
          Finalize results
        </Link>
      )}
      {!isDraft && !isFinal && !isArchived && (
        <button
          disabled={busy}
          className={`${btn} bg-white text-slate-600 border-slate-200 hover:bg-slate-50`}
          onClick={() => {
            if (!confirm('Recalculate every student’s totals for this competition from the source logs?')) return;
            run('Totals rebuilt', () => supabase.rpc('rebuild_competition_totals', { p_comp: c.id }));
          }}
        >
          Rebuild totals
        </button>
      )}
      {!isFinal && !isArchived && !isDraft && (
        <button
          disabled={busy}
          className={`${btn} bg-white text-amber-700 border-amber-200 hover:bg-amber-50`}
          onClick={() => {
            if (!confirm('Archive this competition? Its data is kept; it is hidden from students.')) return;
            run('Competition archived', () => supabase.rpc('set_competition_status', { p_id: c.id, p_status: 'archived' }));
          }}
        >
          Archive
        </button>
      )}
      {isArchived && (
        <button
          disabled={busy}
          className={`${btn} bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50`}
          onClick={() => run('Competition restored', () => supabase.rpc('set_competition_status', { p_id: c.id, p_status: 'published' }))}
        >
          Unarchive
        </button>
      )}
      {isDraft && (
        <button
          disabled={busy}
          className={`${btn} bg-white text-red-600 border-red-200 hover:bg-red-50`}
          onClick={() => {
            if (!confirm('Delete this draft? (Only drafts without any activity can be deleted.)')) return;
            run('Draft deleted', () => supabase.rpc('delete_competition_draft', { p_id: c.id }));
          }}
        >
          Delete draft
        </button>
      )}
    </div>
  );
}
