"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  PROJECT_CAPABILITIES,
  PROJECT_CONTEXTS,
  PROJECT_SHAPES,
  ProjectIntake,
  deriveLegacyProjectType,
  inferIntakeReadiness,
  getRoutingSummary,
  summarizeIntake,
} from "@/lib/project-intake";
import { PROJECT_LINK_FIELDS, PROJECT_LINK_LABELS, type ProjectLinks } from "@/lib/project-links";

interface CreateProjectFormProps {
  onSubmit: (data: {
    name: string;
    type: string;
    description?: string;
    intake?: ProjectIntake;
  }) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
  error?: string | null;
  prefillName?: string;
  prefillType?: string;
  docsSection?: ReactNode;
  onStepChange?: () => void;
}

type IntakeMode = "quick" | "guided";
type IntakePath = IntakeMode | null;
type ProjectOrigin = "new" | "existing";
type FlowStepId = "mode" | "shape" | "brief" | "review";

type FlowStep = {
  id: FlowStepId;
  eyebrow: string;
  title: string;
  description: string;
  helper?: string;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function SelectionCard({
  selected,
  label,
  description,
  examples,
  onClick,
  hint,
  multi,
  compact,
}: {
  selected: boolean;
  label: string;
  description: string;
  examples: string[];
  onClick: () => void;
  hint?: string;
  multi?: boolean;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative block w-full min-w-0 overflow-hidden rounded-[24px] border p-4 text-left transition-all duration-200",
        compact ? "min-h-[180px] md:min-h-[220px]" : "",
        "focus:outline-none focus:ring-2 focus:ring-red-300",
        selected
          ? "border-red-400 bg-white shadow-[0_10px_28px_rgba(24,24,27,0.07)]"
          : "border-zinc-200 bg-white hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_12px_30px_rgba(24,24,27,0.08)]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="text-sm font-semibold text-zinc-950">{label}</div>
          <p className="text-sm leading-6 text-zinc-600">{description}</p>
        </div>
        <div
          className={cn(
            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors",
            selected ? "border-red-600 bg-red-600 text-white" : "border-zinc-300 bg-white text-transparent"
          )}
        >
          <span className="text-xs font-bold">{multi ? "✓" : "•"}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {examples.map((example) => (
          <span
            key={example}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium",
              selected ? "bg-white/90 text-red-700" : "bg-zinc-100 text-zinc-500"
            )}
          >
            {example}
          </span>
        ))}
      </div>

      {hint ? <p className="mt-3 text-xs font-medium text-red-700">{hint}</p> : null}
    </button>
  );
}

function OptionBrowser({
  children,
  columns = 2,
}: {
  children: ReactNode;
  columns?: 1 | 2;
}) {
  return (
    <>
      <div className="grid min-w-0 gap-3 md:hidden">{children}</div>
      <div className={cn("hidden gap-3 md:grid", columns === 2 ? "md:grid-cols-2" : "md:grid-cols-1")}>{children}</div>
    </>
  );
}

function FieldHint({ children, tone = "muted" }: { children: string; tone?: "muted" | "error" }) {
  return <p className={cn("mt-2 text-xs", tone === "error" ? "text-red-600" : "text-zinc-500")}>{children}</p>;
}

function getProjectLinkPlaceholder(key: (typeof PROJECT_LINK_FIELDS)[number]) {
  switch (key) {
    case "github":
      return "https://github.com/org/repo";
    case "preview":
      return "https://preview.example.com";
    case "production":
      return "https://app.example.com";
    case "docs":
      return "https://docs.example.com";
    case "figma":
      return "https://figma.com/file/...";
    case "admin":
      return "https://admin.example.com";
    default:
      return "https://example.com";
  }
}

