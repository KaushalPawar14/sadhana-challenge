'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createBrowserClient } from '@supabase/ssr';
import { useAuthStore } from '@/store/authStore';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { useActiveCompetition } from '@/hooks/useActiveCompetition';
import { istToday, formatLong } from '@/lib/ist';
import { buildRulesText, includesChanting } from '@/lib/competition';
import Link from 'next/link';
import { 
  Volume2, VolumeX, RotateCcw, AlertTriangle, 
  Sparkles, CheckCircle2, Flame, Award, Heart, HelpCircle, ShieldCheck
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { toast } from 'react-hot-toast';

export default function ChantingPage() {
  const { user } = useAuthStore();
  const { data: activeData, loading: activeLoading, competition } = useActiveCompetition();
  // the counter only syncs while the running competition includes chanting
  const chantingEnabled = !!competition && includesChanting(competition.type);

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

  const [isInfoModalOpen, setIsInfoModalOpen] = useState<boolean>(false);

  // day boundaries are IST everywhere (same rule as the database)
  const getTodayStr = () => istToday();

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

    // Load today's counter from the server (it only PRE-FILLS the daily log form; it never creates a log or points)
    fetch('/api/sync-chanting', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          if (data.todayRounds > 0) {
            setTodayRounds(prev => Math.max(prev, data.todayRounds));
          }
        }
      })
      .catch(err => console.error('Auto-sync failed:', err));
  }, [user]);

  // Persist counter state to localStorage and Supabase API
  const saveState = useCallback((newBead: number, newToday: number, newTotal: number, syncServer = true) => {
    if (!user?.id) return;
    const todayStr = getTodayStr();
    const storageKey = `sadhana_chant_data_${user.id}`;
    localStorage.setItem(storageKey, JSON.stringify({
      beadCount: newBead,
      todayRounds: newToday,
      totalRounds: newTotal,
      lastDate: todayStr
    }));

    // Sync rounds with the backend (the server keeps the counter so the daily log form can pre-fill it)
    // only a completed round changes what the server needs to know
    if (!chantingEnabled || !syncServer) return;
    fetch('/api/sync-chanting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roundsChanted: newToday })
    }).catch(err => console.error('Failed to sync chanting with backend:', err));
  }, [user, chantingEnabled]);

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
    if (!activeLoading && !chantingEnabled) return; // counter is disabled outside a chanting competition
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

    saveState(nextBead, nextToday, nextTotal, nextToday !== todayRounds);
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
  }, [beadCount, todayRounds, totalRounds, saveState, playSound, triggerHaptic, chantingEnabled, activeLoading]);

  const handleResetCurrentBeads = () => {
    if (beadCount === 0) return;
    if (confirm("Reset current bead count to 0 for this round?")) {
      setBeadCount(0);
      saveState(0, todayRounds, totalRounds, false);
      toast.success("Bead count reset to 0");
    }
  };

  const progressPercentage = (beadCount / 108) * 100;
  const strokeDashoffset = 565.48 - (565.48 * progressPercentage) / 100;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto min-h-screen bg-slate-50/30">
      
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>📿</span> Digital Japa Counter
          </h1>
          <p className="text-xs md:text-sm font-semibold text-slate-500 mt-1">
            Focus your mind and complete your daily rounds
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setIsInfoModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 border border-amber-400/40 text-xs font-extrabold transition-all cursor-pointer shadow-sm active:scale-95"
          >
            <ShieldCheck className="text-amber-600 flex-shrink-0" size={16} />
            <span>Rules & Protection</span>
            <HelpCircle className="text-amber-500" size={14} />
          </button>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2.5 rounded-2xl border transition-all cursor-pointer ${
              soundEnabled 
                ? 'bg-amber-50 text-amber-700 border-amber-200 shadow-sm' 
                : 'bg-slate-100 text-slate-400 border-slate-200'
            }`}
            title={soundEnabled ? "Mute sound" : "Enable sound"}
          >
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>

          <ThemeSwitcher />
        </div>
      </div>

      {!activeLoading && !chantingEnabled && (
        <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-5 text-sm font-bold">
          {competition
            ? <>Chanting is not part of the current competition (<strong>{competition.title}</strong>). The counter is paused.</>
            : activeData?.next
              ? <>No competition is running. The next one starts on <strong>{formatLong(activeData.next.start_date)}</strong>.</>
              : <>No competition is running right now. The counter is paused.</>}
          {competition && !chantingEnabled && <Link href="/books" className="ml-2 underline">Go to Books</Link>}
        </div>
      )}

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
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Today&apos;s Chanted Rounds</p>
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
              <span>✨ Digital Japa Counter</span>
            </h4>
            <ul className="space-y-2.5 text-xs text-slate-300 font-semibold leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">•</span>
                <span>Each tap on the lotus increments <strong>1 bead</strong> up to 108.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">•</span>
                <span>Upon reaching 108, the round count automatically increments and is remembered for your daily log.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">•</span>
                <span>This counter only <strong>helps you count</strong>. Your score comes from the daily log you submit (Leaderboard → Log Activity), where today&apos;s counted rounds are pre-filled for you.</span>
              </li>
            </ul>
          </div>

        </div>

      </div>

      {/* Rules & Daily Log Dialog Modal */}
      <AnimatePresence>
        {isInfoModalOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsInfoModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-white rounded-[2.5rem] p-6 md:p-8 border border-slate-100 shadow-2xl z-10 overflow-hidden text-left"
            >
              <div className="absolute -top-12 -left-12 w-32 h-32 bg-amber-400/10 rounded-full blur-2xl pointer-events-none" />
              
              <div className="flex items-center justify-between mb-4 relative z-10">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 bg-amber-500 text-white rounded-xl flex items-center justify-center font-black text-base shadow-md shadow-amber-500/20">
                    📜
                  </div>
                  <div>
                    <h2 className="text-base font-black text-slate-900 tracking-tight">
                      Japa Counter & Daily Log
                    </h2>
                    <span className="inline-flex items-center gap-1 text-[9px] font-extrabold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/60">
                      <ShieldCheck size={10} /> Pre-fills your log
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setIsInfoModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-black text-slate-400 hover:text-slate-600 transition-colors border border-slate-200 cursor-pointer text-xs"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3.5 text-xs text-slate-600 font-semibold leading-relaxed relative z-10">
                <p>
                  This <strong>Digital Japa Counter</strong> helps you chant your daily rounds seamlessly within the web application.
                </p>
                <div className="bg-amber-50/70 border border-amber-200/70 p-4 rounded-2xl space-y-2">
                  <h4 className="text-[11px] font-black text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                    <span>⚡ How the counter relates to your log</span>
                  </h4>
                  <p className="text-[11px] text-slate-700 leading-snug">
                    The leaderboard is fed <strong>only</strong> by the daily log you submit in <strong className="text-indigo-600">Leaderboard &gt; Log Activity</strong>.
                  </p>
                  <p className="text-[11px] text-slate-700 leading-snug">
                    The rounds you count here are remembered and <strong className="text-emerald-700 font-extrabold">pre-filled</strong> in that form, but they never create a log or points by themselves.
                  </p>
                </div>
                {competition && includesChanting(competition.type) && buildRulesText(competition).filter((x) => x.heading === 'Chanting' || x.heading === 'Schedule').map((sec) => (
                  <div key={sec.heading} className="bg-indigo-50/60 border border-indigo-100/70 p-4 rounded-2xl space-y-1.5">
                    <h4 className="text-[11px] font-black text-indigo-800 uppercase tracking-wider">{sec.heading} rules · {competition.title}</h4>
                    <ul className="text-[11px] text-slate-700 leading-snug space-y-1">
                      {sec.items.map((it, i) => <li key={i}>• {it}</li>)}
                    </ul>
                  </div>
                ))}
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/70 text-[11px] text-slate-500">
                  💡 <strong>Remember:</strong> submit your daily log every day to keep your streak. A day without a submitted log breaks it (a Streak Shield can bridge one missed day).
                </div>
              </div>

              <div className="mt-6 flex justify-end relative z-10">
                <button
                  onClick={() => setIsInfoModalOpen(false)}
                  className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-2xl text-xs font-black shadow-lg shadow-orange-500/20 transition-all cursor-pointer"
                >
                  Got It!
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
