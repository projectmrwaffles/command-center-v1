import * as React from "react";
import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type EntityCardAccent = "red" | "emerald" | "amber" | "zinc";

type EntityCardProps = React.ComponentPropsWithoutRef<typeof Card> & {
  href?: string;
  accent?: EntityCardAccent;
  interactive?: boolean;
};

const accentClasses: Record<EntityCardAccent, { rail: string; icon: string; metric: string }> = {
  red: {
    rail: "from-[var(--color-accent)] via-[var(--color-accent)] to-[color:color-mix(in_srgb,var(--color-accent)_55%,white)]",
    icon: "group-hover:border-accent/20 group-hover:text-accent",
    metric: "border-accent/15 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-accent-soft)_68%,white),rgba(255,255,255,0.98))]",
  },
  emerald: {
    rail: "from-[var(--color-success)] via-[var(--color-success)] to-[color:color-mix(in_srgb,var(--color-success)_55%,white)]",
    icon: "group-hover:border-[color:color-mix(in_srgb,var(--color-success)_22%,var(--color-border))] group-hover:text-[color:color-mix(in_srgb,var(--color-success)_84%,var(--color-text))]",
    metric: "border-[color:color-mix(in_srgb,var(--color-success)_18%,var(--color-border))] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-success)_10%,white),rgba(255,255,255,0.98))]",
  },
  amber: {
    rail: "from-[var(--color-warning)] via-[var(--color-warning)] to-[color:color-mix(in_srgb,var(--color-warning)_55%,white)]",
    icon: "group-hover:border-[color:color-mix(in_srgb,var(--color-warning)_24%,var(--color-border))] group-hover:text-[color:color-mix(in_srgb,var(--color-warning)_84%,var(--color-text))]",
    metric: "border-[color:color-mix(in_srgb,var(--color-warning)_18%,var(--color-border))] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-warning)_10%,white),rgba(255,255,255,0.98))]",
  },
  zinc: {
    rail: "from-[var(--color-border)] via-[var(--color-border)] to-[var(--color-panel-subtle-strong)]",
    icon: "group-hover:border-accent/16 group-hover:text-text",
    metric: "border-border bg-panel-subtle",
  },
};

export function EntityCard({ className, accent = "red", interactive = false, children, ...props }: EntityCardProps) {
  return (
    <Card
      variant="featured"
      className={cn("group relative flex h-full min-w-0 flex-col overflow-hidden rounded-[24px]", className)}
      {...props}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-1 opacity-70 transition-opacity duration-200",
          interactive && "group-hover:opacity-100",
          `bg-gradient-to-r ${accentClasses[accent].rail}`,
        )}
      />
      <CardContent className="flex h-full flex-col gap-5 p-5 sm:p-6">{children}</CardContent>
    </Card>
  );
}

export function EntityCardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-start justify-between gap-4", className)} {...props} />;
}

export function EntityCardIdentity({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-w-0 space-y-3", className)} {...props} />;
}

export function EntityCardAvatar({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex h-11 w-11 items-center justify-center rounded-2xl border border-border/80 bg-panel-subtle text-2xl text-text", className)}
      {...props}
    />
  );
}

export function EntityCardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("truncate text-lg font-semibold tracking-tight text-text", className)} {...props} />;
}

export function EntityCardSubtitle({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-1 text-sm text-text-muted", className)} {...props} />;
}

export function EntityCardStatus({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex w-fit rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em]",
        className,
      )}
      {...props}
    />
  );
}

export function EntityCardMetric({ className, accent = "zinc", ...props }: React.HTMLAttributes<HTMLDivElement> & { accent?: EntityCardAccent }) {
  return <div className={cn("rounded-2xl border px-4 py-3", accentClasses[accent].metric, className)} {...props} />;
}

export function EntityCardFooterCta({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("inline-flex items-center gap-1 text-sm font-medium text-text-secondary", className)} {...props}>
      {children}
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </div>
  );
}

export function EntityCardAction({ className, accent = "red", ...props }: React.HTMLAttributes<HTMLDivElement> & { accent?: EntityCardAccent }) {
  return (
    <div
      className={cn(
        "rounded-full border border-border/80 bg-panel-subtle p-2 text-text-muted shadow-sm transition-colors",
        accentClasses[accent].icon,
        className,
      )}
      {...props}
    >
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </div>
  );
}
