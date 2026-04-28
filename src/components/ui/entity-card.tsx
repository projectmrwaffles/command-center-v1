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
    rail: "from-red-500 via-red-500 to-rose-400",
    icon: "group-hover:border-red-200 group-hover:text-red-600",
    metric: "border-red-100/80 bg-[linear-gradient(180deg,rgba(254,242,242,0.72),rgba(255,255,255,0.98))]",
  },
  emerald: {
    rail: "from-emerald-500 via-emerald-500 to-teal-400",
    icon: "group-hover:border-emerald-200 group-hover:text-emerald-600",
    metric: "border-emerald-100/80 bg-[linear-gradient(180deg,rgba(236,253,245,0.72),rgba(255,255,255,0.98))]",
  },
  amber: {
    rail: "from-amber-500 via-amber-400 to-orange-300",
    icon: "group-hover:border-amber-200 group-hover:text-amber-600",
    metric: "border-amber-100/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.82),rgba(255,255,255,0.98))]",
  },
  zinc: {
    rail: "from-zinc-400 via-zinc-400 to-zinc-300",
    icon: "group-hover:border-zinc-300 group-hover:text-zinc-700",
    metric: "border-zinc-200 bg-zinc-50",
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
      className={cn("flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-2xl", className)}
      {...props}
    />
  );
}

export function EntityCardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("truncate text-lg font-semibold tracking-tight text-zinc-950", className)} {...props} />;
}

export function EntityCardSubtitle({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-1 text-sm text-zinc-500", className)} {...props} />;
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
    <div className={cn("inline-flex items-center gap-1 text-sm font-medium text-zinc-700", className)} {...props}>
      {children}
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </div>
  );
}

export function EntityCardAction({ className, accent = "red", ...props }: React.HTMLAttributes<HTMLDivElement> & { accent?: EntityCardAccent }) {
  return (
    <div
      className={cn(
        "rounded-full border border-zinc-200 bg-white p-2 text-zinc-500 shadow-sm transition-colors",
        accentClasses[accent].icon,
        className,
      )}
      {...props}
    >
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </div>
  );
}
