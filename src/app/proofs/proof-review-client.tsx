"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, FileStack, Search, ShieldAlert, ShieldCheck, ShieldQuestion, UserRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrandedEmptyState } from "@/components/ui/branded-empty-state";
import { PageHero, PageHeroStat } from "@/components/ui/page-hero";
import type { ProofKind, ProofRecord, ProofStatus } from "@/lib/proof-review";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function statusTone(status: ProofStatus) {
  switch (status) {
    case "approved":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "rejected":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-amber-50 text-amber-700 border-amber-200";
  }
}

function kindTone(kind: ProofKind) {
  switch (kind) {
    case "artifact":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "handoff":
      return "bg-violet-50 text-violet-700 border-violet-200";
    default:
      return "bg-zinc-100 text-zinc-700 border-zinc-200";
  }
}

export function ProofReviewClient({ initialProofs }: { initialProofs: ProofRecord[] }) {
  const [proofs, setProofs] = useState(initialProofs);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ProofStatus | "all">("all");
  const [kind, setKind] = useState<ProofKind | "all">("all");
  const [selectedId, setSelectedId] = useState(initialProofs[0]?.id ?? null);

  const filteredProofs = useMemo(() => {
    return proofs.filter((proof) => {
      const matchesSearch = `${proof.title} ${proof.owner}`.toLowerCase().includes(search.trim().toLowerCase());
      const matchesStatus = status === "all" || proof.status === status;
      const matchesKind = kind === "all" || proof.kind === kind;
      return matchesSearch && matchesStatus && matchesKind;
    });
  }, [kind, proofs, search, status]);

  const selectedProof = filteredProofs.find((proof) => proof.id === selectedId) ?? filteredProofs[0] ?? null;

  const pendingCount = proofs.filter((proof) => proof.status === "pending").length;
  const approvedCount = proofs.filter((proof) => proof.status === "approved").length;
  const rejectedCount = proofs.filter((proof) => proof.status === "rejected").length;

  const updateStatus = (id: string, nextStatus: ProofStatus) => {
    setProofs((current) =>
      current.map((proof) =>
        proof.id === id
          ? {
              ...proof,
              status: nextStatus,
              updatedAt: new Date().toISOString(),
            }
          : proof,
      ),
    );
    setSelectedId(id);
  };

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHero>
        <div className="flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between lg:p-8">
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-red-700">
              <ShieldCheck className="h-3.5 w-3.5 text-red-500" />
              Proof review queue
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">GitHub-only final proof</h1>
              <p className="max-w-2xl text-sm leading-6 text-zinc-600 sm:text-base">
                Review owner serialization proofs, artifact confirmations, and handoff evidence from one focused operator surface.
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500 lg:max-w-sm">
            Use filters to narrow the queue, inspect the selected record on the right, and simulate approval or rejection before backend wiring lands.
          </div>
        </div>
      </PageHero>

      <div className="grid gap-4 md:grid-cols-3">
        <PageHeroStat className="border-amber-100">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-amber-700"><ShieldQuestion className="h-4 w-4" />Pending</div>
          <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{pendingCount}</div>
        </PageHeroStat>
        <PageHeroStat className="border-emerald-100">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-emerald-700"><CheckCircle2 className="h-4 w-4" />Approved</div>
          <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{approvedCount}</div>
        </PageHeroStat>
        <PageHeroStat className="border-red-100">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-red-700"><ShieldAlert className="h-4 w-4" />Rejected</div>
          <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{rejectedCount}</div>
        </PageHeroStat>
      </div>

      <Card variant="soft" className="rounded-[24px] border-zinc-200 bg-white">
        <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(0,2fr)_180px_180px] md:p-5">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              aria-label="Search proofs"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by proof title or owner"
              className="h-11 w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-3 text-sm text-zinc-900 outline-none ring-0 transition focus:border-red-200"
            />
          </label>
          <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value as ProofStatus | "all")} className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-red-200">
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <select aria-label="Filter by kind" value={kind} onChange={(event) => setKind(event.target.value as ProofKind | "all")} className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-red-200">
            <option value="all">All proof kinds</option>
            <option value="owner">Owner</option>
            <option value="artifact">Artifact</option>
            <option value="handoff">Handoff</option>
          </select>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_360px]">
        <section className="space-y-3">
          {filteredProofs.length === 0 ? (
            <BrandedEmptyState
              className="rounded-[24px] border border-zinc-200 bg-white px-6 py-10 text-left"
              icon={<FileStack className="h-7 w-7 text-red-600" />}
              title="No proof records match these filters"
              description="Clear the current search or widen the selected status and kind filters to inspect more proof records."
            />
          ) : (
            <div className="space-y-3">
              {filteredProofs.map((proof) => {
                const isSelected = proof.id === selectedProof?.id;
                return (
                  <Card key={proof.id} variant="featured" className={cn("rounded-[24px] border-zinc-200", isSelected && "border-red-200 ring-1 ring-red-100")}>
                    <CardContent className="space-y-4 p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <button className="min-w-0 text-left" onClick={() => setSelectedId(proof.id)}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", kindTone(proof.kind))}>{proof.kind}</span>
                            <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", statusTone(proof.status))}>{proof.status}</span>
                          </div>
                          <h2 className="mt-3 text-base font-semibold tracking-tight text-zinc-950">{proof.title}</h2>
                          <p className="mt-1 text-sm leading-6 text-zinc-500">{proof.summary}</p>
                        </button>
                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          <Button variant="outline" size="sm" onClick={() => updateStatus(proof.id, "approved")}>Approve</Button>
                          <Button variant="destructive" size="sm" onClick={() => updateStatus(proof.id, "rejected")}>Reject</Button>
                        </div>
                      </div>
                      <div className="grid gap-3 text-sm text-zinc-500 md:grid-cols-3">
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3">
                          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400"><UserRound className="h-3.5 w-3.5" />Owner</div>
                          <p className="mt-2 font-medium text-zinc-900">{proof.owner}</p>
                        </div>
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Repository</div>
                          <p className="mt-2 font-medium text-zinc-900">{proof.repository}</p>
                        </div>
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Updated</div>
                          <p className="mt-2 font-medium text-zinc-900">{new Date(proof.updatedAt).toLocaleString()}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <aside>
          <Card variant="soft" className="sticky top-8 rounded-[24px] border-zinc-200 bg-white">
            <CardContent className="space-y-4 p-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-red-700">Selected proof</p>
                <h2 className="mt-2 text-lg font-semibold tracking-tight text-zinc-950">{selectedProof?.title ?? "No proof selected"}</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-500">{selectedProof?.detail ?? "Select a proof record to inspect owner serialization details, repository context, and the current review state."}</p>
              </div>
              <div className="space-y-3 rounded-[20px] border border-zinc-200 bg-zinc-50 p-4 text-sm">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Status</div>
                  <div className="mt-1 font-medium text-zinc-900">{selectedProof?.status ?? "—"}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Kind</div>
                  <div className="mt-1 font-medium text-zinc-900">{selectedProof?.kind ?? "—"}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Owner</div>
                  <div className="mt-1 font-medium text-zinc-900">{selectedProof?.owner ?? "—"}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Repository</div>
                  <div className="mt-1 break-all font-medium text-zinc-900">{selectedProof?.repository ?? "—"}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
