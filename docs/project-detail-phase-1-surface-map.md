# `/projects/[id]` Phase 1 surface map

**Status:** Slice 0 reference artifact  
**Scope:** Current `/projects/[id]` surface -> target Phase 1 IA  
**Source:** `src/app/projects/[id]/page.tsx`

This is the execution map for the Phase 1 cleanup pass. Each current surface is assigned a concrete Phase 1 destination so later slices can build on one stable reference.

## Target IA

1. Project summary
2. Project work
3. Approvals & review
4. Recent signals
5. Context
6. Project details

## Current-to-target mapping

| Current surface / content block | Current role | Decision | Target Phase 1 section | Notes for follow-up slices |
| --- | --- | --- | --- | --- |
| Project hero title, type badge, summary text | Top-page project orientation | Keep, simplify | Project summary | Keep as the lead orientation block. |
| Back link + project detail badge | Navigation chrome | Keep | Project summary | Leave in header chrome. |
| Delivery hold banner | Runtime / provisioning state in hero | Demote | Project details | Only surface prominently later when operator-actionable. |
| Repo provisioning pending banner | Runtime / provisioning state in hero | Demote | Project details | Move out of default hero narrative. |
| Attachment processing banner / progress | Upload processing state in hero | Demote | Project details | Keep accessible but secondary unless actively blocking. |
| Execution badge / header state | Mixed delivery/runtime rollup | Keep, simplify | Project summary | Treat as business-readable project state, not runtime dashboard copy. |
| Review signals / queued / running counters in hero | Runtime-heavy status counters | Demote | Project details | Slice 7 should decide final collapsed ops treatment. |
| Progress bar | Project progress framing | Keep | Project summary | Acceptable summary affordance for now. |
| Workspace overview card | Mixed actions + attention panel | Split | Project summary + Project details | Keep actions in summary; move runtime-heavy attention details down. |
| Project actions (pause/resume, add work, delete) | Primary page actions | Keep | Project summary | Preserve current behavior. |
| Exceptional queued hold reasons | Runtime/action blockers | Demote | Project details | Revisit as targeted blockers later if truly operator-actionable. |
| Project work section heading | Main work board | Keep | Project work | Already aligned to target naming. |
| Workflow guardrail banner | Runtime sequencing/guardrail state | Demote | Project details | Remove from default work narrative. |
| Phase sequencing banner | Runtime sequencing state | Demote | Project details | Remove from default work narrative. |
| Build blocked checkpoint alerts | Actionable work blockers | Move | Recent signals | Short-term signal until later slices refine work/review modeling. |
| Review signals milestone chip cluster | Mixed milestone review summary | Move | Recent signals | Later Slice 5 should curate and dedupe. |
| Task board lanes/cards | Canonical scoped work surface | Keep | Project work | Preserve current functionality; later Slice 3 makes task framing stronger. |
| Review & revision flow subsection in Project work | Milestone review / revision cards | Move | Approvals & review | Split from work board for Phase 1 IA. |
| Post-completion revisions | Review/revision follow-up state | Move | Approvals & review | Keep functional under review subsection for now. |
| Links & artifacts | Project references | Rename + move | Context | Becomes Context > Links. |
| Supporting docs & uploads | Files, uploads, extraction notes | Rename + move | Context | Becomes Context > Documents & uploads. |
| Teams | Ownership / staffing metadata | Rename + move | Project details | Secondary metadata surface. |
| Hidden operational truth / queued reasons / job counts | Runtime support model | Demote | Project details | Keep implementation for now; revisit collapsed ops panel in Slice 7. |
| Milestone-first copy in review cards | Legacy review framing | Keep temporarily, mark for rewrite | Approvals & review | Slice 4 + Slice 8 should finish task-first review language. |

## Slice 1 implementation intent

Slice 1 should only establish the shell and section order reset:

- keep **Project summary** as the top orientation layer
- keep **Project work** focused on the task board
- move review/revision cards into **Approvals & review**
- create a dedicated **Recent signals** section using existing signal-ish sources
- group links and uploads under **Context**
- move teams and operational/support state into **Project details**

## Explicitly deferred to later slices

- hero simplification / summary-copy cleanup beyond shell framing
- task-card copy normalization from milestone/checkpoint language to task-first language
- true approval-vs-review split inside the decision section
- signal curation / deduplication quality pass
- deeper context cleanup for upload-processing details
- collapsed secondary ops panel design and runtime-state demotion polish
- full canonical copy sweep
