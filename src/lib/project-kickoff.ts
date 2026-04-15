import type { ProjectIntake } from "./project-intake.ts";
import { inferIntakeReadiness } from "./project-intake.ts";
import type { CheckpointEvidenceRequirements, StageCheckpointType } from "./milestone-review.ts";
import { TASK_TYPE_CONFIG, type TaskType, type TeamLane } from "./task-model.ts";

export type KickoffDbClient = {
  from: (table: string) => any;
};

export type KickoffPhaseTemplate = {
  key: string;
  name: string;
  goal: string;
  order: number;
  status: "active" | "draft";
  gateRequired: boolean;
  gateStatus: "not_requested";
  checkpointType?: StageCheckpointType;
  checkpointEvidenceRequirements?: CheckpointEvidenceRequirements | null;
  tasks: Array<{
    title: string;
    description: string;
    taskType: TaskType;
    taskGoal: string;
    ownerTeam: TeamLane;
    reviewRequired: boolean;
    taskTemplateKey: string | null;
    taskMetadata: Record<string, string>;
  }>;
};

const TEAM_NAME_BY_LANE: Record<TeamLane, string> = {
  product: "Product",
  design: "Design",
  engineering: "Engineering",
  marketing: "Marketing",
  qa: "QA",
};

function hasCapability(intake: ProjectIntake | undefined, capability: string) {
  return intake?.capabilities?.includes(capability) ?? false;
}

function hasPrdDrivenRequirements(intake: ProjectIntake | undefined) {
  return Boolean(
    intake?.requirements?.technologyRequirements?.length
    && intake.requirements.sources?.some((source) => source?.type !== "intake" && Array.isArray(source.evidence) && source.evidence.length > 0)
  );
}

function isMissingColumnError(error: { code?: string; message?: string } | null | undefined, columns: string[]) {
  if (!error) return false;
  const message = error.message || "";
  return error.code === "PGRST204" && columns.some((column) => message.includes(`'${column}' column`));
}

function phaseTask(taskType: TaskType, taskGoal: string, metadata: Record<string, string>, options?: { reviewRequired?: boolean; projectRequirements?: string[] }): KickoffPhaseTemplate["tasks"][number] {
  const config = TASK_TYPE_CONFIG[taskType];
  const templateKeyField = config.metadataFields[0]?.key;
  const titlePrefix = templateKeyField ? metadata[templateKeyField] : config.goalVerb;
  const title = `${titlePrefix ? titlePrefix.replace(/_/g, " ") : config.goalVerb} for ${taskGoal}`
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

  return {
    title,
    description: [
      `Task type: ${config.label}`,
      `Goal: ${taskGoal}`,
      ...(options?.projectRequirements?.length ? ["Project requirements:", ...options.projectRequirements.map((item) => `- ${item}`)] : []),
      ...config.metadataFields.map((field) => `${field.label}: ${(metadata[field.key] ?? "").replace(/_/g, " ")}`),
    ].join("\n"),
    taskType,
    taskGoal,
    ownerTeam: config.ownerTeam,
    reviewRequired: options?.reviewRequired ?? config.reviewRequired,
    taskTemplateKey: templateKeyField ? metadata[templateKeyField] ?? null : null,
    taskMetadata: metadata,
  };
}

