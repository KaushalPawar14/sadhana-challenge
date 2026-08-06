import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyTrelloWebhookSignature } from "@/lib/integrations/trello/signature";
import type { TrelloWebhookPayload } from "@/lib/integrations/trello/types";

export const runtime = "nodejs";

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const mode = process.env.TRELLO_MODE ?? "mock";

  if (mode !== "live") {
    return NextResponse.json({ accepted: true, mode, persisted: false });
  }

  const callbackUrl = process.env.TRELLO_WEBHOOK_CALLBACK_URL ?? request.url;
  const applicationSecret = process.env.TRELLO_APPLICATION_SECRET ?? "";
  const signature = request.headers.get("x-trello-webhook");
  const isValid = verifyTrelloWebhookSignature({
    rawBody,
    callbackUrl,
    applicationSecret,
    receivedSignature: signature,
  });

  if (!isValid) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  let payload: TrelloWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as TrelloWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload.action?.id || !payload.action.type) {
    return NextResponse.json({ error: "Incomplete Trello action" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Server configuration incomplete" }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const payloadHash = createHash("sha256").update(rawBody).digest("hex");
  const { error } = await supabase.from("integration_inbox").upsert(
    {
      provider: "trello",
      external_event_id: payload.action.id,
      payload_hash: payloadHash,
      event_type: payload.action.type,
      payload,
      status: "received",
    },
    { onConflict: "provider,external_event_id", ignoreDuplicates: true },
  );

  if (error) {
    return NextResponse.json({ error: "Webhook inbox unavailable" }, { status: 503 });
  }

  return NextResponse.json({ accepted: true, persisted: true });
}
