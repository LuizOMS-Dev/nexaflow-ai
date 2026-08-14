"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { AdminEmptyState } from "./empty-state";

export function AdminErrorState({
  title = "Não foi possível carregar",
  description = "Tente novamente em instantes.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <AdminEmptyState
      icon={<AlertTriangle className="h-5 w-5" strokeWidth={1.5} />}
      title={title}
      description={description}
      action={
        onRetry ? (
          <button type="button" className="admin-btn-secondary" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" />
            Tentar novamente
          </button>
        ) : undefined
      }
    />
  );
}
