'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { createBrowserClient } from '@supabase/ssr';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'react-hot-toast';
import { Save, Sparkles } from 'lucide-react';

const STORAGE_KEY = 'onboarding_draft';

interface OnboardingData {
  full_name: string;
  mobile: string;
  gender: string;
  department: string;
  age: string;
}

const DEFAULT_DATA: OnboardingData = { full_name: '', mobile: '', gender: '', department: '', age: '' };

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function OnboardingPage() {
  const router = useRouter();
  const { setIsOnboarded } = useAuthStore();
  const [formData, setFormData] = useState<OnboardingData>(DEFAULT_DATA);
  // null = no restriction configured (all fields shown); otherwise only the listed ones are shown/required
  const [allowedFields, setAllowedFields] = useState<string[] | null>(null);
  const [departments, setDepartments] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFormDirty, setIsFormDirty] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      const { data: settings } = await supabase.from('app_settings').select('value').eq('key', 'onboarding_fields').maybeSingle();
      if (settings?.value) {
        try {
          const arr = JSON.parse(settings.value);
          if (Array.isArray(arr) && arr.length) setAllowedFields(arr);
        } catch { /* show all */ }
      }
      const { data: depts } = await supabase.rpc('list_departments');
      if (Array.isArray(depts)) setDepartments(depts as string[]);
    };
    fetchConfig();

    try {
      const draft = localStorage.getItem(STORAGE_KEY);
      if (draft) setFormData({ ...DEFAULT_DATA, ...JSON.parse(draft) });
    } catch { /* ignore a corrupt draft */ }
  }, []);

  useEffect(() => {
    if (isFormDirty) localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
  }, [formData, isFormDirty]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setIsFormDirty(true);
  };

  // hidden fields are not shown and therefore not required; gender and age are always required
  const isFieldAllowed = (name: string) => allowedFields === null || allowedFields.includes(name);

  const validateFields = () => {
    if (isFieldAllowed('full_name') && !formData.full_name.trim()) { toast.error('Full Name is required'); return false; }
    if (isFieldAllowed('mobile')) {
      if (!formData.mobile.trim()) { toast.error('Mobile Number is required'); return false; }
      if (!/^\d{10}$/.test(formData.mobile)) { toast.error('Mobile Number must be exactly 10 digits'); return false; }
    }
    if (!['M', 'F'].includes(formData.gender)) { toast.error('Gender selection (M / F) is required'); return false; }
    const age = Number(formData.age);
    if (!formData.age.trim() || !Number.isInteger(age) || age < 10 || age > 100) {
      toast.error('Age is required (10 to 100)');
      return false;
    }
    if (isFieldAllowed('department') && !formData.department.trim()) { toast.error('Department is required'); return false; }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateFields()) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, age: Number(formData.age) }),
      });
      const out = await res.json().catch(() => ({}));
      if (res.status === 401) { toast.error('Session missing. Please log in again.'); router.push('/'); return; }
      if (!res.ok) throw new Error(out.error || 'Failed to save your details');

      localStorage.removeItem(STORAGE_KEY);
      setIsFormDirty(false);
      setIsOnboarded(true);
      toast.success('Welcome to the Sadhana Competitions! 🙏');
      router.push('/leaderboard');
      router.refresh();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save onboarding data');
    } finally {
      setIsLoading(false);
    }
  };

  const inputCls = 'w-full p-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white transition-all outline-none';

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-xl w-full">
        <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-indigo-100 overflow-hidden border border-slate-100">
          <div className="bg-indigo-600 p-8 text-white text-center relative">
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden opacity-10 pointer-events-none">
              <div className="absolute top-[-50%] left-[-10%] w-[120%] h-[200%] bg-[radial-gradient(circle,white_1px,transparent_1px)] bg-[size:20px_20px]" />
            </div>
            <Sparkles className="mx-auto mb-4 text-indigo-200" size={32} />
            <h1 className="text-3xl font-bold mb-2">Set Your Intentions</h1>
            <p className="text-indigo-100 opacity-80">Personal Profile</p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 sm:p-8 md:p-12">
            <div className="space-y-6">
              {isFieldAllowed('full_name') && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Full Name *</label>
                  <input type="text" name="full_name" value={formData.full_name} onChange={handleChange} className={inputCls} placeholder="e.g. Arjuna Pandava" />
                </div>
              )}

              {isFieldAllowed('mobile') && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Mobile Number (10 digits) *</label>
                  <input type="tel" inputMode="numeric" name="mobile" value={formData.mobile} onChange={handleChange} maxLength={10} className={`${inputCls} font-medium`} placeholder="9876543210" />
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Age *</label>
                <input type="number" inputMode="numeric" name="age" min={10} max={100} value={formData.age} onChange={handleChange} className={inputCls} placeholder="e.g. 20" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Gender *</label>
                <div className="grid grid-cols-2 gap-4">
                  {([['M', '👨', 'Male (M)', 'indigo'], ['F', '👩', 'Female (F)', 'pink']] as const).map(([val, emoji, label, color]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => { setFormData(prev => ({ ...prev, gender: val })); setIsFormDirty(true); }}
                      className={`p-4 rounded-2xl font-bold flex items-center justify-center gap-2 border-2 transition-all cursor-pointer ${
                        formData.gender === val
                          ? color === 'indigo'
                            ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-md shadow-indigo-100 scale-[1.02]'
                            : 'border-pink-600 bg-pink-50 text-pink-700 shadow-md shadow-pink-100 scale-[1.02]'
                          : 'border-slate-100 bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-xl">{emoji}</span>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {isFieldAllowed('department') && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Department *</label>
                  <input type="text" name="department" value={formData.department} onChange={handleChange} list="dept-list" className={inputCls} placeholder="e.g. Engineering, Commerce..." />
                  <datalist id="dept-list">
                    {departments.map(dept => <option key={dept} value={dept} />)}
                  </datalist>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 bg-green-600 text-white py-4 rounded-2xl font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-200 mt-8 disabled:opacity-50"
              >
                {isLoading ? 'Saving...' : 'Start Competing'} <Save size={20} />
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
