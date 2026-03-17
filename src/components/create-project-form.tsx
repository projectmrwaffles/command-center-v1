"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  PROJECT_CAPABILITIES,
  PROJECT_CONTEXTS,
  PROJECT_SHAPES,
  ProjectIntake,
  READINESS_OPTIONS,
  deriveLegacyProjectType,
  getReadinessOption,
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
    links?: ProjectLinks;
  }) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
  error?: string | null;
  prefillName?: string;
  prefillType?: string;
  docsSection?: ReactNode;
}

type IntakeMode = "quick" | "guided";
type FlowStepId = "mode" | "shape" | "scope" | "signals" | "brief" | "review";

type FlowStep = {
  id: FlowStepId;
  eyebrow: string;
  title: string;
  description: string;
  helper: string;
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
        compact ? "min-h-[180px] snap-center sm:min-h-[220px]" : "",
        "focus:outline-none focus:ring-2 focus:ring-red-300",
        selected
          ? "border-red-500 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(254,242,242,1),rgba(255,247,237,0.95))] shadow-[0_14px_40px_rgba(239,68,68,0.16)]"
          : "border-zinc-200 bg-white hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_12px_30px_rgba(24,24,27,0.08)]"
      )}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-70" />
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

function TinyAnswer({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-zinc-900">{value || "Pending"}</p>
    </div>
  );
}

function buildFlow(mode: IntakeMode): FlowStep[] {
  if (mode === "quick") {
    return [
      {
        id: "mode",
        eyebrow: "Choose your path",
        title: "Start with the easiest version",
        description: "Use Quick brief if you mostly want to describe the work in your own words and attach context. Switch to Guided setup anytime if you want finer control.",
        helper: "Most people should start with Quick brief.",
      },
      {
        id: "brief",
        eyebrow: "Quick brief",
        title: "What are you trying to make happen?",
        description: "Name it, describe it naturally, and attach any supporting docs or screenshots. We’ll route it safely even if the details are still fuzzy.",
        helper: "Plain language is enough.",
      },
      {
        id: "review",
        eyebrow: "Final review",
        title: "Quick check before we create it",
        description: "You can keep the lightweight defaults or refine routing if you want more control.",
        helper: "Defaults bias toward safe triage.",
      },
    ];
  }

  return [
    {
      id: "mode",
      eyebrow: "Choose your path",
      title: "Start with the easiest version",
      description: "Quick brief is faster and more forgiving. Guided setup adds a few structured signals for tighter routing.",
      helper: "Switch paths anytime before submitting.",
    },
    {
      id: "shape",
      eyebrow: "Project shape",
      title: "What kind of project is this?",
      description: "Pick the closest shape. We’ll recommend the likely team path from there.",
      helper: "One choice is enough to get started.",
    },
    {
      id: "scope",
      eyebrow: "Readiness",
      title: "Where is this work right now?",
      description: "Pick the closest starting point. We’ll translate it into the routing signal behind the scenes.",
      helper: "One natural choice is enough.",
    },
    {
      id: "signals",
      eyebrow: "Team signals",
      title: "What kind of help does this need?",
      description: "We preselect the most likely capabilities. Adjust only what materially changes the route.",
      helper: "Capabilities are required. Context is optional.",
    },
    {
      id: "brief",
      eyebrow: "Project brief",
      title: "Name it and add supporting context",
      description: "A working name is required. Notes, links, and uploads help the receiving team move faster.",
      helper: "Keep it light. You can refine later.",
    },
    {
      id: "review",
      eyebrow: "Final review",
      title: "Quick check before we create it",
      description: "This is the only review step. Submission and routing behavior stay the same.",
      helper: "Go back if anything feels off.",
    },
  ];
}

