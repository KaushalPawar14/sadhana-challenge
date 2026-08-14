'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trophy, Calendar, ChevronRight } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';
import { useAuthStore } from '@/store/authStore';
import { calculatePoints, updateStreak, checkAwardUnlocks, CalculationResult } from '@/lib/pointsEngine';
import { toast } from 'react-hot-toast';
import confetti from 'canvas-confetti';

interface DailyLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const DailyLogModal = ({ isOpen, onClose, onSuccess }: DailyLogModalProps) => {
  const { user } = useAuthStore();

  // Initialize the browser client so it passes authentication cookies
  const [supabase] = useState(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ));

  const [step, setStep] = useState<'form' | 'summary'>('form');
  const [isLoading, setIsLoading] = useState(false);
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [formData, setFormData] = useState({
    chanting_rounds: 0,
    reading_minutes: 0,
    hearing_minutes: 0
  });
  const [pointsResult, setPointsResult] = useState<CalculationResult | null>(null);
  const [appSettings, setAppSettings] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [alreadyLoggedDates, setAlreadyLoggedDates] = useState<string[]>([]);
  const [isFetching, setIsFetching] = useState(false);

  // Generate list of unfulfilled dates (past/present only, not already logged)
  const unfulfilledDates = React.useMemo(() => {
    if (!appSettings?.challenge_start_date) return [];

    const dates: { value: string; label: string }[] = [];
    const [sYear, sMonth, sDay] = appSettings.challenge_start_date.split('-').map(Number);
    const start = new Date(sYear, sMonth - 1, sDay);
    start.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Scan from start date to today
    let current = new Date(start);
    while (current <= today) {
      const yStr = current.getFullYear();
      const mStr = String(current.getMonth() + 1).padStart(2, '0');
      const dStr = String(current.getDate()).padStart(2, '0');
      const dateStr = `${yStr}-${mStr}-${dStr}`;

      if (!alreadyLoggedDates.includes(dateStr)) {
        dates.push({
          value: dateStr,
          label: current.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          })
        });
      }
      current.setDate(current.getDate() + 1);
    }

    // Sort descending so most recent unlogged date is at the top
    return dates.reverse();
  }, [appSettings, alreadyLoggedDates]);

  // Reactively sync selected logDate with the first available unfulfilled date
  React.useEffect(() => {
    if (unfulfilledDates.length > 0 && !unfulfilledDates.some(d => d.value === logDate)) {
      setLogDate(unfulfilledDates[0].value);
    }
  }, [unfulfilledDates, logDate]);

  useEffect(() => {
    if (isOpen && user) {
      setAlreadyLoggedDates([]);
      fetchData();
    }
  }, [isOpen, user]);

  const fetchData = async () => {
    setIsFetching(true);
    try {
      // Fetch settings
      const { data: settings } = await supabase.from('app_settings').select('*');
      const settingsMap = settings?.reduce((acc: any, curr: any) => {
        acc[curr.key] = curr.value;
        return acc;
      }, {});
      setAppSettings(settingsMap);

      // Fetch user profile for targets and current streak
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', user?.id)
        .single();
      setUserProfile(profile);

      // Fetch existing logs to find already completed dates
      const { data: existingLogs } = await supabase
        .from('activity_logs')
        .select('log_date')
        .eq('user_id', user?.id);

      const loggedDates = existingLogs?.map(l => l.log_date) || [];
      setAlreadyLoggedDates(loggedDates);

      // Default to the first unlogged past date going backward starting from today
      const today = new Date();
      let checkDate = new Date(today);
      let checkDateStr = checkDate.toISOString().split('T')[0];
      while (loggedDates.includes(checkDateStr)) {
        checkDate.setDate(checkDate.getDate() - 1);
        checkDateStr = checkDate.toISOString().split('T')[0];
      }
      setLogDate(checkDateStr);

      // Default form data to personal targets
      setFormData({
        chanting_rounds: profile?.target_chanting || 0,
        reading_minutes: profile?.target_reading || 0,
        hearing_minutes: 0
      });
    } catch (e) {
      console.error("Error fetching modal data:", e);
    } finally {
      setIsFetching(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: Math.max(0, parseInt(value) || 0) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !appSettings || !userProfile) return;

    const selected = new Date(logDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today.getTime() - selected.getTime()) / (1000 * 60 * 60 * 24));

    const lateAllowed = parseInt(appSettings.late_log_allowed_days || '1');
    if (diffDays > lateAllowed) {
      toast.error(`Late submissions are only allowed for yesterday. Contact admin for older logs.`);
      return;
    }

    if (formData.chanting_rounds === 0) {
      if (!confirm("Logging 0 rounds for chanting today? Confirm submission?")) return;
    }

    setIsLoading(true);
    try {
      // 1. Update Streak
      const streakUpdate = updateStreak(
        userProfile.last_log_date,
        logDate,
        userProfile.streak_count,
        userProfile.freeze_credits
      );

      if (streakUpdate.error) {
        toast.error(streakUpdate.error);
        setIsLoading(false);
        return;
      }

      if (streakUpdate.freeze_used) {
        toast("One Streak Shield used! 🛡️", { icon: '🛡️' });
      } else if (streakUpdate.streak_broken) {
        toast("Your streak was broken. Starting fresh 🔥", { icon: '🔥' });
      }

      // 2. Calculate Points
      const result = calculatePoints({
        ...formData,
        target_chanting: userProfile.target_chanting,
        target_reading: userProfile.target_reading,
        target_hearing: 0,
        streak_count: streakUpdate.new_streak,
        points_per_chanting: parseInt(appSettings.points_per_chanting_round || '2'),
        points_per_reading: parseInt(appSettings.points_per_reading_minute || '1'),
        points_per_hearing: 0,
        streak_bonus_multiplier: parseFloat(appSettings.streak_bonus_multiplier || '0.1')
      });

      setPointsResult(result);

      // 3. Save to DB (Uses safe insert/update routing to perfectly respect RLS policies and constraints)
      const logExists = alreadyLoggedDates.includes(logDate);
      let logError;

      if (logExists) {
        const { error } = await supabase
          .from('activity_logs')
          .update({
            ...formData,
            points_earned: result.total_points,
            is_late_submission: diffDays > 0
          })
          .eq('user_id', user.id)
          .eq('log_date', logDate);
        logError = error;
      } else {
        const { error } = await supabase
          .from('activity_logs')
          .insert({
            user_id: user.id,
            log_date: logDate,
            ...formData,
            points_earned: result.total_points,
            is_late_submission: diffDays > 0
          });
        logError = error;
      }

      if (logError) throw logError;

      const newTotalPoints = (userProfile.total_points || 0) + result.total_points;
      const { error: userError } = await supabase.from('users').update({
        total_points: newTotalPoints,
        streak_count: streakUpdate.new_streak,
        best_streak: Math.max(userProfile.best_streak || 0, streakUpdate.new_streak),
        last_log_date: logDate,
        freeze_credits: streakUpdate.new_freeze_credits
      }).eq('id', user.id);

      if (userError) throw userError;

      // 4. Check Awards
      const { data: logAgg } = await supabase
        .from('activity_logs')
        .select('reading_minutes, submitted_at')
        .eq('user_id', user.id);

      const cumulativeReading = logAgg?.reduce((sum, log) => sum + (log.reading_minutes || 0), 0) || 0;
      const earlyMorningCount = logAgg?.filter(log => {
        const time = new Date(log.submitted_at).getHours();
        return time < 6;
      }).length || 0;

      const newAwards = checkAwardUnlocks({
        total_points: newTotalPoints,
        streak_count: streakUpdate.new_streak,
        cumulative_reading_minutes: cumulativeReading,
        early_morning_logs_count: earlyMorningCount,
        is_first_log: !userProfile.last_log_date
      });

      if (newAwards.length > 0) {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 }
        });
      }

      setStep('summary');
      onSuccess();
      toast.success(`Activity logged! 🙏 You earned ${result.total_points} points!`);
    } catch (error: any) {
      toast.error(error.message || "Failed to log activity");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

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
        className="relative w-full max-w-lg bg-white rounded-t-[2rem] md:rounded-[2.5rem] shadow-2xl overflow-hidden"
      >
        <button onClick={onClose} className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 transition-colors">
          <X size={24} />
        </button>

        {step === 'form' ? (
          <div className="p-8 md:p-10">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600">
                <Calendar size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-800">Log Activity</h2>
                <p className="text-slate-500 text-sm">Update your progress for the day</p>
              </div>
            </div>

            {isFetching ? (
              <div className="py-20 text-center font-bold text-slate-400 flex flex-col items-center justify-center gap-3">
                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <span>Checking your commitments...</span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Log Date</label>
                  {unfulfilledDates.length > 0 ? (
                    <div className="relative">
                      <select
                        value={logDate}
                        onChange={(e) => setLogDate(e.target.value)}
                        className="w-full p-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none font-bold text-slate-700 cursor-pointer appearance-none pr-10 transition-all"
                      >
                        {unfulfilledDates.map((d) => (
                          <option key={d.value} value={d.value} className="font-bold">
                            {d.label} {d.value === new Date().toISOString().split('T')[0] ? ' (Today) 🎯' : ''}
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-500 font-bold">
                        ▼
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 bg-emerald-50 border-2 border-emerald-100 text-emerald-700 rounded-3xl text-center font-bold">
                      <p className="text-sm mb-1">🎉 All Days Logged!</p>
                      <p className="text-[10px] uppercase tracking-wider opacity-85">You have successfully logged all available days of this challenge.</p>
                    </div>
                  )}
                </div>

                {unfulfilledDates.length > 0 && (
                  <>
                    <div>
                      <div className="flex justify-between items-end mb-2">
                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                          <span>📿</span> Chanting Rounds
                        </label>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">Target: -</span>
                      </div>
                      <input
                        type="number"
                        name="chanting_rounds"
                        min="0"
                        value={formData.chanting_rounds}
                        onChange={handleInputChange}
                        className="w-full p-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-lg text-slate-800"
                        placeholder="Enter rounds completed"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full bg-indigo-600 text-white py-5 rounded-[1.5rem] font-black text-lg hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-3 mt-4 disabled:opacity-50 cursor-pointer"
                    >
                      {isLoading ? 'Saving...' : (
                        <>Submit Daily Log <ChevronRight size={20} /></>
                      )}
                    </button>

                    <p className="text-center text-[10px] text-slate-400 font-medium uppercase tracking-widest">
                      1 Round = 1 Point • Streak Multipliers Active 🔥
                    </p>
                  </>
                )}
              </form>
            )}
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
                  <p className="text-2xl font-black text-slate-800">+{pointsResult?.base_points}</p>
                </div>
                <div className="p-4 bg-white rounded-2xl shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Streak Bonus</p>
                  <p className="text-2xl font-black text-orange-500">+{pointsResult?.streak_bonus}</p>
                </div>
              </div>
              <div className="mt-4 p-4 bg-indigo-600 rounded-2xl text-white">
                <p className="text-[10px] font-bold opacity-60 uppercase tracking-wider mb-1">Total Earned</p>
                <p className="text-3xl font-black">{pointsResult?.total_points} pts</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full bg-slate-900 text-white py-5 rounded-[1.5rem] font-black text-lg hover:bg-slate-800 transition-all"
            >
              Back to Leaderboard
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};