'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';
import {
  Users, ClipboardList, Zap, Trophy, TrendingUp, AlertCircle,
  Calendar, Phone, Filter, Search, Sparkles, X, MessageSquare, Check, Copy, ExternalLink
} from 'lucide-react';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';

export default function AdminDashboard() {
  const [users, setUsers] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTheme, setActiveTheme] = useState<string>('default');

  // Filter State
  const [genderFilter, setGenderFilter] = useState<'ALL' | 'M' | 'F'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'MISSING_TODAY' | 'ANY_MISSED' | 'COMPLETED_ALL' | 'MESSAGED' | 'NOT_MESSAGED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Reminded Students Tracking (per-day localStorage)
  const [remindedUserIds, setRemindedUserIds] = useState<Set<string>>(new Set());

  // Action Modal State for Selected Student
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [customMsg, setCustomMsg] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchDashboardData();

    const initialTheme = localStorage.getItem('app_theme') || 'default';
    setActiveTheme(initialTheme);

    // Load messaged students for today
    const today = new Date().toLocaleDateString('en-CA');
    const saved = localStorage.getItem(`reminded_students_${today}`);
    if (saved) {
      try {
        setRemindedUserIds(new Set(JSON.parse(saved)));
      } catch (e) {}
    }

    const handleThemeChange = () => {
      const updatedTheme = localStorage.getItem('app_theme') || 'default';
      setActiveTheme(updatedTheme);
    };

    window.addEventListener('theme-change', handleThemeChange);
    return () => {
      window.removeEventListener('theme-change', handleThemeChange);
    };
  }, []);

  const markStudentAsMessaged = (userId: string) => {
    const today = new Date().toLocaleDateString('en-CA');
    setRemindedUserIds(prev => {
      const updated = new Set(prev);
      updated.add(userId);
      localStorage.setItem(`reminded_students_${today}`, JSON.stringify(Array.from(updated)));
      return updated;
    });
  };

  const fetchDashboardData = async () => {
    setIsLoading(true);

    // Fetch all users
    const { data: usersData } = await supabase
      .from('users')
      .select('*')
      .order('total_points', { ascending: false });

    // Fetch all activity logs
    const { data: logsData } = await supabase
      .from('activity_logs')
      .select('*')
      .order('log_date', { ascending: true });

    setUsers(usersData || []);
    setLogs(logsData || []);
    setIsLoading(false);
  };

  const todayStr = new Date().toLocaleDateString('en-CA');

  // Metric Summaries
  const totalStudents = users.length;
  const loggedTodaySet = new Set(logs.filter(l => l.log_date === todayStr).map(l => l.user_id));
  const logsTodayCount = loggedTodaySet.size;
  const totalPoints = users.reduce((acc, u) => acc + (u.total_points || 0), 0);
  const completionPercentage = Math.round((logsTodayCount / (totalStudents || 1)) * 100);

  // Challenge Dates Logic
  const allLogDates = Array.from(new Set(logs.map(l => l.log_date))).sort();
  let challengeDates = allLogDates;

  if (challengeDates.length === 0) {
    const dates = [];
    for (let i = 15; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toLocaleDateString('en-CA'));
    }
    challengeDates = dates;
  } else if (challengeDates.length < 16) {
    const startDate = new Date(challengeDates[0]);
    const dates = [];
    for (let i = 0; i < 16; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      dates.push(d.toLocaleDateString('en-CA'));
    }
    challengeDates = dates;
  }

  // Elapsed Dates up to today
  const elapsedDates = challengeDates.filter(d => d <= todayStr);

  // Pre-calculate user logs set & detailed log details map
  const userLogsMap = new Map<string, Set<string>>();
  const userLogDetailsMap = new Map<string, Map<string, { chanting_rounds: number; points_earned: number }>>();

  logs.forEach(l => {
    // User Logged Dates Set
    if (!userLogsMap.has(l.user_id)) userLogsMap.set(l.user_id, new Set());
    userLogsMap.get(l.user_id)!.add(l.log_date);

    // User Log Details (Rounds & Points per date)
    if (!userLogDetailsMap.has(l.user_id)) userLogDetailsMap.set(l.user_id, new Map());
    userLogDetailsMap.get(l.user_id)!.set(l.log_date, {
      chanting_rounds: l.chanting_rounds || 0,
      points_earned: l.points_earned || 0
    });
  });

  // Filtered Students for Challenge Analysis Matrix
  const filteredMatrixUsers = users.filter(u => {
    // 1. Gender Filter
    if (genderFilter !== 'ALL' && u.gender !== genderFilter) return false;

    // 2. Search Text Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = u.full_name?.toLowerCase().includes(q);
      const matchDept = u.department?.toLowerCase().includes(q);
      const matchMobile = u.mobile?.includes(q);
      if (!matchName && !matchDept && !matchMobile) return false;
    }

    // 3. Status / Missed Days Filter (Only past & present dates)
    const userLoggedDates = userLogsMap.get(u.id) || new Set();
    const missedElapsedDates = elapsedDates.filter(d => !userLoggedDates.has(d));
    const missedCount = missedElapsedDates.length;
    const isMissingToday = !userLoggedDates.has(todayStr);

    if (statusFilter === 'MISSING_TODAY' && !isMissingToday) return false;
    if (statusFilter === 'ANY_MISSED' && missedCount === 0) return false;
    if (statusFilter === 'COMPLETED_ALL' && missedCount > 0) return false;
    if (statusFilter === 'MESSAGED' && !remindedUserIds.has(u.id)) return false;
    if (statusFilter === 'NOT_MESSAGED' && (remindedUserIds.has(u.id) || missedCount === 0)) return false;

    return true;
  });

  // Open Action Modal for a Student
  const handleOpenStudentModal = (student: any) => {
    const userLoggedDates = userLogsMap.get(student.id) || new Set();
    const missedElapsedDates = elapsedDates.filter(d => !userLoggedDates.has(d));
    
    const formattedMissedDays = missedElapsedDates.map(dateStr => {
      const idx = challengeDates.indexOf(dateStr);
      return idx >= 0 ? `• Day ${idx + 1}: ${dateStr}` : `• ${dateStr}`;
    }).join('\n');

    const defaultMsg = missedElapsedDates.length > 0
      ? `Hare Krishna ${student.full_name || 'Student'}! \u{1F64F}\n\nThis is a gentle reminder regarding your Sadhana Challenge logs. You have pending logs for the following dates:\n${formattedMissedDays}\n\nPlease update your sadhana log today:\nhttps://folk-competition.vercel.app/`
      : `Hare Krishna ${student.full_name || 'Student'}! \u{1F64F}\n\nGreat job on keeping up with your Sadhana Challenge logs! Keep going! \u{1F4FF}\u{2728}`;

    setSelectedStudent({
      ...student,
      missedElapsedDates,
      userLoggedDates
    });
    setCustomMsg(defaultMsg);
    setCopied(false);
  };

  const handleCopyMsg = () => {
    const normalizedMsg = (customMsg || '').normalize('NFC');
    navigator.clipboard.writeText(normalizedMsg);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsAppSend = (student: any) => {
    if (!student?.mobile) return;
    markStudentAsMessaged(student.id);

    // Normalize Unicode string to UTF-8 NFC standard to prevent emoji '?' rendering bugs
    const normalizedMsg = (customMsg || '').normalize('NFC');

    // Auto-copy message text to clipboard as safety fallback
    navigator.clipboard.writeText(normalizedMsg).catch(() => {});

    // Smart phone sanitizer (handling 10 digits vs +91/91 prefixed)
    const rawDigits = student.mobile.replace(/\D/g, '');
    let phoneWithCountry = rawDigits;
    if (rawDigits.length === 10) {
      phoneWithCountry = `91${rawDigits}`;
    } else if (rawDigits.startsWith('91') && rawDigits.length === 12) {
      phoneWithCountry = rawDigits;
    }

    const encodedMsg = encodeURIComponent(normalizedMsg);

    // Detect mobile browser vs desktop
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      typeof navigator !== 'undefined' ? navigator.userAgent : ''
    );

    if (isMobile) {
      // Direct app protocol for mobile - opens WhatsApp immediately without browser prompts
      window.location.href = `whatsapp://send?phone=${phoneWithCountry}&text=${encodedMsg}`;
    } else {
      // Direct WhatsApp Web link for desktop - bypasses landing pages & lands directly in chat text box
      window.open(`https://web.whatsapp.com/send?phone=${phoneWithCountry}&text=${encodedMsg}`, '_blank', 'noopener,noreferrer');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <Sparkles className="w-8 h-8 animate-spin text-indigo-600 mb-3" />
        <p className="text-slate-600 font-black text-sm tracking-wide">Loading Analytics Engine...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8 pb-12">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Admin Dashboard</h2>
          <p className="text-slate-500 font-bold text-xs sm:text-sm mt-0.5">Real-time Sadhana Matrix & Student Follow-up Suite</p>
        </div>
        <div className="flex items-center gap-3 self-end sm:self-auto">
          <ThemeSwitcher />
        </div>
      </div>

      {/* Metric Summary Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        {[
          { label: 'Total Students', val: totalStudents, icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50/80 border-indigo-100' },
          { label: 'Logs Today', val: logsTodayCount, icon: ClipboardList, color: 'text-emerald-600', bg: 'bg-emerald-50/80 border-emerald-100' },
          { label: 'Total Points', val: totalPoints.toLocaleString(), icon: Trophy, color: 'text-amber-600', bg: 'bg-amber-50/80 border-amber-100' },
          { label: 'Completion Rate', val: `${completionPercentage}%`, icon: Zap, color: 'text-purple-600', bg: 'bg-purple-50/80 border-purple-100' },
        ].map((m, i) => (
          <motion.div
            key={m.label}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-100 shadow-xs flex items-center gap-3"
          >
            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl ${m.bg} ${m.color} border flex items-center justify-center flex-shrink-0`}>
              <m.icon className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1 truncate">{m.label}</p>
              <p className="text-base sm:text-2xl font-black text-slate-900 leading-none">{m.val}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* MAIN MATRIX CONTAINER */}
      <div className="bg-white rounded-3xl sm:rounded-[2.5rem] p-4 sm:p-6 md:p-8 border border-slate-100 shadow-xl space-y-6">
        
        {/* RESPONSIVE CONTROL TOOLBAR */}
        <div className="space-y-4 border-b border-slate-100 pb-5">
          {/* Title & Gender Segment Filter */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <Calendar className="text-indigo-600" size={20} /> Challenge Attendance & Daily Score Matrix
            </h3>

            {/* Gender Segment Filter */}
            <div className="flex items-center gap-1 bg-slate-100/70 p-1 rounded-xl self-start sm:self-auto">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 hidden sm:inline">Gender:</span>
              <button
                onClick={() => setGenderFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                  genderFilter === 'ALL' ? 'bg-white text-indigo-700 shadow-xs font-black' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setGenderFilter('M')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer flex items-center gap-1 ${
                  genderFilter === 'M' ? 'bg-indigo-600 text-white shadow-xs font-black' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                👨 Male
              </button>
              <button
                onClick={() => setGenderFilter('F')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer flex items-center gap-1 ${
                  genderFilter === 'F' ? 'bg-pink-600 text-white shadow-xs font-black' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                👩 Female
              </button>
            </div>
          </div>

          {/* Search Bar & Status Dropdown Filter */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div className="sm:col-span-2 relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search matrix by student name, department, mobile..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 rounded-2xl border border-slate-200/80 focus:border-indigo-500 focus:bg-white text-xs sm:text-sm font-bold outline-none transition-all"
              />
            </div>

            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e: any) => setStatusFilter(e.target.value)}
                className="w-full py-2.5 px-3 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 cursor-pointer appearance-none"
              >
                <option value="ALL">All Attendance Status</option>
                <option value="MISSING_TODAY">🚨 Missing Log Today</option>
                <option value="ANY_MISSED">⚠️ Missed Any Days</option>
                <option value="COMPLETED_ALL">🏆 100% Completed</option>
                <option value="MESSAGED">💬 Messaged (Reminded)</option>
                <option value="NOT_MESSAGED">⏳ Pending WhatsApp Follow-up</option>
              </select>
              <Filter className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
            </div>
          </div>
        </div>

        {/* STATUS HEADER BAR */}
        <div className="flex items-center justify-between text-xs font-bold text-slate-500 flex-wrap gap-2 pb-1">
          <span>Showing <strong className="text-indigo-600 font-black">{filteredMatrixUsers.length}</strong> students</span>
          
          <div className="flex items-center gap-3 text-[10px] sm:text-[11px] font-black flex-wrap">
            <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
              <span className="w-2 h-2 bg-emerald-500 rounded-xs"></span> Logged (Rounds + Points)
            </span>
            <span className="flex items-center gap-1 text-red-700 bg-red-50 px-2 py-0.5 rounded-md border border-red-200">
              <span className="w-2 h-2 bg-red-500 rounded-xs"></span> Missed
            </span>
            <span className="flex items-center gap-1 text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-300">
              <Check size={10} /> Messaged
            </span>
          </div>
        </div>

        {/* STUDENT ROWS MATRIX */}
        <div className="space-y-3">
          {filteredMatrixUsers.length === 0 ? (
            <div className="p-8 text-center bg-slate-50/80 rounded-2xl text-slate-400 font-bold text-xs sm:text-sm border border-dashed border-slate-200">
              No students found matching your selected filters.
            </div>
          ) : (
            filteredMatrixUsers.map((u) => {
              const studentLogs = userLogsMap.get(u.id) || new Set();
              const studentDetails = userLogDetailsMap.get(u.id);
              const missedElapsedCount = elapsedDates.filter(d => !studentLogs.has(d)).length;
              const isMessagedToday = remindedUserIds.has(u.id);

              return (
                <div
                  key={u.id}
                  className="bg-slate-50/80 border border-slate-200/60 rounded-2xl p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-indigo-300 hover:shadow-xs transition-all group"
                >
                  {/* Left: Student Profile Info */}
                  <div
                    onClick={() => handleOpenStudentModal(u)}
                    className="w-full md:w-64 flex-shrink-0 cursor-pointer"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-black text-slate-900 text-xs sm:text-sm group-hover:text-indigo-600 transition-colors flex items-center gap-1">
                        {u.full_name}
                        <ExternalLink size={11} className="text-slate-400 group-hover:text-indigo-600 opacity-60" />
                      </h4>

                      {u.gender === 'M' && <span className="text-[9px] bg-indigo-100 text-indigo-700 font-black px-1.5 py-0.2 rounded-md">M</span>}
                      {u.gender === 'F' && <span className="text-[9px] bg-pink-100 text-pink-700 font-black px-1.5 py-0.2 rounded-md">F</span>}

                      {isMessagedToday ? (
                        <span className="text-[9px] bg-emerald-100 text-emerald-800 font-black px-1.5 py-0.2 rounded-md flex items-center gap-0.5">
                          <Check size={9} /> Messaged
                        </span>
                      ) : missedElapsedCount > 0 ? (
                        <span className="text-[9px] bg-amber-100 text-amber-800 font-black px-1.5 py-0.2 rounded-md">
                          ⏳ Pending
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center justify-between mt-1 text-[11px] text-slate-400 font-bold">
                      <span className="truncate max-w-[140px]">{u.department || 'General'} • 📿 {u.target_chanting || 16}r</span>
                      <span className={`font-black whitespace-nowrap ${missedElapsedCount > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                        {missedElapsedCount === 0 ? '✓ 100% Logged' : `${missedElapsedCount} Missed`}
                      </span>
                    </div>
                  </div>

                  {/* Right: Day Boxes Matrix with Rounds & Daily Points */}
                  <div className="flex-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                    <div className="flex items-center gap-1.5 min-w-max">
                      {elapsedDates.map((dateStr) => {
                        const dIdx = challengeDates.indexOf(dateStr);
                        const isFilled = studentLogs.has(dateStr);
                        const dayDetail = studentDetails?.get(dateStr);
                        const rounds = dayDetail?.chanting_rounds || 0;
                        const points = dayDetail?.points_earned || 0;

                        return (
                          <button
                            key={dateStr}
                            onClick={() => handleOpenStudentModal(u)}
                            title={`Day ${dIdx + 1} (${dateStr}): ${isFilled ? `${rounds} Rounds Chanted • ${points} Points Earned` : 'Missed'}`}
                            className={`min-w-[48px] h-11 px-1 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer hover:scale-105 active:scale-95 text-center ${
                              isFilled
                                ? 'bg-emerald-500 text-white shadow-2xs'
                                : 'bg-red-500 text-white shadow-2xs'
                            }`}
                          >
                            <span className="text-[9px] font-black leading-none uppercase tracking-tighter opacity-90">D{dIdx + 1}</span>
                            {isFilled ? (
                              <>
                                <span className="text-[10px] font-black leading-tight mt-0.5">{rounds}r</span>
                                <span className="text-[8px] font-extrabold opacity-90 leading-none">+{points}p</span>
                              </>
                            ) : (
                              <span className="text-[9px] font-bold opacity-80 leading-tight mt-0.5">Missed</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>

      {/* STUDENT ACTION & REMINDER DIALOG MODAL */}
      <AnimatePresence>
        {selectedStudent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedStudent(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
            />

            {/* Dialog Container */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 15 }}
              className="relative w-full max-w-lg bg-white rounded-3xl p-5 sm:p-7 shadow-2xl z-10 border border-slate-100 space-y-5 max-h-[90vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg sm:text-xl font-black text-slate-900">{selectedStudent.full_name}</h3>
                    {selectedStudent.gender === 'M' && <span className="text-[10px] bg-indigo-100 text-indigo-700 font-black px-2 py-0.5 rounded-full">👨 Male</span>}
                    {selectedStudent.gender === 'F' && <span className="text-[10px] bg-pink-100 text-pink-700 font-black px-2 py-0.5 rounded-full">👩 Female</span>}
                    
                    {remindedUserIds.has(selectedStudent.id) && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Check size={10} /> Messaged Today
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-bold text-slate-400 mt-0.5">
                    {selectedStudent.department || 'No Dept'} • 📿 Target: {selectedStudent.target_chanting || 16} Rounds • 📱 {selectedStudent.mobile || 'No Mobile'}
                  </p>
                </div>

                <button
                  onClick={() => setSelectedStudent(null)}
                  className="p-1.5 hover:bg-slate-100 rounded-full transition-all text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Stats Chips */}
              <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100 text-center">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Points</p>
                  <p className="text-sm sm:text-base font-black text-indigo-600">{selectedStudent.total_points || 0}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Streak</p>
                  <p className="text-sm sm:text-base font-black text-orange-500">{selectedStudent.streak_count || 0}d</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Missed</p>
                  <p className={`text-sm sm:text-base font-black ${selectedStudent.missedElapsedDates?.length > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                    {selectedStudent.missedElapsedDates?.length || 0} Days
                  </p>
                </div>
              </div>

              {/* Message Box */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-black text-slate-700">
                  <span className="flex items-center gap-1.5">
                    <MessageSquare size={13} className="text-indigo-600" /> WhatsApp Reminder Draft:
                  </span>
                  <button
                    onClick={handleCopyMsg}
                    className="text-[11px] text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer font-bold"
                  >
                    {copied ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>

                <textarea
                  rows={4}
                  value={customMsg}
                  onChange={(e) => setCustomMsg(e.target.value)}
                  className="w-full p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs font-medium text-slate-800 outline-none focus:border-indigo-500 leading-relaxed resize-none"
                />
              </div>

              {/* Action CTA Buttons */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                {selectedStudent.mobile ? (
                  <>
                    <a
                      href={`tel:${selectedStudent.mobile}`}
                      onClick={() => markStudentAsMessaged(selectedStudent.id)}
                      className="flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-2xl font-bold text-xs sm:text-sm hover:bg-indigo-700 transition-all shadow-md cursor-pointer active:scale-95"
                    >
                      <Phone size={15} /> Call Student
                    </a>

                    <button
                      onClick={() => handleWhatsAppSend(selectedStudent)}
                      className="flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-2xl font-bold text-xs sm:text-sm hover:bg-emerald-700 transition-all shadow-md cursor-pointer active:scale-95"
                    >
                      <MessageSquare size={15} /> WhatsApp
                    </button>
                  </>
                ) : (
                  <p className="col-span-2 text-center text-xs font-bold text-red-500 py-1">
                    No registered mobile number for this student.
                  </p>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
