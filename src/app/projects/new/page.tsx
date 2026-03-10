"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreateProjectModal } from "@/components/create-project-modal";

export default function NewProjectPage() {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    // Redirect back to projects after modal closes
    if (!open) {
      router.push("/projects");
    }
  }, [open, router]);

  return (
    <CreateProjectModal
      open={open}
      onOpenChange={setOpen}
    />
  );
}