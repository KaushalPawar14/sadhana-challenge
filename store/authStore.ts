import { create } from 'zustand';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

export type AdminRoleName = 'HOD' | 'FOLK_GUIDE' | 'FOLK_ENABLER_MALE' | 'FOLK_ENABLER_FEMALE';

interface AuthState {
  user: User | null;
  /** role from admin_emails (resolved by the database from the JWT email), null for students */
  adminRole: AdminRoleName | null;
  isAdmin: boolean;
  /** only the HOD may write: create competitions, bonus, awards, settings, content */
  isHod: boolean;
  isOnboarded: boolean;
  setUser: (user: User | null) => void;
  setAdminRole: (role: AdminRoleName | null) => void;
  setIsOnboarded: (isOnboarded: boolean) => void;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  adminRole: null,
  isAdmin: false,
  isHod: false,
  isOnboarded: false,
  setUser: (user) => set({ user }),
  setAdminRole: (adminRole) => set({ adminRole, isAdmin: !!adminRole, isHod: adminRole === 'HOD' }),
  setIsOnboarded: (isOnboarded) => set({ isOnboarded }),
  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, adminRole: null, isAdmin: false, isHod: false, isOnboarded: false });
    window.location.href = '/';
  },
}));
