'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import {
  MahayogiCrown, UnbrokenFlame, JijnasuScholar,
  BrahmaMuhurta, RisingSadhaka, FloatingLotus
} from '@/components/student/AwardIcons';
import { Award, Calendar, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';

const STANDARD_AWARDS = [
  {
    key: 'rising_sadhaka',
    name: 'Rising Sadhaka',
    icon: RisingSadhaka,
    color: 'emerald',
    defaultMessage: 'Awarded to the student who secures the 1st Rank with the highest overall score on the leaderboard!'
  },
  {
    key: 'unbroken_flame',
    name: 'Unbroken Flame',
    icon: UnbrokenFlame,
    color: 'orange',
    defaultMessage: 'Granted to all users who achieve the highest best consistency streak in the entire competition!'
  },
  {
    key: 'brahma_muhurta',
    name: 'Active Entity',
    icon: BrahmaMuhurta,
    color: 'amber',
    defaultMessage: 'Bestowed upon the user who earns the highest cumulative bonus points awarded by the admin!'
  },
  {
    key: 'mahayogi_crown',
    name: 'Mahayogi Crown',
    icon: MahayogiCrown,
    color: 'indigo',
    defaultMessage: 'Crowned to the user(s) who achieve the absolute highest single-day score ever recorded in the competition!'
  },
  {
    key: 'jijnasu_scholar',
    name: 'Jijnasu Scholar',
    icon: JijnasuScholar,
    color: 'teal',
    defaultMessage: 'Achieve the highest total quiz score in the spiritual training quizzes!'
  }
];

export default function AwardsPage() {
  const { user } = useAuthStore();
  const [awardListState, setAwardListState] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const formatUnlockDate = (dateStr: string) => {
    if (!dateStr) return '...';
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + 1); // Unlock date is day after end date
    const uDay = String(date.getDate()).padStart(2, '0');
    const uMonth = String(date.getMonth() + 1).padStart(2, '0');
    const uYear = date.getFullYear();
    return `${uDay}-${uMonth}-${uYear}`;
  };

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return 'Now';
    const date = new Date(timestamp);
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}-${m}-${y}`;
  };

  useEffect(() => {
    if (user) {
      fetchAwards();
    }
  }, [user]);

  const fetchAwards = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch current user's explicitly granted awards from database
      const { data: dbAwards } = await supabase
        .from('awards')
        .select('*')
        .eq('user_id', user?.id);

      const explicitlyGranted = dbAwards || [];

      // 2. Fetch ranking aggregates securely through server-side API (bypasses client RLS restrictions)
      const res = await fetch('/api/awards-stats');
      const stats = res.ok ? await res.json() : { usersList: [], bonusList: [], logsList: [], quizList: [] };

      const usersList = (stats.usersList || []) as any[];
      const bonusList = (stats.bonusList || []) as any[];
      const logsList = (stats.logsList || []) as any[];
      const quizList = (stats.quizList || []) as any[];

      // 5. Fetch app settings to get challenge end date
      const { data: appSettings } = await supabase
        .from('app_settings')
        .select('*');

      const settingsMap = appSettings?.reduce((acc: any, curr: any) => {
        acc[curr.key] = curr.value;
        return acc;
      }, {}) || {};

      // 6. Check if competition has ended
      const endDateStr = settingsMap.challenge_end_date || '2026-07-15';
      const [eYear, eMonth, eDay] = endDateStr.split('-').map(Number);
      const endDate = new Date(eYear, eMonth - 1, eDay);
      endDate.setHours(23, 59, 59, 999);

      const now = new Date();
      const hasEnded = now > endDate;

      // 7. Perform calculations for the automatic awards

      // -- Rising Sadhaka (Highest total points)
      let maxPoints = 0;
      usersList.forEach(u => {
        if (u.total_points > maxPoints) maxPoints = u.total_points;
      });
      const risingWinners = usersList.filter(u => u.total_points === maxPoints && maxPoints > 0).map(u => u.id);
      const risingWinnerNames = usersList.filter(u => u.total_points === maxPoints && maxPoints > 0).map(u => u.full_name).join(', ');

      // -- Unbroken Flame (Highest best streak)
      let maxStreak = 0;
      usersList.forEach(u => {
        if (u.best_streak > maxStreak) maxStreak = u.best_streak;
      });
      const flameWinners = usersList.filter(u => u.best_streak === maxStreak && maxStreak > 0).map(u => u.id);
      const flameWinnerNames = usersList.filter(u => u.best_streak === maxStreak && maxStreak > 0).map(u => u.full_name).join(', ');

      // -- Brahma Muhurta (Highest sum of admin bonus points)
      const bonusSums: Record<string, number> = {};
      bonusList.forEach(b => {
        bonusSums[b.user_id] = (bonusSums[b.user_id] || 0) + b.points;
      });
      let maxBonusSum = 0;
      Object.values(bonusSums).forEach(sum => {
        if (sum > maxBonusSum) maxBonusSum = sum;
      });
      const brahmaWinners = Object.keys(bonusSums).filter(uid => bonusSums[uid] === maxBonusSum && maxBonusSum > 0);
      const brahmaWinnerNames = usersList.filter(u => brahmaWinners.includes(u.id)).map(u => u.full_name).join(', ');

      // -- Mahayogi Crown (Highest single-day points ever achieved)
      let maxSingleDayPoints = 0;
      logsList.forEach(l => {
        if (l.points_earned > maxSingleDayPoints) maxSingleDayPoints = l.points_earned;
      });
      const mahayogiWinners = Array.from(new Set(logsList.filter(l => l.points_earned === maxSingleDayPoints && maxSingleDayPoints > 0).map(l => l.user_id)));
      const mahayogiWinnerNames = usersList.filter(u => mahayogiWinners.includes(u.id)).map(u => u.full_name).join(', ');

      // -- Jijnasu Scholar (Highest sum of quiz points earned)
      const quizSums: Record<string, number> = {};
      quizList.forEach(q => {
        quizSums[q.user_id] = (quizSums[q.user_id] || 0) + q.points_earned;
      });
      let maxQuizSum = 0;
      Object.values(quizSums).forEach(sum => {
        if (sum > maxQuizSum) maxQuizSum = sum;
      });
      const quizWinners = Object.keys(quizSums).filter(uid => quizSums[uid] === maxQuizSum && maxQuizSum > 0);
      const quizWinnerNames = usersList.filter(u => quizWinners.includes(u.id)).map(u => u.full_name).join(', ');

      // 8. Combine everything into a dynamic list
      const calculatedAwards = [
        {
          key: 'rising_sadhaka',
          name: 'Rising Sadhaka',
          icon: RisingSadhaka,
          color: 'emerald',
          isEligible: risingWinners.includes(user?.id || ''),
          winnerNames: risingWinnerNames || 'None yet',
          bestValue: `${maxPoints} Points`,
          unlockedMsg: `Won by achieving the highest leaderboard score of ${maxPoints} points! 🏆`
        },
        {
          key: 'unbroken_flame',
          name: 'Unbroken Flame',
          icon: UnbrokenFlame,
          color: 'orange',
          isEligible: flameWinners.includes(user?.id || ''),
          winnerNames: flameWinnerNames || 'None yet',
          bestValue: `${maxStreak} Days`,
          unlockedMsg: `Won by maintaining the longest best streak of ${maxStreak} days! 🔥`
        },
        {
          key: 'brahma_muhurta',
          name: 'Active Entity',
          icon: BrahmaMuhurta,
          color: 'amber',
          isEligible: brahmaWinners.includes(user?.id || ''),
          winnerNames: brahmaWinnerNames || 'None yet',
          bestValue: `${maxBonusSum} Bonus Pts`,
          unlockedMsg: `Won by earning the highest cumulative admin bonus of ${maxBonusSum} points! 🌅`
        },
        {
          key: 'mahayogi_crown',
          name: 'Mahayogi Crown',
          icon: MahayogiCrown,
          color: 'indigo',
          isEligible: mahayogiWinners.includes(user?.id || ''),
          winnerNames: mahayogiWinnerNames || 'None yet',
          bestValue: `${maxSingleDayPoints} Points`,
          unlockedMsg: `Won by scoring the absolute highest single-day score of ${maxSingleDayPoints} points! 👑`
        },
        {
          key: 'jijnasu_scholar',
          name: 'Jijnasu Scholar',
          icon: JijnasuScholar,
          color: 'teal',
          isEligible: quizWinners.includes(user?.id || ''),
          winnerNames: quizWinnerNames || 'None yet',
          bestValue: `${maxQuizSum} Quiz Pts`,
          unlockedMsg: `Won by achieving the highest total quiz score of ${maxQuizSum} points! 🧠📖`
        }
      ];

      // Mark unlocked if:
      // a) Explicitly granted by Admin in database
      // b) Competition ended AND they are dynamically eligible
      const mappedList = STANDARD_AWARDS.map(standard => {
        const calc = calculatedAwards.find(c => c.key === standard.key)!;
        const dbRecord = explicitlyGranted.find(a => a.award_key === standard.key);
        const unlocked = !!dbRecord || (hasEnded && calc.isEligible);

        return {
          ...standard,
          ...calc,
          isUnlocked: unlocked,
          unlockedAt: dbRecord?.unlocked_at || (hasEnded ? endDate.toISOString() : null),
          customMessage: dbRecord?.custom_message || (unlocked ? calc.unlockedMsg : null),
          isAdminGranted: !!dbRecord,
          hasEnded,
          endDateStr
        };
      });

      setAwardListState(mappedList);

      // Trigger celebration if user has unlocked any awards
      const hasAnyUnlocked = mappedList.some(a => a.isUnlocked);
      if (hasAnyUnlocked) {
        triggerCelebration();
      }

    } catch (e) {
      console.error("Failed to fetch awards:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const triggerCelebration = () => {
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 }
    });
    playChime();
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
    } catch (e) {
      console.warn('Audio chime failed to play', e);
    }
  };

  const colorClasses: Record<string, { border: string; bg: string; text: string; shadow: string; badge: string }> = {
    emerald: {
      border: 'border-emerald-100',
      bg: 'bg-emerald-50/50',
      text: 'text-emerald-600',
      shadow: 'shadow-emerald-100/50',
      badge: 'bg-emerald-50 text-emerald-600'
    },
    orange: {
      border: 'border-orange-100',
      bg: 'bg-orange-50/50',
      text: 'text-orange-600',
      shadow: 'shadow-orange-100/50',
      badge: 'bg-orange-50 text-orange-600'
    },
    amber: {
      border: 'border-amber-100',
      bg: 'bg-amber-50/50',
      text: 'text-amber-600',
      shadow: 'shadow-amber-100/50',
      badge: 'bg-amber-50 text-amber-600'
    },
    indigo: {
      border: 'border-indigo-100',
      bg: 'bg-indigo-50/50',
      text: 'text-indigo-600',
      shadow: 'shadow-indigo-100/50',
      badge: 'bg-indigo-50 text-indigo-600'
    },
    teal: {
      border: 'border-teal-100',
      bg: 'bg-teal-50/50',
      text: 'text-teal-600',
      shadow: 'shadow-teal-100/50',
      badge: 'bg-teal-50 text-teal-600'
    }
  };

  if (isLoading) return <div className="p-20 text-center text-slate-400">Glimpsing into the hall of awards...</div>;

  return (
    <div className="p-4 md:p-10 max-w-6xl mx-auto">
      <div className="mb-12">
        <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">Divine Recognition</h1>
        <p className="text-slate-500 font-bold">Awards and milestones achieved on your journey</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {awardListState.map((award, i) => {
          const Icon = award.icon;
          const colorClass = colorClasses[award.color] || colorClasses.emerald;
          return (
            <motion.div
              key={award.key}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
              className={`
                relative bg-white p-8 rounded-[2.5rem] border-2 transition-all overflow-hidden group
                ${award.isUnlocked ? `${colorClass.border} shadow-xl ${colorClass.shadow}` : 'border-slate-100 opacity-90'}
              `}
            >
              {/* Blur locking visual background for locked items */}
              {!award.isUnlocked && (
                <div className="absolute inset-0 bg-slate-50/50 backdrop-blur-[0.5px] rounded-[2.5rem] pointer-events-none z-0" />
              )}

              {/* Absolute Award Rarity Label */}
              <div className="absolute top-6 right-6 flex items-center gap-1.5 z-10">
                <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${award.isUnlocked
                  ? colorClass.badge
                  : 'bg-slate-100 text-slate-400'
                  }`}>
                  {award.key === 'jijnasu_scholar' ? 'Locked' : award.isUnlocked ? 'Unlocked' : 'Locked 🔒'}
                </span>
              </div>

              <div className="w-24 h-24 mx-auto mb-6 relative z-10 transition-transform duration-300 group-hover:scale-105">
                <Icon />
              </div>

              <div className="text-center relative z-10">
                <h3 className={`text-xl font-black mb-2 ${award.isUnlocked ? 'text-slate-800' : 'text-slate-400'}`}>
                  {award.name}
                </h3>

                <p className="text-xs text-slate-500 leading-relaxed mb-6 px-2">
                  {award.defaultMessage}
                </p>

                {award.isUnlocked ? (
                  <div className="space-y-4">
                    <p className="text-sm font-bold text-slate-700 bg-slate-50 p-3 rounded-2xl border border-slate-100/50">
                      {award.customMessage || award.unlockedMsg}
                    </p>
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex items-center gap-2 text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-3.5 py-1.5 rounded-full">
                        <Calendar size={12} />
                        Unlocked {formatTimestamp(award.unlockedAt)}
                      </div>
                      {award.isAdminGranted && (
                        <div className="flex items-center gap-1 text-[10px] font-black text-amber-600 uppercase tracking-widest bg-amber-50 px-3.5 py-1.5 rounded-full">
                          <Sparkles size={12} fill="currentColor" />
                          Specially Awarded
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Lock details */}
                    {award.key === 'jijnasu_scholar' ? (
                      <p className="text-[10px] font-black text-teal-600 uppercase tracking-wider bg-teal-50 px-3.5 py-2 rounded-2xl inline-block">
                        📖 Releases in Future Update!
                      </p>
                    ) : (
                      <>
                        <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100 flex flex-col items-center justify-center">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Current Leader</p>
                          <p className="text-xs font-black text-slate-700 flex items-center gap-1">
                            👑 {award.winnerNames}
                          </p>
                          <span className="text-[10px] font-bold text-indigo-500 mt-1 bg-indigo-50/50 px-2 py-0.5 rounded-md">
                            {award.bestValue}
                          </span>
                        </div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-center gap-1">
                          🔒 Unlocks: {formatUnlockDate(award.endDateStr)}
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>

              {award.isUnlocked && (
                <motion.div
                  className={`absolute -top-2 -right-2 w-10 h-10 bg-white shadow-lg border border-${award.color}-100 rounded-full flex items-center justify-center text-indigo-600 z-20`}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', delay: 0.5 + i * 0.1 }}
                >
                  <Award size={20} />
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
