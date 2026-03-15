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

function StepCard({
  selected,
  label,
  description,
  examples,
  onClick,
  hint,
}: {
  selected: boolean;
  label: string;
  description: string;
  examples: string[];
  onClick: () => void;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full rounded-2xl border p-4 text-left transition-all",
        selected
          ? "border-red-500 bg-red-50 shadow-[0_0_0_1px_rgba(220,38,38,0.15)]"
          : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-900">{label}</div>
          <p className="mt-1 text-sm text-zinc-600">{description}</p>
        </div>
        <div className={["mt-0.5 h-5 w-5 rounded-full border", selected ? "border-red-600 bg-red-600" : "border-zinc-300 bg-white"].join(" ")}>
          {selected ? <div className="m-1 h-3 w-3 rounded-full bg-white" /> : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {examples.map((example) => (
          <span key={example} className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] text-zinc-600">
            {example}
          </span>
        ))}
      </div>
      {hint ? <p className="mt-3 text-xs font-medium text-red-700">{hint}</p> : null}
    </button>
  );
}

function ChipToggle({
  selected,
  label,
  description,
  examples,
  onClick,
}: {
  selected: boolean;
  label: string;
  description: string;
  examples: string[];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-2xl border px-3 py-3 text-left transition-all",
        selected ? "border-red-500 bg-red-50" : "border-zinc-200 bg-white hover:border-zinc-300",
      ].join(" ")}
    >
      <div className="text-sm font-medium text-zinc-900">{label}</div>
      <p className="mt-1 text-xs text-zinc-600">{description}</p>
      <p className="mt-2 text-[11px] text-zinc-400">{examples.join(" • ")}</p>
    </button>
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="space-y-3 rounded-2xl border border-zinc-200 bg-gradient-to-br from-white to-zinc-50 p-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700">
            What should we call this project? <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="mt-1.5 w-full rounded-xl border border-zinc-300 px-4 py-3 text-base focus:border-red-500 focus:outline-none"
            placeholder="e.g., Command Center V2"
          />
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">Quick summary</p>
          <p className="mt-1 text-sm text-zinc-600">Pick the closest fit first. You can mix and match what the project actually needs.</p>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">1. What kind of work is this mostly?</h3>
          <p className="mt-1 text-sm text-zinc-500">Choose the closest starting point. It doesn’t have to be perfect.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {PROJECT_SHAPES.map((option) => (
            <StepCard
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
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">2. What context matters?</h3>
          <p className="mt-1 text-sm text-zinc-500">Pick all that apply.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {PROJECT_CONTEXTS.map((option) => (
            <ChipToggle
              key={option.value}
              selected={context.includes(option.value)}
              label={option.label}
              description={option.description}
              examples={option.examples}
              onClick={() => setContext(toggleValue(context, option.value))}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">3. What do you need help with?</h3>
          <p className="mt-1 text-sm text-zinc-500">Choose all the capabilities you want involved.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {PROJECT_CAPABILITIES.map((option) => (
            <ChipToggle
              key={option.value}
              selected={capabilities.includes(option.value)}
              label={option.label}
              description={option.description}
              examples={option.examples}
              onClick={() => setCapabilities(toggleValue(capabilities, option.value))}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">4. Where is this project right now?</h3>
          <p className="mt-1 text-sm text-zinc-500">This helps us route for discovery vs. execution.</p>
        </div>
        <div className="grid gap-3">
          {PROJECT_STAGES.map((option) => (
            <StepCard
              key={option.value}
              selected={stage === option.value}
              label={option.label}
              description={option.description}
              examples={option.examples}
              onClick={() => setStage(option.value)}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">5. How sure are you?</h3>
          <p className="mt-1 text-sm text-zinc-500">If you’re unsure, we’ll bias toward triage and recommendations first.</p>
        </div>
        <div className="grid gap-3">
          {CONFIDENCE_OPTIONS.map((option) => (
            <StepCard
              key={option.value}
              selected={confidence === option.value}
              label={option.label}
              description={option.description}
              examples={option.examples}
              onClick={() => setConfidence(option.value)}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Anything important we should know?</h3>
          <p className="mt-1 text-sm text-zinc-500">Optional. Use plain language — goals, constraints, urgency, links, whatever helps.</p>
        </div>
        <textarea
          value={goals}
          onChange={(e) => setGoals(e.target.value)}
          rows={4}
          className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-base focus:border-red-500 focus:outline-none"
          placeholder="Example: We need something we can show clients in 2 weeks. It should feel premium, work on mobile, and eventually connect to HubSpot."
        />
      </section>

      <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Project links</h3>
          <p className="mt-1 text-sm text-zinc-500">Manual links first. Add the deployment surfaces or references you already have.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {PROJECT_LINK_FIELDS.map((key) => (
            <label key={key} className="block">
              <span className="mb-1 block text-sm font-medium text-zinc-700">{PROJECT_LINK_LABELS[key]} URL</span>
              <input
                type="url"
                value={links[key] || ""}
                onChange={(e) => handleLinkChange(key, e.target.value)}
                className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-base focus:border-red-500 focus:outline-none"
                placeholder={`https://${key === "github" ? "github.com/org/repo" : key === "preview" ? "preview.example.com" : key === "production" ? "app.example.com" : key === "docs" ? "docs.example.com" : key === "figma" ? "figma.com/file/..." : "admin.example.com"}`}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-red-100 bg-gradient-to-br from-red-50 via-white to-amber-50 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 shadow-sm">Primary route: {routing.ownerTeam}</span>
          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 shadow-sm">QC: {routing.qcTeam}</span>
          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 shadow-sm">Summary: {intake.summary}</span>
        </div>
        <p className="text-sm text-zinc-600">Selections drive team assignment. If this is a hybrid or you’re unsure, Product will triage first and pull in the right specialists.</p>
      </section>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !name.trim()}
          className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {isSubmitting ? "Creating..." : "Create project"}
        </button>
      </div>
    </form>
  );
}
