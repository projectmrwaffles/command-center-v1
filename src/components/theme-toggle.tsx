"use client";

import { useTheme } from "@/components/theme-provider";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function ThemeToggle({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className={cn(
        "flex items-center rounded-2xl border border-border/75 bg-panel/92 shadow-[var(--shadow-panel-soft)] backdrop-blur-sm",
        compact ? "gap-2 px-2.5 py-2" : "justify-between gap-3 px-3 py-2",
        className
      )}
    >
      {!compact ? (
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Theme</div>
          <div className="text-sm font-medium text-text">{theme === "dark" ? "Dark" : "Light"} mode</div>
        </div>
      ) : (
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Theme</div>
      )}

      <div className={cn("inline-flex border border-border/70 bg-[color:color-mix(in_srgb,var(--color-shell)_76%,white)] shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]", compact ? "rounded-xl p-0.5" : "rounded-xl p-1")}>
        {(["light", "dark"] as const).map((option) => {
          const active = theme === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => setTheme(option)}
              aria-pressed={active}
              aria-label={`Switch to ${option} mode`}
              className={cn(
                "rounded-lg font-medium capitalize transition-colors",
                compact ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
                active ? "bg-accent text-white shadow-[var(--shadow-accent)]" : "text-text-secondary hover:text-text"
              )}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}
