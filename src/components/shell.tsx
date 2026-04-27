"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

function cn(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(" ");
}

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

const NAV = [
  { href: "/dashboard", label: "Overview", icon: OverviewIcon },
  { href: "/projects", label: "Projects", icon: ProjectsIcon },
  { href: "/agents", label: "Agents", icon: AgentsIcon },
  { href: "/usage", label: "Usage", icon: UsageIcon },
  { href: "/teams", label: "Teams", icon: TeamsIcon },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <div className="bg-page text-text">
      <div className="flex w-full">
        <aside className="hidden md:flex md:w-64 md:flex-col md:border-r md:border-border/80 md:bg-shell md:shadow-[var(--shadow-shell)]">
          <div className="border-b border-border/70 px-5 py-5">
            <div className="text-sm font-semibold tracking-[0.01em] text-text">Command Center</div>
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-text-muted">V1</div>
          </div>

          <nav className="flex flex-1 flex-col gap-1 px-3 py-3">
            {NAV.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-accent-soft text-accent-soft-foreground"
                      : "text-text-secondary hover:bg-[color:color-mix(in_srgb,var(--color-panel)_88%,white)] hover:text-text"
                  )}
                >
                  {active && <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r bg-accent" />}
                  <Icon className={cn("h-5 w-5", active ? "text-accent" : "text-text-muted")} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-border/70 px-5 py-4">
            <ThemeToggle className="mb-4" />
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span className="uppercase tracking-[0.18em]">API</span>
              <span className="font-mono text-text-secondary">v1</span>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <main className="min-h-screen px-3 py-5 pb-24 sm:px-4 sm:py-6 md:px-8 md:py-8 md:pb-8">
            <div className="mb-4 md:hidden">
              <ThemeToggle />
            </div>
            {children}
          </main>
        </div>
      </div>

      <nav data-testid="mobile-tabs" className="fixed inset-x-0 bottom-0 z-50 border-t border-border/70 bg-[color:color-mix(in_srgb,var(--color-panel)_88%,white)]/95 backdrop-blur md:hidden">
        <div className="flex justify-around overflow-x-auto py-1 scrollbar-hide">
          {NAV.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex shrink-0 flex-col items-center gap-0.5 rounded-xl px-3 py-2 text-[10px] font-medium transition-colors",
                  active ? "bg-accent-soft text-accent-soft-foreground" : "text-text-muted"
                )}
              >
                <Icon className={cn("h-5 w-5", active ? "text-accent" : "text-text-muted")} />
                <span className="whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
