import { getProjectLinkEntries, PROJECT_LINK_FIELDS, type ProjectLinks } from "@/lib/project-links";

export const CONTEXT_LINK_GROUPS: Array<{
  id: string;
  title: string;
  description: string;
  keys: Array<(typeof PROJECT_LINK_FIELDS)[number]>;
}> = [
  {
    id: "working",
    title: "Working links",
    description: "Repo, preview, production, and admin surfaces used during delivery.",
    keys: ["github", "preview", "production", "admin"],
  },
  {
    id: "reference",
    title: "Reference links",
    description: "Docs, designs, and planning materials that explain the work.",
    keys: ["docs", "figma"],
  },
];

export function getGroupedProjectLinks(links?: ProjectLinks | null) {
  const entries = getProjectLinkEntries(links);
  const entryMap = new Map(entries.map((entry) => [entry.key, entry]));

  return CONTEXT_LINK_GROUPS.map((group) => ({
    ...group,
    entries: group.keys.flatMap((key) => {
      const entry = entryMap.get(key);
      return entry ? [entry] : [];
    }),
  }));
}

export function getWorkingProjectLinkCount(links?: ProjectLinks | null) {
  return getGroupedProjectLinks(links).find((group) => group.id === "working")?.entries.length ?? 0;
}
