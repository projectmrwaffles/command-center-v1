export type IntakeOption = {
  value: string;
  label: string;
  description: string;
  examples: string[];
  hint?: string;
};

import type { ProjectLinks } from "@/lib/project-links";

export type ProjectIntake = {
  shape: string;
  context: string[];
  capabilities: string[];
  stage: string;
  confidence: string;
  projectName?: string;
  summary?: string;
  goals?: string;
  projectOrigin?: "new" | "existing";
  links?: ProjectLinks;
};

export type ReadinessOption = IntakeOption & {
  stage: string;
  confidence: string;
};

export const PROJECT_SHAPES: IntakeOption[] = [
  {
    value: "saas-product",
    label: "SaaS product",
    description: "A customer-facing software product, portal, or recurring-use platform that people log into and use over time.",
    examples: ["Launch a SaaS MVP", "Build a client portal", "Create a multi-user product dashboard"],
  },
  {
    value: "web-app",
    label: "Web app",
    description: "An interactive browser-based app or tool that is more functional than a marketing site, but not necessarily a SaaS product.",
    examples: ["Internal or client-facing dashboard", "Booking or workflow tool", "Interactive web experience"],
  },
  {
    value: "native-app",
    label: "Native app development",
    description: "A mobile or desktop app built for a device platform, usually iOS, Android, or another installable native experience.",
    examples: ["iPhone or Android app", "React Native product", "Tablet or device-first experience"],
  },
  {
    value: "website",
    label: "Website",
    description: "A marketing site, brand site, content site, landing page system, or brochure-style experience for the web.",
    examples: ["New company website", "Website redesign", "Launch page or content hub"],
  },
  {
    value: "launch-campaign",
    label: "Campaign, launch, or growth work",
    description: "The main need is promotion, messaging, content, acquisition, or rollout support.",
    examples: ["Launch a new offer", "Landing page + ads + email", "SEO or conversion push"],
  },
  {
    value: "ops-system",
    label: "Internal system, automation, or ops workflow",
    description: "This is mainly about how the business runs behind the scenes rather than a public-facing experience.",
    examples: ["CRM or lead pipeline setup", "Team dashboard or automation", "Internal tool or client delivery workflow"],
  },
  {
    value: "research-strategy",
    label: "Strategy, scoping, or discovery first",
    description: "You need clarity on what to build, how to approach it, or what to prioritize before execution starts.",
    examples: ["Define the plan for a new site", "Audit what exists and recommend next steps", "Turn an idea into a roadmap or brief"],
  },
  {
    value: "hybrid-not-sure",
    label: "Something else or not sure yet",
    description: "It spans multiple types of work, or you can describe the outcome more easily than the category.",
    examples: ["Website plus launch support", "Need strategy first, then design/build", "Know the goal, not the exact shape"],
    hint: "Best safe option if more than one feels true.",
  },
];

export const PROJECT_CONTEXTS: IntakeOption[] = [
  {
    value: "customer-facing",
    label: "Customer-facing",
    description: "Used by prospects, customers, or the public.",
    examples: ["Marketing site", "Client portal", "Consumer app"],
  },
  {
    value: "internal-team",
    label: "Internal team use",
    description: "Built mainly for your team or operations.",
    examples: ["Ops dashboard", "Sales workflow", "Internal knowledge tool"],
  },
  {
    value: "new-initiative",
    label: "Brand-new initiative",
    description: "This is a new idea or business line, not a tune-up.",
    examples: ["New venture", "Fresh offer", "First version of a concept"],
  },
  {
    value: "existing-asset",
    label: "Existing site/app/process",
    description: "There’s already something in place and this work builds on it.",
    examples: ["Existing website", "Current app", "Established workflow"],
  },
  {
    value: "ai-enabled",
    label: "AI is part of it",
    description: "AI is a meaningful part of the experience, workflow, or automation.",
    examples: ["AI assistant", "Prompt workflow", "Auto-generated content or analysis"],
  },
];

