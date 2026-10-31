'use client';

import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabaseClient';
import { friendlyError } from '@/lib/errors';
import { includesChanting, includesReading, mergeConfig, type CompetitionConfig, type CompetitionType } from '@/lib/competition';

export const MAX_ROUNDS_COMMITMENT = 16;
export const MAX_MINUTES_COMMITMENT = 60;

interface Props {
  competition: { title: string; type: CompetitionType; config: CompetitionConfig };
  /** commitments already saved (the form then only asks for what is missing / lets the student raise it) */
  current?: { rounds: number | null; minutes: number | null };
  defaultRounds?: number | null;
  onSaved: (saved: { rounds: number | null; minutes: number | null }) => void;
}

/**
 * Mandatory commitment step. Chanting competitions ask for daily ROUNDS (max 16), reading competitions for
 * daily MINUTES of book reading (max 60), "both" asks for both together. Enforced again in the database
 * (rpc set_commitment): commitments can only be raised later, never lowered.
 */
export function CommitmentForm({ competition, current, defaultRounds, onSaved }: Props) {
  const needRounds = includesChanting(competition.type);
  const needMinutes = includesReading(competition.type);
  const cfg = mergeConfig(competition.config);

  const clamp = (v: number | null | undefined, max: number, fb: number) =>
    String(v && v >= 1 ? Math.min(v, max) : fb);
  const [rounds, setRounds] = useState(clamp(current?.rounds ?? defaultRounds, MAX_ROUNDS_COMMITMENT, MAX_ROUNDS_COMMITMENT));
  const [minutes, setMinutes] = useState(clamp(current?.minutes, MAX_MINUTES_COMMITMENT, 30));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const digits = (v: string) => v.replace(/[^0-9]/g, '');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = parseInt(rounds, 10);
    const m = parseInt(minutes, 10);
    if (needRounds && (isNaN(r) || r < 1 || r > MAX_ROUNDS_COMMITMENT)) {
      setError(`Chanting commitment must be between 1 and ${MAX_ROUNDS_COMMITMENT} rounds.`);
      return;
    }
    if (needMinutes && (isNaN(m) || m < 1 || m > MAX_MINUTES_COMMITMENT)) {
      setError(`Reading commitment must be between 1 and ${MAX_MINUTES_COMMITMENT} minutes.`);
      return;
    }
    setError('');
    setSaving(true);
    try {
      const { error: err } = await supabase.rpc('set_commitment', {
        p_rounds: needRounds ? r : null,
        p_minutes: needMinutes ? m : null,
      });
      if (err) throw err;
      toast.success('Daily commitment saved!');
      onSaved({ rounds: needRounds ? r : null, minutes: needMinutes ? m : null });
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const inputCls = `w-full p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border-2 outline-none font-black text-2xl text-slate-800 dark:text-slate-100 transition-all text-center ${
    error ? 'border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-amber-500 dark:focus:border-amber-400 focus:bg-white dark:focus:bg-slate-800'
  }`;

  return (
    <div className="p-6 sm:p-8 md:p-10 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 transition-colors">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-amber-100 dark:bg-amber-950/80 rounded-2xl flex items-center justify-center text-amber-600 dark:text-amber-400 text-xl shadow-xs">
          {needRounds && needMinutes ? '📿📖' : needMinutes ? '📖' : '📿'}
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100">Set Your Daily Commitment</h2>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/80 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-700/60">
              ⚡ Required · once per competition
            </span>
            <span className="text-slate-500 dark:text-slate-400 text-xs font-bold">• {competition.title}</span>
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-5">
        <div className="bg-gradient-to-br from-amber-50 to-orange-50/70 dark:from-amber-950/50 dark:to-orange-950/30 p-4 rounded-2xl border border-amber-200/80 dark:border-amber-700/60 text-amber-900 dark:text-amber-100 space-y-2.5">
          {needRounds && (
            <p className="text-xs font-semibold leading-relaxed text-slate-700 dark:text-slate-300">
              📿 <strong>Chanting score</strong> = (rounds chanted ÷ your commitment) × {cfg.chanting_points_at_commitment}. Completing 100% of your commitment earns {cfg.chanting_points_at_commitment} base points.
            </p>
          )}
          {needMinutes && (
            <p className="text-xs font-semibold leading-relaxed text-slate-700 dark:text-slate-300">
              📖 <strong>Reading</strong> is tracked automatically while you read in the Books section. Your commitment is the minutes you will read every day.
            </p>
          )}
          <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
            🔒 You can only <u>raise</u> a commitment later (from your Profile), never lower it.
          </p>
        </div>

        {needRounds && (
          <div>
            <label className="block text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-2">
              How many rounds will you chant daily?
            </label>
            <input
              type="text" inputMode="numeric" pattern="[0-9]*" value={rounds}
              onChange={(e) => { setRounds(digits(e.target.value)); setError(''); }}
              className={inputCls} placeholder={`1 – ${MAX_ROUNDS_COMMITMENT}`}
            />
            <p className="mt-1.5 text-[11px] text-center font-medium text-slate-500 dark:text-slate-400">Rounds per day (maximum {MAX_ROUNDS_COMMITMENT}).</p>
          </div>
        )}

        {needMinutes && (
          <div>
            <label className="block text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-2">
              How many minutes of book reading will you do daily?
            </label>
            <input
              type="text" inputMode="numeric" pattern="[0-9]*" value={minutes}
              onChange={(e) => { setMinutes(digits(e.target.value)); setError(''); }}
              className={inputCls} placeholder={`1 – ${MAX_MINUTES_COMMITMENT}`}
            />
            <p className="mt-1.5 text-[11px] text-center font-medium text-slate-500 dark:text-slate-400">Minutes per day (maximum {MAX_MINUTES_COMMITMENT}).</p>
          </div>
        )}

        {error && (
          <p className="text-xs font-bold text-red-600 dark:text-red-400 flex items-center justify-center gap-1.5 bg-red-50 dark:bg-red-950/50 p-2.5 rounded-xl border border-red-100 dark:border-red-900/50">
            <span>⚠️</span> {error}
          </p>
        )}

        <button
          type="submit" disabled={saving}
          className="w-full bg-amber-500 hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-500 text-white py-4 rounded-2xl font-black text-base transition-all shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {saving ? 'Saving...' : <>Save Commitment &amp; Proceed <ChevronRight size={18} /></>}
        </button>
      </form>
    </div>
  );
}
