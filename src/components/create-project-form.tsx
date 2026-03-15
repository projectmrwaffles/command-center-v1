"use client";

import { useEffect, useMemo, useState } from "react";
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
}

type WizardStep = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  cta: string;
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
        "group relative w-full overflow-hidden rounded-[28px] border p-4 text-left transition-all duration-200",
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

function ProgressPill({
  active,
  complete,
  index,
  label,
  locked,
}: {
  active: boolean;
  complete: boolean;
  index: number;
  label: string;
  locked?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-2xl border px-3 py-2 transition-all",
        active
          ? "border-red-200 bg-red-50 text-red-900"
          : complete
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : locked
              ? "border-zinc-100 bg-zinc-50 text-zinc-400"
              : "border-zinc-200 bg-white text-zinc-500"
      )}
    >
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          active ? "bg-red-600 text-white" : complete ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-500"
        )}
      >
        {complete ? "✓" : index + 1}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[11px] uppercase tracking-[0.18em] opacity-70">Step {index + 1}</p>
        <p className="truncate text-sm font-medium">{label}</p>
      </div>
    </div>
  );
}

function FieldHint({ children, tone = "muted" }: { children: string; tone?: "muted" | "error" }) {
  return (
    <p className={cn("mt-2 text-xs", tone === "error" ? "text-red-600" : "text-zinc-500")}>{children}</p>
  );
}

