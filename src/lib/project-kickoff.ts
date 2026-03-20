import type { ProjectIntake } from "./project-intake.ts";
import { inferIntakeReadiness } from "./project-intake.ts";
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
  gateStatus: "pending" | "not_requested";
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

function phaseTask(taskType: TaskType, taskGoal: string, metadata: Record<string, string>): KickoffPhaseTemplate["tasks"][number] {
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
      ...config.metadataFields.map((field) => `${field.label}: ${(metadata[field.key] ?? "").replace(/_/g, " ")}`),
    ].join("\n"),
    taskType,
    taskGoal,
    ownerTeam: config.ownerTeam,
    reviewRequired: config.reviewRequired,
    taskTemplateKey: templateKeyField ? metadata[templateKeyField] ?? null : null,
    taskMetadata: metadata,
  };
}

export function buildProjectKickoffPlan(input: {
  projectName: string;
  type: string;
  intake?: ProjectIntake;
}): KickoffPhaseTemplate[] {
  const intake = input.intake;
  const readiness = intake ? inferIntakeReadiness(intake) : { stage: "planning", confidence: "somewhat-clear" };
  const phaseTemplates: KickoffPhaseTemplate[] = [];

  const needsDiscovery = readiness.stage === "idea" || readiness.stage === "planning" || readiness.confidence === "not-sure";
  const needsDesign = hasCapability(intake, "ux-ui") || intake?.shape === "website" || readiness.stage === "ready-to-design";
  const needsBuild = hasCapability(intake, "frontend") || hasCapability(intake, "backend-data") || ["product_build", "web_app", "native_app", "ops_enablement", "saas"].includes(input.type);
  const needsContent = hasCapability(intake, "content-copy") || hasCapability(intake, "growth-marketing") || input.type === "marketing_growth" || intake?.shape === "launch-campaign";
  const needsQa = hasCapability(intake, "qa-optimization") || needsBuild || readiness.stage === "already-live";

  if (needsDiscovery) {
    phaseTemplates.push({
      key: "discover",
      name: "Phase 1 · Discover",
      goal: "Clarify scope, success criteria, and the immediate execution path.",
      order: phaseTemplates.length + 1,
      status: "active",
      gateRequired: true,
      gateStatus: "pending",
      tasks: [
        phaseTask("discovery_plan", `${input.projectName} scope, plan, and next-step recommendation`, {
          planning_mode: "define_scope",
          target_area: needsBuild ? "engineering" : needsContent ? "marketing" : needsDesign ? "design" : "hybrid",
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
      gateRequired: true,
      gateStatus: phaseTemplates.length === 0 ? "pending" : "not_requested",
      tasks: [
        phaseTask("design", `${input.projectName} core user flow and interface direction`, {
          design_output_type: "wireframes",
          surface: intake?.shape === "native-app" ? "mobile" : intake?.shape === "website" ? "web" : "dashboard",
        }),
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
      gateRequired: true,
      gateStatus: phaseTemplates.length === 0 ? "pending" : "not_requested",
      tasks: [
        phaseTask("build_implementation", `${input.projectName} initial delivery slice`, {
          implementation_kind: hasCapability(intake, "backend-data") ? "backend_or_api" : intake?.shape === "website" ? "website_page" : "frontend_feature",
          target_environment: intake?.shape === "website" ? "marketing_site" : intake?.shape === "ops-system" ? "internal_ops" : intake?.shape === "native-app" ? "mobile_app" : "web_app",
        }),
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
      gateRequired: true,
      gateStatus: phaseTemplates.length === 0 ? "pending" : "not_requested",
      tasks: [
        phaseTask("content_messaging", `${input.projectName} launch-ready messaging`, {
          content_type: "launch_messaging",
          channel_or_surface: intake?.shape === "launch-campaign" ? "ads" : "site",
        }),
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
      tasks: [
        phaseTask("qa_validation", `${input.projectName} kickoff deliverables`, {
          qa_mode: "acceptance_review",
          subject_ref: needsBuild ? "new_feature" : needsContent ? "landing_page" : "other",
        }),
      ],
    });
  }

  return phaseTemplates.map((phase, index) => ({
    ...phase,
    order: index + 1,
    name: phase.name.replace(/^Phase \d+/, `Phase ${index + 1}`),
    status: index === 0 ? "active" : "draft",
    gateStatus: phase.gateRequired ? (index === 0 ? "pending" : "not_requested") : "not_requested",
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
  return data?.id ?? null;
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
    const { data: sprint, error: sprintError } = await db
      .from("sprints")
      .insert({
        project_id: input.projectId,
        name: phase.name,
        goal: phase.goal,
        status: phase.status,
        phase_key: phase.key,
        phase_order: phase.order,
        auto_generated: true,
        approval_gate_required: phase.gateRequired,
        approval_gate_status: phase.gateStatus,
      })
      .select("id, name")
      .single();

    if (sprintError || !sprint?.id) {
      throw new Error(sprintError?.message || `Failed to create kickoff phase ${phase.name}`);
    }

    createdPhases.push({ id: sprint.id, key: phase.key, name: sprint.name });

    for (const task of phase.tasks) {
      const ownerTeamId = await getTeamIdByLane(db, task.ownerTeam);
      const assigneeAgentId = await getLeadAgentForTeam(db, ownerTeamId);
      const { data: createdTask, error: taskError } = await db
        .from("sprint_items")
        .insert({
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
        })
        .select("id, title")
        .single();

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
