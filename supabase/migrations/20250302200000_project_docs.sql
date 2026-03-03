-- Create Project + Upload Docs
-- Adds: storage bucket, prds versioning, artifacts/project_documents

BEGIN;

-- Storage bucket (enabled via SQL, but config is mostly dashboard/API)
-- Documented here for manual setup instructions
-- Dashboard: Storage → New bucket → "project_docs" → private

-- Prds table with versioning
CREATE TABLE IF NOT EXISTS public.prds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  version int NOT NULL DEFAULT 1,
  prev_version_id uuid REFERENCES public.prds(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'superseded')),
  content_md text,
  storage_path text, -- optional: if PDF uploaded to Storage
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_prds_select" ON public.prds FOR SELECT USING (true);
CREATE POLICY "auth_prds_insert" ON public.prds
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_prds_update" ON public.prds
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Artifacts / Project Documents
CREATE TABLE IF NOT EXISTS public.project_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('prd_pdf', 'image', 'link', 'other')),
  title text NOT NULL,
  url text, -- for external links (Figma, Docs)
  storage_path text, -- for uploaded files (Storage path)
  mime_type text,
  size_bytes int,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_documents_select" ON public.project_documents FOR SELECT USING (true);
CREATE POLICY "auth_documents_insert" ON public.project_documents
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_documents_delete" ON public.project_documents
  FOR DELETE USING (auth.role() = 'authenticated');

-- Trigger to auto-update prds.updated_at
DROP TRIGGER IF EXISTS prds_updated_at ON public.prds;
CREATE TRIGGER prds_updated_at BEFORE UPDATE ON public.prds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
