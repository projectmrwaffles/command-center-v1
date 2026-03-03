import { createRouteHandlerClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, type, teamId, description } = body;

    if (!name || !type) {
      return NextResponse.json({ error: "Name and type are required" }, { status: 400 });
    }

    const db = createRouteHandlerClient();
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const { data, error } = await db
      .from("projects")
      .insert({
        name,
        "type": type,
        team_id: teamId || null,
        description: description || null,
        status: "active",
        progress_pct: 0,
      })
      .select()
      .single();

    if (error) {
      console.error("[API /projects] insert error:", error);
      return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });
    }

    return NextResponse.json({ project: data }, { status: 201 });
  } catch (e: any) {
    console.error("[API /projects] exception:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
