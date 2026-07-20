"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";
import { api, isSuperadminMfaRequiredError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { cn, formatCurrency } from "@/lib/utils";
import {
  DialogFooter,
  EmptyState,
  FormField,
  FormSection,
  Modal,
  MoneyInput,
  NumberInput,
  Select,
  Spinner,
  Switch,
  useToast,
} from "@/components/ui";
import { AdminPageHeader } from "../admin-page-header";

type Plan = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  priceMonthly: string | number;
  priceAnnual?: string | number | null;
  priceOnRequest?: boolean;
  maxUsers: number;
  maxChannels: number;
  maxContacts: number;
  maxConversations: number;
  maxAiMessages: number;
  badge?: string | null;
  sortOrder?: number;
  isActive: boolean;
  features?: Record<string, unknown> | null;
  _count?: { tenants: number };
};

type PlanForm = {
  name: string;
  description: string;
  priceType: "fixed" | "on_request";
  priceMonthly: string;
  priceAnnual: string;
  maxUsers: string;
  maxChannels: string;
  maxAgents: string;
  maxContacts: string;
  maxActiveFlows: string;
  maxAiMessages: string;
  isActive: boolean;
  badge: string;
  sortOrder: string;
};

const PRICE_TYPE_OPTIONS = [
  { value: "fixed", label: "Preço fixo" },
  { value: "on_request", label: "Sob consulta" },
];

/** Valores internos de badge → rótulos humanos na UI */
const BADGE_OPTIONS = [
  { value: "", label: "Nenhum" },
  { value: "popular", label: "Mais popular" },
  { value: "recommended", label: "Recomendado" },
  { value: "best_value", label: "Melhor custo-benefício" },
];

function limitLabel(n: number, isEnterprise: boolean): string {
  if (isEnterprise || n >= 999) return "Personalizado";
  return n.toLocaleString("pt-BR");
}

