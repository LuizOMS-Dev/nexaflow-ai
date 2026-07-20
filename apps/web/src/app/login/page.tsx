"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Logo } from "@/components/brand/logo";
import { AuthShowcase } from "@/components/auth/auth-showcase";
import {
  AuthTransition,
  markAppEntrance,
  type AuthTransitionMode,
} from "@/components/auth/auth-transition";
import { needsCompanyOnboarding } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import type { TenantInfo } from "@/store/auth";

/** Confirm → overlay → exit — total ideal ~1.0–1.6s (sem prender o usuário) */
const T_CONFIRM_MS = 280;
const T_OVERLAY_MS = 900;
const T_EXIT_MS = 380;
/** Primeiro acesso: um pouco mais de respiro, ainda sob 2s */
const T_OVERLAY_FIRST_MS = 1100;
const T_EXIT_FIRST_MS = 420;

type Phase = "idle" | "confirm" | "overlay" | "exit";

export default function LoginPage() {
  const router = useRouter();
  const { user, tenant, hydrated, setSession } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [transitionMode, setTransitionMode] = useState<AuthTransitionMode>("login-return");
  const [welcomePerson, setWelcomePerson] = useState("");
  const [welcomeCompany, setWelcomeCompany] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [focused, setFocused] = useState<"email" | "password" | "mfa" | null>(null);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteName, setInviteName] = useState("");

  const inFlow = phase !== "idle";
  const mfaStep = Boolean(mfaToken);

  useEffect(() => {
    if (!hydrated || !user || inFlow || inviteToken) return;
    // SUPERADMIN global → sempre Administração (sem tenant automático)
    if (user.platformRole === "SUPERADMIN" && !tenant) {
      router.replace("/admin");
      return;
    }
    if (needsCompanyOnboarding(tenant)) router.replace("/app/onboarding");
    else router.replace("/app");
  }, [hydrated, user, tenant, router, inFlow, inviteToken]);

  useEffect(() => {
    const saved = localStorage.getItem("nexaflow_login_email");
    if (saved) setEmail(saved);
    try {
      const sp = new URLSearchParams(window.location.search);
      const inv = sp.get("invite");
      if (inv) setInviteToken(inv);
    } catch {
      /* ignore */
    }
  }, []);

  const canSubmit = useMemo(() => {
    if (loading || inFlow) return false;
    if (inviteToken) return password.length >= 10;
    if (mfaStep) return mfaCode.replace(/\s/g, "").length >= 6;
    return email.trim().length > 3 && password.length >= 6;
  }, [email, password, loading, inFlow, mfaStep, mfaCode, inviteToken]);

  function humanLoginError(msg: string) {
    const m = msg.toLowerCase();
    if (m.includes("credencial") || m.includes("senha") || m.includes("inválid") || m.includes("invalid"))
      return "E-mail ou senha incorretos. Confira e tente de novo.";
    if (m.includes("network") || m.includes("fetch") || m.includes("failed"))
      return "Não foi possível conectar. Verifique sua internet e tente de novo.";
    if (m.includes("rate") || m.includes("muitas"))
      return "Muitas tentativas. Aguarde um momento e tente novamente.";
    return msg || "Não foi possível entrar. Tente de novo em instantes.";
  }

  type LoginOk = {
    token?: string;
    accessToken?: string;
    mfaRequired?: boolean;
    mfaToken?: string;
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
    /**
     * SUPERADMIN global: nunca entra em tenant no login (mesmo com memberships).
     * Contexto inicial = NexaFlow Platform → /admin.
     * Ignora tenant e memberships vindos da API.
     */
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
    // Superadmin: sem “empresa” no welcome — plataforma
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

    // Limpa flag de impersonação residual de sessão anterior no browser
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    if (inviteToken) {
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
        setError(humanLoginError(message));
        setShake(true);
        setTimeout(() => setShake(false), 450);
        setLoading(false);
      }
      return;
    }

    if (mfaStep) {
      setLoading(true);
      setError("");
      try {
        const data = await api<LoginOk>("/auth/mfa/verify", {
          method: "POST",
          json: { mfaToken, code: mfaCode.replace(/\s/g, "") },
        });
        finishLogin(data);
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Código inválido";
        setError(humanLoginError(message));
        setShake(true);
        setTimeout(() => setShake(false), 450);
        setLoading(false);
      }
      return;
    }

    if (!email.includes("@")) {
      setError("Informe um e-mail válido.");
      setShake(true);
      setTimeout(() => setShake(false), 400);
      return;
    }
    if (password.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      setShake(true);
      setTimeout(() => setShake(false), 400);
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
      setError(humanLoginError(message));
      setShake(true);
      setTimeout(() => setShake(false), 450);
      setLoading(false);
    }
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#06060f]">
        <div className="h-1 w-24 overflow-hidden rounded-full bg-white/10">
          <div className="nf-auth-transition-bar h-full w-full origin-left rounded-full bg-gradient-to-r from-indigo-400 to-violet-500" />
        </div>
      </div>
    );
  }

  const coverLogin = phase === "overlay" || phase === "exit";

  return (
    <div
      className={cn(
        "relative min-h-screen bg-[#06060f]",
        "grid lg:grid-cols-[1.08fr_0.92fr] xl:grid-cols-[1.04fr_0.96fr]"
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
        headline="Atendimento e vendas"
        subhead="WhatsApp, contatos e agentes no painel."
        bullets={[
          "WhatsApp",
          "Agentes de IA",
          "CRM e contatos",
        ]}
      />

      <div
        className={cn(
          "relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-5 py-12 sm:px-7 lg:px-8",
          coverLogin && "nf-login-under-overlay"
        )}
      >
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute inset-0 bg-gradient-to-br from-[#0b0b18] via-[#0c0b1a] to-[#070712]" />
          <div className="nf-login-right-glow absolute -right-12 top-[20%] h-[280px] w-[280px] rounded-full bg-indigo-600/[0.18] blur-[48px]" />
          <div className="nf-auth-glow nf-auth-glow-b absolute -left-10 bottom-[0%] h-[220px] w-[220px] rounded-full bg-violet-700/[0.12] blur-[40px]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(6,6,15,0.4)_100%)]" />
        </div>

        <div
          className={cn(
            "relative w-full max-w-[380px] transition-all duration-500",
            inFlow && "nf-auth-form-dim"
          )}
        >
          <div className="nf-anim-up mb-8 flex items-center justify-center lg:hidden">
            <Logo variant="full-white" size="md" withAi />
          </div>

          <div
            className={cn(
              "nf-anim-up nf-delay-1 nf-login-glass relative overflow-hidden rounded-[1.35rem] border border-white/[0.11] p-7 sm:p-8",
              "shadow-[0_28px_70px_-28px_rgba(0,0,0,0.7),0_0_0_1px_rgba(165,180,252,0.07),inset_0_1px_0_0_rgba(255,255,255,0.08)]",
              shake && "nf-shake",
              phase === "confirm" && "border-emerald-400/25"
            )}
          >
            <div
              className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent"
              aria-hidden
            />
            <div className="relative mb-8">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-indigo-300/70">
                NexaFlow AI
              </p>
              <h2 className="font-display text-[1.65rem] font-semibold tracking-[-0.035em] text-white">
                {inviteToken
                  ? "Aceitar convite"
                  : mfaStep
                    ? "Verificação em duas etapas"
                    : "Bem-vindo de volta"}
              </h2>
              <p className="mt-2.5 text-[14.5px] leading-relaxed text-white/[0.48]">
                {inviteToken
                  ? "Defina sua senha para entrar na equipe."
                  : mfaStep
                    ? "Digite o código do autenticador ou um código de recuperação."
                    : "Entre com seu e-mail e senha."}
              </p>
            </div>

            <form onSubmit={onSubmit} className="relative space-y-5" noValidate>
              {inviteToken ? (
                <>
                  <div>
                    <label className="mb-2 block text-[11px] font-medium uppercase tracking-[0.1em] text-white/[0.42]" htmlFor="invite-name">
                      Nome (opcional)
                    </label>
                    <input
                      id="invite-name"
                      className="nf-login-input h-[3.15rem] w-full rounded-[0.9rem] border border-white/[0.1] bg-white/[0.035] px-3.5 text-[15px] text-white outline-none placeholder:text-white/[0.22]"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      disabled={loading || inFlow}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-[11px] font-medium uppercase tracking-[0.1em] text-white/[0.42]" htmlFor="invite-pass">
                      Nova senha
                    </label>
                    <input
                      id="invite-pass"
                      type={showPass ? "text" : "password"}
                      className="nf-login-input h-[3.15rem] w-full rounded-[0.9rem] border border-white/[0.1] bg-white/[0.035] px-3.5 text-[15px] text-white outline-none placeholder:text-white/[0.22]"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={10}
                      required
                      disabled={loading || inFlow}
                      placeholder="Mínimo 10 caracteres"
                    />
                  </div>
                </>
              ) : !mfaStep ? (
                <>
                  <div>
                    <label
                      className="mb-2 block text-[11px] font-medium uppercase tracking-[0.1em] text-white/[0.42]"
                      htmlFor="email"
                    >
                      E-mail
                    </label>
                    <div
                      className={cn(
                        "relative rounded-[0.9rem] transition-shadow duration-200",
                        focused === "email" &&
                          "shadow-[0_0_0_3px_rgba(124,58,237,0.18)] ring-1 ring-violet-400/[0.35]"
                      )}
                    >
                      <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-white/[0.28]" />
                      <input
                        id="email"
                        className="nf-login-input h-[3.15rem] w-full rounded-[0.9rem] border border-white/[0.1] bg-white/[0.035] pl-11 pr-3.5 text-[15px] text-white outline-none transition-all placeholder:text-white/[0.22] focus:border-indigo-400/[0.45] focus:bg-white/[0.055]"
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        placeholder="voce@empresa.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onFocus={() => setFocused("email")}
                        onBlur={() => setFocused(null)}
                        required
                        disabled={loading || inFlow}
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      className="mb-2 block text-[11px] font-medium uppercase tracking-[0.1em] text-white/[0.42]"
                      htmlFor="password"
                    >
                      Senha
                    </label>
                    <div
                      className={cn(
                        "relative rounded-[0.9rem] transition-shadow duration-200",
                        focused === "password" &&
                          "shadow-[0_0_0_3px_rgba(124,58,237,0.18)] ring-1 ring-violet-400/[0.35]"
                      )}
                    >
                      <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-white/[0.28]" />
                      <input
                        id="password"
                        className="nf-login-input h-[3.15rem] w-full rounded-[0.9rem] border border-white/[0.1] bg-white/[0.035] pl-11 pr-12 text-[15px] text-white outline-none transition-all placeholder:text-white/[0.22] focus:border-indigo-400/[0.45] focus:bg-white/[0.055]"
                        type={showPass ? "text" : "password"}
                        autoComplete="current-password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onFocus={() => setFocused("password")}
                        onBlur={() => setFocused(null)}
                        required
                        minLength={6}
                        disabled={loading || inFlow}
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-white/[0.32] transition-colors hover:bg-white/[0.06] hover:text-white/75"
                        onClick={() => setShowPass((v) => !v)}
                        tabIndex={-1}
                        aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}
                      >
                        {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <label
                    className="mb-2 block text-[11px] font-medium uppercase tracking-[0.1em] text-white/[0.42]"
                    htmlFor="mfa"
                  >
                    Código MFA
                  </label>
                  <div
                    className={cn(
                      "relative rounded-[0.9rem] transition-shadow duration-200",
                      focused === "mfa" &&
                        "shadow-[0_0_0_3px_rgba(124,58,237,0.18)] ring-1 ring-violet-400/[0.35]"
                    )}
                  >
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-white/[0.28]" />
                    <input
                      id="mfa"
                      className="nf-login-input h-[3.15rem] w-full rounded-[0.9rem] border border-white/[0.1] bg-white/[0.035] pl-11 pr-3.5 text-center text-[18px] tracking-[0.35em] text-white outline-none transition-all placeholder:text-white/[0.22] focus:border-indigo-400/[0.45] focus:bg-white/[0.055]"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="000000"
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value)}
                      onFocus={() => setFocused("mfa")}
                      onBlur={() => setFocused(null)}
                      required
                      autoFocus
                      disabled={loading || inFlow}
                    />
                  </div>
                  <button
                    type="button"
                    className="mt-3 text-xs text-white/40 transition-colors hover:text-white/70"
                    onClick={() => {
                      setMfaToken(null);
                      setMfaCode("");
                      setError("");
                    }}
                  >
                    Voltar ao login
                  </button>
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="nf-anim-in rounded-[0.9rem] border border-red-400/20 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-200"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                className={cn(
                  "nf-login-cta group relative mt-1 flex h-[3.15rem] w-full items-center justify-center gap-2 overflow-hidden rounded-[0.9rem] text-[15px] font-semibold text-white transition-all duration-200",
                  phase === "confirm" || phase === "overlay" || phase === "exit"
                    ? "nf-auth-btn-success"
                    : "bg-gradient-to-r from-indigo-500 via-indigo-500 to-violet-600 shadow-[0_12px_32px_-10px_rgba(99,102,241,0.55)] hover:brightness-[1.06] hover:scale-[1.01]",
                  "active:scale-[0.985]",
                  "disabled:pointer-events-none disabled:opacity-45"
                )}
                disabled={!canSubmit && phase === "idle"}
              >
                {phase !== "idle" ? (
                  <>
                    <Check className="h-4 w-4 nf-auth-check-pop" strokeWidth={2.5} />
                    Acesso confirmado
                  </>
                ) : loading ? (
                  <span className="inline-flex items-center gap-2">
                    Entrando
                    <span className="nf-auth-dots" aria-hidden>
                      <i />
                      <i />
                      <i />
                    </span>
                  </span>
                ) : (
                  <>
                    {inviteToken
                      ? "Criar senha e entrar"
                      : mfaStep
                        ? "Verificar e entrar"
                        : "Entrar na plataforma"}
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>

            <div className="relative mt-7 border-t border-white/[0.06] pt-5">
              <p className="text-center text-[12px] leading-relaxed text-white/[0.34]">
                O acesso é exclusivo para clientes NexaFlow AI.
              </p>
            </div>
          </div>

          {!inFlow && (
            <p className="nf-anim-up nf-delay-3 mt-9 text-center text-[11px] tracking-wide text-white/[0.22]">
              © {new Date().getFullYear()} NexaFlow AI
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
