'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Trash2, Search, Filter, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function AdminLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [filterLate, setFilterLate] = useState(false);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from('activity_logs')
      .select('*, users(full_name)')
      .order('submitted_at', { ascending: false });
    setLogs(data || []);
    setIsLoading(false);
  };

  const handleDeleteLog = async (log: any) => {
    if (!confirm(`Delete log for ${log.users.full_name} on ${log.log_date}? This will NOT auto-update their total points in this version, manual correction in Users tab may be needed.`)) return;
    
    const { error } = await supabase.from('activity_logs').delete().eq('id', log.id);
    if (error) toast.error("Failed to delete log");
    else {
      toast.success("Log deleted");
      fetchLogs();
    }
  };

  const filteredLogs = logs.filter(l => {
    const matchesSearch = l.users?.full_name?.toLowerCase().includes(search.toLowerCase());
    const matchesLate = filterLate ? l.is_late_submission : true;
    return matchesSearch && matchesLate;
  });

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-slate-900">Activity Logs</h2>
          <p className="text-slate-500 font-bold">Global stream of all spiritual submissions</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Search by student name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-white rounded-2xl border border-slate-100 shadow-sm focus:border-indigo-500 outline-none transition-all font-bold"
          />
        </div>
        <button 
          onClick={() => setFilterLate(!filterLate)}
          className={`flex items-center gap-2 px-6 py-4 rounded-2xl font-black text-sm transition-all shadow-sm ${filterLate ? 'bg-amber-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
        >
          <Filter size={18} /> {filterLate ? 'Showing Late Only' : 'Filter Late'}
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-6 font-black text-slate-400 uppercase text-[10px] tracking-widest">Student</th>
                <th className="p-6 font-black text-slate-400 uppercase text-[10px] tracking-widest">Log Date</th>
                <th className="p-6 font-black text-slate-400 uppercase text-[10px] tracking-widest">Details</th>
                <th className="p-6 font-black text-slate-400 uppercase text-[10px] tracking-widest">Points</th>
                <th className="p-6 font-black text-slate-400 uppercase text-[10px] tracking-widest">Status</th>
                <th className="p-6 font-black text-slate-400 uppercase text-[10px] tracking-widest text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i} className="animate-pulse"><td colSpan={6} className="p-10"><div className="h-4 bg-slate-100 rounded w-full" /></td></tr>
                ))
              ) : filteredLogs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-6 font-bold text-slate-900">{l.users?.full_name}</td>
                  <td className="p-6 font-bold text-slate-600">{new Date(l.log_date).toLocaleDateString()}</td>
                  <td className="p-6">
                    <p className="text-xs font-bold text-slate-500">📿 {l.chanting_rounds} · 📖 {l.reading_minutes}m · 🎧 {l.hearing_minutes}m</p>
                  </td>
                  <td className="p-6 font-black text-indigo-600">+{l.points_earned}</td>
                  <td className="p-6">
                    {l.is_late_submission ? (
                      <span className="flex items-center gap-1 text-amber-500 text-[10px] font-black uppercase"><AlertCircle size={12} /> Late</span>
                    ) : (
                      <span className="flex items-center gap-1 text-emerald-500 text-[10px] font-black uppercase"><CheckCircle2 size={12} /> On Time</span>
                    )}
                  </td>
                  <td className="p-6 text-right">
                    <button onClick={() => handleDeleteLog(l)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={18} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
