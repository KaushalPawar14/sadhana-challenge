export type ChantingBracket = {
  bracket: '0–3' | '4–7' | '8–11' | '12–15' | '16';
  actual: number;
  target: number;
};

export type CohortPulse = {
  cohort: string;
  mode: 'Push' | 'Normal' | 'Cool down' | 'Verify';
  reason: string;
  nextWindow: string;
};

export type PriorityAction = {
  student: string;
  cohort: string;
  reason: string;
  action: string;
  due: string;
};

export const commandCenterSnapshot = {
  label: 'Synthetic private-MVP snapshot',
  generatedAt: '6 August 2026 · 8:00 AM IST',
  activeStudents: 50,
  sadhanaSubmitted: 34,
  priorityStudents: 6,
  pendingApprovals: 6,
  quarter: 'Q1 · August–September 2026',
  chanting: [
    { bracket: '0–3', actual: 31, target: 30 },
    { bracket: '4–7', actual: 12, target: 20 },
    { bracket: '8–11', actual: 2, target: 0 },
    { bracket: '12–15', actual: 0, target: 0 },
    { bracket: '16', actual: 5, target: 0 },
  ] satisfies ChantingBracket[],
  quarterProgress: [
    { label: 'Personal association', actual: 1540, target: 6250, unit: 'minutes' },
    { label: 'Q1 books completed', actual: 9, target: 50, unit: 'students' },
    { label: 'FOLK–2 completed', actual: 11, target: 50, unit: 'students' },
    { label: '4–7 chanting bracket', actual: 12, target: 20, unit: 'students' },
  ],
  cohorts: [
    {
      cohort: 'SVNIT · First year',
      mode: 'Cool down',
      reason: 'Orientation and timetable settling',
      nextWindow: 'Thursday hostel session continues',
    },
    {
      cohort: 'SVNIT · Senior years',
      mode: 'Push',
      reason: 'Available before exam pressure begins',
      nextWindow: 'Build Ahmedabad trip interest',
    },
    {
      cohort: 'IIIT Surat',
      mode: 'Normal',
      reason: 'Online hearing remains suitable',
      nextWindow: 'Offer personal video-call slots',
    },
    {
      cohort: 'Local Surat colleges',
      mode: 'Verify',
      reason: 'Individual college calendars are incomplete',
      nextWindow: 'Confirm tentative exam dates',
    },
  ] satisfies CohortPulse[],
  actions: [
    {
      student: 'Aarav P.',
      cohort: 'SVNIT · First year',
      reason: 'Book paused after chapter 2; interest remains high.',
      action: 'Use one next-three-chapter curiosity prompt and offer a physical meeting.',
      due: 'Tuesday',
    },
    {
      student: 'Harsh M.',
      cohort: 'IIIT Surat · First year',
      reason: 'Consistent hearing; no personal association for 19 days.',
      action: 'Offer two video-call slots and ask what he wants to discuss.',
      due: 'Wednesday',
    },
    {
      student: 'Manav S.',
      cohort: 'Local · SCET',
      reason: 'Available time and a natural interest in design service.',
      action: 'Offer one bounded competition-design service with training.',
      due: 'Thursday',
    },
    {
      student: 'Rohan K.',
      cohort: 'SVNIT · Second year',
      reason: 'Potential RDUA leader; consistent sincerity observed.',
      action: 'Use guide judgment and invite him to conduct one trial circle.',
      due: 'Thursday',
    },
  ] satisfies PriorityAction[],
  upcoming: [
    { date: 'Every Thursday', title: 'SVNIT hostel session', state: 'Confirmed' },
    { date: 'Two weeks before Janmāṣṭamī', title: 'Online hearing and chanting competition', state: 'Planning' },
    { date: '19 September', title: 'Rādhāṣṭamī · Ahmedabad expedition', state: 'Objectives needed' },
  ],
} as const;
