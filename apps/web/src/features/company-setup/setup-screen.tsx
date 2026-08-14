"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, ShieldCheck, Trash2, Upload } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ApiError } from "@/lib/api";
import { needsCompanyOnboarding } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import { useAuth } from "@/store/auth";
import {
  AccessCinematic,
  markAccessEntrance,
  prefersReducedMotion,
  type AccessStage,
} from "@/features/auth-gateway/access-cinematic";
import { completeCompanySetup, fetchCompanySetup } from "./api";

const COLORS = ["#4F46E5", "#7C3AED", "#0891B2", "#059669", "#D97706", "#E11D48", "#2563EB", "#0F172A"];

function firstNameOf(name?: string) {
  const n = (name || "").trim().split(/\s+/)[0] || "";
  const banned = new Set(["admin", "administrador", "user", "usuário", "usuario", "superadmin"]);
  if (!n || banned.has(n.toLowerCase())) return "";
  return n[0].toUpperCase() + n.slice(1);
}

function isPlaceholderCompany(name?: string | null) {
  const n = (name || "").trim().toLowerCase();
  return !n || n === "minha empresa";
}

export function CompanySetupScreen() {
  const router = useRouter();
  const { user, tenant, token, memberships, setSession, logout, hydrated } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const cineTimers = useRef<number[]>([]);

  const [name, setName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#4F46E5");
  const [logoUrl, setLogoUrl] = useState("");
  const [canComplete, setCanComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [cine, setCine] = useState<{
    personName?: string;
    companyName?: string;
    stage: AccessStage;
  } | null>(null);

  useEffect(() => {
    return () => {
      cineTimers.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.platformRole === "SUPERADMIN" && !tenant) {
      router.replace("/admin");
    }
  }, [hydrated, user, tenant, router]);

  useEffect(() => {
    if (!hydrated || !tenant) return;
    if (!isPlaceholderCompany(tenant.name) && !name) setName(tenant.name);
    if (tenant.primaryColor) setPrimaryColor(tenant.primaryColor);
    if (tenant.logoUrl) setLogoUrl(tenant.logoUrl);
  }, [hydrated, tenant]);

  useEffect(() => {
    if (!hydrated || !tenant) return;
    let alive = true;
    fetchCompanySetup()
      .then((s) => {
        if (!alive) return;
        setCanComplete(s.canComplete);
        if (!s.needed) {
          router.replace("/app");
          return;
        }
        if (s.company.name && !isPlaceholderCompany(s.company.name)) setName(s.company.name);
        if (s.company.primaryColor) setPrimaryColor(s.company.primaryColor);
        if (s.company.logoUrl) setLogoUrl(s.company.logoUrl);
      })
      .catch(() => {
        if (alive && tenant && !needsCompanyOnboarding(tenant)) router.replace("/app");
      });
    return () => {
      alive = false;
    };
  }, [hydrated, tenant, router]);

  const first = useMemo(() => firstNameOf(user?.name), [user?.name]);
  const canSubmit = name.trim().length >= 2 && !busy && !leaving && canComplete;

  function onLogoFile(file: File | null) {
    if (!file) return;
    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowed.has(file.type)) {
      setError("Use JPEG, PNG ou WebP de até 1,5 MB.");
      return;
    }
    if (file.size > 1_500_000) {
      setError("Use JPEG, PNG ou WebP de até 1,5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogoUrl(String(reader.result || ""));
      setError("");
    };
    reader.readAsDataURL(file);
  }

  function goToApp(companyName: string) {
    markAccessEntrance("first");
    if (prefersReducedMotion()) {
      router.replace("/app");
      return;
    }
    setCine({ personName: user?.name, companyName, stage: "confirm" });
    cineTimers.current.forEach((id) => window.clearTimeout(id));
    cineTimers.current = [
      window.setTimeout(() => setCine((c) => (c ? { ...c, stage: "prepare" } : c)), 480),
      window.setTimeout(() => setCine((c) => (c ? { ...c, stage: "exit" } : c)), 1180),
      window.setTimeout(() => router.replace("/app"), 1560),
    ];
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      const updated = await completeCompanySetup({
        name: name.trim(),
        primaryColor,
        logoUrl: logoUrl || null,
      });
      if (token && user) {
        setSession({
          token,
          user,
          memberships,
          tenant: {
            id: updated.id,
            name: updated.name,
            slug: updated.slug,
            primaryColor: updated.primaryColor,
            logoUrl: updated.logoUrl,
            role: tenant?.role,
            plan: updated.plan,
            settings: updated.settings,
            onboardingCompleted: true,
          },
        });
      }
      setLeaving(true);
      goToApp(updated.name);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 409 || err.code === "ONBOARDING_DONE")) {
        if (token && user && tenant) {
          setSession({
            token,
            user,
            memberships,
            tenant: { ...tenant, onboardingCompleted: true },
          });
        }
        setLeaving(true);
        goToApp(name.trim() || tenant?.name || "Empresa");
        return;
      }
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar a empresa.");
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

  return (
    <div
      className={cn(
        "relative min-h-[100dvh] overflow-hidden bg-[#07080c] text-white",
        leaving && "nf-login-handoff"
      )}
    >
      {cine ? (
        <AccessCinematic
          kind="first"
          personName={cine.personName}
          companyName={cine.companyName}
          stage={cine.stage}
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
              Primeiro acesso
            </p>
            <h1 className="mt-4 text-[2.4rem] font-semibold leading-[1.08] tracking-tight">
              {first ? `${first}, vamos abrir a sua empresa.` : "Vamos abrir a sua empresa."}
            </h1>
            <p className="mt-5 text-[15px] leading-relaxed text-white/50">
              Nome, identidade e o essencial para o painel nascer com a cara do seu time — sem wizard longo.
            </p>
            <ul className="mt-10 space-y-3 text-[13.5px] text-white/55">
              <li className="flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 text-indigo-300" />
                Só o administrador da empresa conclui este passo
              </li>
              <li className="flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 text-indigo-300" />
                Depois você entra direto no atendimento e no funil
              </li>
            </ul>
          </div>
          <button
            type="button"
            className="text-left text-[12px] text-white/30 transition hover:text-white/60"
            onClick={() => {
              void logout();
              router.replace("/login");
            }}
          >
            Usar outra conta
          </button>
        </aside>

        <main className="flex items-center justify-center px-5 py-10 sm:px-8">
          <form
            onSubmit={onSubmit}
            className="w-full max-w-[440px] rounded-[28px] border border-white/[0.08] bg-white/[0.035] p-7 shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-8"
          >
            <div className="mb-6 flex items-center justify-between lg:hidden">
              <Logo variant="full-white" size="md" withAi />
              <button
                type="button"
                className="text-[12px] text-white/40"
                onClick={() => {
                  void logout();
                  router.replace("/login");
                }}
              >
                Sair
              </button>
            </div>

            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/35">
              Empresa
            </p>
            <h2 className="mt-2 text-[1.5rem] font-semibold tracking-tight">
              {canComplete ? "Cadastre sua empresa" : "A empresa ainda não foi configurada"}
            </h2>
            <p className="mt-1.5 text-[13.5px] text-white/45">
              {canComplete
                ? "O nome aparece no painel agora. Logo e cor podem ficar para depois."
                : "Peça ao administrador para concluir o cadastro. Você entra assim que isso for feito."}
            </p>

            {canComplete ? (
            <div className="mt-7 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-[12px] text-white/45">Nome da empresa</span>
                <input
                  className="h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3.5 text-[14px] outline-none transition focus:border-indigo-400/40 focus:ring-4 focus:ring-indigo-400/10"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Clínica Horizonte"
                  maxLength={120}
                  autoFocus
                />
              </label>

              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/25">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="" className="h-full w-full object-contain p-1" />
                  ) : (
                    <Building2 className="h-5 w-5 text-white/25" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="mb-1.5 block text-[12px] text-white/45">Logotipo</span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-[12px] text-white/70"
                      onClick={() => fileRef.current?.click()}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {logoUrl ? "Substituir" : "Enviar"}
                    </button>
                    {logoUrl ? (
                      <button
                        type="button"
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-[12px] text-white/40"
                        onClick={() => setLogoUrl("")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remover
                      </button>
                    ) : null}
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => onLogoFile(e.target.files?.[0] || null)}
                  />
                </div>
              </div>

              <div>
                <span className="mb-2 block text-[12px] text-white/45">Cor da marca</span>
                <div className="flex flex-wrap items-center gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setPrimaryColor(c)}
                      className={cn(
                        "h-8 w-8 rounded-full",
                        primaryColor.toLowerCase() === c.toLowerCase() &&
                          "ring-2 ring-white/55 ring-offset-2 ring-offset-[#07080c]"
                      )}
                      style={{ backgroundColor: c }}
                      aria-label={c}
                    />
                  ))}
                </div>
              </div>
            </div>
            ) : null}

            {error ? (
              <p className="mt-4 text-[13px] text-rose-300" role="alert">
                {error}
              </p>
            ) : null}

            {canComplete ? (
              <button
                type="submit"
                disabled={!canSubmit}
                className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-[14px] font-semibold text-[#0b0c10] transition enabled:hover:bg-white/90 disabled:opacity-40"
              >
                {busy ? "Salvando…" : "Entrar no painel"}
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : null}
          </form>
        </main>
      </div>
    </div>
  );
}
