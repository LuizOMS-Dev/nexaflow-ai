"use client";

import { useState, useRef, useEffect, useMemo, FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  CreditCard,
  Pencil,
  Plus,
  Archive,
  RotateCcw,
  Check,
  ChevronDown,
  Users,
  MessageSquare,
  Bot,
  Contact,
  Workflow,
  Sparkles,
  Building2,
  AlertTriangle,
} from "lucide-react";
import { api, isSuperadminMfaRequiredError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { cn, formatCurrency, pluralizePt } from "@/lib/utils";
import { useToast } from "@/components/ui-toast";
import { Modal, Skeleton } from "@/components/ui";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminPageHeader,
  AdminPageSkeleton,
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

type PlanFormState = {
  name: string;
  slug: string;
  description: string;
  priceType: "fixed" | "on_request" | "free";
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
  { value: "fixed", label: "Preço fixo comercial" },
  { value: "on_request", label: "Sob consulta (Enterprise)" },
  { value: "free", label: "Gratuito" },
];

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

function formatBrlInput(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const num = parseInt(digits, 10) / 100;
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

function parseBrlInput(value: string): number {
  const digits = value.replace(/\D/g, "");
  if (!digits) return 0;
  return parseInt(digits, 10) / 100;
}

function formatIntegerInput(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const num = parseInt(digits, 10);
  return num.toLocaleString("pt-BR");
}

function parseIntegerInput(value: string, fallback = 0): number {
  const digits = value.replace(/\D/g, "");
  if (!digits) return fallback;
  return parseInt(digits, 10);
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

function CustomSelect({
  value,
  onChange,
  options,
  size = "md",
}: {
  value: string;
  onChange: (val: string) => void;
  options: Array<{ value: string; label: string }>;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const selected = options.find((o) => o.value === value) || options[0];

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.04] text-white hover:bg-white/[0.06] focus:border-violet-500 focus:outline-none transition-colors",
          size === "md" ? "px-3 py-2 text-[13px]" : "px-2.5 py-1.5 text-[12px]"
        )}
      >
        <span className="truncate">{selected?.label || value}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform duration-150",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-[100] mt-1.5 w-full min-w-[220px] rounded-xl border border-white/[0.1] bg-[#161a26] p-1.5 shadow-2xl backdrop-blur-lg"
        >
          <div className="max-h-56 overflow-y-auto space-y-0.5 custom-scrollbar">
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition-colors",
                    size === "md" ? "text-[12.5px]" : "text-[11.5px]",
                    isSelected
                      ? "bg-violet-600/20 text-violet-300 font-medium"
                      : "text-gray-300 hover:bg-white/[0.06] hover:text-white"
                  )}
                >
                  <span>{opt.label}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 text-violet-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function emptyForm(): PlanFormState {
  return {
    name: "",
    slug: "",
    description: "",
    priceType: "fixed",
    priceMonthly: "299,00",
    priceAnnual: "3.049,80",
    maxUsers: "5",
    maxChannels: "2",
    maxAgents: "3",
    maxContacts: "5.000",
    maxActiveFlows: "10",
    maxAiMessages: "2.000",
    isActive: true,
    badge: "",
    sortOrder: "100",
  };
}

