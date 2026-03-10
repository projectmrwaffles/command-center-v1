"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

function cn(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(" ");
}

// Icon components (inline for self-contained shell)
function OverviewIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function ProjectsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2z" />
      <path d="M3 7l9 5 9-5" />
    </svg>
  );
}

function AgentsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  );
}

function UsageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  );
}

function TeamsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="8" r="3" />
      <path d="M18 20a6 6 0 00-12 0" />
      <circle cx="20" cy="10" r="2" />
      <circle cx="4" cy="10" r="2" />
    </svg>
  );
}

function CampaignIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

// Full navigation (used on mobile + desktop sidebar)
const NAV = [
  { href: "/dashboard", label: "Overview", icon: OverviewIcon },
  { href: "/projects", label: "Projects", icon: ProjectsIcon },
  { href: "/campaigns", label: "Campaigns", icon: CampaignIcon },
  { href: "/agents", label: "Agents", icon: AgentsIcon },
  { href: "/usage", label: "Usage", icon: UsageIcon },
  { href: "/teams", label: "Teams", icon: TeamsIcon },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <div className="bg-zinc-50 text-zinc-950">
      <div className="flex w-full">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex md:w-64 md:flex-col md:border-r md:border-zinc-200 md:bg-white">
          {/* Header */}
          <div className="px-5 py-5">
            <div className="text-sm font-semibold tracking-tight">Command Center</div>
            <div className="text-xs text-zinc-500">V1</div>
          </div>

          {/* Nav */}
          <nav className="flex flex-col gap-0.5 px-3 pb-2 flex-1">
            {NAV.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-zinc-900/5 text-zinc-900"
                      : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                  )}
                >
                  {/* Red left indicator for active state */}
                  {active && (
                    <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r bg-red-600" />
                  )}
                  <Icon className={cn("h-5 w-5", active ? "text-red-600" : "text-zinc-400")} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="border-t border-zinc-200 px-5 py-4 text-xs text-zinc-500">
            <div className="flex items-center justify-between">
              <span>API</span>
              <span className="font-mono text-zinc-400">v1</span>
            </div>
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1">
          <main className="min-h-screen px-4 py-6 md:px-8 md:py-8 pb-24 md:pb-8">
            {children}
          </main>
        </div>
      </div>

      {/* Mobile bottom tabs - horizontal scroll */}
      <nav
        data-testid="mobile-tabs"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-100 bg-white/98 backdrop-blur md:hidden"
      >
        <div className="flex overflow-x-auto scrollbar-hide justify-around py-1">
          {NAV.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-2 text-[10px] font-medium transition-colors shrink-0",
                  active ? "text-zinc-900" : "text-zinc-400"
                )}
              >
                <Icon className={cn("h-5 w-5", active && "text-red-600")} />
                <span className="whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