function getRecommendedSelections(shape: string) {
  switch (shape) {
    case "new-product":
      return {
        context: ["customer-facing", "new-initiative"],
        capabilities: ["ux-ui", "frontend"],
      };
    case "improve-existing":
      return {
        context: ["existing-asset"],
        capabilities: ["ux-ui", "qa-optimization"],
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
  mode: IntakeMode,
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
      return true;
    case "shape":
      return mode === "quick" ? true : Boolean(state.shape);
    case "scope":
      return mode === "quick" ? true : Boolean(getReadinessOption(state.stage, state.confidence));
    case "signals":
      return mode === "quick" ? true : state.capabilities.length > 0;
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
}: CreateProjectFormProps) {
  const [mode, setMode] = useState<IntakeMode>("quick");
  const [name, setName] = useState(prefillName || "");
  const [shape, setShape] = useState("hybrid-not-sure");
  const [context, setContext] = useState<string[]>([]);
  const [capabilities, setCapabilities] = useState<string[]>(["strategy"]);
  const [stage, setStage] = useState("idea");
  const [confidence, setConfidence] = useState("not-sure");
  const [goals, setGoals] = useState("");
  const [links, setLinks] = useState<ProjectLinks>({});
  const [showAdvancedQuickRouting, setShowAdvancedQuickRouting] = useState(false);
  const [showOptionalLinks, setShowOptionalLinks] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [showValidation, setShowValidation] = useState(false);
  const readiness = useMemo(() => getReadinessOption(stage, confidence), [stage, confidence]);

  useEffect(() => {
    if (prefillName) setName(prefillName);
  }, [prefillName]);

  const flow = useMemo(() => buildFlow(mode), [mode]);

  useEffect(() => {
    setCurrentStep((step) => Math.min(step, flow.length - 1));
  }, [flow.length]);

  const intake = useMemo<ProjectIntake>(
    () => ({
      projectName: name,
      shape,
      context,
      capabilities,
      stage,
      confidence,
      goals: goals || undefined,
      links,
      summary: summarizeIntake({ shape, context, capabilities, stage, confidence, projectName: name, goals, links }),
    }),
    [name, shape, context, capabilities, stage, confidence, goals, links]
  );

  const routing = useMemo(() => getRoutingSummary(intake), [intake]);
  const activeStep = flow[currentStep];
  const linkedSurfaces = PROJECT_LINK_FIELDS.filter((key) => Boolean(links[key]));
  const stateForValidity = { name, shape, context, capabilities, stage, confidence, goals };
  const currentStepValid = getStepValidity(activeStep.id, mode, stateForValidity);
  const completedCount = flow.filter((step) => getStepValidity(step.id, mode, stateForValidity)).length;
  const progress = Math.max(12, Math.round((completedCount / flow.length) * 100));
  const furthestUnlockedIndex = Math.min(
    flow.findIndex((step) => !getStepValidity(step.id, mode, stateForValidity)) === -1
      ? flow.length - 1
      : flow.findIndex((step) => !getStepValidity(step.id, mode, stateForValidity)),
    flow.length - 1
  );
  const recommended = getRecommendedSelections(shape);

  const toggleValue = (current: string[], value: string) =>
    current.includes(value) ? current.filter((item) => item !== value) : [...current, value];

  const handleLinkChange = (key: keyof ProjectLinks, value: string) => {
    setLinks((current) => {
      const next = { ...current };
      if (value.trim()) next[key] = value;
      else delete next[key];
      return next;
    });
  };

  const advance = () => {
    setShowValidation(false);
    setCurrentStep((step) => Math.min(step + 1, flow.length - 1));
  };

  const goBack = () => {
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
    setMode(nextMode);
    setShowValidation(false);
    setCurrentStep(0);

    if (nextMode === "quick") {
      if (!shape) setShape("hybrid-not-sure");
      if (!stage) setStage("idea");
      if (!confidence) setConfidence("not-sure");
      if (capabilities.length === 0) setCapabilities(["strategy"]);
    }
  };

  const handleShapeChoice = (value: string) => {
    setShape(value);
    const nextRecommended = getRecommendedSelections(value);
    setContext((current) => (current.length === 0 ? nextRecommended.context : current));
    setCapabilities((current) => (current.length === 0 ? nextRecommended.capabilities : current));
    setShowValidation(false);
    window.setTimeout(() => {
      setCurrentStep((step) => Math.min(step + 1, flow.length - 1));
    }, 120);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const requiredSteps: FlowStepId[] = mode === "quick" ? ["brief"] : ["shape", "scope", "signals", "brief"];
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
      links,
    });
  };

  const stepCounter = `${currentStep + 1} of ${flow.length}`;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 p-0 sm:rounded-[30px] sm:border sm:border-zinc-200 sm:bg-[radial-gradient(circle_at_top_left,rgba(254,242,242,0.95),rgba(255,255,255,1)_42%,rgba(250,250,250,1)_100%)] sm:p-6 sm:shadow-[0_16px_48px_rgba(24,24,27,0.06)]">
          <div className="border-b border-zinc-100 pb-3 sm:pb-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="hidden max-w-2xl sm:block">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-red-500">{mode === "quick" ? "Quick brief" : "Guided setup"}</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
                  Easier intake, without losing the routing signal.
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600">
                  Start with a natural brief and supporting docs, or switch to the guided path if you want tighter control over how the work is framed.
                </p>
              </div>

              <div className="hidden rounded-3xl border border-white/80 bg-white/85 p-4 shadow-sm backdrop-blur sm:block">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">Progress</p>
                <div className="mt-2 flex items-end gap-2">
                  <span className="text-3xl font-semibold tracking-tight text-zinc-950">{stepCounter}</span>
                </div>
                <div className="mt-3 h-2.5 w-56 max-w-full overflow-hidden rounded-full bg-zinc-200">
                  <div className="h-full rounded-full bg-gradient-to-r from-red-500 via-red-500 to-amber-400 transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>

            <div className="space-y-2.5 sm:hidden">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-red-500">{mode === "quick" ? "Quick brief" : "Guided setup"}</p>
                <div className="shrink-0 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600">
                  {stepCounter}
                </div>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-zinc-200">
                <div className="h-full rounded-full bg-gradient-to-r from-red-500 via-red-500 to-amber-400 transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>

            <div className="mt-5 hidden -mx-1 snap-x gap-2 overflow-x-auto px-1 pb-1 md:flex [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
              {flow.map((step, index) => {
                const isActive = index === currentStep;
                const isCompleted = getStepValidity(step.id, mode, stateForValidity);
                const isReachable = index <= furthestUnlockedIndex;

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
                    {index + 1}. {step.title}
                  </button>
                ) : (
                  <div
                    key={step.id}
                    className="shrink-0 rounded-full border border-dashed border-zinc-200 bg-transparent px-3 py-1.5 text-xs font-medium text-zinc-400"
                  >
                    {index + 1}. Up next: {step.title}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-3 min-h-0 sm:mt-6 sm:min-h-[480px]">
            <div className="mb-6 hidden flex-wrap gap-2 md:flex">
              {flow.slice(0, currentStep).map((step) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => {
                    setCurrentStep(flow.findIndex((item) => item.id === step.id));
                    setShowValidation(false);
                  }}
                  className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900"
                >
                  {step.title}
                </button>
              ))}
            </div>

            <div className="min-w-0 max-w-4xl p-0 sm:rounded-[28px] sm:border sm:border-white/80 sm:bg-white/85 sm:p-6 sm:shadow-sm sm:backdrop-blur">
              <div className="flex flex-col gap-2 sm:gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-400">{activeStep.eyebrow}</p>
                  <h3 className="mt-2 text-[1.75rem] font-semibold tracking-tight text-zinc-950 sm:text-2xl">{activeStep.title}</h3>
                  <p className="mt-2 hidden max-w-2xl text-sm leading-6 text-zinc-600 sm:block">{activeStep.description}</p>
                </div>
                <div className="hidden w-fit rounded-full border border-dashed border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-500 sm:inline-flex">
                  {activeStep.helper}
                </div>
              </div>

              <div className="mt-3 text-sm leading-6 text-zinc-600 sm:hidden">{activeStep.description}</div>

              <div className="mt-6">
                {activeStep.id === "mode" ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => switchMode("quick")}
                        className={cn(
                          "rounded-[28px] border p-5 text-left transition-all",
                          mode === "quick"
                            ? "border-red-500 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(254,242,242,1),rgba(255,247,237,0.95))] shadow-[0_14px_40px_rgba(239,68,68,0.16)]"
                            : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm"
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-base font-semibold text-zinc-950">Quick brief</p>
                            <p className="mt-2 text-sm leading-6 text-zinc-600">Just name it, describe what you’re thinking, and attach supporting docs or screenshots.</p>
                          </div>
                          <div className={cn("h-6 w-6 rounded-full border", mode === "quick" ? "border-red-600 bg-red-600" : "border-zinc-300 bg-white")} />
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-medium">
                          <span className="rounded-full bg-white px-2.5 py-1 text-zinc-600">Fastest path</span>
                          <span className="rounded-full bg-white px-2.5 py-1 text-zinc-600">Natural language</span>
                          <span className="rounded-full bg-white px-2.5 py-1 text-zinc-600">Docs + images</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => switchMode("guided")}
                        className={cn(
                          "rounded-[28px] border p-5 text-left transition-all",
                          mode === "guided"
                            ? "border-red-500 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(254,242,242,1),rgba(255,247,237,0.95))] shadow-[0_14px_40px_rgba(239,68,68,0.16)]"
                            : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm"
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-base font-semibold text-zinc-950">Guided setup</p>
                            <p className="mt-2 text-sm leading-6 text-zinc-600">Answer a few structured questions for more precise routing before the project is created.</p>
                          </div>
                          <div className={cn("h-6 w-6 rounded-full border", mode === "guided" ? "border-red-600 bg-red-600" : "border-zinc-300 bg-white")} />
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-medium">
                          <span className="rounded-full bg-white px-2.5 py-1 text-zinc-600">More control</span>
                          <span className="rounded-full bg-white px-2.5 py-1 text-zinc-600">Team signals</span>
                          <span className="rounded-full bg-white px-2.5 py-1 text-zinc-600">Still lightweight</span>
                        </div>
                      </button>
                    </div>

                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                      {mode === "quick"
                        ? "Quick brief will safely default to Product-led triage unless you choose to refine routing later."
                        : "Guided setup uses shape, readiness, and capabilities to tighten the initial route before submission."}
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
                    {showValidation && !shape ? <FieldHint tone="error">Pick the closest project shape to continue.</FieldHint> : null}
                  </div>
                ) : null}

                {activeStep.id === "scope" ? (
                  <div className="space-y-6">
                    <section className="space-y-4 rounded-[24px] border border-zinc-200 bg-zinc-50/70 p-4">
                      <div>
                        <h4 className="text-sm font-semibold text-zinc-900">Project readiness</h4>
                        <p className="mt-1 text-sm text-zinc-500">Choose the closest fit. This replaces the old stage + clarity combo with one cleaner decision.</p>
                      </div>
                      <OptionBrowser columns={1}>
                        {READINESS_OPTIONS.map((option) => (
                          <div key={option.value} className="w-full max-w-full md:w-auto">
                            <SelectionCard
                              selected={readiness?.value === option.value}
                              label={option.label}
                              description={option.description}
                              examples={option.examples}
                              compact
                              onClick={() => {
                                setStage(option.stage);
                                setConfidence(option.confidence);
                                setShowValidation(false);
                              }}
                            />
                          </div>
                        ))}
                      </OptionBrowser>
                      {showValidation && !readiness ? <FieldHint tone="error">Choose the project readiness.</FieldHint> : null}
                    </section>
                  </div>
                ) : null}

                {activeStep.id === "signals" ? (
                  <div className="space-y-6">
                    <section className="space-y-4 rounded-[24px] border border-zinc-200 bg-zinc-50/80 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h4 className="text-sm font-semibold text-zinc-900">Capabilities needed</h4>
                          <p className="mt-1 text-sm text-zinc-500">Start with the preselected help, then add or remove only what materially changes the route.</p>
                        </div>
                        {shape ? (
                          <div className="rounded-full border border-red-100 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
                            Recommended from {PROJECT_SHAPES.find((item) => item.value === shape)?.label}
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
                                hint={isRecommended ? "Recommended starting point" : undefined}
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
                      {showValidation && capabilities.length === 0 ? <FieldHint tone="error">Choose at least one capability.</FieldHint> : null}
                    </section>

                    <section className="space-y-4 rounded-[24px] border border-zinc-200 bg-white p-4">
                      <div>
                        <h4 className="text-sm font-semibold text-zinc-900">Context</h4>
                        <p className="mt-1 text-sm text-zinc-500">Optional. Add context only if it changes how the team should approach the work.</p>
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
                                hint={isRecommended ? "Common for this project shape" : undefined}
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
                      <FieldHint>Leaving context blank is okay. The route is driven mostly by shape, readiness, and capabilities.</FieldHint>
                    </section>
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

                    <section className="rounded-[24px] border border-zinc-200 bg-white p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h4 className="text-sm font-semibold text-zinc-900">{mode === "quick" ? "What are you thinking?" : "Optional notes"}</h4>
                          <p className="mt-1 text-sm text-zinc-500">
                            {mode === "quick"
                              ? "Describe the goal, problem, urgency, constraints, or desired outcome in plain language."
                              : "Goals, constraints, urgency, or anything the team should know on day one."}
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
                        showValidation && !goals.trim() ? <FieldHint tone="error">Add a short natural-language brief so the team has real context.</FieldHint> : <FieldHint>Two or three sentences is enough.</FieldHint>
                      ) : null}
                    </section>

                    {docsSection ? <section>{docsSection}</section> : null}

                    <section className="rounded-[24px] border border-zinc-200 bg-white p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h4 className="text-sm font-semibold text-zinc-900">Optional links</h4>
                          <p className="mt-1 text-sm text-zinc-500">Skip this during intake unless a link is critical for day-one context. The project page is the canonical place to add and manage links later.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowOptionalLinks((current) => !current)}
                          className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-400"
                        >
                          {showOptionalLinks ? "Hide link fields" : linkedSurfaces.length > 0 ? `Edit ${linkedSurfaces.length} added link${linkedSurfaces.length === 1 ? "" : "s"}` : "Add links now"}
                        </button>
                      </div>

                      {!showOptionalLinks ? (
                        <div className="mt-4 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
                          Better default: create the project first, then add the right links and artifacts from the project page once the work type is clearer.
                        </div>
                      ) : (
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          {PROJECT_LINK_FIELDS.map((key) => (
                            <label key={key} className="block">
                              <span className="mb-1 block text-sm font-medium text-zinc-700">{PROJECT_LINK_LABELS[key]} URL</span>
                              <input
                                type="url"
                                value={links[key] || ""}
                                onChange={(e) => handleLinkChange(key, e.target.value)}
                                className="w-full rounded-2xl border border-zinc-300 px-4 py-3 text-base focus:border-red-500 focus:outline-none"
                                placeholder={`https://${key === "github" ? "github.com/org/repo" : key === "preview" ? "preview.example.com" : key === "production" ? "app.example.com" : key === "docs" ? "docs.example.com" : key === "figma" ? "figma.com/file/..." : "admin.example.com"}`}
                              />
                            </label>
                          ))}
                        </div>
                      )}
                    </section>

                    {mode === "quick" ? (
                      <section className="rounded-[24px] border border-zinc-200 bg-zinc-50/80 p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h4 className="text-sm font-semibold text-zinc-900">Routing defaults</h4>
                            <p className="mt-1 text-sm text-zinc-500">We’ll safely route this as discovery-first unless you want to refine it.</p>
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
                          <span className="rounded-full bg-white px-3 py-1.5 text-zinc-700">Readiness: {readiness?.label}</span>
                        </div>

                        {showAdvancedQuickRouting ? (
                          <div className="mt-5 space-y-5">
                            <div className="grid gap-4 md:grid-cols-2">
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
                              <label className="block">
                                <span className="mb-1 block text-sm font-medium text-zinc-700">Readiness</span>
                                <select
                                  value={readiness?.value || "needs-shaping"}
                                  onChange={(e) => {
                                    const option = READINESS_OPTIONS.find((item) => item.value === e.target.value);
                                    if (!option) return;
                                    setStage(option.stage);
                                    setConfidence(option.confidence);
                                  }}
                                  className="w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-base focus:border-red-500 focus:outline-none"
                                >
                                  {READINESS_OPTIONS.map((option) => (
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
                    <section className="rounded-[28px] border border-red-100 bg-[linear-gradient(135deg,rgba(254,242,242,0.9),rgba(255,255,255,1),rgba(255,247,237,0.9))] p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-500">Routing preview</p>
                          <h4 className="mt-2 text-xl font-semibold tracking-tight text-zinc-950">{name.trim() || "Untitled project"}</h4>
                          <p className="mt-2 text-sm leading-6 text-zinc-600">{goals.trim() || intake.summary}</p>
                        </div>
                        <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm text-zinc-600 shadow-sm">
                          <div className="flex items-center justify-between gap-4">
                            <span>Legacy type</span>
                            <span className="font-medium text-zinc-900">{deriveLegacyProjectType(intake).replace(/_/g, " ")}</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm">Primary route: {routing.ownerTeam}</span>
                        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm">QC: {routing.qcTeam}</span>
                        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm">Readiness: {readiness?.label}</span>
                      </div>
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
                            <dt className="font-medium text-zinc-900">Readiness</dt>
                            <dd className="mt-2 flex flex-wrap gap-2">
                              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">{readiness?.label || "Pending"}</span>
                            </dd>
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
                        <p className="text-sm font-semibold text-zinc-900">Brief + links</p>
                        <div className="mt-4 space-y-4 text-sm text-zinc-600">
                          <div>
                            <p className="font-medium text-zinc-900">Notes</p>
                            <p className="mt-1 whitespace-pre-wrap leading-6 text-zinc-600">{goals.trim() || "No additional notes added."}</p>
                          </div>
                          <div>
                            <p className="font-medium text-zinc-900">Linked surfaces</p>
                            {linkedSurfaces.length > 0 ? (
                              <ul className="mt-2 space-y-2">
                                {linkedSurfaces.map((key) => (
                                  <li key={key} className="break-all rounded-2xl bg-zinc-50 px-3 py-2">
                                    <span className="font-medium text-zinc-900">{PROJECT_LINK_LABELS[key]}:</span> {links[key]}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="mt-1 text-zinc-500">No links added.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
                ) : null}
              </div>

              <div className="mt-8 flex flex-col gap-3 border-t border-zinc-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div className={cn("text-sm", showValidation && !currentStepValid ? "text-red-600" : "text-zinc-500")}>
                  {activeStep.id === "review"
                    ? "Final check. Creating the project keeps the same routing and submission behavior."
                    : activeStep.id === "brief"
                      ? mode === "quick"
                        ? "Tell us what you want, attach context if you have it, and we’ll handle the rest."
                        : "Add a working name and any supporting context, then review everything once at the end."
                      : activeStep.id === "signals"
                        ? "Use the recommended signals as a starting point, then keep moving."
                        : activeStep.id === "scope"
                          ? "Pick the closest readiness and continue."
                          : activeStep.id === "shape"
                            ? "Pick the closest shape and we’ll prefill the likely path."
                            : "Choose the intake path that feels easiest. You can switch anytime before submitting."}
                </div>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={currentStep === 0 ? onCancel : goBack}
                    className="rounded-2xl px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
                  >
                    {currentStep === 0 ? "Cancel" : "Back"}
                  </button>

                  {activeStep.id === "review" ? (
                    <button
                      type="submit"
                      disabled={isSubmitting || !name.trim() || (mode === "quick" && !goals.trim())}
                      className="rounded-2xl bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSubmitting ? "Creating..." : "Confirm and create project"}
                    </button>
                  ) : activeStep.id === "shape" ? (
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-500">
                      Choose the best-fit option below to continue
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

        <aside className="hidden space-y-4 xl:sticky xl:top-4 xl:block xl:self-start">
          <section className="rounded-[28px] border border-zinc-200 bg-zinc-950 p-5 text-white shadow-[0_20px_60px_rgba(24,24,27,0.18)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-300">
              {activeStep.id === "review" ? "Ready to submit" : "Current snapshot"}
            </p>
            <h4 className="mt-3 text-xl font-semibold tracking-tight">{name.trim() || "Untitled project"}</h4>
            <p className="mt-3 text-sm leading-6 text-zinc-300">
              {goals.trim() || (shape || stage || capabilities.length > 0 ? intake.summary : "Start with a quick brief or guided setup. The summary will build itself as you answer.")}
            </p>
            <div className="mt-5 space-y-3 text-sm text-zinc-300">
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-3 py-2">
                <span className="text-zinc-400">Owner</span>
                <span className="font-medium text-white">{routing.ownerTeam}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-3 py-2">
                <span className="text-zinc-400">QC</span>
                <span className="font-medium text-white">{routing.qcTeam}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-3 py-2">
                <span className="text-zinc-400">Readiness</span>
                <span className="font-medium text-white">{readiness?.label || "Pending"}</span>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-zinc-200 bg-white p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">Current path</p>
            <div className="mt-4 space-y-3">
              <TinyAnswer label="Mode" value={mode === "quick" ? "Quick brief" : "Guided setup"} />
              <TinyAnswer label="Shape" value={PROJECT_SHAPES.find((item) => item.value === shape)?.label} />
              <TinyAnswer label="Readiness" value={readiness?.label} />
              <TinyAnswer label="Capabilities" value={capabilities.length ? `${capabilities.length} selected` : undefined} />
              <TinyAnswer label="Brief" value={name.trim() ? (goals.trim() ? "Named and described" : "Named") : undefined} />
            </div>
          </section>
        </aside>
      </div>
    </form>
  );
}
