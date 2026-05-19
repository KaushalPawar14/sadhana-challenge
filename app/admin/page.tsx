'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';
import { Users, ClipboardList, Zap, TrendingUp, AlertCircle, Trophy } from 'lucide-react';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    logsToday: 0,
    totalPoints: 0,
    missingLogs: [] as string[],
    topUsers: [] as any[],
    streakData: [] as any[]
  });
  const [activeTheme, setActiveTheme] = useState<string>('default');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();

    const initialTheme = localStorage.getItem('app_theme') || 'default';
    setActiveTheme(initialTheme);

    const handleThemeChange = () => {
      const updatedTheme = localStorage.getItem('app_theme') || 'default';
      setActiveTheme(updatedTheme);
    };

    window.addEventListener('theme-change', handleThemeChange);
    return () => {
      window.removeEventListener('theme-change', handleThemeChange);
    };
  }, []);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    const today = new Date().toISOString().split('T')[0];

    // 1. Total Users
    const { count: userCount } = await supabase.from('users').select('*', { count: 'exact', head: true });
    
    // 2. Logs Today
    const { count: logCount } = await supabase.from('activity_logs').select('*', { count: 'exact', head: true }).eq('log_date', today);
    
    // 3. Top Users
    const { data: topUsers } = await supabase.from('users').select('full_name, total_points, department').order('total_points', { ascending: false }).limit(5);
    
    // 4. Missing Logs
    const { data: usersWithLogs } = await supabase.from('activity_logs').select('user_id').eq('log_date', today);
    const loggedIds = usersWithLogs?.map(l => l.user_id) || [];
    const { data: missingUsers } = await supabase.from('users').select('full_name').not('id', 'in', `(${loggedIds.join(',') || '00000000-0000-0000-0000-000000000000'})`).limit(10);

    // 5. Total Points
    const { data: pointsData } = await supabase.from('users').select('total_points, streak_count');
    const totalPoints = pointsData?.reduce((acc, curr) => acc + (curr.total_points || 0), 0) || 0;

    // 6. Streak Data for Chart
    const streakGroups = pointsData?.reduce((acc: any, curr) => {
      const s = curr.streak_count || 0;
      const bucket = s === 0 ? '0' : s <= 3 ? '1-3' : s <= 7 ? '4-7' : '8+';
      acc[bucket] = (acc[bucket] || 0) + 1;
      return acc;
    }, {});
    const streakChart = Object.entries(streakGroups).map(([name, count]) => ({ name, count }));

    setStats({
      totalUsers: userCount || 0,
      logsToday: logCount || 0,
      totalPoints,
      topUsers: topUsers || [],
      missingLogs: missingUsers?.map(u => u.full_name) || [],
      streakData: streakChart
    });
    setIsLoading(false);
  };

  if (isLoading) return <div className="p-10 text-slate-400 font-bold">Initializing Dashboard...</div>;

  return (
    <div className="space-y-10">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <h2 className="text-3xl font-black text-slate-900">Omni-Dashboard</h2>
        <div className="flex items-center gap-3">
          <p className="text-sm font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-full hidden sm:inline-block">Real-time Overview</p>
          <ThemeSwitcher />
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
        {[
          { label: 'Total Students', val: stats.totalUsers, icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Logs Today', val: stats.logsToday, icon: ClipboardList, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Total Points', val: stats.totalPoints.toLocaleString(), icon: Trophy, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Completion Rate', val: `${Math.round((stats.logsToday / (stats.totalUsers || 1)) * 100)}%`, icon: Zap, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map((m, i) => (
          <motion.div 
            key={m.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-3 md:gap-4"
          >
            <div className={`w-10 h-10 md:w-14 md:h-14 ${m.bg} ${m.color} rounded-xl md:rounded-2xl flex items-center justify-center flex-shrink-0`}>
              <m.icon className="w-5 h-5 md:w-7 md:h-7" />
            </div>
            <div className="min-w-0">
              <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1 truncate">{m.label}</p>
              <p className="text-lg md:text-2xl font-black text-slate-900 leading-none">{m.val}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Top 5 Students */}
        <section className="lg:col-span-2 bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm">
          <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
            <TrendingUp size={20} className="text-indigo-600" /> Top 5 Students
          </h3>
          <div className="space-y-4">
            {stats.topUsers.map((u, i) => (
              <div key={i} className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl">
                <span className="w-6 font-black text-slate-300">#{i+1}</span>
                <div className="flex-1">
                  <p className="font-bold text-slate-800">{u.full_name}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">{u.department}</p>
                </div>
                <p className="font-black text-indigo-600">{u.total_points.toLocaleString()} pts</p>
              </div>
            ))}
          </div>
        </section>

        {/* Missing Logs */}
        <section className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm">
          <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
            <AlertCircle size={20} className="text-red-500" /> Missing Today ({stats.totalUsers - stats.logsToday})
          </h3>
          <div className="space-y-2">
            {stats.missingLogs.map((name, i) => (
              <div key={i} className="text-sm font-bold text-slate-600 p-2 border-b border-slate-50">
                {name}
              </div>
            ))}
            {stats.missingLogs.length === 0 && <p className="text-emerald-500 font-bold">Everyone has logged! 🎉</p>}
          </div>
        </section>
      </div>

      {/* Streak Overview Chart */}
      <section className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm">
        <h3 className="text-lg font-black text-slate-800 mb-6">Active Streaks Distribution</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.streakData}>
              <CartesianGrid 
                strokeDasharray="3 3" 
                vertical={false} 
                stroke={activeTheme === 'dark' ? '#1f2937' : activeTheme === 'cream' ? '#e2d1b9' : '#f1f5f9'} 
              />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ 
                  fontSize: 12, 
                  fill: activeTheme === 'dark' ? '#94a3b8' : activeTheme === 'cream' ? '#8c6f5e' : '#94a3b8', 
                  fontWeight: 600 
                }} 
              />
              <YAxis hide />
              <Tooltip 
                cursor={{ fill: activeTheme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : activeTheme === 'cream' ? 'rgba(92, 64, 51, 0.08)' : '#f8fafc' }} 
                contentStyle={
                  activeTheme === 'dark' 
                    ? { backgroundColor: '#111827', borderColor: '#1f2937', color: '#f8fafc', borderRadius: '1rem', fontWeight: 'bold' } 
                    : activeTheme === 'cream' 
                      ? { backgroundColor: '#fdfaf6', borderColor: '#e2d1b9', color: '#5c4033', borderRadius: '1rem', fontWeight: 'bold' } 
                      : { backgroundColor: '#ffffff', borderColor: '#e2e8f0', color: '#0f172a', borderRadius: '1rem', fontWeight: 'bold' }
                }
              />
              <Bar 
                dataKey="count" 
                fill={activeTheme === 'dark' ? '#818cf8' : activeTheme === 'cream' ? '#5c4033' : '#6366f1'} 
                radius={[8, 8, 0, 0]} 
                barSize={40} 
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
