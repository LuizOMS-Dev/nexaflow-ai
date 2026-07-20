"use client";

import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  EntitySummary,
  FormField,
  FormSection,
  Modal,
  Spinner,
  Switch,
  useToast,
} from "@/components/ui";
import { useAuth } from "@/store/auth";

export default function AccountSecurityPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const authUser = useAuth((s) => s.user);
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromAdmin = searchParams.get("from") === "admin";
  const autoSetup = searchParams.get("setup") === "mfa";

  const mfaStatus = useQuery({
    queryKey: ["mfa-status"],
    queryFn: () => api<{ enabled: boolean; backupCodesRemaining: number }>("/auth/mfa/status"),
  });

  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });
  const [mfaSetup, setMfaSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  /** Só libera saída da tela de códigos após confirmação explícita */
  const [backupCodesAck, setBackupCodesAck] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [mfaDisable, setMfaDisable] = useState({ password: "", code: "" });

  const changePassword = useMutation({
    mutationFn: () =>
      api<{ message: string }>("/auth/change-password", {
        method: "POST",
        json: {
          currentPassword: pwd.current,
          newPassword: pwd.next,
        },
      }),
    onSuccess: (data) => {
      setPwd({ current: "", next: "", confirm: "" });
      toast({
        kind: "success",
        title: "Senha alterada",
        description: data.message || "Outras sessões foram encerradas.",
      });
    },
    onError: (e: Error) => {
      toast({ kind: "error", title: "Não foi possível alterar a senha", description: e.message });
    },
  });

  const mfaSetupMutation = useMutation({
    mutationFn: () =>
      api<{ secret: string; qrDataUrl: string }>("/auth/mfa/setup", { method: "POST" }),
    onSuccess: (data) => {
      setMfaSetup({ secret: data.secret, qrDataUrl: data.qrDataUrl });
      setBackupCodes(null);
      setManageOpen(true);
    },
    onError: (e: Error) => toast({ kind: "error", title: "Erro no MFA", description: e.message }),
  });

  const mfaEnableMutation = useMutation({
    mutationFn: () =>
      api<{ backupCodes: string[] }>("/auth/mfa/enable", {
        method: "POST",
        json: { code: mfaCode },
      }),
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes);
      setBackupCodesAck(false);
      setMfaSetup(null);
      setMfaCode("");
      setManageOpen(false);
      toast({
        kind: "success",
        title: "Autenticação em duas etapas ativada",
        description: "Guarde os códigos de recuperação e confirme abaixo para continuar.",
      });
      // Atualiza estado MFA — a tela de códigos só sai após confirmação manual
      void qc.invalidateQueries({ queryKey: ["mfa-status"] });
      void qc.invalidateQueries({ queryKey: ["admin-overview"] });
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
      void qc.invalidateQueries({ queryKey: ["admin-plans"] });
      void qc.invalidateQueries({ queryKey: ["admin-logs"] });
    },
    onError: (e: Error) => toast({ kind: "error", title: "Código inválido", description: e.message }),
  });

  // Abre setup MFA automaticamente quando vem do gate da Administração
  useEffect(() => {
    if (!autoSetup) return;
    if (mfaStatus.data?.enabled) return;
    if (mfaSetup || mfaSetupMutation.isPending || mfaSetupMutation.isSuccess) return;
    mfaSetupMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na entrada com ?setup=mfa
  }, [autoSetup, mfaStatus.data?.enabled]);

  // Deep-link: rola até a seção de autenticação em duas etapas
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!autoSetup && window.location.hash !== "#mfa-section") return;
    const el = document.getElementById("mfa-section");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [autoSetup, mfaStatus.isLoading]);

  function confirmBackupCodesAndContinue() {
    if (!backupCodesAck) {
      toast({
        kind: "warning",
        title: "Confirme que guardou os códigos",
        description: "Marque a opção abaixo antes de continuar.",
      });
      return;
    }
    setBackupCodes(null);
    setBackupCodesAck(false);
    void qc.invalidateQueries({ queryKey: ["mfa-status"] });
    if (fromAdmin || authUser?.platformRole === "SUPERADMIN") {
      router.replace("/admin");
      return;
    }
    toast({
      kind: "success",
      title: "Pronto",
      description: "Códigos confirmados. A autenticação em duas etapas está ativa.",
    });
  }

  const mfaDisableMutation = useMutation({
    mutationFn: () =>
      api("/auth/mfa/disable", {
        method: "POST",
        json: mfaDisable,
      }),
    onSuccess: () => {
      setMfaDisable({ password: "", code: "" });
      setBackupCodes(null);
      setDisableOpen(false);
      setManageOpen(false);
      toast({ kind: "success", title: "MFA desativado" });
      qc.invalidateQueries({ queryKey: ["mfa-status"] });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível desativar", description: e.message }),
  });

  function onChangePassword(e: FormEvent) {
    e.preventDefault();
    if (pwd.next.length < 10) {
      toast({ kind: "error", title: "Senha fraca", description: "Use ao menos 10 caracteres." });
      return;
    }
    if (pwd.next !== pwd.confirm) {
      toast({ kind: "error", title: "Confirmação diferente", description: "As senhas não coincidem." });
      return;
    }
    changePassword.mutate();
  }

  if (mfaStatus.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  const enabled = Boolean(mfaStatus.data?.enabled);
  const backupRemaining = mfaStatus.data?.backupCodesRemaining ?? 0;

  return (
    <div className="space-y-4">
      {authUser?.platformRole === "SUPERADMIN" && !enabled && (
        <div className="rounded-xl border border-violet-500/25 bg-violet-500/10 px-4 py-3 text-sm text-violet-950 dark:text-violet-100">
          <p className="font-medium">Verificação em duas etapas obrigatória</p>
          <p className="mt-1 text-xs leading-relaxed opacity-90">
            Ative abaixo para liberar a Administração.
          </p>
        </div>
      )}

      {authUser?.platformRole === "SUPERADMIN" && enabled && !backupCodes && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-950 dark:text-emerald-100">
          <p className="text-xs leading-relaxed">
            Verificação em duas etapas ativa.
          </p>
          <button
            type="button"
            className="btn-primary h-8 shrink-0 text-xs"
            onClick={() => router.push("/admin")}
          >
            Ir para Administração
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Senha */}
        <form onSubmit={onChangePassword} className="card space-y-3.5 p-5">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-brand-600 dark:text-brand-400" strokeWidth={1.5} />
            <h2 className="font-display text-[15px] font-semibold text-ink dark:text-white">
              Alterar senha
            </h2>
          </div>
          <FormField label="Senha atual" htmlFor="pwd-current" required>
            <input
              id="pwd-current"
              type="password"
              className="input"
              autoComplete="current-password"
              value={pwd.current}
              onChange={(e) => setPwd((s) => ({ ...s, current: e.target.value }))}
              required
            />
          </FormField>
          <FormField label="Nova senha" htmlFor="pwd-new" required>
            <input
              id="pwd-new"
              type="password"
              className="input"
              autoComplete="new-password"
              value={pwd.next}
              onChange={(e) => setPwd((s) => ({ ...s, next: e.target.value }))}
              required
              minLength={10}
            />
          </FormField>
          <FormField label="Confirmar nova senha" htmlFor="pwd-confirm" required>
            <input
              id="pwd-confirm"
              type="password"
              className="input"
              autoComplete="new-password"
              value={pwd.confirm}
              onChange={(e) => setPwd((s) => ({ ...s, confirm: e.target.value }))}
              required
            />
          </FormField>
          <div className="flex justify-end pt-1">
            <button
              type="submit"
              className="btn-primary h-9 px-4"
              disabled={changePassword.isPending}
            >
              {changePassword.isPending ? "Salvando…" : "Atualizar senha"}
            </button>
          </div>
        </form>

        {/* MFA */}
        <div id="mfa-section" className="card scroll-mt-6 space-y-3.5 p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-brand-600 dark:text-brand-400" strokeWidth={1.5} />
            <h2 className="font-display text-[15px] font-semibold text-ink dark:text-white">
              Autenticação em duas etapas
            </h2>
          </div>

          <p className="text-[13px] leading-relaxed text-ink-muted">
            Protege o login da sua conta com um código do aplicativo autenticador.
          </p>

          <dl className="space-y-2.5 rounded-xl border border-line-soft px-3.5 py-3 dark:border-white/[0.06]">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-xs text-ink-muted">Status</dt>
              <dd>
                <span
                  className={cn(
                    "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    enabled
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "bg-black/[0.05] text-ink-muted dark:bg-white/[0.06]"
                  )}
                >
                  {enabled ? "Ativada" : "Desativada"}
                </span>
              </dd>
            </div>
            {enabled && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-ink-muted">Códigos de recuperação</dt>
                <dd className="text-sm font-medium tabular-nums text-ink dark:text-white">
                  {backupRemaining} disponíveis
                </dd>
              </div>
            )}
          </dl>

          <div className="flex flex-wrap gap-2 pt-0.5">
            {!enabled && !backupCodes && (
              <button
                type="button"
                className="btn-primary h-9 px-4"
                onClick={() => {
                  setMfaCode("");
                  mfaSetupMutation.mutate();
                }}
                disabled={mfaSetupMutation.isPending}
              >
                {mfaSetupMutation.isPending ? "Gerando…" : "Ativar autenticação em duas etapas"}
              </button>
            )}
            {enabled && !backupCodes && (
              <>
                <button
                  type="button"
                  className="btn-secondary h-9 px-3.5"
                  onClick={() => setManageOpen(true)}
                >
                  Gerenciar
                </button>
                {authUser?.platformRole !== "SUPERADMIN" && (
                  <button
                    type="button"
                    className="btn-danger h-9 px-3.5"
                    onClick={() => {
                      setMfaDisable({ password: "", code: "" });
                      setDisableOpen(true);
                    }}
                  >
                    Desativar
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Códigos de recuperação: tela bloqueante — só sai após confirmação explícita */}
      <Modal
        open={Boolean(backupCodes?.length)}
        onClose={() => {
          /* não fecha sem confirmação */
        }}
        preventClose
        title="Códigos de recuperação"
        description="Aparecem só uma vez. Guarde em local seguro."
        size="md"
        variant="contextual"
        tone="warning"
        initialFocus="panel"
        footer={
          <button
            type="button"
            className="btn-primary h-9 w-full px-4 sm:w-auto sm:min-w-[12rem]"
            disabled={!backupCodesAck}
            onClick={confirmBackupCodesAndContinue}
          >
            {fromAdmin || authUser?.platformRole === "SUPERADMIN"
              ? "Confirmar e ir para Administração"
              : "Confirmar e continuar"}
          </button>
        }
      >
        <div className="space-y-3">
          <ul className="grid grid-cols-2 gap-1.5 rounded-xl border border-amber-500/20 bg-amber-50/60 p-3 font-mono text-[12px] dark:bg-amber-500/5">
            {(backupCodes || []).map((c) => (
              <li key={c} className="tabular-nums text-ink dark:text-gray-100">
                {c}
              </li>
            ))}
          </ul>
          <div className="rounded-xl border border-line-soft px-3 py-2.5 dark:border-white/[0.08]">
            <Switch
              id="mfa-backup-ack"
              label="Códigos guardados com segurança"
              description="Não serão mostrados de novo."
              checked={backupCodesAck}
              onChange={setBackupCodesAck}
              className="py-0"
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={manageOpen && (!!mfaSetup || enabled) && !backupCodes}
        onClose={() => {
          if (mfaEnableMutation.isPending) return;
          setManageOpen(false);
          if (!enabled) setMfaSetup(null);
        }}
        title={enabled ? "Autenticação em duas etapas" : "Ativar verificação em duas etapas"}
        description={
          enabled
            ? "Status: ativa"
            : "Escaneie o QR e confirme o código."
        }
        size="sm"
        variant="contextual"
        initialFocus="panel"
        footer={
          mfaSetup ? (
            <button
              type="button"
              className="btn-primary h-9 w-full px-4 sm:w-auto sm:min-w-[10rem]"
              disabled={mfaEnableMutation.isPending || mfaCode.length < 6}
              onClick={() => mfaEnableMutation.mutate()}
            >
              {mfaEnableMutation.isPending ? "Ativando…" : "Confirmar e ativar"}
            </button>
          ) : enabled && !mfaSetup && authUser?.platformRole !== "SUPERADMIN" ? (
            <button
              type="button"
              className="btn-danger h-9 w-full px-4 sm:w-auto"
              onClick={() => {
                setManageOpen(false);
                setMfaDisable({ password: "", code: "" });
                setDisableOpen(true);
              }}
            >
              <ShieldOff className="h-3.5 w-3.5" strokeWidth={1.75} />
              Desativar
            </button>
          ) : undefined
        }
      >
        {mfaSetup && (
          <div className="space-y-4">
            <FormSection title="Aplicativo autenticador" surface>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mfaSetup.qrDataUrl}
                alt="QR MFA"
                className="mx-auto h-40 w-40 rounded-xl bg-white p-2 ring-1 ring-black/[0.06]"
              />
              <p className="mt-2 break-all text-center text-[10px] text-ink-faint">
                {mfaSetup.secret}
              </p>
            </FormSection>
            <FormSection title="Confirmação" surface>
              <FormField label="Código" htmlFor="mfa-setup-code" required>
                <input
                  id="mfa-setup-code"
                  className="input"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\s/g, ""))}
                  placeholder="000000"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
              </FormField>
            </FormSection>
          </div>
        )}

        {enabled && !mfaSetup && (
          <EntitySummary
            title="Status: ativa"
            meta={[
              {
                label: "Códigos",
                value: `${backupRemaining} restantes`,
              },
            ]}
          />
        )}
      </Modal>

      <Modal
        open={disableOpen}
        onClose={() => {
          if (mfaDisableMutation.isPending) return;
          setDisableOpen(false);
          setMfaDisable({ password: "", code: "" });
        }}
        title="Desativar autenticação em duas etapas"
        description="Confirme com senha e um código do autenticador (ou de recuperação)."
        variant="danger"
        tone="danger"
        size="sm"
        preventClose={mfaDisableMutation.isPending}
        footer={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="btn-secondary h-9 px-3.5"
              disabled={mfaDisableMutation.isPending}
              onClick={() => {
                setDisableOpen(false);
                setMfaDisable({ password: "", code: "" });
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-danger h-9 px-4"
              disabled={
                mfaDisableMutation.isPending ||
                !mfaDisable.password ||
                mfaDisable.code.length < 6
              }
              onClick={() => mfaDisableMutation.mutate()}
            >
              {mfaDisableMutation.isPending ? "Desativando…" : "Confirmar desativação"}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <FormField label="Senha atual" htmlFor="mfa-dis-pwd" required>
            <input
              id="mfa-dis-pwd"
              type="password"
              className="input"
              autoComplete="current-password"
              value={mfaDisable.password}
              onChange={(e) => setMfaDisable((s) => ({ ...s, password: e.target.value }))}
            />
          </FormField>
          <FormField label="Código" htmlFor="mfa-dis-code" required>
            <input
              id="mfa-dis-code"
              className="input"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              value={mfaDisable.code}
              onChange={(e) => setMfaDisable((s) => ({ ...s, code: e.target.value }))}
            />
          </FormField>
        </div>
      </Modal>
    </div>
  );
}
