'use client';

import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleGauge,
  ClipboardCheck,
  Clock3,
  Database,
  Target,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { commandCenterSnapshot as snapshot } from '@/lib/dashboardSnapshot';

const modeStyles = {
  Push: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Normal: 'bg-blue-50 text-blue-700 border-blue-200',
  'Cool down': 'bg-amber-50 text-amber-700 border-amber-200',
  Verify: 'bg-purple-50 text-purple-700 border-purple-200',
};

function progress(actual: number, target: number) {
  if (target <= 0) return actual > 0 ? 100 : 0;
  return Math.min(100, Math.round((actual / target) * 100));
}

export default function AdminDashboard() {
  const completionRate = Math.round(
    (snapshot.sadhanaSubmitted / snapshot.activeStudents) * 100,
  );

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-indigo-600">
            FOLK Surat command centre
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            What needs attention today?
          </h1>
          <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-500">
            Quarter position, student priorities, calendar pressure and approvals in one guide-facing view.
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-bold text-amber-900">
          {snapshot.label} · no real-student activity
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'Active students', value: snapshot.activeStudents, detail: 'Surat total', icon: UsersRound, tone: 'bg-indigo-50 text-indigo-600' },
          { label: 'Sādhana today', value: `${completionRate}%`, detail: `${snapshot.sadhanaSubmitted} of ${snapshot.activeStudents}`, icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-600' },
          { label: 'Priority students', value: snapshot.priorityStudents, detail: 'Need one action', icon: UserRoundCheck, tone: 'bg-amber-50 text-amber-600' },
          { label: 'Approvals', value: snapshot.pendingApprovals, detail: 'Nothing automatic', icon: ClipboardCheck, tone: 'bg-purple-50 text-purple-600' },
          { label: 'Corpus ready', value: '737', detail: 'Local reviewed sources', icon: Database, tone: 'bg-sky-50 text-sky-600' },
        ].map(({ label, value, detail, icon: Icon, tone }) => (
          <article key={label} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tone}`}><Icon size={21} /></div>
            <p className="mt-5 text-xs font-black uppercase tracking-wider text-slate-400">{label}</p>
            <p className="mt-1 text-3xl font-black text-slate-950">{value}</p>
            <p className="mt-1 text-xs font-bold text-slate-500">{detail}</p>
          </article>
        ))}
      </section>

      <div className="grid gap-7 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-black text-slate-900"><CircleGauge className="text-indigo-600" /> Chanting distribution</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">Exclusive brackets; every student appears once.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{snapshot.quarter}</span>
          </div>
          <div className="mt-6 h-72 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={288}>
              <BarChart data={snapshot.chanting} margin={{ left: -22, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="bracket" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700 }} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 14, borderColor: '#e2e8f0', fontWeight: 700 }} />
                <Legend />
                <Bar dataKey="actual" name="Current" fill="#4f46e5" radius={[8, 8, 0, 0]} />
                <Bar dataKey="target" name="Q1 target" fill="#f59e0b" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">
            Q1 targets intentionally include no target above 7 rounds. Students already above that level remain visible as actual progress and are not folded into lower brackets.
          </p>
        </section>

        <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="flex items-center gap-2 text-xl font-black text-slate-900"><Target className="text-indigo-600" /> Quarter position</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">Current result against the independent Q1 target.</p>
          <div className="mt-6 space-y-5">
            {snapshot.quarterProgress.map((metric) => {
              const value = progress(metric.actual, metric.target);
              return (
                <div key={metric.label}>
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="font-black text-slate-800">{metric.label}</p>
                      <p className="text-xs font-semibold text-slate-500">{metric.actual} / {metric.target} {metric.unit}</p>
                    </div>
                    <span className="text-sm font-black text-indigo-600">{value}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${value}%` }} /></div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm sm:p-7">
        <h2 className="flex items-center gap-2 text-xl font-black text-slate-900"><CalendarDays className="text-indigo-600" /> Different strokes for different colleges</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">Calendar pressure changes the preaching pace; guide approval controls tentative dates.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {snapshot.cohorts.map((item) => (
            <article key={item.cohort} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wide ${modeStyles[item.mode]}`}>{item.mode}</span>
              <h3 className="mt-4 font-black text-slate-900">{item.cohort}</h3>
              <p className="mt-2 text-sm font-semibold text-slate-600">{item.reason}</p>
              <p className="mt-3 text-xs font-black text-indigo-600">{item.nextWindow}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-7 xl:grid-cols-[1.35fr_0.65fr]">
        <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="flex items-center gap-2 text-xl font-black text-slate-900"><UserRoundCheck className="text-amber-600" /> Students to focus on</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">Evidence, one next action and a due day—not fifty fields.</p>
          <div className="mt-6 divide-y divide-slate-100">
            {snapshot.actions.map((item) => (
              <article key={item.student} className="grid gap-3 py-5 first:pt-0 md:grid-cols-[0.8fr_1.2fr_auto] md:items-center">
                <div><p className="font-black text-slate-900">{item.student}</p><p className="text-xs font-bold text-slate-400">{item.cohort}</p></div>
                <div><p className="text-sm font-semibold text-slate-600">{item.reason}</p><p className="mt-2 flex gap-2 text-sm font-black text-indigo-700"><ArrowRight className="mt-0.5 shrink-0" size={16} />{item.action}</p></div>
                <span className="w-fit rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">{item.due}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-100 bg-slate-950 p-6 text-white shadow-sm">
          <h2 className="flex items-center gap-2 text-xl font-black"><Clock3 className="text-amber-400" /> Upcoming operations</h2>
          <div className="mt-6 space-y-4">
            {snapshot.upcoming.map((item) => (
              <article key={item.title} className="rounded-2xl bg-white/7 p-4 ring-1 ring-white/10">
                <p className="text-xs font-black uppercase tracking-wide text-amber-300">{item.date}</p>
                <h3 className="mt-2 font-black">{item.title}</h3>
                <p className="mt-2 text-xs font-semibold text-slate-300">{item.state}</p>
              </article>
            ))}
          </div>
          <div className="mt-5 flex gap-3 rounded-2xl bg-purple-400/10 p-4 text-sm font-semibold text-purple-100 ring-1 ring-purple-300/20">
            <AlertTriangle className="mt-0.5 shrink-0" size={18} />
            Discounts, calendar corrections and personalized guidance remain approval drafts.
          </div>
        </section>
      </div>

      <footer className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-xs font-semibold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>Source: synthetic fixture + approved Q1 targets · generated {snapshot.generatedAt}</span>
        <span>Live Supabase replaces this snapshot only after authenticated test identities exist.</span>
      </footer>
    </div>
  );
}
