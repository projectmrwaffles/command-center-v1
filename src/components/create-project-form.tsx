"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  CONFIDENCE_OPTIONS,
  PROJECT_CAPABILITIES,
  PROJECT_CONTEXTS,
  PROJECT_SHAPES,
  PROJECT_STAGES,
  ProjectIntake,
  deriveLegacyProjectType,
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
  reviewSupplement?: ReactNode;
}

type FlowStepId = "shape" | "context" | "capabilities" | "stage" | "confidence" | "brief" | "review";

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
}: {
  selected: boolean;
  label: string;
  description: string;
  examples: string[];
  onClick: () => void;
  hint?: string;
  multi?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative w-full overflow-hidden rounded-[24px] border p-4 text-left transition-all duration-200",
        "focus:outline-none focus:ring-2 focus:ring-red-300",
        selected
          ? "border-red-500 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(254,242,242,1),rgba(255,247,237,0.95))] shadow-[0_14px_40px_rgba(239,68,68,0.16)]"
          : "border-zinc-200 bg-white hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_12px_30px_rgba(24,24,27,0.08)]"
      )}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-70" />
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
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

function buildFlow(shape: string): FlowStep[] {
  const root: FlowStep = {
    id: "shape",
    eyebrow: "Start here",
    title: "What kind of project is this?",
    description: "Pick the closest shape. We’ll only ask what matters next.",
    helper: "One choice is enough to get started.",
  };

  const brief: FlowStep = {
    id: "brief",
    eyebrow: "A few details",
    title: "Give it a name and anything useful",
    description: "Keep it light. A working name is enough, then add notes or links only if they help.",
    helper: "The long review happens at the end, not here.",
  };

  const review: FlowStep = {
    id: "review",
    eyebrow: "Final review",
    title: "Quick check before we create it",
    description: "This is the only review step. Routing and submission stay exactly the same.",
    helper: "Go back if anything feels off.",
  };

  const context: FlowStep = {
    id: "context",
    eyebrow: "Context",
    title: "Where does this live?",
    description: "Choose the contexts that materially change how this should be planned or built.",
    helper: "Pick all that matter. Skip nothing important.",
  };

  const capabilities: FlowStep = {
    id: "capabilities",
    eyebrow: "Help needed",
    title: "What kind of help should this pull in?",
    description: "Choose the specialties you expect to need. Don’t overthink it.",
    helper: "Pick the obvious ones and keep moving.",
  };

  const stage: FlowStep = {
    id: "stage",
    eyebrow: "Readiness",
    title: "How far along is it?",
    description: "This tells us whether the intake should lean toward discovery, design, or execution.",
    helper: "Choose the closest current state.",
  };

  const confidence: FlowStep = {
    id: "confidence",
    eyebrow: "Certainty",
    title: "How sure are you about the path?",
    description: "This helps us know whether to move fast on execution or start with guidance.",
    helper: "Be honest. Unclear is a valid answer.",
  };

  if (shape === "research-strategy" || shape === "hybrid-not-sure") {
    return [root, confidence, stage, context, capabilities, brief, review];
  }

  if (shape === "launch-campaign") {
    return [root, capabilities, context, stage, confidence, brief, review];
  }

  if (shape === "ops-system") {
    return [root, context, capabilities, stage, confidence, brief, review];
  }

  if (shape === "new-product" || shape === "improve-existing") {
    return [root, stage, capabilities, context, confidence, brief, review];
  }

  return [root, context, capabilities, stage, confidence, brief, review];
}

