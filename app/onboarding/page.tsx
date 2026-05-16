'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
// 1. Swap to the SSR Browser Client
import { createBrowserClient } from '@supabase/ssr';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'react-hot-toast';
import { ChevronRight, ChevronLeft, Save, Sparkles } from 'lucide-react';

const STORAGE_KEY = 'onboarding_draft';

interface OnboardingData {
  full_name: string;
  mobile: string;
  department: string;
  target_chanting: number;
  target_reading: number;
  target_hearing: number;
}

const DEFAULT_DATA: OnboardingData = {
  full_name: '',
  mobile: '',
  department: '',
  target_chanting: 16,
  target_reading: 30,
  target_hearing: 30,
};

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function OnboardingPage() {
  const router = useRouter();
  const { setIsOnboarded } = useAuthStore();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<OnboardingData>(DEFAULT_DATA);
  const [allowedFields, setAllowedFields] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFormDirty, setIsFormDirty] = useState(false);

  // 2. Initialize the SSR client so it can read your secure cookies


  useEffect(() => {
    const fetchConfig = async () => {
      const { data: settings } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'onboarding_fields')
        .single();

      if (settings) {
        setAllowedFields(JSON.parse(settings.value));
      }

      const { data: users } = await supabase
        .from('users')
        .select('department')
        .not('department', 'is', null);

      if (users) {
        const uniqueDepts = Array.from(new Set(users.map(u => u.department)));
        setDepartments(uniqueDepts.filter(Boolean) as string[]);
      }
    };

    fetchConfig();

    const draft = localStorage.getItem(STORAGE_KEY);
    if (draft) {
      setFormData(JSON.parse(draft));
    }
  }, []);

  useEffect(() => {
    if (isFormDirty) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
    }
  }, [formData, isFormDirty]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: e.target.type === 'number' ? parseInt(value) || 0 : value
    }));
    setIsFormDirty(true);
  };

  const validateStep = () => {
    if (step === 1) {
      if (allowedFields.includes('full_name') && !formData.full_name) {
        toast.error('Full Name is required');
        return false;
      }
      if (allowedFields.includes('mobile')) {
        if (!formData.mobile) {
          toast.error('Mobile Number is required');
          return false;
        }
        if (!/^\d{10}$/.test(formData.mobile)) {
          toast.error('Mobile Number must be 10 digits');
          return false;
        }
      }
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep()) setStep(step + 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // 3. Grab the user directly from the secure cookie instead of trusting the store
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        toast.error("Session missing. Please log in again.");
        router.push('/');
        return;
      }

      const { error } = await supabase
        .from('users')
        .upsert({
          id: user.id,
          ...formData,
          is_onboarded: true,
        });

      if (error) throw error;

      localStorage.removeItem(STORAGE_KEY);
      setIsFormDirty(false);
      setIsOnboarded(true);

      // 4. Force a hard router refresh so Next.js updates your layouts correctly
      toast.success('Welcome to the Sadhana Challenge! 🙏');
      router.push('/leaderboard');
      router.refresh();

    } catch (error: any) {
      console.error("Submission Error:", error);
      toast.error(error.message || 'Failed to save onboarding data');
    } finally {
      setIsLoading(false);
    }
  };

  const isFieldAllowed = (name: string) => allowedFields.length === 0 || allowedFields.includes(name);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-xl w-full"
      >
        <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-indigo-100 overflow-hidden border border-slate-100">
          <div className="bg-indigo-600 p-8 text-white text-center relative">
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden opacity-10 pointer-events-none">
              <div className="absolute top-[-50%] left-[-10%] w-[120%] h-[200%] bg-[radial-gradient(circle,white_1px,transparent_1px)] bg-[size:20px_20px]" />
            </div>
            <Sparkles className="mx-auto mb-4 text-indigo-200" size={32} />
            <h1 className="text-3xl font-bold mb-2">Set Your Intentions</h1>
            <p className="text-indigo-100 opacity-80">Phase 1: {step === 1 ? 'Personal Profile' : 'Daily Commitments'}</p>
          </div>

          <form onSubmit={handleSubmit} className="p-8 md:p-12">
            <AnimatePresence mode="wait">
              {step === 1 ? (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  {isFieldAllowed('full_name') && (
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Full Name</label>
                      <input
                        type="text"
                        name="full_name"
                        value={formData.full_name}
                        onChange={handleChange}
                        className="w-full p-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white transition-all outline-none"
                        placeholder="e.g. Arjuna Pandava"
                      />
                    </div>
                  )}

                  {isFieldAllowed('mobile') && (
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Mobile Number (10 digits)</label>
                      <input
                        type="tel"
                        name="mobile"
                        value={formData.mobile}
                        onChange={handleChange}
                        maxLength={10}
                        className="w-full p-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white transition-all outline-none"
                        placeholder="9876543210"
                      />
                    </div>
                  )}

                  {isFieldAllowed('department') && (
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Department</label>
                      <input
                        type="text"
                        name="department"
                        value={formData.department}
                        onChange={handleChange}
                        list="dept-list"
                        className="w-full p-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white transition-all outline-none"
                        placeholder="e.g. Engineering, Marketing..."
                      />
                      <datalist id="dept-list">
                        {departments.map(dept => <option key={dept} value={dept} />)}
                      </datalist>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleNext}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 mt-8"
                  >
                    Continue <ChevronRight size={20} />
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  {isFieldAllowed('target_chanting') && (
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Target Chanting (Rounds/day)</label>
                      <input
                        type="number"
                        name="target_chanting"
                        value={formData.target_chanting}
                        onChange={handleChange}
                        min={1}
                        max={108}
                        className="w-full p-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white transition-all outline-none"
                      />
                    </div>
                  )}

                  {isFieldAllowed('target_reading') && (
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Target Reading (Minutes/day)</label>
                      <input
                        type="number"
                        name="target_reading"
                        value={formData.target_reading}
                        onChange={handleChange}
                        min={5}
                        max={240}
                        className="w-full p-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white transition-all outline-none"
                      />
                    </div>
                  )}

                  {isFieldAllowed('target_hearing') && (
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Target Hearing (Minutes/day)</label>
                      <input
                        type="number"
                        name="target_hearing"
                        value={formData.target_hearing}
                        onChange={handleChange}
                        min={5}
                        max={240}
                        className="w-full p-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white transition-all outline-none"
                      />
                    </div>
                  )}

                  <div className="flex gap-4 mt-8">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="flex-1 flex items-center justify-center gap-2 bg-slate-100 text-slate-600 py-4 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                    >
                      <ChevronLeft size={20} /> Back
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="flex-[2] flex items-center justify-center gap-2 bg-green-600 text-white py-4 rounded-2xl font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-200 disabled:opacity-50"
                    >
                      {isLoading ? 'Saving...' : 'Start Challenge'} <Save size={20} />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </form>

          <div className="h-2 bg-slate-100 w-full">
            <motion.div
              className="h-full bg-indigo-600"
              initial={{ width: '33%' }}
              animate={{ width: step === 1 ? '50%' : '100%' }}
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}