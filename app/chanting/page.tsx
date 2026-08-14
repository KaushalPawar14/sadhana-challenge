'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createBrowserClient } from '@supabase/ssr';
import { useAuthStore } from '@/store/authStore';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { 
  Volume2, VolumeX, RotateCcw, AlertTriangle, 
  Sparkles, CheckCircle2, Flame, Award, Heart, HelpCircle, ShieldCheck
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { toast } from 'react-hot-toast';

export default function ChantingPage() {
  const { user } = useAuthStore();

  const [supabase] = useState(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ));

  const [beadCount, setBeadCount] = useState<number>(0);
  const [todayRounds, setTodayRounds] = useState<number>(0);
  const [totalRounds, setTotalRounds] = useState<number>(0);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [hapticsEnabled, setHapticsEnabled] = useState<boolean>(true);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);

  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // Sync state with backend and local storage on mount
  useEffect(() => {
    if (!user?.id) return;
    const todayStr = getTodayStr();
    const storageKey = `sadhana_chant_data_${user.id}`;
    const saved = localStorage.getItem(storageKey);

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.lastDate !== todayStr) {
          setTodayRounds(0);
          setTotalRounds(parsed.totalRounds || 0);
          setBeadCount(0);
        } else {
          setTodayRounds(parsed.todayRounds || 0);
          setTotalRounds(parsed.totalRounds || 0);
          setBeadCount(parsed.beadCount || 0);
        }
      } catch (err) {
        console.error('Error parsing chant counter data:', err);
      }
    }

    // Trigger background auto-sync & auto-fulfillment check with Supabase API
    fetch('/api/sync-chanting', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          if (data.todayRounds > 0) {
            setTodayRounds(prev => Math.max(prev, data.todayRounds));
          }
          if (data.autoFulfilledDates && data.autoFulfilledDates.length > 0) {
            toast.custom((t) => (
              <div className="bg-emerald-950 border border-emerald-500/40 text-emerald-200 p-4 rounded-2xl shadow-2xl flex items-center gap-3">
                <ShieldCheck className="text-emerald-400 flex-shrink-0" size={24} />
                <div className="text-xs">
                  <p className="font-bold text-white">Auto-Fulfillment Activated! 🎉</p>
                  <p className="text-emerald-300 mt-0.5">Your unsubmitted daily log for {data.autoFulfilledDates.join(', ')} was automatically fulfilled from your in-app chanting rounds!</p>
                </div>
              </div>
            ), { duration: 6000 });
          }
        }
      })
      .catch(err => console.error('Auto-sync failed:', err));
  }, [user]);

  // Persist counter state to localStorage and Supabase API
  const saveState = useCallback((newBead: number, newToday: number, newTotal: number) => {
    if (!user?.id) return;
    const todayStr = getTodayStr();
    const storageKey = `sadhana_chant_data_${user.id}`;
    localStorage.setItem(storageKey, JSON.stringify({
      beadCount: newBead,
      todayRounds: newToday,
      totalRounds: newTotal,
      lastDate: todayStr
    }));

    // Sync rounds with backend API for auto-fulfillment protection
    fetch('/api/sync-chanting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        logDate: todayStr,
        roundsChanted: newToday
      })
    }).catch(err => console.error('Failed to sync chanting with backend:', err));
  }, [user]);

  // Web Audio API synthesized sound generator
  const playSound = useCallback((type: 'bead' | 'completion') => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      if (type === 'bead') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5 note
        osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
      } else if (type === 'completion') {
        const freqs = [432, 864, 1296]; // Solfeggio sacred frequencies
        freqs.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, ctx.currentTime);
          const vol = 0.2 / (idx + 1);
          gain.gain.setValueAtTime(vol, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 2.5);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 2.5);
        });
      }
    } catch (e) {
      console.warn('Audio playback not allowed or failed:', e);
    }
  }, [soundEnabled]);

  // Trigger haptic vibration on mobile
  const triggerHaptic = useCallback(() => {
    if (hapticsEnabled && typeof window !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(25);
    }
  }, [hapticsEnabled]);

  // Handle single bead count increment
  const handleBeadTap = () => {
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 200);

    let nextBead = beadCount + 1;
    let nextToday = todayRounds;
    let nextTotal = totalRounds;

    if (nextBead >= 108) {
      // 108 Beads Completed -> 1 Round Finished!
      nextBead = 0;
      nextToday += 1;
      nextTotal += 1;

      setBeadCount(0);
      setTodayRounds(nextToday);
      setTotalRounds(nextTotal);

      playSound('completion');

      // Trigger Confetti Celebration
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 }
      });

      toast.success(
        `🪷 Haribol! Round ${nextToday} Completed Today!`,
        {
          duration: 4000,
          style: {
            borderRadius: '1.5rem',
            background: '#1e1b4b',
            color: '#fbbf24',
            fontWeight: 'bold'
          }
        }
      );
    } else {
      setBeadCount(nextBead);
      playSound('bead');
      triggerHaptic();
    }

    saveState(nextBead, nextToday, nextTotal);
  };

  // Keyboard shortcut listener (Spacebar or Enter to tap)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'BUTTON')) {
          return;
        }
        e.preventDefault();
        handleBeadTap();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [beadCount, todayRounds, totalRounds, saveState, playSound, triggerHaptic]);

  const handleResetCurrentBeads = () => {
    if (beadCount === 0) return;
    if (confirm("Reset current bead count to 0 for this round?")) {
      setBeadCount(0);
      saveState(0, todayRounds, totalRounds);
      toast.success("Bead count reset to 0");
    }
  };

  const progressPercentage = (beadCount / 108) * 100;
  const strokeDashoffset = 565.48 - (565.48 * progressPercentage) / 100;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto min-h-screen bg-slate-50/30">
      
      {/* Top Header & Theme Switcher */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>📿</span> Digital Japa Counter
          </h1>
          <p className="text-xs md:text-sm font-semibold text-slate-500 mt-1">
            Focus your mind and complete your daily rounds
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-3 rounded-2xl border transition-all cursor-pointer ${
              soundEnabled 
                ? 'bg-amber-50 text-amber-700 border-amber-200 shadow-sm' 
                : 'bg-slate-100 text-slate-400 border-slate-200'
            }`}
            title={soundEnabled ? "Mute sound" : "Enable sound"}
          >
            {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
          <ThemeSwitcher />
        </div>
      </div>

      {/* Mandatory Highlight & Fail-Safe Protection Banner */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 border-2 border-amber-400/40 rounded-3xl p-4 md:p-5 shadow-sm mb-8 relative overflow-hidden"
      >
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 bg-amber-500 text-white rounded-2xl flex items-center justify-center flex-shrink-0 shadow-md shadow-amber-500/20 font-black text-lg">
            📜
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xs font-black uppercase tracking-wider text-amber-900 mb-1 flex items-center gap-2">
              <span>Chanting & Auto-Fulfillment Protection</span>
              <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[9px] font-extrabold flex items-center gap-1">
                <ShieldCheck size={10} /> Fail-Safe Active
              </span>
            </h3>
            <p className="text-xs md:text-sm font-bold text-slate-700 leading-relaxed">
              We recommend manually logging your activity in the <strong className="text-indigo-600">Leaderboard &gt; Log Activity</strong> tab. 
              However, if you chant here but <strong className="text-amber-900 underline decoration-amber-400 underline-offset-2">forget to manually submit your report</strong> for the day, 
              your in-app chanted rounds will <strong className="text-emerald-700 font-extrabold">automatically auto-fulfill your report</strong> at the end of the day so your streak is maintained and your Streak Shield is saved!
            </p>
          </div>
        </div>
      </motion.div>

      {/* Main Counter & Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        
        {/* Left / Center Column: Interactive Mala Counter */}
        <div className="lg:col-span-7 flex flex-col items-center">
          <div className="bg-white rounded-[3rem] p-6 md:p-10 border border-slate-100 shadow-xl w-full flex flex-col items-center relative overflow-hidden text-center">
            
            {/* Spiritual background glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />

            {/* Instruction */}
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">
              Tap the Lotus or press <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-600 text-[10px] font-extrabold">Spacebar</kbd>
            </p>

            {/* Circular Progress Ring Counter */}
            <div className="relative w-64 h-64 md:w-72 md:h-72 flex items-center justify-center my-4">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 200 200">
                <circle
                  cx="100"
                  cy="100"
                  r="90"
                  className="stroke-slate-100"
                  strokeWidth="12"
                  fill="transparent"
                />
                <circle
                  cx="100"
                  cy="100"
                  r="90"
                  className="stroke-amber-500 transition-all duration-200 ease-out"
                  strokeWidth="12"
                  strokeDasharray="565.48"
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="transparent"
                />
              </svg>

              {/* Main Interactive Tap Button */}
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.94 }}
                onClick={handleBeadTap}
                className={`
                  absolute inset-4 md:inset-5 rounded-full bg-gradient-to-tr from-amber-500 via-orange-400 to-yellow-400 
                  text-white shadow-2xl shadow-orange-500/30 flex flex-col items-center justify-center 
                  cursor-pointer transition-shadow select-none group border-4 border-amber-200/50
                  ${isAnimating ? 'ring-8 ring-amber-300/40' : ''}
                `}
              >
                <motion.span 
                  animate={{ scale: isAnimating ? [1, 1.25, 1] : 1 }}
                  className="text-4xl md:text-5xl mb-1 filter drop-shadow-md"
                >
                  🪷
                </motion.span>
                <div className="text-4xl md:text-5xl font-black tracking-tight text-white drop-shadow-sm">
                  {beadCount}
                </div>
                <div className="text-[11px] font-black uppercase tracking-widest text-amber-100 mt-1 opacity-90">
                  / 108 Beads
                </div>
              </motion.button>
            </div>

            {/* Quick Controls */}
            <div className="flex items-center gap-4 mt-6">
              <button
                onClick={handleResetCurrentBeads}
                disabled={beadCount === 0}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-500 disabled:opacity-40 rounded-xl text-xs font-bold transition-all border border-slate-200 cursor-pointer"
              >
                <RotateCcw size={14} /> Reset Bead Count
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Statistics & Info Cards */}
        <div className="lg:col-span-5 space-y-5">
          
          {/* Today's Chanted Rounds Card */}
          <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm relative overflow-hidden flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-tr from-amber-500 to-orange-400 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-amber-500/20 text-2xl font-black">
                🔥
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Today's Chanted Rounds</p>
                <p className="text-3xl font-black text-slate-900">{todayRounds} <span className="text-sm font-bold text-slate-400">rounds</span></p>
              </div>
            </div>
            <div className="text-right">
              <span className="px-3 py-1 bg-amber-50 border border-amber-100 text-amber-700 rounded-full text-[10px] font-extrabold uppercase tracking-wider">
                Resets Daily 🌅
              </span>
            </div>
          </div>

          {/* Total Chanted Rounds Card */}
          <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm relative overflow-hidden flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 text-2xl font-black">
                📿
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Chanted Rounds</p>
                <p className="text-3xl font-black text-slate-900">{totalRounds} <span className="text-sm font-bold text-slate-400">rounds</span></p>
              </div>
            </div>
            <div className="text-right">
              <span className="px-3 py-1 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-full text-[10px] font-extrabold uppercase tracking-wider">
                All-Time App Japa 🌟
              </span>
            </div>
          </div>

          {/* How It Works Guidance Box */}
          <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
            <h4 className="text-sm font-black uppercase tracking-wider text-amber-400 mb-3 flex items-center gap-2">
              <span>✨ Fail-Safe Japa Protection</span>
            </h4>
            <ul className="space-y-2.5 text-xs text-slate-300 font-semibold leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">•</span>
                <span>Each tap on the lotus increments <strong>1 bead</strong> up to 108.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">•</span>
                <span>Upon reaching 108, the round count automatically increments and saves to your account.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">•</span>
                <span>If you forget to manually log your report, your chanted rounds here will <strong>auto-fulfill your report</strong> before the day ends so your streak and shield are safe!</span>
              </li>
            </ul>
          </div>

        </div>

      </div>
    </div>
  );
}
