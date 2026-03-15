import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase-server";
import { hasBearerToken } from "@/lib/server-auth";

async function sendTelegramNotification(message: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.log("[Webhook] Telegram not configured, skipping notification");
    return;
  }

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message }),
    });
  } catch (e) {
    console.error("[Webhook] Failed to send Telegram notification:", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!hasBearerToken(req, "INBOUND_WEBHOOK_TOKEN")) {
      const configured = Boolean(process.env.INBOUND_WEBHOOK_TOKEN?.trim());
      return NextResponse.json(
        { error: configured ? "Unauthorized" : "INBOUND_WEBHOOK_TOKEN is not configured" },
        { status: configured ? 401 : 503 }
      );
    }

    const body = await req.json();
    const subject = body.subject || body.subjectLine || "New Email";
    const from = body.from || body.sender || "Unknown";
    const snippet = body.snippet || body.preview || "";

    const notification = `📧 New Email

From: ${from}
Subject: ${subject}${snippet ? `

${snippet}` : ""}`;
    await sendTelegramNotification(notification);

    try {
      const db = createRouteHandlerClient();
      if (db) {
        await db.from("agent_events").insert({
          agent_id: null,
          event_type: "webhook_received",
          payload: { subject, from, snippet },
        });
      }
    } catch {
      console.log("[Webhook] DB not available, skipping log");
    }

    return NextResponse.json({ success: true, message: "Notification sent", timestamp: new Date().toISOString() });
  } catch (e) {
    console.error("[Webhook] Error:", e);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", message: "Webhook endpoint is running", timestamp: new Date().toISOString() });
}
