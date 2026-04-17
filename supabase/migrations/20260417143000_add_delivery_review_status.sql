ALTER TABLE public.sprints
  ADD COLUMN IF NOT EXISTS delivery_review_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_review_status text;

UPDATE public.sprints
SET delivery_review_required = true,
    delivery_review_status = COALESCE(delivery_review_status, 'not_requested')
WHERE phase_key = 'build';

ALTER TABLE public.sprints
  ALTER COLUMN delivery_review_status SET DEFAULT 'not_requested';

ALTER TABLE public.sprints
  DROP CONSTRAINT IF EXISTS sprints_delivery_review_status_check;

ALTER TABLE public.sprints
  ADD CONSTRAINT sprints_delivery_review_status_check CHECK (
    delivery_review_status IN ('not_requested', 'pending', 'approved', 'rejected')
  );
