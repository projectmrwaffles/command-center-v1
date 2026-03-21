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
    context
  ) VALUES (
    v_job.id,
    p_owner_agent_id,
    p_project_id,
    p_sprint_id,
    'pending',
    p_approval_summary,
    'Command Center',
    'medium',
    p_context
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
    p_context
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
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Review request already pending for this milestone' USING ERRCODE = '23505';
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_project_review_request(uuid, uuid, uuid, text, text, text, jsonb, jsonb) TO service_role;
