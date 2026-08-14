"use client";

import { cn } from "@/lib/utils";

export function AdminSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-white/[0.06]", className)}
      aria-hidden
    />
  );
}

export function AdminPageSkeleton({ metrics = 4 }: { metrics?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando">
      <div className="space-y-2">
        <AdminSkeleton className="h-4 w-24" />
        <AdminSkeleton className="h-8 w-48" />
        <AdminSkeleton className="h-3 w-72" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: metrics }).map((_, i) => (
          <AdminSkeleton key={i} className="h-[92px] rounded-xl" />
        ))}
      </div>
      <AdminSkeleton className="h-48 rounded-xl" />
      <div className="grid gap-3 lg:grid-cols-2">
        <AdminSkeleton className="h-56 rounded-xl" />
        <AdminSkeleton className="h-56 rounded-xl" />
      </div>
    </div>
  );
}
