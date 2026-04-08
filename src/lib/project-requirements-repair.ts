import { deriveProjectRequirements, extractRequirementsFromUploadedFile, type ProjectRequirements } from "@/lib/project-requirements";

const STORAGE_BUCKET = "project_docs";

type DbClient = {
  from: (table: string) => any;
  storage: {
    from: (bucket: string) => {
      download: (path: string) => Promise<{ data: Blob | null; error: { message?: string } | null }>;
    };
  };
};

type ProjectIntakeLike = {
  summary?: string | null;
  goals?: string | null;
  requirements?: ProjectRequirements | null;
};

function hasAttachmentDerivedRequirements(requirements: ProjectRequirements | null | undefined) {
  return Boolean(requirements?.sources?.some((source) => source?.type !== "intake" && Array.isArray(source.evidence) && source.evidence.length > 0));
}

export async function repairMissingPdfAttachmentRequirements(
  db: DbClient,
  input: { projectId: string; intake?: ProjectIntakeLike | null }
) {
  const currentIntake = (input.intake || {}) as Record<string, unknown>;
  const existingRequirements = (currentIntake.requirements as ProjectRequirements | null | undefined) || null;

  if (hasAttachmentDerivedRequirements(existingRequirements)) {
    return { repaired: false, requirements: existingRequirements } as const;
  }

  const { data: pdfDocuments, error: documentsError } = await db
    .from("project_documents")
    .select("title, type, mime_type, storage_path, created_at")
    .eq("project_id", input.projectId)
    .eq("type", "prd_pdf")
    .order("created_at", { ascending: true });

  if (documentsError || !pdfDocuments?.length) {
    return { repaired: false, requirements: existingRequirements } as const;
  }

  const extractedDocuments: Array<{ title: string; type: string; text?: string | null }> = [];
  for (const document of pdfDocuments) {
    if (!document?.storage_path) continue;
    const { data: file, error: downloadError } = await db.storage.from(STORAGE_BUCKET).download(document.storage_path);
    if (downloadError || !file) continue;

    const buffer = Buffer.from(await file.arrayBuffer());
    extractedDocuments.push(
      await extractRequirementsFromUploadedFile({
        buffer,
        mimeType: document.mime_type || null,
        title: document.title || "Untitled upload",
        type: document.type || "prd_pdf",
      })
    );
  }

  if (extractedDocuments.length === 0) {
    return { repaired: false, requirements: existingRequirements } as const;
  }

  const nextRequirements = deriveProjectRequirements({
    intakeSummary: typeof currentIntake.summary === "string" ? currentIntake.summary : null,
    intakeGoals: typeof currentIntake.goals === "string" ? currentIntake.goals : null,
    existing: existingRequirements,
    documents: extractedDocuments,
  });

  if (!hasAttachmentDerivedRequirements(nextRequirements)) {
    return { repaired: false, requirements: existingRequirements } as const;
  }

  const nextIntake = {
    ...currentIntake,
    requirements: nextRequirements,
  };

  const { error: updateError } = await db
    .from("projects")
    .update({
      intake: nextIntake,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.projectId);

  if (updateError) {
    throw new Error(updateError.message || "Failed to repair missing PDF attachment requirements");
  }

  return { repaired: true, requirements: nextRequirements, intake: nextIntake } as const;
}
