import type { ReactNode } from "react";

export type AdminTone =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "violet";

export type AdminMetric = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: AdminTone;
  href?: string;
  trend?: { label: string; direction?: "up" | "down" | "flat" };
};
