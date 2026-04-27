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
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      type = "button",
      asChild = false,
      ...props
    },
    ref,
  ) => {
    const base =
      "inline-flex items-center justify-center gap-2 rounded-2xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50";

    const variants: Record<ButtonVariant, string> = {
      default: "bg-accent text-white hover:bg-accent-strong",
      secondary: "bg-panel-elevated text-text hover:bg-panel",
      outline:
        "border border-border bg-panel text-text hover:border-accent/30 hover:bg-accent-soft/60",
      destructive: "bg-accent-strong text-white hover:bg-accent-strong/90",
      ghost: "text-text hover:bg-accent-soft/50",
      warm: "border border-accent bg-accent text-white shadow-[var(--shadow-accent)] hover:border-accent-strong hover:bg-accent-strong",
    };

    const sizes: Record<ButtonSize, string> = {
      default: "h-10 px-4 py-2",
      sm: "h-9 px-3",
      lg: "h-11 px-6",
      icon: "h-10 w-10",
    };

    if (asChild && React.isValidElement(props.children)) {
      const child = props.children as React.ReactElement<any>;
      return React.cloneElement(child, {
        className: cn(base, variants[variant], sizes[size], className, child.props.className),
      });
    }

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
