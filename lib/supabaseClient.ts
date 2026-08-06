import { createBrowserClient } from '@supabase/ssr';

const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  configuredSupabaseUrl && supabasePublishableKey,
);

// A syntactically valid placeholder keeps static builds and private UI previews
// deterministic. Data-loading code must check isSupabaseConfigured before it
// makes a request, so this address is never treated as a fallback database.
const supabaseUrl =
  configuredSupabaseUrl ?? 'https://example.supabase.co';
const browserKey = supabasePublishableKey ?? 'public-preview-key';

export const supabase = createBrowserClient(supabaseUrl, browserKey);