function getStepValidity(stepId: FlowStepId, state: {
  name: string;
  shape: string;
  context: string[];
  capabilities: string[];
  stage: string;
  confidence: string;
}) {
  switch (stepId) {
    case "shape":
      return Boolean(state.shape);
    case "context":
      return state.context.length > 0;
    case "capabilities":
      return state.capabilities.length > 0;
    case "stage":
      return Boolean(state.stage);
    case "confidence":
      return Boolean(state.confidence);
    case "brief":
    case "review":
      return Boolean(state.name.trim());
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
  reviewSupplement,
}: CreateProjectFormProps) {
  const [name, setName] = useState(prefillName || "");
  const [shape, setShape] = useState("");
  const [context, setContext] = useState<string[]>([]);
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [stage, setStage] = useState("");
  const [confidence, setConfidence] = useState("");
  const [goals, setGoals] = useState("");
  const [links, setLinks] = useState<ProjectLinks>({});
  const [currentStep, setCurrentStep] = useState(0);
  const [showValidation, setShowValidation] = useState(false);

  useEffect(() => {
    if (prefillName) setName(prefillName);
  }, [prefillName]);

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
  const flow = useMemo(() => buildFlow(shape), [shape]);
  const activeStep = flow[currentStep];
  const linkedSurfaces = PROJECT_LINK_FIELDS.filter((key) => Boolean(links[key]));

  const stateForValidity = { name, shape, context, capabilities, stage, confidence };
  const currentStepValid = getStepValidity(activeStep.id, stateForValidity);
  const completedCount = flow.filter((step) => getStepValidity(step.id, stateForValidity)).length;
  const progress = Math.max(8, Math.round((completedCount / flow.length) * 100));
  const unlockedStepIds = new Set(flow.slice(0, currentStep + 1).map((step) => step.id));

  useEffect(() => {
    if (currentStep > flow.length - 1) {
      setCurrentStep(flow.length - 1);
    }
  }, [currentStep, flow.length]);

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

  const handleSingleChoice = (stepId: FlowStepId, value: string) => {
    if (stepId === "shape") setShape(value);
    if (stepId === "stage") setStage(value);
    if (stepId === "confidence") setConfidence(value);
    setShowValidation(false);
    window.setTimeout(() => {
      setCurrentStep((step) => Math.min(step + 1, buildFlow(stepId === "shape" ? value : shape).length - 1));
    }, 120);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const requiredSteps: FlowStepId[] = ["shape", "context", "capabilities", "stage", "confidence", "brief"];
    const firstInvalidIndex = flow.findIndex((step) => requiredSteps.includes(step.id) && !getStepValidity(step.id, stateForValidity));

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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-[30px] border border-zinc-200 bg-[radial-gradient(circle_at_top_left,rgba(254,242,242,0.95),rgba(255,255,255,1)_42%,rgba(250,250,250,1)_100%)] p-4 shadow-[0_16px_48px_rgba(24,24,27,0.06)] sm:p-6">
          <div className="border-b border-zinc-100 pb-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-2xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-red-500">Guided intake</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
                  One clear question at a time.
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600">
                  The flow adapts as you answer, keeps the form light, and saves the full review for the end.
                </p>
              </div>

              <div className="rounded-3xl border border-white/80 bg-white/85 p-4 shadow-sm backdrop-blur">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">Progress</p>
                <div className="mt-2 flex items-end gap-2">
                  <span className="text-3xl font-semibold tracking-tight text-zinc-950">{stepCounter}</span>
                </div>
                <div className="mt-3 h-2.5 w-56 max-w-full overflow-hidden rounded-full bg-zinc-200">
                  <div className="h-full rounded-full bg-gradient-to-r from-red-500 via-red-500 to-amber-400 transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {flow.map((step, index) => {
                const isActive = index === currentStep;
                const isCompleted = index < currentStep && getStepValidity(step.id, stateForValidity);
                const isUnlocked = index <= currentStep;

                return (
                  <div
                    key={step.id}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                      isActive
                        ? "border-red-200 bg-red-50 text-red-700"
                        : isCompleted
                          ? "border-zinc-200 bg-white text-zinc-700"
                          : isUnlocked
                            ? "border-zinc-200 bg-zinc-50 text-zinc-500"
                            : "border-dashed border-zinc-200 bg-transparent text-zinc-300"
                    )}
                  >
                    {isUnlocked ? `${index + 1}. ${step.title}` : `${index + 1}. Locked`}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 min-h-[480px]">
            <div className="mb-6 flex flex-wrap gap-2">
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

            <div className="max-w-4xl rounded-[28px] border border-white/80 bg-white/85 p-5 shadow-sm backdrop-blur sm:p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-400">{activeStep.eyebrow}</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">{activeStep.title}</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">{activeStep.description}</p>
              <div className="mt-3 inline-flex rounded-full border border-dashed border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-500">
                {activeStep.helper}
              </div>

              <div className="mt-6">
                {activeStep.id === "shape" ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {PROJECT_SHAPES.map((option) => (
                        <SelectionCard
                          key={option.value}
                          selected={shape === option.value}
                          label={option.label}
                          description={option.description}
                          examples={option.examples}
                          hint={option.hint}
                          onClick={() => handleSingleChoice("shape", option.value)}
                        />
                      ))}
                    </div>
                    {showValidation && !shape ? <FieldHint tone="error">Pick the closest project shape to continue.</FieldHint> : null}
                  </div>
                ) : null}

                {activeStep.id === "context" ? (
                  <div className="space-y-4">
                    <div className="rounded-[24px] border border-zinc-200 bg-zinc-50/80 p-4 text-sm text-zinc-600">
                      Choose every context that changes the work. This can be more than one.
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {PROJECT_CONTEXTS.map((option) => (
                        <SelectionCard
                          key={option.value}
                          selected={context.includes(option.value)}
                          label={option.label}
                          description={option.description}
                          examples={option.examples}
                          multi
                          onClick={() => {
                            setContext(toggleValue(context, option.value));
                            setShowValidation(false);
                          }}
                        />
                      ))}
                    </div>
                    {showValidation && context.length === 0 ? <FieldHint tone="error">Choose at least one context.</FieldHint> : null}
                  </div>
                ) : null}

                {activeStep.id === "capabilities" ? (
                  <div className="space-y-4">
                    <div className="rounded-[24px] border border-zinc-200 bg-zinc-50/80 p-4 text-sm text-zinc-600">
                      Pick the help you expect to need. If you only know the outcome, choose the obvious ones.
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {PROJECT_CAPABILITIES.map((option) => (
                        <SelectionCard
                          key={option.value}
                          selected={capabilities.includes(option.value)}
                          label={option.label}
                          description={option.description}
                          examples={option.examples}
                          multi
                          onClick={() => {
                            setCapabilities(toggleValue(capabilities, option.value));
                            setShowValidation(false);
                          }}
                        />
                      ))}
                    </div>
                    {showValidation && capabilities.length === 0 ? <FieldHint tone="error">Choose at least one capability.</FieldHint> : null}
                  </div>
                ) : null}

                {activeStep.id === "stage" ? (
                  <div className="space-y-4">
                    <div className="grid gap-3">
                      {PROJECT_STAGES.map((option) => (
                        <SelectionCard
                          key={option.value}
                          selected={stage === option.value}
                          label={option.label}
                          description={option.description}
                          examples={option.examples}
                          onClick={() => handleSingleChoice("stage", option.value)}
                        />
                      ))}
                    </div>
                    {showValidation && !stage ? <FieldHint tone="error">Choose the current stage.</FieldHint> : null}
                  </div>
                ) : null}

                {activeStep.id === "confidence" ? (
                  <div className="space-y-4">
                    <div className="grid gap-3">
                      {CONFIDENCE_OPTIONS.map((option) => (
                        <SelectionCard
                          key={option.value}
                          selected={confidence === option.value}
                          label={option.label}
                          description={option.description}
                          examples={option.examples}
                          onClick={() => handleSingleChoice("confidence", option.value)}
                        />
                      ))}
                    </div>
                    {showValidation && !confidence ? <FieldHint tone="error">Choose how certain the path feels right now.</FieldHint> : null}
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

                    {name.trim() ? (
                      <>
                        <section className="rounded-[24px] border border-zinc-200 bg-zinc-50/80 p-4">
                          <div>
                            <h4 className="text-sm font-semibold text-zinc-900">Optional notes</h4>
                            <p className="mt-1 text-sm text-zinc-500">Goals, constraints, urgency, or anything the team should know on day one.</p>
                          </div>
                          <textarea
                            value={goals}
                            onChange={(e) => setGoals(e.target.value)}
                            rows={5}
                            className="mt-4 w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-base focus:border-red-500 focus:outline-none"
                            placeholder="Example: We need something client-ready in 2 weeks. It should feel premium, work beautifully on mobile, and eventually connect to HubSpot."
                          />
                        </section>

                        <section className="rounded-[24px] border border-zinc-200 bg-white p-4">
                          <div>
                            <h4 className="text-sm font-semibold text-zinc-900">Optional links</h4>
                            <p className="mt-1 text-sm text-zinc-500">Add anything that gives the receiving team fast context.</p>
                          </div>
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
                        </section>
                      </>
                    ) : null}
                  </div>
                ) : null}

                {activeStep.id === "review" ? (
                  <div className="space-y-6">
                    <section className="rounded-[28px] border border-red-100 bg-[linear-gradient(135deg,rgba(254,242,242,0.9),rgba(255,255,255,1),rgba(255,247,237,0.9))] p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-500">Routing preview</p>
                          <h4 className="mt-2 text-xl font-semibold tracking-tight text-zinc-950">{name.trim()}</h4>
                          <p className="mt-2 text-sm leading-6 text-zinc-600">{intake.summary}</p>
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
                        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm">Stage: {PROJECT_STAGES.find((item) => item.value === stage)?.label}</span>
                        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm">Confidence: {CONFIDENCE_OPTIONS.find((item) => item.value === confidence)?.label}</span>
                      </div>
                    </section>

                    <section className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-[28px] border border-zinc-200 bg-white p-4">
                        <p className="text-sm font-semibold text-zinc-900">Selections</p>
                        <dl className="mt-4 space-y-4 text-sm text-zinc-600">
                          <div>
                            <dt className="font-medium text-zinc-900">Project shape</dt>
                            <dd className="mt-1">{PROJECT_SHAPES.find((item) => item.value === shape)?.label}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-zinc-900">Context</dt>
                            <dd className="mt-2 flex flex-wrap gap-2">
                              {context.map((value) => (
                                <span key={value} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">
                                  {PROJECT_CONTEXTS.find((item) => item.value === value)?.label}
                                </span>
                              ))}
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

                    {reviewSupplement ? <section>{reviewSupplement}</section> : null}
                  </div>
                ) : null}
              </div>

              <div className="mt-8 flex flex-col gap-3 border-t border-zinc-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div className={cn("text-sm", showValidation && !currentStepValid ? "text-red-600" : "text-zinc-500")}>
                  {activeStep.id === "review"
                    ? "Final check. Creating the project keeps the same routing and submission behavior."
                    : activeStep.id === "brief"
                      ? "Add a working name, then review everything at the end."
                      : "Answer this step and the next one will open."}
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
                      disabled={isSubmitting || !name.trim()}
                      className="rounded-2xl bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSubmitting ? "Creating..." : "Confirm and create project"}
                    </button>
                  ) : activeStep.id === "shape" || activeStep.id === "stage" || activeStep.id === "confidence" ? (
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-500">
                      Tap a choice to continue
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={requireAndAdvance}
                      className="rounded-2xl bg-zinc-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
                    >
                      {activeStep.id === "brief" ? "Review project" : "Continue"}
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
              {shape || stage || capabilities.length > 0
                ? intake.summary
                : "Choose the project shape first. The summary will build itself as you answer."}
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
              {unlockedStepIds.has("stage") ? (
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-3 py-2">
                  <span className="text-zinc-400">Stage</span>
                  <span className="font-medium text-white">{PROJECT_STAGES.find((item) => item.value === stage)?.label || "Pending"}</span>
                </div>
              ) : null}
              {unlockedStepIds.has("confidence") ? (
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-3 py-2">
                  <span className="text-zinc-400">Confidence</span>
                  <span className="font-medium text-white">{CONFIDENCE_OPTIONS.find((item) => item.value === confidence)?.label || "Pending"}</span>
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-[28px] border border-zinc-200 bg-white p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">Unlocked so far</p>
            <div className="mt-4 space-y-3">
              {unlockedStepIds.has("shape") ? <TinyAnswer label="Shape" value={PROJECT_SHAPES.find((item) => item.value === shape)?.label} /> : null}
              {unlockedStepIds.has("context") ? <TinyAnswer label="Context" value={context.length ? `${context.length} selected` : undefined} /> : null}
              {unlockedStepIds.has("capabilities") ? <TinyAnswer label="Capabilities" value={capabilities.length ? `${capabilities.length} selected` : undefined} /> : null}
              {unlockedStepIds.has("stage") ? <TinyAnswer label="Stage" value={PROJECT_STAGES.find((item) => item.value === stage)?.label} /> : null}
              {unlockedStepIds.has("confidence") ? <TinyAnswer label="Confidence" value={CONFIDENCE_OPTIONS.find((item) => item.value === confidence)?.label} /> : null}
              {unlockedStepIds.has("brief") ? <TinyAnswer label="Brief" value={name.trim() ? "Named and ready" : undefined} /> : null}
            </div>
          </section>
        </aside>
      </div>
    </form>
  );
}
