import * as React from "react";
import { cn } from "@/lib/utils";

export type CardVariant = "default" | "featured" | "soft";

const cardVariants: Record<CardVariant, string> = {
  default: "border-zinc-200/90 bg-white text-zinc-950 shadow-[0_8px_24px_rgba(24,24,27,0.04)]",
  featured:
    "border-zinc-200/90 bg-white/96 text-zinc-950 shadow-[0_12px_32px_rgba(24,24,27,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:border-orange-200/80 hover:shadow-[0_16px_36px_rgba(24,24,27,0.08)]",
  soft: "border-zinc-200/80 bg-white/92 text-zinc-950 shadow-[0_10px_28px_rgba(24,24,27,0.05)]",
};

export function Card({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: CardVariant }) {
  return <div className={cn("rounded-xl border", cardVariants[variant], className)} {...props} />;
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
  return <h3 className={cn("text-sm font-semibold leading-none", className)} {...props} />;
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-zinc-500", className)} {...props} />;
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
