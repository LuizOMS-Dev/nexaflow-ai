"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { CheckCircle2, Loader2, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui";

export type CriticalSummaryRow = {
  label: string;
  value: ReactNode;
  tone?: "danger" | "success" | "neutral" | "amber" | "brand";
};

export type CriticalActionDialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  tone?: "amber" | "danger";
  summaryTitle?: string;
  summaryRows: CriticalSummaryRow[];
  attentionText?: string;
  checkboxLabel: string;
  checkboxChecked: boolean;
  onCheckboxChange: (checked: boolean) => void;
  confirmExpectedText: string;
  confirmInput: string;
  onConfirmInputChange: (val: string) => void;
  confirmInputCaseSensitive?: boolean;
  cancelLabel?: string;
  onCancel?: () => void;
  actionLabel: string;
  actionLoadingLabel?: string;
  onAction: () => void;
  isLoading?: boolean;
  errorMessage?: string | null;
};

export function CriticalActionDialog({
  open,
  onClose,
  title,
  description,
  tone = "danger",
  summaryTitle,
  summaryRows,
  attentionText,
  checkboxLabel,
  checkboxChecked,
  onCheckboxChange,
  confirmExpectedText,
  confirmInput,
  onConfirmInputChange,
  confirmInputCaseSensitive = false,
  cancelLabel = "Cancelar",
  onCancel,
  actionLabel,
  actionLoadingLabel = "Processando…",
  onAction,
  isLoading = false,
  errorMessage,
}: CriticalActionDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const isExactMatch = confirmInputCaseSensitive
    ? confirmInput.trim() === confirmExpectedText.trim()
    : confirmInput.trim().toLowerCase() === confirmExpectedText.trim().toLowerCase();

  const canSubmit = checkboxChecked && isExactMatch && !isLoading;

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "Escape" && !isLoading) {
        e.preventDefault();
        if (onCancel) onCancel();
        else onClose();
      } else if (e.key === "Enter" && canSubmit) {
        e.preventDefault();
        onAction();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, canSubmit, isLoading, onAction, onCancel, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      style={{ zIndex: "var(--z-modal-backdrop, 9999)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="critical-action-dialog-title"
    >
      {/* Backdrop com blur uniforme */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity animate-in fade-in-0 duration-200"
        onClick={() => !isLoading && (onCancel ? onCancel() : onClose())}
        aria-hidden="true"
      />

      {/* Caixa do Dialog */}
      <div
        className={cn(
          "relative z-10 w-full max-w-[32rem] rounded-2xl border p-5 sm:p-6 shadow-2xl transition-all",
          "border-line-subtle bg-white text-ink shadow-black/20",
          "dark:border-white/[0.09] dark:bg-[#0c0d12] dark:text-zinc-100 dark:shadow-black/80",
          "animate-in fade-in-0 zoom-in-95 duration-200"
        )}
      >
        {/* Header com Botão Fechar X */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 pr-2">
            <h2
              id="critical-action-dialog-title"
              className="text-[16px] sm:text-[17px] font-semibold text-ink dark:text-white tracking-tight"
            >
              {title}
            </h2>
            <p className="text-[12.5px] leading-relaxed text-ink-muted dark:text-gray-400">
              {description}
            </p>
          </div>

          <button
            type="button"
            onClick={() => !isLoading && (onCancel ? onCancel() : onClose())}
            disabled={isLoading}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-black/[0.04] hover:text-ink dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white disabled:opacity-40"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Corpo: Resumo em duas colunas */}
        <div className="mt-4 space-y-3.5 text-[12.5px]">
          <div className="space-y-2">
            {summaryTitle ? (
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted dark:text-gray-400 block mb-1.5">
                {summaryTitle}
              </span>
            ) : null}

            <div className="space-y-2 text-[12px]">
              {summaryRows.map((row, idx) => {
                const toneClass =
                  row.tone === "danger"
                    ? "text-rose-600 dark:text-rose-400"
                    : row.tone === "success"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : row.tone === "amber"
                    ? "text-amber-600 dark:text-amber-400"
                    : row.tone === "brand"
                    ? "text-violet-600 dark:text-violet-300"
                    : "text-ink-muted dark:text-gray-400";

                return (
                  <div
                    key={idx}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-2"
                  >
                    <span className={cn("font-medium shrink-0", toneClass)}>
                      {row.label}
                    </span>
                    <span className="text-ink-secondary dark:text-gray-300 sm:text-right font-normal">
                      {row.value}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mensagem de atenção opcional */}
          {attentionText ? (
            <div className="flex items-center gap-2 text-[12px] text-amber-700 dark:text-amber-300/90 pt-0.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500 dark:text-amber-400" />
              <span>{attentionText}</span>
            </div>
          ) : null}

          {/* Divisor sutil */}
          <div className="border-t border-line-soft dark:border-white/[0.06]" />

          {/* Checkbox integrado sem card */}
          <label className="flex items-start gap-2.5 cursor-pointer text-[12.5px] select-none text-ink-secondary dark:text-gray-200 leading-snug">
            <Checkbox
              checked={checkboxChecked}
              onCheckedChange={onCheckboxChange}
              disabled={isLoading}
              className="mt-0.5 shrink-0"
            />
            <span>{checkboxLabel}</span>
          </label>

          {/* Confirmação Textual */}
          <div className="space-y-1.5 pt-0.5">
            <label className="block text-[12px] font-medium text-ink-secondary dark:text-gray-300">
              Para confirmar, digite{" "}
              <code
                className={cn(
                  "rounded px-1.5 py-0.5 font-mono font-bold select-all border",
                  tone === "amber"
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25"
                    : "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/25"
                )}
              >
                {confirmExpectedText}
              </code>
            </label>

            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={confirmInput}
                onChange={(e) => onConfirmInputChange(e.target.value)}
                placeholder={confirmExpectedText}
                disabled={isLoading}
                autoComplete="off"
                spellCheck="false"
                className={cn(
                  "input h-9 w-full text-[13px] transition-colors pr-8",
                  "bg-surface-base dark:bg-[#08090d] border-line-soft dark:border-white/10 text-ink dark:text-white",
                  isExactMatch
                    ? "border-emerald-500/40 focus:border-emerald-500/60 dark:border-emerald-500/40"
                    : tone === "amber"
                    ? "focus:border-amber-500/50"
                    : "focus:border-rose-500/50"
                )}
              />

              {isExactMatch ? (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center justify-center text-emerald-500 dark:text-emerald-400 animate-in fade-in zoom-in duration-150">
                  <CheckCircle2 className="h-4 w-4 stroke-[2]" />
                </span>
              ) : null}
            </div>
          </div>

          {/* Erro inline se houver */}
          {errorMessage ? (
            <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.08] p-2.5 text-rose-600 dark:text-rose-300 text-[11.5px] flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500 dark:text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          ) : null}
        </div>

        {/* Footer Padronizado */}
        <div className="mt-5 flex items-center justify-end gap-2.5 border-t border-line-soft dark:border-white/[0.06] pt-4">
          <button
            type="button"
            className="admin-btn-secondary h-9 px-4 text-[13px]"
            disabled={isLoading}
            onClick={() => (onCancel ? onCancel() : onClose())}
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            className={cn(
              "h-9 px-4 text-[13px] font-medium rounded-xl flex items-center gap-2 transition-all",
              tone === "amber"
                ? "bg-amber-600 hover:bg-amber-500 text-white font-semibold border border-amber-500/30"
                : "bg-rose-600 hover:bg-rose-500 text-white border border-rose-500/30",
              "disabled:opacity-40 disabled:cursor-not-allowed"
            )}
            disabled={!canSubmit}
            onClick={onAction}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>{actionLoadingLabel}</span>
              </>
            ) : (
              <span>{actionLabel}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
