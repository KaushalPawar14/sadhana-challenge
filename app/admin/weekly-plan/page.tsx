import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Target,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react';
import { percent, prototypeWeeklyPlan } from '@/lib/weeklyMilestones';

const statusStyles = {
  on_track: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  attention: 'bg-amber-50 text-amber-700 border-amber-100',
  at_risk: 'bg-red-50 text-red-700 border-red-100',
};

const statusLabels = {
  on_track: 'On track',
  attention: 'Needs attention',
  at_risk: 'At risk',
};

export default function WeeklyPlanPage() {
  const plan = prototypeWeeklyPlan;

  return (
    <div className="space-y-8 pb-12">
      <div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-900">
        Prototype view using representative students and activity. Live figures will come from the shared Supabase model.
      </div>

      <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-indigo-600">Monday milestone dashboard</p>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">This week’s preaching plan</h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">{plan.weekLabel} · {plan.guideName}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wider text-slate-400">Generated</p>
          <p className="mt-1 font-bold text-slate-800">{plan.generatedAt}</p>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Quarter position', value: `${plan.quarterProgressPercent}%`, detail: plan.quarterLabel, icon: Target, tone: 'text-indigo-600 bg-indigo-50' },
          { label: 'Active students', value: plan.activeStudents, detail: 'Across Surat cohorts', icon: UsersRound, tone: 'text-emerald-600 bg-emerald-50' },
          { label: 'Focus this week', value: plan.priorityStudents, detail: 'Students needing action', icon: UserRoundCheck, tone: 'text-amber-600 bg-amber-50' },
          { label: 'Approval queue', value: plan.approvals.length, detail: 'Nothing applied automatically', icon: ClipboardCheck, tone: 'text-purple-600 bg-purple-50' },
        ].map(({ label, value, detail, icon: Icon, tone }) => (
          <article key={label} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className={`mb-5 flex h-11 w-11 items-center justify-center rounded-2xl ${tone}`}><Icon size={22} /></div>
            <p className="text-xs font-black uppercase tracking-wider text-slate-400">{label}</p>
            <p className="mt-2 text-3xl font-black text-slate-900">{value}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">{detail}</p>
          </article>
        ))}
      </section>

      <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600"><Target size={22} /></div>
          <div>
            <h2 className="text-xl font-black text-slate-900">Quarter target position</h2>
            <p className="text-sm font-semibold text-slate-500">Target, current position and the gap that matters now.</p>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {plan.metrics.map((metric) => {
            const progress = percent(metric.actual, metric.target);
            return (
              <article key={metric.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-black text-slate-800">{metric.label}</h3>
                    <p className="mt-1 text-sm font-semibold text-slate-500">{metric.note}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wide ${statusStyles[metric.status]}`}>
                    {statusLabels[metric.status]}
                  </span>
                </div>
                <div className="mt-5 flex items-end justify-between gap-4">
                  <p className="text-2xl font-black text-slate-900">{metric.actual} <span className="text-sm text-slate-400">/ {metric.target} {metric.unit}</span></p>
                  <p className="text-sm font-black text-indigo-600">{progress}%</p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-indigo-600" style={{ width: `${progress}%` }} />
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <div className="grid gap-8 xl:grid-cols-[1.05fr_1.45fr]">
        <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><CheckCircle2 size={22} /></div>
            <div>
              <h2 className="text-xl font-black text-slate-900">Realistic milestones</h2>
              <p className="text-sm font-semibold text-slate-500">The destination for next Monday.</p>
            </div>
          </div>
          <div className="space-y-4">
            {plan.milestones.map((milestone, index) => (
              <article key={milestone.title} className="rounded-2xl border border-slate-100 p-4">
                <div className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-black text-white">{index + 1}</span>
                  <div>
                    <h3 className="font-black text-slate-800">{milestone.title}</h3>
                    <p className="mt-1 text-sm font-black text-emerald-700">{milestone.target}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-500">{milestone.reason}</p>
                    <p className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-400">Owner · {milestone.owner}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"><UserRoundCheck size={22} /></div>
            <div>
              <h2 className="text-xl font-black text-slate-900">Students to focus on</h2>
              <p className="text-sm font-semibold text-slate-500">Reason, next action and due day—not another long report.</p>
            </div>
          </div>
          <div className="space-y-4">
            {plan.focusStudents.map((student) => (
              <article key={student.name} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-black text-slate-900">{student.name}</h3>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{student.cohort}</p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-indigo-600 shadow-sm">By {student.due}</span>
                </div>
                <p className="mt-4 text-sm font-semibold text-slate-600">{student.reason}</p>
                <div className="mt-4 flex gap-3 rounded-xl bg-white p-3 text-sm font-bold text-slate-800">
                  <ArrowRight className="mt-0.5 shrink-0 text-indigo-600" size={17} />
                  <span>{student.nextAction}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-black text-slate-900"><CalendarClock className="text-indigo-600" size={20} /> This week’s constraints</h2>
          <ul className="mt-5 space-y-3">
            {plan.constraints.map((constraint) => <li key={constraint} className="flex gap-3 text-sm font-semibold text-slate-600"><Clock3 className="mt-0.5 shrink-0 text-slate-400" size={17} />{constraint}</li>)}
          </ul>
        </section>
        <section className="rounded-[2rem] border border-purple-100 bg-purple-50 p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-black text-purple-950"><AlertTriangle className="text-purple-600" size={20} /> Guide approvals</h2>
          <ul className="mt-5 space-y-3">
            {plan.approvals.map((approval) => <li key={approval} className="flex gap-3 text-sm font-bold text-purple-900"><BookOpenCheck className="mt-0.5 shrink-0 text-purple-600" size={17} />{approval}</li>)}
          </ul>
        </section>
      </div>
    </div>
  );
}
