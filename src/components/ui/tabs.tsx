"use client";

import * as React from "react";

function cn(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(" ");
}

type TabsContextValue = {
  value: string;
  setValue: (v: string) => void;
};

const TabsContext = React.createContext<TabsContextValue | null>(null);

export function Tabs({
  value: valueProp,
  defaultValue,
  onValueChange,
  className,
  children,
}: {
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue ?? "");
  const value = valueProp ?? uncontrolled;

  const setValue = React.useCallback(
    (v: string) => {
      if (valueProp === undefined) setUncontrolled(v);
      onValueChange?.(v);
    },
    [onValueChange, valueProp],
  );

  return (
    <TabsContext.Provider value={{ value, setValue }}>
      <div className={cn("w-full", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-lg border border-border/70 bg-panel-elevated p-1 text-text-secondary",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error("TabsTrigger must be used within Tabs");
  const active = ctx.value === value;

  return (
    <button
      type="button"
      onClick={() => ctx.setValue(value)}
      className={cn(
        "inline-flex h-8 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors",
        active ? "bg-panel text-text shadow-[var(--shadow-panel-soft)]" : "text-text-secondary hover:text-text",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error("TabsContent must be used within Tabs");
  if (ctx.value !== value) return null;
  return <div className={cn("mt-3", className)}>{children}</div>;
}
