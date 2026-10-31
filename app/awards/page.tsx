'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';
import { useActiveCompetition } from '@/hooks/useActiveCompetition';
import { AwardIcon } from '@/components/student/AwardIcons';
import { Award, Calendar, Sparkles, Lock } from 'lucide-react';
import confetti from 'canvas-confetti';
import { friendlyError } from '@/lib/errors';
import { formatLong } from '@/lib/ist';
import { AWARD_CRITERIA, statusLabel, type AwardView, type Competition } from '@/lib/competition';

const ACCENTS = [
  { border: 'border-emerald-100', shadow: 'shadow-emerald-100/50', badge: 'bg-emerald-50 text-emerald-600' },
  { border: 'border-orange-100', shadow: 'shadow-orange-100/50', badge: 'bg-orange-50 text-orange-600' },
  { border: 'border-amber-100', shadow: 'shadow-amber-100/50', badge: 'bg-amber-50 text-amber-600' },
  { border: 'border-indigo-100', shadow: 'shadow-indigo-100/50', badge: 'bg-indigo-50 text-indigo-600' },
  { border: 'border-teal-100', shadow: 'shadow-teal-100/50', badge: 'bg-teal-50 text-teal-600' },
];

const scoreText = (criterion: string, score?: number | null) => {
  if (score == null) return '';
  const v = Number(score);
  const n = Number.isInteger(v) ? String(v) : v.toFixed(1);
  return criterion === 'longest_streak' ? `${n} days` : `${n} pts`;
};

const playChime = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.3);
  } catch {
    /* audio not allowed: ignore */
  }
};

