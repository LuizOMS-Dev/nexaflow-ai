"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Sparkles,
  Users,
  Wallet,
  ExternalLink,
  Trash2,
  UserMinus,
  UserX,
  Workflow,
} from "lucide-react";
import { api, isStepUpRequiredError, isSuperadminMfaRequiredError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { cn, formatCurrency, formatDate, formatCivilDate } from "@/lib/utils";
import { planSelectLabel, selectablePlansForCompany } from "@/lib/plan-price";
import { humanizeAuditAction } from "@/lib/audit-labels";
import {
  DateInput,
  DialogFooter,
  EntitySummary,
  FieldGrid,
  FormField,
  FormSection,
  Modal,
  MoneyInput,
  RadioGroup,
  Select,
  useToast,
} from "@/components/ui";
import { UserAvatar } from "@/components/user-avatar";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminPageHeader,
  AdminPageSkeleton,
  AdminSection,
  MetricCard,
  MetricGrid,
  StatusBadge,
  statusToTone,
  type AdminTone,
} from "@/components/admin";
import { ActionMenu } from "@/components/ui-menu";
import { AddMemberDialog } from "@/features/platform-admin/add-member-dialog";

type Plan = {
  id: string;
  name: string;
  slug: string;
  priceMonthly: string | number;
  priceOnRequest?: boolean;
  isActive?: boolean;
  maxUsers?: number;
  maxChannels?: number;
  maxAiMessages?: number;
  features?: Record<string, unknown> | null;
};

type Member = {
  id: string;
  role: string;
  isActive: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string | null;
    avatarType?: string | null;
    avatarPresetId?: string | null;
    avatarColor?: string | null;
    isActive: boolean;
    lastLoginAt?: string | null;
  };
};

type PaymentRow = {
  id: string;
  amount: number;
  paidAt: string;
  referencePeriod?: string | null;
  method?: string | null;
  notes?: string | null;
  createdAt: string;
};

type TenantDetail = {
  id: string;
  name: string;
  slug: string;
  status: string;
  statusLabel?: string;
  logoUrl?: string | null;
  primaryColor: string;
  createdAt: string;
  updatedAt: string;
  planId?: string | null;
  plan?: Plan | null;
  profile: {
    legalName?: string | null;
    tradeName?: string | null;
    cnpj?: string | null;
    segment?: string | null;
    phone?: string | null;
    website?: string | null;
    email?: string | null;
    commercialEmail?: string | null;
    city?: string | null;
    state?: string | null;
    timezone?: string | null;
    language?: string | null;
    onboardingCompleted?: boolean;
  };
  onboarding?: {
    completed: boolean;
    hasAdmin: boolean;
    hasProfile: boolean;
    hasChannel: boolean;
  };
  _count: {
    members: number;
    contacts: number;
    conversations: number;
    channels: number;
    opportunities: number;
    tasks: number;
  };
  /** Cotas do plano (via getUsageSnapshot no admin) */
  limits?: {
    maxUsers?: number;
    maxChannels?: number;
    maxAgents?: number;
    maxActiveFlows?: number;
    maxAutomations?: number;
    maxAiMessages?: number;
    monthlyAiCredits?: number;
    extraAiCredits?: number;
  };
  /** Consumo real do tenant */
  usage?: {
    users?: number;
    channels?: number;
    agents?: number;
    activeFlows?: number;
    automations?: number;
    aiCredits?: number;
    aiCreditsUsed?: number;
    aiCreditsCap?: number;
  };
  members: Member[];
  contractedPrice?: number | null;
  financialStatus?: string;
  financialStatusLabel?: string;
  billingDueDay?: number | null;
  billingDueDayLabel?: string | null;
  nextDueAt?: string | null;
  nextDueDate?: string | null;
  hasCharge?: boolean;
  priceKind?: "FREE" | "FIXED" | "CUSTOM_ZERO" | "ON_REQUEST";
  daysOverdue?: number | null;
  daysOverdueLabel?: string | null;
  needsAttention?: boolean;
  subscription?: {
    id: string;
    billingStatus: string;
    billingCycle?: string;
    priceMonthly?: number | null;
    billingDueDay?: number | null;
    currentPeriodEnd?: string | null;
    trialEndsAt?: string | null;
  } | null;
  payments?: PaymentRow[];
  lifecycle?: {
    suspendedAt?: string | null;
    suspendReason?: string | null;
    blockedAt?: string | null;
    blockReason?: string | null;
    cancelledAt?: string | null;
    cancelReason?: string | null;
    deletionRequestedAt?: string | null;
  };
  lastActivityAt?: string | null;
  auditLogs: Array<{
    id: string;
    action: string;
    createdAt: string;
    user?: { name: string; email: string } | null;
  }>;
};