export function buildProjectKickoffPlan(input: {
  projectName: string;
  type: string;
  intake?: ProjectIntake;
}): KickoffPhaseTemplate[] {
  const bootstrapPhaseOptions = { reviewRequired: false };
  const intake = input.intake;
  const readiness = intake ? inferIntakeReadiness(intake) : { stage: "planning", confidence: "somewhat-clear" };
  const phaseTemplates: KickoffPhaseTemplate[] = [];
  const projectRequirements = intake?.requirements?.summary?.slice(0, 6) || undefined;

  const hasAttachmentBackedRequirements = hasPrdDrivenRequirements(intake);
  const needsDiscovery = hasAttachmentBackedRequirements || readiness.stage === "idea" || readiness.stage === "planning" || readiness.confidence === "not-sure";
  const needsDesign = hasCapability(intake, "ux-ui") || intake?.shape === "website" || readiness.stage === "ready-to-design";
  const needsBuild = hasCapability(intake, "frontend") || hasCapability(intake, "backend-data") || ["product_build", "web_app", "native_app", "ops_enablement", "saas"].includes(input.type);
  const needsContent = hasCapability(intake, "content-copy") || hasCapability(intake, "growth-marketing") || input.type === "marketing_growth" || intake?.shape === "launch-campaign";
  const needsQa = hasCapability(intake, "qa-optimization") || needsBuild || readiness.stage === "already-live";
  const needsPreBuildCheckpoint = needsBuild && hasPrdDrivenRequirements(intake);

  if (needsDiscovery) {
    phaseTemplates.push({
      key: "discover",
      name: "Phase 1 · Discover",
      goal: "Clarify scope, success criteria, and the immediate execution path.",
      order: phaseTemplates.length + 1,
      status: "active",
      gateRequired: false,
      gateStatus: "not_requested",
      checkpointType: "scope_approval",
      checkpointEvidenceRequirements: {
        screenshotRequired: false,
        minScreenshotCount: 0,
        captureMode: null,
        requiredEvidenceKinds: ["doc", "checklist", "loom"],
        requiredEvidenceKindsMode: "any",
        captureHint: "Attach the actual scope artifact, such as a planning doc, checklist, or Loom walkthrough, before requesting scope approval.",
      },
      tasks: [
        phaseTask("discovery_plan", `${input.projectName} scope, plan, and next-step recommendation`, {
          planning_mode: hasAttachmentBackedRequirements ? "scope_from_attachments" : "define_scope",
          target_area: needsBuild ? "engineering" : needsContent ? "marketing" : needsDesign ? "design" : "hybrid",
        }, {
          ...bootstrapPhaseOptions,
          projectRequirements: hasAttachmentBackedRequirements
            ? [
                "Treat the uploaded attachments as the source material for this scope pass.",
                "Convert attachment-derived requirements into an explicit execution scope, success criteria, and handoff recommendation.",
                ...(projectRequirements || []),
              ]
            : projectRequirements,
        }),
      ],
    });
  }

  if (needsDesign) {
    phaseTemplates.push({
      key: "design",
      name: `Phase ${phaseTemplates.length + 1} · Design`,
      goal: "Create the core UX, flows, and visual direction needed for execution.",
      order: phaseTemplates.length + 1,
      status: phaseTemplates.length === 0 ? "active" : "draft",
      gateRequired: false,
      gateStatus: "not_requested",
      checkpointType: "design_review",
      checkpointEvidenceRequirements: {
        screenshotRequired: true,
        minScreenshotCount: 1,
        captureMode: "local_app",
        captureHint: "Attach at least one current design capture or prototype screenshot before requesting design review.",
        requiredEvidenceKinds: undefined,
        requiredEvidenceKindsMode: null,
      },
      tasks: [
        phaseTask("design", `${input.projectName} core user flow and interface direction`, {
          design_output_type: "wireframes",
          surface: intake?.shape === "native-app" ? "mobile" : intake?.shape === "website" ? "web" : "dashboard",
        }, { ...bootstrapPhaseOptions, projectRequirements }),
      ],
    });
  }

  if (needsBuild) {
    phaseTemplates.push({
      key: "build",
      name: `Phase ${phaseTemplates.length + 1} · Build`,
      goal: "Implement the first working delivery slice from the approved plan.",
      order: phaseTemplates.length + 1,
      status: phaseTemplates.length === 0 ? "active" : "draft",
      gateRequired: needsPreBuildCheckpoint,
      gateStatus: "not_requested",
      checkpointType: "delivery_review",
      checkpointEvidenceRequirements: {
        screenshotRequired: false,
        minScreenshotCount: 0,
        captureMode: null,
        requiredEvidenceKinds: ["screenshot", "staging_url", "github_pr", "commit", "loom"],
        requiredEvidenceKindsMode: "any",
        captureHint: "Attach at least one concrete build artifact, such as a screenshot, preview URL, PR, commit, or Loom walkthrough, before requesting review.",
      },
      tasks: [
        phaseTask("build_implementation", `${input.projectName} initial delivery slice`, {
          implementation_kind: hasCapability(intake, "backend-data") ? "backend_or_api" : intake?.shape === "website" ? "website_page" : "frontend_feature",
          target_environment: intake?.shape === "website" ? "marketing_site" : intake?.shape === "ops-system" ? "internal_ops" : intake?.shape === "native-app" ? "mobile_app" : "web_app",
        }, { ...bootstrapPhaseOptions, projectRequirements }),
      ],
    });
  }

  if (needsContent) {
    phaseTemplates.push({
      key: "message",
      name: `Phase ${phaseTemplates.length + 1} · Message`,
      goal: "Create the supporting messaging and content needed to launch or explain the work.",
      order: phaseTemplates.length + 1,
      status: phaseTemplates.length === 0 ? "active" : "draft",
      gateRequired: false,
      gateStatus: "not_requested",
      checkpointType: "content_review",
      checkpointEvidenceRequirements: {
        screenshotRequired: false,
        minScreenshotCount: 0,
        captureMode: null,
        requiredEvidenceKinds: ["doc", "artifact", "screenshot", "staging_url", "loom"],
        requiredEvidenceKindsMode: "any",
        captureHint: "Attach the actual messaging artifact to review, such as a draft doc, screenshot, preview URL, exported asset, or Loom walkthrough.",
      },
      tasks: [
        phaseTask("content_messaging", `${input.projectName} launch-ready messaging`, {
          content_type: "launch_messaging",
          channel_or_surface: intake?.shape === "launch-campaign" ? "ads" : "site",
        }, { ...bootstrapPhaseOptions, projectRequirements }),
      ],
    });
  }

  if (needsQa || phaseTemplates.length === 0) {
    phaseTemplates.push({
      key: "validate",
      name: `Phase ${phaseTemplates.length + 1} · Validate`,
      goal: "Verify the kickoff deliverables before broader execution continues.",
      order: phaseTemplates.length + 1,
      status: phaseTemplates.length === 0 ? "active" : "draft",
      gateRequired: false,
      gateStatus: "not_requested",
      checkpointType: "acceptance_review",
      checkpointEvidenceRequirements: {
        screenshotRequired: false,
        minScreenshotCount: 0,
        captureMode: null,
        requiredEvidenceKinds: ["screenshot", "staging_url", "loom"],
        requiredEvidenceKindsMode: "any",
        captureHint: "Attach validation evidence for this milestone, such as a screenshot, staging URL, or Loom walkthrough, before requesting review.",
      },
      tasks: [
        phaseTask("qa_validation", `${input.projectName} kickoff deliverables`, {
          qa_mode: "acceptance_review",
          subject_ref: needsBuild ? "new_feature" : needsContent ? "landing_page" : "other",
        }, { ...bootstrapPhaseOptions, projectRequirements }),
      ],
    });
  }

  return phaseTemplates.map((phase, index) => ({
    ...phase,
    order: index + 1,
    name: phase.name.replace(/^Phase \d+/, `Phase ${index + 1}`),
    status: index === 0 ? "active" : "draft",
    gateStatus: "not_requested",
  }));
}

