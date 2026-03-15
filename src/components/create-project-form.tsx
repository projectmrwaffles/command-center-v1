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

function ProgressPill({ active, complete, index, label }: { active: boolean; complete: boolean; index: number; label: string }) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-2xl border px-3 py-2 transition-all",
        active
          ? "border-red-200 bg-red-50 text-red-900"
          : complete
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
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
      eyebrow: "Position the work",
      title: "Start with the closest project shape",
      description: "This sets the default routing bias. If it spans multiple buckets, pick the closest fit and refine it in the next steps.",
    },
    {
      id: "context",
      eyebrow: "Operating context",
      title: "What context should the team optimize for?",
      description: "Choose the environments, constraints, or business context that matter. Multiple selections are fine.",
    },
    {
      id: "capabilities",
      eyebrow: "Delivery mix",
      title: "What kind of help should this project pull in?",
      description: "Select the specialties you expect. This influences who owns the work and who gets looped in.",
    },
    {
      id: "readiness",
      eyebrow: "Readiness",
      title: "How ready is this project, and how certain are you?",
      description: "This determines whether the flow should start with discovery, design, or execution.",
    },
    {
      id: "brief",
      eyebrow: "Closeout",
      title: "Add the final signal before launch",
      description: "Give the team a clean brief, link the project surfaces you already have, and preview the route before creating it.",
    },
  ];

  const completedSteps = [
    Boolean(shape),
    context.length > 0,
    capabilities.length > 0,
    Boolean(stage && confidence),
    Boolean(name.trim()),
  ];

  const progress = ((currentStep + 1) / steps.length) * 100;
  const canGoNext =
    currentStep === 0 ? Boolean(shape) :
    currentStep === 1 ? context.length > 0 :
    currentStep === 2 ? capabilities.length > 0 :
    currentStep === 3 ? Boolean(stage && confidence) :
    Boolean(name.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      name,
      type: deriveLegacyProjectType(intake),
      description: goals || intake.summary,
      intake,
      links,
    });
  };

  const nextStep = () => setCurrentStep((step) => Math.min(step + 1, steps.length - 1));
  const prevStep = () => setCurrentStep((step) => Math.max(step - 1, 0));

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
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-red-500">Guided intake</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 sm:text-[2rem]">
                Build the brief one decision at a time.
              </h3>
              <p className="mt-3 text-sm leading-6 text-zinc-600 sm:text-[15px]">
                Instead of a long survey, this flow walks you through the handful of signals we need to route the project well.
              </p>
            </div>

            <div className="rounded-3xl border border-white/80 bg-white/80 p-4 shadow-sm backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">Progress</p>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-3xl font-semibold tracking-tight text-zinc-950">{currentStep + 1}</span>
                <span className="pb-1 text-sm text-zinc-500">/ {steps.length}</span>
              </div>
              <div className="mt-3 h-2.5 w-48 max-w-full overflow-hidden rounded-full bg-zinc-200">
                <div className="h-full rounded-full bg-gradient-to-r from-red-500 via-red-500 to-amber-400 transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {steps.map((step, index) => (
              <button
                key={step.id}
                type="button"
                onClick={() => setCurrentStep(index)}
                className="text-left"
              >
                <ProgressPill active={currentStep === index} complete={completedSteps[index]} index={index} label={step.title} />
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
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
                  <label className="block text-sm font-medium text-zinc-700">
                    Project name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="mt-2 w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-base focus:border-red-500 focus:outline-none"
                    placeholder="e.g., Command Center V2"
                  />
                  <p className="mt-2 text-xs text-zinc-500">Give it a working name now. You can always rename it later.</p>
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
                      onClick={() => setShape(option.value)}
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
                      onClick={() => setContext(toggleValue(context, option.value))}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {currentStep === 2 ? (
              <div className="space-y-5">
                <div className="rounded-[28px] border border-zinc-200 bg-zinc-50/80 p-4 text-sm text-zinc-600">
                  Choose the mix of specialties you expect to need. If you only know the outcome, pick the obvious ones and move on.
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
                      onClick={() => setCapabilities(toggleValue(capabilities, option.value))}
                    />
                  ))}
                </div>
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
                        onClick={() => setStage(option.value)}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-zinc-900">Confidence</h4>
                  <p className="mt-1 text-sm text-zinc-500">If you’re uncertain, the routing will bias toward triage and recommendation first.</p>
                  <div className="mt-4 grid gap-3">
                    {CONFIDENCE_OPTIONS.map((option) => (
                      <SelectionCard
                        key={option.value}
                        selected={confidence === option.value}
                        label={option.label}
                        description={option.description}
                        examples={option.examples}
                        onClick={() => setConfidence(option.value)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {currentStep === 4 ? (
              <div className="space-y-6">
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

                <section className="rounded-[28px] border border-red-100 bg-[linear-gradient(135deg,rgba(254,242,242,0.9),rgba(255,255,255,1),rgba(255,247,237,0.9))] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-500">Routing preview</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm">Primary route: {routing.ownerTeam}</span>
                    <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm">QC: {routing.qcTeam}</span>
                    <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm">Legacy type: {deriveLegacyProjectType(intake).replace(/_/g, " ")}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-zinc-600">
                    Selections drive team assignment. If it’s hybrid or still fuzzy, Product will triage first and pull in the right specialists.
                  </p>
                </section>
              </div>
            ) : null}
          </div>

          <div className="mt-8 flex flex-col gap-3 border-t border-zinc-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-zinc-500">
              {currentStep < steps.length - 1
                ? canGoNext
                  ? "Looking good. Move when you’re ready."
                  : "Make at least one selection on this step before continuing."
                : "Final check: this preserves the same intake model, routing preview, and create-project submission behavior."}
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
                  disabled={!canGoNext}
                  className="rounded-2xl bg-zinc-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next step
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isSubmitting || !name.trim()}
                  className="rounded-2xl bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? "Creating..." : "Create project"}
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">What’s selected</p>
            <div className="mt-4 space-y-4 text-sm text-zinc-600">
              <div>
                <p className="font-medium text-zinc-900">Context</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {context.length > 0 ? context.map((value) => (
                    <span key={value} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">
                      {PROJECT_CONTEXTS.find((item) => item.value === value)?.label}
                    </span>
                  )) : <span className="text-zinc-400">None selected yet</span>}
                </div>
              </div>

              <div>
                <p className="font-medium text-zinc-900">Capabilities</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {capabilities.length > 0 ? capabilities.map((value) => (
                    <span key={value} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">
                      {PROJECT_CAPABILITIES.find((item) => item.value === value)?.label}
                    </span>
                  )) : <span className="text-zinc-400">None selected yet</span>}
                </div>
              </div>

              <div>
                <p className="font-medium text-zinc-900">Notes</p>
                <p className="mt-2 leading-6 text-zinc-500">{goals.trim() || "No notes added yet."}</p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </form>
  );
}
