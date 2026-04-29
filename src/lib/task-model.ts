export const TASK_TYPES = [
  "discovery_plan",
  "design",
  "build_implementation",
  "content_messaging",
  "qa_validation",
  "internal_admin",
] as const;

export type TaskType = (typeof TASK_TYPES)[number];
export type TeamLane = "product" | "design" | "engineering" | "marketing" | "qa";

export type TaskOption = {
  value: string;
  label: string;
  description?: string;
};

export type TaskTypeConfig = {
  label: string;
  description: string;
  ownerTeam: TeamLane;
  qcTeam: TeamLane;
  reviewRequired: boolean;
  goalVerb: string;
  createEnabled?: boolean;
  goalLabel?: string;
  goalPlaceholder?: string;
  metadataFields: Array<{
    key: string;
    label: string;
    options: TaskOption[];
  }>;
};

export const TEAM_LABELS: Record<TeamLane, string> = {
  product: "Product",
  design: "Design",
  engineering: "Engineering",
  marketing: "Marketing",
  qa: "QA",
};

export const TASK_TYPE_CONFIG: Record<TaskType, TaskTypeConfig> = {
  discovery_plan: {
    label: "Discovery / plan",
    description: "Clarify scope, direction, or recommendations before execution.",
    ownerTeam: "product",
    qcTeam: "qa",
    reviewRequired: true,
    goalVerb: "Define",
    metadataFields: [
      { key: "planning_mode", label: "Planning mode", options: [
        { value: "audit_current_state", label: "Audit current state" },
        { value: "define_scope", label: "Define scope" },
        { value: "write_brief", label: "Write brief" },
        { value: "recommend_next_steps", label: "Recommend next steps" },
      ] },
      { key: "target_area", label: "Target area", options: [
        { value: "product", label: "Product" },
        { value: "design", label: "Design" },
        { value: "engineering", label: "Engineering" },
        { value: "marketing", label: "Marketing" },
        { value: "operations", label: "Operations" },
        { value: "hybrid", label: "Hybrid" },
      ] },
    ],
  },
  design: {
    label: "Design",
    description: "Shape flows, screens, or visual direction.",
    createEnabled: true,
    goalLabel: "What needs to be designed?",
    goalPlaceholder: "e.g. mobile dashboard onboarding flow",
    ownerTeam: "design",
    qcTeam: "product",
    reviewRequired: true,
    goalVerb: "Create",
    metadataFields: [
      { key: "design_output_type", label: "Output type", options: [
        { value: "wireframes", label: "Wireframes" },
        { value: "ui_mockups", label: "UI mockups" },
        { value: "flow_map", label: "Flow map" },
        { value: "design_revision", label: "Design revision" },
        { value: "design_system_update", label: "Design system update" },
      ] },
      { key: "surface", label: "Surface", options: [
        { value: "web", label: "Web" },
        { value: "mobile", label: "Mobile" },
        { value: "email", label: "Email" },
        { value: "dashboard", label: "Dashboard" },
        { value: "brand_asset", label: "Brand asset" },
        { value: "other", label: "Other" },
      ] },
    ],
  },
  build_implementation: {
    label: "Build / implementation",
    description: "Implement a concrete product, site, integration, or fix.",
    createEnabled: true,
    goalLabel: "What should be implemented?",
    goalPlaceholder: "e.g. structured task creation modal for project page",
    ownerTeam: "engineering",
    qcTeam: "qa",
    reviewRequired: true,
    goalVerb: "Implement",
    metadataFields: [
      { key: "implementation_kind", label: "Implementation kind", options: [
        { value: "frontend_feature", label: "Frontend feature" },
        { value: "backend_or_api", label: "Backend or API" },
        { value: "integration_or_automation", label: "Integration or automation" },
        { value: "website_page", label: "Website page" },
        { value: "bug_fix", label: "Bug fix" },
        { value: "system_setup", label: "System setup" },
      ] },
      { key: "target_environment", label: "Target environment", options: [
        { value: "web_app", label: "Web app" },
        { value: "marketing_site", label: "Marketing site" },
        { value: "internal_ops", label: "Internal ops" },
        { value: "data_system", label: "Data system" },
        { value: "mobile_app", label: "Mobile app" },
        { value: "other", label: "Other" },
      ] },
    ],
  },
  content_messaging: {
    label: "Content / messaging",
    description: "Create or revise copy, messaging, or campaign assets.",
    createEnabled: true,
    goalLabel: "What message or asset should be created?",
    goalPlaceholder: "e.g. homepage hero copy for Command Center launch",
    ownerTeam: "marketing",
    qcTeam: "product",
    reviewRequired: true,
    goalVerb: "Write",
    metadataFields: [
      { key: "content_type", label: "Content type", options: [
        { value: "website_copy", label: "Website copy" },
        { value: "email_copy", label: "Email copy" },
        { value: "ad_or_campaign_asset", label: "Ad or campaign asset" },
        { value: "social_copy", label: "Social copy" },
        { value: "launch_messaging", label: "Launch messaging" },
        { value: "content_revision", label: "Content revision" },
      ] },
      { key: "channel_or_surface", label: "Channel or surface", options: [
        { value: "site", label: "Site" },
        { value: "email", label: "Email" },
        { value: "ads", label: "Ads" },
        { value: "social", label: "Social" },
        { value: "sales", label: "Sales" },
        { value: "other", label: "Other" },
      ] },
    ],
  },
  qa_validation: {
    label: "QA / validation",
    description: "Validate, test, or sign off existing work.",
    ownerTeam: "qa",
    qcTeam: "product",
    reviewRequired: false,
    goalVerb: "Run",
    metadataFields: [
      { key: "qa_mode", label: "QA mode", options: [
        { value: "qa_pass", label: "QA pass" },
        { value: "bug_validation", label: "Bug validation" },
        { value: "launch_check", label: "Launch check" },
        { value: "regression_check", label: "Regression check" },
        { value: "acceptance_review", label: "Acceptance review" },
      ] },
      { key: "subject_ref", label: "What is being validated?", options: [
        { value: "new_feature", label: "New feature" },
        { value: "landing_page", label: "Landing page" },
        { value: "integration", label: "Integration" },
        { value: "bug_fix", label: "Bug fix" },
        { value: "launch_candidate", label: "Launch candidate" },
        { value: "other", label: "Other" },
      ] },
    ],
  },
  internal_admin: {
    label: "Internal / admin",
    description: "Coordination, setup, cleanup, or support work.",
    ownerTeam: "product",
    qcTeam: "qa",
    reviewRequired: false,
    goalVerb: "Coordinate",
    metadataFields: [
      { key: "admin_action_type", label: "Admin action", options: [
        { value: "coordination", label: "Coordination" },
        { value: "setup", label: "Setup" },
        { value: "cleanup", label: "Cleanup" },
        { value: "handoff", label: "Handoff" },
        { value: "tracking_update", label: "Tracking update" },
      ] },
    ],
  },
};

