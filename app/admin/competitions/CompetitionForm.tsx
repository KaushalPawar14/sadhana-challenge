'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import {
  ArrowLeft, BookOpen, Flame, Layers, ChevronDown, ChevronUp, Plus, Trash2, ArrowUp, ArrowDown,
  AlertTriangle, Info, Upload, Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import { friendlyError } from '@/lib/errors';
import { addDays, istToday } from '@/lib/ist';
import {
  AWARD_CRITERIA, AWARD_ICON_KEYS, DEFAULT_CONFIG, buildRulesText, includesChanting, includesReading,
  mergeConfig, validateCompetitionInput,
  type AwardCriterion, type AwardDefinition, type Competition, type CompetitionConfig, type CompetitionType,
} from '@/lib/competition';
import { CompetitionActions, StatusBadge, ViewOnlyNote, useCompetitions } from '../_shared';

type Cfg = Record<string, any>;

const NUMERIC_KEYS: (keyof CompetitionConfig)[] = [
  'chanting_points_at_commitment', 'streak_multiplier_cap', 'shield_count', 'reading_points_per_minute',
  'reading_daily_cap_minutes', 'reading_min_session_seconds', 'weight_reading', 'weight_chanting',
  'quiz_points_per_correct', 'listen_threshold_pct', 'late_log_days',
];

/** Numeric inputs may be temporarily '' while typing: coerce them back before saving/previewing. */
function cleanConfig(cfg: Cfg): Cfg {
  const out: Cfg = { ...cfg };
  for (const k of NUMERIC_KEYS) {
    const v = out[k];
    out[k] = v === '' || v === undefined || v === null || Number.isNaN(Number(v)) ? DEFAULT_CONFIG[k] : Number(v);
  }
  out.max_quiz_bonus = out.max_quiz_bonus === '' || out.max_quiz_bonus == null ? null : Number(out.max_quiz_bonus);
  out.streak_multiplier_enabled = !!out.streak_multiplier_enabled;
  if ('use_logged_points' in out) out.use_logged_points = !!out.use_logged_points;
  return out;
}

const blankAward = (unlock: string): AwardDefinition => ({
  name: '', description: '', icon_key: 'rising_sadhaka', image_url: '', criterion: 'highest_total',
  top_n: null, gender_scope: 'all', unlock_date: unlock,
});

function NumField({
  label, help, value, onChange, step = 1, min = 0, max, placeholder,
}: {
  label: string; help: string; value: any; onChange: (v: number | '') => void;
  step?: number; min?: number; max?: number; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{label}</label>
      <input
        type="number" inputMode="decimal" step={step} min={min} max={max} placeholder={placeholder}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200/70 outline-none focus:border-indigo-500 font-bold text-slate-700 text-sm"
      />
      <p className="text-[11px] text-slate-500 font-medium mt-1 leading-snug">{help}</p>
    </div>
  );
}

const TYPE_CARDS: { value: CompetitionType; title: string; text: string; icon: React.ElementType }[] = [
  { value: 'reading', title: 'Reading', text: 'Students read books in the app; minutes earn points.', icon: BookOpen },
  { value: 'chanting', title: 'Chanting', text: 'Students log daily japa rounds against their commitment.', icon: Flame },
  { value: 'both', title: 'Both', text: 'Reading and chanting are scored together with weights.', icon: Layers },
];

