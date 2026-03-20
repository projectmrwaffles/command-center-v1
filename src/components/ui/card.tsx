import * as React from "react";
import { cn } from "@/lib/utils";

export type CardVariant = "default" | "featured" | "soft";

const cardVariants: Record<CardVariant, string> = {
  default: "border-zinc-200 bg-white text-zinc-950 shadow-sm",
  featured:
    "border-zinc-200/90 bg-white/96 text-zinc-950 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-red-200 hover:shadow-[0_20px_44px_rgba(239,68,68,0.12)]",
  soft: "border-zinc-200 bg-white/90 text-zinc-950 shadow-[0_12px_30px_rgba(24,24,27,0.04)]",
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