export default function AwardsPage() {
  const { data: active, loading: activeLoading } = useActiveCompetition();

  const [list, setList] = useState<Competition[]>([]);
  const [listLoaded, setListLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [awards, setAwards] = useState<AwardView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('list_competitions');
      setList(((data as Competition[]) || []).filter((c) => c.status !== 'draft' && c.status !== 'archived'));
      setListLoaded(true);
    })();
  }, []);

  // default: the running competition, else the last one that ended, else the newest
  useEffect(() => {
    if (selectedId || activeLoading || !listLoaded) return;
    setSelectedId(active?.competition?.id ?? active?.last?.id ?? list[0]?.id ?? null);
  }, [selectedId, activeLoading, listLoaded, active, list]);

  const selected = list.find((c) => c.id === selectedId) ?? null;

  const loadAwards = useCallback(async (compId: string) => {
    setIsLoading(true);
    setError('');
    const { data, error: err } = await supabase.rpc('get_awards_view', { p_comp: compId });
    if (err) setError(friendlyError(err));
    const view = (data as AwardView[]) || [];
    setAwards(view);
    setIsLoading(false);

    // celebrate each unlocked award of mine once per device (never on every visit)
    for (const a of view) {
      if (!a.mine?.won || !a.mine.unlocked) continue;
      const key = `award_celebrated_${a.id}`;
      try {
        if (localStorage.getItem(key)) continue;
        localStorage.setItem(key, '1');
      } catch { /* storage blocked: skip confetti rather than repeat it */ continue; }
      confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
      playChime();
      break; // one burst per visit is enough
    }
  }, []);

  useEffect(() => {
    if (!selectedId) { setIsLoading(false); return; }
    loadAwards(selectedId);
  }, [selectedId, loadAwards]);

  if (activeLoading || !listLoaded) {
    return <div className="p-20 text-center text-slate-400">Glimpsing into the hall of awards...</div>;
  }

  return (
    <div className="p-4 md:p-10 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">Divine Recognition</h1>
        <p className="text-slate-500 font-bold">Awards and milestones achieved on your journey</p>
        {list.length > 1 && (
          <select
            value={selectedId ?? ''}
            onChange={(e) => setSelectedId(e.target.value)}
            className="mt-4 px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-700 outline-none cursor-pointer max-w-full"
            aria-label="Choose competition"
          >
            {list.map((c) => (
              <option key={c.id} value={c.id}>{c.title} ({statusLabel(c.status)})</option>
            ))}
          </select>
        )}
        {selected && (
          <p className="mt-3 text-xs font-bold text-slate-400 uppercase tracking-widest">
            {selected.title} · {formatLong(selected.start_date)} – {formatLong(selected.end_date)}
          </p>
        )}
      </div>

      {!selected ? (
        <div className="bg-white rounded-3xl p-10 border border-slate-100 text-center text-slate-500 font-bold">
          No competition yet. Awards will appear here once one is announced.
          {active?.next && <> Next competition starts on {formatLong(active.next.start_date)}.</>}
        </div>
      ) : isLoading ? (
        <div className="p-20 text-center text-slate-400">Glimpsing into the hall of awards...</div>
      ) : error ? (
        <div className="p-10 text-center text-red-600 font-bold">{error}</div>
      ) : awards.length === 0 ? (
        <div className="bg-white rounded-3xl p-10 border border-slate-100 text-center text-slate-500 font-bold">
          No awards have been set up for this competition.
        </div>
      ) : (
        <>
          {!awards[0].final && (
            <div className="mb-6 bg-indigo-50 border border-indigo-100 text-indigo-800 rounded-2xl p-4 text-sm font-bold">
              Standings below are <strong>provisional</strong>. Winners are confirmed by the HOD after the competition ends, and each award unlocks on its own date.
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {awards.map((award, i) => {
              const accent = ACCENTS[i % ACCENTS.length];
              const mine = award.mine;
              const unlockedForMe = mine?.won && mine.unlocked;
              const lockedWin = mine?.won && !mine.unlocked;
              const criterionLabel = AWARD_CRITERIA.find((c) => c.value === award.criterion)?.label;
              const winners = award.winners || [];
              return (
                <motion.div
                  key={award.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.08 }}
                  className={`relative bg-white p-8 rounded-[2.5rem] border-2 transition-all overflow-hidden group ${
                    unlockedForMe ? `${accent.border} shadow-xl ${accent.shadow}` : 'border-slate-100 opacity-95'
                  }`}
                >
                  <div className="absolute top-6 right-6 flex items-center gap-1.5 z-10">
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${
                      unlockedForMe ? accent.badge : lockedWin ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-400'
                    }`}>
                      {unlockedForMe ? 'Unlocked' : lockedWin ? 'Won 🎉' : award.final ? 'Awarded' : 'Locked 🔒'}
                    </span>
                  </div>

                  <div className="w-24 h-24 mx-auto mb-6 relative z-10 transition-transform duration-300 group-hover:scale-105">
                    <AwardIcon iconKey={award.icon_key} imageUrl={award.image_url} />
                  </div>

                  <div className="text-center relative z-10">
                    <h3 className={`text-xl font-black mb-2 ${unlockedForMe || award.final ? 'text-slate-800' : 'text-slate-500'}`}>{award.name}</h3>
                    {award.description && <p className="text-xs text-slate-500 leading-relaxed mb-3 px-2">{award.description}</p>}
                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-4">
                      {criterionLabel}{award.gender_scope !== 'all' ? ` · ${award.gender_scope === 'M' ? 'Male' : 'Female'} only` : ''}
                    </p>

                    {/* my own result */}
                    {unlockedForMe && (
                      <div className="space-y-3 mb-4">
                        <p className="text-sm font-bold text-slate-700 bg-slate-50 p-3 rounded-2xl border border-slate-100/50">
                          {mine.message || `You won the ${award.name}! 🏆`}
                        </p>
                        <div className="inline-flex items-center gap-2 text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-3.5 py-1.5 rounded-full">
                          <Calendar size={12} /> Unlocked {formatLong(award.unlock_date)}
                        </div>
                      </div>
                    )}
                    {lockedWin && (
                      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 mb-4">
                        <p className="text-sm font-black text-amber-800 flex items-center justify-center gap-1.5">
                          <Sparkles size={14} /> You&apos;ve won {award.name}!
                        </p>
                        <p className="text-xs font-bold text-amber-700 mt-1 flex items-center justify-center gap-1.5">
                          <Lock size={12} /> Unlocks on {formatLong(award.unlock_date)}
                        </p>
                      </div>
                    )}

                    {/* winners / leaders */}
                    {winners.length > 0 ? (
                      <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100 flex flex-col items-center justify-center">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">
                          {award.final ? (winners.length > 1 ? 'Winners' : 'Winner') : 'Leading now (provisional)'}
                        </p>
                        {winners.map((w) => (
                          <p key={w.user_id} className="text-xs font-black text-slate-700 flex items-center gap-1">
                            {award.final ? '🏅' : '👑'} {w.full_name}
                            {w.rank && award.criterion === 'top_n_total' ? ` (#${w.rank})` : ''}
                            {!award.final && w.score != null && (
                              <span className="ml-1 text-[10px] font-bold text-indigo-500 bg-indigo-50/50 px-1.5 py-0.5 rounded-md">{scoreText(award.criterion, w.score)}</span>
                            )}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] font-bold text-slate-400">
                        {award.final ? 'No winner announced yet.' : award.criterion === 'manual' ? 'Chosen by the HOD.' : 'No leader yet.'}
                      </p>
                    )}

                    {!unlockedForMe && !lockedWin && (
                      <p className="mt-4 text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-center gap-1">
                        🔒 Unlocks: {formatLong(award.unlock_date)}
                      </p>
                    )}
                  </div>

                  {unlockedForMe && (
                    <motion.div
                      className="absolute -top-2 -right-2 w-10 h-10 bg-white shadow-lg border border-indigo-100 rounded-full flex items-center justify-center text-indigo-600 z-20"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', delay: 0.4 + i * 0.1 }}
                    >
                      <Award size={20} />
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
