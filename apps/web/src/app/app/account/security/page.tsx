"use client";

import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  KeyRound,
  Lock,
  QrCode,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Modal, Spinner, useToast } from "@/components/ui";
import { useAuth } from "@/store/auth";
import {
  AccountBody,
  AccountCard,
  AccountCardHeader,
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
  const [mfaSetup, setMfaSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [backupCodesAck, setBackupCodesAck] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [mfaDisable, setMfaDisable] = useState({ password: "", code: "" });
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
      setPwdOpen(false);
      toast({
        kind: "success",
        title: "Senha alterada com sucesso.",
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
      setManageOpen(false);
      toast({
        kind: "success",
        title: "Autenticação em duas etapas ativada!",
        description: "Guarde seus códigos de recuperação em local seguro.",
      });
      void qc.invalidateQueries({ queryKey: ["mfa-status"] });
    },
    onError: (e: Error) => toast({ kind: "error", title: "Código de 6 dígitos inválido", description: e.message }),
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

  return (
    <div className="space-y-6">
      {/* ── 1. Resumo de Segurança da Conta ── */}
      <AccountCard>
        <AccountCardHeader
          title="Credenciais e autenticação"
          subtitle="Controle suas chaves de acesso, senhas e métodos de verificação de identidade"
          icon={Shield}
        />

        {/* Linha 1: Senha de Acesso */}
        <AccountRow
          icon={KeyRound}
          title="Senha de acesso"
          description="Utilizada para autenticação principal em todos os seus navegadores e dispositivos."
          control={
            <button
              type="button"
              className="btn-secondary h-8.5 px-3.5 text-xs font-medium"
              onClick={() => setPwdOpen(true)}
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
            description={
              <div className="space-y-2">
                <p>
                  Exige um código gerado por aplicativo autenticador (Google Authenticator, 1Password, etc.) ao entrar.
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  {mfaStatus.isLoading ? (
                    <Spinner className="h-4 w-4" />
                  ) : is2FAEnabled ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 dark:bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} />
                      Ativada
                    </span>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 dark:bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="h-3 w-3" strokeWidth={2} />
                        Desativada
                      </span>
                      {isSuperadmin ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                          <ShieldAlert className="h-3.5 w-3.5" />
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
                <button
                  type="button"
                  className="btn-secondary h-8.5 px-3.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10"
                  onClick={() => setDisableOpen(true)}
                >
                  Desativar 2FA
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary h-8.5 px-4 text-xs font-medium bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500 shadow-xs shadow-violet-500/25"
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
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (pwd.next !== pwd.confirm) {
              toast({ kind: "error", title: "A confirmação de senha não confere." });
              return;
            }
            if (pwd.next.length < 8) {
              toast({ kind: "error", title: "A nova senha deve ter no mínimo 8 caracteres." });
              return;
            }
            changePassword.mutate();
          }}
          className="space-y-4 pt-1"
        >
          <div>
            <label className="label text-xs font-medium text-ink-secondary dark:text-zinc-300" htmlFor="pwd-current">
              Senha atual
            </label>
            <input
              id="pwd-current"
              type="password"
              required
              value={pwd.current}
              onChange={(e) => setPwd((p) => ({ ...p, current: e.target.value }))}
              className="input h-9 text-xs sm:text-[13px] mt-1.5 w-full"
              placeholder="Digite sua senha atual"
            />
          </div>

          <div>
            <label className="label text-xs font-medium text-ink-secondary dark:text-zinc-300" htmlFor="pwd-next">
              Nova senha
            </label>
            <input
              id="pwd-next"
              type="password"
              required
              minLength={8}
              value={pwd.next}
              onChange={(e) => setPwd((p) => ({ ...p, next: e.target.value }))}
              className="input h-9 text-xs sm:text-[13px] mt-1.5 w-full"
              placeholder="Mínimo de 8 caracteres"
            />
          </div>

          <div>
            <label className="label text-xs font-medium text-ink-secondary dark:text-zinc-300" htmlFor="pwd-confirm">
              Confirmar nova senha
            </label>
            <input
              id="pwd-confirm"
              type="password"
              required
              value={pwd.confirm}
              onChange={(e) => setPwd((p) => ({ ...p, confirm: e.target.value }))}
              className="input h-9 text-xs sm:text-[13px] mt-1.5 w-full"
              placeholder="Repita a nova senha"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-black/[0.06] dark:border-white/[0.08]">
            <button
              type="button"
              className="btn-secondary h-8.5 px-3 text-xs"
              onClick={() => setPwdOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary h-8.5 px-4 text-xs bg-violet-600 hover:bg-violet-700"
              disabled={changePassword.isPending}
            >
              {changePassword.isPending ? "Salvando…" : "Atualizar senha"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Modal de Configuração de 2FA (QR Code & Chave Manual) ── */}
      <Modal
        open={manageOpen && Boolean(mfaSetup)}
        onClose={() => setManageOpen(false)}
        title="Ativar autenticação em duas etapas (2FA)"
      >
        <div className="space-y-4 text-xs text-ink-muted dark:text-zinc-300">
          <p>
            1. Escaneie o QR Code abaixo com seu app autenticador (Google Authenticator, Microsoft Authenticator, 1Password):
          </p>

          {mfaSetup?.qrDataUrl ? (
            <div className="flex justify-center p-3 rounded-2xl bg-white border border-black/[0.08] shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mfaSetup.qrDataUrl}
                alt="QR Code 2FA"
                className="h-44 w-44 rounded-xl object-contain"
              />
            </div>
          ) : null}

          <div>
            <p className="mb-1.5 font-medium text-ink dark:text-zinc-200">
              Ou digite a chave manualmente:
            </p>
            <div className="flex items-center gap-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] p-2 border border-black/[0.06] dark:border-white/[0.06]">
              <code className="flex-1 font-mono text-[11px] text-violet-700 dark:text-violet-300 select-all truncate">
                {mfaSetup?.secret}
              </code>
              <button
                type="button"
                className="btn-ghost h-7 px-2 text-xs"
                onClick={handleCopyKey}
                title="Copiar chave"
              >
                {copiedKey ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
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
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="input h-10 tracking-[0.25em] text-center text-base font-mono font-bold mt-1.5 w-full"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-black/[0.06] dark:border-white/[0.08]">
            <button
              type="button"
              className="btn-secondary h-8.5 px-3 text-xs"
              onClick={() => setManageOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary h-8.5 px-4 text-xs bg-violet-600 hover:bg-violet-700"
              disabled={mfaCode.length !== 6 || mfaEnableMutation.isPending}
              onClick={() => mfaEnableMutation.mutate()}
            >
              {mfaEnableMutation.isPending ? "Validando…" : "Ativar 2FA"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Modal de Códigos de Recuperação (Backup Codes) ── */}
      <Modal
        open={Boolean(backupCodes && backupCodes.length > 0)}
        onClose={() => {}}
        title="Códigos de recuperação de emergência"
      >
        <div className="space-y-4 text-xs text-ink-muted dark:text-zinc-300">
          <div className="rounded-xl bg-amber-500/10 p-3 border border-amber-500/20 text-amber-700 dark:text-amber-300 leading-relaxed">
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
              className="btn-secondary h-8 px-3 text-xs gap-1.5"
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
              className="btn-primary h-8.5 px-4 text-xs bg-violet-600 hover:bg-violet-700"
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
      >
        <form
          onSubmit={(e) => {
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
            <input
              id="dis-pwd"
              type="password"
              required
              value={mfaDisable.password}
              onChange={(e) => setMfaDisable((p) => ({ ...p, password: e.target.value }))}
              className="input h-9 text-xs sm:text-[13px] mt-1.5 w-full"
              placeholder="Digite sua senha de acesso"
            />
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
              className="input h-9 text-xs sm:text-[13px] mt-1.5 w-full font-mono"
              placeholder="000000"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-black/[0.06] dark:border-white/[0.08]">
            <button
              type="button"
              className="btn-secondary h-8.5 px-3 text-xs"
              onClick={() => setDisableOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary h-8.5 px-4 text-xs bg-red-600 hover:bg-red-700"
              disabled={mfaDisableMutation.isPending}
            >
              {mfaDisableMutation.isPending ? "Desativando…" : "Confirmar desativação"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
