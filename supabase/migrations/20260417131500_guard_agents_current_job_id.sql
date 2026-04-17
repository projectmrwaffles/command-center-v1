begin;

update public.agents as a
set current_job_id = null,
    updated_at = now()
where current_job_id is not null
  and not exists (
    select 1
    from public.jobs j
    where j.id = a.current_job_id
  );

alter table public.agents
  drop constraint if exists agents_current_job_id_fkey;

alter table public.agents
  add constraint agents_current_job_id_fkey
  foreign key (current_job_id)
  references public.jobs(id)
  on delete set null;

create index if not exists agents_current_job_id_idx
  on public.agents(current_job_id)
  where current_job_id is not null;

commit;