function buildFlow(mode: IntakePath): FlowStep[] {
  const chooserStep: FlowStep = {
    id: "mode",
    eyebrow: "Step 1 • Start",
    title: "How would you like to start this project?",
    description: "Choose the path that feels easiest. Quick brief is more open, and Guided setup adds a little structure first.",
    helper: "You can switch paths before submitting.",
  };

  if (!mode) {
    return [chooserStep];
  }

  if (mode === "quick") {
    return [
      chooserStep,
      {
        id: "brief",
        eyebrow: "Step 2 • Quick brief",
        title: "What needs to happen?",
        description: "Give the project a name, describe the need in plain language, and add any helpful docs or screenshots. We’ll still route it safely even if the brief is rough.",
        helper: undefined,
      },
      {
        id: "review",
        eyebrow: "Step 3 • Final review",
        title: "Review before creating the project",
        description: "Check the summary and make any final routing tweaks if needed.",
        helper: "Submission behavior stays the same.",
      },
    ];
  }

  return [
    chooserStep,
    {
      id: "shape",
      eyebrow: "Step 2 • Project type",
      title: "What kind of project is this?",
      description: "Pick the closest fit. It helps us suggest the right starting route without turning this into a long intake.",
      helper: "Choose the closest fit — SaaS product, web app, website, or something else all work here.",
    },
    {
      id: "brief",
      eyebrow: "Step 3 • Project brief",
      title: "Add the key context",
      description: "Give it a working name, add the essentials, and attach any supporting files. Adjust routing only if the suggested default looks off.",
      helper: undefined,
    },
    {
      id: "review",
      eyebrow: "Step 4 • Final review",
      title: "Review before creating the project",
      description: "Check the summary and make any final routing tweaks if needed.",
      helper: "Go back if anything looks wrong.",
    },
  ];
}

function getRecommendedSelections(shape: string) {
  switch (shape) {
    case "saas-product":
      return {
        context: ["customer-facing", "new-initiative"],
        capabilities: ["ux-ui", "frontend", "backend-data"],
      };
    case "web-app":
      return {
        context: ["customer-facing", "new-initiative"],
        capabilities: ["ux-ui", "frontend"],
      };
    case "website":
      return {
        context: ["customer-facing"],
        capabilities: ["ux-ui", "frontend", "content-copy"],
      };
    case "launch-campaign":
      return {
        context: ["customer-facing"],
        capabilities: ["content-copy", "growth-marketing"],
      };
    case "ops-system":
      return {
        context: ["internal-team"],
        capabilities: ["backend-data"],
      };
    case "research-strategy":
      return {
        context: [],
        capabilities: ["strategy"],
      };
    case "hybrid-not-sure":
      return {
        context: [],
        capabilities: ["strategy"],
      };
    default:
      return {
        context: [],
        capabilities: [],
      };
  }
}

function getStepValidity(
  stepId: FlowStepId,
  mode: IntakePath,
  state: {
    name: string;
    shape: string;
    context: string[];
    capabilities: string[];
    stage: string;
    confidence: string;
    goals: string;
  }
) {
  switch (stepId) {
    case "mode":
      return Boolean(mode);
    case "shape":
      return mode === "quick" ? true : Boolean(state.shape);
    case "brief":
      return Boolean(state.name.trim()) && (mode === "guided" || Boolean(state.goals.trim()));
    case "review":
      return Boolean(state.name.trim()) && (mode === "guided" || Boolean(state.goals.trim()));
    default:
      return false;
  }
}

