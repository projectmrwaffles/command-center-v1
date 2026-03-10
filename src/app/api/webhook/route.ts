import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase-server";

// Telegram notification function
async function sendTelegramNotification(message: string) {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("[Webhook] Telegram not configured, skipping notification");
    return;
  }

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
      }),
    });
  } catch (e) {
    console.error("[Webhook] Failed to send Telegram notification:", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    console.log("[Webhook] Received:", JSON.stringify(body, null, 2));

    // Extract email details from webhook payload
    const subject = body.subject || body.subjectLine || "New Email";
    const from = body.from || body.sender || "Unknown";
    const snippet = body.snippet || body.preview || "";

    // Format notification message
    const notification = `📧 *New Email*\n\n*From:* ${from}\n*Subject:* ${subject}\n${snippet ? `\`${snippet}\`` : ""}`;

    // Send Telegram notification
    await sendTelegramNotification(notification);

    // Log to database if Supabase is configured
    try {
      const db = createRouteHandlerClient();
      if (db) {
        await db.from("agent_events").insert({
          agent_id: null,
          event_type: "webhook_received",
          payload: { subject, from, snippet },
        });
      }
    } catch (e) {
      console.log("[Webhook] DB not available, skipping log");
    }
    
    return NextResponse.json({ 
      success: true, 
      message: "Notification sent",
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.error("[Webhook] Error:", e);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({ 
    status: "ok", 
    message: "Webhook endpoint is running",
    timestamp: new Date().toISOString()
  });
}