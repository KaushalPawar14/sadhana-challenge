'use client';

import React, { useEffect, useState } from 'react';
import { Sun, Moon, Palette } from 'lucide-react';

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<string>('default');

  useEffect(() => {
    setTheme(localStorage.getItem('app_theme') || 'default');
  }, []);

  const selectTheme = (newTheme: string) => {
    localStorage.setItem('app_theme', newTheme);
    setTheme(newTheme);
    window.dispatchEvent(new Event('theme-change'));
  };

  return (
    <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-2xl border border-slate-200/50 shadow-inner flex-shrink-0 theme-switch-panel">
      <button
        onClick={() => selectTheme('default')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
          theme === 'default'
            ? 'bg-white text-indigo-600 shadow-sm scale-105'
            : 'text-slate-500 hover:text-indigo-600'
        }`}
      >
        <Sun size={12} strokeWidth={2.5} />
        <span className="hidden sm:inline">Light</span>
      </button>
      <button
        onClick={() => selectTheme('dark')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
          theme === 'dark'
            ? 'bg-slate-900 text-white shadow-sm scale-105'
            : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        <Moon size={12} strokeWidth={2.5} />
        <span className="hidden sm:inline">Dark</span>
      </button>
      <button
        onClick={() => selectTheme('cream')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
          theme === 'cream'
            ? 'bg-[#ebdccb] text-[#4e3629] shadow-sm scale-105'
            : 'text-slate-500 hover:text-[#4e3629]'
        }`}
      >
        <Palette size={12} strokeWidth={2.5} />
        <span className="hidden sm:inline">Cream</span>
      </button>
    </div>
  );
}
