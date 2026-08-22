"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ApiError } from "@/lib/api";
import { needsCompanyOnboarding } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import { useAuth } from "@/store/auth";
import {
  AccessCinematic,
  markAccessEntrance,
  prefersReducedMotion,
  type AccessKind,
  type AccessStage,
} from "./access-cinematic";
import {
  gatewayChallenge,
  gatewayInvite,
  gatewayRecover,
  gatewayRecoverConfirm,
  gatewaySignIn,
  type GatewayOk,
} from "./api";

type Step = "signin" | "challenge" | "recover" | "recover-sent" | "reset" | "invite";

export function LoginScreen() {
  const router = useRouter();
  const { user, tenant, hydrated, setSession } = useAuth();
  const [step, setStep] = useState<Step>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [cine, setCine] = useState<{
    kind: AccessKind;
    personName?: string;
    companyName?: string;
    stage: AccessStage;
    intent?: "setup" | "app";
  } | null>(null);
  const cineTimers = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      cineTimers.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !user || leaving) return;
    if (user.platformRole === "SUPERADMIN" && !tenant) {
      router.replace("/admin");
      return;
    }
    router.replace(needsCompanyOnboarding(tenant) ? "/app/onboarding" : "/app");
  }, [hydrated, user, tenant, router, leaving]);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const inv = sp.get("invite");
    const reset = sp.get("reset");
    if (inv) {
      setInviteToken(inv);
      setStep("invite");
    } else if (reset) {
      setResetToken(reset);
      setStep("reset");
    }
    try {
      const saved = localStorage.getItem("nexaflow_login_email");
      if (saved) setEmail(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const canSubmit = useMemo(() => {
    if (busy || leaving) return false;
    if (step === "signin") return email.includes("@") && password.length >= 6;
    if (step === "challenge") return code.replace(/\s/g, "").length >= 6;
    if (step === "recover") return email.includes("@");
    if (step === "reset") return password.length >= 10 && password === password2;
    if (step === "invite") return password.length >= 10;
    return false;
  }, [busy, leaving, step, email, password, password2, code]);

  function applySession(data: GatewayOk) {
    if (data.status === "challenge" && data.challengeId) {
      setChallengeId(data.challengeId);
      setStep("challenge");
      setBusy(false);
      setCode("");
      return;
    }
    if ((data.status === "reset" || data.mustChangePassword) && data.resetToken) {
      setResetToken(data.resetToken);
      setStep("reset");
      setBusy(false);
      setPassword("");
      setPassword2("");
      return;
    }
    if (!data.user) {
      setError("Não foi possível concluir o acesso.");
      setBusy(false);
      return;
    }
    const isSuper = data.user.platformRole === "SUPERADMIN";
    const tenantForSession = isSuper ? null : data.tenant ?? null;
    setSession({
      token: data.accessToken || "",
      user: data.user,
      tenant: tenantForSession,
      memberships: isSuper ? [] : data.memberships || [],
    });
    try {
      localStorage.setItem("nexaflow_login_email", email.trim().toLowerCase());
      sessionStorage.removeItem("nexaflow_impersonating");
    } catch {
      /* ignore */
    }
    setLeaving(true);
    const dest =
      data.next === "admin"
        ? "/admin"
        : data.next === "onboarding" || needsCompanyOnboarding(tenantForSession)
          ? "/app/onboarding"
          : "/app";
    const kind: AccessKind =
      dest === "/admin" || isSuper ? "admin" : dest === "/app/onboarding" || step === "invite" ? "first" : "return";
    markAccessEntrance(kind);

    if (prefersReducedMotion()) {
      router.replace(dest);
      return;
    }

    setCine({
      kind,
      personName: data.user.name,
      companyName: tenantForSession?.name,
      stage: "confirm",
      intent: dest === "/app/onboarding" ? "setup" : "app",
    });
    cineTimers.current.forEach((id) => window.clearTimeout(id));
    cineTimers.current = [
      window.setTimeout(() => {
        setCine((cur) => (cur ? { ...cur, stage: "prepare" } : cur));
      }, 520),
      window.setTimeout(() => {
        setCine((cur) => (cur ? { ...cur, stage: "exit" } : cur));
      }, 1220),
      window.setTimeout(() => {
        router.replace(dest);
      }, 1580),
    ];
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      if (step === "recover") {
        await gatewayRecover(email.trim().toLowerCase());
        setStep("recover-sent");
        setBusy(false);
        return;
      }
      if (step === "reset" && resetToken) {
        await gatewayRecoverConfirm(resetToken, password);
        setPassword("");
        setPassword2("");
        setResetToken(null);
        setStep("signin");
        setBusy(false);
        return;
      }
      if (step === "invite" && inviteToken) {
        applySession(await gatewayInvite(inviteToken, password, name || undefined));
        return;
      }
      if (step === "challenge" && challengeId) {
        applySession(await gatewayChallenge(challengeId, code.replace(/\s/g, "")));
        return;
      }
      applySession(await gatewaySignIn(email.trim().toLowerCase(), password));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível continuar.");
      setBusy(false);
    }
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#07080c]">
        <Logo variant="full-white" size="md" withAi />
      </div>
    );
  }

  const title =
    step === "challenge"
      ? "Confirme que é você"
      : step === "recover" || step === "recover-sent"
        ? "Recuperar acesso"
        : step === "reset"
          ? "Nova senha"
          : step === "invite"
            ? "Ativar convite"
            : "Entrar na plataforma";

  return (
    <div
      className={cn(
        "relative min-h-[100dvh] overflow-hidden bg-[#07080c] text-white",
        leaving && "nf-login-handoff"
      )}
    >
      {cine ? (
        <AccessCinematic
          kind={cine.kind}
          personName={cine.personName}
          companyName={cine.companyName}
          stage={cine.stage}
          intent={cine.intent}
        />
      ) : null}

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-[-18%] h-[46rem] w-[46rem] rounded-full bg-indigo-600/18 blur-[150px]" />
        <div className="absolute bottom-[-24%] right-[-12%] h-[40rem] w-[40rem] rounded-full bg-violet-700/14 blur-[140px]" />
      </div>

      <div className="nf-login-stage relative z-10 mx-auto grid min-h-[100dvh] max-w-6xl lg:grid-cols-[1.05fr_0.95fr]">
        <aside className="hidden flex-col justify-between px-12 py-12 lg:flex">
          <Logo variant="full-white" size="lg" withAi />
          <div className="max-w-md">
            <p className="text-[12px] font-semibold uppercase tracking-[0.26em] text-indigo-300/75">
              Operação comercial
            </p>
            <h1 className="mt-4 text-[2.6rem] font-semibold leading-[1.08] tracking-tight">
              Atendimento, funil e equipe no mesmo ritmo.
            </h1>
            <p className="mt-5 text-[15px] leading-relaxed text-white/50">
              WhatsApp, conversas, contatos e CRM numa plataforma pensada para quem opera de verdade — sem teatro de produto.
            </p>
            <ul className="mt-10 space-y-3 text-[13.5px] text-white/55">
              <li className="flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 text-indigo-300" />
                Sessão com cookie HttpOnly e isolamento por empresa
              </li>
              <li className="flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 text-indigo-300" />
                Segundo fator só quando a conta exige
              </li>
            </ul>
          </div>
          <p className="text-[12px] text-white/30">NexaFlow · acesso seguro</p>
        </aside>

        <main className="flex items-center justify-center px-5 py-10 sm:px-8">
          <form
            onSubmit={onSubmit}
            className={cn(
              "w-full max-w-[420px] rounded-[28px] border border-white/[0.08] bg-white/[0.035] p-7 shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-8",
              leaving && "pointer-events-none opacity-60"
            )}
          >
            <div className="mb-7 lg:hidden">
              <Logo variant="full-white" size="md" withAi />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/35">
              Acesso
            </p>
            <h2 className="mt-2 text-[1.55rem] font-semibold tracking-tight">{title}</h2>
            <p className="mt-1.5 text-[13.5px] text-white/45">
              {step === "challenge"
                ? "Digite o código de 6 dígitos do autenticador."
                : step === "recover-sent"
                  ? "Se o e-mail existir, as instruções já foram enviadas."
                  : "Use o e-mail corporativo da sua empresa."}
            </p>

            <div className="mt-7 space-y-3.5">
              {step !== "challenge" && step !== "reset" && (
                <label className="block">
                  <span className="mb-1.5 block text-[12px] text-white/45">E-mail</span>
                  <input
                    className="h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3.5 text-[14px] outline-none ring-indigo-400/0 transition focus:border-indigo-400/40 focus:ring-4 focus:ring-indigo-400/10"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={step === "invite"}
                  />
                </label>
              )}

              {step === "invite" && (
                <label className="block">
                  <span className="mb-1.5 block text-[12px] text-white/45">Nome</span>
                  <input
                    className="h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3.5 text-[14px] outline-none focus:border-indigo-400/40"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              )}

              {(step === "signin" || step === "reset" || step === "invite") && (
                <label className="block">
                  <span className="mb-1.5 block text-[12px] text-white/45">Senha</span>
                  <div className="relative">
                    <input
                      className="h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3.5 pr-11 text-[14px] outline-none focus:border-indigo-400/40"
                      type={showPass ? "text" : "password"}
                      autoComplete={step === "signin" ? "current-password" : "new-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40"
                      onClick={() => setShowPass((v) => !v)}
                      aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>
              )}

              {step === "reset" && (
                <label className="block">
                  <span className="mb-1.5 block text-[12px] text-white/45">Confirmar senha</span>
                  <input
                    className="h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3.5 text-[14px] outline-none focus:border-indigo-400/40"
                    type="password"
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                  />
                </label>
              )}

              {step === "challenge" && (
                <label className="block">
                  <span className="mb-1.5 block text-[12px] text-white/45">Código</span>
                  <input
                    className="h-12 w-full rounded-xl border border-white/10 bg-black/25 px-3.5 text-center text-[20px] tracking-[0.35em] outline-none focus:border-indigo-400/40"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, "").slice(0, 8))}
                  />
                </label>
              )}
            </div>

            {error ? (
              <p className="mt-4 text-[13px] text-rose-300" role="alert">
                {error}
              </p>
            ) : null}

            {step !== "recover-sent" && (
              <button
                type="submit"
                disabled={!canSubmit}
                className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-[14px] font-semibold text-[#0b0c10] transition enabled:hover:bg-white/90 disabled:opacity-40"
              >
                {busy ? "Aguarde…" : step === "signin" ? "Entrar" : "Continuar"}
                <ArrowRight className="h-4 w-4" />
              </button>
            )}

            <div className="mt-5 flex items-center justify-between text-[12.5px] text-white/40">
              {step === "signin" ? (
                <button type="button" onClick={() => setStep("recover")}>
                  Esqueci a senha
                </button>
              ) : step !== "invite" ? (
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setStep("signin");
                  }}
                >
                  Voltar ao acesso
                </button>
              ) : (
                <span />
              )}
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}
