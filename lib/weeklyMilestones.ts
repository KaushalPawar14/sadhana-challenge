export type MetricStatus = 'on_track' | 'attention' | 'at_risk';

export type QuarterMetric = {
  label: string;
  actual: number;
  target: number;
  unit: string;
  status: MetricStatus;
  note: string;
};

export type WeeklyMilestone = {
  title: string;
  target: string;
  owner: string;
  reason: string;
};

export type FocusStudent = {
  name: string;
  cohort: string;
  reason: string;
  nextAction: string;
  due: string;
};

export type WeeklyPlan = {
  generatedAt: string;
  weekLabel: string;
  quarterLabel: string;
  guideName: string;
  quarterProgressPercent: number;
  activeStudents: number;
  priorityStudents: number;
  metrics: QuarterMetric[];
  milestones: WeeklyMilestone[];
  focusStudents: FocusStudent[];
  constraints: string[];
  approvals: string[];
};

export function percent(actual: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((actual / target) * 100));
}

export const prototypeWeeklyPlan: WeeklyPlan = {
  generatedAt: 'Monday, 10 August 2026 · 8:00 AM',
  weekLabel: '10–16 August 2026',
  quarterLabel: 'Quarter 1 · Week 2 of 8',
  guideName: 'Subala Sundar Das',
  quarterProgressPercent: 18,
  activeStudents: 50,
  priorityStudents: 6,
  metrics: [
    {
      label: 'Students chanting 4–7 rounds',
      actual: 12,
      target: 20,
      unit: 'students',
      status: 'attention',
      note: 'Eight more students are required by the end of Q1.',
    },
    {
      label: 'Q1 book journey completed',
      actual: 9,
      target: 50,
      unit: 'students',
      status: 'attention',
      note: 'Prioritize students who started but stopped mid-book.',
    },
    {
      label: 'FOLK–2 module completed',
      actual: 11,
      target: 50,
      unit: 'students',
      status: 'on_track',
      note: 'Completion is counted after hearing plus a short reflection.',
    },
    {
      label: 'Personal association',
      actual: 1540,
      target: 6250,
      unit: 'minutes',
      status: 'on_track',
      note: 'Physical meetings, video calls and phone calls count here.',
    },
  ],
  milestones: [
    {
      title: 'Move suitable students toward 4 rounds',
      target: '7 personal conversations',
      owner: 'Subala Sundar Das',
      reason: 'Q1 chanting movement needs an early, relationship-led start.',
    },
    {
      title: 'Restart paused book journeys',
      target: '8 personalized book motivations',
      owner: 'Both guides',
      reason: 'These students have a known reading position but no progress this week.',
    },
    {
      title: 'Deepen personal association',
      target: '375 meaningful minutes',
      owner: 'Both guides',
      reason: 'This is realistic around the current college timetable.',
    },
    {
      title: 'Complete assigned hearing',
      target: '6 FOLK–2 completions',
      owner: 'Amal Harinam Das',
      reason: 'Six students are already more than 70% through the assigned module.',
    },
    {
      title: 'Prepare the first hostel RDUA circles',
      target: 'Confirm 2 student leaders',
      owner: 'Subala Sundar Das',
      reason: 'Leadership begins with sincerity and willingness to conduct consistently.',
    },
  ],
  focusStudents: [
    {
      name: 'Aarav P.',
      cohort: 'SVNIT · First year',
      reason: 'Three meaningful interactions; book reading stopped after chapter 2.',
      nextAction: 'Use the next-three-chapter curiosity prompt and request a hostel meeting.',
      due: 'Tuesday',
    },
    {
      name: 'Harsh M.',
      cohort: 'IIIT Surat · First year',
      reason: 'Consistent hearing, but no personal association for 19 days.',
      nextAction: 'Offer two video-call slots and ask what he wants to discuss.',
      due: 'Wednesday',
    },
    {
      name: 'Manav S.',
      cohort: 'Local · SCET',
      reason: 'Ready for seva; selected design and event coordination interests.',
      nextAction: 'Offer one bounded Janmāṣṭamī competition service with training.',
      due: 'Thursday',
    },
    {
      name: 'Rohan K.',
      cohort: 'SVNIT · Second year',
      reason: 'Potential RDUA leader; sincerity observed across four weeks.',
      nextAction: 'Discuss responsibility and invite him to conduct one trial circle.',
      due: 'Thursday',
    },
  ],
  constraints: [
    'SVNIT first-year orientation reduces evening availability on Monday and Tuesday.',
    'Local college calendars are still tentative; guides should confirm changes before automation.',
    'Thursday hostel session continues and should not be replaced by online activity.',
  ],
  approvals: [
    'Two proposed expedition discounts await FOLK-guide approval.',
    'One student-reported exam-date change awaits calendar approval.',
    'Three AI-drafted book motivations await guide review before sending.',
  ],
};
