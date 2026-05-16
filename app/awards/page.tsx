'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import { 
  MahayogiCrown, UnbrokenFlame, JijnasuScholar, 
  BrahmaMuhurta, RisingSadhaka, FloatingLotus 
} from '@/components/student/AwardIcons';
import { Lock, Award, Calendar, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';

const STANDARD_AWARDS = [
  {
    key: 'rising_sadhaka',
    name: 'Rising Sadhaka',
    icon: RisingSadhaka,
    color: 'emerald',
    defaultMessage: 'Every great journey begins with a single step. Welcome, Sadhaka! 🌱'
  },
  {
    key: 'unbroken_flame',
    name: 'Unbroken Flame',
    icon: UnbrokenFlame,
    color: 'orange',
    defaultMessage: "Your flame burns without interruption — a true sadhaka's spirit! 🔥"
  },
  {
    key: 'jijnasu_scholar',
    name: 'Jijnasu Scholar',
    icon: JijnasuScholar,
    color: 'teal',
    defaultMessage: 'The spirit of inquiry is alive in you. A true student of wisdom. 📖'
  },
  {
    key: 'mahayogi_crown',
    name: 'Mahayogi Crown',
    icon: MahayogiCrown,
    color: 'amber',
    defaultMessage: 'You have ascended to the realm of the Mahayogi. Your dedication is divine! 👑'
  },
  {
    key: 'brahma_muhurta',
    name: 'Brahma Muhurta',
    icon: BrahmaMuhurta,
    color: 'amber',
    defaultMessage: 'You have conquered sleep and embraced the sacred hour of creation. 🌅'
  }
];

export default function AwardsPage() {
  const { user } = useAuthStore();
  const [unlockedAwards, setUnlockedAwards] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchAwards();
    }
  }, [user]);

  const fetchAwards = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from('awards')
      .select('*')
      .eq('user_id', user?.id);
    
    const awards = data || [];
    setUnlockedAwards(awards);

    // Check for fresh unlocks (last 5 seconds)
    const freshUnlock = awards.find(a => {
      const unlockTime = new Date(a.unlocked_at).getTime();
      const now = new Date().getTime();
      return (now - unlockTime) < 5000;
    });

    if (freshUnlock) {
      triggerCelebration();
    }
    
    setIsLoading(false);
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

  const awardList = useMemo(() => {
    return STANDARD_AWARDS.map(standard => {
      const unlocked = unlockedAwards.find(a => a.award_key === standard.key);
      return {
        ...standard,
        isUnlocked: !!unlocked,
        unlockedAt: unlocked?.unlocked_at,
        customMessage: unlocked?.custom_message,
        isAdminGranted: unlocked?.custom_message?.includes('✦') // Simple check
      };
    });
  }, [unlockedAwards]);

  if (isLoading) return <div className="p-20 text-center text-slate-400">Glimpsing into the hall of awards...</div>;

  return (
    <div className="p-4 md:p-10 max-w-6xl mx-auto">
      <div className="mb-12">
        <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">Divine Recognition</h1>
        <p className="text-slate-500 font-bold">Awards and milestones achieved on your journey</p>
      </div>

      {unlockedAwards.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[3rem] p-12 md:p-20 text-center border border-slate-100 shadow-2xl shadow-indigo-100"
        >
          <div className="flex justify-center mb-10">
            <FloatingLotus />
          </div>
          <h2 className="text-2xl font-black text-slate-800 mb-4">Your spiritual journey has just begun</h2>
          <p className="text-slate-500 max-w-md mx-auto leading-relaxed mb-12">
            Complete your daily practices to earn divine recognition and unlock sacred milestones. 🙏
          </p>
          
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6 max-w-4xl mx-auto">
            {STANDARD_AWARDS.map((award, i) => (
              <div key={award.key} className="flex flex-col items-center opacity-30 grayscale">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-3">
                  <Lock size={24} />
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{award.name}</p>
              </div>
            ))}
          </div>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {awardList.map((award, i) => {
            const Icon = award.icon;
            return (
              <motion.div
                key={award.key}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.1 }}
                className={`
                  relative bg-white p-8 rounded-[2.5rem] border-2 transition-all
                  ${award.isUnlocked ? `border-${award.color}-100 shadow-xl shadow-${award.color}-50` : 'border-slate-50 opacity-60'}
                `}
              >
                {!award.isUnlocked && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/40 backdrop-blur-[2px] rounded-[2.5rem]">
                    <Lock size={32} className="text-slate-300 mb-2" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Locked</p>
                  </div>
                )}

                <div className={`w-20 h-20 mx-auto mb-6 ${award.isUnlocked ? 'grayscale-0' : 'grayscale'}`}>
                  <Icon />
                </div>

                <div className="text-center">
                  <h3 className={`text-xl font-black mb-2 ${award.isUnlocked ? 'text-slate-800' : 'text-slate-400'}`}>
                    {award.name}
                  </h3>
                  
                  {award.isUnlocked ? (
                    <>
                      <p className="text-sm text-slate-600 leading-relaxed mb-6">
                        {award.customMessage || award.defaultMessage}
                      </p>
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex items-center gap-2 text-[10px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 px-3 py-1 rounded-full">
                          <Calendar size={12} />
                          Unlocked {new Date(award.unlockedAt).toLocaleDateString()}
                        </div>
                        {award.isAdminGranted && (
                          <div className="flex items-center gap-1 text-[10px] font-black text-amber-600 uppercase tracking-widest bg-amber-50 px-3 py-1 rounded-full">
                            <Sparkles size={12} fill="currentColor" />
                            Specially Awarded
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">
                      Keep practicing to unlock
                    </p>
                  )}
                </div>
                
                {award.isUnlocked && (
                  <motion.div 
                    className={`absolute -top-2 -right-2 w-10 h-10 bg-white shadow-lg border border-${award.color}-100 rounded-full flex items-center justify-center text-indigo-600`}
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
      )}
    </div>
  );
}