export const PROJECT_CAPABILITIES: IntakeOption[] = [
  {
    value: "strategy",
    label: "Strategy and scoping",
    description: "Clarify direction, requirements, priorities, or what to do first.",
    examples: ["Roadmap", "PRD", "Offer positioning"],
  },
  {
    value: "ux-ui",
    label: "UX/UI design",
    description: "Shape flows, screens, interactions, and visuals.",
    examples: ["Wireframes", "Design system", "Responsive UI"],
  },
  {
    value: "frontend",
    label: "Website or app build",
    description: "Build the visible product, interface, or experience.",
    examples: ["Landing page", "Web app", "Dashboard"],
  },
  {
    value: "backend-data",
    label: "Backend, data, or integrations",
    description: "APIs, database work, automations, and systems behind the scenes.",
    examples: ["Supabase setup", "CRM sync", "Internal automation"],
  },
  {
    value: "content-copy",
    label: "Messaging, copy, or content",
    description: "Words and content that explain, sell, or guide.",
    examples: ["Website copy", "Launch messaging", "Email sequence"],
  },
  {
    value: "growth-marketing",
    label: "Growth and acquisition",
    description: "Traffic, experiments, campaigns, and conversion work.",
    examples: ["Paid campaigns", "SEO improvements", "Conversion testing"],
  },
  {
    value: "qa-optimization",
    label: "QA, polish, or optimization",
    description: "Test, refine, improve performance, and reduce risk.",
    examples: ["Bug bash", "Responsive cleanup", "Performance pass"],
  },
];

export const PROJECT_STAGES: IntakeOption[] = [
  {
    value: "idea",
    label: "Just an idea",
    description: "You need help turning a rough idea into a plan.",
    examples: ["Still framing the problem", "Need options", "No spec yet"],
  },
  {
    value: "planning",
    label: "Needs a clear plan",
    description: "The direction is known, but scope and decisions need to be shaped.",
    examples: ["Need a brief", "Need architecture", "Need priorities"],
  },
  {
    value: "ready-to-design",
    label: "Ready for design",
    description: "The concept is clear enough to move into flows, wireframes, or UI.",
    examples: ["Requirements exist", "Need screens", "Need visual direction"],
  },
  {
    value: "ready-to-build",
    label: "Ready to build",
    description: "Enough is defined to start implementation now.",
    examples: ["Spec exists", "Design exists", "Just need execution"],
  },
  {
    value: "already-live",
    label: "Already live, needs improvement",
    description: "Something exists today and needs fixes, improvements, or growth.",
    examples: ["Improve conversion", "Add features", "Clean up UX or performance"],
  },
];

export const CONFIDENCE_OPTIONS: IntakeOption[] = [
  {
    value: "clear",
    label: "I know what I need",
    description: "You want the team to move fast on a clear direction.",
    examples: ["I have a spec", "I know the deliverable", "I just need execution"],
  },
  {
    value: "somewhat-clear",
    label: "I know the outcome, not the exact path",
    description: "You know the goal, but want help shaping the best approach.",
    examples: ["Need recommendations", "Open to a few options", "Want the right mix of teams"],
  },
  {
    value: "not-sure",
    label: "I’m not sure yet",
    description: "You want a safe intake path that starts with discovery and recommendation.",
    examples: ["Not sure if this is product or marketing", "Need help naming the work", "Want someone to triage it"],
  },
];

export const READINESS_OPTIONS: ReadinessOption[] = [
  {
    value: "needs-shaping",
    label: "Needs shaping",
    description: "The problem or goal is real, but the team should help define the plan before execution starts.",
    examples: ["Need a brief", "Need scope or priorities", "Need help deciding the right approach"],
    stage: "planning",
    confidence: "not-sure",
  },
  {
    value: "ready-to-start",
    label: "Ready to start",
    description: "There’s enough clarity to begin design or build work now without a separate discovery phase.",
    examples: ["Clear requirements", "Known outcome", "Team can move into execution"],
    stage: "ready-to-build",
    confidence: "clear",
  },
  {
    value: "already-underway",
    label: "Already underway",
    description: "Something already exists and this work is about improving, extending, or unblocking it.",
    examples: ["Live product", "Existing campaign", "Current workflow needs refinement"],
    stage: "already-live",
    confidence: "clear",
  },
];

export function getReadinessOption(stage?: string, confidence?: string) {
  if (!stage && !confidence) return undefined;
  return READINESS_OPTIONS.find((item) => item.stage === stage && item.confidence === confidence);
}