export function CreateProjectForm({
  onSubmit,
  onCancel,
  isSubmitting,
  error,
  prefillName,
}: CreateProjectFormProps) {
  const [name, setName] = useState(prefillName || "");
  const [shape, setShape] = useState("new-product");
  const [context, setContext] = useState<string[]>([]);
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [stage, setStage] = useState("planning");
  const [confidence, setConfidence] = useState("somewhat-clear");
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

  const steps: WizardStep[] = [
    {
      id: "shape",
      eyebrow: "Step 1 · Position the work",
      title: "What are we creating?",
      description: "Start with the closest project shape. This sets the routing bias before we refine the details.",
      cta: "Choose a project shape to continue.",
    },
    {
      id: "context",
      eyebrow: "Step 2 · Operating context",
      title: "What context should shape the work?",
      description: "Choose the environments, constraints, or business conditions that matter here.",
      cta: "Pick at least one context.",
    },
    {
      id: "capabilities",
      eyebrow: "Step 3 · Delivery mix",
      title: "Which specialties should this project pull in?",
      description: "Select the help you expect to need. This drives ownership and cross-functional involvement.",
      cta: "Pick at least one capability.",
    },
    {
      id: "readiness",
      eyebrow: "Step 4 · Readiness",
      title: "How ready is this project right now?",
      description: "Set the stage and confidence level so the intake can bias toward triage or execution appropriately.",
      cta: "Confirm the stage and confidence to keep going.",
    },
    {
      id: "brief",
      eyebrow: "Step 5 · Brief",
      title: "Add the useful details",
      description: "Give the receiving team a sharper starting point with a working name, notes, and any relevant links.",
      cta: "Add a project name before review.",
    },
    {
      id: "review",
      eyebrow: "Step 6 · Review",
      title: "Review the routing before you create the project",
      description: "One last confirmation. You can still go back and adjust anything without changing submission behavior.",
      cta: "Everything looks ready.",
    },
  ];

  const stepValidity = [
    Boolean(shape),
    context.length > 0,
    capabilities.length > 0,
    Boolean(stage && confidence),
    Boolean(name.trim()),
    Boolean(name.trim()),
  ];

  const progress = ((currentStep + 1) / steps.length) * 100;
  const canGoNext = stepValidity[currentStep];
  const furthestAvailableStep = Math.min(stepValidity.findIndex((valid) => !valid) + 1 || steps.length - 1, steps.length - 1);
  const linkedSurfaces = PROJECT_LINK_FIELDS.filter((key) => Boolean(links[key]));

  const goToStep = (index: number) => {
    if (index <= furthestAvailableStep) {
      setCurrentStep(index);
      setShowValidation(false);
    }
  };

  const nextStep = () => {
    if (!canGoNext) {
      setShowValidation(true);
      return;
    }

    setShowValidation(false);
    setCurrentStep((step) => Math.min(step + 1, steps.length - 1));
  };

  const prevStep = () => {
    setShowValidation(false);
    setCurrentStep((step) => Math.max(step - 1, 0));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stepValidity.slice(0, 5).every(Boolean)) {
      const firstInvalid = stepValidity.slice(0, 5).findIndex((valid) => !valid);
      setCurrentStep(firstInvalid === -1 ? 0 : firstInvalid);
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

  const stepMessage = (() => {
    if (currentStep === steps.length - 1) return "Final confirmation. Creating the project uses the same intake payload, routing logic, and submission flow.";
    if (canGoNext) return steps[currentStep].cta.replace("Choose", "Chosen").replace("Pick", "Picked").replace("Confirm", "Confirmed").replace("Add", "Added");
    return steps[currentStep].cta;
  })();

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-[32px] border border-zinc-200 bg-[radial-gradient(circle_at_top_left,rgba(254,242,242,0.95),rgba(255,255,255,1)_38%,rgba(250,250,250,1)_100%)] p-5 shadow-[0_24px_80px_rgba(24,24,27,0.08)] sm:p-6">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-red-500">Guided intake wizard</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 sm:text-[2rem]">
                Build the brief one decision at a time.
              </h3>
              <p className="mt-3 text-sm leading-6 text-zinc-600 sm:text-[15px]">
                One section at a time, clear progress, no endless stacked form. Finish with a proper review before the project is created.
              </p>
            </div>

            <div className="rounded-3xl border border-white/80 bg-white/80 p-4 shadow-sm backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">Progress</p>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-3xl font-semibold tracking-tight text-zinc-950">{currentStep + 1}</span>
                <span className="pb-1 text-sm text-zinc-500">/ {steps.length}</span>
              </div>
              <div className="mt-3 h-2.5 w-56 max-w-full overflow-hidden rounded-full bg-zinc-200">
                <div className="h-full rounded-full bg-gradient-to-r from-red-500 via-red-500 to-amber-400 transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {steps.map((step, index) => {
              const locked = index > furthestAvailableStep;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => goToStep(index)}
                  disabled={locked}
                  className={cn("text-left", locked && "cursor-not-allowed opacity-75")}
                  aria-current={currentStep === index ? "step" : undefined}
                >
                  <ProgressPill active={currentStep === index} complete={stepValidity[index]} index={index} label={step.title} locked={locked} />
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-[32px] border border-zinc-200 bg-white p-5 shadow-[0_20px_60px_rgba(24,24,27,0.06)] sm:p-6">
          <div className="mb-6 border-b border-zinc-100 pb-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-400">{steps[currentStep].eyebrow}</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">{steps[currentStep].title}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">{steps[currentStep].description}</p>
          </div>

          <div className="min-h-[420px]">
            {currentStep === 0 ? (
              <div className="space-y-5">
                <div className="rounded-[28px] border border-zinc-200 bg-zinc-50/80 p-4">
                  <p className="text-sm font-medium text-zinc-700">Project shape</p>
                  <FieldHint>Select the nearest fit. If it spans multiple buckets, pick the closest and refine it in the next steps.</FieldHint>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {PROJECT_SHAPES.map((option) => (
                    <SelectionCard
                      key={option.value}
                      selected={shape === option.value}
                      label={option.label}
                      description={option.description}
                      examples={option.examples}
                      hint={option.hint}
                      onClick={() => {
                        setShape(option.value);
                        setShowValidation(false);
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {currentStep === 1 ? (
              <div className="space-y-5">
                <div className="rounded-[28px] border border-zinc-200 bg-zinc-50/80 p-4 text-sm text-zinc-600">
                  Pick every context that materially changes how this should be designed, built, or prioritized.
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
                {showValidation && context.length === 0 ? <FieldHint tone="error">Choose at least one context before moving on.</FieldHint> : null}
              </div>
            ) : null}

            {currentStep === 2 ? (
              <div className="space-y-5">
                <div className="rounded-[28px] border border-zinc-200 bg-zinc-50/80 p-4 text-sm text-zinc-600">
                  Choose the mix of specialties you expect to need. If you only know the outcome, pick the obvious ones and keep moving.
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
                {showValidation && capabilities.length === 0 ? <FieldHint tone="error">Choose at least one capability before continuing.</FieldHint> : null}
              </div>
            ) : null}

            {currentStep === 3 ? (
              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-semibold text-zinc-900">Project stage</h4>
                  <p className="mt-1 text-sm text-zinc-500">This separates work that needs discovery from work that is ready to move.</p>
                  <div className="mt-4 grid gap-3">
                    {PROJECT_STAGES.map((option) => (
                      <SelectionCard
                        key={option.value}
                        selected={stage === option.value}
                        label={option.label}
                        description={option.description}
                        examples={option.examples}
                        onClick={() => {
                          setStage(option.value);
                          setShowValidation(false);
                        }}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-zinc-900">Confidence</h4>
                  <p className="mt-1 text-sm text-zinc-500">If you’re uncertain, routing will bias toward triage and recommendation first.</p>
                  <div className="mt-4 grid gap-3">
                    {CONFIDENCE_OPTIONS.map((option) => (
                      <SelectionCard
                        key={option.value}
                        selected={confidence === option.value}
                        label={option.label}
                        description={option.description}
                        examples={option.examples}
                        onClick={() => {
                          setConfidence(option.value);
                          setShowValidation(false);
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {currentStep === 4 ? (
              <div className="space-y-6">
                <section className="rounded-[28px] border border-zinc-200 bg-zinc-50/80 p-4">
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
                    <FieldHint tone="error">Add a project name before continuing to review.</FieldHint>
                  ) : (
                    <FieldHint>Give it a working name now. You can always rename it later.</FieldHint>
                  )}
                </section>

                <section className="rounded-[28px] border border-zinc-200 bg-zinc-50/80 p-4">
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-900">Final brief</h4>
                    <p className="mt-1 text-sm text-zinc-500">Optional, but helpful. Add goals, constraints, urgency, or anything the team should know on day one.</p>
                  </div>
                  <textarea
                    value={goals}
                    onChange={(e) => setGoals(e.target.value)}
                    rows={5}
                    className="mt-4 w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-base focus:border-red-500 focus:outline-none"
                    placeholder="Example: We need something client-ready in 2 weeks. It should feel premium, work beautifully on mobile, and eventually connect to HubSpot."
                  />
                </section>

                <section className="rounded-[28px] border border-zinc-200 bg-white p-4">
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-900">Project links</h4>
                    <p className="mt-1 text-sm text-zinc-500">Add the surfaces that already exist so the receiving team has immediate context.</p>
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
              </div>
            ) : null}

            {currentStep === 5 ? (
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
              </div>
            ) : null}
          </div>

          <div className="mt-8 flex flex-col gap-3 border-t border-zinc-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className={cn("text-sm", showValidation && !canGoNext ? "text-red-600" : "text-zinc-500")}>
              {stepMessage}
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={currentStep === 0 ? onCancel : prevStep}
                className="rounded-2xl px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
              >
                {currentStep === 0 ? "Cancel" : "Back"}
              </button>

              {currentStep < steps.length - 1 ? (
                <button
                  type="button"
                  onClick={nextStep}
                  className="rounded-2xl bg-zinc-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
                >
                  {currentStep === steps.length - 2 ? "Review project" : "Next step"}
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isSubmitting || !name.trim()}
                  className="rounded-2xl bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? "Creating..." : "Confirm and create project"}
                </button>
              )}
            </div>
          </div>
        </section>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <section className="rounded-[28px] border border-zinc-200 bg-zinc-950 p-5 text-white shadow-[0_20px_60px_rgba(24,24,27,0.18)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-300">Live summary</p>
            <h4 className="mt-3 text-xl font-semibold tracking-tight">{name.trim() || "Untitled project"}</h4>
            <p className="mt-3 text-sm leading-6 text-zinc-300">{intake.summary || "Your selections will compose a routing summary here."}</p>
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
                <span className="text-zinc-400">Stage</span>
                <span className="font-medium text-white">{PROJECT_STAGES.find((item) => item.value === stage)?.label}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-3 py-2">
                <span className="text-zinc-400">Confidence</span>
                <span className="font-medium text-white">{CONFIDENCE_OPTIONS.find((item) => item.value === confidence)?.label}</span>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-zinc-200 bg-white p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">Checklist</p>
            <div className="mt-4 space-y-3 text-sm text-zinc-600">
              {steps.slice(0, 5).map((step, index) => (
                <div key={step.id} className="flex items-center justify-between gap-3 rounded-2xl bg-zinc-50 px-3 py-2">
                  <span className="text-zinc-700">{step.title}</span>
                  <span className={cn("text-xs font-semibold uppercase tracking-[0.18em]", stepValidity[index] ? "text-emerald-600" : "text-zinc-400")}>
                    {stepValidity[index] ? "Ready" : "Pending"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </form>
  );
}
