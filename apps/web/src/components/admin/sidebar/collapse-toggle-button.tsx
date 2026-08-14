"use client";

import { PanelLeft, PanelLeftClose } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui";

export function CollapseToggleButton({
  collapsed,
  onToggle,
  className,
}: {
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const label = collapsed ? "Expandir menu" : "Recolher menu";
  const btn = (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors duration-150",
        "hover:bg-white/[0.06] hover:text-violet-300",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/45",
        "active:scale-95",
        className
      )}
      aria-label={`${label} (Ctrl+B)`}
      aria-pressed={collapsed}
    >
      {collapsed ? (
        <PanelLeft className="h-4 w-4" strokeWidth={1.7} />
      ) : (
        <PanelLeftClose className="h-4 w-4" strokeWidth={1.7} />
      )}
    </button>
  );

  return (
    <Tooltip
      content={collapsed ? "Expandir" : "Recolher"}
      subtitle="Ctrl + B"
      side={collapsed ? "right" : "bottom"}
      delay={140}
    >
      {btn}
    </Tooltip>
  );
}