const TABS = [
  { id: "overview", label: "Visão geral" },
  { id: "plan", label: "Cobrança" },
  { id: "users", label: "Equipe" },
  { id: "usage", label: "Uso" },
  { id: "settings", label: "Operação" },
  { id: "audit", label: "Auditoria" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const roleLabel: Record<string, string> = {
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor",
  AGENT: "Atendente",
  SALES: "Comercial",
  READONLY: "Leitura",
};

const statusLabel: Record<string, string> = {
  ACTIVE: "Ativa",
  TRIAL: "Trial",
  BLOCKED: "Bloqueada",
  SUSPENDED: "Suspensa",
  CANCELLED: "Cancelada",
  PENDING_DELETION: "Exclusão agendada",
};

function formatDateOnly(value?: string | null) {
  return formatCivilDate(value);
}

const BRAZIL_UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

function contractedPriceLabel(t: {
  priceKind?: string;
  contractedPrice?: number | null;
}): string {
  if (t.priceKind === "ON_REQUEST" || (t.contractedPrice == null && t.priceKind !== "FREE" && t.priceKind !== "CUSTOM_ZERO")) {
    return "Sob consulta";
  }
  if (t.priceKind === "FREE" || t.contractedPrice === 0) {
    return t.priceKind === "CUSTOM_ZERO" ? "R$ 0,00/mês" : "Gratuito";
  }
  if (t.contractedPrice != null) return `${formatCurrency(t.contractedPrice)}/mês`;
  return "—";
}

function displayOrDash(value?: string | null) {
  const v = (value || "").trim();
  return v || "Não informado";
}

function financialToTone(code?: string): AdminTone {
  if (!code) return "neutral";
  if (code === "IN_GOOD_STANDING") return "success";
  if (code === "DUE_TODAY" || code === "DUE_SOON" || code === "TRIAL") return "warning";
  if (code === "OVERDUE" || code === "PAYMENT_PENDING") return "danger";
  if (code === "CANCELLED" || code === "SUSPENDED") return "neutral";
  return statusToTone(code);
}

/** Máscara visual BR — não altera o valor armazenado no formulário de edição */
function formatPhoneBR(raw?: string | null): string {
  if (!raw?.trim()) return "Não informado";
  const d = raw.replace(/\D/g, "");
  if (d.length === 11) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  return raw.trim();
}

/** Limite mensurável vs personalizado / sem teto fixo (alinha com UNLIMITED=999999 do backend) */
function usageLimitKind(
  max: number,
  opts?: { enterprise?: boolean }
): "fixed" | "unlimited" | "custom" {
  if (!Number.isFinite(max) || max <= 0) return opts?.enterprise ? "custom" : "custom";
  if (max === 999 || max >= 999_999) return opts?.enterprise ? "custom" : "unlimited";
  return "fixed";
}

function formatUsageLimit(used: number, max: number, kind: "fixed" | "unlimited" | "custom") {
  const u = used.toLocaleString("pt-BR");
  if (kind === "fixed") return `${u} de ${max.toLocaleString("pt-BR")}`;
  if (kind === "unlimited") return `${u} · Ilimitado`;
  return `${u} · Personalizado`;
}

function usagePct(used: number, max: number, kind: "fixed" | "unlimited" | "custom") {
  if (kind !== "fixed") return null;
  const raw = (used / max) * 100;
  if (used > 0 && raw < 1) return 0.5;
  return Math.min(100, Math.round(raw));
}

type UsageLevel = "normal" | "warn_light" | "warn" | "full";

function usageLevel(pct: number | null): UsageLevel | null {
  if (pct == null) return null;
  if (pct >= 100) return "full";
  if (pct >= 90) return "warn";
  if (pct >= 80) return "warn_light";
  return "normal";
}

function usageLevelLabel(level: UsageLevel | null, pct: number | null): string | null {
  if (level == null || pct == null) return null;
  if (level === "full") return "Limite atingido";
  const pctText = pct > 0 && pct < 1 ? "<1%" : `${Math.round(pct)}%`;
  if (level === "warn") return `${pctText} utilizado · Atenção`;
  if (level === "warn_light") return `${pctText} utilizado · Atenção leve`;
  return `${pctText} utilizado`;
}

export default function AdminTenantPage() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const { toast } = useToast();
  const setSession = useAuth((s) => s.setSession);
  const authUser = useAuth((s) => s.user);

  const id = String(params.id || "");
  const tabParam = (search.get("tab") || "overview") as TabId;
  const actionParam = search.get("action") || "";
  const [tab, setTab] = useState<TabId>(
    TABS.some((t) => t.id === tabParam) ? tabParam : "overview"
  );
  const [memberToRemove, setMemberToRemove] = useState<{
    id: string;
    name: string;
    email: string;
  } | null>(null);
  const [addMemberOpen, setAddMemberOpen] = useState(false);

  useEffect(() => {
    if (TABS.some((t) => t.id === tabParam)) setTab(tabParam);
  }, [tabParam]);

  const [editForm, setEditForm] = useState({
    name: "",
    legalName: "",
    tradeName: "",
    cnpj: "",
    primaryColor: "#6366f1",
    segment: "",
    phone: "",
    website: "",
    commercialEmail: "",
    city: "",
    state: "",
    timezone: "America/Sao_Paulo",
  });
  const [impReason, setImpReason] = useState("Suporte solicitado");
  const [impNote, setImpNote] = useState("");
  const [planId, setPlanId] = useState("");
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [impOpen, setImpOpen] = useState(false);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [stepUpForm, setStepUpForm] = useState({ password: "", code: "" });
  const [clearLogsOpen, setClearLogsOpen] = useState(false);
  const [clearLogsConfirm, setClearLogsConfirm] = useState("");
  const [planConfirmOpen, setPlanConfirmOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [editInfoOpen, setEditInfoOpen] = useState(false);
  const [dueDayEdit, setDueDayEdit] = useState("10");
  const [contractedEdit, setContractedEdit] = useState("");
  const [payForm, setPayForm] = useState({
    amount: "",
    paidAt: new Date().toISOString().slice(0, 10),
    referencePeriod: new Date().toISOString().slice(0, 7),
    method: "",
    notes: "",
  });

  const detail = useQuery({
    queryKey: ["admin-tenant", id],
    queryFn: () => api<TenantDetail>(`/admin/tenants/${id}`),
    enabled: authUser?.platformRole === "SUPERADMIN" && !!id,
    retry: false,
  });

  // Deep-links da lista (⋯): payment | delete | suspend
  useEffect(() => {
    if (!actionParam || !detail.data?.id) return;
    let nextTab: TabId = tabParam;
    if (actionParam === "payment") {
      nextTab = "plan";
      setTab("plan");
      setPayOpen(true);
    } else if (actionParam === "delete") {
      nextTab = "settings";
      setTab("settings");
      setDeleteOpen(true);
    } else if (actionParam === "suspend") {
      nextTab = "settings";
      setTab("settings");
      setSuspendOpen(true);
    }
    router.replace(`/admin/tenants/${id}?tab=${nextTab}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionParam, detail.data?.id, id]);

  const plans = useQuery({
    queryKey: ["admin-plans", "commercial-active"],
    queryFn: () => api<Plan[]>("/admin/plans?activeOnly=1&commercial=1"),
    enabled: authUser?.platformRole === "SUPERADMIN",
  });

  useEffect(() => {
    if (!detail.data) return;
    const t = detail.data;
    setEditForm({
      name: t.name,
      legalName: t.profile?.legalName || "",
      tradeName: t.profile?.tradeName || "",
      cnpj: t.profile?.cnpj || "",
      primaryColor: t.primaryColor || "#6366f1",
      segment: t.profile?.segment || "",
      phone: t.profile?.phone || "",
      website: t.profile?.website || "",
      commercialEmail: t.profile?.commercialEmail || t.profile?.email || "",
      city: t.profile?.city || "",
      state: t.profile?.state || "",
      timezone: t.profile?.timezone || "America/Sao_Paulo",
    });
    setPlanId(t.planId || t.plan?.id || "");
    setDueDayEdit(String(t.billingDueDay || t.subscription?.billingDueDay || 10));
    setContractedEdit(
      t.contractedPrice != null && Number.isFinite(Number(t.contractedPrice))
        ? String(t.contractedPrice)
        : ""
    );
    setPayForm((f) => ({
      ...f,
      amount:
        t.contractedPrice != null && Number.isFinite(Number(t.contractedPrice))
          ? String(t.contractedPrice)
          : f.amount,
    }));
  }, [detail.data]);

  const saveProfile = useMutation({
    mutationFn: () =>
      api(`/admin/tenants/${id}`, {
        method: "PATCH",
        json: {
          name: editForm.name.trim(),
          primaryColor: editForm.primaryColor,
          legalName: editForm.legalName.trim() || null,
          tradeName: editForm.tradeName.trim() || null,
          cnpj: editForm.cnpj.trim() || null,
          segment: editForm.segment || null,
          phone: editForm.phone || null,
          website: editForm.website || null,
          commercialEmail: editForm.commercialEmail || null,
          city: editForm.city || null,
          state: editForm.state || null,
          timezone: editForm.timezone || "America/Sao_Paulo",
        },
      }),
    onSuccess: () => {
      setEditInfoOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-tenant", id] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
      qc.invalidateQueries({ queryKey: ["admin-tenants"] });
      toast({ kind: "success", title: "Empresa atualizada" });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível salvar", description: e.message }),
  });

  const setStatus = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api(`/admin/tenants/${id}`, {
        method: "PATCH",
        json: payload,
      }),
    onSuccess: () => {
      setSuspendOpen(false);
      setSuspendReason("");
      qc.invalidateQueries({ queryKey: ["admin-tenant", id] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
      qc.invalidateQueries({ queryKey: ["admin-tenants"] });
      toast({ kind: "success", title: "Status atualizado" });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível concluir", description: e.message }),
  });

  const saveBilling = useMutation({
    mutationFn: (json: Record<string, unknown>) =>
      api(`/admin/tenants/${id}`, { method: "PATCH", json }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-tenant", id] });
      qc.invalidateQueries({ queryKey: ["admin-tenants"] });
      toast({ kind: "success", title: "Cobrança atualizada" });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível concluir", description: e.message }),
  });

  const registerPayment = useMutation({
    mutationFn: () => {
      const amount = Number(String(payForm.amount).replace(",", "."));
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Informe um valor válido");
      }
      return api(`/admin/tenants/${id}/payments`, {
        method: "POST",
        json: {
          amount,
          paidAt: payForm.paidAt
            ? new Date(`${payForm.paidAt}T12:00:00.000Z`).toISOString()
            : undefined,
          referencePeriod: payForm.referencePeriod || null,
          method: payForm.method || null,
          notes: payForm.notes || null,
          advanceDueDate: true,
        },
      });
    },
    onSuccess: () => {
      setPayOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-tenant", id] });
      qc.invalidateQueries({ queryKey: ["admin-tenants"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
      toast({ kind: "success", title: "Pagamento registrado" });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Falha ao registrar", description: e.message }),
  });

  const archive = useMutation({
    mutationFn: () =>
      api(`/admin/tenants/${id}`, {
        method: "DELETE",
        json: { confirmName: deleteConfirm, mode: "soft" },
      }),
    onSuccess: () => {
      setDeleteOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
      qc.invalidateQueries({ queryKey: ["admin-tenants"] });
      toast({
        kind: "success",
        title: "Exclusão solicitada",
        description: "Dados preservados. Acesso bloqueado.",
      });
      router.push("/admin/companies");
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível solicitar exclusão", description: e.message }),
  });

  const updateMember = useMutation({
    mutationFn: (args: {
      membershipId: string;
      role?: string;
      isActive?: boolean;
    }) =>
      api(`/admin/tenants/${id}/members/${args.membershipId}`, {
        method: "PATCH",
        json: {
          role: args.role,
          isActive: args.isActive,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-tenant", id] });
      toast({ kind: "success", title: "Acesso atualizado" });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível concluir", description: e.message }),
  });

  const removeMember = useMutation({
    mutationFn: (membershipId: string) =>
      api(`/admin/tenants/${id}/members/${membershipId}`, { method: "DELETE" }),
    onSuccess: () => {
      setMemberToRemove(null);
      qc.invalidateQueries({ queryKey: ["admin-tenant", id] });
      toast({
        kind: "success",
        title: "Usuário removido da empresa",
        description: "A conta do usuário foi preservada.",
      });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível concluir", description: e.message }),
  });

  const impersonate = useMutation({
    mutationFn: () => {
      const extra = impNote.trim();
      const reason =
        impReason === "Outro"
          ? extra
          : extra
            ? `${impReason}. ${extra}`
            : impReason;
      if (reason.trim().length < 8) {
        throw new Error("Informe o motivo do acesso (mínimo 8 caracteres).");
      }
      return api<{
        token: string;
        accessToken?: string;
        tenant: { id: string; name: string; slug: string };
        user: { id: string; name: string; email: string };
      }>("/admin/impersonate", {
        method: "POST",
        json: {
          tenantId: id,
          reason: reason.trim(),
        },
      });
    },
    onSuccess: (data) => {
      try {
        sessionStorage.setItem("nexaflow_impersonating", "1");
      } catch {
        /* ignore */
      }
      setSession({
        token: data.accessToken || data.token,
        user: {
          id: data.user.id,
          name: data.user.name,
          email: data.user.email,
          platformRole: "SUPERADMIN",
        },
        tenant: data.tenant,
      });
      setImpOpen(false);
      setStepUpOpen(false);
      setStepUpForm({ password: "", code: "" });
      window.location.href = "/app";
    },
    onError: (e: Error) => {
      if (isStepUpRequiredError(e)) {
        setImpOpen(false);
        setStepUpOpen(true);
        toast({
          kind: "warning",
          title: "Confirme sua identidade",
          description: "Informe a senha (e MFA se ativo) para acessar a empresa.",
        });
        return;
      }
      toast({ kind: "error", title: "Não foi possível acessar a empresa", description: e.message });
    },
  });

  const stepUpMutation = useMutation({
    mutationFn: () =>
      api("/auth/step-up", {
        method: "POST",
        json: {
          password: stepUpForm.password,
          code: stepUpForm.code.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast({ kind: "success", title: "Identidade confirmada" });
      impersonate.mutate();
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Confirmação falhou", description: e.message }),
  });

  const clearTenantLogs = useMutation({
    mutationFn: () =>
      api<{ ok: boolean; deleted: number; message: string }>(
        `/admin/tenants/${id}/logs`,
        {
          method: "DELETE",
          json: { confirm: clearLogsConfirm.trim() },
        }
      ),
    onSuccess: (res) => {
      setClearLogsOpen(false);
      setClearLogsConfirm("");
      void qc.invalidateQueries({ queryKey: ["admin-tenant", id] });
      toast({ kind: "success", title: "Logs da empresa limpos", description: res.message });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível limpar", description: e.message }),
  });

  const selectedPlanName = useMemo(() => {
    return plans.data?.find((p) => p.id === planId)?.name || "Sem plano";
  }, [plans.data, planId]);

  function selectTab(next: TabId) {
    setTab(next);
    router.replace(`/admin/tenants/${id}?tab=${next}`);
  }

  if (authUser?.platformRole !== "SUPERADMIN") {
    return (
      <AdminEmptyState
        title="Acesso restrito"
        description="Apenas superadministradores."
      />
    );
  }

  if (detail.isLoading) {
    return <AdminPageSkeleton metrics={6} />;
  }

  if (detail.isError || !detail.data) {
    if (isSuperadminMfaRequiredError(detail.error)) return null;
    const msg = detail.error instanceof Error ? detail.error.message : "Empresa não encontrada";
    return (
      <AdminErrorState
        title="Não foi possível carregar a empresa"
        description={msg}
        onRetry={() => void detail.refetch()}
      />
    );
  }

  const t = detail.data;

  function onSaveProfile(e: FormEvent) {
    e.preventDefault();
    saveProfile.mutate();
  }

  function openEditInfo() {
    setEditForm({
      name: t.name,
      legalName: t.profile?.legalName || "",
      tradeName: t.profile?.tradeName || "",
      cnpj: t.profile?.cnpj || "",
      primaryColor: t.primaryColor || "#6366f1",
      segment: t.profile?.segment || "",
      phone: t.profile?.phone || "",
      website: t.profile?.website || "",
      commercialEmail: t.profile?.commercialEmail || t.profile?.email || "",
      city: t.profile?.city || "",
      state: t.profile?.state || "",
      timezone: t.profile?.timezone || "America/Sao_Paulo",
    });
    setEditInfoOpen(true);
  }

  const statusText = t.statusLabel || statusLabel[t.status] || t.status;
  const canImpersonate =
    t.status !== "SUSPENDED" &&
    t.status !== "CANCELLED" &&
    t.status !== "BLOCKED" &&
    t.status !== "PENDING_DELETION";
  const canRegisterPayment = t.hasCharge !== false && t.priceKind !== "ON_REQUEST" && t.priceKind !== "FREE";
  const isOverdue =
    t.financialStatus === "OVERDUE" ||
    (t.daysOverdue != null && t.daysOverdue > 0);
  const recentActivity = (t.auditLogs || []).slice(0, 5);
  const lastActivityAt = t.lastActivityAt ?? recentActivity[0]?.createdAt ?? null;

  const maxUsers = t.limits?.maxUsers ?? t.plan?.maxUsers;
  const maxAgents = t.limits?.maxAgents;
  const usersUsed = t.usage?.users ?? t._count?.members ?? 0;
  const agentsUsed = t.usage?.agents ?? 0;

  function formatQuota(used: number, max?: number | null) {
    const unlimited = max == null || max === 999 || max >= 999_999;
    if (unlimited) return `${used.toLocaleString("pt-BR")} · Ilimitado`;
    const pct = (used / max) * 100;
    const pctLabel = used > 0 && pct < 1 ? " · <1% utilizado" : ` · ${Math.round(pct)}% utilizado`;
    return `${used.toLocaleString("pt-BR")} de ${max.toLocaleString("pt-BR")}${pctLabel}`;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t.name}
        description={`Cliente desde ${formatDateOnly(t.createdAt)}`}
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Empresas", href: "/admin/companies" },
          { label: t.name },
        ]}
        badge={{ label: statusText, tone: statusToTone(t.status) }}
        actions={
          <>
            {canRegisterPayment ? (
              <button
                type="button"
                className={isOverdue ? "admin-btn-primary" : "admin-btn-secondary"}
                onClick={() => {
                  selectTab("plan");
                  setPayOpen(true);
                }}
              >
                <Wallet className="h-3.5 w-3.5" strokeWidth={1.75} />
                Registrar pagamento
              </button>
            ) : null}
            <button
              type="button"
              className="admin-btn-ghost"
              disabled={!canImpersonate}
              onClick={() => setImpOpen(true)}
              title="Acessar o ambiente da empresa"
            >
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
              Acessar como empresa
            </button>
          </>
        }
      />

      <div className="admin-tabs" role="tablist" aria-label="Seções da empresa">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            data-active={tab === item.id ? "true" : "false"}
            onClick={() => selectTab(item.id)}
            className="admin-tab"
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* VISÃO GERAL */}
      {tab === "overview" && (
        <div className="space-y-4">
          <MetricGrid cols={6}>
            <MetricCard
              label="Status operacional"
              value={statusText}
              tone={statusToTone(t.status)}
              compact
            />
            <MetricCard
              label="Plano"
              value={t.plan?.name || "—"}
              tone="violet"
              compact
            />
            <MetricCard
              label="Valor contratado"
              value={contractedPriceLabel(t)}
              compact
            />
            <MetricCard
              label="Status financeiro"
              value={t.financialStatusLabel || "—"}
              tone={financialToTone(t.financialStatus)}
              compact
            />
            <MetricCard
              label="Usuários"
              value={formatQuota(usersUsed, maxUsers)}
              icon={<Users className="h-4 w-4" />}
              compact
            />
            <MetricCard
              label="Agentes IA"
              value={formatQuota(agentsUsed, maxAgents)}
              icon={<Bot className="h-4 w-4" />}
              tone="violet"
              compact
            />
          </MetricGrid>

          <div className="grid gap-4 lg:grid-cols-2">
            <AdminSection
              title="Informações da empresa"
              action={
                <button type="button" className="admin-btn-secondary h-8 px-3 text-[12px]" onClick={openEditInfo}>
                  Editar
                </button>
              }
            >
              <div className="mb-4 flex min-w-0 items-center gap-3">
                {t.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.logoUrl}
                    alt=""
                    className="h-11 w-11 rounded-lg object-cover ring-1 ring-white/[0.08]"
                  />
                ) : (
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-xs font-semibold text-white"
                    style={{ backgroundColor: t.primaryColor || "#6366F1" }}
                  >
                    {t.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-white">{t.name}</p>
                  <p className="text-[12px] text-gray-500">@{t.slug}</p>
                </div>
              </div>
              <dl className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["Nome", t.name],
                    ["Razão social", displayOrDash(t.profile?.legalName)],
                    ["CNPJ", displayOrDash(t.profile?.cnpj)],
                    ["Segmento", displayOrDash(t.profile?.segment)],
                    ["Telefone", formatPhoneBR(t.profile?.phone)],
                    ["E-mail comercial", displayOrDash(t.profile?.commercialEmail || t.profile?.email)],
                    ["Cidade", displayOrDash(t.profile?.city)],
                    ["Estado", displayOrDash(t.profile?.state)],
                    ["Fuso", displayOrDash(t.profile?.timezone)],
                    ["Site", displayOrDash(t.profile?.website)],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                      {label}
                    </dt>
                    <dd
                      className={cn(
                        "mt-0.5 truncate text-[13px] font-medium",
                        value === "Não informado" ? "text-gray-600" : "text-gray-200"
                      )}
                      title={value}
                    >
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </AdminSection>

            <AdminSection title="Saúde da conta">
              <dl className="space-y-2.5 text-[13px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">Onboarding</dt>
                  <dd className="font-medium text-gray-200">
                    {(t.onboarding?.completed ?? t.profile?.onboardingCompleted) ? "Concluído" : "Pendente"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">Canais</dt>
                  <dd className="tabular-nums font-medium text-gray-200">
                      {t._count?.channels ?? 0}
                    <span className="ml-1 text-[11px] font-normal text-gray-500">cadastrados</span>
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">Conversas</dt>
                  <dd className="tabular-nums font-medium text-gray-200">
                    {t._count?.conversations ?? 0}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">Contatos</dt>
                  <dd className="tabular-nums font-medium text-gray-200">
                    {t._count?.contacts ?? 0}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">Última atividade</dt>
                  <dd className="font-medium text-gray-200">
                    {lastActivityAt ? formatDate(lastActivityAt) : "Sem eventos"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">Vencimento</dt>
                  <dd className="text-gray-300">
                    {t.billingDueDayLabel || "—"}
                    {t.nextDueAt ? (
                      <span className="text-gray-500">
                        {" "}
                        · próx. {formatDateOnly(t.nextDueDate || t.nextDueAt)}
                      </span>
                    ) : null}
                  </dd>
                </div>
              </dl>
              {isOverdue ? (
                <p className="mt-3 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
                  Pagamento em atraso
                  {t.daysOverdueLabel ? ` (${t.daysOverdueLabel})` : ""}.
                  {canRegisterPayment ? (
                    <>
                      {" "}
                      Use{" "}
                      <button
                        type="button"
                        className="font-semibold text-white underline"
                        onClick={() => {
                          selectTab("plan");
                          setPayOpen(true);
                        }}
                      >
                        Registrar pagamento
                      </button>
                      .
                    </>
                  ) : null}
                </p>
              ) : null}
            </AdminSection>
          </div>

          <AdminSection
            title="Atividade recente"
            action={
              <button
                type="button"
                className="text-[12px] font-medium text-violet-300/90 transition-colors hover:text-violet-200"
                onClick={() => selectTab("audit")}
              >
                Ver auditoria
              </button>
            }
            flush={recentActivity.length > 0}
          >
            {recentActivity.length === 0 ? (
              <AdminEmptyState title="Sem eventos recentes" />
            ) : (
              <ul className="divide-y divide-white/[0.04]">
                {recentActivity.map((log) => (
                  <li
                    key={log.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5 text-[13px] sm:px-5"
                  >
                    <span className="font-medium text-gray-200">
                      {humanizeAuditAction(log.action)}
                    </span>
                    <span className="text-[11px] text-gray-500">
                      {log.user?.name || "Sistema"} · {formatDate(log.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </AdminSection>
        </div>
      )}

      {/* EQUIPE */}
      {tab === "users" && (
        <AdminSection
          title="Equipe da empresa"
          description="Remover da empresa não exclui a conta do usuário."
          flush={t.members.length > 0}
          action={
            <button
              type="button"
              className="admin-btn-primary h-8 px-2.5 text-[12px]"
              onClick={() => setAddMemberOpen(true)}
            >
              Adicionar membro
            </button>
          }
        >
          {t.members.length === 0 ? (
            <AdminEmptyState title="Nenhum usuário vinculado" />
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {t.members.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <UserAvatar user={m.user} size="md" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-[13px] font-medium text-white">
                          {m.user.name}
                        </p>
                        <StatusBadge tone={m.isActive ? "success" : "neutral"} dot>
                          {m.isActive ? "Ativo" : "Inativo"}
                        </StatusBadge>
                      </div>
                      <p className="truncate text-[12px] text-gray-500">{m.user.email}</p>
                      <p className="mt-0.5 text-[11px] text-gray-600">
                        {roleLabel[m.role] || m.role}
                        {m.user.lastLoginAt
                          ? ` · último acesso ${formatDate(m.user.lastLoginAt)}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      className="w-auto min-w-[8rem]"
                      size="sm"
                      value={m.role}
                      onChange={(role) =>
                        updateMember.mutate({ membershipId: m.id, role })
                      }
                      options={Object.entries(roleLabel).map(([k, v]) => ({
                        value: k,
                        label: v,
                      }))}
                      aria-label={`Papel de ${m.user.name}`}
                    />
                    <ActionMenu
                      aria-label={`Ações de ${m.user.name} nesta empresa`}
                      items={[
                        {
                          label: m.isActive ? "Suspender acesso à empresa" : "Reativar acesso à empresa",
                          icon: UserX,
                          onClick: () =>
                            updateMember.mutate({
                              membershipId: m.id,
                              isActive: !m.isActive,
                            }),
                        },
                        {
                          label: "Remover da empresa",
                          icon: UserMinus,
                          danger: true,
                          onClick: () =>
                            setMemberToRemove({
                              id: m.id,
                              name: m.user.name,
                              email: m.user.email,
                            }),
                        },
                      ]}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </AdminSection>
      )}

      {/* COBRANÇA */}
      {tab === "plan" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <AdminSection title="Plano e valor">
            <p className="mb-4 text-[13px] text-gray-400">
              <strong className="text-white">{t.plan?.name || "Sem plano"}</strong>
              {" · "}
              <strong className="text-white">{contractedPriceLabel(t)}</strong>
            </p>
            <div className="space-y-3">
              <div>
                <label className="label">Alterar para</label>
                <Select
                  value={planId}
                  onChange={setPlanId}
                  options={[
                    ...(detail.data?.plan &&
                    !selectablePlansForCompany(plans.data || []).some(
                      (p) => p.id === detail.data?.plan?.id
                    )
                      ? [
                          {
                            value: detail.data.plan.id,
                            label: `${detail.data.plan.name} (atual)`,
                          },
                        ]
                      : []),
                    ...selectablePlansForCompany(plans.data || []).map((p) => ({
                      value: p.id,
                      label: planSelectLabel(p),
                    })),
                  ]}
                  aria-label="Alterar plano"
                />
              </div>
              <div>
                <label className="label">Valor contratado (R$/mês)</label>
                <MoneyInput
                  value={contractedEdit}
                  onChange={setContractedEdit}
                  placeholder="249,00"
                />
              </div>
              <button
                type="button"
                className="admin-btn-primary"
                onClick={() => setPlanConfirmOpen(true)}
              >
                Salvar plano / valor
              </button>
            </div>
          </AdminSection>

          <AdminSection title="Vencimento e pagamentos">
            <dl className="mb-4 space-y-2 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">Status financeiro</dt>
                <dd>
                  <StatusBadge tone={financialToTone(t.financialStatus)}>
                    {t.financialStatusLabel || "—"}
                  </StatusBadge>
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">Vencimento</dt>
                <dd className="text-gray-200">{t.billingDueDayLabel || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">Próximo vencimento</dt>
                <dd className="tabular-nums text-gray-200">{formatDateOnly(t.nextDueDate || t.nextDueAt)}</dd>
              </div>
              {t.daysOverdue != null && t.daysOverdue > 0 ? (
                <div className="rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
                  Pagamento atrasado há {t.daysOverdue} dia
                  {t.daysOverdue === 1 ? "" : "s"}. A empresa não é excluída automaticamente.
                </div>
              ) : null}
            </dl>
            <div className="space-y-3">
              <div>
                <label className="label">Dia do vencimento</label>
                <Select
                  value={dueDayEdit}
                  onChange={setDueDayEdit}
                  options={[5, 10, 15, 20, 25, 1, 28].map((d) => ({
                    value: String(d),
                    label: `Todo dia ${d}`,
                  }))}
                  aria-label="Dia do vencimento"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="admin-btn-secondary"
                  disabled={saveBilling.isPending}
                  onClick={() => saveBilling.mutate({ billingDueDay: Number(dueDayEdit) })}
                >
                  Salvar vencimento
                </button>
                {canRegisterPayment ? (
                  <button type="button" className="admin-btn-primary" onClick={() => setPayOpen(true)}>
                    Registrar pagamento
                  </button>
                ) : null}
              </div>
            </div>
          </AdminSection>

          <AdminSection
            title="Histórico de pagamentos"
            className="lg:col-span-2"
            flush={!!t.payments?.length}
          >
            {!t.payments?.length ? (
              <AdminEmptyState title="Nenhum pagamento registrado" />
            ) : (
              <div className="admin-table-wrap overflow-x-auto">
                <table className="admin-table w-full min-w-[480px] border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">
                        Valor
                      </th>
                      <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">
                        Data
                      </th>
                      <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">
                        Ref. / método
                      </th>
                      <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">
                        Notas
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.payments.map((p) => (
                      <tr
                        key={p.id}
                        className="border-b border-white/[0.04] last:border-0"
                      >
                        <td className="px-4 py-3 font-medium tabular-nums text-white">
                          {formatCurrency(p.amount)}
                        </td>
                        <td className="px-4 py-3 text-gray-400">{formatDate(p.paidAt)}</td>
                        <td className="px-4 py-3 text-gray-400">
                          {p.referencePeriod ? `ref. ${p.referencePeriod}` : "—"}
                          {p.method ? ` · ${p.method}` : ""}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{p.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AdminSection>
        </div>
      )}

      {/* USO — cotas e consumo (sem métricas de chat/CRM operacional) */}
      {tab === "usage" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-[13px] font-semibold tracking-tight text-white/90">
              Uso e limites
            </h2>
            {t.plan?.name ? (
              <p className="mt-0.5 text-[12px] text-gray-500">Plano {t.plan.name}</p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {(() => {
              const isEnterprisePlan =
                t.plan?.slug === "enterprise" || Boolean(t.plan?.priceOnRequest);
              const rows = [
                {
                  id: "users",
                  label: "Usuários",
                  hint: "Membros ativos na empresa",
                  used: t.usage?.users ?? t._count?.members ?? 0,
                  max: t.limits?.maxUsers ?? t.plan?.maxUsers ?? 0,
                  icon: Users,
                },
                {
                  id: "agents",
                  label: "Agentes de IA",
                  hint: "Assistentes configurados",
                  used: t.usage?.agents ?? 0,
                  max: t.limits?.maxAgents ?? 0,
                  icon: Bot,
                },
                {
                  id: "ai-credits",
                  label: "Créditos de IA",
                  hint: "Uso no ciclo atual",
                  used: t.usage?.aiCreditsUsed ?? t.usage?.aiCredits ?? 0,
                  max:
                    t.usage?.aiCreditsCap ??
                    t.limits?.monthlyAiCredits ??
                    t.limits?.maxAiMessages ??
                    t.plan?.maxAiMessages ??
                    0,
                  icon: Sparkles,
                },
                {
                  id: "flows",
                  label: "Fluxos ativos",
                  hint: "Automações em execução",
                  used: t.usage?.activeFlows ?? t.usage?.automations ?? 0,
                  max: t.limits?.maxActiveFlows ?? t.limits?.maxAutomations ?? 0,
                  icon: Workflow,
                },
              ] as const;

              return rows.map((row) => {
                const kind = usageLimitKind(row.max, { enterprise: isEnterprisePlan });
                const pct = usagePct(row.used, row.max, kind);
                const level = usageLevel(pct);
                const levelText = usageLevelLabel(level, pct);
                const Icon = row.icon;

                return (
                  <div
                    key={row.id}
                    className={cn(
                      "flex flex-col gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4",
                      level === "full" && "border-red-400/25",
                      level === "warn" && "border-amber-400/25",
                      level === "warn_light" && "border-amber-400/15"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.05] text-gray-400 ring-1 ring-white/[0.06]">
                            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </span>
                          <p className="text-[13px] font-semibold text-white">{row.label}</p>
                        </div>
                        <p className="mt-1 text-[11px] text-gray-500">{row.hint}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[13px] font-semibold tabular-nums text-white">
                          {formatUsageLimit(row.used, row.max, kind)}
                        </p>
                        {kind === "custom" ? (
                          <p className="mt-0.5 text-[10px] font-medium text-gray-500">
                            Personalizado
                          </p>
                        ) : kind === "unlimited" ? (
                          <p className="mt-0.5 text-[10px] font-medium text-gray-500">
                            Sem limite fixo
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {kind === "fixed" && pct != null ? (
                      <>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-300",
                              level === "full" && "bg-red-500",
                              level === "warn" && "bg-amber-500",
                              level === "warn_light" && "bg-amber-400",
                              level === "normal" && "bg-violet-500"
                            )}
                            style={{
                              width: `${pct === 0 ? 0 : Math.max(pct, 3)}%`,
                            }}
                          />
                        </div>
                        <p
                          className={cn(
                            "text-[11px] font-medium tabular-nums",
                            level === "full" && "text-red-300",
                            level === "warn" && "text-amber-200",
                            level === "warn_light" && "text-amber-300",
                            level === "normal" && "text-gray-500"
                          )}
                        >
                          {levelText}
                        </p>
                      </>
                    ) : (
                      <p className="text-[11px] text-gray-500">
                        {kind === "custom" ? "Limite personalizado." : "Sem limite fixo."}
                      </p>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* OPERAÇÃO */}
      {tab === "settings" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <AdminSection title="Status operacional">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-gray-400">Atual:</span>
              <StatusBadge tone={statusToTone(t.status)} dot>
                {t.statusLabel || statusLabel[t.status] || t.status}
              </StatusBadge>
            </div>
            <p className="mb-4 text-[12px] text-gray-500">
              Bloquear impede o login. Suspender interrompe a operação. Nenhum dos dois
              apaga dados.
            </p>
            <div className="flex flex-wrap gap-2">
              {(t.status === "ACTIVE" || t.status === "TRIAL") && (
                <>
                  <button
                    type="button"
                    className="admin-btn-secondary"
                    disabled={setStatus.isPending}
                    onClick={() =>
                      setStatus.mutate({
                        action: "block",
                        blockReason: "Bloqueio administrativo",
                      })
                    }
                  >
                    Bloquear acesso
                  </button>
                  <button
                    type="button"
                    className="admin-btn-secondary"
                    onClick={() => setSuspendOpen(true)}
                  >
                    Suspender empresa
                  </button>
                </>
              )}
              {t.status === "BLOCKED" && (
                <button
                  type="button"
                  className="admin-btn-primary"
                  disabled={setStatus.isPending}
                  onClick={() => setStatus.mutate({ action: "unblock" })}
                >
                  Desbloquear
                </button>
              )}
              {(t.status === "SUSPENDED" ||
                t.status === "CANCELLED" ||
                t.status === "PENDING_DELETION") && (
                <button
                  type="button"
                  className="admin-btn-primary"
                  disabled={setStatus.isPending}
                  onClick={() =>
                    setStatus.mutate(
                      t.status === "PENDING_DELETION"
                        ? { action: "cancel_deletion" }
                        : { action: "reactivate" }
                    )
                  }
                >
                  {t.status === "PENDING_DELETION"
                    ? "Cancelar exclusão"
                    : "Reativar empresa"}
                </button>
              )}
              {t.status !== "CANCELLED" && t.status !== "PENDING_DELETION" && (
                <button
                  type="button"
                  className="admin-btn-secondary"
                  disabled={setStatus.isPending}
                  onClick={() =>
                    setStatus.mutate({
                      action: "cancel_subscription",
                      cancelReason: "Cancelamento administrativo",
                    })
                  }
                >
                  Cancelar assinatura
                </button>
              )}
            </div>
          </AdminSection>

          <AdminSection
            title="Zona de perigo"
            className="border-red-400/20"
          >
            <p className="mb-4 text-[13px] leading-relaxed text-gray-400">
              Agenda a exclusão. Dados e WhatsApp não são apagados automaticamente.
            </p>
            <button
              type="button"
              className="admin-btn-danger"
              disabled={t.status === "PENDING_DELETION"}
              onClick={() => setDeleteOpen(true)}
            >
              Excluir empresa…
            </button>
          </AdminSection>
        </div>
      )}

      {/* AUDITORIA */}
      {tab === "audit" && (
        <AdminSection
          title="Logs da empresa"
          action={
            <button
              type="button"
              className="admin-btn-danger h-8 px-3 text-[12px]"
              disabled={!t.auditLogs?.length}
              onClick={() => {
                setClearLogsConfirm("");
                setClearLogsOpen(true);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              Limpar logs
            </button>
          }
          flush={t.auditLogs.length > 0}
        >
          {t.auditLogs.length === 0 ? (
            <AdminEmptyState title="Sem eventos registrados" />
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {t.auditLogs.map((log) => (
                <div key={log.id} className="px-4 py-3 text-[13px] sm:px-5">
                  <p className="font-medium text-gray-100">
                    {humanizeAuditAction(log.action)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    {log.user?.name || "Sistema"} · {formatDate(log.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </AdminSection>
      )}

      {/* Editar informações da empresa — modo leitura na overview + modal DS */}
      <Modal
        open={editInfoOpen}
        onClose={() => {
          if (saveProfile.isPending) return;
          setEditInfoOpen(false);
        }}
        title="Editar informações"
        description={t.name}
        size="lg"
        variant="contextual"
        initialFocus="panel"
        preventClose={saveProfile.isPending}
        footer={
          <DialogFooter>
            <button
              type="button"
              className="admin-btn-secondary"
              disabled={saveProfile.isPending}
              onClick={() => setEditInfoOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="admin-btn-primary"
              disabled={saveProfile.isPending || !editForm.name.trim()}
              onClick={() => saveProfile.mutate()}
            >
              {saveProfile.isPending ? "Salvando…" : "Salvar alterações"}
            </button>
          </DialogFooter>
        }
      >
        <form className="space-y-4" onSubmit={onSaveProfile}>
          <FormSection title="Informações" surface>
            <FormField label="Nome" required>
              <input
                className="input"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                required
                autoComplete="organization"
              />
            </FormField>
            <FieldGrid>
              <FormField label="Razão social">
                <input
                  className="input"
                  value={editForm.legalName}
                  onChange={(e) => setEditForm({ ...editForm, legalName: e.target.value })}
                />
              </FormField>
              <FormField label="Nome fantasia">
                <input
                  className="input"
                  value={editForm.tradeName}
                  onChange={(e) => setEditForm({ ...editForm, tradeName: e.target.value })}
                />
              </FormField>
            </FieldGrid>
            <FormField label="CNPJ">
              <input
                className="input"
                value={editForm.cnpj}
                onChange={(e) => setEditForm({ ...editForm, cnpj: e.target.value })}
                placeholder="00.000.000/0000-00"
                inputMode="numeric"
              />
            </FormField>
            <FieldGrid>
              <FormField label="Segmento">
                <input
                  className="input"
                  value={editForm.segment}
                  onChange={(e) => setEditForm({ ...editForm, segment: e.target.value })}
                  placeholder="Ex.: Clínica, E-commerce"
                />
              </FormField>
              <FormField label="Cor">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    className="h-9 w-12 cursor-pointer rounded-lg border border-black/[0.08] bg-transparent p-1 dark:border-white/[0.1]"
                    value={
                      /^#[0-9A-Fa-f]{6}$/.test(editForm.primaryColor)
                        ? editForm.primaryColor
                        : "#6366f1"
                    }
                    onChange={(e) =>
                      setEditForm({ ...editForm, primaryColor: e.target.value })
                    }
                    aria-label="Cor primária"
                  />
                  <input
                    className="input font-mono text-[13px]"
                    value={editForm.primaryColor}
                    onChange={(e) =>
                      setEditForm({ ...editForm, primaryColor: e.target.value })
                    }
                    placeholder="#6366f1"
                  />
                </div>
              </FormField>
            </FieldGrid>
          </FormSection>

          <FormSection title="Contato" surface>
            <FieldGrid>
              <FormField label="Telefone">
                <input
                  className="input"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  placeholder="(34) 99653-7860"
                  inputMode="tel"
                  autoComplete="tel"
                />
              </FormField>
              <FormField label="E-mail">
                <input
                  className="input"
                  type="email"
                  value={editForm.commercialEmail}
                  onChange={(e) =>
                    setEditForm({ ...editForm, commercialEmail: e.target.value })
                  }
                  placeholder="contato@empresa.com"
                  autoComplete="email"
                />
              </FormField>
            </FieldGrid>
            <FormField label="Site">
              <input
                className="input"
                value={editForm.website}
                onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                placeholder="https://"
                autoComplete="url"
              />
            </FormField>
          </FormSection>

          <FormSection title="Localização" surface>
            <FieldGrid>
              <FormField label="Cidade">
                <input
                  className="input"
                  value={editForm.city}
                  onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                  autoComplete="address-level2"
                />
              </FormField>
              <FormField label="UF">
                <Select
                  value={editForm.state}
                  onChange={(state) => setEditForm({ ...editForm, state })}
                  options={[
                    { value: "", label: "—" },
                    ...BRAZIL_UFS.map((uf) => ({ value: uf, label: uf })),
                  ]}
                  aria-label="UF"
                />
              </FormField>
            </FieldGrid>
            <FormField label="Fuso horário">
              <Select
                value={editForm.timezone}
                onChange={(timezone) => setEditForm({ ...editForm, timezone })}
                options={[
                  { value: "America/Sao_Paulo", label: "America/Sao_Paulo" },
                  { value: "America/Manaus", label: "America/Manaus" },
                  { value: "America/Fortaleza", label: "America/Fortaleza" },
                  { value: "America/Recife", label: "America/Recife" },
                  { value: "America/Belem", label: "America/Belem" },
                  { value: "America/Cuiaba", label: "America/Cuiaba" },
                  { value: "America/Porto_Velho", label: "America/Porto_Velho" },
                  { value: "America/Noronha", label: "America/Noronha" },
                ]}
                aria-label="Fuso horário"
              />
            </FormField>
          </FormSection>
        </form>
      </Modal>

      {/* CONFIRMATION / STANDARD compactos admin */}
      <Modal
        open={suspendOpen}
        onClose={() => setSuspendOpen(false)}
        title="Suspender empresa"
        description={t.name}
        variant="danger"
        tone="danger"
        size="sm"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="admin-btn-secondary"
              onClick={() => setSuspendOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="admin-btn-danger"
              disabled={!suspendReason.trim() || setStatus.isPending}
              onClick={() =>
                setStatus.mutate({
                  action: "suspend",
                  suspendReason: suspendReason.trim(),
                })
              }
            >
              {setStatus.isPending ? "Suspendendo…" : "Suspender empresa"}
            </button>
          </DialogFooter>
        }
      >
        <div className="space-y-3">
          <EntitySummary
            title={t.name}
            subtitle={t.plan?.name ? `Plano ${t.plan.name}` : undefined}
          />
          <p className="text-sm text-ink-secondary dark:text-gray-300">
            A empresa fica sem acesso. Os dados são preservados.
          </p>
          <FormField label="Motivo" required>
            <textarea
              className="input min-h-[80px]"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="Motivo"
              required
            />
          </FormField>
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={`Excluir ${t.name}?`}
        description="Digite o nome da empresa para confirmar."
        variant="danger"
        tone="danger"
        size="sm"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="admin-btn-secondary"
              onClick={() => setDeleteOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="admin-btn-danger"
              disabled={deleteConfirm.trim() !== t.name || archive.isPending}
              onClick={() => archive.mutate()}
            >
              {archive.isPending ? "Processando…" : "Excluir empresa"}
            </button>
          </DialogFooter>
        }
      >
        <div className="space-y-3">
          <EntitySummary
            title={t.name}
            subtitle={t.plan?.name ? `Plano ${t.plan.name}` : undefined}
            meta={[
              { label: "Impacto", value: "Acesso bloqueado · dados preservados" },
            ]}
          />
          <FormField label={`Digite "${t.name}"`} required>
            <input
              className="input"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={t.name}
              aria-label="Confirmar nome da empresa"
              autoComplete="off"
            />
          </FormField>
        </div>
      </Modal>

      <Modal
        open={planConfirmOpen}
        onClose={() => setPlanConfirmOpen(false)}
        title="Confirmar alteração de plano"
        description="O preço contratado só muda se você informar um valor explícito."
        variant="confirm"
        size="sm"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="admin-btn-secondary"
              onClick={() => setPlanConfirmOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="admin-btn-primary"
              disabled={saveBilling.isPending}
              onClick={() => {
                const json: Record<string, unknown> = { planId: planId || null };
                if (contractedEdit.trim()) {
                  const n = Number(String(contractedEdit).replace(",", "."));
                  if (Number.isFinite(n) && n >= 0) json.priceMonthly = n;
                }
                saveBilling.mutate(json, {
                  onSuccess: () => {
                    setPlanConfirmOpen(false);
                    qc.invalidateQueries({ queryKey: ["admin-tenant", id] });
                    qc.invalidateQueries({ queryKey: ["admin-overview"] });
                  },
                });
              }}
            >
              {saveBilling.isPending ? "Salvando…" : "Confirmar plano"}
            </button>
          </DialogFooter>
        }
      >
        <p className="text-sm text-ink-secondary dark:text-gray-300">
          Alterar <strong className="text-ink dark:text-white">{t.name}</strong> do plano{" "}
          <strong className="text-ink dark:text-white">{t.plan?.name || "Sem plano"}</strong>{" "}
          para <strong className="text-ink dark:text-white">{selectedPlanName}</strong>
          {contractedEdit.trim()
            ? ` com valor contratado R$ ${contractedEdit}`
            : ""}
          ?
        </p>
      </Modal>

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Registrar pagamento"
        description={t.name}
        size="lg"
        variant="contextual"
        initialFocus="panel"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="admin-btn-secondary"
              onClick={() => setPayOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="admin-btn-primary"
              disabled={registerPayment.isPending || !payForm.amount}
              onClick={() => registerPayment.mutate()}
            >
              {registerPayment.isPending ? "Registrando…" : "Registrar pagamento"}
            </button>
          </DialogFooter>
        }
      >
        <div className="space-y-5">
          <EntitySummary
            title={t.name}
            subtitle={t.plan?.name ? `Plano ${t.plan.name}` : "Sem plano"}
            meta={[
              {
                label: "Valor contratado",
                value:
                  t.priceKind === "ON_REQUEST"
                    ? "Sob consulta"
                    : t.priceKind === "FREE"
                      ? "Sem cobrança"
                      : t.contractedPrice != null
                        ? `${formatCurrency(t.contractedPrice)}/mês`
                        : "—",
              },
              {
                label: "Vencimento",
                value: t.billingDueDayLabel || (t.billingDueDay ? `Todo dia ${t.billingDueDay}` : "—"),
              },
              {
                label: "Situação",
                value: t.financialStatusLabel || "—",
              },
              {
                label: "Próx. vencimento",
                value: formatDateOnly(t.nextDueDate || t.nextDueAt),
              },
            ]}
          />

          <FormSection title="Pagamento" surface>
            <FieldGrid>
              <FormField label="Valor" required>
                <MoneyInput
                  value={payForm.amount}
                  onChange={(amount) => setPayForm({ ...payForm, amount })}
                  placeholder="699,00"
                />
              </FormField>
              <FormField label="Data" required>
                <DateInput
                  value={payForm.paidAt}
                  onChange={(paidAt) => setPayForm({ ...payForm, paidAt })}
                  aria-label="Data do pagamento"
                />
              </FormField>
            </FieldGrid>
            <FieldGrid>
              <FormField label="Referência">
                <Select
                  value={payForm.referencePeriod}
                  onChange={(referencePeriod) =>
                    setPayForm({ ...payForm, referencePeriod })
                  }
                  options={(() => {
                    const opts: { value: string; label: string }[] = [];
                    const now = new Date();
                    for (let i = -2; i <= 6; i++) {
                      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
                      const y = d.getFullYear();
                      const m = String(d.getMonth() + 1).padStart(2, "0");
                      const value = `${y}-${m}`;
                      const label = d.toLocaleDateString("pt-BR", {
                        month: "long",
                        year: "numeric",
                      });
                      opts.push({
                        value,
                        label: label.charAt(0).toUpperCase() + label.slice(1),
                      });
                    }
                    if (
                      payForm.referencePeriod &&
                      !opts.some((o) => o.value === payForm.referencePeriod)
                    ) {
                      opts.unshift({
                        value: payForm.referencePeriod,
                        label: payForm.referencePeriod,
                      });
                    }
                    return opts;
                  })()}
                  aria-label="Referência"
                />
              </FormField>
              <FormField label="Método">
                <Select
                  value={payForm.method}
                  onChange={(method) => setPayForm({ ...payForm, method })}
                  options={[
                    { value: "", label: "Não informado" },
                    { value: "PIX", label: "PIX" },
                    { value: "TRANSFER", label: "Transferência" },
                    { value: "BOLETO", label: "Boleto" },
                    { value: "CARD", label: "Cartão" },
                    { value: "CASH", label: "Dinheiro" },
                    { value: "OTHER", label: "Outro" },
                  ]}
                  aria-label="Método"
                />
              </FormField>
            </FieldGrid>
            <FormField label="Observação">
              <textarea
                className="input min-h-[64px]"
                value={payForm.notes}
                onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
                placeholder="Opcional"
              />
            </FormField>
          </FormSection>
        </div>
      </Modal>

      <Modal
        open={impOpen && !stepUpOpen}
        onClose={() => setImpOpen(false)}
        title="Acessar como esta empresa?"
        description="Ações serão registradas. A Administração fica bloqueada durante o acesso."
        variant="confirm"
        size="sm"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="admin-btn-secondary"
              onClick={() => setImpOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="admin-btn-primary"
              disabled={
                impersonate.isPending ||
                (impReason === "Outro" && impNote.trim().length < 8)
              }
              onClick={() => impersonate.mutate()}
            >
              {impersonate.isPending ? "Acessando…" : "Acessar empresa"}
            </button>
          </DialogFooter>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-ink-secondary dark:text-gray-300">
            Você visualizará a plataforma como um usuário de{" "}
            <strong className="text-ink dark:text-white">{t.name}</strong>.
          </p>
          <FormField label="Motivo do acesso" required>
            <RadioGroup
              aria-label="Motivo do acesso"
              value={impReason}
              onChange={setImpReason}
              options={[
                { value: "Suporte solicitado", label: "Suporte solicitado" },
                { value: "Diagnóstico", label: "Diagnóstico" },
                { value: "Configuração", label: "Configuração" },
                { value: "Outro", label: "Outro" },
              ]}
            />
          </FormField>
          <FormField label={impReason === "Outro" ? "Descreva o motivo" : "Complemento (opcional)"}>
            <textarea
              className="input min-h-[72px]"
              value={impNote}
              onChange={(e) => setImpNote(e.target.value)}
              placeholder={impReason === "Outro" ? "Mínimo 8 caracteres" : "Detalhe se necessário"}
            />
          </FormField>
        </div>
      </Modal>

      {/* Step-up: reconfirmação para impersonar */}
      <Modal
        open={stepUpOpen}
        onClose={() => {
          if (stepUpMutation.isPending || impersonate.isPending) return;
          setStepUpOpen(false);
          setStepUpForm({ password: "", code: "" });
        }}
        title="Confirme sua identidade"
        description="Por segurança, confirme a senha da conta de superadministrador para acessar a empresa."
        variant="soft"
        size="sm"
        preventClose={stepUpMutation.isPending || impersonate.isPending}
        footer={
          <DialogFooter>
            <button
              type="button"
              className="admin-btn-secondary"
              disabled={stepUpMutation.isPending}
              onClick={() => {
                setStepUpOpen(false);
                setStepUpForm({ password: "", code: "" });
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="admin-btn-primary"
              disabled={
                stepUpMutation.isPending ||
                impersonate.isPending ||
                !stepUpForm.password
              }
              onClick={() => stepUpMutation.mutate()}
            >
              {stepUpMutation.isPending || impersonate.isPending
                ? "Confirmando…"
                : "Confirmar e acessar"}
            </button>
          </DialogFooter>
        }
      >
        <div className="space-y-3">
          <FormField label="Senha" required>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={stepUpForm.password}
              onChange={(e) =>
                setStepUpForm((f) => ({ ...f, password: e.target.value }))
              }
            />
          </FormField>
          <FormField
            label="Código MFA"
            hint="Obrigatório se a autenticação em duas etapas estiver ativa."
          >
            <input
              className="input"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              value={stepUpForm.code}
              onChange={(e) =>
                setStepUpForm((f) => ({ ...f, code: e.target.value }))
              }
            />
          </FormField>
        </div>
      </Modal>

      {/* Limpar logs da empresa */}
      <Modal
        open={clearLogsOpen}
        onClose={() => {
          if (clearTenantLogs.isPending) return;
          setClearLogsOpen(false);
          setClearLogsConfirm("");
        }}
        title="Limpar logs desta empresa?"
        description="Remove apenas os eventos de auditoria vinculados a esta organização."
        variant="danger"
        tone="danger"
        size="sm"
        preventClose={clearTenantLogs.isPending}
        footer={
          <DialogFooter>
            <button
              type="button"
              className="admin-btn-secondary"
              disabled={clearTenantLogs.isPending}
              onClick={() => {
                setClearLogsOpen(false);
                setClearLogsConfirm("");
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="admin-btn-danger"
              disabled={
                clearTenantLogs.isPending ||
                clearLogsConfirm.trim().toUpperCase() !== "LIMPAR"
              }
              onClick={() => clearTenantLogs.mutate()}
            >
              {clearTenantLogs.isPending ? "Limpando…" : "Limpar logs da empresa"}
            </button>
          </DialogFooter>
        }
      >
        <div className="space-y-3">
          <p className="rounded-xl border border-rose-500/20 bg-rose-500/[0.08] px-3 py-2.5 text-[12.5px] leading-relaxed text-rose-900 dark:text-rose-100">
            Os logs globais da plataforma não são afetados. Um evento residual registra
            quem limpou e quantos registros existiam.
          </p>
          <FormField label='Digite LIMPAR para confirmar' required>
            <input
              className="input"
              value={clearLogsConfirm}
              onChange={(e) => setClearLogsConfirm(e.target.value)}
              placeholder="LIMPAR"
              autoComplete="off"
            />
          </FormField>
        </div>
      </Modal>

      <AddMemberDialog
        open={addMemberOpen}
        onClose={() => setAddMemberOpen(false)}
        tenantId={id}
        tenantName={t.name}
      />

      <Modal
        open={Boolean(memberToRemove)}
        onClose={() => !removeMember.isPending && setMemberToRemove(null)}
        title="Remover da empresa"
        description="Esta ação remove o acesso a esta empresa, mas não exclui a conta do usuário."
        footer={
          <DialogFooter>
            <button
              type="button"
              className="admin-btn-secondary"
              disabled={removeMember.isPending}
              onClick={() => setMemberToRemove(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="admin-btn-danger"
              disabled={removeMember.isPending || !memberToRemove}
              onClick={() => memberToRemove && removeMember.mutate(memberToRemove.id)}
            >
              {removeMember.isPending ? "Removendo…" : "Remover acesso"}
            </button>
          </DialogFooter>
        }
      >
        {memberToRemove ? (
          <p className="text-[13px] text-ink-secondary dark:text-gray-300">
            {memberToRemove.name} ({memberToRemove.email}) perderá o vínculo com{" "}
            <strong className="text-ink dark:text-white">{t.name}</strong>. A identidade
            global permanece intacta e pode ser reassociada depois.
          </p>
        ) : null}
      </Modal>
    </div>
  );
}
