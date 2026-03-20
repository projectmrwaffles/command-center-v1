ALTER TABLE public.sprints
  ADD COLUMN IF NOT EXISTS phase_key text,
  ADD COLUMN IF NOT EXISTS phase_order int,
  ADD COLUMN IF NOT EXISTS auto_generated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approval_gate_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approval_gate_status text NOT NULL DEFAULT 'not_requested';

ALTER TABLE public.sprints
  DROP CONSTRAINT IF EXISTS sprints_approval_gate_status_check;

ALTER TABLE public.sprints
  ADD CONSTRAINT sprints_approval_gate_status_check CHECK (
    approval_gate_status IN ('not_requested', 'pending', 'approved', 'rejected')
  );

CREATE INDEX IF NOT EXISTS sprints_project_phase_order_idx ON public.sprints (project_id, phase_order);
CREATE INDEX IF NOT EXISTS sprints_phase_key_idx ON public.sprints (phase_key);
CREATE INDEX IF NOT EXISTS sprints_approval_gate_status_idx ON public.sprints (approval_gate_status);
