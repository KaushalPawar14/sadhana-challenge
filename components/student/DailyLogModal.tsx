'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { X, Trophy, Calendar, ChevronRight } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'react-hot-toast';
import { friendlyError } from '@/lib/errors';
import { formatLong, formatShort, istToday } from '@/lib/ist';
import { includesChanting, includesReading, mergeConfig, type Competition, type ActiveCompetitionPayload } from '@/lib/competition';
import { CommitmentForm } from '@/components/student/CommitmentForm';

interface DailyLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface MyState {
  competition_id: string | null;
  commitment: number | null;
  reading_commitment: number | null;
  required: { chanting: boolean; reading: boolean };
  logged_dates: string[];
  loggable_dates: string[];
  counter_today: number;
  default_commitment: number | null;
}

interface LogResult {
  points: number;
  base: number;
  multiplier: number;
  streak: number;
  total: number;
  date: string;
  chanting_points?: number | null;
  reading_points?: number | null;
}

type Step = 'loading' | 'blocked' | 'commitment' | 'form' | 'summary';

/**
 * THE daily log: chanting rounds and/or reading minutes, depending on the competition type. The leaderboard is fed only by
 * this log (rpc log_activity): the component just collects the numbers and shows what the server calculated.
 */
export const DailyLogModal = ({ isOpen, onClose, onSuccess }: DailyLogModalProps) => {
  const { user } = useAuthStore();

  const [supabase] = useState(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ));

  const [step, setStep] = useState<Step>('loading');
  const [blockedMsg, setBlockedMsg] = useState<React.ReactNode>(null);
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [state, setState] = useState<MyState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [logDate, setLogDate] = useState('');
  const [rounds, setRounds] = useState<number>(0);
  const [minutes, setMinutes] = useState<number>(0);
  const [result, setResult] = useState<LogResult | null>(null);

  const cfg = mergeConfig(competition?.config);
  const needR = !!competition && includesChanting(competition.type);
  const needM = !!competition && includesReading(competition.type);

  const loadCounterRounds = async (compId: string, date: string, fallback: number) => {
    // rounds counted by the Japa counter for that day (own rows, read-only)
    const { data } = await supabase
      .from('user_chanting_logs')
      .select('rounds_chanted')
      .eq('competition_id', compId)
      .eq('log_date', date)
      .maybeSingle();
    return data?.rounds_chanted && data.rounds_chanted > 0 ? data.rounds_chanted : fallback;
  };

  const fetchData = async () => {
    setStep('loading');
    setResult(null);
    try {
      const [{ data: active, error: aErr }, { data: mine, error: mErr }] = await Promise.all([
        supabase.rpc('get_active_competition'),
        supabase.rpc('get_my_state'),
      ]);
      if (aErr || mErr) throw aErr || mErr;

      const payload = active as ActiveCompetitionPayload;
      const comp = payload.competition;
      setCompetition(comp);

      if (!comp) {
        setBlockedMsg(
          payload.next ? (
            <>
              <p className="text-lg font-black text-slate-800 mb-1">No competition running</p>
              <p className="text-sm text-slate-500">Next competition starts on <strong>{formatLong(payload.next.start_date)}</strong>: {payload.next.title}.</p>
            </>
          ) : (
            <>
              <p className="text-lg font-black text-slate-800 mb-1">No competition running</p>
              <p className="text-sm text-slate-500">There is nothing to log right now. Check back when the next competition is announced.</p>
            </>
          )
        );
        setStep('blocked');
        return;
      }
      const st = mine as MyState;
      setState(st);
      const first = st.loggable_dates?.[0];
      if (!first) {
        setBlockedMsg(
          <>
            <p className="text-lg font-black text-slate-800 mb-1">🎉 All days logged!</p>
            <p className="text-sm text-slate-500">
              {istToday() > comp.end_date
                ? `The competition ended on ${formatLong(comp.end_date)}.`
                : istToday() < comp.start_date
                  ? `The competition starts on ${formatLong(comp.start_date)}.`
                  : 'You have logged every day you can still submit. Missed days older than the late-log window cannot be added.'}
            </p>
          </>
        );
        setStep('blocked');
        return;
      }

      setLogDate(first);
      const counter = first === istToday() ? st.counter_today : await loadCounterRounds(comp.id, first, 0);
      setRounds(counter > 0 ? counter : st.commitment ?? 0);
      setMinutes(st.reading_commitment ?? 0);
      // every commitment this competition type needs must exist before the first log (chanting rounds, and for
      // 'both' also the reading minutes); the database enforces the same rule
      const missing = (st.required?.chanting && !st.commitment) || (st.required?.reading && !st.reading_commitment);
      setStep(missing ? 'commitment' : 'form');
    } catch (e) {
      setBlockedMsg(<p className="text-sm font-bold text-red-600">{friendlyError(e)}</p>);
      setStep('blocked');
    }
  };

  useEffect(() => {
    if (isOpen && user) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user]);

  const handleCommitmentSaved = (saved: { rounds: number | null; minutes: number | null }) => {
    setState((st) => (st ? { ...st, commitment: saved.rounds ?? st.commitment, reading_commitment: saved.minutes ?? st.reading_commitment } : st));
    if (rounds === 0 && saved.rounds) setRounds(saved.rounds);
    if (minutes === 0 && saved.minutes) setMinutes(saved.minutes);
    setStep('form');
  };

  const handleDateChange = async (date: string) => {
    setLogDate(date);
    if (!competition) return;
    const counter = date === istToday() ? state?.counter_today ?? 0 : await loadCounterRounds(competition.id, date, 0);
    setRounds(counter > 0 ? counter : state?.commitment ?? 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!competition || !logDate) return;
    if (needR && needM && rounds === 0 && minutes === 0 && !confirm('Log 0 rounds and 0 reading minutes for this day? Confirm submission?')) return;
    if (needR && !needM && rounds === 0 && !confirm('Log 0 rounds for this day? Confirm submission?')) return;
    if (needM && !needR && minutes === 0 && !confirm('Log 0 reading minutes for this day? Confirm submission?')) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('log_activity', { p_date: logDate, p_rounds: needR ? rounds : null, p_minutes: needM ? minutes : null });
      if (error) throw error;
      const r = data as LogResult;
      setResult(r);
      setStep('summary');
      onSuccess();
      toast.success(`Activity logged! 🙏 You earned ${r.points} points!`);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const dates = state?.loggable_dates || [];
  const today = istToday();

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
      />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="relative w-full max-w-lg bg-white rounded-t-[2rem] md:rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto"
      >
        <button onClick={onClose} className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 transition-colors z-10">
          <X size={24} />
        </button>

        {step === 'loading' ? (
          <div className="py-24 text-center font-bold text-slate-400 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <span>Checking the competition...</span>
          </div>
        ) : step === 'blocked' ? (
          <div className="p-10 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-3xl mx-auto mb-5">🪷</div>
            {blockedMsg}
            <button onClick={onClose} className="mt-6 w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-sm cursor-pointer">Close</button>
          </div>
        ) : step === 'commitment' && competition ? (
          <CommitmentForm
            competition={competition}
            current={{ rounds: state?.commitment ?? null, minutes: state?.reading_commitment ?? null }}
            defaultRounds={state?.default_commitment}
            onSaved={handleCommitmentSaved}
          />
        ) : step === 'form' ? (
          <div className="p-8 md:p-10">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600">
                <Calendar size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-800">Log Activity</h2>
                <p className="text-slate-500 text-sm">{competition?.title}</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Log Date</label>
                <div className="relative">
                  <select
                    value={logDate}
                    onChange={(e) => handleDateChange(e.target.value)}
                    className="w-full p-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none font-bold text-slate-700 cursor-pointer appearance-none pr-10 transition-all"
                  >
                    {dates.map((d) => (
                      <option key={d} value={d} className="font-bold">
                        {formatShort(d)}{d === today ? ' (Today) 🎯' : ''}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-500 font-bold">▼</div>
                </div>
              </div>

              {needR && (
                <div>
                  <div className="flex justify-between items-end mb-2">
                    <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                      <span>📿</span> Chanting Rounds
                    </label>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                      Commitment: {state?.commitment} Rounds
                    </span>
                  </div>
                  <input
                    type="number" name="chanting_rounds" min="0" max="300" value={rounds}
                    onChange={(e) => setRounds(Math.min(300, Math.max(0, parseInt(e.target.value) || 0)))}
                    className="w-full p-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-lg text-slate-800"
                    placeholder="Enter rounds completed"
                  />
                </div>
              )}

              {needM && (
                <div>
                  <div className="flex justify-between items-end mb-2">
                    <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                      <span>📖</span> Book Reading Minutes
                    </label>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 border border-teal-100 px-2 py-0.5 rounded-full">
                      Commitment: {state?.reading_commitment} Minutes
                    </span>
                  </div>
                  <input
                    type="number" name="reading_minutes" min="0" max="600" value={minutes}
                    onChange={(e) => setMinutes(Math.min(600, Math.max(0, parseInt(e.target.value) || 0)))}
                    className="w-full p-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-teal-500 outline-none font-bold text-lg text-slate-800"
                    placeholder="Minutes you read today"
                  />
                  <p className="mt-1.5 text-[11px] font-medium text-slate-500">Enter the minutes of book reading you actually did. Your reading is not measured by the app.</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-indigo-600 text-white py-5 rounded-[1.5rem] font-black text-lg hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-3 mt-4 disabled:opacity-50 cursor-pointer"
              >
                {isLoading ? 'Saving...' : (<>Submit Daily Log <ChevronRight size={20} /></>)}
              </button>

              <p className="text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                {cfg.streak_multiplier_enabled
                  ? `Points = Base Points × Streak (max ${cfg.streak_multiplier_cap}×) 🔥`
                  : 'Points = Base Points'}
              </p>
            </form>
          </div>
        ) : (
          <div className="p-10 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-green-600 mx-auto mb-6">
              <Trophy size={40} />
            </div>
            <h2 className="text-3xl font-black text-slate-800 mb-2">Awesome!</h2>
            <p className="text-slate-500 mb-8">Your activity has been recorded.</p>

            <div className="bg-slate-50 rounded-[2rem] p-6 mb-8 border border-slate-100">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white rounded-2xl shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Base Points</p>
                  <p className="text-2xl font-black text-slate-800">+{result?.base ?? 0}</p>
                </div>
                <div className="p-4 bg-white rounded-2xl shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Streak ×{result?.multiplier ?? 1}
                  </p>
                  <p className="text-2xl font-black text-orange-500">+{Math.max(0, (result?.points ?? 0) - (result?.base ?? 0))}</p>
                </div>
              </div>
              <div className="mt-4 p-4 bg-indigo-600 rounded-2xl text-white">
                <p className="text-[10px] font-bold opacity-60 uppercase tracking-wider mb-1">Total Earned</p>
                <p className="text-3xl font-black">{result?.points ?? 0} pts</p>
                <p className="text-[10px] font-bold opacity-70 mt-1">🔥 {result?.streak ?? 0}-day streak</p>
                {result?.chanting_points != null && result?.reading_points != null && (
                  <p className="text-[10px] font-bold opacity-70 mt-1">📿 {result.chanting_points} · 📖 {result.reading_points}</p>
                )}
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full bg-slate-900 text-white py-5 rounded-[1.5rem] font-black text-lg hover:bg-slate-800 transition-all cursor-pointer"
            >
              Back to Leaderboard
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
