import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAssociationAppointmentEnvelope,
  buildBirthdayDraft,
  planDailySadhanaReminders,
} from "../lib/reminderPlanner.ts";

const state = {
  localDate: "2026-08-10",
  studentId: "student-1",
  guideId: "guide-1",
};

test("missing sādhana produces 8, 11 and 5 student drafts plus a 2 PM guide digest", () => {
  const drafts = planDailySadhanaReminders(state);
  assert.deepEqual(
    drafts.map((item) => `${item.audience}:${item.localTime}`).sort(),
    ["guide:14:00", "student:08:00", "student:11:00", "student:17:00"],
  );
  assert.equal(new Set(drafts.map((item) => item.deduplicationKey)).size, drafts.length);
});

test("submitted sādhana suppresses follow-up student reminders", () => {
  const drafts = planDailySadhanaReminders({ ...state, submittedAt: "2026-08-10T08:20:00+05:30" });
  assert.deepEqual(drafts.map((item) => item.localTime), ["08:00", "14:00"]);
});

test("birthday greeting remains under 50 words", () => {
  const draft = buildBirthdayDraft({
    firstName: "Aarav",
    relationshipNote: "sincerity in our recent discussions",
    encouragingStep: "continue your daily reading and chanting",
  });
  assert.ok(draft.split(/\s+/).length <= 50);
});

test("appointment envelope remains a non-delivered approval draft", () => {
  const envelope = buildAssociationAppointmentEnvelope({
    requestId: "request-1",
    studentId: "student-1",
    guideId: "guide-1",
    startsAt: "2026-08-12T18:30:00+05:30",
    durationMinutes: 30,
    mode: "video",
  });
  assert.equal(envelope.delivery_status, "draft_requires_approval");
  assert.deepEqual(envelope.recipients.map((item) => item.role), ["student", "guide"]);
});