export default function CompetitionForm({ competitionId }: { competitionId?: string }) {
  const router = useRouter();
  const { isHod, adminRole } = useAuthStore();
  const { list, loading: listLoading, reload } = useCompetitions();
  const existing: Competition | undefined = useMemo(() => list.find((c) => c.id === competitionId), [list, competitionId]);

  const today = istToday();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [cover, setCover] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDays(today, 14));
  const [type, setType] = useState<CompetitionType>('chanting');
  const [bonus, setBonus] = useState(false);
  const [cfg, setCfg] = useState<Cfg>({ ...DEFAULT_CONFIG });
  const [awards, setAwards] = useState<AwardDefinition[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(!competitionId);

  // hydrate when editing
  useEffect(() => {
    if (!competitionId || !existing || loaded) return;
    setTitle(existing.title);
    setDescription(existing.description || '');
    setCover(existing.cover_photo_url || '');
    setStartDate(existing.start_date);
    setEndDate(existing.end_date);
    setType(existing.type);
    setBonus(existing.bonus_enabled);
    setCfg({ ...existing.config });
    (async () => {
      const { data, error } = await supabase
        .from('competition_awards')
        .select('id,award_key,name,description,icon_key,image_url,criterion,top_n,gender_scope,unlock_date,sort_order')
        .eq('competition_id', competitionId)
        .order('sort_order');
      if (error) toast.error(friendlyError(error));
      else setAwards((data as AwardDefinition[]) || []);
      setLoaded(true);
    })();
  }, [competitionId, existing, loaded]);

  const isFinalized = existing?.stored_status === 'finalized';
  const isDraftOrNew = !existing || existing.stored_status === 'draft';
  const readOnly = !isHod || isFinalized;
  const hasLoggedPointsFlag = 'use_logged_points' in cfg && (cfg.use_logged_points || cfg.migrated_from);
  const runningWarning = !!existing && existing.stored_status === 'published' && existing.status !== 'scheduled';

  const setC = (k: string, v: any) => setCfg((p) => ({ ...p, [k]: v }));

  const rules = useMemo(
    () => buildRulesText({ type, bonus_enabled: bonus, start_date: startDate, end_date: endDate, config: mergeConfig(cleanConfig(cfg) as Partial<CompetitionConfig>) }),
    [type, bonus, startDate, endDate, cfg]
  );

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `campaign-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('avatars').upload(fileName, file);
      if (error) {
        const { error: fbError } = await supabase.storage.from('public').upload(fileName, file);
        if (fbError) throw fbError;
        setCover(supabase.storage.from('public').getPublicUrl(fileName).data.publicUrl);
      } else {
        setCover(supabase.storage.from('avatars').getPublicUrl(fileName).data.publicUrl);
      }
      toast.success('Image uploaded 📸');
    } catch {
      toast.error('Upload failed. You can paste any direct image URL instead.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const save = async (status: 'draft' | 'published') => {
    const config = cleanConfig(cfg);
    const problem = validateCompetitionInput({ title, type, start_date: startDate, end_date: endDate, config: config as Partial<CompetitionConfig> });
    if (problem) return toast.error(problem);
    if (awards.some((a) => !a.name.trim())) return toast.error('Every award needs a name.');
    if (awards.some((a) => a.criterion === 'top_n_total' && !(Number(a.top_n) >= 1))) return toast.error('“Top N” awards need N ≥ 1.');
    if (status === 'published' && !confirm(`Publish “${title.trim()}”? Students will see it${startDate <= today ? ' immediately' : ` from ${startDate}`}.`)) return;

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        title, description, cover_photo_url: cover, type, bonus_enabled: bonus,
        start_date: startDate, end_date: endDate, status, config,
      };
      if (competitionId) payload.id = competitionId;
      const { data: id, error } = await supabase.rpc('save_competition', { p: payload });
      if (error) throw error;
      const cid = (id as string) || competitionId!;

      if (competitionId) {
        const { error: aErr } = await supabase.rpc('save_competition_awards', {
          p_comp: cid,
          p: awards.map((a) => ({
            id: a.id, award_key: a.award_key, name: a.name, description: a.description, icon_key: a.icon_key,
            image_url: a.image_url, criterion: a.criterion, top_n: a.criterion === 'top_n_total' ? a.top_n : null,
            gender_scope: a.gender_scope, unlock_date: a.unlock_date,
          })),
        });
        if (aErr) throw aErr;
      }

      toast.success(status === 'published' ? 'Competition saved & published 🎉' : 'Saved ✔');
      await reload();
      if (!competitionId) router.replace(`/admin/competitions/${cid}`);
      else setLoaded(false); // re-hydrate from the saved rows (picks up award ids)
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const updateAward = (i: number, patch: Partial<AwardDefinition>) =>
    setAwards((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  const moveAward = (i: number, dir: -1 | 1) =>
    setAwards((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  if (competitionId && listLoading) return <div className="p-10 text-center text-slate-400 font-bold">Loading…</div>;
  if (competitionId && !existing) {
    return (
      <div className="p-10 text-center space-y-3">
        <p className="text-slate-500 font-bold">Competition not found.</p>
        <Link href="/admin/competitions" className="text-indigo-600 font-black text-sm">← Back to competitions</Link>
      </div>
    );
  }

  const inputCls = 'w-full p-3.5 rounded-xl bg-slate-50 border border-slate-200/70 outline-none focus:border-indigo-500 font-bold text-slate-700 text-sm disabled:opacity-70';
  const labelCls = 'block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5';
  const showChanting = includesChanting(type);
  const showReading = includesReading(type);

  return (
    <div className="space-y-6 pb-16 max-w-4xl">
      <div className="space-y-3">
        <Link href="/admin/competitions" className="inline-flex items-center gap-1.5 text-xs font-black text-slate-500 hover:text-indigo-600">
          <ArrowLeft size={14} /> All competitions
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">{existing ? 'Competition' : 'New competition'}</h2>
            {existing && <StatusBadge status={existing.status} />}
          </div>
          {existing && <CompetitionActions c={existing} isHod={isHod} onDone={() => reload()} onDeleted={() => router.replace('/admin/competitions')} />}
        </div>
      </div>

      {!isHod && <ViewOnlyNote role={adminRole} />}
      {isFinalized && (
        <div className="flex gap-2 p-4 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-800 text-xs font-bold">
          <Info size={16} className="flex-shrink-0 mt-0.5" /> This competition is finalized: results and awards are frozen and it can no longer be edited.
        </div>
      )}
      {runningWarning && !readOnly && (
        <div className="flex gap-2 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          This competition has already started. Changing its type, dates, bonus or scoring will rebuild every student’s totals from their logs when you save.
        </div>
      )}

      <fieldset disabled={readOnly} className="space-y-6 min-w-0">
        {/* Basics */}
        <section className="bg-white rounded-3xl border border-slate-100 shadow-md p-5 sm:p-7 space-y-5">
          <h3 className="text-lg font-black text-slate-800">Basics</h3>
          <div>
            <label className={labelCls}>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Janmashtami Chanting Challenge" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Description (optional)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${inputCls} resize-y font-medium`} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Start date (IST)</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`${inputCls} admin-date-field`} />
            </div>
            <div>
              <label className={labelCls}>End date (IST, included)</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={`${inputCls} admin-date-field`} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Cover photo</label>
            <div className="flex gap-3 items-center">
              <input type="url" value={cover} onChange={(e) => setCover(e.target.value)} placeholder="https://example.com/image.jpg" className={`${inputCls} flex-1`} />
              <input type="file" id="competition-cover-upload" accept="image/*" onChange={handleImageUpload} className="hidden" />
              <label
                htmlFor="competition-cover-upload"
                className="px-4 py-3.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl font-black cursor-pointer whitespace-nowrap text-xs uppercase tracking-widest flex items-center gap-1.5"
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload
              </label>
            </div>
            {cover && (
              <div className="mt-3 flex items-center gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cover} alt="Preview" className="w-12 h-12 rounded-full object-cover border-2 border-indigo-100" />
                <span className="text-xs font-bold text-slate-500 truncate flex-1">{cover}</span>
              </div>
            )}
          </div>
        </section>

        {/* Type + bonus */}
        <section className="bg-white rounded-3xl border border-slate-100 shadow-md p-5 sm:p-7 space-y-5">
          <h3 className="text-lg font-black text-slate-800">What are students competing in?</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TYPE_CARDS.map((t) => {
              const Icon = t.icon;
              const on = type === t.value;
              return (
                <button
                  key={t.value} type="button" onClick={() => setType(t.value)} aria-pressed={on}
                  className={`text-left p-4 rounded-2xl border-2 transition-all cursor-pointer disabled:cursor-not-allowed ${
                    on ? 'border-indigo-600 bg-indigo-50 shadow-md shadow-indigo-100' : 'border-slate-100 bg-slate-50 hover:bg-slate-100'
                  }`}
                >
                  <Icon size={22} className={on ? 'text-indigo-600' : 'text-slate-400'} />
                  <p className={`font-black mt-2 ${on ? 'text-indigo-700' : 'text-slate-700'}`}>{t.title}</p>
                  <p className="text-[11px] font-medium text-slate-500 mt-0.5 leading-snug">{t.text}</p>
                </button>
              );
            })}
          </div>
          <div>
            <label className={labelCls}>Include bonus?</label>
            <div className="inline-flex rounded-xl border border-slate-200 overflow-hidden">
              {[true, false].map((v) => (
                <button
                  key={String(v)} type="button" onClick={() => setBonus(v)} aria-pressed={bonus === v}
                  className={`px-6 py-2.5 text-sm font-black transition-all cursor-pointer disabled:cursor-not-allowed ${bonus === v ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                >
                  {v ? 'Yes' : 'No'}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-1.5">
              Bonus = audiobook quizzes (graded on the server) and HOD bonus points. Books and Podcast sections appear for students only when they are needed.
            </p>
          </div>
        </section>

        {/* Advanced scoring */}
        <section className="bg-white rounded-3xl border border-slate-100 shadow-md overflow-hidden">
          <button type="button" onClick={() => setAdvancedOpen((o) => !o)} className="w-full flex items-center justify-between p-5 sm:p-7 text-left cursor-pointer">
            <div>
              <h3 className="text-lg font-black text-slate-800">Advanced scoring</h3>
              <p className="text-xs text-slate-500 font-bold mt-0.5">Defaults are pre-filled — only change them if you need to.</p>
            </div>
            {advancedOpen ? <ChevronUp /> : <ChevronDown />}
          </button>
          {advancedOpen && (
            <div className="px-5 sm:px-7 pb-7 space-y-7">
              {hasLoggedPointsFlag && (
                <div className="flex gap-2 p-4 rounded-2xl bg-sky-50 border border-sky-100 text-sky-900 text-xs font-bold">
                  <Info size={16} className="flex-shrink-0 mt-0.5" />
                  <div className="space-y-2">
                    <p>Historical per-day points are preserved (migrated competition): each day keeps the points students were shown, instead of the formula below.</p>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={!!cfg.use_logged_points} onChange={(e) => setC('use_logged_points', e.target.checked)} />
                      Keep historical per-day points (untick to rescore from the formula)
                    </label>
                  </div>
                </div>
              )}

              {showChanting && (
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-widest text-orange-600">Chanting</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <NumField label="Points at 100% of commitment" value={cfg.chanting_points_at_commitment} onChange={(v) => setC('chanting_points_at_commitment', v)}
                      help="Base points = (rounds ÷ commitment) × this number. Default 10." />
                    <NumField label="Streak shields" value={cfg.shield_count} onChange={(v) => setC('shield_count', v)}
                      help="How many single missed days are forgiven without breaking the streak. Default 1." />
                    <div>
                      <label className={labelCls}>Streak multiplier</label>
                      <label className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200/70 text-sm font-bold text-slate-700 cursor-pointer">
                        <input type="checkbox" checked={!!cfg.streak_multiplier_enabled} onChange={(e) => setC('streak_multiplier_enabled', e.target.checked)} />
                        Multiply daily points by the streak
                      </label>
                      <p className="text-[11px] text-slate-500 font-medium mt-1">Day 1 = 1×, day 2 = 2× … rewards consistency.</p>
                    </div>
                    <NumField label="Streak multiplier cap" min={1} value={cfg.streak_multiplier_cap} onChange={(v) => setC('streak_multiplier_cap', v)}
                      help="The multiplier never goes above this. Default 5." />
                  </div>
                </div>
              )}

              {showReading && (
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-widest text-indigo-600">Reading</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <NumField label="Points per minute" step={0.1} value={cfg.reading_points_per_minute} onChange={(v) => setC('reading_points_per_minute', v)}
                      help="Points for each full minute read. Default 1." />
                    <NumField label="Daily cap (minutes)" value={cfg.reading_daily_cap_minutes} onChange={(v) => setC('reading_daily_cap_minutes', v)}
                      help="Minutes beyond this per day earn nothing. Default 60." />
                    <NumField label="Minimum session (seconds)" value={cfg.reading_min_session_seconds} onChange={(v) => setC('reading_min_session_seconds', v)}
                      help="Reading sessions shorter than this are ignored. Default 10." />
                  </div>
                </div>
              )}

              {type === 'both' && (
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-widest text-emerald-600">Combined weights</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <NumField label="Chanting weight" step={0.1} value={cfg.weight_chanting} onChange={(v) => setC('weight_chanting', v)}
                      help="Total = chanting × this + reading × reading weight + bonus. Default 1." />
                    <NumField label="Reading weight" step={0.1} value={cfg.weight_reading} onChange={(v) => setC('weight_reading', v)}
                      help="Use 2 to make reading count double. Default 1." />
                  </div>
                </div>
              )}

              {bonus && (
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-widest text-amber-600">Bonus</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <NumField label="Points per correct quiz answer" value={cfg.quiz_points_per_correct} onChange={(v) => setC('quiz_points_per_correct', v)}
                      help="Graded on the server. Default 5." />
                    <NumField label="Listening needed to unlock quiz (%)" min={1} max={100} value={cfg.listen_threshold_pct} onChange={(v) => setC('listen_threshold_pct', v)}
                      help="Share of the audiobook a student must listen to. Default 80." />
                    <NumField label="Max quiz bonus per student (optional)" placeholder="no cap" value={cfg.max_quiz_bonus} onChange={(v) => setC('max_quiz_bonus', v)}
                      help="Total quiz points one student can earn in this competition. Leave empty for no cap." />
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">General</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <NumField label="Late submission window (days)" value={cfg.late_log_days} onChange={(v) => setC('late_log_days', v)}
                    help="How many days later a missed day may still be submitted (also the grace after the end date). Default 1." />
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Awards */}
        <section className="bg-white rounded-3xl border border-slate-100 shadow-md p-5 sm:p-7 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-black text-slate-800">Awards</h3>
              <p className="text-xs text-slate-500 font-bold mt-0.5">Winners are confirmed by you after the competition ends (Finalize results).</p>
            </div>
            {competitionId && (
              <button type="button" onClick={() => setAwards((p) => [...p, blankAward(addDays(endDate, 1))])}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs font-black cursor-pointer">
                <Plus size={14} /> Add award
              </button>
            )}
          </div>

          {!competitionId ? (
            <div className="flex gap-2 p-4 rounded-2xl bg-slate-50 border border-slate-100 text-slate-600 text-xs font-bold">
              <Info size={16} className="flex-shrink-0 mt-0.5" />
              Default awards (Rising Sadhaka, Unbroken Flame, Mahayogi Crown{bonus ? ', Active Entity, Jijnasu Scholar' : ''}) are created when you save. You can edit, add, reorder or remove them afterwards.
            </div>
          ) : awards.length === 0 ? (
            <p className="text-sm font-bold text-slate-400 text-center py-4">No awards yet.</p>
          ) : (
            <div className="space-y-4">
              {awards.map((a, i) => (
                <div key={a.id || `new-${i}`} className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50/60 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Award {i + 1}</span>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => moveAward(i, -1)} disabled={i === 0} aria-label="Move up" className="p-1.5 rounded-lg hover:bg-white text-slate-500 disabled:opacity-30 cursor-pointer"><ArrowUp size={15} /></button>
                      <button type="button" onClick={() => moveAward(i, 1)} disabled={i === awards.length - 1} aria-label="Move down" className="p-1.5 rounded-lg hover:bg-white text-slate-500 disabled:opacity-30 cursor-pointer"><ArrowDown size={15} /></button>
                      <button type="button" onClick={() => setAwards((p) => p.filter((_, idx) => idx !== i))} aria-label="Remove award" className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 cursor-pointer"><Trash2 size={15} /></button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Name</label>
                      <input value={a.name} onChange={(e) => updateAward(i, { name: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Criterion</label>
                      <select value={a.criterion} onChange={(e) => updateAward(i, { criterion: e.target.value as AwardCriterion })} className={inputCls}>
                        {AWARD_CRITERIA.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                      <p className="text-[11px] text-slate-500 font-medium mt-1">{AWARD_CRITERIA.find((c) => c.value === a.criterion)?.help}</p>
                    </div>
                    {a.criterion === 'top_n_total' && (
                      <div>
                        <label className={labelCls}>N (how many winners)</label>
                        <input type="number" min={1} max={50} value={a.top_n ?? ''} onChange={(e) => updateAward(i, { top_n: e.target.value === '' ? null : Number(e.target.value) })} className={inputCls} />
                      </div>
                    )}
                    <div>
                      <label className={labelCls}>Open to</label>
                      <select value={a.gender_scope} onChange={(e) => updateAward(i, { gender_scope: e.target.value as 'all' | 'M' | 'F' })} className={inputCls}>
                        <option value="all">Everyone</option>
                        <option value="M">Male students only</option>
                        <option value="F">Female students only</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Unlock date (IST)</label>
                      <input type="date" value={a.unlock_date} onChange={(e) => updateAward(i, { unlock_date: e.target.value })} className={`${inputCls} admin-date-field`} />
                    </div>
                    <div>
                      <label className={labelCls}>Icon</label>
                      <select value={a.icon_key || ''} onChange={(e) => updateAward(i, { icon_key: e.target.value || null })} className={inputCls}>
                        <option value="">(use image URL)</option>
                        {AWARD_ICON_KEYS.map((k) => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Custom image URL (optional)</label>
                      <input type="url" value={a.image_url || ''} onChange={(e) => updateAward(i, { image_url: e.target.value })} placeholder="https://…" className={inputCls} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Description</label>
                      <textarea value={a.description || ''} onChange={(e) => updateAward(i, { description: e.target.value })} rows={2} className={`${inputCls} resize-y font-medium`} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </fieldset>

      {/* Rules preview */}
      <section className="bg-gradient-to-br from-amber-50/60 to-indigo-50/40 rounded-3xl border border-amber-100 p-5 sm:p-7 space-y-4">
        <div>
          <h3 className="text-lg font-black text-slate-800">What students will read</h3>
          <p className="text-xs text-slate-500 font-bold mt-0.5">Generated live from the settings above.</p>
        </div>
        <div className="space-y-4">
          {rules.map((s) => (
            <div key={s.heading}>
              <h4 className="text-[11px] font-black uppercase tracking-widest text-indigo-700 mb-1.5">{s.heading}</h4>
              <ul className="space-y-1.5 text-xs text-slate-700 font-semibold leading-relaxed list-disc pl-4">
                {s.items.map((it, i) => <li key={i}>{it}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {!readOnly && (
        <div className="flex flex-col sm:flex-row gap-3 sticky bottom-3 z-10">
          {isDraftOrNew ? (
            <>
              <button type="button" onClick={() => save('draft')} disabled={saving}
                className="flex-1 py-4 rounded-2xl font-black bg-white text-slate-700 border border-slate-200 shadow-lg hover:bg-slate-50 transition-all cursor-pointer disabled:opacity-60">
                {saving ? 'Saving…' : 'Save draft'}
              </button>
              <button type="button" onClick={() => save('published')} disabled={saving}
                className="flex-1 py-4 rounded-2xl font-black bg-indigo-600 text-white shadow-xl shadow-indigo-200 hover:bg-indigo-700 transition-all cursor-pointer disabled:opacity-60">
                {saving ? 'Saving…' : 'Save & publish'}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => save(existing?.stored_status === 'archived' ? 'draft' : 'published')} disabled={saving}
              className="flex-1 py-4 rounded-2xl font-black bg-indigo-600 text-white shadow-xl shadow-indigo-200 hover:bg-indigo-700 transition-all cursor-pointer disabled:opacity-60">
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
