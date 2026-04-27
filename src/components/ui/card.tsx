import * as React from "react";
import { cn } from "@/lib/utils";

export type CardVariant = "default" | "featured" | "soft";

const cardVariants: Record<CardVariant, string> = {
  default: "border border-border/80 bg-panel text-text shadow-[var(--shadow-panel-soft)]",
  featured:
    "border border-border/75 bg-panel text-text shadow-[var(--shadow-panel)] transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-[var(--shadow-panel)]",
  soft: "border border-border/70 bg-panel-elevated text-text shadow-[var(--shadow-panel-soft)]",
};

export function Card({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: CardVariant }) {
  return <div className={cn("rounded-xl", cardVariants[variant], className)} {...props} />;
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 pb-2", className)} {...props} />;
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-sm font-semibold leading-none text-text", className)} {...props} />;
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-text-muted", className)} {...props} />;
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 pt-2", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 pt-0", className)} {...props} />;
}