export function inferIntakeReadiness(intake: Pick<ProjectIntake, "shape" | "context" | "capabilities" | "goals">) {
  const shape = intake.shape ?? "";
  const context = intake.context ?? [];
  const capabilities = intake.capabilities ?? [];
  const goals = Array.isArray(intake.goals)
    ? intake.goals.join(" ").toLowerCase()
    : String(intake.goals ?? "").toLowerCase();

  const hasAnyGoalText = goals.trim().length > 0;
  const hasBuild = capabilities.includes("frontend") || capabilities.includes("backend-data");
  const hasDesign = capabilities.includes("ux-ui");
  const hasStrategy = capabilities.includes("strategy");
  const hasGrowth = capabilities.includes("growth-marketing") || capabilities.includes("content-copy");
  const referencesExistingAsset =
    context.includes("existing-asset") ||
    /\b(existing|already live|live site|current site|current app|redesign|improve|optimization|optimize|cleanup|refactor|migrate|migration|refresh|audit|fix|bug|bugs)\b/.test(goals);
  const discoverySignals = /\b(not sure|unsure|figure out|help define|help decide|scope|scoping|strategy|discovery|explore|investigate|audit|recommend|planning|plan|roadmap|brief)\b/.test(goals);
  const executionSignals = /\b(build|ship|implement|implementation|develop|launch|execute|execution|wireframe|wireframes|design|designs|prototype|prototypes|spec|requirements|handoff)\b/.test(goals);
  const strategyShapes = ["research-strategy", "hybrid-not-sure"];
  const executionShapes = ["saas-product", "web-app", "native-app", "ops-system", "website"];

  if (referencesExistingAsset) {
    return { stage: "already-live", confidence: executionSignals || hasBuild || hasGrowth ? "clear" : "somewhat-clear" };
  }

  if (strategyShapes.includes(shape) || discoverySignals || (hasStrategy && !hasBuild && !hasDesign && !hasGrowth)) {
    return { stage: "planning", confidence: hasAnyGoalText && !discoverySignals ? "somewhat-clear" : "not-sure" };
  }

  if (hasBuild || (executionSignals && executionShapes.includes(shape))) {
    return { stage: "ready-to-build", confidence: executionSignals || hasAnyGoalText ? "clear" : "somewhat-clear" };
  }

  if (hasDesign) {
    return { stage: "ready-to-design", confidence: hasAnyGoalText ? "somewhat-clear" : "not-sure" };
  }

  if (shape === "launch-campaign" || hasGrowth) {
    return { stage: "ready-to-build", confidence: hasAnyGoalText ? "somewhat-clear" : "not-sure" };
  }

  return { stage: "planning", confidence: hasAnyGoalText ? "somewhat-clear" : "not-sure" };
}

export function formatIntakeValue(value?: string) {
  if (!value) return "Not set";
  const all = [...PROJECT_SHAPES, ...PROJECT_CONTEXTS, ...PROJECT_CAPABILITIES, ...PROJECT_STAGES, ...CONFIDENCE_OPTIONS, ...READINESS_OPTIONS];
  return all.find((item) => item.value === value)?.label || value.replace(/-/g, " ");
}

export function legacyTypeToLabel(type?: string | null) {
  switch (type) {
    case "product_build":
      return "Product build";
    case "marketing_growth":
      return "Marketing / growth";
    case "ops_enablement":
      return "Ops / internal systems";
    case "strategy_research":
      return "Strategy / discovery";
    case "hybrid":
      return "Hybrid / not sure";
    case "saas":
      return "SaaS";
    case "web_app":
      return "Web app";
    case "native_app":
      return "Native app";
    case "marketing":
      return "Marketing";
    case "other":
      return "Other";
    default:
      return type ? type.replace(/_/g, " ") : "Other";
  }
}

function inferReadinessLabel(stage?: string, confidence?: string) {
  const exact = getReadinessOption(stage, confidence);
  if (exact) return exact.label;
  if (stage === "idea") return "Early discovery";
  if (stage === "planning") return "Needs shaping";
  if (stage === "ready-to-design") return "Ready for design";
  if (stage === "ready-to-build") return confidence === "not-sure" ? "Build soon, needs alignment" : "Ready to start";
  if (stage === "already-live") return "Already underway";
  return stage ? formatIntakeValue(stage) : undefined;
}

