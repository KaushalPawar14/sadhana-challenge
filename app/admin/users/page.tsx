'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';
import { 
  Search, Edit3, Trash2, Award, Plus, 
  Download, History, X, Save, AlertTriangle
} from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [modalType, setModalType] = useState<'bonus' | 'award' | 'history' | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from('users')
      .select('*')
      .order('total_points', { ascending: false });
    setUsers(data || []);
    setIsLoading(false);
  };

  const filteredUsers = users.filter(u => 
    u.full_name?.toLowerCase().includes(search.toLowerCase()) || 
    u.department?.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (id: string) => {
    if (!confirm("This will remove the student and all their data. This cannot be undone. Proceed?")) return;
    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) toast.error("Failed to delete user");
    else {
      toast.success("User removed");
      fetchUsers();
    }
  };

  const handleGiveBonus = async (e: any) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const points = parseInt(formData.get('points') as string);
    const title = formData.get('title') as string;

    const { error: bonusError } = await supabase.from('bonus_points').insert({
      user_id: selectedUser.id,
      points,
      title
    });

    if (bonusError) {
      toast.error("Failed to give bonus");
      return;
    }

    const { error: userError } = await supabase.from('users').update({
      total_points: (selectedUser.total_points || 0) + points
    }).eq('id', selectedUser.id);

    if (userError) toast.error("Failed to update user points");
    else {
      toast.success("Bonus points awarded!");
      setModalType(null);
      fetchUsers();
    }
  };

  const handleGrantAward = async (e: any) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const award_key = formData.get('award_key') as string;
    const custom_message = formData.get('message') as string;

    const { error } = await supabase.from('awards').upsert({
      user_id: selectedUser.id,
      award_key,
      custom_message: `✦ ${custom_message}`
    }, { onConflict: 'user_id, award_key' });

    if (error) toast.error("Failed to grant award");
    else {
      toast.success("Award granted successfully! 🏅");
      setModalType(null);
    }
  };

  const exportToCSV = () => {
    const headers = ['Name', 'Email', 'Department', 'Points', 'Streak', 'Joined'];
    const rows = filteredUsers.map(u => [
      u.full_name, u.email, u.department, u.total_points, u.streak_count, u.created_at
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "sadhana_users_export.csv";
    link.click();
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900">User Management</h2>
          <p className="text-slate-500 font-bold">Monitor and manage all participating students</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all shadow-sm"
          >
            <Download size={18} /> Export CSV
          </button>
        </div>
      </div>

      {/* Search & Stats Bar */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Search by name or department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-white rounded-2xl border border-slate-100 shadow-sm focus:border-indigo-500 outline-none transition-all font-bold"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-6 font-black text-slate-400 uppercase text-[10px] tracking-widest">Student</th>
                <th className="p-6 font-black text-slate-400 uppercase text-[10px] tracking-widest">Department</th>
                <th className="p-6 font-black text-slate-400 uppercase text-[10px] tracking-widest">Progress</th>
                <th className="p-6 font-black text-slate-400 uppercase text-[10px] tracking-widest">Status</th>
                <th className="p-6 font-black text-slate-400 uppercase text-[10px] tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i} className="animate-pulse"><td colSpan={5} className="p-10"><div className="h-4 bg-slate-100 rounded w-full" /></td></tr>
                ))
              ) : filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold">
                        {u.full_name?.[0]}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{u.full_name}</p>
                        <p className="text-xs text-slate-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-6 font-bold text-slate-600">{u.department}</td>
                  <td className="p-6">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="font-black text-slate-900">{u.total_points}</p>
                        <p className="text-[10px] text-slate-400 font-black uppercase">Points</p>
                      </div>
                      <div className="h-8 w-px bg-slate-100" />
                      <div>
                        <p className="font-black text-orange-500">{u.streak_count}</p>
                        <p className="text-[10px] text-slate-400 font-black uppercase">Streak</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-6">
                    {u.is_onboarded ? (
                      <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase">Onboarded</span>
                    ) : (
                      <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-[10px] font-black uppercase">Pending</span>
                    )}
                  </td>
                  <td className="p-6 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => { setSelectedUser(u); setModalType('bonus'); }}
                        className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="Give Bonus"
                      >
                        <Plus size={18} />
                      </button>
                      <button 
                        onClick={() => { setSelectedUser(u); setModalType('award'); }}
                        className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-all" title="Grant Award"
                      >
                        <Award size={18} />
                      </button>
                      <button 
                        onClick={() => { setSelectedUser(u); setModalType('history'); }}
                        className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-all" title="View History"
                      >
                        <History size={18} />
                      </button>
                      <button 
                        onClick={() => handleDelete(u.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {modalType && selectedUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setModalType(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-md bg-white rounded-[2.5rem] p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-black text-slate-800">
                  {modalType === 'bonus' ? 'Give Bonus Points' : modalType === 'award' ? 'Grant Divine Award' : 'Activity History'}
                </h3>
                <button onClick={() => setModalType(null)} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} /></button>
              </div>

              {modalType === 'bonus' && (
                <form onSubmit={handleGiveBonus} className="space-y-4">
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Bonus Title</label>
                    <input name="title" required className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none font-bold" placeholder="e.g. Special Service" />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Points (Can be negative)</label>
                    <input name="points" type="number" required className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none font-bold" placeholder="50" />
                  </div>
                  <button type="submit" className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black shadow-lg shadow-indigo-100">Award Points</button>
                </form>
              )}

              {modalType === 'award' && (
                <form onSubmit={handleGrantAward} className="space-y-4">
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Select Award</label>
                    <select name="award_key" required className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none font-bold">
                      <option value="mahayogi_crown">Mahayogi Crown</option>
                      <option value="unbroken_flame">Unbroken Flame</option>
                      <option value="jijnasu_scholar">Jijnasu Scholar</option>
                      <option value="brahma_muhurta">Brahma Muhurta</option>
                      <option value="rising_sadhaka">Rising Sadhaka</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Personal Message</label>
                    <textarea name="message" required className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none font-bold" placeholder="You showed exceptional grit..." />
                  </div>
                  <button type="submit" className="w-full py-4 bg-amber-600 text-white rounded-xl font-black shadow-lg shadow-amber-100">Grant Award</button>
                </form>
              )}

              {modalType === 'history' && (
                <div className="max-h-96 overflow-y-auto">
                  <p className="text-sm font-bold text-slate-500 mb-4">Showing last 30 logs for {selectedUser.full_name}</p>
                  {/* Log history list would go here - simplified for space */}
                  <div className="bg-slate-50 p-4 rounded-xl text-center">
                    <p className="text-xs font-bold text-slate-400">Log history and backdating logic goes here.</p>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
