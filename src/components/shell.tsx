"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function cn(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(" ");
}

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/agents", label: "Agents" },
  { href: "/projects", label: "Projects" },
  { href: "/approvals", label: "Approvals" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-950">
      <div className="mx-auto flex w-full max-w-6xl">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex md:w-64 md:flex-col md:border-r md:border-zinc-200 md:bg-white">
          <div className="px-5 py-5">
            <div className="text-sm font-semibold tracking-tight">Command Center</div>
            <div className="mt-1 text-xs text-zinc-500">MVP</div>
          </div>
          <nav className="flex flex-col gap-1 px-2 pb-4">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-zinc-900 text-white"
                      : "text-zinc-700 hover:bg-zinc-100",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main */}
        <div className="flex-1">
          <main className="min-h-dvh px-4 py-6 md:px-8 md:py-8 pb-24 md:pb-8">
            {children}
          </main>
        </div>
      </div>

      {/* Mobile bottom tabs */}
      <nav
        data-testid="mobile-tabs"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-200 bg-white/95 backdrop-blur md:hidden"
      >
        <div className="mx-auto grid max-w-6xl grid-cols-4">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-3 text-xs font-medium",
                  active ? "text-zinc-950" : "text-zinc-500",
                )}
              >
                <span
                  className={cn(
                    "h-1 w-10 rounded-full",
                    active ? "bg-zinc-950" : "bg-transparent",
                  )}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
