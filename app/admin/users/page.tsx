'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';
import {
  Search, Edit3, Trash2, Award, Plus,
  Download, History, X, Save, AlertTriangle, Filter, RotateCcw, Flame
} from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState<string>('ALL');
  const [deptFilter, setDeptFilter] = useState<string>('ALL');
  const [pointsFilter, setPointsFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [modalType, setModalType] = useState<'bonus' | 'award' | 'history' | null>(null);

  const [currentUserRole, setCurrentUserRole] = useState<string>('HOD');

  useEffect(() => {
    fetchUsers();
    fetchAdminRole();
  }, []);

  const fetchAdminRole = async () => {
    try {
      const res = await fetch('/api/admin-whitelist');
      if (res.ok) {
        const data = await res.json();
        const role = data.currentUserRole || 'HOD';
        setCurrentUserRole(role);
        if (role === 'FOLK_GUIDE' || role === 'FOLK_ENABLER_MALE') {
          setGenderFilter('M');
        } else if (role === 'FOLK_ENABLER_FEMALE') {
          setGenderFilter('F');
        }
      }
    } catch (e) {
      console.error('Error fetching admin role', e);
    }
  };

  const fetchUsers = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from('users')
      .select('*, reading_sessions(seconds_read, created_at)')
      .order('total_points', { ascending: false });

    const todayStr = new Date().toLocaleDateString('en-CA');
    const processedUsers = (data || []).map((u: any) => {
      let totalSecs = 0;
      let todaySecs = 0;
      
      if (u.reading_sessions) {
        u.reading_sessions.forEach((session: any) => {
          totalSecs += session.seconds_read;
          const sessionDateStr = new Date(session.created_at).toLocaleDateString('en-CA');
          if (sessionDateStr === todayStr) {
            todaySecs += session.seconds_read;
          }
        });
      }

      return {
        ...u,
        todayReadingMinutes: Math.round(todaySecs / 60),
        totalReadingMinutes: Math.round(totalSecs / 60)
      };
    });

    setUsers(processedUsers);
    setIsLoading(false);
  };

  // Role-scoped users for User Management
  const scopedUsers = React.useMemo(() => {
    if (currentUserRole === 'FOLK_GUIDE' || currentUserRole === 'FOLK_ENABLER_MALE') {
      return users.filter(u => u.gender === 'M');
    }
    if (currentUserRole === 'FOLK_ENABLER_FEMALE') {
      return users.filter(u => u.gender === 'F');
    }
    return users;
  }, [users, currentUserRole]);

  const uniqueDepartments = Array.from(
    new Set(scopedUsers.map(u => u.department).filter(Boolean))
  ).sort() as string[];

  const hasActiveFilters =
    search.trim() !== '' ||
    (currentUserRole === 'HOD' && genderFilter !== 'ALL') ||
    deptFilter !== 'ALL' ||
    pointsFilter !== 'ALL' ||
    statusFilter !== 'ALL';

  const resetFilters = () => {
    setSearch('');
    if (currentUserRole === 'HOD') setGenderFilter('ALL');
    setDeptFilter('ALL');
    setPointsFilter('ALL');
    setStatusFilter('ALL');
  };

  const filteredUsers = scopedUsers.filter(u => {
    // 1. Text search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = u.full_name?.toLowerCase().includes(q);
      const matchEmail = u.email?.toLowerCase().includes(q);
      const matchDept = u.department?.toLowerCase().includes(q);
      const matchMobile = u.mobile?.includes(q);
      if (!matchName && !matchEmail && !matchDept && !matchMobile) return false;
    }

    // 2. Gender filter (if HOD)
    if (currentUserRole === 'HOD' && genderFilter !== 'ALL') {
      if (genderFilter === 'M' && u.gender !== 'M') return false;
      if (genderFilter === 'F' && u.gender !== 'F') return false;
      if (genderFilter === 'UNASSIGNED' && (u.gender === 'M' || u.gender === 'F')) return false;
    }

    // 3. Department filter
    if (deptFilter !== 'ALL') {
      if (u.department?.toLowerCase() !== deptFilter.toLowerCase()) return false;
    }

    // 4. Points filter
    if (pointsFilter !== 'ALL') {
      const pts = u.total_points || 0;
      if (pointsFilter === '100+' && pts < 100) return false;
      if (pointsFilter === '500+' && pts < 500) return false;
      if (pointsFilter === '0' && pts !== 0) return false;
    }

    // 5. Status filter
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'ONBOARDED' && !u.is_onboarded) return false;
      if (statusFilter === 'PENDING' && u.is_onboarded) return false;
    }

    return true;
  });

  const handleGenderChange = async (userId: string, newGender: string) => {
    try {
      const res = await fetch('/api/admin/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, gender: newGender }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update gender');
      }

      toast.success(`Gender updated to ${newGender}`);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, gender: newGender } : u));
    } catch (err: any) {
      console.error("Gender update error:", err);
      toast.error(err.message || 'Failed to update gender');
    }
  };

  const handleTargetChantingChange = async (userId: string, newRounds: number) => {
    try {
      const res = await fetch('/api/admin/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, target_chanting: newRounds }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update commitment rounds');
      }

      toast.success(`Target rounds updated to ${newRounds}`);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, target_chanting: newRounds } : u));
    } catch (err: any) {
      console.error("Target chanting update error:", err);
      toast.error(err.message || 'Failed to update commitment rounds');
    }
  };

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

    // 1. Insert the bonus point record
    const { error: bonusError } = await supabase.from('bonus_points').insert({
      user_id: selectedUser.id,
      points,
      title
    });

    if (bonusError) {
      toast.error("Failed to record bonus entry: " + bonusError.message);
      return;
    }

    // 2. Fetch fresh user data to prevent race conditions
    const { data: freshUser } = await supabase
      .from('users')
      .select('total_points')
      .eq('id', selectedUser.id)
      .single();

    const newTotal = (freshUser?.total_points || 0) + points;

    // 3. Update the User's total_points securely via admin endpoint
    try {
      const res = await fetch('/api/admin/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUser.id, total_points: newTotal }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update total points");

      toast.success(`Awarded ${points} points for ${title}!`);
      setModalType(null);
      fetchUsers();
    } catch (userError: any) {
      toast.error(userError.message || "Failed to update user total points");
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
    const headers = ['Name', 'Email', 'Mobile', 'Gender', 'Department', 'Target Chanting Rounds', 'Points', 'Streak', 'Today Reading (min)', 'Total Reading (min)', 'Joined'];
    const rows = filteredUsers.map(u => [
      `"${u.full_name || ''}"`,
      `"${u.email || ''}"`,
      `"${u.mobile || ''}"`,
      `"${u.gender || ''}"`,
      `"${u.department || ''}"`,
      u.target_chanting || 16,
      u.total_points,
      u.streak_count,
      u.todayReadingMinutes || 0,
      u.totalReadingMinutes || 0,
      u.created_at
    ]);
    const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
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

      {/* Search & Filter Controls Bar */}
      <div className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-xl space-y-5">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="flex-1 relative w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Search by student name, email, mobile number, department..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-10 py-3.5 bg-slate-50 rounded-2xl border border-slate-200/60 focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold text-sm text-slate-800"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            )}
          </div>

          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-2 px-4 py-3.5 bg-indigo-50 text-indigo-700 rounded-2xl font-bold text-xs hover:bg-indigo-100 transition-all cursor-pointer whitespace-nowrap"
            >
              <RotateCcw size={16} /> Reset Filters
            </button>
          )}
        </div>

        {/* Multi-Select Filters */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-1">
          {/* Gender Filter */}
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <Filter size={10} /> Gender
            </label>
            {currentUserRole === 'HOD' ? (
              <select
                value={genderFilter}
                onChange={(e) => setGenderFilter(e.target.value)}
                className={`w-full p-3 rounded-xl border text-xs font-bold outline-none focus:border-indigo-500 cursor-pointer transition-all ${
                  genderFilter !== 'ALL' ? 'bg-indigo-50/70 text-indigo-800 border-indigo-300' : 'bg-slate-50 border-slate-200/60 text-slate-700'
                }`}
              >
                <option value="ALL">All Genders</option>
                <option value="M">👨 Male (M)</option>
                <option value="F">👩 Female (F)</option>
                <option value="UNASSIGNED">❓ Unassigned</option>
              </select>
            ) : currentUserRole === 'FOLK_ENABLER_FEMALE' ? (
              <div className="w-full p-2.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 font-black text-xs text-center">
                ♀️ Female Scope Only
              </div>
            ) : (
              <div className="w-full p-2.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-800 font-black text-xs text-center">
                ♂️ Male Scope Only
              </div>
            )}
          </div>

          {/* Department Filter */}
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <Filter size={10} /> Department
            </label>
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className={`w-full p-3 rounded-xl border text-xs font-bold outline-none focus:border-indigo-500 cursor-pointer transition-all ${
                deptFilter !== 'ALL' ? 'bg-indigo-50/70 text-indigo-800 border-indigo-300' : 'bg-slate-50 border-slate-200/60 text-slate-700'
              }`}
            >
              <option value="ALL">All Departments</option>
              {uniqueDepartments.map((dept: string) => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>

          {/* Points Filter */}
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <Filter size={10} /> Points
            </label>
            <select
              value={pointsFilter}
              onChange={(e) => setPointsFilter(e.target.value)}
              className={`w-full p-3 rounded-xl border text-xs font-bold outline-none focus:border-indigo-500 cursor-pointer transition-all ${
                pointsFilter !== 'ALL' ? 'bg-indigo-50/70 text-indigo-800 border-indigo-300' : 'bg-slate-50 border-slate-200/60 text-slate-700'
              }`}
            >
              <option value="ALL">All Points</option>
              <option value="100+">🏆 ≥ 100 Points</option>
              <option value="500+">👑 ≥ 500 Points</option>
              <option value="0">0 Points</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <Filter size={10} /> Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`w-full p-3 rounded-xl border text-xs font-bold outline-none focus:border-indigo-500 cursor-pointer transition-all ${
                statusFilter !== 'ALL' ? 'bg-indigo-50/70 text-indigo-800 border-indigo-300' : 'bg-slate-50 border-slate-200/60 text-slate-700'
              }`}
            >
              <option value="ALL">All Status</option>
              <option value="ONBOARDED">✅ Onboarded</option>
              <option value="PENDING">⏳ Pending</option>
            </select>
          </div>
        </div>

        {/* Counter Summary */}
        <div className="flex items-center justify-between text-xs font-bold text-slate-500 pt-2 border-t border-slate-100">
          <span>Showing <strong className="text-indigo-600 font-black">{filteredUsers.length}</strong> of <strong className="text-slate-800 font-black">{users.length}</strong> students</span>
          {hasActiveFilters && (
            <span className="text-[10px] font-black uppercase text-amber-700 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
              Active Filters Applied
            </span>
          )}
        </div>
      </div>

      {/* Users Table Container */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
        
        {/* Desktop Table View */}
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-6 font-black text-slate-400 uppercase text-[10px] tracking-widest">Student</th>
                <th className="p-6 font-black text-slate-400 uppercase text-[10px] tracking-widest">Gender</th>
                <th className="p-6 font-black text-slate-400 uppercase text-[10px] tracking-widest">Commitment</th>
                <th className="p-6 font-black text-slate-400 uppercase text-[10px] tracking-widest">Department</th>
                <th className="p-6 font-black text-slate-400 uppercase text-[10px] tracking-widest">Progress</th>
                <th className="p-6 font-black text-slate-400 uppercase text-[10px] tracking-widest">Reading Time</th>
                <th className="p-6 font-black text-slate-400 uppercase text-[10px] tracking-widest">Status</th>
                <th className="p-6 font-black text-slate-400 uppercase text-[10px] tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={8} className="p-10">
                      <div className="h-4 bg-slate-100 rounded w-full" />
                    </td>
                  </tr>
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
                        <p className="text-xs text-slate-400">{u.email} {u.mobile ? `• 📱 ${u.mobile}` : ''}</p>
                      </div>
                    </div>
                  </td>

                  {/* Gender Selector */}
                  <td className="p-6">
                    <select
                      value={u.gender || ''}
                      onChange={(e) => handleGenderChange(u.id, e.target.value)}
                      className={`px-3 py-1.5 rounded-xl font-bold text-xs border outline-none cursor-pointer transition-all ${
                        u.gender === 'M'
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : u.gender === 'F'
                          ? 'bg-pink-50 text-pink-700 border-pink-200'
                          : 'bg-amber-50 text-amber-700 border-amber-300 font-medium'
                      }`}
                    >
                      <option value="" disabled>-- Gender --</option>
                      <option value="M">👨 Male (M)</option>
                      <option value="F">👩 Female (F)</option>
                    </select>
                  </td>

                  {/* Editable Commitment Rounds */}
                  <td className="p-6">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="1"
                        max="108"
                        defaultValue={u.target_chanting || 16}
                        onBlur={(e) => {
                          const val = parseInt(e.target.value);
                          if (val > 0 && val !== u.target_chanting) {
                            handleTargetChantingChange(u.id, val);
                          }
                        }}
                        className="w-16 p-1.5 rounded-xl text-xs font-black bg-amber-50/70 border border-amber-200/80 text-amber-800 outline-none focus:border-amber-500 text-center"
                      />
                      <span className="text-[10px] font-black text-slate-400 uppercase">rds</span>
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
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="font-black text-indigo-600">{u.todayReadingMinutes || 0}m</p>
                        <p className="text-[10px] text-slate-400 font-black uppercase">Today</p>
                      </div>
                      <div className="h-8 w-px bg-slate-100" />
                      <div>
                        <p className="font-black text-slate-700">{u.totalReadingMinutes || 0}m</p>
                        <p className="text-[10px] text-slate-400 font-black uppercase">Total</p>
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
                        className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all cursor-pointer" title="Give Bonus"
                      >
                        <Plus size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(u.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer" title="Delete"
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

        {/* Mobile Cards View */}
        <div className="md:hidden p-4 space-y-4">
          {isLoading ? (
            Array(3).fill(0).map((_, i) => (
              <div key={i} className="animate-pulse bg-slate-50 border border-slate-100 rounded-3xl p-5 space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-200 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-slate-200 rounded w-1/2" />
                    <div className="h-3 bg-slate-200 rounded w-3/4" />
                  </div>
                </div>
                <div className="h-8 bg-slate-200 rounded w-full" />
              </div>
            ))
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8 text-slate-400 font-bold">No students found.</div>
          ) : (
            filteredUsers.map((u) => (
              <div key={u.id} className="bg-slate-50 border border-slate-100 rounded-3xl p-5 space-y-4 hover:shadow-md transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold">
                    {u.full_name?.[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900 truncate">{u.full_name}</p>
                    <p className="text-xs text-slate-400 truncate">{u.email} {u.mobile ? `• 📱 ${u.mobile}` : ''}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-xs border-t border-b border-slate-200/50 py-3">
                  <div>
                    <p className="font-black text-slate-900">{u.total_points} pts</p>
                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider">Total Points</p>
                  </div>
                  <div>
                    <p className="font-black text-orange-500">{u.streak_count} days</p>
                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider">Streak</p>
                  </div>

                  {/* Gender Selector */}
                  <div>
                    <select
                      value={u.gender || ''}
                      onChange={(e) => handleGenderChange(u.id, e.target.value)}
                      className={`text-xs font-bold rounded-lg px-2 py-1 border outline-none cursor-pointer ${
                        u.gender === 'M'
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : u.gender === 'F'
                          ? 'bg-pink-50 text-pink-700 border-pink-200'
                          : 'bg-amber-50 text-amber-700 border-amber-300'
                      }`}
                    >
                      <option value="" disabled>-- Gender --</option>
                      <option value="M">👨 Male (M)</option>
                      <option value="F">👩 Female (F)</option>
                    </select>
                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider mt-0.5">Gender</p>
                  </div>

                  {/* Editable Commitment */}
                  <div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="1"
                        max="108"
                        defaultValue={u.target_chanting || 16}
                        onBlur={(e) => {
                          const val = parseInt(e.target.value);
                          if (val > 0 && val !== u.target_chanting) {
                            handleTargetChantingChange(u.id, val);
                          }
                        }}
                        className="w-14 p-1 rounded-lg text-xs font-black bg-white border border-slate-200 outline-none focus:border-indigo-500 text-center"
                      />
                      <span className="text-[10px] font-bold text-slate-600">rds</span>
                    </div>
                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider mt-0.5">Target Rounds</p>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    {u.is_onboarded ? (
                      <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-black uppercase">Onboarded</span>
                    ) : (
                      <span className="px-2.5 py-1 bg-amber-50 text-amber-600 rounded-full text-[9px] font-black uppercase">Pending</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setSelectedUser(u); setModalType('bonus'); }}
                      className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all cursor-pointer" title="Give Bonus"
                    >
                      <Plus size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(u.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer" title="Delete"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
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
                      <option value="brahma_muhurta">Active Entity</option>
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
