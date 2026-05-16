'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Flame, Trophy, Award, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { supabase } from '@/lib/supabaseClient';

interface UserProfileModalProps {
  userId: string;
  onClose: () => void;
}

export const UserProfileModal = ({ userId, onClose }: UserProfileModalProps) => {
  const [profile, setProfile] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, [userId]);

  const fetchProfile = async () => {
    setIsLoading(true);
    const { data: userData } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    setProfile(userData);

    const { data: activityLogs } = await supabase
      .from('activity_logs')
      .select('log_date, points_earned')
      .eq('user_id', userId)
      .order('log_date', { ascending: false })
      .limit(7);
    
    setLogs(activityLogs?.reverse() || []);
    setIsLoading(false);
  };

  if (!userId) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
      />
      
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
      >
        <button onClick={onClose} className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 transition-colors z-10">
          <X size={24} />
        </button>

        {isLoading ? (
          <div className="p-20 flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : profile && (
          <div className="flex flex-col md:flex-row h-full">
            {/* Left Sidebar Profile Info */}
            <div className="md:w-64 bg-slate-50 p-8 flex flex-col items-center text-center border-b md:border-b-0 md:border-r border-slate-100">
              <div className="w-24 h-24 bg-indigo-100 rounded-3xl flex items-center justify-center text-4xl mb-6 shadow-inner">
                {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="w-full h-full rounded-3xl object-cover" /> : '🧘'}
              </div>
              <h2 className="text-xl font-black text-slate-800 mb-1">{profile.full_name}</h2>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">{profile.department}</p>
              
              <div className="grid grid-cols-1 w-full gap-3">
                <div className="bg-white p-3 rounded-2xl border border-slate-100 flex items-center gap-3">
                  <Trophy className="text-amber-500" size={18} />
                  <div className="text-left">
                    <p className="text-[10px] font-bold text-slate-400 uppercase leading-none mb-1">Total Points</p>
                    <p className="text-sm font-black text-slate-800">{profile.total_points?.toLocaleString()}</p>
                  </div>
                </div>
                <div className="bg-white p-3 rounded-2xl border border-slate-100 flex items-center gap-3">
                  <Flame className="text-orange-500" size={18} />
                  <div className="text-left">
                    <p className="text-[10px] font-bold text-slate-400 uppercase leading-none mb-1">Best Streak</p>
                    <p className="text-sm font-black text-slate-800">{profile.best_streak} Days</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Main Content */}
            <div className="flex-1 p-8 md:p-10">
              <div className="flex items-center gap-2 mb-8">
                <TrendingUp className="text-indigo-600" size={20} />
                <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm">Last 7 Days Performance</h3>
              </div>

              <div className="h-64 w-full mb-8">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={logs}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="log_date" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                      tickFormatter={(val) => new Date(val).toLocaleDateString('en-US', { weekday: 'short' })}
                    />
                    <YAxis hide />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-slate-900 text-white p-3 rounded-xl text-xs font-bold shadow-xl">
                              {payload[0].value} Points
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="points_earned" radius={[6, 6, 0, 0]} barSize={32}>
                      {logs.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === logs.length - 1 ? '#4f46e5' : '#e2e8f0'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Chanting</p>
                  <p className="text-lg font-black text-slate-800">{profile.target_chanting}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Reading</p>
                  <p className="text-lg font-black text-slate-800">{profile.target_reading}m</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Hearing</p>
                  <p className="text-lg font-black text-slate-800">{profile.target_hearing}m</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};
