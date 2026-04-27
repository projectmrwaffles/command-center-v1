"use client";

import { useTheme } from "@/components/theme-provider";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-2xl border border-border/75 bg-panel px-3 py-2 shadow-[var(--shadow-panel-soft)]", className)}>
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Theme</div>
        <div className="text-sm font-medium text-text">{theme === "dark" ? "Dark" : "Light"} mode</div>
      </div>

      <div className="inline-flex rounded-xl border border-border/70 bg-[color:color-mix(in_srgb,var(--color-shell)_72%,white)] p-1">
        {(["light", "dark"] as const).map((option) => {
          const active = theme === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => setTheme(option)}
              aria-pressed={active}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors",
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
