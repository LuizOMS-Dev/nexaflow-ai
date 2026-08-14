"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Globe2,
  ImagePlus,
  Mail,
  MapPin,
  Palette,
  Phone,
  Trash2,
  Upload,
} from "lucide-react";
import { api } from "@/lib/api";
import { Logo } from "@/components/brand/logo";
import { AuthShowcase } from "@/components/auth/auth-showcase";
import { AuthTransition, markAppEntrance } from "@/components/auth/auth-transition";
import { useAuth } from "@/store/auth";
import { needsCompanyOnboarding } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

type CompanyPayload = {
  id: string;
  name: string;
  slug: string;
  primaryColor: string;
  logoUrl?: string | null;
  settings?: Record<string, unknown>;
  plan?: unknown;
};

const SEGMENTS = [
  { id: "comercio", label: "Comércio" },
  { id: "servicos", label: "Serviços" },
  { id: "saude", label: "Saúde" },
  { id: "educacao", label: "Educação" },
  { id: "imobiliario", label: "Imobiliário" },
  { id: "automotivo", label: "Automotivo" },
  { id: "alimentacao", label: "Alimentação" },
  { id: "tecnologia", label: "Tecnologia" },
  { id: "outro", label: "Outro" },
];

const COLORS = [
  "#4F46E5",
  "#7C3AED",
  "#0891B2",
  "#059669",
  "#D97706",
  "#E11D48",
  "#2563EB",
  "#0F172A",
];

const STEPS = [
  { id: 1, title: "Empresa", desc: "Nome e segmento" },
  { id: 2, title: "Contato", desc: "Telefone e site" },
  { id: 3, title: "Personalização", desc: "Cidade e identidade" },
];

