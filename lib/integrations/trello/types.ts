export const trelloWorkflowLists = [
  "New recommendations",
  "Approved for action",
  "This week",
  "Scheduled / waiting",
  "Completed",
  "Needs HOD decision",
] as const;

export type TrelloMode = "mock" | "test" | "live";

export type OperationalCardInput = {
  crmTaskId: string;
  title: string;
  collegeLabel?: string;
  actionType: string;
  priority: "low" | "normal" | "high" | "urgent";
  approvalState: string;
  dueAt?: string;
  crmDeepLink: string;
  checklist?: string[];
};

export type TrelloCard = {
  id: string;
  name: string;
  url: string;
  idList: string;
  due: string | null;
};

export type TrelloWebhookAction = {
  id: string;
  type: string;
  date: string;
  data?: Record<string, unknown>;
};

export type TrelloWebhookPayload = {
  action: TrelloWebhookAction;
  model?: { id?: string; name?: string };
};
