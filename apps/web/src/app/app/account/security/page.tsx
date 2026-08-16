"use client";

import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Shield,
  ShieldAlert,
  Smartphone,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Modal, Spinner, useToast } from "@/components/ui";
import { useAuth } from "@/store/auth";
import {
  AccountCard,
  AccountRow,
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
  const [showPwd, setShowPwd] = useState({ current: false, next: false, confirm: false });
  const [pwdError, setPwdError] = useState<string | null>(null);

  const [mfaSetup, setMfaSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [backupCodesAck, setBackupCodesAck] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [mfaDisable, setMfaDisable] = useState({ password: "", code: "" });
  const [showDisablePwd, setShowDisablePwd] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  const isSuperadmin = authUser?.platformRole === "SUPERADMIN";

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
      setPwdError(null);
      setPwdOpen(false);
      toast({
        kind: "success",
        title: "Senha alterada com sucesso.",
        description: data.message || "Outras sessões ativas foram encerradas por segurança.",
      });
    },
    onError: (e: Error) => {
      setPwdError(e.message || "Senha atual incorreta ou inválida.");
      toast({ kind: "error", title: "Não foi possível alterar a senha", description: e.message });
    },
  });

  const mfaSetupMutation = useMutation({
    mutationFn: () =>
      api<{ secret: string; qrDataUrl: string }>("/auth/mfa/setup", { method: "POST" }),
    onSuccess: (data) => {
      setMfaSetup({ secret: data.secret, qrDataUrl: data.qrDataUrl });
      setBackupCodes(null);
      setMfaError(null);
      setMfaCode("");
      setManageOpen(true);
    },
    onError: (e: Error) => toast({ kind: "error", title: "Erro ao iniciar 2FA", description: e.message }),
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
      setMfaError(null);
      setManageOpen(false);
      toast({
        kind: "success",
        title: "Autenticação em duas etapas ativada!",
        description: "Guarde seus códigos de recuperação em local seguro.",
      });
      void qc.invalidateQueries({ queryKey: ["mfa-status"] });
    },
    onError: (e: Error) => {
      const msg = "Código inválido. Verifique o aplicativo autenticador e tente novamente.";
      setMfaError(msg);
      toast({
        kind: "error",
        title: "Código inválido",
        description: msg,
      });
    },
  });

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
      toast({ kind: "success", title: "Autenticação em duas etapas desativada." });
      void qc.invalidateQueries({ queryKey: ["mfa-status"] });
    },
    onError: (e: Error) => toast({ kind: "error", title: "Não foi possível desativar", description: e.message }),
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
    if (fromAdmin || isSuperadmin) {
      router.replace("/admin");
      return;
    }
    toast({
      kind: "success",
      title: "Pronto!",
      description: "Códigos confirmados. Sua conta está protegida com 2FA.",
    });
  }

  function handleCopyKey() {
    if (!mfaSetup?.secret) return;
    navigator.clipboard.writeText(mfaSetup.secret);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
    toast({ kind: "success", title: "Chave manual copiada para a área de transferência." });
  }

  function handleDownloadBackupCodes() {
    if (!backupCodes) return;
    const content = `NEXAFLOW - CÓDIGOS DE RECUPERAÇÃO 2FA\nGerados em: ${new Date().toLocaleString("pt-BR")}\nUsuário: ${authUser?.email}\n\n${backupCodes.join("\n")}\n\nCada código só pode ser usado uma única vez.`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nexaflow-backup-codes-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const is2FAEnabled = mfaStatus.data?.enabled;
  const isPwdValid =
    pwd.current.trim().length > 0 &&
    pwd.next.length >= 8 &&
    pwd.confirm.length > 0 &&
    pwd.next === pwd.confirm;

  return (
    <div className="space-y-6">
      {/* ── 1. Resumo de Segurança da Conta ── */}
      <AccountCard
        title="Credenciais e autenticação"
        description="Gerencie sua senha e os métodos de proteção da conta."
        flush
      >
        {/* Linha 1: Senha de Acesso */}
        <AccountRow
          icon={KeyRound}
          title="Senha de acesso"
          description="Utilizada para autenticação principal em todos os seus navegadores e dispositivos."
          className="py-5 sm:py-6 hover:bg-black/[0.01] dark:hover:bg-white/[0.015] transition-colors"
          control={
            <button
              type="button"
              className="btn-secondary h-8.5 px-3.5 text-xs font-medium active:scale-[0.985] transition-all duration-150"
              onClick={() => {
                setPwd({ current: "", next: "", confirm: "" });
                setPwdError(null);
                setPwdOpen(true);
              }}
            >
              Alterar senha
            </button>
          }
        />

        {/* Linha 2: Autenticação em Duas Etapas (2FA) */}
        <div id="mfa-section">
          <AccountRow
            icon={Smartphone}
            title="Autenticação em duas etapas"
            className="py-5 sm:py-6 hover:bg-black/[0.01] dark:hover:bg-white/[0.015] transition-colors"
            description={
              <div className="space-y-2.5">
                <p className="text-[12.5px] leading-relaxed text-ink-muted dark:text-zinc-400">
                  Exige um código gerado por aplicativo autenticador ao entrar.
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  {mfaStatus.isLoading ? (
                    <Spinner className="h-4 w-4" />
                  ) : is2FAEnabled ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 dark:bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 transition-all duration-200">
                      <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} />
                      Ativada
                    </span>
                  ) : (
                    <>
                      {/* Desativada em badge neutro/cinza para não competir com o alerta de superadmin */}
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-black/[0.04] dark:bg-white/[0.06] px-2.5 py-0.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 transition-all duration-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500" />
                        Desativada
                      </span>
                      {isSuperadmin ? (
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                          <ShieldAlert className="h-3 w-3 shrink-0" />
                          Obrigatório para Superadministrador
                        </span>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            }
            control={
              is2FAEnabled ? (
                isSuperadmin ? (
                  <button
                    type="button"
                    className="btn-secondary h-8.5 px-3.5 text-xs font-medium opacity-50 cursor-not-allowed"
                    title="O 2FA é obrigatório para contas com perfil Superadministrador"
                    disabled
                  >
                    Desativar 2FA
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary h-8.5 px-3.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 active:scale-[0.985] transition-all duration-150"
                    onClick={() => {
                      setMfaDisable({ password: "", code: "" });
                      setDisableOpen(true);
                    }}
                  >
                    Desativar 2FA
                  </button>
                )
              ) : (
                <button
                  type="button"
                  className="btn-primary h-8.5 px-4 text-xs font-medium bg-violet-600 hover:bg-violet-700 active:scale-[0.985] text-white transition-all duration-150"
                  disabled={mfaSetupMutation.isPending}
                  onClick={() => mfaSetupMutation.mutate()}
                >
                  {mfaSetupMutation.isPending ? "Iniciando…" : "Configurar 2FA"}
                </button>
              )
            }
          />
        </div>
      </AccountCard>

      {/* ── Modal de Alteração de Senha ── */}
      <Modal
        open={pwdOpen}
        onClose={() => setPwdOpen(false)}
        title="Alterar senha de acesso"
        size="md"
        preventBackdropClose
      >
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            setPwdError(null);
            if (!isPwdValid || changePassword.isPending) return;
            changePassword.mutate();
          }}
          className="space-y-4 pt-1"
        >
          <div>
            <label className="label text-xs font-medium text-ink-secondary dark:text-zinc-300" htmlFor="pwd-current">
              Senha atual
            </label>
            <div className="relative mt-1.5">
              <input
                id="pwd-current"
                type={showPwd.current ? "text" : "password"}
                required
                value={pwd.current}
                onChange={(e) => {
                  setPwd((p) => ({ ...p, current: e.target.value }));
                  setPwdError(null);
                }}
                className="input h-9.5 pr-10 text-xs sm:text-[13px] w-full"
                placeholder="Digite sua senha atual"
              />
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors p-1"
                onClick={() => setShowPwd((s) => ({ ...s, current: !s.current }))}
                tabIndex={-1}
                aria-label={showPwd.current ? "Ocultar senha atual" : "Mostrar senha atual"}
              >
                {showPwd.current ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="label text-xs font-medium text-ink-secondary dark:text-zinc-300" htmlFor="pwd-next">
              Nova senha
            </label>
            <div className="relative mt-1.5">
              <input
                id="pwd-next"
                type={showPwd.next ? "text" : "password"}
                required
                minLength={8}
                value={pwd.next}
                onChange={(e) => {
                  setPwd((p) => ({ ...p, next: e.target.value }));
                  setPwdError(null);
                }}
                className="input h-9.5 pr-10 text-xs sm:text-[13px] w-full"
                placeholder="Mínimo de 8 caracteres"
              />
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors p-1"
                onClick={() => setShowPwd((s) => ({ ...s, next: !s.next }))}
                tabIndex={-1}
                aria-label={showPwd.next ? "Ocultar nova senha" : "Mostrar nova senha"}
              >
                {showPwd.next ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1 text-[11.5px] text-zinc-500 dark:text-zinc-400">
              Use pelo menos 8 caracteres.
            </p>
          </div>

          <div>
            <label className="label text-xs font-medium text-ink-secondary dark:text-zinc-300" htmlFor="pwd-confirm">
              Confirmar nova senha
            </label>
            <div className="relative mt-1.5">
              <input
                id="pwd-confirm"
                type={showPwd.confirm ? "text" : "password"}
                required
                value={pwd.confirm}
                onChange={(e) => {
                  setPwd((p) => ({ ...p, confirm: e.target.value }));
                  setPwdError(null);
                }}
                className={cn(
                  "input h-9.5 pr-10 text-xs sm:text-[13px] w-full",
                  pwd.confirm && pwd.next !== pwd.confirm && "border-rose-500 focus:border-rose-500"
                )}
                placeholder="Repita a nova senha"
              />
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors p-1"
                onClick={() => setShowPwd((s) => ({ ...s, confirm: !s.confirm }))}
                tabIndex={-1}
                aria-label={showPwd.confirm ? "Ocultar confirmação" : "Mostrar confirmação"}
              >
                {showPwd.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {pwd.confirm && pwd.next !== pwd.confirm ? (
              <p className="mt-1 text-[11.5px] text-rose-600 dark:text-rose-400">
                As senhas não coincidem.
              </p>
            ) : null}
          </div>

          {pwdError ? (
            <div className="rounded-xl bg-rose-500/10 p-2.5 text-xs text-rose-700 dark:text-rose-300 border border-rose-500/20">
              {pwdError}
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-4 border-t border-black/[0.06] dark:border-white/[0.08]">
            <button
              type="button"
              className="btn-secondary h-8.5 px-3 text-xs font-medium"
              onClick={() => setPwdOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary h-8.5 px-4 text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!isPwdValid || changePassword.isPending}
            >
              {changePassword.isPending ? "Atualizando senha…" : "Atualizar senha"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Modal de Configuração de 2FA (QR Code & Chave Manual) ── */}
      <Modal
        open={manageOpen && Boolean(mfaSetup)}
        onClose={() => {
          setManageOpen(false);
          setMfaError(null);
        }}
        title="Ativar autenticação em duas etapas (2FA)"
        size="md"
        preventBackdropClose
      >
        <div className="space-y-4 text-xs text-ink-muted dark:text-zinc-300">
          <p className="leading-relaxed">
            1. Escaneie o QR Code abaixo com seu app autenticador (Google Authenticator, Microsoft Authenticator, 1Password):
          </p>

          {mfaSetup?.qrDataUrl ? (
            <div className="flex justify-center p-3 rounded-2xl bg-white border border-black/[0.08] shadow-xs max-w-fit mx-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mfaSetup.qrDataUrl}
                alt="QR Code 2FA"
                className="h-36 w-36 rounded-xl object-contain"
              />
            </div>
          ) : null}

          <div>
            <p className="mb-1.5 font-medium text-ink dark:text-zinc-200">
              Ou digite a chave manualmente:
            </p>
            <div className="flex items-center gap-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] p-2 border border-black/[0.06] dark:border-white/[0.06]">
              <code className="flex-1 font-mono text-[11.5px] text-violet-700 dark:text-violet-300 select-all truncate px-1">
                {mfaSetup?.secret}
              </code>
              <button
                type="button"
                className="btn-ghost h-7.5 px-2.5 text-xs font-medium gap-1 text-zinc-600 dark:text-zinc-300"
                onClick={handleCopyKey}
                title="Copiar chave"
              >
                {copiedKey ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span className="text-[11px]">Copiar</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="pt-2">
            <label className="label text-xs font-medium text-ink dark:text-zinc-200" htmlFor="mfa-verify-code">
              2. Digite o código de 6 dígitos gerado no app:
            </label>
            <input
              id="mfa-verify-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={mfaCode}
              onChange={(e) => {
                setMfaCode(e.target.value.replace(/\D/g, ""));
                setMfaError(null);
              }}
              placeholder="000000"
              className={cn(
                "input h-10 tracking-[0.25em] text-center text-base font-mono font-bold mt-1.5 w-full",
                mfaError && "border-rose-500 focus:border-rose-500"
              )}
            />
            {mfaError ? (
              <p className="mt-1.5 text-[11.5px] text-rose-600 dark:text-rose-400">
                {mfaError}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-black/[0.06] dark:border-white/[0.08]">
            <button
              type="button"
              className="btn-secondary h-8.5 px-3 text-xs font-medium"
              onClick={() => {
                setManageOpen(false);
                setMfaError(null);
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary h-8.5 px-4 text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={mfaCode.length !== 6 || mfaEnableMutation.isPending}
              onClick={() => mfaEnableMutation.mutate()}
            >
              {mfaEnableMutation.isPending ? "Verificando…" : "Verificar e ativar"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Modal de Códigos de Recuperação (Backup Codes) ── */}
      <Modal
        open={Boolean(backupCodes && backupCodes.length > 0)}
        onClose={() => {}}
        title="Códigos de recuperação de emergência"
        size="md"
      >
        <div className="space-y-4 text-xs text-ink-muted dark:text-zinc-300">
          <div className="rounded-xl bg-amber-500/10 p-3 border border-amber-500/20 text-amber-800 dark:text-amber-300 leading-relaxed">
            <strong>Importante:</strong> Guarde estes códigos em local seguro. Cada código permite acessar a conta caso você perca o celular ou app autenticador.
          </div>

          <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] font-mono text-center text-xs font-semibold text-ink dark:text-zinc-100">
            {backupCodes?.map((code, i) => (
              <div key={i} className="py-1 px-2 rounded-lg bg-black/[0.02] dark:bg-white/[0.03] select-all">
                {code}
              </div>
            ))}
          </div>

          <div className="flex justify-center">
            <button
              type="button"
              className="btn-secondary h-8 px-3 text-xs font-medium gap-1.5"
              onClick={handleDownloadBackupCodes}
            >
              <Download className="h-3.5 w-3.5" />
              <span>Baixar arquivo .txt</span>
            </button>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer pt-2">
            <input
              type="checkbox"
              checked={backupCodesAck}
              onChange={(e) => setBackupCodesAck(e.target.checked)}
              className="h-4 w-4 rounded mt-0.5 accent-violet-600"
            />
            <span className="text-[11.5px] font-medium text-ink dark:text-zinc-200">
              Confirmo que salvei e guardei meus códigos de recuperação com segurança.
            </span>
          </label>

          <div className="flex justify-end pt-4 border-t border-black/[0.06] dark:border-white/[0.08]">
            <button
              type="button"
              className="btn-primary h-8.5 px-4 text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white"
              disabled={!backupCodesAck}
              onClick={confirmBackupCodesAndContinue}
            >
              Concluir e continuar
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Modal de Desativação de 2FA ── */}
      <Modal
        open={disableOpen}
        onClose={() => setDisableOpen(false)}
        title="Desativar autenticação em duas etapas"
        size="md"
        preventBackdropClose
      >
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            mfaDisableMutation.mutate();
          }}
          className="space-y-4 pt-1"
        >
          <p className="text-xs text-ink-muted dark:text-zinc-300 leading-relaxed">
            Para sua segurança, informe sua senha de acesso e o código de 6 dígitos atual para confirmar a desativação do 2FA.
          </p>

          <div>
            <label className="label text-xs font-medium text-ink-secondary dark:text-zinc-300" htmlFor="dis-pwd">
              Sua senha
            </label>
            <div className="relative mt-1.5">
              <input
                id="dis-pwd"
                type={showDisablePwd ? "text" : "password"}
                required
                value={mfaDisable.password}
                onChange={(e) => setMfaDisable((p) => ({ ...p, password: e.target.value }))}
                className="input h-9.5 pr-10 text-xs sm:text-[13px] w-full"
                placeholder="Digite sua senha de acesso"
              />
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors p-1"
                onClick={() => setShowDisablePwd((s) => !s)}
                tabIndex={-1}
                aria-label={showDisablePwd ? "Ocultar senha" : "Mostrar senha"}
              >
                {showDisablePwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="label text-xs font-medium text-ink-secondary dark:text-zinc-300" htmlFor="dis-code">
              Código de 6 dígitos do app
            </label>
            <input
              id="dis-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={mfaDisable.code}
              onChange={(e) => setMfaDisable((p) => ({ ...p, code: e.target.value.replace(/\D/g, "") }))}
              className="input h-9.5 text-xs sm:text-[13px] mt-1.5 w-full font-mono tracking-widest text-center"
              placeholder="000000"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-black/[0.06] dark:border-white/[0.08]">
            <button
              type="button"
              className="btn-secondary h-8.5 px-3 text-xs font-medium"
              onClick={() => setDisableOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary h-8.5 px-4 text-xs font-medium bg-red-600 hover:bg-red-700 text-white"
              disabled={mfaDisable.code.length !== 6 || !mfaDisable.password || mfaDisableMutation.isPending}
            >
              {mfaDisableMutation.isPending ? "Desativando…" : "Confirmar desativação"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