function maskPhoneBR(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function isGenericName(name?: string | null) {
  if (!name) return true;
  const n = name.trim().toLowerCase();
  return (
    n === "administrador" ||
    n === "admin" ||
    n === "user" ||
    n === "usuário" ||
    n === "usuario"
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user, tenant, setSession, token, memberships, logout } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [stepDir, setStepDir] = useState<"forward" | "back">("forward");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [btnDone, setBtnDone] = useState(false);
  const [overlayStage, setOverlayStage] = useState<"prepare" | "exit">("prepare");
  const [savedName, setSavedName] = useState("");
  const [savedLogo, setSavedLogo] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [segmentOther, setSegmentOther] = useState("");
  /** véu escuro que some após vir do login — evita corte seco */
  const [continuityVeil, setContinuityVeil] = useState(false);
  const [form, setForm] = useState({
    name: tenant?.name && tenant.name !== "Minha Empresa" ? tenant.name : "",
    segment: "",
    phone: "",
    website: "",
    commercialEmail: "",
    city: "",
    state: "",
    primaryColor: tenant?.primaryColor || "#4F46E5",
    logoUrl: (tenant?.logoUrl as string) || "",
  });

  const firstName = useMemo(() => {
    const n = user?.name?.trim() || "";
    if (!n || isGenericName(n)) return "";
    return n.split(/\s+/)[0];
  }, [user?.name]);

  useEffect(() => {
    if (tenant && !needsCompanyOnboarding(tenant) && !success) {
      router.replace("/app");
    }
  }, [tenant, router, success]);

  // Crossfade vindo do login: mantém o fundo dark e revela o formulário por baixo
  useEffect(() => {
    try {
      if (sessionStorage.getItem("nexaflow_from_login") === "1") {
        sessionStorage.removeItem("nexaflow_from_login");
        setContinuityVeil(true);
        const t = window.setTimeout(() => setContinuityVeil(false), 780);
        return () => window.clearTimeout(t);
      }
    } catch {
      /* ignore */
    }
  }, []);

  function validateStep(s: number) {
    if (s === 1) {
      if (form.name.trim().length < 2) {
        setError("Informe o nome da empresa.");
        setShake(true);
        setTimeout(() => setShake(false), 400);
        return false;
      }
      if (form.segment === "outro" && segmentOther.trim().length < 2) {
        setError("Informe o segmento da empresa.");
        setShake(true);
        setTimeout(() => setShake(false), 400);
        return false;
      }
    }
    if (s === 2 && form.commercialEmail.trim()) {
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.commercialEmail.trim());
      if (!ok) {
        setError("Informe um e-mail comercial válido.");
        setShake(true);
        setTimeout(() => setShake(false), 400);
        return false;
      }
    }
    setError("");
    return true;
  }

  function next() {
    if (!validateStep(step)) return;
    setStepDir("forward");
    setStep((v) => Math.min(3, v + 1));
  }

  function back() {
    setError("");
    setStepDir("back");
    setStep((v) => Math.max(1, v - 1));
  }

  function onLogoFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Envie uma imagem (PNG, JPG ou SVG).");
      return;
    }
    if (file.size > 1.8 * 1024 * 1024) {
      setError("A logo deve ter no máximo 1,8 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((f) => ({ ...f, logoUrl: String(reader.result || "") }));
      setError("");
    };
    reader.readAsDataURL(file);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validateStep(1)) {
      setStep(1);
      return;
    }
    if (!validateStep(2)) {
      setStep(2);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const segmentValue =
        form.segment === "outro"
          ? segmentOther.trim()
          : SEGMENTS.find((s) => s.id === form.segment)?.label || form.segment || undefined;

      const updated = await api<CompanyPayload>("/onboarding/company", {
        method: "POST",
        json: {
          name: form.name.trim(),
          segment: segmentValue,
          phone: form.phone.trim() || undefined,
          website: form.website.trim() || undefined,
          commercialEmail: form.commercialEmail.trim() || undefined,
          city: form.city.trim() || undefined,
          state: form.state.trim() || undefined,
          primaryColor: form.primaryColor,
          logoUrl: form.logoUrl || null,
        },
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

      setSavedName(updated.name);
      setSavedLogo(updated.logoUrl || form.logoUrl || null);
      setLoading(false);
      setBtnDone(true);
      markAppEntrance("onboarding");

      window.setTimeout(() => setSuccess(true), 420);
      window.setTimeout(() => setOverlayStage("exit"), 1450);
      window.setTimeout(() => router.replace("/app"), 1850);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
      setShake(true);
      setTimeout(() => setShake(false), 400);
      setLoading(false);
    }
  }

  if (success) {
    return (
      <AuthTransition
        mode="onboarding-done"
        stage={overlayStage}
        companyName={savedName}
        companyLogo={savedLogo}
      />
    );
  }

  return (
    <div className="grid min-h-screen bg-[#06060f] lg:grid-cols-[1.08fr_0.92fr] xl:grid-cols-[1.04fr_0.96fr]">
      {continuityVeil && (
        <div className="nf-continuity-veil nf-continuity-veil-out" aria-hidden />
      )}
      <AuthShowcase variant="onboarding" />

      {/* mobile header */}
      <div className="relative flex min-h-screen flex-col overflow-hidden lg:justify-center">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute inset-0 bg-gradient-to-br from-[#0b0b18] via-[#0c0b1a] to-[#070712]" />
          <div className="nf-login-right-glow absolute -right-16 top-[15%] h-[380px] w-[380px] rounded-full bg-indigo-600/[0.18] blur-[100px]" />
          <div className="absolute -left-16 bottom-0 h-[260px] w-[260px] rounded-full bg-violet-700/[0.12] blur-[90px]" />
        </div>

        {/* header mobile com arte sutil */}
        <div className="relative border-b border-white/[0.06] px-5 py-4 lg:hidden">
          <div
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              backgroundImage: "url(/brand/login-bg-art.png)",
              backgroundSize: "cover",
              backgroundPosition: "50% 30%",
            }}
          />
          <div className="absolute inset-0 bg-[#06060f]/75" />
          <div className="relative flex items-center justify-between">
            <Logo variant="full-white" size="sm" withAi />
            <button
              type="button"
              className="text-[12px] text-white/[0.45] transition hover:text-white/80"
              onClick={() => {
                logout();
                router.replace("/login");
              }}
            >
              Sair
            </button>
          </div>
        </div>

        <div className="nf-onboard-enter relative mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center px-5 py-8 sm:px-8 lg:py-12">
          <div className="mb-6 hidden items-center justify-end lg:flex">
            <button
              type="button"
              className="text-[12px] text-white/40 transition hover:text-white/75"
              onClick={() => {
                logout();
                router.replace("/login");
              }}
            >
              Usar outra conta
            </button>
          </div>

          <div className="nf-anim-up mb-7">
            {firstName ? (
              <>
                <p className="mb-1.5 text-[13px] text-white/[0.45]">Olá, {firstName}.</p>
                <h2 className="font-display text-[1.5rem] font-semibold tracking-[-0.03em] text-white sm:text-[1.6rem]">
                  Vamos configurar sua empresa?
                </h2>
              </>
            ) : (
              <h2 className="font-display text-[1.5rem] font-semibold tracking-[-0.03em] text-white sm:text-[1.6rem]">
                Vamos começar pela sua empresa
              </h2>
            )}
            <p className="mt-2 text-[14px] leading-relaxed text-white/[0.48]">
              Essas informações serão usadas para personalizar seu painel.
            </p>
          </div>

          {/* steps indicator */}
          <div className="nf-anim-up nf-delay-1 mb-7">
            <div className="flex items-center gap-2">
              {STEPS.map((s, i) => {
                const active = step === s.id;
                const done = step > s.id;
                return (
                  <div key={s.id} className="flex min-w-0 flex-1 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (done || (s.id === step + 1 && validateStep(step))) setStep(s.id);
                        if (s.id < step) setStep(s.id);
                      }}
                      className="group flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold transition-all duration-300",
                          active &&
                            "bg-gradient-to-br from-indigo-500 to-violet-600 text-white ring-2 ring-violet-400/[0.35] shadow-[0_0_18px_rgba(124,58,237,0.4)]",
                          done && !active && "bg-emerald-500/[0.15] text-emerald-300 ring-1 ring-emerald-400/25",
                          !active && !done && "bg-white/[0.04] text-white/30 ring-1 ring-white/[0.08]"
                        )}
                      >
                        {done && !active ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : s.id}
                      </span>
                      <span className="min-w-0 hidden sm:block">
                        <span
                          className={cn(
                            "block truncate text-[12px] font-semibold tracking-tight transition-colors",
                            active ? "text-white" : done ? "text-emerald-200/80" : "text-white/[0.35]"
                          )}
                        >
                          {s.title}
                        </span>
                        <span className="block truncate text-[10.5px] text-white/30">{s.desc}</span>
                      </span>
                    </button>
                    {i < STEPS.length - 1 && (
                      <span
                        className={cn(
                          "hidden h-px w-4 shrink-0 sm:block md:w-6",
                          done ? "bg-emerald-400/40" : "bg-white/10"
                        )}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            {/* progress bar */}
            <div className="mt-4 h-[2px] overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-400 ease-out"
                style={{ width: `${(step / 3) * 100}%` }}
              />
            </div>
          </div>

          <form
            onSubmit={onSubmit}
            className={cn(
              "nf-login-glass relative overflow-hidden rounded-[1.35rem] border border-white/[0.1] p-6 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.65)] sm:p-7 transition-all duration-500",
              shake && "nf-shake",
              btnDone && "nf-auth-form-dim"
            )}
          >
            <div
              className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent"
              aria-hidden
            />

            {error && (
              <div className="mb-4 rounded-xl border border-red-400/20 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-200">
                {error}
              </div>
            )}

            <div
              key={step}
              className={cn(
                "space-y-5",
                stepDir === "forward" ? "nf-step-forward" : "nf-step-back"
              )}
            >
              {step === 1 && (
                <>
                  <div>
                    <label className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-white/40">
                      <Building2 className="h-3 w-3" />
                      Nome da empresa
                    </label>
                    <input
                      className="nf-login-input h-12 w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-3.5 text-[15px] text-white outline-none transition placeholder:text-white/25 focus:border-indigo-400/[0.45] focus:bg-white/[0.06]"
                      placeholder="Ex.: NexaFlow Tecnologia"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      autoFocus
                      required
                      minLength={2}
                      maxLength={120}
                    />
                  </div>

                  <div>
                    <label className="mb-2.5 block text-[11px] font-medium uppercase tracking-[0.1em] text-white/40">
                      Qual é o segmento da empresa?
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {SEGMENTS.map((s) => {
                        const on = form.segment === s.id;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setForm({ ...form, segment: on ? "" : s.id })}
                            className={cn(
                              "rounded-full px-3 py-1.5 text-[12px] font-medium transition-all duration-200",
                              on
                                ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-[0_6px_16px_-6px_rgba(99,102,241,0.55)]"
                                : "bg-white/[0.05] text-white/[0.55] ring-1 ring-white/10 hover:bg-white/[0.08] hover:text-white/80"
                            )}
                          >
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                    {form.segment === "outro" && (
                      <input
                        className="nf-login-input mt-3 h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-3.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-indigo-400/[0.45]"
                        placeholder="Qual segmento?"
                        value={segmentOther}
                        onChange={(e) => setSegmentOther(e.target.value)}
                        autoFocus
                      />
                    )}
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div>
                    <label className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-white/40">
                      <Phone className="h-3 w-3" />
                      Telefone ou WhatsApp
                    </label>
                    <input
                      className="nf-login-input h-12 w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-3.5 text-[15px] text-white outline-none placeholder:text-white/25 focus:border-indigo-400/[0.45]"
                      placeholder="(11) 99999-0000"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: maskPhoneBR(e.target.value) })}
                      inputMode="tel"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-white/40">
                      <Globe2 className="h-3 w-3" />
                      Site <span className="normal-case tracking-normal text-white/25">(opcional)</span>
                    </label>
                    <input
                      className="nf-login-input h-12 w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-3.5 text-[15px] text-white outline-none placeholder:text-white/25 focus:border-indigo-400/[0.45]"
                      placeholder="https://suaempresa.com.br"
                      value={form.website}
                      onChange={(e) => setForm({ ...form, website: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-white/40">
                      <Mail className="h-3 w-3" />
                      E-mail comercial
                    </label>
                    <input
                      className="nf-login-input h-12 w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-3.5 text-[15px] text-white outline-none placeholder:text-white/25 focus:border-indigo-400/[0.45]"
                      placeholder="contato@suaempresa.com.br"
                      type="email"
                      value={form.commercialEmail}
                      onChange={(e) => setForm({ ...form, commercialEmail: e.target.value })}
                    />
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-white/40">
                        <MapPin className="h-3 w-3" />
                        Cidade
                      </label>
                      <input
                        className="nf-login-input h-12 w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-3.5 text-[15px] text-white outline-none placeholder:text-white/25 focus:border-indigo-400/[0.45]"
                        placeholder="São Paulo"
                        value={form.city}
                        onChange={(e) => setForm({ ...form, city: e.target.value })}
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-[11px] font-medium uppercase tracking-[0.1em] text-white/40">
                        Estado
                      </label>
                      <input
                        className="nf-login-input h-12 w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-3.5 text-[15px] uppercase text-white outline-none placeholder:text-white/25 focus:border-indigo-400/[0.45]"
                        placeholder="SP"
                        value={form.state}
                        onChange={(e) =>
                          setForm({ ...form, state: e.target.value.toUpperCase().slice(0, 2) })
                        }
                        maxLength={2}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-white/40">
                      <ImagePlus className="h-3 w-3" />
                      Logotipo da empresa
                    </label>
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]"
                        style={{ backgroundColor: form.logoUrl ? "transparent" : undefined }}
                      >
                        {form.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={form.logoUrl} alt="Logo" className="h-full w-full object-contain p-1" />
                        ) : (
                          <Building2 className="h-5 w-5 text-white/25" />
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-[12px] font-medium text-white/70 transition hover:bg-white/[0.07]"
                          onClick={() => fileRef.current?.click()}
                        >
                          <Upload className="h-3.5 w-3.5" />
                          {form.logoUrl ? "Substituir" : "Enviar"}
                        </button>
                        {form.logoUrl && (
                          <button
                            type="button"
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-[12px] font-medium text-white/[0.45] transition hover:border-red-400/30 hover:text-red-300"
                            onClick={() => setForm({ ...form, logoUrl: "" })}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remover
                          </button>
                        )}
                      </div>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => onLogoFile(e.target.files?.[0] || null)}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-white/40">
                      <Palette className="h-3 w-3" />
                      Cor principal da marca
                    </label>
                    <div className="flex flex-wrap items-center gap-2.5">
                      {COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setForm({ ...form, primaryColor: c })}
                          className={cn(
                            "h-9 w-9 rounded-full transition-transform duration-200 hover:scale-105",
                            form.primaryColor.toLowerCase() === c.toLowerCase() &&
                              "ring-2 ring-white/50 ring-offset-2 ring-offset-[#0c0b18]"
                          )}
                          style={{ backgroundColor: c }}
                          title={c}
                        />
                      ))}
                      <label className="relative flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-white/20">
                        <input
                          type="color"
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                          value={form.primaryColor}
                          onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                        />
                        <span className="text-[10px] font-medium text-white/40">+</span>
                      </label>
                    </div>

                    {/* prévia identidade no painel */}
                    <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]">
                      <div
                        className="flex items-center gap-2.5 px-3.5 py-2.5"
                        style={{
                          background: `linear-gradient(90deg, ${form.primaryColor}33, transparent)`,
                          borderBottom: `1px solid ${form.primaryColor}40`,
                        }}
                      >
                        <div
                          className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg text-[10px] font-bold text-white"
                          style={{ backgroundColor: form.primaryColor }}
                        >
                          {form.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={form.logoUrl} alt="" className="h-full w-full object-contain" />
                          ) : (
                            (form.name || "NE").slice(0, 2).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-semibold text-white/90">
                            {form.name || "Sua empresa"}
                          </p>
                          <p className="text-[10px] text-white/[0.35]">Prévia do painel</p>
                        </div>
                        <span
                          className="ml-auto rounded-md px-2 py-0.5 text-[10px] font-medium text-white"
                          style={{ backgroundColor: form.primaryColor }}
                        >
                          Ação
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="flex items-center gap-2.5 pt-1">
                {step > 1 && (
                  <button
                    type="button"
                    className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] text-[14px] font-medium text-white/70 transition hover:bg-white/[0.06]"
                    onClick={back}
                    disabled={loading}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar
                  </button>
                )}
                {step < 3 ? (
                  <button
                    type="button"
                    className="nf-login-cta inline-flex h-11 flex-[1.4] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-[14px] font-semibold text-white shadow-[0_10px_28px_-10px_rgba(99,102,241,0.55)] transition hover:brightness-110"
                    onClick={next}
                  >
                    Continuar
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    className={cn(
                      "nf-login-cta inline-flex h-11 flex-[1.6] items-center justify-center gap-2 rounded-xl text-[14px] font-semibold text-white shadow-[0_10px_28px_-10px_rgba(99,102,241,0.55)] transition disabled:opacity-50",
                      btnDone
                        ? "nf-auth-btn-success"
                        : "bg-gradient-to-r from-indigo-500 to-violet-600 hover:brightness-110"
                    )}
                    disabled={loading || btnDone}
                  >
                    {btnDone ? (
                      <>
                        <Check className="h-4 w-4" strokeWidth={2.5} />
                        Tudo pronto
                      </>
                    ) : loading ? (
                      <span className="inline-flex items-center gap-2">
                        Finalizando
                        <span className="nf-auth-dots" aria-hidden>
                          <i />
                          <i />
                          <i />
                        </span>
                      </span>
                    ) : (
                      <>
                        Concluir configuração
                        <Check className="h-4 w-4" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </form>

          <p className="mt-6 text-center text-[11px] text-white/[0.28]">
            Passo {step} de 3
          </p>
        </div>
      </div>
    </div>
  );
}
