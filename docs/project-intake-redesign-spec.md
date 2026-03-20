# Command Center V1 — Project Intake Redesign Spec

## Goal
Replace the current type-dropdown intake with a selection-first flow that is easier for non-technical users, supports hybrid work, and routes cleanly to Vertillo teams.

## 1) Exact option copy

### Step 1 — Project shape (single select cards)

1. **New product or MVP**  
   You’re creating something new from scratch or close to it.  
   Examples: `Launch a new SaaS idea` · `Build an internal tool MVP` · `Create a first mobile app version`

2. **Improve something existing**  
   You already have a site, app, funnel, or workflow and want to make it better.  
   Examples: `Redesign key screens` · `Add onboarding` · `Speed up an existing site`

3. **Launch a campaign or growth push**  
   You need messaging, assets, experiments, or launch coordination.  
   Examples: `Product launch campaign` · `New landing page + ads` · `Email and social rollout`

4. **Set up a system or workflow**  
   You need an operating system behind the scenes, not just a public-facing product.  
   Examples: `CRM or lead pipeline` · `Client portal workflow` · `Team dashboard or automation`

5. **Figure out what to build**  
   You need clarity before execution: direction, structure, positioning, or requirements.  
   Examples: `Scope a roadmap` · `Define the product plan` · `Audit what’s broken and recommend next steps`

6. **Not sure / hybrid**  
   It spans a few things, or you’re not sure what bucket it belongs in yet.  
   Examples: `Part redesign, part growth` · `Need strategy first, then execution` · `I know the problem, not the solution`

### Step 2 — Context (multi-select chips)

- **Customer-facing** — Used by prospects, customers, or the public.  
  Examples: `Marketing site` · `Client portal` · `Consumer app`
- **Internal team use** — Built mainly for your team or operations.  
  Examples: `Ops dashboard` · `Sales workflow` · `Internal knowledge tool`
- **Brand-new initiative** — This is a new idea or business line, not a tune-up.  
  Examples: `New venture` · `Fresh offer` · `First version of a concept`
- **Existing site/app/process** — There’s already something in place and this work builds on it.  
  Examples: `Existing website` · `Current app` · `Established workflow`
- **AI is part of it** — AI is a meaningful part of the experience, workflow, or automation.  
  Examples: `AI assistant` · `Prompt workflow` · `Auto-generated content or analysis`

### Step 3 — Capabilities needed (multi-select chips)

- **Strategy and scoping** — Clarify direction, requirements, priorities, or what to do first.  
  Examples: `Roadmap` · `PRD` · `Offer positioning`
- **UX/UI design** — Shape flows, screens, interactions, and visuals.  
  Examples: `Wireframes` · `Design system` · `Responsive UI`
- **Website or app build** — Build the visible product, interface, or experience.  
  Examples: `Landing page` · `Web app` · `Dashboard`
- **Backend, data, or integrations** — APIs, database work, automations, and systems behind the scenes.  
  Examples: `Supabase setup` · `CRM sync` · `Internal automation`
- **Messaging, copy, or content** — Words and content that explain, sell, or guide.  
  Examples: `Website copy` · `Launch messaging` · `Email sequence`
- **Growth and acquisition** — Traffic, experiments, campaigns, and conversion work.  
  Examples: `Paid campaigns` · `SEO improvements` · `Conversion testing`
- **QA, polish, or optimization** — Test, refine, improve performance, and reduce risk.  
  Examples: `Bug bash` · `Responsive cleanup` · `Performance pass`

### Step 4 — Stage (single select)

- **Just an idea** — You need help turning a rough idea into a plan.  
  Examples: `Still framing the problem` · `Need options` · `No spec yet`
- **Needs a clear plan** — The direction is known, but scope and decisions need to be shaped.  
  Examples: `Need a brief` · `Need architecture` · `Need priorities`
- **Ready for design** — The concept is clear enough to move into flows, wireframes, or UI.  
  Examples: `Requirements exist` · `Need screens` · `Need visual direction`
- **Ready to build** — Enough is defined to start implementation now.  
  Examples: `Spec exists` · `Design exists` · `Just need execution`
