-- Separate content/message review from launch approval semantics.
-- Owner: Compass

UPDATE public.sprints
SET checkpoint_type = 'content_review'
WHERE phase_key = 'message'
  AND checkpoint_type = 'launch_approval';

UPDATE public.sprints
SET checkpoint_evidence_requirements = jsonb_build_object(
  'screenshotRequired', false,
  'minScreenshotCount', 0,
  'captureMode', null,
  'requiredEvidenceKinds', jsonb_build_array('doc', 'artifact', 'screenshot', 'staging_url', 'loom'),
  'requiredEvidenceKindsMode', 'any',
  'captureHint', 'Attach the actual messaging artifact to review, such as a draft doc, screenshot, preview URL, exported asset, or Loom walkthrough.'
)
WHERE phase_key = 'message'
  AND checkpoint_type = 'content_review';

ALTER TABLE public.sprints
  DROP CONSTRAINT IF EXISTS sprints_checkpoint_type_check;

ALTER TABLE public.sprints
  ADD CONSTRAINT sprints_checkpoint_type_check CHECK (
    checkpoint_type IN (
      'scope_approval',
      'design_review',
      'delivery_review',
      'acceptance_review',
      'content_review',
      'launch_approval',
      'prebuild_checkpoint'
    )
  );

UPDATE public.approvals a
SET approval_type = 'content_review'
FROM public.sprints s
WHERE a.sprint_id = s.id
  AND s.phase_key = 'message'
  AND COALESCE(a.approval_type, '') = 'launch_approval';

ALTER TABLE public.approvals
  DROP CONSTRAINT IF EXISTS approvals_approval_type_check;

ALTER TABLE public.approvals
  ADD CONSTRAINT approvals_approval_type_check CHECK (
    approval_type IN (
      'scope_approval',
      'design_review',
      'delivery_review',
      'acceptance_review',
      'content_review',
      'launch_approval',
      'prebuild_checkpoint'
    )
  );

UPDATE public.milestone_submissions ms
SET checkpoint_type = 'content_review',
    evidence_requirements = COALESCE(
      NULLIF(s.checkpoint_evidence_requirements, '{}'::jsonb),
      jsonb_build_object(
        'screenshotRequired', false,
        'minScreenshotCount', 0,
        'captureMode', null,
        'requiredEvidenceKinds', jsonb_build_array('doc', 'artifact', 'screenshot', 'staging_url', 'loom'),
        'requiredEvidenceKindsMode', 'any',
        'captureHint', 'Attach the actual messaging artifact to review, such as a draft doc, screenshot, preview URL, exported asset, or Loom walkthrough.'
      )
    )
FROM public.sprints s
WHERE ms.sprint_id = s.id
  AND s.phase_key = 'message'
  AND ms.checkpoint_type = 'launch_approval';

ALTER TABLE public.milestone_submissions
  DROP CONSTRAINT IF EXISTS milestone_submissions_checkpoint_type_check;

ALTER TABLE public.milestone_submissions
  ADD CONSTRAINT milestone_submissions_checkpoint_type_check CHECK (
    checkpoint_type IN (
      'scope_approval',
      'design_review',
      'delivery_review',
      'acceptance_review',
      'content_review',
      'launch_approval',
      'prebuild_checkpoint'
    )
  );