async function getTeamIdByLane(db: KickoffDbClient, lane: TeamLane): Promise<string | null> {
  const teamName = TEAM_NAME_BY_LANE[lane];
  const { data, error } = await db
    .from("teams")
    .select("id, name")
    .ilike("name", teamName)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data?.id) return data.id;

  const fallbackTeamNames = Array.from(new Set([
    TEAM_NAME_BY_LANE.engineering,
    TEAM_NAME_BY_LANE.product,
    TEAM_NAME_BY_LANE.design,
    TEAM_NAME_BY_LANE.qa,
    TEAM_NAME_BY_LANE.marketing,
  ].filter((candidate) => candidate !== teamName)));

  for (const fallbackTeamName of fallbackTeamNames) {
    const { data: fallbackTeam, error: fallbackError } = await db
      .from("teams")
      .select("id, name")
      .ilike("name", fallbackTeamName)
      .limit(1)
      .maybeSingle();

    if (fallbackError) throw new Error(fallbackError.message);
    if (fallbackTeam?.id) return fallbackTeam.id;
  }

  const { data: anyTeam, error: anyTeamError } = await db
    .from("teams")
    .select("id, name")
    .limit(1)
    .maybeSingle();

  if (anyTeamError) throw new Error(anyTeamError.message);
  return anyTeam?.id ?? null;
}

