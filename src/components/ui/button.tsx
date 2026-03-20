import * as React from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "default"
  | "secondary"
  | "outline"
  | "destructive"
  | "ghost"
  | "warm";

export type ButtonSize = "default" | "sm" | "lg" | "icon";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      type = "button",
      ...props
    },
    ref,
  ) => {
    const base =
      "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-background";

    const variants: Record<ButtonVariant, string> = {
      default: "bg-zinc-900 text-white hover:bg-zinc-800",
      secondary: "bg-zinc-100 text-zinc-900 hover:bg-zinc-200",
      outline:
        "border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
      destructive: "bg-red-600 text-white hover:bg-red-700",
      ghost: "text-zinc-900 hover:bg-zinc-100",
      warm: "border border-orange-200/70 bg-[linear-gradient(135deg,rgba(234,88,12,0.96)_0%,rgba(249,115,22,0.94)_55%,rgba(251,191,36,0.88)_100%)] text-white shadow-[0_10px_24px_rgba(234,88,12,0.16)] hover:shadow-[0_14px_28px_rgba(234,88,12,0.18)] hover:brightness-[1.03]",
    };

    const sizes: Record<ButtonSize, string> = {
      default: "h-10 px-4 py-2",
      sm: "h-9 px-3",
      lg: "h-11 px-6",
      icon: "h-10 w-10",
    };

    return (
      <button
        ref={ref}
        type={type}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
