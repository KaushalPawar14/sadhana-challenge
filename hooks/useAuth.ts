import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';

export const useAuth = () => {
  const { setUser, setIsAdmin } = useAuthStore();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session) {
          setUser(session.user);

          // Check if admin
          const { data: isAdmin } = await supabase.rpc('is_admin', {
            user_email: session.user.email
          });
          setIsAdmin(!!isAdmin);
        } else {
          setUser(null);
          setIsAdmin(false);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [setUser, setIsAdmin]);
};
