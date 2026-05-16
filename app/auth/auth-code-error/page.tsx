'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';

export default function AuthCodeErrorPage() {
  const router = useRouter();

  useEffect(() => {
    toast.error('Login failed. Please try again.', { id: 'auth-error' });
    router.push('/');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-500 font-bold">Redirecting you back to login...</p>
      </div>
    </div>
  );
}
