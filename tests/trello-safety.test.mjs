import assert from "node:assert/strict";
import test from "node:test";
import { createTrelloWebhookSignature, verifyTrelloWebhookSignature } from "../lib/integrations/trello/signature.ts";
import { buildSafeCardDescription } from "../lib/integrations/trello/safeCard.ts";

const safeCard = {
  crmTaskId: "task-101",
  title: "Offer two association slots",
  collegeLabel: "IIIT Surat",
  actionType: "association_scheduling",
  priority: "high",
  approvalState: "approved",
  crmDeepLink: "https://crm.invalid/tasks/task-101",
};

test("safe Trello description contains operational context only", () => {
  const description = buildSafeCardDescription(safeCard);
  assert.match(description, /CRM task: task-101/);
  assert.match(description, /Private student notes remain in Supabase/);
});

test("private fields are rejected from a Trello card", () => {
  assert.throws(
    () => buildSafeCardDescription({ ...safeCard, title: "Review private mentor summary" }),
    /private student context/i,
  );
});

test("Trello webhook signature uses body plus callback URL", () => {
  const rawBody = JSON.stringify({ action: { id: "a1", type: "updateCard" } });
  const callbackUrl = "https://crm.invalid/api/integrations/trello/webhook";
  const applicationSecret = "test-secret";
  const receivedSignature = createTrelloWebhookSignature(rawBody, callbackUrl, applicationSecret);
  assert.equal(
    verifyTrelloWebhookSignature({ rawBody, callbackUrl, applicationSecret, receivedSignature }),
    true,
  );
  assert.equal(
    verifyTrelloWebhookSignature({ rawBody: `${rawBody}x`, callbackUrl, applicationSecret, receivedSignature }),
    false,
  );
});