function planToForm(p: Plan): PlanFormState {
  const feats = (p.features || {}) as Record<string, unknown>;
  const isEnterprise = Boolean(p.priceOnRequest) || p.slug === "enterprise";
  const isFree = p.slug === "free" || Number(p.priceMonthly) === 0 && !isEnterprise;

  let pType: "fixed" | "on_request" | "free" = "fixed";
  if (isEnterprise) pType = "on_request";
  else if (isFree) pType = "free";

  return {
    name: p.name,
    slug: p.slug,
    description: p.description || "",
    priceType: pType,
    priceMonthly: p.priceMonthly != null ? formatBrlInput(Math.round(Number(p.priceMonthly) * 100).toString()) : "",
    priceAnnual: p.priceAnnual != null ? formatBrlInput(Math.round(Number(p.priceAnnual) * 100).toString()) : "",
    maxUsers: p.maxUsers != null ? formatIntegerInput(p.maxUsers.toString()) : "1",
    maxChannels: p.maxChannels != null ? formatIntegerInput(p.maxChannels.toString()) : "1",
    maxAgents: feats.maxAgents != null ? formatIntegerInput(String(feats.maxAgents)) : "1",
    maxContacts: p.maxContacts != null ? formatIntegerInput(p.maxContacts.toString()) : "500",
    maxActiveFlows: feats.maxActiveFlows != null ? formatIntegerInput(String(feats.maxActiveFlows)) : "5",
    maxAiMessages: p.maxAiMessages != null ? formatIntegerInput(p.maxAiMessages.toString()) : "100",
    isActive: p.isActive,
    badge: p.badge || "",
    sortOrder: (p.sortOrder ?? 100).toString(),
  };
}

