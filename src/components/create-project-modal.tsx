"use client";

import { CreateProjectWorkspace } from "@/components/create-project-workspace";

export function CreateProjectModal({
  open,
  onOpenChange,
  prefillName,
  prefillType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefillName?: string;
  prefillType?: string;
}) {
  return (
    <CreateProjectWorkspace
      open={open}
      onOpenChange={onOpenChange}
      prefillName={prefillName}
      prefillType={prefillType}
    />
  );
}