- **Already live, needs improvement** — Something exists today and needs fixes, improvements, or growth.  
  Examples: `Improve conversion` · `Add features` · `Clean up UX or performance`

### Step 5 — Confidence / certainty (single select)

- **I know what I need** — You want the team to move fast on a clear direction.  
  Examples: `I have a spec` · `I know the deliverable` · `I just need execution`
- **I know the outcome, not the exact path** — You know the goal, but want help shaping the best approach.  
  Examples: `Need recommendations` · `Open to a few options` · `Want the right mix of teams`
- **I’m not sure yet** — You want a safe intake path that starts with discovery and recommendation.  
  Examples: `Not sure if this is product or marketing` · `Need help naming the work` · `Want someone to triage it`

## 2) Recommended form structure

1. **Project name** — quick text field at top.
2. **Project shape** — big cards first; this is the anchor decision.
3. **Context** — supporting chips.
4. **Capabilities needed** — composable team signal.
5. **Stage** — tells us discovery vs execution.
6. **How sure are you?** — safe path for unfamiliar users.
7. **Optional details** — free text only after selections.
8. **Optional existing project links** — GitHub/repo, live site, preview, docs, Figma, or admin links when something already exists.
9. **Optional docs upload** — PRDs, screenshots, PDFs.
10. **Live routing preview** — show likely owner + QC team and a short summary before submit.

## 3) Data model fields

Recommended canonical fields:

- `projects.type` — keep for backward compatibility; store a broad derived bucket:
  - `product_build`
  - `marketing_growth`
  - `ops_enablement`
  - `strategy_research`
  - `hybrid`
- `projects.intake jsonb`
  - `shape: string`
  - `context: string[]`
  - `capabilities: string[]`
  - `stage: string`
  - `confidence: string`
  - `projectName?: string`
  - `summary?: string`
  - `goals?: string`
  - `links?: { github?: string; preview?: string; production?: string; docs?: string; figma?: string; admin?: string }
- `projects.intake_summary text` — compact readable summary for cards/lists
- `projects.description text` — optional long-form human notes

### Existing-project link guidance
When a project builds on something that already exists, intake should frame links as reference points for the team, not as a promise that work starts directly inside that linked repo.

User-facing guidance:
- a GitHub/repo link gives the team the current source of truth
- preview/production/admin/docs/Figma links help the team understand the current state faster
- during execution, the team can create the working branch or copy they need from that source
- avoid wording like “the team will branch from this repo” in intake copy because it assumes an execution choice too early

## 4) Routing implications for Vertillo team assignment

### Default owner logic
- **Product** owns first when:
  - `confidence = not-sure`
  - `stage in [idea, planning]`
  - `shape in [research-strategy, hybrid-not-sure]`
- **Engineering** owns first when:
  - build-heavy capabilities are selected (`frontend`, `backend-data`)
  - `shape = new-product`
- **Marketing** owns first when:
  - `shape = launch-campaign`
  - growth/copy capabilities dominate
- **Design** can own first when:
  - UX/UI is the main selected need and the project is already scoped enough

### Team pull-in logic
- `strategy` → Product
- `ux-ui` → Design
- `frontend` / `backend-data` → Engineering
- `content-copy` / `growth-marketing` → Marketing
- `qa-optimization` / late-stage delivery / live optimization → QA

### QC approver rule
- Engineering owner → QA approver
- Design owner → Product approver
- Marketing owner → Product approver
- Product owner → QA approver

That keeps owner and approver separate, matches the orchestrator rules, and gives hybrid projects a sane triage path.

## 5) Implementation notes completed

Implemented in current repo:

- Replaced dropdown intake with a selection-first guided form.
- Added centralized intake copy + routing helpers in `src/lib/project-intake.ts`.
- Added structured payload support in project creation flow.
- Added DB migration for `projects.intake` and `projects.intake_summary`.
- Updated project list/detail surfaces to show friendlier type labels and intake summary.
- Widened modal for desktop so the card-based layout breathes.

## Verification

- `npm run lint` → passes with existing repo warnings only, no new errors
- `npx tsc --noEmit` → passes
