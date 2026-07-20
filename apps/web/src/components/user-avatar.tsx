"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  resolveAvatarPresentation,
  type AvatarUser,
} from "@/lib/avatar";

const sizeMap = {
  xs: "h-6 w-6 text-[9px]",
  sm: "h-7 w-7 text-[10px]",
  md: "h-9 w-9 text-xs",
  lg: "h-12 w-12 text-sm",
  xl: "h-20 w-20 text-xl",
  "2xl": "h-24 w-24 text-2xl",
} as const;

export function UserAvatar({
  user,
  size = "md",
  className,
  ring,
}: {
  user: AvatarUser;
  size?: keyof typeof sizeMap;
  className?: string;
  /** Anel sutil (sidebar, seleção) */
  ring?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const presentation = resolveAvatarPresentation(user);
  const showImage = presentation.mode === "image" && presentation.src && !broken;

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white select-none",
        sizeMap[size],
        ring && "ring-2 ring-white/[0.15] dark:ring-white/10",
        className
      )}
      style={
        showImage
          ? undefined
          : {
              background: `linear-gradient(145deg, ${presentation.color}, ${shade(presentation.color, -18)})`,
            }
      }
      title={presentation.alt}
      aria-hidden={false}
      role="img"
      aria-label={presentation.alt}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={presentation.src}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
          draggable={false}
        />
      ) : (
        <span className="leading-none tracking-wide">{presentation.initials}</span>
      )}
    </span>
  );
}

function shade(hex: string, percent: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const num = parseInt(h, 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + Math.round(2.55 * percent)));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + Math.round(2.55 * percent)));
  const b = Math.min(255, Math.max(0, (num & 0xff) + Math.round(2.55 * percent)));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
