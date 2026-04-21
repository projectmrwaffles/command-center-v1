import { mergeProjectLinks } from "@/lib/review-requests";
import { syncMilestoneReviewRequest } from "@/lib/review-request-sync";
import { createRouteHandlerClient } from "@/lib/supabase-server";
import { authorizeApiRequest } from "@/lib/server-auth";
import { NextRequest, NextResponse } from "next/server";

function mapReviewRequestError(message: string | undefined) {
  if (!message) return { status: 500, error: "Failed to create review request" };

  if (
    message.includes("Milestone is not review-gated") ||
    message.includes("Milestone has already been approved") ||
    message.includes("Milestone needs at least one task") ||
    message.includes("Finish milestone tasks before requesting review") ||
    message.includes("Review request already pending for this milestone") ||
    message.includes("proof_bundle_not_ready") ||
    message.includes("missing_active_submission")
  ) {
    return { status: 409, error: message };
  }

  if (message.includes("Milestone not found")) {
    return { status: 404, error: message };
  }

  return { status: 500, error: message };
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = authorizeApiRequest(req, { allowSameOrigin: true, bearerEnvNames: ["AGENT_AUTH_TOKEN"] });
    if (!auth.ok) return auth.response;

    const params = await ctx.params;
    const projectId = params.id;
    const body = await req.json();
    const sprintId = typeof body?.sprintId === "string" ? body.sprintId : "";
    const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;

    if (!projectId || !sprintId) {
      return NextResponse.json({ error: "Project ID and sprint ID required" }, { status: 400 });
    }

    const db = createRouteHandlerClient();
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const mergedLinks = mergeProjectLinks(null, body?.links);
    const result = await syncMilestoneReviewRequest(db as any, {
      projectId,
      sprintId,
      note,
      links: mergedLinks,
    });

    if (!result.created) {
      const mapped = mapReviewRequestError(result.reason);
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }

    const created = result.reviewRequest as {
      approval_id: string;
      approval_status: string;
      approval_summary: string;
      approval_sprint_id: string;
      approval_context: Record<string, unknown> | null;
      job_id: string;
      job_title: string;
      job_status: string;
      links: Record<string, unknown> | null;
    };

    return NextResponse.json(
      {
        approval: {
          id: created.approval_id,
          status: created.approval_status,
          summary: created.approval_summary,
          sprint_id: created.approval_sprint_id,
          context: created.approval_context,
        },
        job: {
          id: created.job_id,
          title: created.job_title,
          status: created.job_status,
        },
        links: created.links,
      },
      { status: 201 },
    );
  } catch (e: unknown) {
    console.error("[API /projects/:id/review-requests] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
