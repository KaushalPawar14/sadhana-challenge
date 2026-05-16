'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createBrowserClient } from '@supabase/ssr';
import { useAuthStore } from '@/store/authStore';
import { DailyLogModal } from '@/components/student/DailyLogModal';
import { UserProfileModal } from '@/components/student/UserProfileModal';
import { Flame, Trophy, Plus, CheckCircle2 } from 'lucide-react';

export default function LeaderboardPage() {
  const { user } = useAuthStore();
  const [users, setUsers] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [hasLoggedToday, setHasLoggedToday] = useState(false);

  // Stable client setup to prevent warnings and auth drops
  const [supabase] = useState(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ));

  useEffect(() => {
    fetchData();
    const subscription = subscribeToUsers();
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    // Fetch Settings
    const { data: appSettings } = await supabase.from('app_settings').select('*');
    const settingsMap = appSettings?.reduce((acc: any, curr: any) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    setSettings(settingsMap || {});

    // Fetch Users
    const { data: userData } = await supabase
      .from('users')
      .select('*')
      .order('total_points', { ascending: false });

    setUsers(userData || []);

    // Check if current user logged today
    if (user) {
      const today = new Date().toISOString().split('T')[0];
      const { data: log } = await supabase
        .from('activity_logs')
        .select('id')
        .eq('user_id', user.id)
        .eq('log_date', today)
        .maybeSingle();
      setHasLoggedToday(!!log);
    }

    setIsLoading(false);
  };

  const subscribeToUsers = () => {
    return supabase
      .channel('public:users')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
        fetchUsersOnly();
      })
      .subscribe();
  };

  const fetchUsersOnly = async () => {
    const { data: userData } = await supabase
      .from('users')
      .select('*')
      .order('total_points', { ascending: false });
    setUsers(userData || []);
  };

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      if (b.total_points !== a.total_points) return b.total_points - a.total_points;
      const dateA = a.last_log_date ? new Date(a.last_log_date).getTime() : Infinity;
      const dateB = b.last_log_date ? new Date(b.last_log_date).getTime() : Infinity;
      return dateA - dateB;
    });
  }, [users]);

  const countdown = useMemo(() => {
    if (!settings.challenge_start_date) return null;
    const start = new Date(settings.challenge_start_date);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 26 ? 26 : diffDays;
  }, [settings]);

  const currentUserRank = useMemo(() => {
    if (!user) return null;
    const index = sortedUsers.findIndex(u => u.id === user.id);
    return index !== -1 ? index + 1 : null;
  }, [sortedUsers, user]);

  const currentUserData = useMemo(() => {
    return sortedUsers.find(u => u.id === user?.id);
  }, [sortedUsers, user]);

  return (
    <div className="p-4 md:p-10">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">
            {settings.challenge_title || 'Sadhana Challenge'}
          </h1>
          <div className="flex items-center gap-3">
            <span className="px-4 py-1.5 bg-indigo-600 text-white rounded-full text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-100">
              Day {countdown || '1'} of 26
            </span>
            <span className="text-xs font-bold text-slate-400">
              Ends: {settings.challenge_end_date ? new Date(settings.challenge_end_date).toLocaleDateString() : '...'}
            </span>
          </div>
        </div>

        {/* Quick Stats Banner */}
        <div className="flex gap-4">
          <div className="bg-white p-4 rounded-[1.5rem] border border-slate-100 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600">
              <Flame size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-1">My Streak</p>
              <p className="text-lg font-black text-slate-800">{currentUserData?.streak_count || 0} Days</p>
            </div>
          </div>
          <div className="bg-white p-4 rounded-[1.5rem] border border-slate-100 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
              <Trophy size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-1">My Points</p>
              <p className="text-lg font-black text-slate-800">{currentUserData?.total_points?.toLocaleString() || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Leaderboard List */}
      <div className="space-y-4 pb-32">
        {isLoading ? (
          Array(6).fill(0).map((_, i) => (
            <div key={i} className="h-24 bg-white rounded-[2rem] border border-slate-100 animate-pulse" />
          ))
        ) : (
          <AnimatePresence mode="popLayout">
            {sortedUsers.map((u, index) => {
              const rank = index + 1;
              const isTop3 = rank <= 3;
              const isCurrentUser = u.id === user?.id;
              const isTied = index > 0 && u.total_points === sortedUsers[index - 1].total_points;

              const borderColors = {
                1: 'border-amber-400 shadow-amber-100',
                2: 'border-slate-300 shadow-slate-100',
                3: 'border-orange-400 shadow-orange-100',
              };

              return (
                <motion.div
                  layout
                  key={u.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={() => setSelectedUserId(u.id)}
                  className={`
                    group relative bg-white p-4 md:p-6 rounded-[2rem] border-2 transition-all cursor-pointer hover:shadow-xl
                    ${isCurrentUser ? 'border-indigo-500 shadow-indigo-100 z-10' : 'border-slate-50'}
                  `}
                >
                  <div className="flex items-center gap-4 md:gap-6">
                    <div className="flex flex-col items-center justify-center w-8">
                      <span className={`text-lg font-black ${isTop3 ? 'text-indigo-600' : 'text-slate-300'}`}>
                        {rank}
                      </span>
                      {isTied && <span className="text-[10px]" title="Tied Points">⚖️</span>}
                    </div>

                    <div className={`
                      relative w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center text-2xl border-4
                      ${isTop3 ? (borderColors as any)[rank] : 'border-slate-100'}
                    `}>
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                      ) : (
                        <div className="w-full h-full rounded-full bg-slate-50 flex items-center justify-center font-bold text-slate-400">
                          {u.full_name?.[0]}
                        </div>
                      )}
                      {isTop3 && (
                        <div className="absolute -top-1 -right-1 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-100">
                          <Trophy size={12} className={rank === 1 ? 'text-amber-500' : rank === 2 ? 'text-slate-400' : 'text-orange-600'} />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="font-black text-slate-800 truncate md:text-xl">
                        {u.full_name} {isCurrentUser && <span className="text-xs font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full ml-2">You</span>}
                      </h3>
                      <div className="flex items-center gap-3">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest truncate">{u.department}</p>
                        {u.streak_count > 0 && (
                          <span className="flex items-center gap-1 text-xs font-bold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full">
                            <Flame size={12} fill="currentColor" /> {u.streak_count}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-2xl font-black text-slate-900 tracking-tighter">
                        {u.total_points?.toLocaleString()}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Points</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* FIXED: Current User Pin shifted to the right side on desktop, stacked safely ABOVE the floating button */}
      {currentUserData && (
        <div className="fixed bottom-28 left-4 right-4 md:left-auto md:right-10 md:bottom-32 z-40 md:w-80">
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            className={`
              p-4 rounded-[2rem] border-2 bg-white/80 backdrop-blur-xl shadow-2xl flex items-center gap-4
              ${(currentUserRank || 99) <= 10 ? 'border-[#FF9933]/50 shadow-orange-100' : 'border-indigo-500/30'}
            `}
          >
            <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-black text-sm">
              #{currentUserRank}
            </div>
            <div className="flex-1">
              <p className="text-xs font-black text-slate-400 uppercase tracking-tighter">Your Progress</p>
              <p className="font-black text-slate-800 truncate">{currentUserData.full_name}</p>
            </div>
            <div className="text-right">
              <p className="font-black text-indigo-600">{currentUserData.total_points?.toLocaleString()}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase leading-none">Pts</p>
            </div>
          </motion.div>
        </div>
      )}

      {/* Floating Action Button (Always stays on bottom-right corner safely) */}
      {!hasLoggedToday ? (
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsLogModalOpen(true)}
          className="fixed bottom-6 right-4 md:bottom-10 md:right-10 z-[60] bg-[#FF9933] text-white px-8 py-5 rounded-[2rem] font-black text-lg shadow-2xl shadow-orange-200 flex items-center gap-3 group overflow-hidden animate-pulse-slow"
        >
          <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-12" />
          <Plus size={24} className="relative z-10" />
          <span className="relative z-10">Log Activity</span>
        </motion.button>
      ) : (
        <div className="fixed bottom-6 right-4 md:bottom-10 md:right-10 z-[60] bg-green-500 text-white px-6 py-4 rounded-[2rem] font-black shadow-xl flex items-center gap-2">
          <CheckCircle2 size={20} />
          <span>Logged ✓ — See you tomorrow!</span>
        </div>
      )}

      {/* Modals */}
      <DailyLogModal
        isOpen={isLogModalOpen}
        onClose={() => setIsLogModalOpen(false)}
        onSuccess={fetchData}
      />

      <AnimatePresence>
        {selectedUserId && (
          <UserProfileModal
            userId={selectedUserId}
            onClose={() => setSelectedUserId(null)}
          />
        )}
      </AnimatePresence>

      <style jsx global>{`
        @keyframes pulse-slow {
          0%, 100% { transform: scale(1); box-shadow: 0 20px 50px rgba(255, 153, 51, 0.3); }
          50% { transform: scale(1.02); box-shadow: 0 25px 60px rgba(255, 153, 51, 0.5); }
        }
        .animate-pulse-slow {
          animation: pulse-slow 3s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
}