function featureNum(feats: Record<string, unknown> | null | undefined, key: string, fallback: number) {
  const n = Number(feats?.[key] ?? fallback);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parseNonNegInt(raw: string, fallback: number): number {
  if (raw.trim() === "") return fallback;
  const n = Number(String(raw).replace(/\D/g, ""));
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.trunc(n);
}

function annualFromMonthly(monthly: number): number {
  return Math.round(monthly * 12 * 0.85 * 100) / 100;
}

function planToForm(p: Plan): PlanForm {
  const feats = (p.features || {}) as Record<string, unknown>;
  const onRequest = Boolean(p.priceOnRequest) || p.slug === "enterprise";
  return {
    name: p.name,
    description: p.description || "",
    priceType: onRequest ? "on_request" : "fixed",
    priceMonthly:
      p.priceMonthly != null && p.priceMonthly !== ""
        ? String(Number(p.priceMonthly))
        : "",
    priceAnnual:
      p.priceAnnual != null && p.priceAnnual !== ""
        ? String(Number(p.priceAnnual))
        : "",
    maxUsers: String(p.maxUsers ?? 1),
    maxChannels: String(p.maxChannels ?? 1),
    maxAgents: String(featureNum(feats, "maxAgents", 1)),
    maxContacts: String(p.maxContacts ?? 0),
    maxActiveFlows: String(
      featureNum(feats, "maxActiveFlows", featureNum(feats, "maxAutomations", 5))
    ),
    maxAiMessages: String(
      featureNum(feats, "monthlyAiCredits", p.maxAiMessages ?? 0)
    ),
    isActive: p.isActive,
    badge: p.badge && BADGE_OPTIONS.some((o) => o.value === p.badge) ? p.badge : p.badge || "",
    sortOrder: String(p.sortOrder ?? 0),
  };
}

export default function AdminPlansPage() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [edit, setEdit] = useState<Plan | null>(null);
  const [form, setForm] = useState<PlanForm>(() => ({
    name: "",
    description: "",
    priceType: "fixed",
    priceMonthly: "",
    priceAnnual: "",
    maxUsers: "",
    maxChannels: "",
    maxAgents: "",
    maxContacts: "",
    maxActiveFlows: "",
    maxAiMessages: "",
    isActive: true,
    badge: "",
    sortOrder: "",
  }));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof PlanForm, string>>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () => api<Plan[]>("/admin/plans"),
    enabled: user?.platformRole === "SUPERADMIN",
  });

  const suggestedAnnual = useMemo(() => {
    if (form.priceType !== "fixed") return null;
    const m = Number(form.priceMonthly);
    if (!Number.isFinite(m) || m <= 0) return null;
    return annualFromMonthly(m);
  }, [form.priceMonthly, form.priceType]);

  const save = useMutation({
    mutationFn: () => {
      if (!edit) throw new Error("Plano inválido");

      const errors: Partial<Record<keyof PlanForm, string>> = {};
      if (!form.name.trim()) errors.name = "Informe o nome do plano.";

      const onRequest = form.priceType === "on_request";
      let priceMonthly = 0;
      let priceAnnual: number | null = null;

      if (!onRequest) {
        const m = Number(String(form.priceMonthly).replace(",", "."));
        if (form.priceMonthly.trim() === "" || !Number.isFinite(m) || m < 0) {
          errors.priceMonthly = "Informe um preço mensal válido.";
        } else {
          priceMonthly = Math.round(m * 100) / 100;
        }
        if (form.priceAnnual.trim()) {
          const a = Number(String(form.priceAnnual).replace(",", "."));
          if (!Number.isFinite(a) || a < 0) {
            errors.priceAnnual = "Preço anual inválido.";
          } else {
            priceAnnual = Math.round(a * 100) / 100;
          }
        }
      }

      const maxUsers = parseNonNegInt(form.maxUsers, NaN);
      const maxChannels = parseNonNegInt(form.maxChannels, NaN);
      const maxAgents = parseNonNegInt(form.maxAgents, NaN);
      const maxContacts = parseNonNegInt(form.maxContacts, NaN);
      const maxActiveFlows = parseNonNegInt(form.maxActiveFlows, NaN);
      const maxAiMessages = parseNonNegInt(form.maxAiMessages, NaN);
      const sortOrder = parseNonNegInt(form.sortOrder, NaN);

      if (!Number.isFinite(maxUsers) || maxUsers < 1) errors.maxUsers = "Mínimo 1.";
      if (!Number.isFinite(maxChannels) || maxChannels < 1) errors.maxChannels = "Mínimo 1.";
      if (!Number.isFinite(maxAgents) || maxAgents < 0) errors.maxAgents = "Valor inválido.";
      if (!Number.isFinite(maxContacts) || maxContacts < 0) errors.maxContacts = "Valor inválido.";
      if (!Number.isFinite(maxActiveFlows) || maxActiveFlows < 0)
        errors.maxActiveFlows = "Valor inválido.";
      if (!Number.isFinite(maxAiMessages) || maxAiMessages < 0)
        errors.maxAiMessages = "Valor inválido.";
      if (!Number.isFinite(sortOrder) || sortOrder < 0) errors.sortOrder = "Valor inválido.";

      if (Object.keys(errors).length) {
        setFieldErrors(errors);
        throw new Error("Revise os campos destacados.");
      }
      setFieldErrors({});

      const prevFeats = (edit.features && typeof edit.features === "object"
        ? { ...edit.features }
        : {}) as Record<string, unknown>;

      const features = {
        ...prevFeats,
        maxAgents,
        maxActiveFlows,
        monthlyAiCredits: maxAiMessages,
      };

      const badgeValue = form.badge.trim() || null;

      return api(`/admin/plans/${edit.id}`, {
        method: "PATCH",
        json: {
          name: form.name.trim(),
          description: form.description.trim() || null,
          priceMonthly: onRequest ? 0 : priceMonthly,
          priceAnnual: onRequest ? null : priceAnnual,
          priceOnRequest: onRequest,
          maxUsers,
          maxChannels,
          maxContacts,
          maxAiMessages,
          isActive: form.isActive,
          badge: badgeValue,
          sortOrder,
          features,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
      setEdit(null);
      setFieldErrors({});
      toast({
        kind: "success",
        title: "Plano atualizado",
        description: "Preços contratados das empresas existentes foram preservados.",
      });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível salvar", description: e.message }),
  });

  function openEdit(p: Plan) {
    setEdit(p);
    setForm(planToForm(p));
    setFieldErrors({});
  }

  function patchForm<K extends keyof PlanForm>(key: K, value: PlanForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  if (user?.platformRole !== "SUPERADMIN") return null;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (error) {
    if (isSuperadminMfaRequiredError(error)) return null;
    return (
      <EmptyState
        title="Não foi possível carregar planos"
        description="Tente novamente em instantes."
      />
    );
  }

  const plans = (data || []).filter(
    (p) => p.isActive || (p._count?.tenants ?? 0) > 0 || p.slug === "free"
  );

  const isEnterpriseEdit =
    edit?.slug === "enterprise" || form.priceType === "on_request";

  const badgeSelectOptions = useMemo(() => {
    if (form.badge && !BADGE_OPTIONS.some((o) => o.value === form.badge)) {
      return [...BADGE_OPTIONS, { value: form.badge, label: form.badge }];
    }
    return BADGE_OPTIONS;
  }, [form.badge]);

  return (
    <div className="mx-auto max-w-[1400px]">
      <AdminPageHeader
        title="Planos"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {plans.map((p) => {
          const feats = (p.features || {}) as Record<string, unknown>;
          const maxAgents = featureNum(feats, "maxAgents", 1);
          const aiCredits = featureNum(feats, "monthlyAiCredits", p.maxAiMessages);
          const monthly = Number(p.priceMonthly || 0);
          const isEnterprise = p.slug === "enterprise" || Boolean(p.priceOnRequest);
          const isFree = p.slug === "free";
          const isPopular = p.badge === "popular";
          const isFeatured =
            isPopular ||
            p.badge === "recommended" ||
            p.slug === "pro" ||
            p.slug === "business";
          const annual =
            p.priceAnnual != null && p.priceAnnual !== ""
              ? Number(p.priceAnnual)
              : !isEnterprise && monthly > 0
                ? annualFromMonthly(monthly)
                : null;

          return (
            <article
              key={p.id}
              className={cn(
                "relative flex h-full flex-col rounded-2xl border p-4 transition-[border-color,background-color] duration-200 sm:p-5",
                isEnterprise
                  ? "border-violet-500/20 bg-gradient-to-b from-violet-500/[0.06] to-white dark:from-violet-400/[0.08] dark:to-[#14171e]/50"
                  : isFeatured && p.isActive
                    ? "border-violet-500/[0.15] bg-white shadow-[0_0_0_1px_rgba(124,58,237,0.04)] dark:border-violet-400/20 dark:bg-[#14171e]/[0.55]"
                    : !p.isActive
                      ? "border-black/[0.04] bg-black/[0.015] opacity-90 dark:border-white/[0.05] dark:bg-white/[0.02]"
                      : isFree
                        ? "border-black/[0.05] bg-white dark:border-white/[0.07] dark:bg-[#14171e]/40"
                        : "border-black/[0.05] bg-white dark:border-white/[0.07] dark:bg-[#14171e]/50"
              )}
            >
              {/* Topo */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h2 className="font-display text-[15px] font-semibold tracking-tight text-ink dark:text-white">
                      {p.name}
                    </h2>
                    {isPopular ? (
                      <span className="badge-brand text-[10px]">Mais popular</span>
                    ) : p.badge === "recommended" ? (
                      <span className="badge-brand text-[10px]">Recomendado</span>
                    ) : p.badge === "best_value" ? (
                      <span className="badge-brand text-[10px]">Melhor custo-benefício</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">
                    {p.slug}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                    p.isActive
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-black/[0.06] bg-black/[0.03] text-ink-faint dark:border-white/[0.08] dark:bg-white/[0.04]"
                  )}
                >
                  {p.isActive ? "Ativo" : "Inativo"}
                </span>
              </div>

              {/* Preço */}
              <div className="mt-4 min-h-[3.25rem]">
                {isEnterprise ? (
                  <div>
                    <p className="font-display text-[1.35rem] font-semibold tracking-tight text-ink dark:text-white">
                      Sob consulta
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-ink-faint">
                      Comercial sob medida
                    </p>
                  </div>
                ) : isFree || monthly <= 0 ? (
                  <div>
                    <p className="font-display text-[1.35rem] font-semibold tracking-tight text-ink dark:text-white">
                      Gratuito
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-ink-faint">
                      Entrada e teste da plataforma
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="font-display text-[1.45rem] font-semibold leading-none tracking-tight tabular-nums text-ink dark:text-white">
                      {formatCurrency(monthly)}
                      <span className="ml-1 text-[12px] font-normal text-ink-faint">
                        /mês
                      </span>
                    </p>
                    {annual != null ? (
                      <p className="mt-1.5 text-[12px] text-ink-muted">
                        {formatCurrency(annual)}{" "}
                        <span className="text-ink-faint">no plano anual</span>
                      </p>
                    ) : null}
                  </>
                )}
              </div>

              {p.description ? (
                <p className="mt-3 line-clamp-2 text-[12.5px] leading-relaxed text-ink-muted">
                  {p.description}
                </p>
              ) : (
                <div className="mt-3 h-[2.4rem]" aria-hidden />
              )}

              {/* Limites */}
              <div className="mt-4 flex-1 rounded-xl border border-black/[0.04] bg-black/[0.015] px-3 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.025]">
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                  {(
                    [
                      ["Usuários", limitLabel(p.maxUsers, isEnterprise)],
                      ["WhatsApp", limitLabel(p.maxChannels, isEnterprise)],
                      ["Agentes IA", limitLabel(maxAgents, isEnterprise)],
                      ["Contatos", limitLabel(p.maxContacts, isEnterprise)],
                      [
                        "Créditos IA",
                        isEnterprise
                          ? "Personalizado"
                          : aiCredits.toLocaleString("pt-BR"),
                      ],
                      ["Clientes", String(p._count?.tenants ?? 0)],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="min-w-0">
                      <dt className="text-[10px] font-medium uppercase tracking-wide text-ink-faint">
                        {k}
                      </dt>
                      <dd className="mt-0.5 truncate text-[12.5px] font-semibold tabular-nums text-ink dark:text-white">
                        {v}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2 border-t border-black/[0.04] pt-3.5 dark:border-white/[0.06]">
                <p className="text-[11px] text-ink-faint">
                  {(p._count?.tenants ?? 0) === 1
                    ? "1 empresa no plano"
                    : `${p._count?.tenants ?? 0} empresas no plano`}
                </p>
                <button
                  type="button"
                  className="btn-secondary h-8 px-3.5 text-[12px] font-medium"
                  onClick={() => openEdit(p)}
                >
                  Editar
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <Modal
        open={!!edit}
        onClose={() => {
          if (save.isPending) return;
          setEdit(null);
          setFieldErrors({});
        }}
        title={edit ? `Editar ${edit.name}` : "Editar plano"}
        description={edit?.slug ? edit.slug : undefined}
        size="lg"
        variant="contextual"
        initialFocus="panel"
        preventClose={save.isPending}
        footer={
          <DialogFooter>
            <button
              type="button"
              className="btn-secondary h-9 px-3.5"
              onClick={() => {
                setEdit(null);
                setFieldErrors({});
              }}
              disabled={save.isPending}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="nf-edit-plan"
              className="btn-primary h-9 px-4"
              disabled={save.isPending}
            >
              {save.isPending ? "Salvando…" : "Salvar alterações"}
            </button>
          </DialogFooter>
        }
      >
        <form
          id="nf-edit-plan"
          className="space-y-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void save.mutateAsync().catch(() => {
              /* toast no onError */
            });
          }}
        >
          {/* Status no topo — compacto, chavinha sm */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-black/[0.05] bg-black/[0.015] px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.025]">
            <div className="min-w-0">
              <p className="text-[12.5px] font-medium text-ink dark:text-white">
                Plano disponível
              </p>
              <p className="text-[11px] leading-snug text-ink-faint">
                Novas empresas podem contratar este plano
              </p>
            </div>
            <Switch
              id="plan-available"
              size="sm"
              checked={form.isActive}
              onChange={(isActive) => patchForm("isActive", isActive)}
              aria-label="Plano disponível"
            />
          </div>

          <FormSection title="Informações" surface>
            <FormField label="Nome" required error={fieldErrors.name}>
              <input
                className="input"
                value={form.name}
                onChange={(e) => patchForm("name", e.target.value)}
                required
                autoComplete="off"
              />
            </FormField>
            <FormField label="Descrição">
              <textarea
                className="input min-h-[56px]"
                value={form.description}
                onChange={(e) => patchForm("description", e.target.value)}
                placeholder="Ex.: Para equipes em crescimento"
              />
            </FormField>
          </FormSection>

          <FormSection
            title="Preço"
            description="Alterar o preço não modifica contratos existentes."
            surface
          >
            <FormField label="Tipo de preço">
              <Select
                value={form.priceType}
                onChange={(v) =>
                  patchForm("priceType", v === "on_request" ? "on_request" : "fixed")
                }
                options={PRICE_TYPE_OPTIONS}
                aria-label="Tipo de preço"
              />
            </FormField>

            {form.priceType === "fixed" ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField
                    label="Mensal"
                    required
                    error={fieldErrors.priceMonthly}
                  >
                    <MoneyInput
                      id="plan-price-monthly"
                      value={form.priceMonthly}
                      onChange={(v) => patchForm("priceMonthly", v)}
                      placeholder="99,00"
                    />
                  </FormField>
                  <FormField
                    label="Anual"
                    error={fieldErrors.priceAnnual}
                    hint={
                      suggestedAnnual != null
                        ? `Sugestão −15%: ${formatCurrency(suggestedAnnual)}`
                        : undefined
                    }
                  >
                    <MoneyInput
                      id="plan-price-annual"
                      value={form.priceAnnual}
                      onChange={(v) => patchForm("priceAnnual", v)}
                      placeholder="1.009,80"
                    />
                  </FormField>
                </div>
                {suggestedAnnual != null &&
                (!form.priceAnnual.trim() ||
                  Math.abs(Number(form.priceAnnual) - suggestedAnnual) > 0.009) ? (
                  <button
                    type="button"
                    className="text-[11px] font-medium text-brand-600 hover:underline dark:text-brand-400"
                    onClick={() => patchForm("priceAnnual", String(suggestedAnnual))}
                  >
                    Usar anual sugerido ({formatCurrency(suggestedAnnual)})
                  </button>
                ) : null}
              </>
            ) : (
              <p className="rounded-lg border border-line-soft px-3 py-2 text-[12px] leading-relaxed text-ink-muted dark:border-white/[0.06]">
                Catálogo mostra <strong className="font-medium text-ink dark:text-white">Sob consulta</strong>
                . Não é tratado como gratuito.
              </p>
            )}
          </FormSection>

          <div className="border-t border-black/[0.05] dark:border-white/[0.06]" />

          <FormSection
            title="Limites"
            description={
              isEnterpriseEdit
                ? "Valores de referência para Enterprise."
                : undefined
            }
            surface
          >
            <div className="grid gap-2.5 sm:grid-cols-2">
              <FormField label="Usuários" error={fieldErrors.maxUsers}>
                <NumberInput
                  id="plan-max-users"
                  value={form.maxUsers}
                  onChange={(v) => patchForm("maxUsers", v)}
                  min={1}
                  placeholder="2"
                />
              </FormField>
              <FormField label="WhatsApp" error={fieldErrors.maxChannels}>
                <NumberInput
                  id="plan-max-channels"
                  value={form.maxChannels}
                  onChange={(v) => patchForm("maxChannels", v)}
                  min={1}
                  placeholder="1"
                />
              </FormField>
              <FormField label="Agentes IA" error={fieldErrors.maxAgents}>
                <NumberInput
                  id="plan-max-agents"
                  value={form.maxAgents}
                  onChange={(v) => patchForm("maxAgents", v)}
                  min={0}
                  placeholder="1"
                />
              </FormField>
              <FormField label="Contatos" error={fieldErrors.maxContacts}>
                <NumberInput
                  id="plan-max-contacts"
                  value={form.maxContacts}
                  onChange={(v) => patchForm("maxContacts", v)}
                  min={0}
                  placeholder="2.000"
                />
              </FormField>
              <FormField label="Fluxos" error={fieldErrors.maxActiveFlows}>
                <NumberInput
                  id="plan-max-flows"
                  value={form.maxActiveFlows}
                  onChange={(v) => patchForm("maxActiveFlows", v)}
                  min={0}
                  placeholder="5"
                />
              </FormField>
              <FormField label="Créditos IA / mês" error={fieldErrors.maxAiMessages}>
                <NumberInput
                  id="plan-max-ai"
                  value={form.maxAiMessages}
                  onChange={(v) => patchForm("maxAiMessages", v)}
                  min={0}
                  placeholder="1.000"
                />
              </FormField>
            </div>
          </FormSection>

          <div className="border-t border-black/[0.05] dark:border-white/[0.06]" />

          <FormSection title="Exibição" surface>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <FormField label="Destaque">
                <Select
                  value={form.badge}
                  onChange={(v) => patchForm("badge", v)}
                  options={badgeSelectOptions}
                  aria-label="Destaque comercial"
                />
              </FormField>
              <FormField
                label="Ordem"
                hint="Menor número aparece primeiro."
                error={fieldErrors.sortOrder}
              >
                <NumberInput
                  id="plan-sort-order"
                  value={form.sortOrder}
                  onChange={(v) => patchForm("sortOrder", v)}
                  min={0}
                  placeholder="10"
                />
              </FormField>
            </div>
          </FormSection>
        </form>
      </Modal>
    </div>
  );
}
