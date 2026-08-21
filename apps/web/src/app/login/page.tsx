"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Logo } from "@/components/brand/logo";
import { AuthShowcase } from "@/components/auth/auth-showcase";
import {
  AuthTransition,
  markAppEntrance,
  type AuthTransitionMode,
} from "@/components/auth/auth-transition";
import { useQuery } from "@tanstack/react-query";
import { MaintenanceScreen } from "@/components/maintenance/maintenance-screen";
import { needsCompanyOnboarding } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import type { TenantInfo } from "@/store/auth";

/** Confirm → overlay → exit — total ideal ~1.0–1.6s */
const T_CONFIRM_MS = 280;
const T_OVERLAY_MS = 900;
const T_EXIT_MS = 380;
const T_OVERLAY_FIRST_MS = 1100;
const T_EXIT_FIRST_MS = 420;

type Phase = "idle" | "confirm" | "overlay" | "exit";
type View =
  | "login"
  | "mfa"
  | "invite"
  | "forgot"
  | "reset"
  | "forgot-sent"
  | "reset-done"
  | "link-invalid";

export default function LoginPage() {
  const router = useRouter();
  const { user, tenant, hydrated, setSession } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [view, setView] = useState<View>("login");
  const [transitionMode, setTransitionMode] = useState<AuthTransitionMode>("login-return");
  const [welcomePerson, setWelcomePerson] = useState("");
  const [welcomeCompany, setWelcomeCompany] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [shake, setShake] = useState(false);
  const [focused, setFocused] = useState<"email" | "password" | "mfa" | "invite-pass" | null>(null);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaRecovery, setMfaRecovery] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteName, setInviteName] = useState("");
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [capsLock, setCapsLock] = useState(false);
  const [showSuperadminLogin, setShowSuperadminLogin] = useState(false);

  const maintenance = useQuery({
    queryKey: ["public-maintenance-status"],
    queryFn: () =>
      api<{
        enabled: boolean;
        title?: string;
        message?: string;
        estimatedEnd?: string | null;
      }>("/system/maintenance/status"),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const inFlow = phase !== "idle";

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.location.search.includes("admin=1")) {
        setShowSuperadminLogin(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!hydrated || !user || inFlow || inviteToken || view === "reset") return;
    if (user.platformRole === "SUPERADMIN" && !tenant) {
      router.replace("/admin");
      return;
    }
    if (needsCompanyOnboarding(tenant)) router.replace("/app/onboarding");
    else router.replace("/app");
  }, [hydrated, user, tenant, router, inFlow, inviteToken, view]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("nexaflow_login_email");
      if (saved) {
        setEmail(saved);
      }
      const sp = new URLSearchParams(window.location.search);
      const inv = sp.get("invite");
      if (inv) {
        setInviteToken(inv);
        setView("invite");
      }
      const reset = sp.get("reset");
      if (reset) {
        setResetToken(reset);
        setView("reset");
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (mfaToken) setView("mfa");
  }, [mfaToken]);

  const canSubmit = useMemo(() => {
    if (loading || inFlow) return false;
    if (view === "invite") return password.length >= 10;
    if (view === "mfa") {
      const code = mfaCode.replace(/\s/g, "");
      return mfaRecovery ? code.length >= 8 : code.length >= 6;
    }
    if (view === "forgot") return email.trim().includes("@");
    if (view === "reset")
      return password.length >= 10 && password === password2;
    if (view === "forgot-sent" || view === "reset-done" || view === "link-invalid")
      return false;
    return email.trim().length > 3 && password.length >= 6;
  }, [email, password, password2, loading, inFlow, mfaCode, mfaRecovery, view]);

  function humanLoginError(msg: string, context?: View, code?: string) {
    if (code === "AUTH_FIRST_ACCESS_REQUIRED") {
      return "Esta conta ainda precisa definir a senha. Use o link enviado por e-mail ou clique em Esqueci minha senha.";
    }
    const m = msg.toLowerCase();
    if (m.includes("origin") || m.includes("csrf"))
      return "Não foi possível validar a sessão. Recarregue a página e tente de novo.";
    if (context === "mfa" || m.includes("código") || m.includes("code"))
      return "Código inválido. Tente novamente.";
    if (m.includes("definir a senha") || m.includes("primeiro acesso") || m.includes("esqueci minha senha"))
      return "Esta conta ainda precisa definir a senha. Use o link enviado por e-mail ou clique em Esqueci minha senha.";
    if (m.includes("credencial") || m.includes("senha") || m.includes("inválid") || m.includes("invalid"))
      return "E-mail ou senha incorretos.";
    if (m.includes("network") || m.includes("fetch") || m.includes("failed"))
      return "Não foi possível conectar. Verifique sua internet.";
    if (m.includes("rate") || m.includes("muitas") || m.includes("too many"))
      return "Muitas tentativas. Aguarde um momento e tente novamente.";
    if (m.includes("expirado") || m.includes("expired"))
      return "Link expirado. Solicite um novo link para redefinir sua senha.";
    if (m.includes("bloquead") || m.includes("suspend") || m.includes("disabled"))
      return "Acesso temporariamente indisponível. Fale com o responsável pela empresa.";
    return msg || "Não foi possível entrar. Tente de novo em instantes.";
  }

  type LoginOk = {
    token?: string;
    accessToken?: string;
    mfaRequired?: boolean;
    mfaToken?: string;
    mustChangePassword?: boolean;
    resetToken?: string;
    message?: string;
    user?: {
      id: string;
      email: string;
      name: string;
      platformRole?: string | null;
    };
    tenant?: TenantInfo | null;
    memberships?: Array<{
      tenantId: string;
      role: string;
      tenant: TenantInfo;
    }>;
    security?: {
      mfaEnabled?: boolean;
      mfaRequiredForAdmin?: boolean;
      mfaBootstrap?: boolean;
    };
  };

  function finishLogin(data: LoginOk) {
    if (!data.user) return;
    localStorage.setItem("nexaflow_login_email", email.trim().toLowerCase());

    const isSuperAdmin = data.user.platformRole === "SUPERADMIN";
    const tenantForSession = isSuperAdmin ? null : data.tenant ?? null;
    const membershipsForSession = isSuperAdmin ? [] : data.memberships || [];
    const firstAccess = !isSuperAdmin && needsCompanyOnboarding(tenantForSession);
    const needsMfaBootstrap = Boolean(data.security?.mfaBootstrap);
    const toAdmin = isSuperAdmin && !needsMfaBootstrap;

    let dest = "/app";
    if (firstAccess) dest = "/app/onboarding";
    else if (needsMfaBootstrap) dest = "/app/account/security";
    else if (toAdmin) dest = "/admin";

    const person = (data.user?.name || "").trim();
    const company = isSuperAdmin
      ? ""
      : (tenantForSession?.name || data.memberships?.[0]?.tenant?.name || "").trim();

    setTransitionMode(firstAccess ? "login-first" : "login-return");
    setWelcomePerson(person);
    setWelcomeCompany(company);
    if (!firstAccess && !toAdmin) markAppEntrance("return");
    if (firstAccess) {
      try {
        sessionStorage.setItem("nexaflow_from_login", "1");
      } catch {
        /* ignore */
      }
    }

    try {
      sessionStorage.removeItem("nexaflow_impersonating");
    } catch {
      /* ignore */
    }

    const access = data.accessToken || data.token || "";
    setSession({
      token: access,
      user: data.user,
      tenant: tenantForSession,
      memberships: membershipsForSession,
    });

    setLoading(false);
    setMfaToken(null);
    setMfaCode("");
    setPhase("confirm");

    const overlayMs = firstAccess ? T_OVERLAY_FIRST_MS : T_OVERLAY_MS;
    const exitMs = firstAccess ? T_EXIT_FIRST_MS : T_EXIT_MS;

    window.setTimeout(() => setPhase("overlay"), T_CONFIRM_MS);
    window.setTimeout(() => setPhase("exit"), T_CONFIRM_MS + overlayMs);
    window.setTimeout(() => router.replace(dest), T_CONFIRM_MS + overlayMs + exitMs);
  }

  function flashError(message: string, context?: View, code?: string) {
    const m = message.toLowerCase();
    if (
      (context === "reset" || view === "reset") &&
      (m.includes("expir") || m.includes("inválid") || m.includes("invalid") || m.includes("token"))
    ) {
      setView("link-invalid");
      setError("");
      setLoading(false);
      return;
    }
    setError(humanLoginError(message, context || view, code));
    setShake(true);
    setTimeout(() => setShake(false), 450);
    setLoading(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    if (view === "forgot") {
      setLoading(true);
      setError("");
      setInfo("");
      try {
        const data = await api<{ message?: string }>("/auth/forgot-password", {
          method: "POST",
          json: { email: email.trim().toLowerCase() },
        });
        setInfo(
          data.message ||
            "Se houver uma conta vinculada ao endereço informado, você receberá as instruções para redefinir sua senha."
        );
        setView("forgot-sent");
        setLoading(false);
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Não foi possível enviar o e-mail";
        flashError(message);
      }
      return;
    }

    if (view === "reset" && resetToken) {
      if (password !== password2) {
        flashError("As senhas não coincidem.", "reset");
        return;
      }
      setLoading(true);
      setError("");
      try {
        await api("/auth/reset-password", {
          method: "POST",
          json: { token: resetToken, password },
        });
        setResetToken(null);
        try {
          window.history.replaceState({}, "", "/login");
        } catch {
          /* ignore */
        }
        if (email.includes("@")) {
          const data = await api<LoginOk>("/auth/login", {
            method: "POST",
            json: { email: email.trim().toLowerCase(), password },
          });
          if (data.mustChangePassword && data.resetToken) {
            setResetToken(data.resetToken);
            setPassword("");
            setPassword2("");
            setView("reset");
            setLoading(false);
            return;
          }
          if (data.accessToken || data.token) {
            finishLogin(data);
            return;
          }
        }
        setPassword("");
        setPassword2("");
        setView("reset-done");
        setLoading(false);
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Não foi possível redefinir a senha";
        flashError(message, "reset");
      }
      return;
    }

    if (view === "invite" && inviteToken) {
      setLoading(true);
      setError("");
      try {
        const data = await api<LoginOk>("/auth/accept-invite", {
          method: "POST",
          json: {
            token: inviteToken,
            password,
            name: inviteName || undefined,
          },
        });
        setInviteToken(null);
        finishLogin(data);
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Convite inválido";
        flashError(message);
      }
      return;
    }

    if (view === "mfa" && mfaToken) {
      setLoading(true);
      setError("");
      try {
        const data = await api<LoginOk>("/auth/mfa/verify", {
          method: "POST",
          json: { mfaToken, code: mfaCode.replace(/\s/g, "") },
        });
        if (data.mustChangePassword && data.resetToken) {
          setResetToken(data.resetToken);
          setPassword("");
          setPassword2("");
          setInfo(
            data.message ||
              "Senha temporária aceita. Defina agora a senha definitiva para entrar."
          );
          setView("reset");
          setMfaToken(null);
          setLoading(false);
          return;
        }
        finishLogin(data);
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Código inválido";
        flashError(message, "mfa");
      }
      return;
    }

    if (!email.includes("@")) {
      flashError("Informe um e-mail válido.");
      return;
    }
    if (password.length < 6) {
      flashError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    setLoading(true);
    setError("");
    setShake(false);

    try {
      const data = await api<LoginOk>("/auth/login", {
        method: "POST",
        json: { email: email.trim().toLowerCase(), password },
      });

      if (data.mfaRequired && data.mfaToken) {
        setMfaToken(data.mfaToken);
        setView("mfa");
        setLoading(false);
        return;
      }

      if (data.mustChangePassword && data.resetToken) {
        setResetToken(data.resetToken);
        setPassword("");
        setPassword2("");
        setInfo(
          data.message ||
            "Senha temporária aceita. Defina agora a senha definitiva para entrar."
        );
        setView("reset");
        setLoading(false);
        return;
      }

      finishLogin(data);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Não foi possível entrar";
      flashError(message, view, err instanceof ApiError ? err.code : undefined);
    }
  }

  function onKeyCaps(e: KeyboardEvent) {
    if (typeof e.getModifierState === "function") {
      setCapsLock(e.getModifierState("CapsLock"));
    }
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[#07060f]">
        <Logo variant="full-white" size="md" withAi />
        <div className="h-1 w-28 overflow-hidden rounded-full bg-white/10">
          <div className="nf-auth-transition-bar h-full w-full origin-left rounded-full bg-gradient-to-r from-indigo-400 to-violet-500" />
        </div>
        <p className="text-[12px] text-white/30">Carregando…</p>
      </div>
    );
  }

  const coverLogin = phase === "overlay" || phase === "exit";

  const title =
    view === "invite"
      ? "Aceitar convite"
      : view === "mfa"
        ? "Verificação em duas etapas"
        : view === "forgot"
          ? "Recuperar acesso"
          : view === "forgot-sent"
            ? "Verifique seu e-mail"
            : view === "reset"
              ? "Criar nova senha"
              : view === "reset-done"
                ? "Senha atualizada"
                : view === "link-invalid"
                  ? "Link inválido"
                  : "Bem-vindo de volta";

  const subtitle =
    view === "invite"
      ? "Defina sua senha para entrar na equipe."
      : view === "mfa"
        ? mfaRecovery
          ? "Digite um dos códigos de recuperação."
          : "Digite o código do aplicativo autenticador."
        : view === "forgot"
          ? "Digite o e-mail da sua conta."
          : view === "forgot-sent"
            ? undefined
            : view === "reset"
              ? "A senha temporária foi aceita. Defina a senha definitiva (mínimo 10 caracteres) para entrar."
              : view === "reset-done"
                ? "Você já pode entrar com a nova senha."
                : view === "link-invalid"
                  ? "Solicite um novo link para redefinir sua senha."
                  : undefined;

  const ctaLabel =
    view === "invite"
      ? "Criar senha e entrar"
      : view === "mfa"
        ? "Verificar"
        : view === "forgot"
          ? "Enviar link"
          : view === "reset"
            ? "Salvar nova senha"
            : "Entrar";

  if (
    maintenance.data?.enabled &&
    !showSuperadminLogin &&
    view === "login" &&
    !inviteToken &&
    !resetToken
  ) {
    return (
      <MaintenanceScreen
        title={maintenance.data.title}
        message={maintenance.data.message}
        estimatedEnd={maintenance.data.estimatedEnd}
        onSuperadminLogin={() => setShowSuperadminLogin(true)}
        onClearMaintenance={() => void maintenance.refetch()}
      />
    );
  }

  return (
    <div
      className={cn(
        "relative min-h-[100dvh] overflow-hidden bg-[#07060f]",
        "grid lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)] xl:grid-cols-[minmax(0,1.1fr)_minmax(440px,0.9fr)]"
      )}
    >
      {(phase === "overlay" || phase === "exit") && (
        <AuthTransition
          mode={transitionMode}
          stage={phase === "exit" ? "exit" : "prepare"}
          personName={welcomePerson}
          companyName={welcomeCompany}
        />
      )}

      <AuthShowcase
        variant="login"
        className={cn(coverLogin && "nf-login-under-overlay")}
      />

      <div
        className={cn(
          "relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-5 py-8 sm:px-8 lg:px-10 lg:py-10",
          coverLogin && "nf-login-under-overlay"
        )}
      >
        {/* fundo direito — mesma família cromática da esquerda */}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute inset-0 bg-[#07060f]" />
          <div className="absolute inset-0 bg-gradient-to-bl from-[#0c0a1c] via-[#07060f] to-[#05040c]" />
          <div className="absolute -right-20 top-[10%] h-[340px] w-[340px] rounded-full bg-violet-600/[0.1] blur-[90px]" />
          <div className="absolute -left-24 bottom-[5%] h-[260px] w-[260px] rounded-full bg-indigo-700/[0.08] blur-[70px]" />
          <div
            className="absolute inset-0 opacity-[0.025]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
              backgroundSize: "52px 52px",
            }}
          />
          {/* soft join from left column */}
          <div className="absolute inset-y-0 left-0 hidden w-20 bg-gradient-to-r from-[#07060f]/80 to-transparent lg:block" />
        </div>

        <div
          className={cn(
            "relative w-full max-w-[400px] sm:max-w-[420px] lg:max-w-[440px] transition-[opacity,transform] duration-200",
            inFlow && "nf-auth-form-dim"
          )}
        >
          {/* mobile brand */}
          <div className="nf-anim-up mb-8 flex flex-col items-center lg:hidden">
            <Logo variant="full-white" size="md" withAi />
          </div>

          {maintenance.data?.enabled && (
            <div className="mb-4 flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                <span>Modo de manutenção ativo (Acesso exclusivo Superadmin)</span>
              </div>
              <button
                type="button"
                onClick={() => setShowSuperadminLogin(false)}
                className="text-[11px] underline hover:text-white"
              >
                Ver tela de manutenção
              </button>
            </div>
          )}

          <div
            className={cn(
              "nf-anim-up nf-delay-1 nf-login-glass relative overflow-hidden rounded-2xl border border-white/[0.1]",
              "px-7 py-8 sm:px-9 sm:py-9",
              "shadow-[0_32px_80px_-32px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.03),inset_0_1px_0_0_rgba(255,255,255,0.07)]",
              shake && "nf-shake",
              phase === "confirm" && "border-emerald-400/30"
            )}
          >
            <div className="relative mb-6">
              {(view === "forgot" ||
                view === "forgot-sent" ||
                view === "mfa" ||
                view === "reset" ||
                view === "reset-done" ||
                view === "link-invalid") && (
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setInfo("");
                    setMfaToken(null);
                    setMfaCode("");
                    setMfaRecovery(false);
                    setPassword2("");
                    setView("login");
                    if (view === "reset" || view === "link-invalid") {
                      try {
                        window.history.replaceState({}, "", "/login");
                      } catch {
                        /* ignore */
                      }
                      setResetToken(null);
                    }
                  }}
                  className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-white/50 transition-colors hover:text-white/85"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Voltar
                </button>
              )}

              <h1 className="font-display text-[1.65rem] font-semibold tracking-[-0.035em] text-white sm:text-[1.8rem]">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-2 text-[14px] leading-relaxed text-white/50">{subtitle}</p>
              ) : view === "login" ? (
                <p className="mt-2 text-[14px] leading-relaxed text-white/50">
                  Acesse sua conta para continuar.
                </p>
              ) : null}
            </div>

            {view === "forgot-sent" ? (
              <div className="relative space-y-5">
                <div className="flex flex-col items-center px-2 py-4 text-center">
                  <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.06] text-white/70 ring-1 ring-white/10">
                    <Mail className="h-5 w-5" strokeWidth={1.6} />
                  </span>
                  <p className="text-[13.5px] leading-relaxed text-white/55">
                    {info ||
                      "Se houver uma conta vinculada ao endereço informado, você receberá as instruções para redefinir sua senha."}
                  </p>
                  <p className="mt-2 text-[12px] text-white/35">O link expira em 30 minutos.</p>
                </div>
                <button
                  type="button"
                  className="nf-login-cta flex h-[3.15rem] w-full items-center justify-center gap-2 rounded-xl bg-[#6D5EF5] text-[15px] font-semibold text-white shadow-[0_12px_28px_-10px_rgba(109,94,245,0.55)] transition-[background,transform,box-shadow] duration-150 hover:bg-[#7B6CF7] active:scale-[0.99]"
                  onClick={() => {
                    setView("login");
                    setInfo("");
                  }}
                >
                  Voltar para entrar
                </button>
              </div>
            ) : view === "reset-done" ? (
              <div className="space-y-5">
                <div className="flex flex-col items-center px-2 py-4 text-center">
                  <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/25">
                    <Check className="h-5 w-5" strokeWidth={2} />
                  </span>
                  <p className="text-[13.5px] text-white/50">
                    Sua senha foi redefinida com sucesso.
                  </p>
                </div>
                <button
                  type="button"
                  className="nf-login-cta flex h-[3.1rem] w-full items-center justify-center rounded-xl bg-[#6D5EF5] text-[15px] font-semibold text-white shadow-[0_12px_28px_-10px_rgba(109,94,245,0.55)] hover:bg-[#7B6CF7]"
                  onClick={() => {
                    setView("login");
                    setInfo("");
                  }}
                >
                  Entrar
                </button>
              </div>
            ) : view === "link-invalid" ? (
              <div className="space-y-5">
                <p className="text-center text-[13.5px] leading-relaxed text-white/50">
                  Este link não é válido ou expirou.
                </p>
                <button
                  type="button"
                  className="nf-login-cta flex h-[3.1rem] w-full items-center justify-center rounded-xl bg-[#6D5EF5] text-[15px] font-semibold text-white shadow-[0_12px_28px_-10px_rgba(109,94,245,0.55)] hover:bg-[#7B6CF7]"
                  onClick={() => {
                    setError("");
                    setView("forgot");
                  }}
                >
                  Solicitar novo link
                </button>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="relative space-y-4" noValidate>
                {view === "invite" && (
                  <>
                    <Field label="Nome (opcional)" htmlFor="invite-name">
                      <input
                        id="invite-name"
                        className={inputClass()}
                        value={inviteName}
                        onChange={(e) => setInviteName(e.target.value)}
                        disabled={loading || inFlow}
                        placeholder="Como devemos te chamar"
                        autoComplete="name"
                      />
                    </Field>
                    <Field label="Nova senha" htmlFor="invite-pass">
                      <PasswordInput
                        id="invite-pass"
                        value={password}
                        onChange={setPassword}
                        show={showPass}
                        onToggle={() => setShowPass((v) => !v)}
                        focused={focused === "invite-pass"}
                        onFocus={() => setFocused("invite-pass")}
                        onBlur={() => setFocused(null)}
                        onKeyUp={onKeyCaps}
                        disabled={loading || inFlow}
                        minLength={10}
                        placeholder="Mínimo 10 caracteres"
                        autoComplete="new-password"
                      />
                    </Field>
                  </>
                )}

                {view === "login" && (
                  <>
                    <Field label="E-mail" htmlFor="email">
                      <div
                        className={cn(
                          "relative rounded-[0.95rem] transition-shadow duration-200",
                          focused === "email" &&
                            "ring-1 ring-violet-400/50"
                        )}
                      >
                        <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-white/[0.3]" />
                        <input
                          id="email"
                          className={cn(inputClass(), "pl-11")}
                          type="email"
                          autoComplete="email"
                          inputMode="email"
                          placeholder="voce@empresa.com"
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value);
                          }}
                          onFocus={() => setFocused("email")}
                          onBlur={() => setFocused(null)}
                          required
                          disabled={loading || inFlow}
                        />
                      </div>
                    </Field>

                    <Field
                      label="Senha"
                      htmlFor="password"
                      trailing={
                        <button
                          type="button"
                          className="text-[13px] font-medium normal-case tracking-normal text-violet-300/95 transition-colors duration-150 hover:text-violet-200"
                          onClick={() => {
                            setError("");
                            setInfo("");
                            setView("forgot");
                          }}
                        >
                          Esqueci minha senha
                        </button>
                      }
                    >
                      <PasswordInput
                        id="password"
                        value={password}
                        onChange={setPassword}
                        show={showPass}
                        onToggle={() => setShowPass((v) => !v)}
                        focused={focused === "password"}
                        onFocus={() => setFocused("password")}
                        onBlur={() => setFocused(null)}
                        onKeyUp={onKeyCaps}
                        disabled={loading || inFlow}
                        minLength={6}
                        placeholder="••••••••"
                        autoComplete="current-password"
                      />
                    </Field>
                    {capsLock && (
                      <p className="text-[11.5px] text-amber-200/80">Caps Lock está ativado.</p>
                    )}
                  </>
                )}

                {view === "forgot" && (
                  <Field label="E-mail" htmlFor="forgot-email">
                    <div
                      className={cn(
                        "relative rounded-xl",
                        focused === "email" &&
                          "ring-1 ring-violet-400/50"
                      )}
                    >
                      <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                      <input
                        id="forgot-email"
                        className={cn(inputClass(), "pl-11")}
                        type="email"
                        autoComplete="email"
                        placeholder="voce@empresa.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onFocus={() => setFocused("email")}
                        onBlur={() => setFocused(null)}
                        required
                        disabled={loading}
                      />
                    </div>
                  </Field>
                )}

                {view === "reset" && (
                  <>
                    <Field label="Nova senha" htmlFor="reset-pass">
                      <PasswordInput
                        id="reset-pass"
                        value={password}
                        onChange={setPassword}
                        show={showPass}
                        onToggle={() => setShowPass((v) => !v)}
                        focused={focused === "password"}
                        onFocus={() => setFocused("password")}
                        onBlur={() => setFocused(null)}
                        onKeyUp={onKeyCaps}
                        disabled={loading}
                        minLength={10}
                        placeholder="Mínimo 10 caracteres"
                        autoComplete="new-password"
                      />
                    </Field>
                    <Field label="Confirmar senha" htmlFor="reset-pass-2">
                      <PasswordInput
                        id="reset-pass-2"
                        value={password2}
                        onChange={setPassword2}
                        show={showPass}
                        onToggle={() => setShowPass((v) => !v)}
                        focused={focused === "invite-pass"}
                        onFocus={() => setFocused("invite-pass")}
                        onBlur={() => setFocused(null)}
                        onKeyUp={onKeyCaps}
                        disabled={loading}
                        minLength={10}
                        placeholder="Repita a senha"
                        autoComplete="new-password"
                      />
                    </Field>
                  </>
                )}

                {view === "mfa" && (
                  <div className="space-y-3">
                    <Field
                      label={mfaRecovery ? "Código de recuperação" : "Código"}
                      htmlFor="mfa"
                    >
                      <div
                        className={cn(
                          "relative rounded-xl",
                          focused === "mfa" &&
                            "ring-1 ring-violet-400/50"
                        )}
                      >
                        <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                        <input
                          id="mfa"
                          className={cn(
                            inputClass(),
                            "pl-11 text-center text-[17px] tracking-[0.35em] tabular-nums"
                          )}
                          type="text"
                          inputMode={mfaRecovery ? "text" : "numeric"}
                          autoComplete="one-time-code"
                          placeholder={mfaRecovery ? "XXXXXXXX" : "000000"}
                          value={mfaCode}
                          onChange={(e) =>
                            setMfaCode(
                              mfaRecovery
                                ? e.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)
                                : e.target.value.replace(/[^\d]/g, "").slice(0, 6)
                            )
                          }
                          onFocus={() => setFocused("mfa")}
                          onBlur={() => setFocused(null)}
                          required
                          autoFocus
                          disabled={loading || inFlow}
                        />
                      </div>
                    </Field>
                    <button
                      type="button"
                      className="text-[12.5px] font-medium text-white/40 transition-colors hover:text-white/70"
                      onClick={() => {
                        setMfaRecovery((v) => !v);
                        setMfaCode("");
                        setError("");
                      }}
                    >
                      {mfaRecovery
                        ? "Usar aplicativo autenticador"
                        : "Usar código de recuperação"}
                    </button>
                  </div>
                )}

                {error && (
                  <div
                    role="alert"
                    className="nf-anim-in rounded-[0.95rem] border border-red-400/25 bg-red-500/[0.12] px-3.5 py-3 text-[13px] leading-relaxed text-red-100"
                  >
                    {error}
                  </div>
                )}

                {info ? (
                  <div
                    role="status"
                    className="nf-anim-in rounded-[0.95rem] border border-emerald-400/20 bg-emerald-500/[0.1] px-3.5 py-3 text-[13px] leading-relaxed text-emerald-100/90"
                  >
                    {info}
                  </div>
                ) : null}

                <button
                  type="submit"
                  className={cn(
                    "nf-login-cta group relative mt-3 flex h-[3.15rem] w-full items-center justify-center gap-2 overflow-hidden rounded-xl text-[15px] font-semibold transition-[background,transform,box-shadow,opacity] duration-150",
                    "active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400/70",
                    phase === "confirm" || phase === "overlay" || phase === "exit"
                      ? "nf-auth-btn-success text-white"
                      : canSubmit || loading
                        ? "bg-[#6D5EF5] text-white shadow-[0_14px_32px_-12px_rgba(109,94,245,0.7)] hover:bg-[#7B6CF7] hover:shadow-[0_16px_36px_-12px_rgba(109,94,245,0.8)]"
                        : "cursor-not-allowed bg-white/[0.08] text-white/40",
                    loading && "pointer-events-none"
                  )}
                  disabled={!canSubmit && phase === "idle"}
                >
                  {phase !== "idle" ? (
                    <>
                      <Check className="h-4 w-4 nf-auth-check-pop" strokeWidth={2.5} />
                      Acesso confirmado
                    </>
                  ) : loading ? (
                    <span className="inline-flex items-center gap-2 text-white">
                      {view === "forgot"
                        ? "Enviando…"
                        : view === "mfa"
                          ? "Verificando…"
                          : view === "reset"
                            ? "Salvando…"
                            : "Entrando..."}
                    </span>
                  ) : (
                    <span className={canSubmit ? "text-white" : "text-white/40"}>
                      {ctaLabel}
                    </span>
                  )}
                </button>
              </form>
            )}
          </div>

          {!inFlow && (
            <div className="nf-anim-up nf-delay-3 mt-7 flex flex-col items-center gap-1.5 text-center">
              <p className="flex items-center justify-center gap-x-2 text-[12px] text-white/40">
                <Link
                  href="/termos"
                  className="transition-colors duration-150 hover:text-white/70"
                >
                  Termos
                </Link>
                <span className="text-white/20" aria-hidden>
                  ·
                </span>
                <Link
                  href="/privacidade"
                  className="transition-colors duration-150 hover:text-white/70"
                >
                  Privacidade
                </Link>
              </p>
              <p className="text-[11px] text-white/28">© 2026 NexaFlow AI</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function inputClass() {
  return "nf-login-input h-[3.05rem] w-full rounded-xl border border-white/[0.11] bg-white/[0.045] px-3.5 text-[15px] text-white outline-none transition-[border-color,background,box-shadow] duration-150 placeholder:text-white/[0.28] focus:border-violet-400/50 focus:bg-white/[0.06] focus:ring-1 focus:ring-violet-400/25";
}

function Field({
  label,
  htmlFor,
  children,
  trailing,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label
          className="block text-[13px] font-medium text-white/65"
          htmlFor={htmlFor}
        >
          {label}
        </label>
        {trailing}
      </div>
      {children}
    </div>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  show,
  onToggle,
  focused,
  onFocus,
  onBlur,
  onKeyUp,
  disabled,
  minLength,
  placeholder,
  autoComplete,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onKeyUp: (e: KeyboardEvent) => void;
  disabled?: boolean;
  minLength?: number;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div
      className={cn(
        "relative rounded-[0.95rem] transition-shadow duration-200",
        focused && "ring-1 ring-violet-400/50"
      )}
    >
      <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-white/[0.3]" />
      <input
        id={id}
        className={cn(inputClass(), "pl-11 pr-12")}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyUp={onKeyUp}
        required
        minLength={minLength}
        disabled={disabled}
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-white/[0.35] transition-colors hover:bg-white/[0.06] hover:text-white/80"
        onClick={onToggle}
        tabIndex={-1}
        aria-label={show ? "Ocultar senha" : "Mostrar senha"}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
