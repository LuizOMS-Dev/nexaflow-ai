"use client";

import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  KeyRound,
  Lock,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { FormField, Modal, Spinner, useToast } from "@/components/ui";
import { useAuth } from "@/store/auth";
import {
  AccountActionRow,
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
        title: "Senha alterada com sucesso",
        description: data.message || "Outras sessões ativas foram encerradas por segurança.",
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
        description: "Guarde seus códigos de recuperação em local seguro.",
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
        description: "Marque a opção de confirmação antes de prosseguir.",
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
  const isSuperadmin = authUser?.platformRole === "SUPERADMIN";

  return (
    <AccountPanel id="mfa-section" className="scroll-mt-6">
      <AccountPanelHead
        title="Credenciais e autenticação"
        subtitle="Gerencie suas senhas e fatores de segurança para proteção da conta"
        icon={Lock}
      />

      {/* Linha 1: Senha */}
      <AccountActionRow
        icon={KeyRound}
        title="Senha de acesso"
        meta={
          <p className="text-xs text-ink-muted dark:text-zinc-400">
            Altere periodicamente para garantir que apenas você tenha acesso à sua conta.
          </p>
        }
        action={
          <button
            type="button"
            className="btn-secondary h-8.5 px-3.5 text-xs font-medium"
            onClick={() => {
              setPwd({ current: "", next: "", confirm: "" });
              setPwdOpen(true);
            }}
          >
            Alterar senha
          </button>
        }
      />

      {/* Linha 2: Autenticação em duas etapas */}
      <AccountActionRow
        icon={enabled ? ShieldCheck : ShieldAlert}
        title="Autenticação em duas etapas"
        meta={
          <div className="space-y-1.5 mt-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold",
                  enabled
                    ? "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                    : "bg-black/[0.04] text-ink-muted dark:bg-white/[0.06] dark:text-zinc-400"
                )}
              >
                {enabled ? (
                  <>
                    <ShieldCheck className="h-3 w-3" />
                    Ativada
                  </>
                ) : (
                  <>
                    <ShieldAlert className="h-3 w-3" />
                    Desativada
                  </>
                )}
              </span>

              {isSuperadmin && !enabled && (
                <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-amber-600 dark:text-amber-400">
                  <AlertCircle className="h-3 w-3" />
                  Obrigatório para Superadministrador
                </span>
              )}

              {enabled && backupRemaining > 0 && (
                <span className="text-[11.5px] text-ink-faint dark:text-zinc-500">
                  · {backupRemaining} códigos de recuperação restantes
                </span>
              )}
            </div>
            <p className="text-xs text-ink-muted dark:text-zinc-400 leading-relaxed">
              Exige código do aplicativo autenticador (Google Authenticator, Authy, 1Password) para autorizar novos logins.
            </p>
          </div>
        }
        action={
          !enabled && !backupCodes ? (
            <button
              type="button"
              className="btn-primary h-8.5 px-4 text-xs font-medium bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500 shadow-xs shadow-violet-500/25"
              onClick={() => {
                setMfaCode("");
                mfaSetupMutation.mutate();
              }}
              disabled={mfaSetupMutation.isPending}
            >
              {mfaSetupMutation.isPending ? "Gerando…" : "Ativar 2FA"}
            </button>
          ) : enabled && !backupCodes ? (
            <button
              type="button"
              className="btn-secondary h-8.5 px-3.5 text-xs font-medium"
              onClick={() => setManageOpen(true)}
            >
              Gerenciar 2FA
            </button>
          ) : null
        }
      />

      {/* Modal: Alterar Senha */}
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
              className="btn-secondary h-8.5 px-3.5 text-xs"
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
              className="btn-primary h-8.5 px-4 text-xs font-medium bg-violet-600 hover:bg-violet-700 shadow-xs"
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
        <form id="nf-change-password-form" onSubmit={onChangePassword} className="space-y-3.5">
          <FormField label="Senha atual" htmlFor="pwd-current" required>
            <input
              id="pwd-current"
              type="password"
              className="input mt-1 h-9 text-xs focus:border-violet-500 focus:ring-violet-500/20"
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
              className="input mt-1 h-9 text-xs focus:border-violet-500 focus:ring-violet-500/20"
              autoComplete="new-password"
              value={pwd.next}
              onChange={(e) => setPwd((s) => ({ ...s, next: e.target.value }))}
              required
              minLength={10}
            />
            <p className="mt-1 text-[11px] text-ink-faint dark:text-zinc-500">Mínimo de 10 caracteres.</p>
          </FormField>
          <FormField label="Confirmar nova senha" htmlFor="pwd-confirm" required>
            <input
              id="pwd-confirm"
              type="password"
              className="input mt-1 h-9 text-xs focus:border-violet-500 focus:ring-violet-500/20"
              autoComplete="new-password"
              value={pwd.confirm}
              onChange={(e) => setPwd((s) => ({ ...s, confirm: e.target.value }))}
              required
            />
          </FormField>
          <p className="text-xs text-ink-muted dark:text-zinc-400">
            Outras sessões ativas serão automaticamente desconectadas após a alteração.
          </p>
        </form>
      </Modal>

      {/* Modal: Configurar / Gerenciar 2FA */}
      <Modal
        open={manageOpen && Boolean(mfaSetup)}
        onClose={() => {
          if (mfaEnableMutation.isPending) return;
          setManageOpen(false);
          setMfaSetup(null);
        }}
        title="Ativar autenticação em duas etapas"
        size="md"
        variant="contextual"
        preventClose={mfaEnableMutation.isPending}
      >
        <div className="space-y-4">
          <p className="text-xs text-ink-muted dark:text-zinc-400">
            Escaneie o QR Code abaixo com seu aplicativo autenticador (Google Authenticator, Authy, 1Password) e insira o código de 6 dígitos gerado:
          </p>

          {mfaSetup?.qrDataUrl ? (
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="rounded-xl border border-black/[0.08] bg-white p-3 dark:border-white/[0.1] shadow-xs">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mfaSetup.qrDataUrl}
                  alt="QR Code MFA"
                  className="h-44 w-44 rounded-lg"
                />
              </div>
              <p className="font-mono text-xs text-ink-muted dark:text-zinc-400">
                Chave secreta: <span className="font-semibold text-ink dark:text-white select-all">{mfaSetup.secret}</span>
              </p>
            </div>
          ) : null}

          <div>
            <label className="label text-xs font-medium" htmlFor="mfa-verify-code">
              Código de verificação (6 dígitos)
            </label>
            <input
              id="mfa-verify-code"
              className="input mt-1 h-9 text-xs text-center font-mono text-base tracking-widest focus:border-violet-500 focus:ring-violet-500/20"
              placeholder="000000"
              maxLength={6}
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="btn-secondary h-8.5 px-3.5 text-xs"
              onClick={() => {
                setManageOpen(false);
                setMfaSetup(null);
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary h-8.5 px-4 text-xs font-medium bg-violet-600 hover:bg-violet-700 shadow-xs"
              disabled={mfaCode.length !== 6 || mfaEnableMutation.isPending}
              onClick={() => mfaEnableMutation.mutate()}
            >
              {mfaEnableMutation.isPending ? "Validando…" : "Verificar e Ativar"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Gerenciar 2FA quando já ativo */}
      <Modal
        open={manageOpen && !mfaSetup}
        onClose={() => setManageOpen(false)}
        title="Gerenciar 2FA"
        size="sm"
        variant="contextual"
      >
        <div className="space-y-4">
          <p className="text-xs text-ink-muted dark:text-zinc-400">
            A autenticação em duas etapas está atualmente ativa na sua conta.
          </p>

          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              className="btn-secondary h-8.5 justify-center text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
              onClick={() => {
                setManageOpen(false);
                setDisableOpen(true);
              }}
            >
              Desativar 2FA
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Desativar 2FA */}
      <Modal
        open={disableOpen}
        onClose={() => {
          if (mfaDisableMutation.isPending) return;
          setDisableOpen(false);
          setMfaDisable({ password: "", code: "" });
        }}
        title="Desativar 2FA"
        size="sm"
        variant="contextual"
      >
        <div className="space-y-3.5">
          <p className="text-xs text-ink-muted dark:text-zinc-400">
            Informe sua senha atual e o código de 6 dígitos do autenticador para confirmar a desativação:
          </p>

          <FormField label="Senha atual" htmlFor="mfa-dis-pwd" required>
            <input
              id="mfa-dis-pwd"
              type="password"
              className="input mt-1 h-9 text-xs focus:border-violet-500 focus:ring-violet-500/20"
              value={mfaDisable.password}
              onChange={(e) => setMfaDisable((s) => ({ ...s, password: e.target.value }))}
            />
          </FormField>

          <FormField label="Código de 6 dígitos" htmlFor="mfa-dis-code" required>
            <input
              id="mfa-dis-code"
              className="input mt-1 h-9 text-xs font-mono text-center tracking-wider focus:border-violet-500 focus:ring-violet-500/20"
              placeholder="000000"
              maxLength={6}
              value={mfaDisable.code}
              onChange={(e) => setMfaDisable((s) => ({ ...s, code: e.target.value.replace(/\D/g, "") }))}
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="btn-secondary h-8.5 px-3.5 text-xs"
              onClick={() => setDisableOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary h-8.5 px-4 text-xs font-medium bg-red-600 hover:bg-red-700 shadow-xs"
              disabled={!mfaDisable.password || mfaDisable.code.length !== 6 || mfaDisableMutation.isPending}
              onClick={() => mfaDisableMutation.mutate()}
            >
              {mfaDisableMutation.isPending ? "Desativando…" : "Confirmar Desativação"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Códigos de recuperação exibidos na ativação */}
      <Modal
        open={Boolean(backupCodes?.length)}
        onClose={() => {}}
        preventClose
        title="Códigos de recuperação"
        description="Estes códigos são exibidos apenas uma vez. Guarde-os em um local seguro."
        size="md"
        variant="contextual"
        initialFocus="panel"
        footer={
          <button
            type="button"
            className="btn-primary h-8.5 px-4 text-xs font-medium bg-violet-600 hover:bg-violet-700 shadow-xs"
            disabled={!backupCodesAck}
            onClick={confirmBackupCodesAndContinue}
          >
            {fromAdmin || authUser?.platformRole === "SUPERADMIN"
              ? "Confirmar e ir para Administração"
              : "Confirmar e continuar"}
          </button>
        }
      >
        <div className="space-y-4">
          <ul className="grid grid-cols-2 gap-2 rounded-xl border border-black/[0.08] bg-black/[0.02] p-4 font-mono text-xs dark:border-white/[0.08] dark:bg-white/[0.03]">
            {(backupCodes || []).map((c) => (
              <li key={c} className="tabular-nums font-semibold text-ink dark:text-zinc-100">
                {c}
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3">
            <input
              id="mfa-backup-ack"
              type="checkbox"
              className="h-4 w-4 rounded border-black/[0.15] text-violet-600 focus:ring-violet-500 dark:border-white/[0.2] dark:bg-zinc-800"
              checked={backupCodesAck}
              onChange={(e) => setBackupCodesAck(e.target.checked)}
            />
            <label htmlFor="mfa-backup-ack" className="text-xs text-ink-secondary dark:text-zinc-300 cursor-pointer">
              Eu copiei e guardei estes códigos em local seguro.
            </label>
          </div>
        </div>
      </Modal>
    </AccountPanel>
  );
}
