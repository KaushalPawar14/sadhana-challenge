'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Award, Trash2, Search, Sparkles } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function AdminAwards() {
  const [awards, setAwards] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAwards();
  }, []);

  const fetchAwards = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from('awards')
      .select('*, users(full_name)')
      .order('unlocked_at', { ascending: false });
    setAwards(data || []);
    setIsLoading(false);
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Revoke this award?")) return;
    const { error } = await supabase.from('awards').delete().eq('id', id);
    if (error) toast.error("Failed to revoke award");
    else {
      toast.success("Award revoked");
      fetchAwards();
    }
  };

  const filteredAwards = awards.filter(a => 
    a.users?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    a.award_key?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-slate-900">Award Management</h2>
          <p className="text-slate-500 font-bold">Review and manage divine recognitions</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input 
          type="text" 
          placeholder="Search by student or award type..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-12 pr-4 py-4 bg-white rounded-2xl border border-slate-100 shadow-sm focus:border-indigo-500 outline-none transition-all font-bold"
        />
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-6 font-black text-slate-400 uppercase text-[10px] tracking-widest">Student</th>
                <th className="p-6 font-black text-slate-400 uppercase text-[10px] tracking-widest">Award</th>
                <th className="p-6 font-black text-slate-400 uppercase text-[10px] tracking-widest">Message</th>
                <th className="p-6 font-black text-slate-400 uppercase text-[10px] tracking-widest">Unlocked At</th>
                <th className="p-6 font-black text-slate-400 uppercase text-[10px] tracking-widest text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i} className="animate-pulse"><td colSpan={5} className="p-10"><div className="h-4 bg-slate-100 rounded w-full" /></td></tr>
                ))
              ) : filteredAwards.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-6 font-bold text-slate-900">{a.users?.full_name}</td>
                  <td className="p-6">
                    <span className="flex items-center gap-2 font-bold text-indigo-600">
                      <Award size={16} /> {a.award_key.replace('_', ' ').toUpperCase()}
                    </span>
                  </td>
                  <td className="p-6">
                    <p className="text-xs font-medium text-slate-500 max-w-xs truncate">{a.custom_message}</p>
                  </td>
                  <td className="p-6 text-xs font-bold text-slate-400">
                    {new Date(a.unlocked_at).toLocaleString()}
                  </td>
                  <td className="p-6 text-right">
                    <button onClick={() => handleRevoke(a.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Revoke"><Trash2 size={18} /></button>
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
