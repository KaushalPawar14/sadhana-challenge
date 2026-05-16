import { create } from 'zustand';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

interface AuthState {
  user: User | null;
  isAdmin: boolean;
  isOnboarded: boolean;
  setUser: (user: User | null) => void;
  setIsAdmin: (isAdmin: boolean) => void;
  setIsOnboarded: (isOnboarded: boolean) => void;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAdmin: false,
  isOnboarded: false,
  setUser: (user) => set({ user }),
  setIsAdmin: (isAdmin) => set({ isAdmin }),
  setIsOnboarded: (isOnboarded) => set({ isOnboarded }),
  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, isAdmin: false, isOnboarded: false });
    window.location.href = '/';
  },
}));
