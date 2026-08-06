export type SadhanaReminderState = {
  localDate: string;
  studentId: string;
  guideId: string;
  submittedAt?: string;
};

export type ReminderDraft = {
  audience: "student" | "guide";
  localTime: "08:00" | "11:00" | "14:00" | "17:00";
  kind: "morning" | "missing" | "guide_digest" | "final";
  deduplicationKey: string;
};

export function planDailySadhanaReminders(state: SadhanaReminderState): ReminderDraft[] {
  const base = `${state.localDate}:${state.studentId}`;
  const drafts: ReminderDraft[] = [
    {
      audience: "student",
      localTime: "08:00",
      kind: "morning",
      deduplicationKey: `${base}:08:00`,
    },
  ];

  if (!state.submittedAt) {
    drafts.push(
      {
        audience: "student",
        localTime: "11:00",
        kind: "missing",
        deduplicationKey: `${base}:11:00`,
      },
      {
        audience: "student",
        localTime: "17:00",
        kind: "final",
        deduplicationKey: `${base}:17:00`,
      },
    );
  }

  drafts.push({
    audience: "guide",
    localTime: "14:00",
    kind: "guide_digest",
    deduplicationKey: `${state.localDate}:${state.guideId}:digest:14:00`,
  });
  return drafts;
}

export function buildBirthdayDraft(input: {
  firstName: string;
  relationshipNote?: string;
  encouragingStep?: string;
}): string {
  const relationship = input.relationshipNote?.trim()
    ? `Your ${input.relationshipNote.trim()} has been heartening.`
    : "It is wonderful to have you in our association.";
  const step = input.encouragingStep?.trim() || "keep hearing and chanting steadily";
  const message = `Hare Krishna ${input.firstName}! Wishing you a joyful birthday. ${relationship} May Śrī Krishna bless you as you ${step}. We look forward to growing together in Krishna consciousness.`;

  if (message.split(/\s+/).length > 50) {
    return `Hare Krishna ${input.firstName}! Wishing you a joyful birthday. May Śrī Krishna bless you as you ${step}. We look forward to growing together in Krishna consciousness.`;
  }
  return message;
}

export function buildAssociationAppointmentEnvelope(input: {
  requestId: string;
  studentId: string;
  guideId: string;
  startsAt: string;
  durationMinutes: number;
  mode: "physical" | "video" | "phone";
  meetingUrl?: string;
}) {
  return {
    schema: "folk-surat.association-appointment.v1",
    request_id: input.requestId,
    recipients: [
      { role: "student", user_id: input.studentId },
      { role: "guide", user_id: input.guideId },
    ],
    appointment: {
      starts_at: input.startsAt,
      duration_minutes: input.durationMinutes,
      mode: input.mode,
      meeting_url: input.meetingUrl ?? null,
    },
    delivery_status: "draft_requires_approval",
  } as const;
}