export default function AdminPlansPage() {
  const user = useAuth((s) => s.user);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
  const [modalMode, setModalMode] = useState<"create" | "edit" | "duplicate" | null>(null);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [formData, setFormData] = useState<PlanFormState>(emptyForm());
  const [initialFormJson, setInitialFormJson] = useState<string>("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  // Archive confirmation state
  const [planToArchive, setPlanToArchive] = useState<Plan | null>(null);

  const { data: plans = [], isLoading, error, refetch } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () => api<Plan[]>("/admin/plans"),
    enabled: user?.platformRole === "SUPERADMIN",
  });

  const activePlans = useMemo(() => plans.filter((p) => p.isActive), [plans]);
  const archivedPlans = useMemo(() => plans.filter((p) => !p.isActive), [plans]);

  // Mutations
  const createPlanMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api<Plan>("/admin/plans", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast.success("Plano comercial criado com sucesso!");
      closeModal();
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao criar plano");
    },
  });

  const updatePlanMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      api<Plan>(`/admin/plans/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast.success("Plano atualizado com sucesso!");
      closeModal();
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao atualizar plano");
    },
  });

  const duplicatePlanMutation = useMutation({
    mutationFn: (id: string) =>
      api<Plan>(`/admin/plans/${id}/duplicate`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Plano duplicado com sucesso!");
      closeModal();
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao duplicar plano");
    },
  });

  const toggleArchiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api<Plan>(`/admin/plans/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: (_, variables) => {
      toast.success(variables.isActive ? "Plano restaurado para o catálogo ativo!" : "Plano arquivado com sucesso!");
      setPlanToArchive(null);
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao alterar status do plano");
    },
  });

  const openCreateModal = () => {
    const fresh = emptyForm();
    setFormData(fresh);
    setInitialFormJson(JSON.stringify(fresh));
    setEditingPlan(null);
    setSlugManuallyEdited(false);
    setModalMode("create");
  };

  const openEditModal = (p: Plan) => {
    const f = planToForm(p);
    setFormData(f);
    setInitialFormJson(JSON.stringify(f));
    setEditingPlan(p);
    setSlugManuallyEdited(true);
    setModalMode("edit");
  };

  const openDuplicateModal = (p: Plan) => {
    const f = planToForm(p);
    f.name = `${p.name} (cópia)`;
    f.slug = `${p.slug}-copia`;
    f.isActive = false;
    f.badge = "";
    f.sortOrder = ((p.sortOrder ?? 100) + 5).toString();
    setFormData(f);
    setInitialFormJson(JSON.stringify(f));
    setEditingPlan(p);
    setSlugManuallyEdited(true);
    setModalMode("duplicate");
  };

  const closeModal = () => {
    setModalMode(null);
    setEditingPlan(null);
    setSlugManuallyEdited(false);
  };

  const handleNameChange = (nameVal: string) => {
    setFormData((prev) => {
      const next = { ...prev, name: nameVal };
      if (!slugManuallyEdited && modalMode === "create") {
        next.slug = slugify(nameVal);
      }
      return next;
    });
  };

  const isDirty = useMemo(() => {
    return JSON.stringify(formData) !== initialFormJson;
  }, [formData, initialFormJson]);

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("O nome do plano é obrigatório.");
      return;
    }
    if (!formData.slug.trim()) {
      toast.error("O identificador (slug) do plano é obrigatório.");
      return;
    }

    const isEnterprise = formData.priceType === "on_request";
    const isFree = formData.priceType === "free";

    let monthly = parseBrlInput(formData.priceMonthly);
    let annual = parseBrlInput(formData.priceAnnual);

    if (isEnterprise) {
      monthly = 0;
      annual = 0;
    } else if (isFree) {
      monthly = 0;
      annual = 0;
    }

    const payload: Record<string, unknown> = {
      name: formData.name.trim(),
      slug: formData.slug.trim(),
      description: formData.description.trim() || null,
      priceOnRequest: isEnterprise,
      priceMonthly: monthly,
      priceAnnual: annual > 0 ? annual : null,
      maxUsers: parseIntegerInput(formData.maxUsers, 1),
      maxChannels: parseIntegerInput(formData.maxChannels, 1),
      maxContacts: parseIntegerInput(formData.maxContacts, 500),
      maxConversations: 10000,
      maxAiMessages: parseIntegerInput(formData.maxAiMessages, 100),
      badge: formData.badge.trim() || null,
      sortOrder: parseInt(formData.sortOrder, 10) || 100,
      isActive: formData.isActive,
      features: {
        maxAgents: parseIntegerInput(formData.maxAgents, 1),
        maxActiveFlows: parseIntegerInput(formData.maxActiveFlows, 5),
        monthlyAiCredits: parseIntegerInput(formData.maxAiMessages, 100),
      },
    };

    if (modalMode === "create" || modalMode === "duplicate") {
      createPlanMutation.mutate(payload);
    } else if (modalMode === "edit" && editingPlan) {
      updatePlanMutation.mutate({ id: editingPlan.id, payload });
    }
  };

  const handleApplyDiscountSuggestion = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const monthly = parseBrlInput(formData.priceMonthly);
    if (monthly <= 0) {
      toast.error("Informe um preço mensal válido antes de calcular o desconto.");
      return;
    }
    const suggested = Math.round(monthly * 12 * 0.85 * 100) / 100;
    setFormData((prev) => ({
      ...prev,
      priceAnnual: formatBrlInput(Math.round(suggested * 100).toString()),
    }));
    toast.success(`Desconto de 15% aplicado: ${formatCurrency(suggested)}/ano`);
  };

  if (user?.platformRole !== "SUPERADMIN") return null;

  if (isLoading) return <AdminPageSkeleton metrics={0} />;

  if (error || !plans) {
    if (isSuperadminMfaRequiredError(error)) return null;
    return (
      <AdminErrorState
        title="Não foi possível carregar os planos."
        description="Verifique a conexão e tente novamente."
        onRetry={() => void refetch()}
      />
    );
  }

  const displayedPlans = activeTab === "active" ? activePlans : archivedPlans;

  return (
    <div className="space-y-6">
      {/* 1. Header Oficial */}
      <AdminPageHeader
        title="Planos"
        description="Gerencie o catálogo comercial, preços, limites e disponibilidade dos planos."
        actions={
          <div className="flex items-center gap-3">
            {/* Tab Filter Ativos / Arquivados */}
            <div className="inline-flex rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5">
              <button
                type="button"
                onClick={() => setActiveTab("active")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
                  activeTab === "active"
                    ? "bg-white/[0.1] text-white shadow-sm font-semibold"
                    : "text-gray-400 hover:text-white"
                )}
              >
                Ativos ({activePlans.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("archived")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
                  activeTab === "archived"
                    ? "bg-white/[0.1] text-white shadow-sm font-semibold"
                    : "text-gray-400 hover:text-white"
                )}
              >
                Arquivados ({archivedPlans.length})
              </button>
            </div>

            <button
              onClick={openCreateModal}
              className="admin-btn-primary inline-flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Novo plano
            </button>
          </div>
        }
      />

      {/* 2. Grid Inteligente de Planos */}
      {displayedPlans.length === 0 ? (
        <AdminEmptyState
          title={activeTab === "active" ? "Nenhum plano disponível" : "Nenhum plano arquivado"}
          description={
            activeTab === "active"
              ? "Crie um plano para começar a montar o catálogo comercial da plataforma."
              : "Planos arquivados aparecerão aqui quando forem retirados do catálogo ativo."
          }
          action={
            activeTab === "active" ? (
              <button onClick={openCreateModal} className="admin-btn-primary inline-flex items-center gap-1.5">
                <Plus className="h-4 w-4" />
                Novo plano
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {displayedPlans.map((plan) => {
            const isEnterprise = Boolean(plan.priceOnRequest) || plan.slug === "enterprise";
            const isFree = plan.slug === "free" || Number(plan.priceMonthly) === 0 && !isEnterprise;
            const monthlyPrice = Number(plan.priceMonthly || 0);
            const annualPrice = plan.priceAnnual != null ? Number(plan.priceAnnual) : null;
            const feats = (plan.features || {}) as Record<string, unknown>;
            const maxAgents = feats.maxAgents != null ? Number(feats.maxAgents) : 1;
            const maxFlows = feats.maxActiveFlows != null ? Number(feats.maxActiveFlows) : 5;
            const badgeKey = plan.badge || "";
            const isPopular = badgeKey === "popular";
            const tenantCount = plan._count?.tenants ?? 0;

            return (
              <div
                key={plan.id}
                className={cn(
                  "relative flex flex-col justify-between rounded-2xl border transition-all duration-200 p-5 bg-white/[0.02]",
                  isPopular
                    ? "border-violet-500/40 bg-gradient-to-b from-violet-950/20 via-white/[0.02] to-transparent shadow-lg shadow-violet-950/20"
                    : isEnterprise
                    ? "border-indigo-500/30 bg-gradient-to-b from-indigo-950/15 via-white/[0.02] to-transparent"
                    : "border-white/[0.08] hover:border-white/[0.15]"
                )}
              >
                {/* Top: Header do Card */}
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="text-[16px] font-bold text-white tracking-tight">
                          {plan.name}
                        </h3>
                        {badgeKey && BADGE_LABEL[badgeKey] && (
                          <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10.5px] font-semibold text-violet-300 border border-violet-500/30">
                            {BADGE_LABEL[badgeKey]}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] font-medium text-gray-500">
                        {plan.slug}
                      </p>
                    </div>

                    <StatusBadge tone={plan.isActive ? "success" : "neutral"}>
                      {plan.isActive ? "Disponível" : "Indisponível"}
                    </StatusBadge>
                  </div>

                  {/* Preço Comercial */}
                  <div className="mt-4 pb-3 border-b border-white/[0.06]">
                    {isEnterprise ? (
                      <div>
                        <span className="text-[20px] font-bold text-white">Sob consulta</span>
                        <p className="text-[11.5px] text-gray-400 mt-0.5">Contrato customizado</p>
                      </div>
                    ) : isFree ? (
                      <div>
                        <span className="text-[22px] font-bold text-white">Gratuito</span>
                        <p className="text-[11.5px] text-gray-400 mt-0.5">Sem cobrança mensal</p>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-[22px] font-extrabold text-white tabular-nums">
                            {formatCurrency(monthlyPrice)}
                          </span>
                          <span className="text-[12px] text-gray-400 font-medium">/mês</span>
                        </div>
                        {annualPrice != null && annualPrice > 0 && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <p className="text-[11.5px] text-gray-400 tabular-nums">
                              ou {formatCurrency(annualPrice)}/ano
                            </p>
                            {monthlyPrice > 0 && annualPrice < monthlyPrice * 12 && (
                              <span className="rounded bg-emerald-500/15 px-1.5 py-0.2 text-[10px] font-bold text-emerald-400 border border-emerald-500/25">
                                {Math.round((1 - annualPrice / (monthlyPrice * 12)) * 100)}% OFF
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Descrição */}
                  <p className="mt-3 text-[12px] text-gray-300 line-clamp-3 min-h-[36px]">
                    {plan.description || "Plano comercial para atendimento e automação."}
                  </p>

                  {/* Grade de 6 Limites Oficiais */}
                  <div className="mt-4 space-y-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] p-3.5 text-[12px]">
                    <div className="flex items-center justify-between gap-2.5">
                      <span className="flex items-center gap-1.5 text-gray-400 shrink-0">
                        <Users className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                        Usuários
                      </span>
                      <span className={cn("font-semibold tabular-nums shrink-0", isEnterprise ? "text-[11.5px] text-gray-300" : "text-white")}>
                        {isEnterprise ? "Personalizado" : plan.maxUsers.toLocaleString("pt-BR")}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2.5">
                      <span className="flex items-center gap-1.5 text-gray-400 shrink-0">
                        <MessageSquare className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                        WhatsApp
                      </span>
                      <span className={cn("font-semibold tabular-nums shrink-0", isEnterprise ? "text-[11.5px] text-gray-300" : "text-white")}>
                        {isEnterprise ? "Personalizado" : plan.maxChannels.toLocaleString("pt-BR")}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2.5">
                      <span className="flex items-center gap-1.5 text-gray-400 shrink-0">
                        <Bot className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                        Agentes IA
                      </span>
                      <span className={cn("font-semibold tabular-nums shrink-0", isEnterprise ? "text-[11.5px] text-gray-300" : "text-white")}>
                        {isEnterprise ? "Personalizado" : maxAgents.toLocaleString("pt-BR")}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2.5">
                      <span className="flex items-center gap-1.5 text-gray-400 shrink-0">
                        <Contact className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                        Contatos
                      </span>
                      <span className={cn("font-semibold tabular-nums shrink-0", isEnterprise ? "text-[11.5px] text-gray-300" : "text-white")}>
                        {isEnterprise ? "Personalizado" : plan.maxContacts.toLocaleString("pt-BR")}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2.5">
                      <span className="flex items-center gap-1.5 text-gray-400 shrink-0">
                        <Workflow className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                        Fluxos
                      </span>
                      <span className={cn("font-semibold tabular-nums shrink-0", isEnterprise ? "text-[11.5px] text-gray-300" : "text-white")}>
                        {isEnterprise ? "Personalizado" : maxFlows.toLocaleString("pt-BR")}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2.5">
                      <span className="flex items-center gap-1.5 text-gray-400 shrink-0">
                        <Sparkles className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                        Créditos IA
                      </span>
                      <span className={cn("font-semibold tabular-nums shrink-0", isEnterprise ? "text-[11.5px] text-gray-300" : "text-white")}>
                        {isEnterprise ? "Personalizado" : `${plan.maxAiMessages.toLocaleString("pt-BR")}/mês`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom: Uso do Plano & Ações */}
                <div className="mt-4 pt-3 border-t border-white/[0.06] space-y-3">
                  {/* Quantidade de Empresas Utilizando (separado dos limites!) */}
                  <div className="flex items-center gap-1.5 text-[11.5px] text-gray-400">
                    <Building2 className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                    <span>
                      {tenantCount === 0
                        ? "Nenhuma empresa utilizando"
                        : `${tenantCount} ${pluralizePt(tenantCount, "empresa utilizando", "empresas utilizando")}`}
                    </span>
                  </div>

                  {/* Ações do Card */}
                  <div className="flex items-center justify-between gap-1.5">
                    {plan.isActive ? (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditModal(plan)}
                          className="inline-flex items-center gap-1 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] font-medium text-gray-200 hover:bg-white/[0.08] hover:text-white transition-colors"
                        >
                          <Pencil className="h-3 w-3" />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => openDuplicateModal(plan)}
                          className="inline-flex items-center gap-1 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] font-medium text-gray-200 hover:bg-white/[0.08] hover:text-white transition-colors"
                          title="Duplicar configurações do plano"
                        >
                          <Copy className="h-3 w-3" />
                          Duplicar
                        </button>
                        {plan.slug !== "free" && (
                          <button
                            type="button"
                            onClick={() => setPlanToArchive(plan)}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium text-gray-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
                            title="Arquivar plano comercial"
                          >
                            <Archive className="h-3 w-3" />
                            Arquivar
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleArchiveMutation.mutate({ id: plan.id, isActive: true })}
                          className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-violet-500 transition-colors shadow-sm"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Restaurar plano
                        </button>
                        <button
                          type="button"
                          onClick={() => openDuplicateModal(plan)}
                          className="inline-flex items-center gap-1 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] font-medium text-gray-200 hover:bg-white/[0.08] hover:text-white transition-colors"
                        >
                          <Copy className="h-3 w-3" />
                          Duplicar
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 3. MODAL UNIFICADO: PlanFormDialog (Criar / Editar / Duplicar) */}
      <Modal
        open={modalMode !== null}
        onClose={closeModal}
        title={
          modalMode === "create"
            ? "Novo Plano Comercial"
            : modalMode === "edit"
            ? `Editar Plano: ${editingPlan?.name}`
            : `Duplicar Plano: ${editingPlan?.name}`
        }
        description={
          modalMode === "edit"
            ? "Alterações no catálogo comercial não afetam os preços e contratos das empresas já assinantes."
            : modalMode === "duplicate"
            ? "Crie uma cópia independente com novos limites e preços. O plano duplicado nasce indisponível por padrão."
            : "Defina preços de catálogo, limites técnicos e disponibilidade comercial."
        }
        size="lg"
      >
        <form onSubmit={handleFormSubmit} className="space-y-5">
          {/* Seção 1: Informações Comerciais */}
          <div className="space-y-3">
            <h4 className="text-[12.5px] font-semibold uppercase tracking-wider text-gray-400">
              Informações do Plano
            </h4>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[11.5px] font-medium text-gray-400 mb-1">
                  Nome comercial *
                </label>
                <input
                  type="text"
                  placeholder="Ex: Profissional"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  required
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11.5px] font-medium text-gray-400 mb-1">
                  Identificador (Slug) *
                </label>
                <input
                  type="text"
                  placeholder="pro"
                  value={formData.slug}
                  onChange={(e) => {
                    setSlugManuallyEdited(true);
                    setFormData((prev) => ({ ...prev, slug: slugify(e.target.value) }));
                  }}
                  disabled={modalMode === "edit"}
                  required
                  className={cn(
                    "w-full rounded-lg border border-white/[0.08] px-3 py-2 text-[13px] text-white focus:border-violet-500 focus:outline-none",
                    modalMode === "edit" ? "bg-white/[0.02] text-gray-400 cursor-not-allowed" : "bg-white/[0.04]"
                  )}
                />
              </div>
            </div>

            <div>
              <label className="block text-[11.5px] font-medium text-gray-400 mb-1">
                Descrição comercial
              </label>
              <textarea
                rows={2}
                placeholder="Ex: Para empresas que buscam escalar o atendimento com IA e automações avançadas."
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none resize-none"
              />
            </div>
          </div>

          {/* Seção 2: Precificação */}
          <div className="space-y-3 pt-3 border-t border-white/[0.06]">
            <h4 className="text-[12.5px] font-semibold uppercase tracking-wider text-gray-400">
              Precificação de Catálogo
            </h4>

            <div>
              <label className="block text-[11.5px] font-medium text-gray-400 mb-1">
                Tipo de preço *
              </label>
              <CustomSelect
                value={formData.priceType}
                onChange={(val) => setFormData((prev) => ({ ...prev, priceType: val as any }))}
                options={PRICE_TYPE_OPTIONS}
              />
            </div>

            {formData.priceType === "fixed" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11.5px] font-medium text-gray-400 mb-1">
                    Preço mensal (R$) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12.5px] text-gray-400 pointer-events-none">
                      R$
                    </span>
                    <input
                      type="text"
                      placeholder="299,00"
                      value={formData.priceMonthly}
                      onChange={(e) => setFormData((prev) => ({ ...prev, priceMonthly: formatBrlInput(e.target.value) }))}
                      required
                      className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] pl-9 pr-3 py-2 text-[13px] text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none tabular-nums"
                    />
                  </div>
                </div>

                <div>
                  {(() => {
                    const parsedM = parseBrlInput(formData.priceMonthly);
                    const parsedA = parseBrlInput(formData.priceAnnual);
                    const suggestedA = parsedM > 0 ? Math.round(parsedM * 12 * 0.85 * 100) / 100 : 0;
                    const discountPct =
                      parsedM > 0 && parsedA > 0 && parsedA < parsedM * 12
                        ? Math.round((1 - parsedA / (parsedM * 12)) * 100)
                        : 0;

                    return (
                      <>
                        <div className="flex items-center justify-between mb-1 flex-wrap gap-1.5">
                          <label className="block text-[11.5px] font-medium text-gray-400">
                            Preço anual (R$)
                          </label>
                          {parsedM > 0 && (
                            <button
                              type="button"
                              onClick={(e) => handleApplyDiscountSuggestion(e)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-violet-600/20 hover:bg-violet-600/35 text-violet-300 border border-violet-500/30 text-[11px] font-semibold transition-all shadow-sm active:scale-95 cursor-pointer"
                              title="Calcular automaticamente com 15% de desconto anual"
                            >
                              <Sparkles className="h-3 w-3 text-violet-400 shrink-0" />
                              <span>
                                Aplicar 15% ({formatCurrency(suggestedA)}/ano)
                              </span>
                            </button>
                          )}
                        </div>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12.5px] text-gray-400 pointer-events-none">
                            R$
                          </span>
                          <input
                            type="text"
                            placeholder={suggestedA > 0 ? formatBrlInput(Math.round(suggestedA * 100).toString()) : "3.049,80"}
                            value={formData.priceAnnual}
                            onChange={(e) => setFormData((prev) => ({ ...prev, priceAnnual: formatBrlInput(e.target.value) }))}
                            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] pl-9 pr-20 py-2 text-[13px] text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none tabular-nums"
                          />
                          {discountPct > 0 && (
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/25">
                              -{discountPct}% OFF
                            </span>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Seção 3: Limites Oficiais */}
          <div className="space-y-3 pt-3 border-t border-white/[0.06]">
            <h4 className="text-[12.5px] font-semibold uppercase tracking-wider text-gray-400">
              Limites do Produto
            </h4>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">
                  Usuários *
                </label>
                <input
                  type="text"
                  placeholder="5"
                  value={formData.maxUsers}
                  onChange={(e) => setFormData((prev) => ({ ...prev, maxUsers: formatIntegerInput(e.target.value) }))}
                  required
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white focus:border-violet-500 focus:outline-none tabular-nums"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">
                  WhatsApp *
                </label>
                <input
                  type="text"
                  placeholder="2"
                  value={formData.maxChannels}
                  onChange={(e) => setFormData((prev) => ({ ...prev, maxChannels: formatIntegerInput(e.target.value) }))}
                  required
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white focus:border-violet-500 focus:outline-none tabular-nums"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">
                  Agentes IA *
                </label>
                <input
                  type="text"
                  placeholder="3"
                  value={formData.maxAgents}
                  onChange={(e) => setFormData((prev) => ({ ...prev, maxAgents: formatIntegerInput(e.target.value) }))}
                  required
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white focus:border-violet-500 focus:outline-none tabular-nums"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">
                  Contatos *
                </label>
                <input
                  type="text"
                  placeholder="5.000"
                  value={formData.maxContacts}
                  onChange={(e) => setFormData((prev) => ({ ...prev, maxContacts: formatIntegerInput(e.target.value) }))}
                  required
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white focus:border-violet-500 focus:outline-none tabular-nums"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">
                  Fluxos *
                </label>
                <input
                  type="text"
                  placeholder="10"
                  value={formData.maxActiveFlows}
                  onChange={(e) => setFormData((prev) => ({ ...prev, maxActiveFlows: formatIntegerInput(e.target.value) }))}
                  required
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white focus:border-violet-500 focus:outline-none tabular-nums"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">
                  Créditos IA / mês *
                </label>
                <input
                  type="text"
                  placeholder="2.000"
                  value={formData.maxAiMessages}
                  onChange={(e) => setFormData((prev) => ({ ...prev, maxAiMessages: formatIntegerInput(e.target.value) }))}
                  required
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white focus:border-violet-500 focus:outline-none tabular-nums"
                />
              </div>
            </div>
          </div>

          {/* Seção 4: Exibição & Disponibilidade */}
          <div className="space-y-3 pt-3 border-t border-white/[0.06]">
            <h4 className="text-[12.5px] font-semibold uppercase tracking-wider text-gray-400">
              Exibição & Disponibilidade
            </h4>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[11.5px] font-medium text-gray-400 mb-1">
                  Destaque comercial
                </label>
                <CustomSelect
                  value={formData.badge}
                  onChange={(val) => setFormData((prev) => ({ ...prev, badge: val }))}
                  options={BADGE_OPTIONS}
                />
              </div>

              <div>
                <label className="block text-[11.5px] font-medium text-gray-400 mb-1">
                  Ordem de exibição
                </label>
                <input
                  type="number"
                  placeholder="100"
                  value={formData.sortOrder}
                  onChange={(e) => setFormData((prev) => ({ ...prev, sortOrder: e.target.value }))}
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white focus:border-violet-500 focus:outline-none tabular-nums"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
              <div>
                <p className="text-[13px] font-semibold text-white">Disponível para novas contratações</p>
                <p className="text-[11.5px] text-gray-400">
                  Novas empresas poderão visualizar e contratar este plano no catálogo comercial.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, isActive: !prev.isActive }))}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                  formData.isActive ? "bg-violet-600" : "bg-white/[0.1]"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                    formData.isActive ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>
          </div>

          {/* Sticky Footer com Ações */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={closeModal}
              className="rounded-lg px-3.5 py-2 text-[12.5px] font-medium text-gray-400 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={
                createPlanMutation.isPending ||
                updatePlanMutation.isPending ||
                (modalMode === "edit" && !isDirty)
              }
              className="rounded-lg bg-violet-600 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-violet-500 disabled:opacity-50 transition-colors shadow-sm"
            >
              {createPlanMutation.isPending || updatePlanMutation.isPending
                ? "Salvando..."
                : modalMode === "create"
                ? "Criar plano"
                : modalMode === "duplicate"
                ? "Criar cópia"
                : "Salvar alterações"}
            </button>
          </div>
        </form>
      </Modal>

      {/* 4. MODAL: Confirmação de Arquivamento */}
      <Modal
        open={planToArchive !== null}
        onClose={() => setPlanToArchive(null)}
        title={`Arquivar plano "${planToArchive?.name}"?`}
        description="O plano deixará de estar disponível para novas contratações no catálogo. Empresas que já utilizam este plano continuarão com seus contratos atuais sem nenhuma alteração."
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3.5">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-[12px] text-amber-200/90 leading-relaxed">
              Planos arquivados podem ser restaurados a qualquer momento pela aba{" "}
              <strong>Arquivados</strong>. Nenhuma assinatura ou empresa vinculada será excluída.
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setPlanToArchive(null)}
              className="rounded-lg px-3.5 py-2 text-[12.5px] font-medium text-gray-400 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                if (planToArchive) {
                  toggleArchiveMutation.mutate({ id: planToArchive.id, isActive: false });
                }
              }}
              disabled={toggleArchiveMutation.isPending}
              className="rounded-lg bg-amber-600 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-amber-500 transition-colors shadow-sm"
            >
              {toggleArchiveMutation.isPending ? "Arquivando..." : "Arquivar plano"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
