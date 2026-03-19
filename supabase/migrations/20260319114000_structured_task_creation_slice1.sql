ALTER TABLE public.sprint_items
  ADD COLUMN IF NOT EXISTS task_type text,
  ADD COLUMN IF NOT EXISTS task_goal text,
  ADD COLUMN IF NOT EXISTS owner_team_id uuid REFERENCES public.teams(id),
  ADD COLUMN IF NOT EXISTS review_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS task_template_key text,
  ADD COLUMN IF NOT EXISTS task_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'not_requested';

ALTER TABLE public.sprint_items
  DROP CONSTRAINT IF EXISTS sprint_items_task_type_check,
  DROP CONSTRAINT IF EXISTS sprint_items_review_status_check;

ALTER TABLE public.sprint_items
  ADD CONSTRAINT sprint_items_task_type_check CHECK (
    task_type IS NULL OR task_type IN (
      'discovery_plan',
      'design',
      'build_implementation',
      'content_messaging',
      'qa_validation',
      'internal_admin'
    )
  ),
  ADD CONSTRAINT sprint_items_review_status_check CHECK (
    review_status IN (
      'not_requested',
      'awaiting_review',
      'revision_requested',
      'in_revision',
      'ready_for_rereview',
      'approved'
    )
  );

CREATE INDEX IF NOT EXISTS sprint_items_task_type_idx ON public.sprint_items (task_type);
CREATE INDEX IF NOT EXISTS sprint_items_review_status_idx ON public.sprint_items (review_status);
CREATE INDEX IF NOT EXISTS sprint_items_owner_team_idx ON public.sprint_items (owner_team_id);