async function getLeadAgentForTeam(db: KickoffDbClient, teamId: string | null): Promise<string | null> {
  if (!teamId) return null;

  const { data, error } = await db
    .from("team_members")
    .select("agent_id, role")
    .eq("team_id", teamId)
    .order("role", { ascending: true });

  if (error) throw new Error(error.message);

  const leadMember = data?.find((member: { role?: string | null }) => member.role === "lead") || data?.[0];
  return leadMember?.agent_id ?? null;
}

export async function seedProjectKickoffPlan(db: KickoffDbClient, input: {
  projectId: string;
  projectName: string;
  type: string;
  intake?: ProjectIntake;
  startPosition?: number;
}) {
  const phases = buildProjectKickoffPlan({
    projectName: input.projectName,
    type: input.type,
    intake: input.intake,
  });

  let nextPosition = input.startPosition ?? 1;
  const createdPhases: Array<{ id: string; key: string; name: string }> = [];
  const createdTasks: Array<{ id: string; title: string; assigneeAgentId: string | null; phaseKey: string; phaseStatus: "active" | "draft" }> = [];

  for (const phase of phases) {
    const sprintInsert = {
      project_id: input.projectId,
      name: phase.name,
      goal: phase.goal,
      status: phase.status,
      phase_key: phase.key,
      phase_order: phase.order,
      auto_generated: true,
      approval_gate_required: phase.gateRequired,
      approval_gate_status: phase.gateStatus,
      checkpoint_type: phase.checkpointType ?? null,
      checkpoint_evidence_requirements: phase.checkpointEvidenceRequirements ?? {},
    };

    let sprintResult = await db
      .from("sprints")
      .insert(sprintInsert)
      .select("id, name")
      .single();

    if (isMissingColumnError(sprintResult.error, ["phase_key", "phase_order", "auto_generated", "approval_gate_required", "approval_gate_status", "checkpoint_type", "checkpoint_evidence_requirements"])) {
      sprintResult = await db
        .from("sprints")
        .insert({
          project_id: input.projectId,
          name: phase.name,
          goal: phase.goal,
          status: phase.status,
        })
        .select("id, name")
        .single();
    }

    const sprint = sprintResult.data;
    const sprintError = sprintResult.error;

    if (sprintError || !sprint?.id) {
      throw new Error(sprintError?.message || `Failed to create kickoff phase ${phase.name}`);
    }

    createdPhases.push({ id: sprint.id, key: phase.key, name: sprint.name });

    for (const task of phase.tasks) {
      const ownerTeamId = await getTeamIdByLane(db, task.ownerTeam);
      const assigneeAgentId = await getLeadAgentForTeam(db, ownerTeamId);
      const taskInsert = {
        sprint_id: sprint.id,
        project_id: input.projectId,
        title: task.title,
        description: task.description,
        status: "todo",
        assignee_agent_id: assigneeAgentId,
        position: nextPosition,
        task_type: task.taskType,
        task_goal: task.taskGoal,
        owner_team_id: ownerTeamId,
        review_required: task.reviewRequired,
        task_template_key: task.taskTemplateKey,
        task_metadata: {
          ...task.taskMetadata,
          phase_key: phase.key,
          auto_generated: true,
        },
        review_status: task.reviewRequired ? "awaiting_review" : "not_requested",
      };

      let taskResult = await db
        .from("sprint_items")
        .insert(taskInsert)
        .select("id, title")
        .single();

      if (isMissingColumnError(taskResult.error, ["task_type", "task_goal", "owner_team_id", "review_required", "task_template_key", "task_metadata", "review_status"])) {
        taskResult = await db
          .from("sprint_items")
          .insert({
            sprint_id: sprint.id,
            project_id: input.projectId,
            title: task.title,
            description: task.description,
            status: "todo",
            assignee_agent_id: assigneeAgentId,
            position: nextPosition,
          })
          .select("id, title")
          .single();
      }

      const createdTask = taskResult.data;
      const taskError = taskResult.error;

      if (taskError || !createdTask?.id) {
        throw new Error(taskError?.message || `Failed to create kickoff task ${task.title}`);
      }

      createdTasks.push({
        id: createdTask.id,
        title: createdTask.title,
        assigneeAgentId,
        phaseKey: phase.key,
        phaseStatus: phase.status,
      });

      nextPosition += 1;
    }
  }

  return { phases: createdPhases, tasks: createdTasks, nextPosition };
}
