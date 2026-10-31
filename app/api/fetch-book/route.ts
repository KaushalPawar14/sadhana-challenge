import { NextRequest, NextResponse } from 'next/server';
import dns from 'node:dns/promises';
import net from 'node:net';
import { getCaller } from '@/lib/supabase/server';

// Server-side proxy used by the .docx reader to bypass CORS. Locked down:
//  * signed-in users only, and only while the active competition uses Books (admins always)
//  * https only, host must be on the allow-list (hosts the books table really uses + well-known file hosts)
//  * private / loopback / link-local / metadata addresses are refused, on every redirect hop
//  * size and time limits
const MAX_BYTES = 25 * 1024 * 1024;
const BASE_HOSTS = ['www.dropbox.com', 'dropbox.com', 'dl.dropboxusercontent.com', 'drive.google.com', 'docs.google.com'];
const BASE_SUFFIXES = ['.dropboxusercontent.com', '.googleusercontent.com'];

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::') return true;
    if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb')) return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateIp(mapped[1]) : false;
  }
  return true;
}

async function assertSafeHost(host: string, allowed: Set<string>) {
  const ok = allowed.has(host) || BASE_SUFFIXES.some((s) => host.endsWith(s));
  if (!ok) throw new Error('Host is not allowed');
  if (net.isIP(host)) throw new Error('IP addresses are not allowed');
  const addrs = await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('Host resolves to a private address');
}

export async function GET(request: NextRequest) {
  const { user, role, supabase } = await getCaller();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!role) {
    const { data } = await supabase.rpc('get_active_competition');
    if (!data?.features?.books) return NextResponse.json({ error: 'Books are not part of the current competition.' }, { status: 403 });
  }

  const raw = new URL(request.url).searchParams.get('url');
  if (!raw) return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });

  try {
    const allowed = new Set<string>(BASE_HOSTS);
    try { allowed.add(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host); } catch { /* ignore */ }
    const { data: books } = await supabase.from('books').select('pdf_link');
    for (const b of books || []) { try { allowed.add(new URL(b.pdf_link).host.toLowerCase()); } catch { /* skip bad rows */ } }

    let current = new URL(raw);
    let res: Response | null = null;
    for (let hop = 0; hop < 4; hop++) {
      if (current.protocol !== 'https:') throw new Error('Only https links are allowed');
      await assertSafeHost(current.hostname.toLowerCase(), allowed);
      res = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        current = new URL(res.headers.get('location')!, current);
        res = null;
        continue;
      }
      break;
    }
    if (!res) throw new Error('Too many redirects');
    if (!res.ok) throw new Error(`Remote host returned HTTP ${res.status}`);

    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > MAX_BYTES) throw new Error('File is too large');
    const reader = res.body!.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) { await reader.cancel(); throw new Error('File is too large'); }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks);
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': res.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to fetch book content' }, { status: 400 });
  }
}
