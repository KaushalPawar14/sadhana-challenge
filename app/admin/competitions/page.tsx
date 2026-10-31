'use client';

import React from 'react';
import Link from 'next/link';
import { Plus, Trophy, Calendar, Gift } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useCompetitions, StatusBadge, CompetitionActions, competitionSummary } from '../_shared';

export default function CompetitionsPage() {
  const { isHod } = useAuthStore();
  const { list, loading, reload } = useCompetitions();

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Competitions</h2>
          <p className="text-slate-500 font-bold text-xs sm:text-sm mt-0.5">
            One competition runs at a time. Create, schedule and finalize them here.
          </p>
        </div>
        {isHod && (
          <Link
            href="/admin/competitions/new"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-sm shadow-lg shadow-indigo-100 transition-all"
          >
            <Plus size={18} /> New competition
          </Link>
        )}
      </div>

      {loading ? (
        <div className="p-10 text-center text-slate-400 font-bold">Loading competitions…</div>
      ) : list.length === 0 ? (
        <div className="p-10 text-center bg-white rounded-3xl border border-dashed border-slate-200 text-slate-400 font-bold">
          No competitions yet.{isHod ? ' Create the first one.' : ''}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {list.map((c) => (
            <div key={c.id} className="bg-white rounded-3xl border border-slate-100 shadow-md p-5 sm:p-6 space-y-4">
              <div className="flex items-start gap-4">
                {c.cover_photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.cover_photo_url} alt="" className="w-14 h-14 rounded-2xl object-cover border border-slate-100 flex-shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center flex-shrink-0"><Trophy size={24} /></div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-black text-slate-900 text-base sm:text-lg break-words">{c.title}</h3>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="text-xs font-bold text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap">
                    <Calendar size={12} /> {competitionSummary(c)}
                    {c.bonus_enabled && <span className="inline-flex items-center gap-1 text-amber-600"><Gift size={12} /> bonus on</span>}
                  </p>
                  {c.status === 'active' && (
                    <p className="text-[11px] font-bold text-emerald-600 mt-1">Day {c.day_number} of {c.total_days} · {c.days_left} day{c.days_left === 1 ? '' : 's'} left</p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
                <Link
                  href={`/admin/competitions/${c.id}`}
                  className="px-4 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider border bg-slate-900 text-white border-slate-900 hover:bg-slate-700 transition-all"
                >
                  {isHod && c.stored_status !== 'finalized' ? 'Edit' : 'View'}
                </Link>
                <CompetitionActions c={c} isHod={isHod} onDone={reload} compact />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