function getRoutingSignals(intake: ProjectIntake) {
  const capabilities = intake.capabilities ?? [];
  const stage = intake.stage ?? "";
  const shape = intake.shape ?? "";
  const confidence = intake.confidence ?? "";

  const isEarly = confidence === "not-sure" || ["idea", "planning"].includes(stage) || ["research-strategy", "hybrid-not-sure"].includes(shape);
  const hasStrategy = capabilities.includes("strategy");
  const hasDesign = capabilities.includes("ux-ui");
  const hasFrontend = capabilities.includes("frontend");
  const hasBackend = capabilities.includes("backend-data");
  const hasContent = capabilities.includes("content-copy");
  const hasGrowth = capabilities.includes("growth-marketing");
  const hasQa = capabilities.includes("qa-optimization");
  const buildHeavy = hasFrontend || hasBackend;
  const marketingHeavy = shape === "launch-campaign" || hasGrowth || (hasContent && !buildHeavy);
  const designHeavy = hasDesign && !buildHeavy;
  const websiteLike = shape === "website";
  const productLike = ["saas-product", "web-app", "native-app", "ops-system"].includes(shape);
  const liveOptimization = stage === "already-live" || hasQa;

  return {
    capabilities,
    stage,
    shape,
    confidence,
    isEarly,
    hasStrategy,
    hasDesign,
    hasFrontend,
    hasBackend,
    hasContent,
    hasGrowth,
    hasQa,
    buildHeavy,
    marketingHeavy,
    designHeavy,
    websiteLike,
    productLike,
    liveOptimization,
  };
}

export function summarizeIntake(intake: ProjectIntake) {
  const resolvedReadiness = intake.stage && intake.confidence ? { stage: intake.stage, confidence: intake.confidence } : inferIntakeReadiness(intake);
  const parts = [
    intake.shape ? formatIntakeValue(intake.shape) : "",
    inferReadinessLabel(resolvedReadiness.stage, resolvedReadiness.confidence),
    (intake.capabilities ?? []).length > 0 ? (intake.capabilities ?? []).map(formatIntakeValue).join(", ") : "",
  ].filter(Boolean);

  return parts.join(" • ");
}

export function deriveLegacyProjectType(intake: ProjectIntake) {
  if (intake.shape === "launch-campaign") return "marketing_growth";
  if (intake.shape === "ops-system") return "ops_enablement";
  if (intake.shape === "research-strategy") return "strategy_research";
  if (intake.shape === "native-app") return "native_app";
  if (intake.shape === "hybrid-not-sure" || intake.confidence === "not-sure") return "hybrid";
  return "product_build";
}

export function getAutoRouteTeamIdsFromIntake(intake: ProjectIntake, teams: Record<string, string>) {
  const selected = new Set<string>();
  const signals = getRoutingSignals(intake);

  if (signals.isEarly || signals.hasStrategy) selected.add(teams.PRODUCT);
  if (signals.productLike || signals.buildHeavy) selected.add(teams.ENGINEERING);
  if (signals.marketingHeavy) selected.add(teams.MARKETING);
  if (signals.hasDesign || ["website", "launch-campaign", "hybrid-not-sure"].includes(signals.shape)) selected.add(teams.DESIGN);
  if (signals.liveOptimization) selected.add(teams.QA);

  if (selected.size === 0) {
    selected.add(teams.PRODUCT);
    selected.add(teams.DESIGN);
  }

  return Array.from(selected).filter(Boolean);
}

export function getRoutingSummary(intake: ProjectIntake) {
  const signals = getRoutingSignals(intake);

  const ownerTeam = signals.isEarly
    ? "Product"
    : signals.marketingHeavy && !signals.buildHeavy && (signals.shape === "launch-campaign" || signals.hasGrowth)
      ? "Marketing"
      : signals.websiteLike && !signals.buildHeavy && signals.designHeavy
        ? "Design"
        : signals.designHeavy && signals.stage === "ready-to-design"
          ? "Design"
          : signals.productLike || signals.buildHeavy || (signals.websiteLike && signals.hasFrontend)
            ? "Engineering"
            : signals.marketingHeavy
              ? "Marketing"
              : signals.hasDesign
                ? "Design"
                : "Product";

  const qcTeam = ownerTeam === "Engineering" ? "QA" : ownerTeam === "Marketing" ? "Product" : ownerTeam === "Design" ? "Product" : "QA";

  const rationale = ownerTeam === "Product"
    ? "Discovery-first route based on early-stage or still-being-shaped intake."
    : ownerTeam === "Marketing"
      ? "Growth, campaign, or messaging needs are the strongest signal right now."
      : ownerTeam === "Design"
        ? "This looks design-led before deeper build work starts."
        : "Build and implementation needs are strong enough to start with Engineering.";

  return { ownerTeam, qcTeam, rationale };
}
