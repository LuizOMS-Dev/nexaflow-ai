"use client";

import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldOff } from "lucide-react";
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
import {
  AccountActionRow,
  AccountBanner,
  AccountPanel,
  AccountPanelHead,
} from "../account-ui";

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

  const sessions = useQuery({
    queryKey: ["auth-sessions"],
    queryFn: () =>
      api<{ currentSessionId: string | null; sessions: Array<{ id: string; isCurrent: boolean }> }>(
        "/auth/sessions"
      ),
    staleTime: 30_000,
  });

  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });
  const [mfaSetup, setMfaSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
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
      setPwdOpen(false);
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
        description: "Guarde os códigos de recuperação e confirme abaixo.",
      });
      void qc.invalidateQueries({ queryKey: ["mfa-status"] });
      void qc.invalidateQueries({ queryKey: ["admin-overview"] });
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
      void qc.invalidateQueries({ queryKey: ["admin-plans"] });
      void qc.invalidateQueries({ queryKey: ["admin-logs"] });
    },
    onError: (e: Error) => toast({ kind: "error", title: "Código inválido", description: e.message }),
  });

  useEffect(() => {
    if (!autoSetup) return;
    if (mfaStatus.data?.enabled) return;
    if (mfaSetup || mfaSetupMutation.isPending || mfaSetupMutation.isSuccess) return;
    mfaSetupMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSetup, mfaStatus.data?.enabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!autoSetup && window.location.hash !== "#mfa-section") return;
    const el = document.getElementById("mfa-section");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
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
      toast({ kind: "error", title: "Senha fraca", description: "Mínimo de 10 caracteres." });
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
  const sessionCount = sessions.data?.sessions?.length ?? 0;

  return (
    <div className="space-y-3">
      {authUser?.platformRole === "SUPERADMIN" && !enabled && (
        <AccountBanner
          tone="warning"
          title="Verificação em duas etapas obrigatória"
          description="Ative para liberar a Administração da plataforma."
        />
      )}

      {authUser?.platformRole === "SUPERADMIN" && enabled && !backupCodes && (
        <AccountBanner
          tone="success"
          title="Verificação em duas etapas ativa"
          action={
            <button
              type="button"
              className="btn-primary h-8 shrink-0 text-xs"
              onClick={() => router.push("/admin")}
            >
              Ir para Administração
            </button>
          }
        />
      )}

      <AccountPanel id="mfa-section" className="scroll-mt-6 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
        <AccountPanelHead title="Segurança" />

        <AccountActionRow
          title="Senha"
          meta="Protege o acesso à sua conta"
          action={
            <button
              type="button"
              className="btn-secondary h-8 px-3 text-[12.5px]"
              onClick={() => {
                setPwd({ current: "", next: "", confirm: "" });
                setPwdOpen(true);
              }}
            >
              Alterar senha
            </button>
          }
        />

        <AccountActionRow
          title="Autenticação em duas etapas"
          meta={
            <span className="inline-flex items-center gap-2">
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
              {enabled && backupRemaining > 0 ? (
                <span className="text-ink-faint">{backupRemaining} códigos de recuperação</span>
              ) : null}
            </span>
          }
          action={
            !enabled && !backupCodes ? (
              <button
                type="button"
                className="btn-primary h-8 px-3 text-[12.5px]"
                onClick={() => {
                  setMfaCode("");
                  mfaSetupMutation.mutate();
                }}
                disabled={mfaSetupMutation.isPending}
              >
                {mfaSetupMutation.isPending ? "Gerando…" : "Ativar"}
              </button>
            ) : enabled && !backupCodes ? (
              <button
                type="button"
                className="btn-secondary h-8 px-3 text-[12.5px]"
                onClick={() => setManageOpen(true)}
              >
                Gerenciar
              </button>
            ) : null
          }
        />

        {enabled ? (
          <AccountActionRow
            title="Códigos de recuperação"
            meta={
              backupRemaining > 0
                ? `${backupRemaining} disponíveis`
                : "Nenhum disponível — reative o MFA se necessário"
            }
            action={
              <button
                type="button"
                className="btn-secondary h-8 px-3 text-[12.5px]"
                onClick={() => setManageOpen(true)}
              >
                Gerenciar
              </button>
            }
          />
        ) : null}

        <AccountActionRow
          title="Sessões"
          meta={
            sessions.isLoading
              ? "Carregando…"
              : sessionCount === 1
                ? "1 dispositivo conectado"
                : `${sessionCount} dispositivos conectados`
          }
          action={
            <Link href="/app/account/sessions" className="btn-secondary h-8 px-3 text-[12.5px] leading-8">
              Ver sessões
            </Link>
          }
        />
      </AccountPanel>

      {/* Modal senha */}
      <Modal
        open={pwdOpen}
        onClose={() => {
          if (changePassword.isPending) return;
          setPwdOpen(false);
          setPwd({ current: "", next: "", confirm: "" });
        }}
        title="Alterar senha"
        size="sm"
        variant="contextual"
        preventClose={changePassword.isPending}
        footer={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="btn-secondary h-9 px-3.5"
              disabled={changePassword.isPending}
              onClick={() => {
                setPwdOpen(false);
                setPwd({ current: "", next: "", confirm: "" });
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="nf-change-password-form"
              className="btn-primary h-9 px-4"
              disabled={
                changePassword.isPending ||
                !pwd.current ||
                pwd.next.length < 10 ||
                pwd.next !== pwd.confirm
              }
            >
              {changePassword.isPending ? "Salvando…" : "Atualizar senha"}
            </button>
          </div>
        }
      >
        <form id="nf-change-password-form" onSubmit={onChangePassword} className="space-y-3">
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
            <p className="mt-1 text-[11px] text-ink-faint">Mínimo de 10 caracteres.</p>
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
          <p className="text-[11.5px] leading-relaxed text-ink-faint dark:text-zinc-500">
            Outras sessões serão encerradas após a alteração.
          </p>
        </form>
      </Modal>

      {/* Códigos de recuperação */}
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
        description={enabled ? undefined : "Escaneie o QR e confirme o código."}
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
            <FormSection title="1 · Aplicativo autenticador" surface>
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
            <FormSection title="2 · Código de verificação" surface>
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
        description="Confirme com senha e um código do autenticador."
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
              value={mfaDisable.code}
              onChange={(e) =>
                setMfaDisable((s) => ({ ...s, code: e.target.value.replace(/\s/g, "") }))
              }
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          </FormField>
        </div>
      </Modal>
    </div>
  );
}
