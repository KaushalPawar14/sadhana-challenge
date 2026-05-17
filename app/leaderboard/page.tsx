'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createBrowserClient } from '@supabase/ssr';
import { useAuthStore } from '@/store/authStore';
import { DailyLogModal } from '@/components/student/DailyLogModal';
import { UserProfileModal } from '@/components/student/UserProfileModal';
import { Flame, Trophy, Plus, CheckCircle2, ChevronRight } from 'lucide-react';

export default function LeaderboardPage() {
  const { user } = useAuthStore();
  const [users, setUsers] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [hasLoggedToday, setHasLoggedToday] = useState(false);
  const [hasUnloggedDays, setHasUnloggedDays] = useState(false);
  const [liveActivities, setLiveActivities] = useState<any[]>([]);
  const [bonusEvents, setBonusEvents] = useState<any[]>([]);

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

    // Fetch Latest Live Activity Logs from activity_logs table (direct database fetch)
    const { data: latestLogs } = await supabase
      .from('activity_logs')
      .select(`
        id,
        log_date,
        chanting_rounds,
        reading_minutes,
        points_earned,
        submitted_at,
        users (
          full_name,
          avatar_url,
          department,
          streak_count
        )
      `)
      .order('submitted_at', { ascending: false })
      .limit(10);
    setLiveActivities(latestLogs || []);

    // Fetch Latest Bonus Points
    const { data: latestBonus } = await supabase
      .from('bonus_points')
      .select(`
        id,
        points,
        title,
        created_at,
        users (
          full_name,
          avatar_url,
          department,
          streak_count
        )
      `)
      .order('created_at', { ascending: false })
      .limit(10);
    setBonusEvents(latestBonus || []);

    // Check if current user logged today and if they have any unlogged past/present days
    if (user) {
      const today = new Date().toISOString().split('T')[0];
      const { data: userLogs } = await supabase
        .from('activity_logs')
        .select('log_date')
        .eq('user_id', user.id);
      
      const loggedDates = userLogs?.map(l => l.log_date) || [];
      setHasLoggedToday(loggedDates.includes(today));

      if (settingsMap?.challenge_start_date) {
        const [sYear, sMonth, sDay] = settingsMap.challenge_start_date.split('-').map(Number);
        const start = new Date(sYear, sMonth - 1, sDay);
        start.setHours(0, 0, 0, 0);

        const todayObj = new Date();
        todayObj.setHours(0, 0, 0, 0);

        let hasMissing = false;
        let current = new Date(start);
        while (current <= todayObj) {
          const yStr = current.getFullYear();
          const mStr = String(current.getMonth() + 1).padStart(2, '0');
          const dStr = String(current.getDate()).padStart(2, '0');
          const dateStr = `${yStr}-${mStr}-${dStr}`;

          if (!loggedDates.includes(dateStr)) {
            hasMissing = true;
            break;
          }
          current.setDate(current.getDate() + 1);
        }
        setHasUnloggedDays(hasMissing);
      } else {
        setHasUnloggedDays(false);
      }
    }

    setIsLoading(false);
  };

  const subscribeToUsers = () => {
    return supabase
      .channel('public:leaderboard-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
        fetchData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bonus_points' }, () => {
        fetchData();
      })
      .subscribe();
  };

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      if (b.total_points !== a.total_points) return b.total_points - a.total_points;
      const dateA = a.last_log_date ? new Date(a.last_log_date).getTime() : Infinity;
      const dateB = b.last_log_date ? new Date(b.last_log_date).getTime() : Infinity;
      return dateA - dateB;
    });
  }, [users]);

  const parseLocalDate = (dateStr: string) => {
    if (!dateStr) return new Date();
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const formatLocalDate = (dateStr: string) => {
    if (!dateStr) return '...';
    const [year, month, day] = dateStr.split('-').map(Number);
    const dStr = String(day).padStart(2, '0');
    const mStr = String(month).padStart(2, '0');
    return `${dStr}-${mStr}-${year}`;
  };

  const totalChallengeDays = useMemo(() => {
    if (!settings.challenge_start_date || !settings.challenge_end_date) return 26;
    const start = parseLocalDate(settings.challenge_start_date);
    const end = parseLocalDate(settings.challenge_end_date);
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }, [settings]);

  const currentChallengeDay = useMemo(() => {
    if (!settings.challenge_start_date || !settings.challenge_end_date) return 1;
    const start = parseLocalDate(settings.challenge_start_date);
    start.setHours(0, 0, 0, 0);
    const end = parseLocalDate(settings.challenge_end_date);
    end.setHours(23, 59, 59, 999);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (today < start) return 0;
    if (today > end) return totalChallengeDays;
    return Math.round((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }, [settings, totalChallengeDays]);

  const currentUserRank = useMemo(() => {
    if (!user) return null;
    const index = sortedUsers.findIndex(u => u.id === user.id);
    return index !== -1 ? index + 1 : null;
  }, [sortedUsers, user]);

  const currentUserData = useMemo(() => {
    return sortedUsers.find(u => u.id === user?.id);
  }, [sortedUsers, user]);

  const formatRelativeTime = (timestamp: string) => {
    if (!timestamp) return 'Just now';
    const now = new Date();
    const sub = new Date(timestamp);
    const diffMs = now.getTime() - sub.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffMins < 1) return 'Just now ⚡';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    const d = String(sub.getDate()).padStart(2, '0');
    const m = String(sub.getMonth() + 1).padStart(2, '0');
    const y = sub.getFullYear();
    return `${d}-${m}-${y}`;
  };

  const recentActivities = useMemo(() => {
    const events: any[] = [];

    // 1. Add precise Log events from fetched database logs
    liveActivities.forEach((act) => {
      const u = act.users;
      if (!u) return;
      events.push({
        id: `log-${act.id}`,
        user: u,
        type: 'log',
        title: u.full_name,
        message: `completed daily Sadhana: chanted ${act.chanting_rounds} rounds and read for ${act.reading_minutes} mins!`,
        detail: `+${act.points_earned} Points`,
        timestamp: new Date(act.submitted_at || act.log_date).getTime(),
        timeLabel: formatRelativeTime(act.submitted_at)
      });
    });

    // 2. Add Streak Spotlights from users list
    users.forEach((u) => {
      if (u.streak_count >= 3) {
        events.push({
          id: `streak-${u.id}`,
          user: u,
          type: 'streak',
          title: u.full_name,
          message: 'is on fire with a consistent active streak!',
          detail: `${u.streak_count} Days Active 🔥`,
          timestamp: new Date(u.last_log_date || u.created_at).getTime() + 500,
          timeLabel: 'On Fire'
        });
      }

      // 3. Add Points milestones from users list
      if (u.total_points >= 100) {
        events.push({
          id: `milestone-${u.id}`,
          user: u,
          type: 'milestone',
          title: u.full_name,
          message: 'crossed a major points milestone!',
          detail: `${u.total_points.toLocaleString()} Points 🏆`,
          timestamp: new Date(u.created_at).getTime(),
          timeLabel: 'Milestone'
        });
      }
    });

    // 4. Add Admin-Granted Bonus events from fetched database logs
    bonusEvents.forEach((b) => {
      const u = b.users;
      if (!u) return;
      events.push({
        id: `bonus-${b.id}`,
        user: u,
        type: 'bonus',
        title: u.full_name,
        message: `was awarded bonus points by the Admin: "${b.title || 'Exceptional Devotion'}" 🌟`,
        detail: `+${b.points} Points`,
        timestamp: new Date(b.created_at).getTime(),
        timeLabel: formatRelativeTime(b.created_at)
      });
    });

    // Sort combined events descending by timestamp
    return events.sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);
  }, [liveActivities, users, bonusEvents]);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto min-h-screen bg-slate-50/30">
      {/* Header and Stats Block */}
      <div className="bg-white rounded-3xl p-5 md:p-6 border border-slate-100 shadow-sm mb-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight mb-2">
            {settings.challenge_title || 'Sadhana Challenge'}
          </h1>
          <div className="flex items-center gap-3">
            <span className="px-3 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-full text-xs font-bold tracking-wide">
              Day {currentChallengeDay} of {totalChallengeDays}
            </span>
            <span className="text-xs font-semibold text-slate-400">
              Ends: {formatLocalDate(settings.challenge_end_date)}
            </span>
          </div>
        </div>

        {/* Quick Stats Banner */}
        <div className="flex flex-wrap md:flex-nowrap gap-3 w-full md:w-auto">
          <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-2xl flex items-center gap-3 flex-1 md:flex-initial min-w-[120px] transition-all hover:shadow-sm">
            <div className="w-9 h-9 bg-orange-100/70 rounded-xl flex items-center justify-center text-orange-600 shadow-sm">
              <Flame size={18} fill="currentColor" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-1">Streak</p>
              <p className="text-base font-black text-slate-800">{currentUserData?.streak_count || 0} Days</p>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-2xl flex items-center gap-3 flex-1 md:flex-initial min-w-[120px] transition-all hover:shadow-sm">
            <div className="w-9 h-9 bg-indigo-100/70 rounded-xl flex items-center justify-center text-indigo-600 shadow-sm">
              <Trophy size={18} fill="currentColor" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-1">Points</p>
              <p className="text-base font-black text-slate-800">{currentUserData?.total_points?.toLocaleString() || 0}</p>
            </div>
          </div>

          {/* Action Log Button in Header card */}
          {hasUnloggedDays ? (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsLogModalOpen(true)}
              className="bg-orange-500 hover:bg-orange-600 text-white p-3.5 rounded-2xl flex items-center justify-center gap-2 flex-1 md:flex-initial min-w-[130px] shadow-md shadow-orange-500/10 border border-orange-400/20 transition-all font-bold text-xs md:text-sm cursor-pointer whitespace-nowrap"
            >
              <Plus size={16} />
              <span>{!hasLoggedToday ? 'Log Activity' : 'Log Past Days ⚠️'}</span>
            </motion.button>
          ) : (
            <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 p-3.5 rounded-2xl flex items-center justify-center gap-1.5 flex-1 md:flex-initial min-w-[130px] font-bold text-[10px] md:text-xs tracking-tight text-center leading-tight">
              <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
              <span>All Logs Filled ✓</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Grid Layout for Leaderboard + Live Feed Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Leaderboard List */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-3">
          <div className="flex items-center gap-2 mb-2 px-1">
            <span className="text-lg">🏆</span>
            <h2 className="text-lg font-black text-slate-800 tracking-tight">Leaderboard Standings</h2>
          </div>
          
          {isLoading ? (
            <div className="space-y-3">
              {Array(8).fill(0).map((_, i) => (
                <div key={i} className="h-16 bg-white rounded-2xl border border-slate-100 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {sortedUsers.map((u, index) => {
                  const rank = index + 1;
                  const isCurrentUser = u.id === user?.id;
                  const isTop3 = rank <= 3;

                  // Curated harmonious styles for top three ranks
                  const cardStyle = rank === 1
                    ? 'bg-gradient-to-r from-amber-50/40 via-white to-amber-50/20 border-amber-300 shadow-sm shadow-amber-50/50'
                    : rank === 2
                      ? 'bg-gradient-to-r from-slate-50/50 via-white to-slate-50/30 border-slate-300 shadow-sm'
                      : rank === 3
                        ? 'bg-gradient-to-r from-orange-50/20 via-white to-orange-50/10 border-orange-300 shadow-sm'
                        : 'bg-white border-slate-100';

                  return (
                    <motion.div
                      layout
                      key={u.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      onClick={() => setSelectedUserId(u.id)}
                      className={`
                        group relative p-3 md:p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer hover:shadow-md hover:-translate-y-0.5
                        ${cardStyle}
                        ${isCurrentUser ? 'ring-2 ring-indigo-500/40 ring-offset-1 z-10' : ''}
                      `}
                    >
                      <div className="flex items-center gap-3.5">
                        {/* Rank Indicator Pill */}
                        <div className={`
                          flex items-center justify-center w-8 h-8 rounded-xl font-black text-xs md:text-sm
                          ${rank === 1
                            ? 'bg-amber-100 text-amber-800'
                            : rank === 2
                              ? 'bg-slate-200/80 text-slate-800'
                              : rank === 3
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-slate-50 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors'}
                        `}>
                          {rank === 1 ? '👑' : `#${rank}`}
                        </div>

                        {/* Avatar */}
                        <div className={`
                          relative w-10 h-10 rounded-full flex items-center justify-center border bg-slate-50 overflow-hidden shadow-inner flex-shrink-0
                          ${rank === 1
                            ? 'border-amber-400'
                            : rank === 2
                              ? 'border-slate-300'
                              : rank === 3
                                ? 'border-orange-400'
                                : 'border-slate-200/60'}
                        `}>
                          {u.avatar_url ? (
                            <img src={u.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                          ) : (
                            <div className="w-full h-full rounded-full bg-slate-50 flex items-center justify-center font-bold text-slate-400 text-sm">
                              {u.full_name?.[0]}
                            </div>
                          )}
                          {isTop3 && (
                            <div className={`
                              absolute -top-0.5 -right-0.5 w-4.5 h-4.5 rounded-full flex items-center justify-center shadow-sm border text-[9px] bg-white
                              ${rank === 1 ? 'text-amber-500 border-amber-200' : rank === 2 ? 'text-slate-400 border-slate-200' : 'text-orange-600 border-orange-200'}
                            `}>
                              <Trophy size={9} fill="currentColor" />
                            </div>
                          )}
                        </div>

                        {/* Details Column */}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-slate-800 truncate text-sm md:text-base flex items-center gap-1.5 leading-tight">
                            {u.full_name}
                            {isCurrentUser && (
                              <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-full uppercase tracking-wider leading-none">
                                You
                              </span>
                            )}
                          </h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate leading-none">{u.department}</p>
                            {u.streak_count > 0 && (
                              <span className="flex items-center gap-0.5 text-[9px] font-bold text-orange-500 bg-orange-50/80 border border-orange-100/10 px-1.5 py-0.5 rounded-full leading-none">
                                <Flame size={9} fill="currentColor" /> {u.streak_count}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Points Block */}
                        <div className="text-right flex items-center gap-2.5">
                          <div>
                            <p className="text-base font-black text-slate-900 group-hover:text-indigo-600 tracking-tight leading-none transition-colors">
                              {u.total_points?.toLocaleString()}
                            </p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5 leading-none">Points</p>
                          </div>
                          <ChevronRight size={14} className="text-slate-300 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200 flex-shrink-0" />
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Right Column: Live Community Feed Sidebar */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4 pb-32">
          <div className="flex items-center justify-between px-1 mb-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚡</span>
              <h2 className="text-lg font-black text-slate-800 tracking-tight">Live Activity Feed</h2>
            </div>
            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Live</span>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4">
            <div className="space-y-3.5 max-h-[520px] overflow-y-auto pr-1">
              {recentActivities.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm font-semibold">
                  No community activity logged yet today. Be the first! 🙌
                </div>
              ) : (
                recentActivities.map((act: any) => {
                  const u = act.user;
                  if (!u) return null;
                  const actType = act.type;
                  const detailBg = actType === 'log'
                    ? 'text-emerald-600 bg-emerald-50 border border-emerald-100/50'
                    : actType === 'streak'
                      ? 'text-orange-600 bg-orange-50 border border-orange-100/50'
                      : actType === 'bonus'
                        ? 'text-indigo-600 bg-indigo-50 border border-indigo-100/50'
                        : 'text-amber-600 bg-amber-50 border border-amber-100/50';

                  const emoji = actType === 'log' ? '📿' : actType === 'streak' ? '🔥' : actType === 'bonus' ? '🌟' : '🏆';

                  return (
                    <div key={act.id} className="flex gap-3 items-start p-2.5 rounded-2xl border border-slate-50 hover:bg-slate-50/50 transition-colors">
                      {/* User Avatar */}
                      <div className="relative flex-shrink-0 w-9 h-9 rounded-full border border-slate-100 overflow-hidden bg-slate-50 shadow-inner">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-bold text-slate-400 text-[10px] uppercase leading-none">
                            {u.full_name?.[0]}
                          </div>
                        )}
                      </div>

                      {/* Message body */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-800 text-xs md:text-sm leading-none">{u.full_name}</span>
                          <span className="text-[8px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded leading-none uppercase tracking-wide">
                            {u.department}
                          </span>
                        </div>
                        <p className="text-slate-500 text-[11px] mt-1.5 leading-snug">
                          {act.message}
                        </p>
                        
                        {/* Detail Badge */}
                        <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                          <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider ${detailBg} leading-none`}>
                            <span>{emoji}</span>
                            <span>{act.detail}</span>
                          </div>
                          <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest ml-auto">{act.timeLabel}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>



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
    </div>
  );
}