CREATE OR REPLACE FUNCTION public.create_project_review_request(
  p_project_id uuid,
  p_sprint_id uuid,
  p_owner_agent_id uuid,
  p_title text,
  p_job_summary text,
  p_approval_summary text,
  p_links jsonb,
  p_context jsonb
)
RETURNS TABLE (
  approval_id uuid,
  approval_status text,
  approval_summary text,
  approval_sprint_id uuid,
  approval_context jsonb,
  job_id uuid,
  job_title text,
  job_status text,
  links jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sprint public.sprints%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_task_total integer := 0;
  v_active_task_count integer := 0;
  v_done_like_count integer := 0;
  v_build_task_count integer := 0;
  v_project_links jsonb := COALESCE(p_links, '{}'::jsonb);
  v_github_link text := NULLIF(trim(COALESCE(p_links->>'github', v_project.links->>'github', '')), '');
  v_has_github_binding boolean := false;
  v_requires_repo boolean := false;
  v_job public.jobs%ROWTYPE;
  v_approval public.approvals%ROWTYPE;
  v_approval_type text := 'delivery_review';
  v_context jsonb := COALESCE(p_context, '{}'::jsonb);
BEGIN
  SELECT *
  INTO v_project
  FROM public.projects
  WHERE id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found' USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_sprint
  FROM public.sprints
  WHERE id = p_sprint_id
    AND project_id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Milestone not found' USING ERRCODE = 'P0001';
  END IF;

  IF COALESCE(v_sprint.approval_gate_required, false) = false THEN
    RAISE EXCEPTION 'Milestone is not review-gated' USING ERRCODE = 'P0001';
  END IF;

  IF v_sprint.approval_gate_status = 'pending' THEN
    RAISE EXCEPTION 'Review request already pending for this milestone' USING ERRCODE = '23505';
  END IF;

  IF v_sprint.approval_gate_status = 'approved' THEN
    RAISE EXCEPTION 'Milestone has already been approved' USING ERRCODE = 'P0001';
  END IF;

  SELECT
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE status IN ('todo', 'in_progress', 'blocked'))::integer,
    COUNT(*) FILTER (WHERE status IN ('done', 'cancelled'))::integer,
    COUNT(*) FILTER (WHERE task_type = 'build_implementation')::integer
  INTO v_task_total, v_active_task_count, v_done_like_count, v_build_task_count
  FROM public.sprint_items
  WHERE project_id = p_project_id
    AND sprint_id = p_sprint_id;

  IF v_task_total = 0 THEN
    RAISE EXCEPTION 'Milestone needs at least one task before requesting review' USING ERRCODE = 'P0001';
  END IF;

  IF v_active_task_count > 0 OR v_done_like_count <> v_task_total THEN
    RAISE EXCEPTION 'Finish milestone tasks before requesting review' USING ERRCODE = 'P0001';
  END IF;

  v_has_github_binding := (
    COALESCE(v_project.github_repo_binding->>'url', '') ~* '^https?://(www\.)?github\.com/[^/\s]+/[^/\s?#]+/?$'
    OR COALESCE(v_github_link, '') ~* '^https?://(www\.)?github\.com/[^/\s]+/[^/\s?#]+/?$'
  );

  v_requires_repo := (
    COALESCE(v_project.type, '') IN ('product_build', 'ops_enablement', 'saas', 'web_app', 'native_app')
    OR COALESCE(v_project.intake->>'shape', '') IN ('saas-product', 'web-app', 'native-app', 'ops-system')
    OR COALESCE(v_project.intake->'capabilities', '[]'::jsonb) ?| ARRAY['frontend', 'backend-data']
    OR v_build_task_count > 0
  );

  IF v_requires_repo AND NOT v_has_github_binding THEN
    RAISE EXCEPTION 'Code-heavy delivery cannot advance to review or completion without a real GitHub repo linked to the project.' USING ERRCODE = 'P0001';
  END IF;

  v_approval_type := CASE COALESCE(v_sprint.checkpoint_type, 'delivery_review')
    WHEN 'scope_approval' THEN 'scope_approval'
    WHEN 'design_review' THEN 'design_review'
    WHEN 'acceptance_review' THEN 'acceptance_review'
    WHEN 'content_review' THEN 'content_review'
    WHEN 'launch_approval' THEN 'launch_approval'
    WHEN 'prebuild_checkpoint' THEN 'prebuild_checkpoint'
    ELSE 'delivery_review'
  END;

  v_context := jsonb_strip_nulls(v_context || jsonb_build_object(
    'checkpointType', COALESCE(v_sprint.checkpoint_type, 'delivery_review'),
    'approvalType', v_approval_type,
    'evidenceRequirements', COALESCE(v_sprint.checkpoint_evidence_requirements, '{}'::jsonb)
  ));

  INSERT INTO public.jobs (
    project_id,
    title,
    status,
    owner_agent_id,
    summary
  ) VALUES (
    p_project_id,
    p_title,
    'waiting_approval',
    p_owner_agent_id,
    p_job_summary
  )
  RETURNING * INTO v_job;

  INSERT INTO public.approvals (
    job_id,
    agent_id,
    project_id,
    sprint_id,
    status,
    summary,
    requester_name,
    severity,
    context,
    approval_type
  ) VALUES (
    v_job.id,
    p_owner_agent_id,
    p_project_id,
    p_sprint_id,
    'pending',
    p_approval_summary,
    'Command Center',
    'medium',
    v_context,
    v_approval_type
  )
  RETURNING * INTO v_approval;

  UPDATE public.projects
  SET links = p_links,
      updated_at = now()
  WHERE id = p_project_id;

  UPDATE public.sprints
  SET approval_gate_status = 'pending',
      updated_at = now()
  WHERE id = p_sprint_id;

  INSERT INTO public.agent_events (
    agent_id,
    project_id,
    job_id,
    event_type,
    payload
  ) VALUES (
    p_owner_agent_id,
    p_project_id,
    v_job.id,
    'project_review_requested',
    v_context
  );

  RETURN QUERY
  SELECT
    v_approval.id,
    v_approval.status,
    v_approval.summary,
    v_approval.sprint_id,
    v_approval.context,
    v_job.id,
    v_job.title,
    v_job.status,
    p_links;
END;
$$;
