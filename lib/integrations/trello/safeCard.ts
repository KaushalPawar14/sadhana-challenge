import type { OperationalCardInput } from "./types";

const privateKeyPattern =
  /(?:lit|revelation|private|psycholog|mentor[_ -]?summary|reflection|chat|sadhana)/i;

export function assertOperationalCardIsSafe(input: OperationalCardInput): void {
  const fieldsToInspect = [
    input.title,
    input.collegeLabel,
    input.actionType,
    ...input.checklist ?? [],
  ].filter(Boolean) as string[];

  if (fieldsToInspect.some((field) => privateKeyPattern.test(field))) {
    throw new Error(
      "Trello cards may contain operational context only; private student context must stay in Supabase.",
    );
  }
}

export function buildSafeCardDescription(input: OperationalCardInput): string {
  assertOperationalCardIsSafe(input);

  return [
    `CRM task: ${input.crmTaskId}`,
    input.collegeLabel ? `College/group: ${input.collegeLabel}` : undefined,
    `Action type: ${input.actionType}`,
    `Priority: ${input.priority}`,
    `Approval: ${input.approvalState}`,
    `Open in FOLK Surat CRM: ${input.crmDeepLink}`,
    "Private student notes remain in Supabase.",
  ]
    .filter(Boolean)
    .join("\n");
}
