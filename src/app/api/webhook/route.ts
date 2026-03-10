import { NextRequest, NextResponse } from "next/server";

// Simple webhook endpoint for email notifications
// Can be called by any service (Zapier, Make, Gmail filters, etc.)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Log the webhook for debugging
    console.log("[Webhook] Received:", JSON.stringify(body, null, 2));
    
    // Return success
    return NextResponse.json({ 
      success: true, 
      message: "Webhook received",
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