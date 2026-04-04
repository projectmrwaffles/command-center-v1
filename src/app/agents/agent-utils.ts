export function getAgentDisplayName(name: string) {
  if (name === "main") return "Mr. Waffles";
  return name;
}

const AGENT_EMOJIS: Record<string, string> = {
  "tech-lead-architect": "🔮",
  "frontend-engineer": "🎨",
  "backend-engineer": "⚡",
  "mobile-engineer": "📱",
  "qa-auditor": "🛡️",
  "seo-web-developer": "🔍",
  "head-of-design": "✨",
  "product-designer-app": "📐",
  "web-designer-marketing": "💡",
  "product-lead": "🧭",
  "growth-lead": "🚀",
  "marketing-producer": "📣",
  "marketing-ops-analytics": "📊",
};

export function getAgentEmoji(name: string): string {
  return AGENT_EMOJIS[name] || "🤖";
}

export function formatAgentType(type: string) {
  return type.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatLastSeen(lastSeen: string | null) {
  return lastSeen ? new Date(lastSeen).toLocaleString() : "Never";
}

export function getAgentPresenceStatus(status?: string | null) {
  if (status === "active") return "active";
  if (status === "idle") return "idle";
  return "offline";
}

export function getAgentStatusLabel(status?: string | null) {
  return getAgentPresenceStatus(status);
}

export function statusClasses(status?: string | null) {
  const presence = getAgentPresenceStatus(status);
  if (presence === "active") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (presence === "idle") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-zinc-200 bg-zinc-100 text-zinc-700";
}

export function formatEventType(eventType: string) {
  return eventType.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