export function CreateProjectForm({
  onSubmit,
  onCancel,
  isSubmitting,
  error,
  prefillName,
  docsSection,
  onStepChange,
}: CreateProjectFormProps) {
  const [mode, setMode] = useState<IntakePath>(null);
  const [name, setName] = useState(prefillName || "");
  const [shape, setShape] = useState("");
  const [context, setContext] = useState<string[]>([]);
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [goals, setGoals] = useState("");
  const [projectOrigin, setProjectOrigin] = useState<ProjectOrigin>("new");
  const [projectLinks, setProjectLinks] = useState<ProjectLinks>({});
  const [showAdvancedQuickRouting, setShowAdvancedQuickRouting] = useState(false);
  const [showAdvancedGuidedRouting, setShowAdvancedGuidedRouting] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [showValidation, setShowValidation] = useState(false);
  const submitIntentRef = useRef(false);

  useEffect(() => {
    if (prefillName) setName(prefillName);
  }, [prefillName]);

  const flow = useMemo(() => buildFlow(mode), [mode]);

  useEffect(() => {
    onStepChange?.();
  }, [currentStep, onStepChange]);

  useEffect(() => {
    setCurrentStep((step) => Math.min(step, flow.length - 1));
  }, [flow.length]);

  const inferredReadiness = useMemo(() => inferIntakeReadiness({ shape, context, capabilities, goals }), [shape, context, capabilities, goals]);

  const intake = useMemo<ProjectIntake>(
    () => ({
      projectName: name,
      shape,
      context,
      capabilities,
      stage: inferredReadiness.stage,
      confidence: inferredReadiness.confidence,
      goals: goals || undefined,
      projectOrigin,
      links: projectOrigin === "existing" ? projectLinks : undefined,
      summary: summarizeIntake({
        shape,
        context,
        capabilities,
        stage: inferredReadiness.stage,
        confidence: inferredReadiness.confidence,
        projectName: name,
        goals,
      }),
    }),
    [name, shape, context, capabilities, inferredReadiness, goals, projectOrigin, projectLinks]
  );

  const routing = useMemo(() => getRoutingSummary(intake), [intake]);
  const activeStep = flow[currentStep];
  const stateForValidity = { name, shape, context, capabilities, stage: inferredReadiness.stage, confidence: inferredReadiness.confidence, goals };
  const currentStepValid = getStepValidity(activeStep.id, mode, stateForValidity);
  const isChoosingPath = !mode && activeStep.id === "mode";
  const isDesktopModeStep = activeStep.id === "mode";
  const stepProgress = isChoosingPath ? 0 : Math.max(12, Math.round(((currentStep + 1) / flow.length) * 100));
  const furthestUnlockedIndex = Math.min(
    flow.findIndex((step) => !getStepValidity(step.id, mode, stateForValidity)) === -1
      ? flow.length - 1
      : flow.findIndex((step) => !getStepValidity(step.id, mode, stateForValidity)),
    flow.length - 1
  );
  const recommended = getRecommendedSelections(shape);
  const showExistingProjectLinks = projectOrigin === "existing";
  const desktopStepItems = flow
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => step.id !== "mode");

  const toggleValue = (current: string[], value: string) =>
    current.includes(value) ? current.filter((item) => item !== value) : [...current, value];

  const advance = () => {
    submitIntentRef.current = false;
    setShowValidation(false);
    setCurrentStep((step) => Math.min(step + 1, flow.length - 1));
  };

  const goBack = () => {
    submitIntentRef.current = false;
    setShowValidation(false);
    setCurrentStep((step) => Math.max(step - 1, 0));
  };

  const requireAndAdvance = () => {
    if (!currentStepValid) {
      setShowValidation(true);
      return;
    }
    advance();
  };

  const switchMode = (nextMode: IntakeMode) => {
    submitIntentRef.current = false;
    setMode(nextMode);
    setShowValidation(false);
    setCurrentStep(1);

    if (nextMode === "quick") {
      if (!shape) setShape("hybrid-not-sure");
      if (capabilities.length === 0) setCapabilities(["strategy"]);
    } else {
      if (shape === "hybrid-not-sure") setShape("");
      if (capabilities.length === 1 && capabilities[0] === "strategy") setCapabilities([]);
    }
  };

  const handleShapeChoice = (value: string) => {
    submitIntentRef.current = false;
    setShape(value);
    const nextRecommended = getRecommendedSelections(value);
    setContext((current) => (current.length === 0 ? nextRecommended.context : current));
    setCapabilities((current) => (current.length === 0 ? nextRecommended.capabilities : current));
    setShowValidation(false);
    window.setTimeout(() => {
      setCurrentStep((step) => Math.min(step + 1, flow.length - 1));
    }, 120);
  };

  const handleProjectOriginChange = (nextOrigin: ProjectOrigin) => {
    submitIntentRef.current = false;
    setProjectOrigin(nextOrigin);
    setShowValidation(false);

    if (nextOrigin === "new") {
      setProjectLinks({});
      setContext((current) => current.filter((item) => item !== "existing-asset"));
    } else {
      setContext((current) => (current.includes("existing-asset") ? current : [...current, "existing-asset"]));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (activeStep.id !== "review") {
      submitIntentRef.current = false;
      requireAndAdvance();
      return;
    }

    if (!submitIntentRef.current) {
      submitIntentRef.current = false;
      return;
    }

    submitIntentRef.current = false;

    const requiredSteps: FlowStepId[] = mode === "quick" ? ["brief"] : ["shape", "brief"];
    const firstInvalidIndex = flow.findIndex((step) => requiredSteps.includes(step.id) && !getStepValidity(step.id, mode, stateForValidity));

    if (firstInvalidIndex !== -1) {
      setCurrentStep(firstInvalidIndex);
      setShowValidation(true);
      return;
    }

    await onSubmit({
      name,
      type: deriveLegacyProjectType(intake),
      description: goals || intake.summary,
      intake,
    });
  };

  const stepCounter = isChoosingPath ? "Not started" : `${currentStep + 1} of ${flow.length}`;
  const getDesktopStepNavLabel = (step: FlowStep) => step.title;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="min-w-0">
        <section className="min-w-0 overflow-hidden rounded-[28px] border border-red-100/70 bg-white p-0 shadow-[0_14px_34px_rgba(24,24,27,0.05)] sm:px-6 sm:pt-4 sm:pb-5">
          <div className="border-b border-red-100/80 pb-3 sm:pb-4">
            <div className="hidden sm:block">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-red-500">Progress</p>
                  <div className="shrink-0 rounded-full border border-red-100 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 shadow-sm">
                    {stepCounter}
                  </div>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-red-100/55">
                  <div className="h-full rounded-full bg-red-500 transition-all duration-300" style={{ width: `${stepProgress}%` }} />
                </div>
              </div>
            </div>

            <div className="space-y-2 sm:hidden">
              <div className="flex items-center justify-between gap-3">
                <div className="shrink-0 rounded-full border border-red-100 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 shadow-sm">
                  {stepCounter}
                </div>
                <p className="text-[11px] font-medium text-zinc-500">Progress</p>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-zinc-200">
                <div className="h-full rounded-full bg-red-500 transition-all duration-300" style={{ width: `${stepProgress}%` }} />
              </div>
            </div>

            <div className={cn("mt-4 hidden -mx-1 snap-x gap-2 overflow-x-auto px-1 pb-1 md:flex [&::-webkit-scrollbar]:hidden [scrollbar-width:none]", isDesktopModeStep && "md:hidden")}>
              {desktopStepItems.map(({ step, index }) => {
                const isActive = index === currentStep;
                const isCompleted = getStepValidity(step.id, mode, stateForValidity);
                const isReachable = index <= furthestUnlockedIndex;
                const desktopStepNumber = index;

                return isReachable ? (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => {
                      setCurrentStep(index);
                      setShowValidation(false);
                    }}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                      isActive
                        ? "border-red-200 bg-red-50 text-red-700"
                        : isCompleted
                          ? "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                          : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-300 hover:text-zinc-900"
                    )}
                  >
                    {desktopStepNumber}. {getDesktopStepNavLabel(step)}
                  </button>
                ) : (
                  <div
                    key={step.id}
                    className="shrink-0 rounded-full border border-dashed border-zinc-200 bg-transparent px-3 py-1.5 text-xs font-medium text-zinc-400"
                  >
                    {desktopStepNumber}. {getDesktopStepNavLabel(step)}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-3 min-h-0 sm:mt-4">
            <div className="min-w-0 max-w-full p-0 sm:max-w-4xl sm:rounded-[24px] sm:border sm:border-zinc-200 sm:bg-zinc-50/50 sm:p-5">
              <div className={cn("flex flex-col gap-3 md:flex-row md:items-start md:justify-between", isDesktopModeStep && "md:hidden")}>
                <div className="max-w-2xl">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-400">{activeStep.eyebrow}</p>
                  <h3 className="mt-2 text-[1.65rem] font-semibold tracking-tight text-zinc-950 sm:text-[1.95rem]">{activeStep.title}</h3>
                  <p className="mt-2 hidden max-w-2xl text-sm leading-6 text-zinc-600 sm:block">{activeStep.description}</p>
                </div>
                {null}
              </div>

              <div className={cn("mt-3 text-sm leading-6 text-zinc-600 sm:hidden", isDesktopModeStep && "hidden")}>{activeStep.description}</div>

              <div className={cn("mt-5", isDesktopModeStep && "md:mt-0")}>
                {activeStep.id === "mode" ? (
                  <div className="space-y-4">
                    <div className="hidden md:block">
                      <h3 className="text-lg font-semibold tracking-tight text-zinc-950">Choose how to start</h3>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => switchMode("quick")}
                        className={cn(
                          "rounded-[28px] border p-5 text-left transition-all",
                          mode === "quick"
                            ? "border-red-400 bg-white shadow-[0_10px_28px_rgba(24,24,27,0.07)]"
                            : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm"
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-base font-semibold text-zinc-950">Quick brief</p>
                            <p className="mt-2 text-sm leading-6 text-zinc-600">Write the project in your own words, add any context you already have, and keep moving.</p>
                          </div>
                          <div className={cn("h-6 w-6 rounded-full border", mode === "quick" ? "border-red-600 bg-red-600" : "border-zinc-300 bg-white")} />
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-medium">
                          <span className="rounded-full bg-white px-2.5 py-1 text-zinc-600">Free-form</span>
                          <span className="rounded-full bg-white px-2.5 py-1 text-zinc-600">Plain language</span>
                          <span className="rounded-full bg-white px-2.5 py-1 text-zinc-600">Docs + images</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => switchMode("guided")}
                        className={cn(
                          "rounded-[28px] border p-5 text-left transition-all",
                          mode === "guided"
                            ? "border-red-400 bg-white shadow-[0_10px_28px_rgba(24,24,27,0.07)]"
                            : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm"
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-base font-semibold text-zinc-950">Guided setup</p>
                            <p className="mt-2 text-sm leading-6 text-zinc-600">Choose the closest project type first, then add a short brief with a little more structure.</p>
                          </div>
                          <div className={cn("h-6 w-6 rounded-full border", mode === "guided" ? "border-red-600 bg-red-600" : "border-zinc-300 bg-white")} />
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-medium">
                          <span className="rounded-full bg-white px-2.5 py-1 text-zinc-600">Structured</span>
                          <span className="rounded-full bg-white px-2.5 py-1 text-zinc-600">Team signals</span>
                          <span className="rounded-full bg-white px-2.5 py-1 text-zinc-600">Still lightweight</span>
                        </div>
                      </button>
                    </div>

                  </div>
                ) : null}

                {activeStep.id === "shape" ? (
                  <div className="space-y-4">
                    <OptionBrowser columns={2}>
                      {PROJECT_SHAPES.map((option) => (
                        <div key={option.value} className="w-full max-w-full md:w-auto">
                          <SelectionCard
                            selected={shape === option.value}
                            label={option.label}
                            description={option.description}
                            examples={option.examples}
                            hint={option.hint}
                            compact
                            onClick={() => handleShapeChoice(option.value)}
                          />
                        </div>
                      ))}
                    </OptionBrowser>
                    {showValidation && !shape ? <FieldHint tone="error">Choose the option that best matches the work to continue.</FieldHint> : <FieldHint>Pick the closest fit. Common choices like SaaS product, web app, website, and something else are all covered.</FieldHint>}
                  </div>
                ) : null}

                {activeStep.id === "brief" ? (
                  <div className="space-y-6">
                    <section className="rounded-[24px] border border-zinc-200 bg-zinc-50/80 p-4">
                      <label className="block text-sm font-medium text-zinc-700">
                        Project name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          setShowValidation(false);
                        }}
                        required
                        className="mt-2 w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-base focus:border-red-500 focus:outline-none"
                        placeholder="e.g., Command Center V2"
                      />
                      {showValidation && !name.trim() ? (
                        <FieldHint tone="error">Add a working project name.</FieldHint>
                      ) : (
                        <FieldHint>A rough name is fine. You can rename it later.</FieldHint>
                      )}
                    </section>

                    <section className="rounded-[24px] border border-zinc-200 bg-zinc-50/80 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h4 className="text-sm font-semibold text-zinc-900">What are we starting from?</h4>
                          <p className="mt-1 text-sm text-zinc-500">Tell us whether this is brand new work or an improvement to something that already exists.</p>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => handleProjectOriginChange("new")}
                          className={cn(
                            "rounded-[24px] border p-4 text-left transition-all",
                            projectOrigin === "new"
                              ? "border-red-400 bg-white shadow-[0_8px_22px_rgba(24,24,27,0.06)]"
                              : "border-zinc-200 bg-white hover:border-zinc-300"
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-zinc-950">Net-new project</p>
                              <p className="mt-2 text-sm leading-6 text-zinc-600">This is a fresh initiative, new build, or first version. No existing repo or live product needs to be referenced right now.</p>
                            </div>
                            <div className={cn("mt-0.5 h-6 w-6 rounded-full border", projectOrigin === "new" ? "border-red-600 bg-red-600" : "border-zinc-300 bg-white")} />
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleProjectOriginChange("existing")}
                          className={cn(
                            "rounded-[24px] border p-4 text-left transition-all",
                            projectOrigin === "existing"
                              ? "border-red-400 bg-white shadow-[0_8px_22px_rgba(24,24,27,0.06)]"
                              : "border-zinc-200 bg-white hover:border-zinc-300"
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-zinc-950">Improve an existing project</p>
                              <p className="mt-2 text-sm leading-6 text-zinc-600">There’s already a site, app, workflow, or repo in place, and this work will improve or extend it using the current materials as reference.</p>
                            </div>
                            <div className={cn("mt-0.5 h-6 w-6 rounded-full border", projectOrigin === "existing" ? "border-red-600 bg-red-600" : "border-zinc-300 bg-white")} />
                          </div>
                        </button>
                      </div>

                      {showExistingProjectLinks ? (
                        <FieldHint>
                          Optional links are available below so the team can review the current project and use those materials as reference.
                        </FieldHint>
                      ) : null}
                    </section>

                    {showExistingProjectLinks ? (
                      <section className="rounded-[24px] border border-zinc-200 bg-white p-4">
                        <div>
                          <h4 className="text-sm font-semibold text-zinc-900">Existing project links</h4>
                          <p className="mt-1 text-sm text-zinc-500">Optional, but especially helpful when there’s an existing repo, live environment, docs, or designs the team should review and use as source material.</p>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {PROJECT_LINK_FIELDS.map((key) => (
                            <label key={key} className="block">
                              <span className="mb-1 block text-sm font-medium text-zinc-700">{PROJECT_LINK_LABELS[key]} URL</span>
                              <input
                                type="url"
                                value={projectLinks[key] || ""}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setProjectLinks((current) => {
                                    const next = { ...current };
                                    if (value.trim()) next[key] = value;
                                    else delete next[key];
                                    return next;
                                  });
                                }}
                                className="w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-base focus:border-red-500 focus:outline-none"
                                placeholder={getProjectLinkPlaceholder(key)}
                              />
                            </label>
                          ))}
                        </div>

                        <FieldHint>GitHub or repo links are especially useful when the team should review an existing codebase as reference.</FieldHint>
                      </section>
                    ) : null}

                    <section className="rounded-[24px] border border-zinc-200 bg-white p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h4 className="text-sm font-semibold text-zinc-900">{mode === "quick" ? "What do you need?" : "Optional notes"}</h4>
                          <p className="mt-1 text-sm text-zinc-500">
                            {mode === "quick"
                              ? "Describe the goal, problem, urgency, constraints, or desired outcome in plain language."
                              : "Add goals, constraints, urgency, or anything the team should know right away."}
                          </p>
                        </div>
                        {mode === "quick" ? <div className="rounded-full border border-red-100 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">Required in Quick brief</div> : null}
                      </div>
                      <textarea
                        value={goals}
                        onChange={(e) => {
                          setGoals(e.target.value);
                          setShowValidation(false);
                        }}
                        rows={mode === "quick" ? 7 : 5}
                        className="mt-4 w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-base focus:border-red-500 focus:outline-none"
                        placeholder={mode === "quick" ? "Example: We need a cleaner new project intake that feels easier. The current flow has too many decisions up front. I want a simple way to describe the need, upload a PRD and screenshots, and still route it to the right teams." : "Example: We need something client-ready in 2 weeks. It should feel premium, work beautifully on mobile, and eventually connect to HubSpot."}
                      />
                      {mode === "quick" ? (
                        showValidation && !goals.trim() ? <FieldHint tone="error">Add a short natural-language brief so the team has real context.</FieldHint> : <FieldHint>A few clear sentences is enough.</FieldHint>
                      ) : null}
                    </section>

                    {mode === "guided" ? (
                      <section className="rounded-[24px] border border-zinc-200 bg-zinc-50/80 p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h4 className="text-sm font-semibold text-zinc-900">Routing details</h4>
                            <p className="mt-1 text-sm text-zinc-500">We already suggested a sensible starting route from the project type you chose. We also infer how ready it is from your brief, so open this only if the routing looks off.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowAdvancedGuidedRouting((current) => !current)}
                            className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-400"
                          >
                            {showAdvancedGuidedRouting ? "Hide routing details" : "Fine-tune routing"}
                          </button>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full bg-white px-3 py-1.5 text-zinc-700">Capabilities: {capabilities.length}</span>
                          <span className="rounded-full bg-white px-3 py-1.5 text-zinc-700">Context: {context.length || 0}</span>
                        </div>

                        {showAdvancedGuidedRouting ? (
                          <div className="mt-5 space-y-6">
                            <section className="space-y-4 rounded-[20px] border border-zinc-200 bg-white p-4">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <h5 className="text-sm font-semibold text-zinc-900">Capabilities needed</h5>
                                  <p className="mt-1 text-sm text-zinc-500">We suggest a starting set based on project type. Change it only if it will materially affect routing.</p>
                                </div>
                                {shape ? (
                                  <div className="rounded-full border border-red-100 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
                                    Suggested for {PROJECT_SHAPES.find((item) => item.value === shape)?.label}
                                  </div>
                                ) : null}
                              </div>
                              <OptionBrowser columns={2}>
                                {PROJECT_CAPABILITIES.map((option) => {
                                  const isRecommended = recommended.capabilities.includes(option.value);
                                  return (
                                    <div key={option.value} className="w-full max-w-full md:w-auto">
                                      <SelectionCard
                                        selected={capabilities.includes(option.value)}
                                        label={option.label}
                                        description={option.description}
                                        examples={option.examples}
                                        hint={isRecommended ? "Suggested starting point" : undefined}
                                        multi
                                        compact
                                        onClick={() => {
                                          setCapabilities(toggleValue(capabilities, option.value));
                                          setShowValidation(false);
                                        }}
                                      />
                                    </div>
                                  );
                                })}
                              </OptionBrowser>
                              {capabilities.length === 0 ? <FieldHint tone="error">Choose at least one capability before submitting.</FieldHint> : null}
                            </section>

                            <section className="space-y-4 rounded-[20px] border border-zinc-200 bg-white p-4">
                              <div>
                                <h5 className="text-sm font-semibold text-zinc-900">Context</h5>
                                <p className="mt-1 text-sm text-zinc-500">Optional. Add context only if it meaningfully changes how the team should approach the work.</p>
                              </div>
                              <OptionBrowser columns={2}>
                                {PROJECT_CONTEXTS.map((option) => {
                                  const isRecommended = recommended.context.includes(option.value);
                                  return (
                                    <div key={option.value} className="w-full max-w-full md:w-auto">
                                      <SelectionCard
                                        selected={context.includes(option.value)}
                                        label={option.label}
                                        description={option.description}
                                        examples={option.examples}
                                        hint={isRecommended ? "Common for this type" : undefined}
                                        multi
                                        compact
                                        onClick={() => {
                                          setContext(toggleValue(context, option.value));
                                          setShowValidation(false);
                                        }}
                                      />
                                    </div>
                                  );
                                })}
                              </OptionBrowser>
                              <FieldHint>Leaving context blank is okay.</FieldHint>
                            </section>
                          </div>
                        ) : null}
                      </section>
                    ) : null}

                    {docsSection ? <section>{docsSection}</section> : null}

                    {mode === "quick" ? (
                      <section className="rounded-[24px] border border-zinc-200 bg-zinc-50/80 p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h4 className="text-sm font-semibold text-zinc-900">Routing defaults</h4>
                            <p className="mt-1 text-sm text-zinc-500">We’ll infer routing from your brief and start safe unless you want to adjust the project shape.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowAdvancedQuickRouting((current) => !current)}
                            className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-400"
                          >
                            {showAdvancedQuickRouting ? "Hide routing controls" : "Refine routing"}
                          </button>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full bg-white px-3 py-1.5 text-zinc-700">Shape: {PROJECT_SHAPES.find((item) => item.value === shape)?.label}</span>
                        </div>

                        {showAdvancedQuickRouting ? (
                          <div className="mt-5 space-y-5">
                            <div className="grid gap-4 md:grid-cols-1">
                              <label className="block">
                                <span className="mb-1 block text-sm font-medium text-zinc-700">Project shape</span>
                                <select
                                  value={shape}
                                  onChange={(e) => setShape(e.target.value)}
                                  className="w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-base focus:border-red-500 focus:outline-none"
                                >
                                  {PROJECT_SHAPES.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </select>
                              </label>
                            </div>
                          </div>
                        ) : null}
                      </section>
                    ) : null}
                  </div>
                ) : null}

                {activeStep.id === "review" ? (
                  <div className="space-y-6">
                    <section className="rounded-[28px] border border-red-100/70 bg-white p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-500">Routing preview</p>
                          <h4 className="mt-2 text-xl font-semibold tracking-tight text-zinc-950">{name.trim() || "Untitled project"}</h4>
                          <p className="mt-2 text-sm leading-6 text-zinc-600">{goals.trim() || intake.summary}</p>
                        </div>
                        <div className="rounded-2xl border border-zinc-200/80 bg-white/88 px-4 py-3 text-sm text-zinc-600 shadow-sm">
                          <div className="flex items-center justify-between gap-4">
                            <span>Legacy type</span>
                            <span className="font-medium text-zinc-900">{deriveLegacyProjectType(intake).replace(/_/g, " ")}</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm">Primary route: {routing.ownerTeam}</span>
                        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm">QC: {routing.qcTeam}</span>
                      </div>
                      <p className="mt-3 text-sm text-zinc-600">{routing.rationale}</p>
                    </section>

                    <section className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-[28px] border border-zinc-200 bg-white p-4">
                        <p className="text-sm font-semibold text-zinc-900">Intake summary</p>
                        <dl className="mt-4 space-y-4 text-sm text-zinc-600">
                          <div>
                            <dt className="font-medium text-zinc-900">Path</dt>
                            <dd className="mt-1">{mode === "quick" ? "Quick brief" : "Guided setup"}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-zinc-900">Project shape</dt>
                            <dd className="mt-1">{PROJECT_SHAPES.find((item) => item.value === shape)?.label}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-zinc-900">Starting point</dt>
                            <dd className="mt-1">{projectOrigin === "existing" ? "Improving an existing project" : "Net-new project"}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-zinc-900">Capabilities</dt>
                            <dd className="mt-2 flex flex-wrap gap-2">
                              {capabilities.map((value) => (
                                <span key={value} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">
                                  {PROJECT_CAPABILITIES.find((item) => item.value === value)?.label}
                                </span>
                              ))}
                            </dd>
                          </div>
                          <div>
                            <dt className="font-medium text-zinc-900">Context</dt>
                            <dd className="mt-2 flex flex-wrap gap-2">
                              {context.length > 0 ? (
                                context.map((value) => (
                                  <span key={value} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">
                                    {PROJECT_CONTEXTS.find((item) => item.value === value)?.label}
                                  </span>
                                ))
                              ) : (
                                <span className="text-zinc-500">No extra context added.</span>
                              )}
                            </dd>
                          </div>
                        </dl>
                      </div>

                      <div className="rounded-[28px] border border-zinc-200 bg-white p-4">
                        <p className="text-sm font-semibold text-zinc-900">Brief</p>
                        <div className="mt-4 space-y-4 text-sm text-zinc-600">
                          <div>
                            <p className="font-medium text-zinc-900">Notes</p>
                            <p className="mt-1 whitespace-pre-wrap leading-6 text-zinc-600">{goals.trim() || "No additional notes added."}</p>
                          </div>
                          {showExistingProjectLinks && Object.keys(projectLinks).length > 0 ? (
                            <div>
                              <p className="font-medium text-zinc-900">Existing project links</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {PROJECT_LINK_FIELDS.filter((key) => Boolean(projectLinks[key])).map((key) => (
                                  <span key={key} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">
                                    {PROJECT_LINK_LABELS[key]}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </section>
                  </div>
                ) : null}
              </div>

              <div className="mt-8 flex flex-col gap-3 border-t border-zinc-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div className={cn("text-sm", showValidation && !currentStepValid ? "text-red-600" : "text-zinc-500")}>
                  {activeStep.id === "review"
                    ? "Looks good? Create the project."
                    : activeStep.id === "brief"
                      ? mode === "quick"
                        ? "Share the need, add context if you have it, and we’ll take it from there."
                        : "Add a working name, a short brief, and only adjust routing details if the default looks off."
                      : activeStep.id === "shape"
                        ? "Choose the closest fit and we’ll suggest the likely path."
                        : "Choose the starting path that feels most natural."}
                </div>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={currentStep === 0 ? onCancel : goBack}
                    className="rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-sm transition hover:border-red-200 hover:bg-red-50"
                  >
                    {currentStep === 0 ? "Cancel" : "Back"}
                  </button>

                  {activeStep.id === "review" ? (
                    <button
                      type="submit"
                      onClick={() => {
                        submitIntentRef.current = true;
                      }}
                      disabled={isSubmitting || !name.trim() || (mode === "quick" && !goals.trim()) || (mode === "guided" && capabilities.length === 0)}
                      className="rounded-2xl bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSubmitting ? "Creating..." : "Confirm and create project"}
                    </button>
                  ) : activeStep.id === "shape" ? (
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-500">
                      Choose the closest fit below to continue
                    </div>
                  ) : activeStep.id === "brief" && mode === "quick" ? (
                    <button
                      type="button"
                      onClick={requireAndAdvance}
                      className="rounded-2xl bg-zinc-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
                    >
                      Review project
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={requireAndAdvance}
                      className="rounded-2xl bg-zinc-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
                    >
                      Continue
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

      </div>
    </form>
  );
}
