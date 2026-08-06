import { createHmac, timingSafeEqual } from "node:crypto";

export function createTrelloWebhookSignature(
  rawBody: string,
  callbackUrl: string,
  applicationSecret: string,
): string {
  return createHmac("sha1", applicationSecret)
    .update(rawBody + callbackUrl)
    .digest("base64");
}

export function verifyTrelloWebhookSignature(input: {
  rawBody: string;
  callbackUrl: string;
  applicationSecret: string;
  receivedSignature: string | null;
}): boolean {
  if (!input.receivedSignature || !input.applicationSecret) return false;

  const expected = Buffer.from(
    createTrelloWebhookSignature(
      input.rawBody,
      input.callbackUrl,
      input.applicationSecret,
    ),
  );
  const received = Buffer.from(input.receivedSignature);

  return expected.length === received.length && timingSafeEqual(expected, received);
}
