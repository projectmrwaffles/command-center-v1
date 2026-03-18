# Repo Work Execution Protocol

Purpose: keep Vertillo repo work moving in small, provable slices so nothing goes stale.

## 1) Role separation is mandatory

For every repo deliverable:
- Assign exactly **1 Owner** to do the work
- Assign exactly **1 QC Approver** to verify it
- **Owner and QC must be different agents**
- No self-approval

If no separate QC is assigned, the task is **not ready to close**.

## 2) Task in the smallest useful slice

Each sub-agent task should cover only one slice:
- repo audit
- one implementation change
- one verification pass
- one commit / PR packaging step

Avoid bundles like:
- "fix everything"
- "audit, implement, verify, and ship"
- mixed frontend + backend + infra unless the slice truly cannot be separated

If a task cannot be explained in 2-4 bullets, it is probably too large.

## 3) Required output contract

Every sub-agent handoff must include all of the following:
1. **Objective**
2. **Scope completed**
3. **Files changed**
4. **What changed**
5. **Verification run** (exact commands)
6. **Verification result**
7. **Status**: DONE, INCOMPLETE, or FAIL
8. **Risks / follow-ups**
9. **Commit hash** if changes were committed

QC output must also include:
- **QC verdict**: PASS or FAIL
- **What was independently checked**
- **Blockers or missing proof**

If the contract is missing key items, treat the handoff as **INCOMPLETE**.

## 4) Done criteria

A repo slice is only **DONE** when all are true:
- scoped objective was completed
- files changed are listed
- verification commands were run and reported
- results are attached plainly, not implied
- required follow-ups are called out
- QC has issued **PASS**

Without proof, it is not done.

## 5) Failure and incomplete states

Use these states consistently:

### DONE
Use only when the slice is finished, verified, and QC-approved.

### INCOMPLETE
Use when work moved forward but cannot be closed yet.
Examples:
- implementation done but verification missing
- verification partially run
- blocked by missing inputs, credentials, env vars, or design decisions
- result is vague or missing evidence

INCOMPLETE must always include:
- what is done
- what remains
- exact blocker or next step
- who owns the next step

### FAIL
Use when the slice did not achieve its objective or introduced a blocker.
Examples:
- tests fail after attempted fix
- change caused regression
- repo state is broken or unsafe to continue
- required constraint cannot be met within scope

FAIL must include:
- failure point
- evidence
- rollback or containment note if relevant
- recommended next owner action

## 6) When the main orchestrator must take over

The main orchestrator should take over immediately when:
- the owner returns status blurbs instead of deliverables
- the same task stalls across two handoffs
- scope keeps expanding mid-task
- owner and QC disagree on reality
- verification is missing but the repo appears changed
- the fix requires re-scoping across multiple slices or departments
- there is risk of shipping broken work due to ambiguity

Takeover action:
1. restate the exact slice
2. inspect repo state directly
3. assign the next smallest actionable slice
4. require fresh proof, not narrative

## 7) Command Center repo rule

For **Command Center** work, default to this sequence:
1. audit current behavior and conventions
2. implement one narrow change
3. run repo checks relevant to that slice (`lint`, `typecheck`, targeted tests, or build check as appropriate)
4. commit only after verification passes
5. send to QC for independent PASS / FAIL

If a Command Center task touches UI behavior, include the affected route/component and the expected user-visible outcome in the handoff.
