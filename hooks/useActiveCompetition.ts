'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { ActiveCompetitionPayload } from '@/lib/competition';

/** Loads the competition that accepts activity right now (plus the next / last one and feature flags). */
export function useActiveCompetition() {
  const [data, setData] = useState<ActiveCompetitionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data: payload, error: err } = await supabase.rpc('get_active_competition');
    if (err) setError(err.message);
    else { setData(payload as ActiveCompetitionPayload); setError(null); }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, loading, error, refresh, competition: data?.competition ?? null, features: data?.features ?? null };
}