export const CREATE_ENABLED_TASK_TYPES = TASK_TYPES.filter((taskType) => TASK_TYPE_CONFIG[taskType].createEnabled);

export function isTaskType(value: unknown): value is TaskType {
  return typeof value === "string" && TASK_TYPES.includes(value as TaskType);
}

export function humanizeTaskValue(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getTaskTypeConfig(taskType: TaskType) {
  return TASK_TYPE_CONFIG[taskType];
}

export function getDefaultTaskMetadata(taskType: TaskType) {
  const config = getTaskTypeConfig(taskType);
  return config.metadataFields.reduce<Record<string, string>>((acc, field) => {
    acc[field.key] = field.options[0]?.value || "";
    return acc;
  }, {});
}

export function inferTaskTypeFromRequest(input: {
  message: string;
  revisionSourceTaskType?: string | null;
  revisionSourceTaskId?: string | null;
}) {
  const message = input.message.trim().toLowerCase();

  if (input.revisionSourceTaskId && isTaskType(input.revisionSourceTaskType)) {
    return input.revisionSourceTaskType;
  }

  if (/(wireframe|mockup|figma|ui\b|ux\b|screen|layout|brand|visual|design system)/i.test(message)) return "design";
  if (/(copy|messaging|headline|email|ad\b|campaign|social|landing page copy|content)/i.test(message)) return "content_messaging";
  if (/(qa|test|validate|validation|regression|acceptance|verify)/i.test(message)) return "qa_validation";
  if (/(audit|scope|brief|plan|research|recommend|strategy|roadmap)/i.test(message)) return "discovery_plan";
  if (/(setup|coordinate|coordination|cleanup|handoff|tracking|ops|operations)/i.test(message)) return "internal_admin";

  return "build_implementation";
}

export function inferTaskMetadataFromRequest(input: {
  taskType: TaskType;
  message: string;
  revisionSourceTaskId?: string | null;
}) {
  const message = input.message.trim().toLowerCase();
  const defaults = getDefaultTaskMetadata(input.taskType);

  switch (input.taskType) {
    case "discovery_plan":
      return {
        planning_mode: /(audit|review current|assess)/i.test(message)
          ? "audit_current_state"
          : /(brief)/i.test(message)
            ? "write_brief"
            : /(scope|requirements)/i.test(message)
              ? "define_scope"
              : "recommend_next_steps",
        target_area: /(design|ux|ui)/i.test(message)
          ? "design"
          : /(marketing|copy|campaign|content)/i.test(message)
            ? "marketing"
            : /(engineering|build|api|bug|integration|frontend|backend)/i.test(message)
              ? "engineering"
              : /(ops|operations)/i.test(message)
                ? "operations"
                : /(product)/i.test(message)
                  ? "product"
                  : "hybrid",
      };
    case "design":
      return {
        design_output_type: input.revisionSourceTaskId
          ? "design_revision"
          : /(wireframe)/i.test(message)
            ? "wireframes"
            : /(flow)/i.test(message)
              ? "flow_map"
              : /(design system)/i.test(message)
                ? "design_system_update"
                : "ui_mockups",
        surface: /(mobile|ios|android)/i.test(message)
          ? "mobile"
          : /(email)/i.test(message)
            ? "email"
            : /(dashboard)/i.test(message)
              ? "dashboard"
              : /(brand)/i.test(message)
                ? "brand_asset"
                : /(other)/i.test(message)
                  ? "other"
                  : "web",
      };
    case "build_implementation":
      return {
        implementation_kind: /(bug|fix|broken|issue)/i.test(message)
          ? "bug_fix"
          : /(api|backend|server|database)/i.test(message)
            ? "backend_or_api"
            : /(integrat|automation|webhook|sync)/i.test(message)
              ? "integration_or_automation"
              : /(page|landing page|website)/i.test(message)
                ? "website_page"
                : /(setup|configure|provision)/i.test(message)
                  ? "system_setup"
                  : "frontend_feature",
        target_environment: /(mobile|ios|android)/i.test(message)
          ? "mobile_app"
          : /(marketing|landing page|website)/i.test(message)
            ? "marketing_site"
            : /(ops|internal)/i.test(message)
              ? "internal_ops"
              : /(data|etl|warehouse|analytics)/i.test(message)
                ? "data_system"
                : /(other)/i.test(message)
                  ? "other"
                  : "web_app",
      };
    case "content_messaging":
      return {
        content_type: input.revisionSourceTaskId
          ? "content_revision"
          : /(email)/i.test(message)
            ? "email_copy"
            : /(ad|campaign)/i.test(message)
              ? "ad_or_campaign_asset"
              : /(social)/i.test(message)
                ? "social_copy"
                : /(launch)/i.test(message)
                  ? "launch_messaging"
                  : "website_copy",
        channel_or_surface: /(email)/i.test(message)
          ? "email"
          : /(ad|campaign)/i.test(message)
            ? "ads"
            : /(social)/i.test(message)
              ? "social"
              : /(sales)/i.test(message)
                ? "sales"
                : /(other)/i.test(message)
                  ? "other"
                  : "site",
      };
    case "qa_validation":
      return {
        qa_mode: /(regression)/i.test(message)
          ? "regression_check"
          : /(bug)/i.test(message)
            ? "bug_validation"
            : /(launch)/i.test(message)
              ? "launch_check"
              : /(acceptance|sign off)/i.test(message)
                ? "acceptance_review"
                : "qa_pass",
        subject_ref: /(landing page|website)/i.test(message)
          ? "landing_page"
          : /(integrat|automation|webhook|sync)/i.test(message)
            ? "integration"
            : /(bug)/i.test(message)
              ? "bug_fix"
              : /(launch)/i.test(message)
                ? "launch_candidate"
                : /(other)/i.test(message)
                  ? "other"
                  : "new_feature",
      };
    case "internal_admin":
      return {
        admin_action_type: /(tracking)/i.test(message)
          ? "tracking_update"
          : /(handoff)/i.test(message)
            ? "handoff"
            : /(setup|configure)/i.test(message)
              ? "setup"
              : /(cleanup)/i.test(message)
                ? "cleanup"
                : "coordination",
      };
    default:
      return defaults;
  }
}

export function buildTaskMetadata(taskType: TaskType, input: Record<string, unknown>) {
  const config = getTaskTypeConfig(taskType);
  const metadata: Record<string, string> = {};

  for (const field of config.metadataFields) {
    const rawValue = input[field.key];
    if (typeof rawValue !== "string" || !rawValue.trim()) {
      throw new Error(`${field.label} is required`);
    }

    const normalizedValue = rawValue.trim();
    const isAllowed = field.options.some((option) => option.value === normalizedValue);
    if (!isAllowed) {
      throw new Error(`Invalid ${field.label.toLowerCase()}`);
    }

    metadata[field.key] = normalizedValue;
  }

  return metadata;
}

export function getTaskTemplateKey(taskType: TaskType, metadata: Record<string, string>) {
  const config = getTaskTypeConfig(taskType);
  const firstField = config.metadataFields[0];
  return firstField ? metadata[firstField.key] ?? null : null;
}

export function generateTaskTitle(taskType: TaskType, taskGoal: string, metadata: Record<string, string>) {
  const config = getTaskTypeConfig(taskType);
  const trimmedGoal = taskGoal.trim();
  if (!trimmedGoal) return config.label;

  const primaryField = config.metadataFields[0];
  const primaryValue = primaryField ? metadata[primaryField.key] : null;
  const prefix = primaryValue ? humanizeTaskValue(primaryValue) : config.goalVerb;
  return `${prefix} for ${trimmedGoal}`;
}

export function generateTaskDescription(input: {
  taskType: TaskType;
  taskGoal: string;
  metadata: Record<string, string>;
  contextNote?: string | null;
}) {
  const config = getTaskTypeConfig(input.taskType);
  const lines = [
    `Task type: ${config.label}`,
    `Goal: ${input.taskGoal.trim()}`,
    ...config.metadataFields.map((field) => `${field.label}: ${humanizeTaskValue(input.metadata[field.key] || "")}`),
  ];

  if (input.contextNote?.trim()) {
    lines.push("", `Context: ${input.contextNote.trim()}`);
  }

  return lines.join("\n");
}

export function getRoutingPreview(taskType: TaskType) {
  const config = getTaskTypeConfig(taskType);
  return {
    ownerTeam: config.ownerTeam,
    ownerTeamLabel: TEAM_LABELS[config.ownerTeam],
    qcTeam: config.qcTeam,
    qcTeamLabel: TEAM_LABELS[config.qcTeam],
    reviewRequired: config.reviewRequired,
    rationale: `${config.label} tasks default to ${TEAM_LABELS[config.ownerTeam]} ownership and ${TEAM_LABELS[config.qcTeam]} QC.`,
  };
}
