"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, CreditCard, Pencil, Plus, Archive } from "lucide-react";
import { api, isSuperadminMfaRequiredError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { cn, formatCurrency } from "@/lib/utils";
import {
  DialogFooter,
  FormField,
  FormSection,
  Modal,
  MoneyInput,
  NumberInput,
  Select,
  Switch,
  useToast,
} from "@/components/ui";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminPageHeader,
  AdminPageSkeleton,
  AdminSection,
  StatusBadge,
} from "@/components/admin";

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
  slug: string;
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

const BADGE_LABEL: Record<string, string> = {
  popular: "Mais popular",
  recommended: "Recomendado",
  best_value: "Melhor custo-benefício",
};

function limitLabel(n: number, isEnterprise: boolean): string {
  if (isEnterprise || n >= 999) return "Personalizado";
  return n.toLocaleString("pt-BR");
}

function featureNum(
  feats: Record<string, unknown> | null | undefined,
  key: string,
  fallback: number
) {
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

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function emptyForm(): PlanForm {
  return {
    name: "",
    slug: "",
    description: "",
    priceType: "fixed",
    priceMonthly: "",
    priceAnnual: "",
    maxUsers: "2",
    maxChannels: "1",
    maxAgents: "1",
    maxContacts: "2000",
    maxActiveFlows: "5",
    maxAiMessages: "1000",
    isActive: true,
    badge: "",
    sortOrder: "100",
  };
}

function planToForm(p: Plan): PlanForm {
  const feats = (p.features || {}) as Record<string, unknown>;
  const onRequest = Boolean(p.priceOnRequest) || p.slug === "enterprise";
  return {
    name: p.name,
    slug: p.slug,
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
    badge:
      p.badge && BADGE_OPTIONS.some((o) => o.value === p.badge)
        ? p.badge
        : p.badge || "",
    sortOrder: String(p.sortOrder ?? 0),
  };
}

type EditorMode = "create" | "edit" | "duplicate";

export default function AdminPlansPage() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [mode, setMode] = useState<EditorMode | null>(null);
  const [edit, setEdit] = useState<Plan | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof PlanForm, string>>
  >({});

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () => api<Plan[]>("/admin/plans"),
    enabled: user?.platformRole === "SUPERADMIN",
    retry: false,
  });

  const suggestedAnnual = useMemo(() => {
    if (form.priceType !== "fixed") return null;
    const m = Number(form.priceMonthly);
    if (!Number.isFinite(m) || m <= 0) return null;
    return annualFromMonthly(m);
  }, [form.priceMonthly, form.priceType]);

  function buildPayload(forCreate: boolean) {
    const errors: Partial<Record<keyof PlanForm, string>> = {};
    if (!form.name.trim()) errors.name = "Informe o nome do plano.";

    let slug = form.slug.trim() || slugify(form.name);
    if (forCreate) {
      if (!slug) errors.slug = "Informe o slug.";
      else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        errors.slug = "Use apenas minúsculas, números e hífens.";
      }
    }

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
    if (!Number.isFinite(maxChannels) || maxChannels < 1)
      errors.maxChannels = "Mínimo 1.";
    if (!Number.isFinite(maxAgents) || maxAgents < 0)
      errors.maxAgents = "Valor inválido.";
    if (!Number.isFinite(maxContacts) || maxContacts < 0)
      errors.maxContacts = "Valor inválido.";
    if (!Number.isFinite(maxActiveFlows) || maxActiveFlows < 0)
      errors.maxActiveFlows = "Valor inválido.";
    if (!Number.isFinite(maxAiMessages) || maxAiMessages < 0)
      errors.maxAiMessages = "Valor inválido.";
    if (!Number.isFinite(sortOrder) || sortOrder < 0)
      errors.sortOrder = "Valor inválido.";

    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      throw new Error("Revise os campos destacados.");
    }
    setFieldErrors({});

    const prevFeats =
      edit?.features && typeof edit.features === "object"
        ? { ...edit.features }
        : ({} as Record<string, unknown>);

    const features = {
      ...prevFeats,
      maxAgents,
      maxActiveFlows,
      monthlyAiCredits: maxAiMessages,
    };

    const badgeValue = form.badge.trim() || null;

    return {
      name: form.name.trim(),
      slug,
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
    };
  }

  const save = useMutation({
    mutationFn: async () => {
      if (mode === "create" || mode === "duplicate") {
        const payload = buildPayload(true);
        const created = await api<Plan>("/admin/plans", {
          method: "POST",
          json: {
            name: payload.name,
            slug: payload.slug,
            description: payload.description || undefined,
            priceMonthly: payload.priceMonthly,
            priceAnnual: payload.priceAnnual,
            priceOnRequest: payload.priceOnRequest,
            maxUsers: payload.maxUsers,
            maxChannels: payload.maxChannels,
            maxContacts: payload.maxContacts,
            maxAiMessages: payload.maxAiMessages,
            badge: payload.badge,
            sortOrder: payload.sortOrder,
            features: payload.features,
          },
        });
        // POST não aceita isActive; aplicar via PATCH quando inativo
        if (created?.id && payload.isActive === false) {
          return api(`/admin/plans/${created.id}`, {
            method: "PATCH",
            json: { isActive: false },
          });
        }
        return created;
      }
      if (!edit) throw new Error("Plano inválido");
      const payload = buildPayload(false);
      return api(`/admin/plans/${edit.id}`, {
        method: "PATCH",
        json: {
          name: payload.name,
          description: payload.description,
          priceMonthly: payload.priceMonthly,
          priceAnnual: payload.priceAnnual,
          priceOnRequest: payload.priceOnRequest,
          maxUsers: payload.maxUsers,
          maxChannels: payload.maxChannels,
          maxContacts: payload.maxContacts,
          maxAiMessages: payload.maxAiMessages,
          isActive: payload.isActive,
          badge: payload.badge,
          sortOrder: payload.sortOrder,
          features: payload.features,
        },
      });
    },
    onSuccess: () => {
      const wasEdit = mode === "edit";
      const created = mode === "create" || mode === "duplicate";
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
      closeEditor();
      toast({
        kind: "success",
        title: created ? "Plano criado" : "Plano atualizado",
        description: wasEdit
          ? "Preços contratados das empresas existentes foram preservados."
          : "O catálogo foi atualizado.",
      });
    },
    onError: (e: Error) =>
      toast({
        kind: "error",
        title: "Não foi possível salvar",
        description: e.message,
      }),
  });

  const archive = useMutation({
    mutationFn: (p: Plan) =>
      api(`/admin/plans/${p.id}`, {
        method: "PATCH",
        json: { isActive: false },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
      toast({
        kind: "success",
        title: "Plano arquivado",
        description: "Ele deixa de aparecer para novas contratações.",
      });
    },
    onError: (e: Error) =>
      toast({
        kind: "error",
        title: "Não foi possível arquivar",
        description: e.message,
      }),
  });

  function closeEditor() {
    if (save.isPending) return;
    setMode(null);
    setEdit(null);
    setFieldErrors({});
    setForm(emptyForm());
  }

  function openCreate() {
    setMode("create");
    setEdit(null);
    setForm(emptyForm());
    setFieldErrors({});
  }

  function openEdit(p: Plan) {
    setMode("edit");
    setEdit(p);
    setForm(planToForm(p));
    setFieldErrors({});
  }

  function openDuplicate(p: Plan) {
    const base = planToForm(p);
    setMode("duplicate");
    setEdit(p);
    setForm({
      ...base,
      name: `${p.name} (cópia)`,
      slug: `${slugify(p.slug || p.name)}-copia`,
      isActive: false,
      sortOrder: String((p.sortOrder ?? 0) + 10),
    });
    setFieldErrors({});
  }

  function patchForm<K extends keyof PlanForm>(key: K, value: PlanForm[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "name" && (mode === "create" || mode === "duplicate")) {
        // Auto-slug only if user hasn't customized far from previous auto value
        const prevAuto = slugify(prev.name);
        if (!prev.slug || prev.slug === prevAuto) {
          next.slug = slugify(String(value));
        }
      }
      return next;
    });
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  const badgeSelectOptions = useMemo(() => {
    if (form.badge && !BADGE_OPTIONS.some((o) => o.value === form.badge)) {
      return [...BADGE_OPTIONS, { value: form.badge, label: form.badge }];
    }
    return BADGE_OPTIONS;
  }, [form.badge]);

  if (user?.platformRole !== "SUPERADMIN") return null;

  if (isLoading) return <AdminPageSkeleton metrics={3} />;

  if (error) {
    if (isSuperadminMfaRequiredError(error)) return null;
    return (
      <AdminErrorState
        title="Não foi possível carregar planos"
        description="Tente novamente em instantes."
        onRetry={() => void refetch()}
      />
    );
  }

  const allPlans = data || [];
  const plans = allPlans
    .filter(
      (p) => p.isActive || (p._count?.tenants ?? 0) > 0 || p.slug === "free"
    )
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const isEnterpriseEdit =
    edit?.slug === "enterprise" || form.priceType === "on_request";

  const editorOpen = mode != null;
  const editorTitle =
    mode === "create"
      ? "Novo plano"
      : mode === "duplicate"
        ? `Duplicar ${edit?.name || "plano"}`
        : edit
          ? `Editar ${edit.name}`
          : "Editar plano";

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Planos"
        description="Catálogo comercial. Alterar preço não mexe em contratos existentes."
        actions={
          <button type="button" className="admin-btn-primary" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" />
            Novo plano
          </button>
        }
      />

      {plans.length === 0 ? (
        <AdminSection>
          <AdminEmptyState
            icon={<CreditCard className="h-5 w-5" strokeWidth={1.5} />}
            title="Nenhum plano no catálogo"
            description="Use Novo plano acima para criar o primeiro item do catálogo."
          />
        </AdminSection>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {plans.map((p) => {
            const feats = (p.features || {}) as Record<string, unknown>;
            const maxAgents = featureNum(feats, "maxAgents", 1);
            const aiCredits = featureNum(
              feats,
              "monthlyAiCredits",
              p.maxAiMessages
            );
            const monthly = Number(p.priceMonthly || 0);
            const isEnterprise =
              p.slug === "enterprise" || Boolean(p.priceOnRequest);
            const isFree = p.slug === "free";
            const isPopular = p.badge === "popular";
            const badgeLabel = p.badge ? BADGE_LABEL[p.badge] || p.badge : null;
            const annual =
              p.priceAnnual != null && p.priceAnnual !== ""
                ? Number(p.priceAnnual)
                : !isEnterprise && monthly > 0
                  ? annualFromMonthly(monthly)
                  : null;
            const tenants = p._count?.tenants ?? 0;
            const canArchive = p.isActive && p.slug !== "free" && tenants === 0;

            return (
              <article
                key={p.id}
                className={cn(
                  "relative flex h-full flex-col rounded-xl border border-white/[0.07] bg-white/[0.025] p-4",
                  "shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset]",
                  isPopular && "border-violet-400/25 bg-violet-500/[0.04]",
                  isEnterprise &&
                    "border-violet-400/20 bg-gradient-to-b from-violet-500/[0.07] to-transparent",
                  !p.isActive && "opacity-75"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h2 className="truncate text-[14px] font-semibold tracking-tight text-white">
                        {p.name}
                      </h2>
                      {badgeLabel ? (
                        <StatusBadge tone="violet">{badgeLabel}</StatusBadge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.07em] text-gray-500">
                      {p.slug}
                    </p>
                  </div>
                  <StatusBadge tone={p.isActive ? "success" : "neutral"} dot>
                    {p.isActive ? "Ativo" : "Inativo"}
                  </StatusBadge>
                </div>

                <div className="mt-3 min-h-[2.75rem]">
                  {isEnterprise ? (
                    <div>
                      <p className="text-[1.25rem] font-semibold tracking-tight text-white">
                        Sob consulta
                      </p>
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        Comercial sob medida
                      </p>
                    </div>
                  ) : isFree || monthly <= 0 ? (
                    <div>
                      <p className="text-[1.25rem] font-semibold tracking-tight text-white">
                        Gratuito
                      </p>
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        Entrada e teste
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="text-[1.35rem] font-semibold leading-none tracking-tight tabular-nums text-white">
                        {formatCurrency(monthly)}
                        <span className="ml-1 text-[11.5px] font-normal text-gray-500">
                          /mês
                        </span>
                      </p>
                      {annual != null ? (
                        <p className="mt-1 text-[11.5px] text-gray-400">
                          {formatCurrency(annual)}{" "}
                          <span className="text-gray-600">anual</span>
                        </p>
                      ) : null}
                    </>
                  )}
                </div>

                {p.description ? (
                  <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-gray-500">
                    {p.description}
                  </p>
                ) : (
                  <div className="mt-2 h-[2.25rem]" aria-hidden />
                )}

                <div className="mt-3 flex-1 rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2">
                  <dl className="grid grid-cols-2 gap-x-2 gap-y-2">
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
                        ["Clientes", String(tenants)],
                      ] as const
                    ).map(([k, v]) => (
                      <div key={k} className="min-w-0">
                        <dt className="text-[9.5px] font-medium uppercase tracking-wide text-gray-500">
                          {k}
                        </dt>
                        <dd className="mt-0.5 truncate text-[12px] font-semibold tabular-nums text-white/90">
                          {v}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/[0.06] pt-3">
                  <button
                    type="button"
                    className="admin-btn-secondary h-8 px-2.5 text-[12px]"
                    onClick={() => openEdit(p)}
                  >
                    <Pencil className="h-3 w-3" />
                    Editar
                  </button>
                  <button
                    type="button"
                    className="admin-btn-ghost h-8 px-2 text-[12px]"
                    onClick={() => openDuplicate(p)}
                    title="Duplicar plano"
                  >
                    <Copy className="h-3 w-3" />
                    Duplicar
                  </button>
                  {canArchive ? (
                    <button
                      type="button"
                      className="admin-btn-ghost h-8 px-2 text-[12px] text-gray-500 hover:text-amber-200"
                      disabled={archive.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Arquivar o plano "${p.name}"? Ele deixa de aparecer para novas contratações.`
                          )
                        ) {
                          void archive.mutateAsync(p).catch(() => {});
                        }
                      }}
                      title="Arquivar plano"
                    >
                      <Archive className="h-3 w-3" />
                      Arquivar
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Modal
        open={editorOpen}
        onClose={closeEditor}
        title={editorTitle}
        description={
          mode === "edit" && edit?.slug
            ? edit.slug
            : mode === "create" || mode === "duplicate"
              ? "Novo item no catálogo comercial"
              : undefined
        }
        size="lg"
        variant="contextual"
        initialFocus="panel"
        preventClose={save.isPending}
        footer={
          <DialogFooter>
            <button
              type="button"
              className="admin-btn-secondary h-9 px-3.5"
              onClick={closeEditor}
              disabled={save.isPending}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="nf-edit-plan"
              className="admin-btn-primary h-9 px-4"
              disabled={save.isPending}
            >
              {save.isPending
                ? "Salvando…"
                : mode === "create" || mode === "duplicate"
                  ? "Criar plano"
                  : "Salvar alterações"}
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
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-[12.5px] font-medium text-white">
                Plano disponível
              </p>
              <p className="text-[11px] leading-snug text-gray-500">
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
            {(mode === "create" || mode === "duplicate") && (
              <FormField
                label="Slug"
                required
                error={fieldErrors.slug}
                hint="Identificador único (minúsculas e hífens)."
              >
                <input
                  className="input font-mono text-[13px]"
                  value={form.slug}
                  onChange={(e) =>
                    patchForm(
                      "slug",
                      e.target.value.toLowerCase().replace(/\s+/g, "-")
                    )
                  }
                  required
                  autoComplete="off"
                  spellCheck={false}
                />
              </FormField>
            )}
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
                  patchForm(
                    "priceType",
                    v === "on_request" ? "on_request" : "fixed"
                  )
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
                  Math.abs(Number(form.priceAnnual) - suggestedAnnual) >
                    0.009) ? (
                  <button
                    type="button"
                    className="text-[11px] font-medium text-violet-300 hover:underline"
                    onClick={() =>
                      patchForm("priceAnnual", String(suggestedAnnual))
                    }
                  >
                    Usar anual sugerido ({formatCurrency(suggestedAnnual)})
                  </button>
                ) : null}
              </>
            ) : (
              <p className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[12px] leading-relaxed text-gray-400">
                Catálogo mostra{" "}
                <strong className="font-medium text-white">Sob consulta</strong>
                . Não é tratado como gratuito.
              </p>
            )}
          </FormSection>

          <div className="border-t border-white/[0.06]" />

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
              <FormField
                label="Créditos IA / mês"
                error={fieldErrors.maxAiMessages}
              >
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

          <div className="border-t border-white/[0.06]" />

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
