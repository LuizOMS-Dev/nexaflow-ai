"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  Brain,
  Building2,
  Check,
  Code2,
  Copy,
  CreditCard,
  ExternalLink,
  Headset,
  ImageIcon,
  MessageCircle,
  Palette,
  Plug,
  Settings2,
  Sparkles,
  Trash2,
  Webhook,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Modal, Select, Spinner, Switch, useToast } from "@/components/ui";
import { TenantModule } from "@/components/tenant/tenant-module";
import { useAuth } from "@/store/auth";

type TabId =
  | "general"
  | "identity"
  | "preferences"
  | "plan"
  | "ai"
  | "attendance"
  | "integrations";

type TenantSettings = {
  timezone?: string;
  language?: string;
  segment?: string | null;
  phone?: string | null;
  website?: string | null;
  commercialEmail?: string | null;
  city?: string | null;
  state?: string | null;
  [key: string]: unknown;
};

type Settings = {
  id: string;
  name: string;
  slug: string;
  primaryColor: string;
  logoUrl?: string | null;
  settings: TenantSettings;
  plan?: { name: string; slug: string } | null;
};

type UsageSnapshot = {
  plan?: { id: string; name: string; slug: string; priceMonthly?: number } | null;
  subscription?: {
    billingStatus?: string;
    billingCycle?: string;
    priceMonthly?: number | null;
    priceAnnual?: number | null;
    currentPeriodEnd?: string | null;
    extraAiCredits?: number;
  } | null;
  limits: {
    maxUsers: number;
    maxChannels: number;
    maxContacts: number;
    maxConversations: number;
    maxAiMessages: number;
    maxAgents?: number;
    maxAutomations?: number;
    maxActiveFlows?: number;
    monthlyAiCredits?: number;
  };
  usage: {
    users: number;
    contacts: number;
    channels: number;
    agents: number;
    conversations: number;
    automations: number;
    activeFlows?: number;
    aiCredits?: number;
    aiCreditsUsed?: number;
    aiCreditsCap?: number;
  };
};

type AgentRow = {
  id: string;
  name: string;
  isActive: boolean;
  mode: string;
  model?: string;
  tools?: {
    continuousLearning?: boolean | null;
    autoClose?: boolean | null;
    allowed?: string[];
  } | null;
};

type ContinuousLearningConfig = {
  enabled: boolean;
  level: 1 | 2 | 3;
  sources: {
    knowledge: boolean;
    companyData: boolean;
    crm: boolean;
    aiAttendance: boolean;
    humanAttendance: boolean;
    humanCorrections: boolean;
    feedbacks: boolean;
    handoffs: boolean;
  };
};

const LEARNING_SOURCES: { key: keyof ContinuousLearningConfig["sources"]; label: string }[] = [
  { key: "knowledge", label: "Base de conhecimento" },
  { key: "companyData", label: "Dados da empresa" },
  { key: "crm", label: "Dados do CRM" },
  { key: "aiAttendance", label: "Atendimentos da IA" },
  { key: "humanAttendance", label: "Atendimentos humanos" },
  { key: "humanCorrections", label: "Correções humanas" },
  { key: "feedbacks", label: "Feedbacks" },
  { key: "handoffs", label: "Handoffs" },
];

function parseLearningConfig(settings?: TenantSettings | null): ContinuousLearningConfig {
  const raw = (settings?.continuousLearning || {}) as Partial<ContinuousLearningConfig>;
  const src = (raw.sources || {}) as Partial<ContinuousLearningConfig["sources"]>;
  return {
    enabled: raw.enabled === true,
    level: raw.level === 2 || raw.level === 3 ? raw.level : 1,
    sources: {
      knowledge: src.knowledge !== false,
      companyData: src.companyData !== false,
      crm: src.crm !== false,
      aiAttendance: src.aiAttendance !== false,
      humanAttendance: src.humanAttendance !== false,
      humanCorrections: src.humanCorrections !== false,
      feedbacks: src.feedbacks !== false,
      handoffs: src.handoffs !== false,
    },
  };
}

type FormState = {
  name: string;
  primaryColor: string;
  logoUrl: string | null;
  timezone: string;
  language: string;
  phone: string;
  commercialEmail: string;
  website: string;
  city: string;
  state: string;
  segment: string;
};

const TABS: {
  id: TabId;
  label: string;
  hint: string;
  icon: typeof Building2;
  group: "empresa" | "servicos";
}[] = [
  { id: "general", label: "Geral", hint: "", icon: Building2, group: "empresa" },
  { id: "identity", label: "Identidade", hint: "", icon: Palette, group: "empresa" },
  {
    id: "preferences",
    label: "Preferências",
    hint: "",
    icon: Settings2,
    group: "empresa",
  },
  { id: "plan", label: "Plano e uso", hint: "", icon: CreditCard, group: "servicos" },
  { id: "ai", label: "IA", hint: "", icon: Sparkles, group: "servicos" },
  {
    id: "attendance",
    label: "Atendimento",
    hint: "",
    icon: Headset,
    group: "servicos",
  },
  {
    id: "integrations",
    label: "Integrações",
    hint: "",
    icon: Plug,
    group: "servicos",
  },
];

const INACTIVITY_TIMEOUT_OPTIONS = [
  { value: "30", label: "30 minutos" },
  { value: "60", label: "1 hora" },
  { value: "120", label: "2 horas" },
  { value: "240", label: "4 horas" },
  { value: "480", label: "8 horas" },
  { value: "720", label: "12 horas" },
  { value: "1440", label: "24 horas" },
  { value: "2880", label: "48 horas" },
  { value: "4320", label: "72 horas" },
] as const;

type AttendanceConfig = {
  inactivity: {
    enabled: boolean;
    timeoutMinutes: number;
    sendCloseMessage: boolean;
    closeMessage: string;
  };
  aiClose: {
    mode: "off" | "suggest" | "auto";
    sendFarewell: boolean;
    farewellMessage: string;
  };
  reopen: {
    mode: "new" | "reopen";
    windowHours: number;
  };
  /** Handoff humano ↔ IA reassumir */
  aiHandoff: {
    /** Cliente volta a escrever sem humano atribuído → IA responde de novo */
    resumeOnCustomerReturn: boolean;
    /** Preferência sugerida de som no painel (o usuário ainda pode silenciar no banner) */
    soundAlert: boolean;
  };
  /** Pesquisa de satisfação ao encerrar (IA ou humano) */
  csat: {
    enabled: boolean;
    message: string;
    thankYouMessage: string;
  };
};

const DEFAULT_ATTENDANCE: AttendanceConfig = {
  inactivity: {
    enabled: false,
    timeoutMinutes: 1440,
    sendCloseMessage: true,
    closeMessage:
      "Como não recebemos mais respostas, vamos encerrar este atendimento por enquanto. Quando precisar, é só nos chamar novamente.",
  },
  aiClose: {
    mode: "off",
    sendFarewell: true,
    farewellMessage:
      "Perfeito! Fico feliz em ajudar. Quando precisar novamente, é só chamar.",
  },
  reopen: {
    mode: "new",
    windowHours: 24,
  },
  aiHandoff: {
    resumeOnCustomerReturn: true,
    soundAlert: true,
  },
  csat: {
    enabled: true,
    message:
      "Para melhorar nosso atendimento, de 1 a 5 (sendo 5 excelente), como você avalia o atendimento de hoje? Responda só com o número.",
    thankYouMessage:
      "Obrigado pela avaliação! Sua opinião nos ajuda a melhorar. Quando precisar, é só chamar.",
  },
};

function parseAttendanceConfig(settings?: TenantSettings | null): AttendanceConfig {
  const raw = (settings?.attendance || {}) as Partial<AttendanceConfig>;
  const ina = raw.inactivity || {};
  const ai = raw.aiClose || {};
  const re = raw.reopen || {};
  const hand = raw.aiHandoff || {};
  const csatRaw = raw.csat || {};
  const timeout = Number((ina as AttendanceConfig["inactivity"]).timeoutMinutes);
  const windowH = Number((re as AttendanceConfig["reopen"]).windowHours);
  const mode = String((ai as AttendanceConfig["aiClose"]).mode || "off");
  const reopenMode = String((re as AttendanceConfig["reopen"]).mode || "new");
  return {
    inactivity: {
      enabled: (ina as AttendanceConfig["inactivity"]).enabled === true,
      timeoutMinutes:
        Number.isFinite(timeout) && timeout >= 15 ? Math.floor(timeout) : 1440,
      sendCloseMessage: (ina as AttendanceConfig["inactivity"]).sendCloseMessage !== false,
      closeMessage:
        typeof (ina as AttendanceConfig["inactivity"]).closeMessage === "string" &&
        (ina as AttendanceConfig["inactivity"]).closeMessage.trim()
          ? (ina as AttendanceConfig["inactivity"]).closeMessage
          : DEFAULT_ATTENDANCE.inactivity.closeMessage,
    },
    aiClose: {
      mode: mode === "suggest" || mode === "auto" ? mode : "off",
      sendFarewell: (ai as AttendanceConfig["aiClose"]).sendFarewell !== false,
      farewellMessage:
        typeof (ai as AttendanceConfig["aiClose"]).farewellMessage === "string" &&
        (ai as AttendanceConfig["aiClose"]).farewellMessage.trim()
          ? (ai as AttendanceConfig["aiClose"]).farewellMessage
          : DEFAULT_ATTENDANCE.aiClose.farewellMessage,
    },
    reopen: {
      mode: reopenMode === "reopen" ? "reopen" : "new",
      windowHours:
        Number.isFinite(windowH) && windowH >= 1 ? Math.floor(windowH) : 24,
    },
    aiHandoff: {
      resumeOnCustomerReturn:
        (hand as AttendanceConfig["aiHandoff"]).resumeOnCustomerReturn !== false,
      soundAlert: (hand as AttendanceConfig["aiHandoff"]).soundAlert !== false,
    },
    csat: {
      enabled: (csatRaw as AttendanceConfig["csat"]).enabled !== false,
      message:
        typeof (csatRaw as AttendanceConfig["csat"]).message === "string" &&
        (csatRaw as AttendanceConfig["csat"]).message.trim()
          ? (csatRaw as AttendanceConfig["csat"]).message
          : DEFAULT_ATTENDANCE.csat.message,
      thankYouMessage:
        typeof (csatRaw as AttendanceConfig["csat"]).thankYouMessage === "string" &&
        (csatRaw as AttendanceConfig["csat"]).thankYouMessage.trim()
          ? (csatRaw as AttendanceConfig["csat"]).thankYouMessage
          : DEFAULT_ATTENDANCE.csat.thankYouMessage,
    },
  };
}

const EDITABLE_TABS: TabId[] = ["general", "identity", "preferences"];

const BRAND_SWATCHES = [
  "#3D52D5",
  "#6366F1",
  "#0EA5E9",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#0F172A",
] as const;

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Belem",
  "America/Fortaleza",
  "America/Recife",
  "America/Cuiaba",
  "America/Campo_Grande",
  "America/Porto_Velho",
  "America/Rio_Branco",
  "America/Noronha",
  "UTC",
];

const MODE_LABEL: Record<string, string> = {
  AUTO: "Automático",
  APPROVE: "Aprovação",
  SUGGEST: "Sugestão",
};

function maskPhoneBR(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function formatLimit(used: number, max: number) {
  const u = used.toLocaleString("pt-BR");
  if (max >= 999_999) return `${u} / Ilimitado`;
  return `${u} / ${max.toLocaleString("pt-BR")}`;
}

function usagePct(used: number, max: number) {
  if (max >= 999_999 || max <= 0) return 0;
  return Math.min(100, Math.round((used / max) * 100));
}

function billingLabel(status?: string | null) {
  const s = (status || "ACTIVE").toUpperCase();
  if (s === "ACTIVE" || s === "TRIALING") return { label: "Ativo", tone: "ok" as const };
  if (s === "PAST_DUE" || s === "OVERDUE") return { label: "Em atraso", tone: "warn" as const };
  if (s === "CANCELED" || s === "CANCELLED") return { label: "Cancelado", tone: "bad" as const };
  if (s === "SUSPENDED") return { label: "Suspenso", tone: "warn" as const };
  return { label: status || "—", tone: "muted" as const };
}

function buildForm(data: Settings): FormState {
  const s = (data.settings || {}) as TenantSettings;
  return {
    name: data.name || "",
    primaryColor: data.primaryColor || "#3D52D5",
    logoUrl: data.logoUrl || null,
    timezone: s.timezone || "America/Sao_Paulo",
    language: s.language || "pt-BR",
    phone: (s.phone as string) || "",
    commercialEmail: (s.commercialEmail as string) || "",
    website: (s.website as string) || "",
    city: (s.city as string) || "",
    state: (s.state as string) || "",
    segment: (s.segment as string) || "",
  };
}

function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <header className="min-w-0">
      <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-ink dark:text-zinc-100">
        {title}
      </h2>
      {description ? (
        <p className="mt-0.5 max-w-prose text-[12.5px] leading-relaxed text-ink-muted">
          {description}
        </p>
      ) : null}
    </header>
  );
}

/** Grouping surface aligned with TenantSection — dense settings blocks. */
function Surface({
  title,
  description,
  children,
  className,
  action,
  flush,
  "data-tour": dataTour,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
  /** No body padding (caller controls spacing). */
  flush?: boolean;
  "data-tour"?: string;
}) {
  return (
    <section
      data-tour={dataTour}
      className={cn(
        "nf-form-section-surface overflow-hidden rounded-2xl border border-black/[0.06] bg-[var(--surface-raised)]",
        "dark:border-white/[0.07] dark:shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]",
        className
      )}
    >
      {(title || description || action) && (
        <div className="flex items-start justify-between gap-3 border-b border-black/[0.05] px-4 py-3 dark:border-white/[0.06]">
          <div className="min-w-0 space-y-0.5">
            {title ? (
              <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-ink dark:text-zinc-100">
                {title}
              </h3>
            ) : null}
            {description ? (
              <p className="text-[12px] leading-relaxed text-ink-muted">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      )}
      <div className={cn(!flush && "p-4")}>{children}</div>
    </section>
  );
}

function StatusDot({
  tone,
  label,
}: {
  tone: "ok" | "warn" | "bad" | "muted";
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        tone === "ok" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        tone === "warn" && "bg-amber-500/[0.12] text-amber-800 dark:text-amber-300",
        tone === "bad" && "bg-rose-500/10 text-rose-700 dark:text-rose-300",
        tone === "muted" && "bg-black/[0.04] text-ink-muted dark:bg-white/[0.06]"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          tone === "ok" && "bg-emerald-500",
          tone === "warn" && "bg-amber-500",
          tone === "bad" && "bg-rose-500",
          tone === "muted" && "bg-ink-faint"
        )}
      />
      {label}
    </span>
  );
}

const TAB_IDS: TabId[] = [
  "general",
  "identity",
  "preferences",
  "plan",
  "ai",
  "attendance",
  "integrations",
];

function isTabId(v: string | null): v is TabId {
  return Boolean(v && (TAB_IDS as string[]).includes(v));
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const tenant = useAuth((s) => s.tenant);
  const searchParams = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);
  const tabFromUrl = searchParams?.get("tab") ?? null;
  const [tab, setTab] = useState<TabId>(() =>
    isTabId(tabFromUrl) ? tabFromUrl : "general"
  );
  const [form, setForm] = useState<FormState | null>(null);
  const [baseline, setBaseline] = useState<FormState | null>(null);
  const [slugCopied, setSlugCopied] = useState(false);
  const [pendingTab, setPendingTab] = useState<TabId | null>(null);
  const [contentKey, setContentKey] = useState(0);
  const [learning, setLearning] = useState<ContinuousLearningConfig>(() =>
    parseLearningConfig(null)
  );
  const [attendance, setAttendance] = useState<AttendanceConfig>(DEFAULT_ATTENDANCE);

  // Tour / deep-link: ?tab=ai | attendance | integrations
  useEffect(() => {
    if (isTabId(tabFromUrl) && tabFromUrl !== tab) {
      setTab(tabFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabFromUrl]);

  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<Settings>("/settings"),
  });

  const usage = useQuery({
    queryKey: ["usage"],
    queryFn: () => api<UsageSnapshot>("/usage"),
    enabled: tab === "plan",
    staleTime: 30_000,
  });

  const agents = useQuery({
    queryKey: ["ai-agents"],
    queryFn: () => api<AgentRow[]>("/ai-agents"),
    enabled: tab === "ai",
    staleTime: 30_000,
    retry: false,
  });

  const waStatus = useQuery({
    queryKey: ["whatsapp-status"],
    queryFn: () =>
      api<{ connected: boolean; connectedCount?: number; phone?: string | null }>(
        "/whatsapp/status"
      ),
    enabled: tab === "integrations",
    staleTime: 20_000,
    retry: false,
  });

  useEffect(() => {
    if (!data) return;
    const next = buildForm(data);
    setForm(next);
    setBaseline(next);
    setLearning(parseLearningConfig(data.settings));
    setAttendance(parseAttendanceConfig(data.settings));
  }, [data]);

  const learningMutation = useMutation({
    mutationFn: (cfg: ContinuousLearningConfig) =>
      api<Settings>("/settings", {
        method: "PATCH",
        json: {
          settings: {
            continuousLearning: cfg,
          },
        },
      }),
    onSuccess: (updated, cfg) => {
      const prevEnabled = learning.enabled;
      qc.setQueryData(["settings"], updated);
      setLearning(parseLearningConfig(updated.settings));
      if (cfg.enabled !== prevEnabled) {
        toast({
          kind: "success",
          title: cfg.enabled
            ? "Aprendizado contínuo ativado"
            : "Aprendizado contínuo desativado",
          description: cfg.enabled
            ? "A NexaFlow pode analisar apenas os dados desta empresa."
            : "Novas lacunas e sugestões param. O conhecimento já aprovado permanece.",
        });
      } else {
        toast({ kind: "success", title: "Aprendizado contínuo atualizado" });
      }
    },
    onError: (e: Error) => {
      toast({
        kind: "error",
        title: "Não foi possível salvar",
        description: e.message,
      });
    },
  });

  const agentLearningMutation = useMutation({
    mutationFn: ({
      id,
      continuousLearning,
    }: {
      id: string;
      continuousLearning: boolean;
    }) =>
      api(`/ai-agents/${id}`, {
        method: "PATCH",
        json: { tools: { continuousLearning } },
      }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["ai-agents"] });
      const prev = qc.getQueryData<AgentRow[]>(["ai-agents"]);
      qc.setQueryData<AgentRow[]>(["ai-agents"], (list) =>
        (list || []).map((a) =>
          a.id === vars.id
            ? {
                ...a,
                tools: { ...(a.tools || {}), continuousLearning: vars.continuousLearning },
              }
            : a
        )
      );
      return { prev };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["ai-agents"] });
      toast({
        kind: "success",
        title: vars.continuousLearning
          ? "Agente participa do aprendizado"
          : "Agente fora do aprendizado",
        description: vars.continuousLearning
          ? "Atendimentos deste agente podem gerar lacunas e sugestões."
          : "Atendimentos deste agente não entram no pipeline de aprendizado.",
      });
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["ai-agents"], ctx.prev);
      toast({
        kind: "error",
        title: "Não foi possível atualizar o agente",
        description: e.message,
      });
    },
  });

  const attendanceMutation = useMutation({
    mutationFn: (cfg: AttendanceConfig) =>
      api<Settings>("/settings", {
        method: "PATCH",
        json: {
          settings: {
            attendance: cfg,
          },
        },
      }),
    onSuccess: (updated) => {
      qc.setQueryData(["settings"], updated);
      setAttendance(parseAttendanceConfig(updated.settings));
      toast({ kind: "success", title: "Encerramento de atendimentos atualizado" });
    },
    onError: (e: Error) => {
      toast({
        kind: "error",
        title: "Não foi possível salvar",
        description: e.message,
      });
    },
  });

  const dirty = useMemo(() => {
    if (!form || !baseline) return false;
    return JSON.stringify(form) !== JSON.stringify(baseline);
  }, [form, baseline]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!form || !data) throw new Error("Formulário não pronto");
      return api<Settings>("/settings", {
        method: "PATCH",
        json: {
          name: form.name.trim(),
          primaryColor: form.primaryColor,
          logoUrl: form.logoUrl,
          settings: {
            ...(data.settings || {}),
            timezone: form.timezone,
            language: form.language,
            phone: form.phone.trim() || null,
            commercialEmail: form.commercialEmail.trim() || null,
            website: form.website.trim() || null,
            city: form.city.trim() || null,
            state: form.state.trim() || null,
            segment: form.segment.trim() || null,
          },
        },
      });
    },
    onSuccess: (updated) => {
      const next = buildForm(updated);
      setForm(next);
      setBaseline(next);
      qc.setQueryData(["settings"], updated);
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast({ kind: "success", title: "Alterações salvas" });
      if (pendingTab) {
        setTab(pendingTab);
        setContentKey((k) => k + 1);
        setPendingTab(null);
      }
    },
    onError: (e: Error) => {
      toast({ kind: "error", title: "Não foi possível salvar", description: e.message });
    },
  });

  const discard = useCallback(() => {
    if (!baseline) return;
    setForm({ ...baseline });
    setPendingTab(null);
  }, [baseline]);

  function requestTab(next: TabId) {
    if (next === tab) return;
    if (dirty) {
      setPendingTab(next);
      return;
    }
    setTab(next);
    setContentKey((k) => k + 1);
  }

  function onLogoFile(file: File | null) {
    if (!file || !form) return;
    if (!file.type.startsWith("image/")) {
      toast({ kind: "error", title: "Arquivo inválido", description: "Envie PNG, JPG ou SVG." });
      return;
    }
    if (file.size > 1.8 * 1024 * 1024) {
      toast({
        kind: "error",
        title: "Arquivo grande",
        description: "A logo deve ter no máximo 1,8 MB.",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm({ ...form, logoUrl: String(reader.result || "") || null });
    };
    reader.readAsDataURL(file);
  }

  function onSave(e?: FormEvent) {
    e?.preventDefault();
    if (!dirty || saveMutation.isPending) return;
    if (!form?.name.trim() || form.name.trim().length < 2) {
      toast({ kind: "error", title: "Nome inválido", description: "Informe o nome da empresa." });
      setTab("general");
      setContentKey((k) => k + 1);
      setPendingTab(null);
      return;
    }
    saveMutation.mutate();
  }

  async function copySlug() {
    if (!data?.slug) return;
    try {
      await navigator.clipboard.writeText(data.slug);
      setSlugCopied(true);
      window.setTimeout(() => setSlugCopied(false), 1600);
    } catch {
      toast({ kind: "error", title: "Não foi possível copiar" });
    }
  }

  if (isLoading || !data || !form) {
    return (
      <TenantModule kind="settings" title="Configurações" kicker="Empresa">
        <div className="flex justify-center py-20" role="status" aria-label="Carregando">
          <Spinner />
        </div>
      </TenantModule>
    );
  }

  const activeAgents = (agents.data || []).filter((a) => a.isActive).length;
  const companyName = form.name || data.name || tenant?.name || "sua empresa";
  const showSaveBar = dirty && EDITABLE_TABS.includes(tab);
  const planName = data.plan?.name || usage.data?.plan?.name || "Sem plano";
  const bill = billingLabel(usage.data?.subscription?.billingStatus);
  const colorValid = /^#[0-9A-Fa-f]{6}$/.test(form.primaryColor);
  const brandColor = colorValid ? form.primaryColor : "#3D52D5";

  const empresaTabs = TABS.filter((t) => t.group === "empresa");
  const servicosTabs = TABS.filter((t) => t.group === "servicos");

  function renderNavButton(t: (typeof TABS)[number]) {
    const Icon = t.icon;
    const active = tab === t.id;
    const hasDirty = dirty && EDITABLE_TABS.includes(t.id) && t.id === tab;
    return (
      <button
        key={t.id}
        type="button"
        role="tab"
        aria-selected={active}
        data-tour={`settings-tab-${t.id}`}
        onClick={() => requestTab(t.id)}
        className={cn(
          "group relative flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors duration-150",
          active
            ? "bg-violet-500/[0.09] text-ink dark:bg-violet-500/[0.12] dark:text-white"
            : "text-ink-muted hover:bg-black/[0.03] hover:text-ink dark:hover:bg-white/[0.04] dark:hover:text-gray-200"
        )}
      >
        <span
          className={cn(
            "absolute left-0 top-1/2 h-3.5 w-[2px] -translate-y-1/2 rounded-full bg-violet-500 transition-opacity",
            active ? "opacity-100" : "opacity-0"
          )}
          aria-hidden
        />
        <Icon
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            active ? "text-violet-600 opacity-100 dark:text-violet-300" : "opacity-45"
          )}
          strokeWidth={1.75}
        />
        <span
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 text-[13px] leading-none",
            active ? "font-semibold" : "font-medium"
          )}
        >
          {t.label}
          {hasDirty ? (
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="Alterações não salvas" />
          ) : null}
        </span>
      </button>
    );
  }

  return (
    <TenantModule
      kind="settings"
      title="Configurações"
      kicker={companyName}
      className="settings-page settings-page--split"
      actions={
        dirty ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/[0.12] px-2.5 py-1 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Não salvas
          </span>
        ) : null
      }
    >
      {/* Mobile: chips horizontais */}
      <div className="-mx-1 overflow-x-auto px-1 pb-0.5 lg:hidden" data-tour="settings-header">
        <div className="flex w-max min-w-full gap-1" role="tablist" aria-label="Seções">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-tour={`settings-tab-${t.id}`}
                onClick={() => requestTab(t.id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
                  active
                    ? "bg-violet-500/12 text-violet-700 dark:bg-violet-500/18 dark:text-violet-200"
                    : "text-ink-muted hover:bg-black/[0.04] hover:text-ink dark:text-zinc-400 dark:hover:bg-white/[0.05]"
                )}
              >
                <Icon className="h-3.5 w-3.5 opacity-70" strokeWidth={1.75} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop: nav sticky leve + conteúdo — scroll da página, não interno */}
      <div className="settings-layout flex flex-col gap-5 lg:gap-0">
        <nav
          className="settings-subnav hidden lg:block"
          role="tablist"
          aria-label="Seções de configurações da empresa"
        >
          <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
            Empresa
          </p>
          <div className="flex flex-col gap-0.5">{empresaTabs.map(renderNavButton)}</div>
          <p className="mb-1 mt-4 px-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
            Conta e serviços
          </p>
          <div className="flex flex-col gap-0.5">{servicosTabs.map(renderNavButton)}</div>
        </nav>

        <div className="settings-main relative min-w-0 w-full">
          <form onSubmit={onSave} key={contentKey} className="settings-panel nf-settings-fade space-y-0">
            {/* ─── GERAL ─── */}
            {tab === "general" && (
              <div className="space-y-4" role="tabpanel">
                <SectionTitle title="Geral" />

                <Surface>
                  <div className="space-y-5">
                    <div>
                      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-faint">
                        Informações
                      </p>
                      <div className="grid gap-3.5 sm:grid-cols-2">
                        <div className="min-w-0 sm:col-span-2">
                          <label className="label" htmlFor="co-name">
                            Nome da empresa
                          </label>
                          <input
                            id="co-name"
                            className="input"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            required
                            minLength={2}
                            maxLength={120}
                          />
                        </div>
                        <div className="min-w-0">
                          <label className="label" htmlFor="co-segment">
                            Segmento
                          </label>
                          <input
                            id="co-segment"
                            className="input"
                            value={form.segment}
                            onChange={(e) => setForm({ ...form, segment: e.target.value })}
                            placeholder="Ex.: Tecnologia, Varejo"
                          />
                        </div>
                        <div className="min-w-0">
                          <label className="label" htmlFor="co-slug">
                            Identificador
                          </label>
                          <div className="flex h-10 items-center gap-2 rounded-lg border border-black/[0.06] bg-black/[0.02] px-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
                            <span
                              id="co-slug"
                              className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink-muted"
                            >
                              {data.slug}
                            </span>
                            <button
                              type="button"
                              className="shrink-0 text-ink-faint transition-colors hover:text-ink"
                              onClick={() => void copySlug()}
                              aria-label="Copiar identificador"
                            >
                              {slugCopied ? (
                                <Check className="h-3.5 w-3.5 text-emerald-500" strokeWidth={2} />
                              ) : (
                                <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-black/[0.05] pt-5 dark:border-white/[0.06]">
                      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-faint">
                        Contato
                      </p>
                      <div className="grid gap-3.5 sm:grid-cols-2">
                        <div className="min-w-0">
                          <label className="label" htmlFor="co-phone">
                            Telefone
                          </label>
                          <input
                            id="co-phone"
                            className="input"
                            value={form.phone}
                            onChange={(e) =>
                              setForm({ ...form, phone: maskPhoneBR(e.target.value) })
                            }
                            placeholder="(11) 99999-0000"
                            inputMode="tel"
                          />
                        </div>
                        <div className="min-w-0">
                          <label className="label" htmlFor="co-email">
                            E-mail comercial
                          </label>
                          <input
                            id="co-email"
                            type="email"
                            className="input"
                            value={form.commercialEmail}
                            onChange={(e) =>
                              setForm({ ...form, commercialEmail: e.target.value })
                            }
                            placeholder="contato@empresa.com"
                          />
                        </div>
                        <div className="min-w-0 sm:col-span-2">
                          <label className="label" htmlFor="co-site">
                            Site
                          </label>
                          <input
                            id="co-site"
                            className="input"
                            value={form.website}
                            onChange={(e) => setForm({ ...form, website: e.target.value })}
                            placeholder="https://"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-black/[0.05] pt-5 dark:border-white/[0.06]">
                      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-faint">
                        Localização
                      </p>
                      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-[minmax(0,1fr)_minmax(6.5rem,8rem)]">
                        <div className="min-w-0">
                          <label className="label" htmlFor="co-city">
                            Cidade
                          </label>
                          <input
                            id="co-city"
                            className="input"
                            value={form.city}
                            onChange={(e) => setForm({ ...form, city: e.target.value })}
                          />
                        </div>
                        <div className="min-w-0">
                          <label className="label" htmlFor="co-state">
                            UF
                          </label>
                          <input
                            id="co-state"
                            className="input uppercase"
                            value={form.state}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                state: e.target.value.toUpperCase().slice(0, 2),
                              })
                            }
                            placeholder="SP"
                            maxLength={2}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </Surface>
              </div>
            )}

            {/* ─── IDENTIDADE ─── */}
            {tab === "identity" && (
              <div className="space-y-4" role="tabpanel">
                <SectionTitle title="Identidade" />

                <Surface>
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                    <div className="flex shrink-0 flex-col items-center gap-2 sm:w-[7.5rem]">
                      <div
                        className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl text-sm font-bold text-white shadow-md ring-1 ring-black/5"
                        style={{ backgroundColor: brandColor }}
                      >
                        {form.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={form.logoUrl}
                            alt="Logo"
                            className="h-full w-full object-contain p-1.5"
                          />
                        ) : (
                          (companyName.trim().slice(0, 2) || "NF").toUpperCase()
                        )}
                      </div>
                      <p className="max-w-full truncate text-center text-[12px] font-medium text-ink dark:text-white">
                        {companyName}
                      </p>
                      <p className="font-mono text-[11px] text-ink-faint">{brandColor}</p>
                    </div>

                    <div className="min-w-0 flex-1 space-y-4 border-t border-black/[0.05] pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0 dark:border-white/[0.06]">
                      <div>
                        <p className="mb-2 text-[12px] font-semibold text-ink dark:text-zinc-100">
                          Logo
                        </p>
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            className={cn(
                              "group flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed transition-colors",
                              form.logoUrl
                                ? "border-black/[0.08] bg-white dark:border-white/[0.1] dark:bg-white/[0.03]"
                                : "border-black/[0.1] bg-black/[0.02] hover:border-violet-500/40 dark:border-white/[0.12]"
                            )}
                          >
                            {form.logoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={form.logoUrl}
                                alt="Logo"
                                className="h-full w-full object-contain p-1.5"
                              />
                            ) : (
                              <ImageIcon className="h-4 w-4 text-ink-faint" strokeWidth={1.5} />
                            )}
                          </button>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="btn-secondary btn-sm h-8"
                              onClick={() => fileRef.current?.click()}
                            >
                              {form.logoUrl ? "Alterar logo" : "Enviar logo"}
                            </button>
                            {form.logoUrl ? (
                              <button
                                type="button"
                                className="btn-ghost btn-sm h-8 text-ink-muted"
                                onClick={() => setForm({ ...form, logoUrl: null })}
                              >
                                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                                Remover
                              </button>
                            ) : null}
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

                      <div className="border-t border-black/[0.05] pt-4 dark:border-white/[0.06]">
                        <p className="mb-2 text-[12px] font-semibold text-ink dark:text-zinc-100">
                          Cor principal
                        </p>
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="relative h-10 w-10 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-black/[0.08] shadow-sm dark:border-white/[0.1]">
                            <span
                              className="absolute inset-0"
                              style={{ backgroundColor: brandColor }}
                            />
                            <input
                              type="color"
                              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                              value={brandColor}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  primaryColor: e.target.value.toUpperCase(),
                                })
                              }
                              aria-label="Escolher cor primária"
                            />
                          </label>
                          <div className="min-w-0 flex-1 sm:max-w-[10rem]">
                            <label className="label" htmlFor="co-color">
                              Hex
                            </label>
                            <input
                              id="co-color"
                              className="input font-mono uppercase"
                              value={form.primaryColor}
                              onChange={(e) => {
                                let v = e.target.value.trim();
                                if (v && !v.startsWith("#")) v = `#${v}`;
                                setForm({ ...form, primaryColor: v.slice(0, 7) });
                              }}
                              placeholder="#3D52D5"
                              maxLength={7}
                              spellCheck={false}
                            />
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {BRAND_SWATCHES.map((c) => {
                            const selected =
                              form.primaryColor.toUpperCase() === c.toUpperCase();
                            return (
                              <button
                                key={c}
                                type="button"
                                title={c}
                                onClick={() => setForm({ ...form, primaryColor: c })}
                                className={cn(
                                  "h-7 w-7 rounded-lg ring-offset-2 transition-transform hover:scale-105 dark:ring-offset-[#12151c]",
                                  selected
                                    ? "ring-2 ring-violet-500 ring-offset-2"
                                    : "ring-1 ring-black/10 dark:ring-white/[0.15]"
                                )}
                                style={{ backgroundColor: c }}
                                aria-label={`Cor ${c}`}
                                aria-pressed={selected}
                              />
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </Surface>
              </div>
            )}

            {/* ─── PREFERÊNCIAS ─── */}
            {tab === "preferences" && (
              <div className="space-y-4" role="tabpanel">
                <SectionTitle title="Preferências" />

                <Surface title="Regional">
                  <div className="grid max-w-xl gap-3.5 sm:grid-cols-2">
                    <div>
                      <label className="label" htmlFor="co-lang">
                        Idioma
                      </label>
                      <Select
                        id="co-lang"
                        value={form.language}
                        onChange={(language) => setForm({ ...form, language })}
                        options={[
                          { value: "pt-BR", label: "Português (Brasil)" },
                          { value: "en", label: "English" },
                          { value: "es", label: "Español" },
                        ]}
                        aria-label="Idioma padrão"
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="co-tz">
                        Fuso horário
                      </label>
                      <Select
                        id="co-tz"
                        value={form.timezone}
                        onChange={(timezone) => setForm({ ...form, timezone })}
                        options={[
                          ...(!TIMEZONES.includes(form.timezone)
                            ? [{ value: form.timezone, label: form.timezone }]
                            : []),
                          ...TIMEZONES.map((tz) => ({ value: tz, label: tz })),
                        ]}
                        aria-label="Fuso horário"
                      />
                    </div>
                  </div>
                </Surface>

                <Link
                  href="/app/account/preferences"
                  className="group flex items-center justify-between gap-3 rounded-2xl border border-black/[0.06] bg-[var(--surface-raised)] px-4 py-3 transition-colors hover:border-brand-500/20 dark:border-white/[0.07]"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-ink dark:text-white">
                      Preferências da conta
                    </p>
                    <p className="mt-0.5 text-[12px] text-ink-muted">
                      Tema, menções e alertas pessoais
                    </p>
                  </div>
                  <ExternalLink
                    className="h-4 w-4 shrink-0 text-ink-faint transition-colors group-hover:text-brand-600"
                    strokeWidth={1.75}
                  />
                </Link>
              </div>
            )}

            {/* ─── PLANO E USO ─── */}
            {tab === "plan" && (
              <div className="space-y-4" role="tabpanel">
                <SectionTitle title="Plano e uso" />

                <Surface>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-ink-faint">Plano</p>
                      <p className="mt-1 font-display text-xl font-semibold tracking-[-0.03em] text-ink dark:text-white">
                        {planName}
                      </p>
                      <p className="mt-1 text-[13px] text-ink-muted">
                        {usage.data?.subscription?.priceMonthly != null ? (
                          <span className="font-medium text-ink dark:text-zinc-200">
                            {Number(usage.data.subscription.priceMonthly).toLocaleString(
                              "pt-BR",
                              { style: "currency", currency: "BRL" }
                            )}
                            <span className="font-normal text-ink-faint"> /mês</span>
                          </span>
                        ) : (
                          companyName
                        )}
                        {usage.data?.subscription?.currentPeriodEnd ? (
                          <>
                            {" · "}
                            <span className="text-ink-faint">
                              até{" "}
                              {new Date(
                                usage.data.subscription.currentPeriodEnd
                              ).toLocaleDateString("pt-BR")}
                            </span>
                          </>
                        ) : null}
                      </p>
                    </div>
                    {usage.data || !usage.isLoading ? (
                      <StatusDot
                        tone={usage.isError ? "muted" : bill.tone}
                        label={usage.isError ? "—" : bill.label}
                      />
                    ) : null}
                  </div>
                </Surface>

                {usage.isLoading && (
                  <div className="flex justify-center py-10">
                    <Spinner />
                  </div>
                )}

                {usage.isError && (
                  <div
                    role="alert"
                    className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-ink-muted"
                  >
                    Não foi possível carregar o uso do plano.
                  </div>
                )}

                {usage.data && (
                  <Surface title="Consumo">
                    <div className="space-y-3.5">
                      {(
                        [
                          {
                            label: "Usuários",
                            used: usage.data.usage.users,
                            max: usage.data.limits.maxUsers,
                          },
                          {
                            label: "Contatos",
                            used: usage.data.usage.contacts,
                            max: usage.data.limits.maxContacts,
                          },
                          {
                            label: "Conexões WhatsApp",
                            used: usage.data.usage.channels,
                            max: usage.data.limits.maxChannels,
                          },
                          {
                            label: "Agentes de IA",
                            used: usage.data.usage.agents,
                            max: usage.data.limits.maxAgents ?? 1,
                          },
                          {
                            label: "Fluxos ativos",
                            used:
                              usage.data.usage.activeFlows ?? usage.data.usage.automations ?? 0,
                            max:
                              usage.data.limits.maxActiveFlows ??
                              usage.data.limits.maxAutomations ??
                              5,
                          },
                          {
                            label: "Créditos de IA (mês)",
                            used:
                              usage.data.usage.aiCreditsUsed ??
                              usage.data.usage.aiCredits ??
                              0,
                            max:
                              usage.data.usage.aiCreditsCap ??
                              usage.data.limits.monthlyAiCredits ??
                              usage.data.limits.maxAiMessages ??
                              1000,
                          },
                        ] as const
                      ).map((row) => {
                        const pct = usagePct(row.used, row.max);
                        return (
                          <div key={row.label} className="min-w-0">
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="text-[12.5px] font-medium text-ink-muted">
                                {row.label}
                              </p>
                              <p className="text-[12.5px] font-semibold tabular-nums text-ink dark:text-white">
                                {formatLimit(row.used, row.max)}
                                {pct >= 85 && row.max < 999_999 ? (
                                  <span
                                    className={cn(
                                      "ml-2 text-[11px] font-medium",
                                      pct >= 100
                                        ? "text-rose-600 dark:text-rose-400"
                                        : "text-amber-700 dark:text-amber-400"
                                    )}
                                  >
                                    {pct >= 100 ? "limite" : `${pct}%`}
                                  </span>
                                ) : null}
                              </p>
                            </div>
                            <div
                              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]"
                              role="progressbar"
                              aria-valuenow={pct}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-label={`${row.label}: ${formatLimit(row.used, row.max)}`}
                            >
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all duration-300",
                                  pct >= 100
                                    ? "bg-rose-500"
                                    : pct >= 85
                                      ? "bg-amber-500"
                                      : "bg-brand-600 dark:bg-brand-400"
                                )}
                                style={{
                                  width: `${Math.max(pct, row.used > 0 ? 3 : 0)}%`,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Surface>
                )}


              </div>
            )}

            {/* ─── Atendimento ─── */}
            {tab === "attendance" && (
              <div className="space-y-4" role="tabpanel" data-tour="settings-attendance-panel">
                <SectionTitle title="Atendimento" />

                <Surface
                  data-tour="settings-attendance-handoff"
                  title="Handoff e fila humana"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-ink dark:text-white">
                          IA reassumir no retorno do cliente
                        </p>
                        <p className="mt-0.5 text-[12px] text-ink-faint">
                          Se ninguém assumiu e o cliente pede ajuda de novo, a IA volta a atender.
                          Mensagens curtas (&quot;ok&quot;, &quot;obrigado&quot;) não reabrem.
                        </p>
                      </div>
                      <Switch
                        size="sm"
                        checked={attendance.aiHandoff.resumeOnCustomerReturn}
                        disabled={attendanceMutation.isPending}
                        aria-label="IA reassumir no retorno do cliente"
                        onChange={(resumeOnCustomerReturn) => {
                          const next = {
                            ...attendance,
                            aiHandoff: { ...attendance.aiHandoff, resumeOnCustomerReturn },
                          };
                          setAttendance(next);
                          attendanceMutation.mutate(next);
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t border-black/[0.05] pt-4 dark:border-white/[0.06]">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-ink dark:text-white">
                          Banner e som na fila
                        </p>
                        <p className="mt-0.5 text-[12px] text-ink-faint">
                          Avisa no topo do painel quando entra chat em &quot;Assumir&quot;. Cada
                          usuário pode silenciar no banner.
                        </p>
                      </div>
                      <Switch
                        size="sm"
                        checked={attendance.aiHandoff.soundAlert}
                        disabled={attendanceMutation.isPending}
                        aria-label="Aviso sonoro na fila humana"
                        onChange={(soundAlert) => {
                          const next = {
                            ...attendance,
                            aiHandoff: { ...attendance.aiHandoff, soundAlert },
                          };
                          setAttendance(next);
                          attendanceMutation.mutate(next);
                          try {
                            localStorage.setItem(
                              "nexaflow_human_queue_sound",
                              soundAlert ? "1" : "0"
                            );
                          } catch {
                            /* ignore */
                          }
                        }}
                      />
                    </div>
                  </div>
                </Surface>

                <Surface
                  data-tour="settings-attendance-csat"
                  title="Avaliação (CSAT)"
                  description="Pesquisa 1–5 ao encerrar (IA ou humano)."
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-ink dark:text-white">
                          Pedir avaliação ao encerrar
                        </p>
                      </div>
                      <Switch
                        size="sm"
                        checked={attendance.csat.enabled}
                        disabled={attendanceMutation.isPending}
                        aria-label="Ativar pesquisa CSAT"
                        onChange={(enabled) => {
                          const next = {
                            ...attendance,
                            csat: { ...attendance.csat, enabled },
                          };
                          setAttendance(next);
                          attendanceMutation.mutate(next);
                        }}
                      />
                    </div>
                    {attendance.csat.enabled ? (
                      <div className="space-y-3 border-t border-black/[0.05] pt-4 dark:border-white/[0.06]">
                        <div>
                          <label className="label" htmlFor="csat-msg">
                            Mensagem da pesquisa
                          </label>
                          <textarea
                            id="csat-msg"
                            className="input min-h-[72px] text-[13px]"
                            value={attendance.csat.message}
                            disabled={attendanceMutation.isPending}
                            onChange={(e) =>
                              setAttendance({
                                ...attendance,
                                csat: { ...attendance.csat, message: e.target.value },
                              })
                            }
                            onBlur={() => attendanceMutation.mutate(attendance)}
                          />
                        </div>
                        <div>
                          <label className="label" htmlFor="csat-thanks">
                            Agradecimento após a nota
                          </label>
                          <textarea
                            id="csat-thanks"
                            className="input min-h-[56px] text-[13px]"
                            value={attendance.csat.thankYouMessage}
                            disabled={attendanceMutation.isPending}
                            onChange={(e) =>
                              setAttendance({
                                ...attendance,
                                csat: {
                                  ...attendance.csat,
                                  thankYouMessage: e.target.value,
                                },
                              })
                            }
                            onBlur={() => attendanceMutation.mutate(attendance)}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                </Surface>

                <Surface
                  title="Inatividade"
                  description="Encerra se o cliente parar de responder. Não encerra enquanto aguarda resposta da equipe."
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-ink dark:text-white">
                        Encerrar por inatividade
                      </p>
                    </div>
                    <Switch
                      size="sm"
                      checked={attendance.inactivity.enabled}
                      disabled={attendanceMutation.isPending}
                      aria-label="Encerrar por inatividade"
                      onChange={(enabled) => {
                        const next = {
                          ...attendance,
                          inactivity: { ...attendance.inactivity, enabled },
                        };
                        setAttendance(next);
                        attendanceMutation.mutate(next);
                      }}
                    />
                  </div>

                  {attendance.inactivity.enabled ? (
                    <div className="mt-4 space-y-4 border-t border-black/[0.05] pt-4 dark:border-white/[0.06]">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-faint">
                          Tempo sem resposta do cliente
                        </p>
                        <div className="mt-2">
                          <Select
                            size="sm"
                            value={String(attendance.inactivity.timeoutMinutes)}
                            onChange={(v) => {
                              const timeoutMinutes = Number(v) || 1440;
                              const next = {
                                ...attendance,
                                inactivity: { ...attendance.inactivity, timeoutMinutes },
                              };
                              setAttendance(next);
                              attendanceMutation.mutate(next);
                            }}
                            options={[...INACTIVITY_TIMEOUT_OPTIONS]}
                            aria-label="Tempo sem resposta"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-ink dark:text-white">
                            Enviar mensagem ao encerrar
                          </p>
                          <p className="mt-0.5 text-[12px] text-ink-faint">
                            Aviso opcional no WhatsApp antes de finalizar.
                          </p>
                        </div>
                        <Switch
                          size="sm"
                          checked={attendance.inactivity.sendCloseMessage}
                          disabled={attendanceMutation.isPending}
                          aria-label="Enviar mensagem ao encerrar"
                          onChange={(sendCloseMessage) => {
                            const next = {
                              ...attendance,
                              inactivity: { ...attendance.inactivity, sendCloseMessage },
                            };
                            setAttendance(next);
                            attendanceMutation.mutate(next);
                          }}
                        />
                      </div>

                      {attendance.inactivity.sendCloseMessage ? (
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-faint">
                            Mensagem de encerramento
                          </p>
                          <textarea
                            className="input mt-2 min-h-[88px] w-full text-[13px]"
                            value={attendance.inactivity.closeMessage}
                            maxLength={1000}
                            onChange={(e) =>
                              setAttendance({
                                ...attendance,
                                inactivity: {
                                  ...attendance.inactivity,
                                  closeMessage: e.target.value,
                                },
                              })
                            }
                            onBlur={() => attendanceMutation.mutate(attendance)}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </Surface>

                <Surface title="Encerramento pela IA">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-faint">
                      Modo
                    </p>
                    <div className="mt-2">
                      <Select
                        size="sm"
                        value={attendance.aiClose.mode}
                        onChange={(v) => {
                          const mode: AttendanceConfig["aiClose"]["mode"] =
                            v === "suggest" || v === "auto" ? v : "off";
                          const next: AttendanceConfig = {
                            ...attendance,
                            aiClose: { ...attendance.aiClose, mode },
                          };
                          setAttendance(next);
                          attendanceMutation.mutate(next);
                        }}
                        options={[
                          { value: "off", label: "Desativado" },
                          {
                            value: "suggest",
                            label: "Sugerir encerramento (recomendado)",
                          },
                          {
                            value: "auto",
                            label: "Encerrar automaticamente (alta confiança)",
                          },
                        ]}
                        aria-label="Modo de encerramento pela IA"
                      />
                    </div>
                    <p className="mt-1.5 text-[12px] text-ink-faint">
                      {attendance.aiClose.mode === "off" &&
                        "A IA nunca encerra nem sugere encerrar sozinha."}
                      {attendance.aiClose.mode === "suggest" &&
                        "A IA avisa na conversa quando parece concluído. Você decide."}
                      {attendance.aiClose.mode === "auto" &&
                        "Só encerra com confirmação clara do cliente e sem pendências."}
                    </p>
                  </div>

                  {attendance.aiClose.mode !== "off" ? (
                    <div className="mt-4 space-y-3 border-t border-black/[0.05] pt-4 dark:border-white/[0.06]">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-ink dark:text-white">
                            Enviar despedida ao encerrar (automático)
                          </p>
                        </div>
                        <Switch
                          size="sm"
                          checked={attendance.aiClose.sendFarewell}
                          disabled={
                            attendanceMutation.isPending ||
                            attendance.aiClose.mode !== "auto"
                          }
                          aria-label="Enviar despedida"
                          onChange={(sendFarewell) => {
                            const next = {
                              ...attendance,
                              aiClose: { ...attendance.aiClose, sendFarewell },
                            };
                            setAttendance(next);
                            attendanceMutation.mutate(next);
                          }}
                        />
                      </div>
                      {attendance.aiClose.mode === "auto" &&
                      attendance.aiClose.sendFarewell ? (
                        <textarea
                          className="input min-h-[72px] w-full text-[13px]"
                          value={attendance.aiClose.farewellMessage}
                          maxLength={1000}
                          onChange={(e) =>
                            setAttendance({
                              ...attendance,
                              aiClose: {
                                ...attendance.aiClose,
                                farewellMessage: e.target.value,
                              },
                            })
                          }
                          onBlur={() => attendanceMutation.mutate(attendance)}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </Surface>

                <Surface title="Mensagem após encerramento">
                  <div className="space-y-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-faint">
                        Comportamento
                      </p>
                      <div className="mt-2">
                        <Select
                          size="sm"
                          value={attendance.reopen.mode}
                          onChange={(v) => {
                            const mode: AttendanceConfig["reopen"]["mode"] =
                              v === "reopen" ? "reopen" : "new";
                            const next: AttendanceConfig = {
                              ...attendance,
                              reopen: { ...attendance.reopen, mode },
                            };
                            setAttendance(next);
                            attendanceMutation.mutate(next);
                          }}
                          options={[
                            {
                              value: "new",
                              label: "Criar novo atendimento",
                            },
                            {
                              value: "reopen",
                              label: "Reabrir o anterior (dentro da janela)",
                            },
                          ]}
                          aria-label="Reabertura de atendimento"
                        />
                      </div>
                    </div>
                    {attendance.reopen.mode === "reopen" ? (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-faint">
                          Janela para reabrir
                        </p>
                        <div className="mt-2">
                          <Select
                            size="sm"
                            value={String(attendance.reopen.windowHours)}
                            onChange={(v) => {
                              const windowHours = Number(v) || 24;
                              const next = {
                                ...attendance,
                                reopen: { ...attendance.reopen, windowHours },
                              };
                              setAttendance(next);
                              attendanceMutation.mutate(next);
                            }}
                            options={[
                              { value: "6", label: "6 horas" },
                              { value: "12", label: "12 horas" },
                              { value: "24", label: "24 horas" },
                              { value: "48", label: "48 horas" },
                              { value: "72", label: "72 horas" },
                              { value: "168", label: "7 dias" },
                            ]}
                            aria-label="Janela de reabertura"
                          />
                        </div>
                      </div>
                    ) : null}
                    <p className="text-[12px] text-ink-faint">
                      Histórico e notas permanecem ao encerrar.
                    </p>
                  </div>
                </Surface>
              </div>
            )}

            {/* ─── IA ─── */}
            {tab === "ai" && (
              <div className="space-y-4" role="tabpanel" data-tour="settings-ai-panel">
                <SectionTitle title="IA" />

                <Surface flush>
                  <div className="grid divide-y divide-black/[0.05] sm:grid-cols-3 sm:divide-x sm:divide-y-0 dark:divide-white/[0.06]">
                    <Link
                      href="/app/ai"
                      className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-brand-500/[0.04]"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-300">
                        <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold text-ink dark:text-white">
                          Agentes
                        </span>
                        <span className="block text-[11px] text-ink-faint">
                          {activeAgents} ativo{activeAgents === 1 ? "" : "s"}
                        </span>
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-faint group-hover:text-brand-600" />
                    </Link>
                    <Link
                      href="/app/knowledge"
                      className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-brand-500/[0.04]"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-300">
                        <BookOpen className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold text-ink dark:text-white">
                          Conhecimento
                        </span>
                        <span className="block text-[11px] text-ink-faint">Base da empresa</span>
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-faint group-hover:text-brand-600" />
                    </Link>
                    <Link
                      href="/app/ai/learning"
                      className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-brand-500/[0.04]"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                        <Brain className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold text-ink dark:text-white">
                          Aprendizado
                        </span>
                        <span className="block text-[11px] text-ink-faint">
                          {learning.enabled ? "Ativo" : "Desativado"}
                        </span>
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-faint group-hover:text-brand-600" />
                    </Link>
                  </div>
                </Surface>

                <TenantAiProviderPanel />

                <Surface
                  title="Aprendizado contínuo"
                  description={
                    learning.enabled
                      ? "Lacunas e sugestões a partir dos dados desta empresa."
                      : "Desativado — novas conversas não geram aprendizado."
                  }
                  action={
                    <div className="flex items-center gap-2">
                      <StatusDot
                        tone={learning.enabled ? "ok" : "muted"}
                        label={learning.enabled ? "Ativo" : "Off"}
                      />
                      <Switch
                        size="sm"
                        checked={learning.enabled}
                        disabled={learningMutation.isPending}
                        aria-label="Ativar aprendizado contínuo"
                        onChange={(enabled) => {
                          const next = { ...learning, enabled };
                          setLearning(next);
                          learningMutation.mutate(next);
                        }}
                      />
                    </div>
                  }
                >
                  <div className="space-y-3">
                    {!learning.enabled ? (
                      <p className="text-[12.5px] leading-relaxed text-ink-muted">
                        Conhecimento já aprovado permanece. Veracidade dos agentes segue ativa.
                      </p>
                    ) : (
                      <>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-faint">
                            Modo
                          </p>
                          <div className="mt-2">
                            <Select
                              size="sm"
                              value={String(learning.level)}
                              onChange={(v) => {
                                const level = (Number(v) === 2 || Number(v) === 3
                                  ? Number(v)
                                  : 1) as 1 | 2 | 3;
                                const next = { ...learning, level };
                                setLearning(next);
                                learningMutation.mutate(next);
                              }}
                              options={[
                                { value: "1", label: "Supervisionado (recomendado)" },
                                { value: "2", label: "Assistido — rascunhos com aprovação" },
                                {
                                  value: "3",
                                  label: "Automático controlado — só fontes oficiais",
                                },
                              ]}
                              aria-label="Modo de aprendizado"
                            />
                          </div>
                          <p className="mt-1.5 text-[12px] text-ink-faint">
                            {learning.level === 1 &&
                              "Identifica lacunas e sugestões. Tudo precisa de aprovação humana."}
                            {learning.level === 2 &&
                              "Pode criar rascunhos. Publicar ainda exige aprovação."}
                            {learning.level === 3 &&
                              "Só fontes oficiais e auditáveis — nunca conversa isolada."}
                          </p>
                        </div>

                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-faint">
                            Fontes permitidas
                          </p>
                          <ul className="mt-2 divide-y divide-black/[0.04] rounded-xl border border-black/[0.05] dark:divide-white/[0.06] dark:border-white/[0.08]">
                            {LEARNING_SOURCES.map((s) => (
                              <li
                                key={s.key}
                                className="flex items-center justify-between gap-3 px-3 py-2.5"
                              >
                                <span className="text-[13px] text-ink dark:text-gray-100">
                                  {s.label}
                                </span>
                                <Switch
                                  size="sm"
                                  checked={learning.sources[s.key]}
                                  disabled={learningMutation.isPending}
                                  aria-label={s.label}
                                  onChange={(on) => {
                                    const next = {
                                      ...learning,
                                      sources: { ...learning.sources, [s.key]: on },
                                    };
                                    setLearning(next);
                                    learningMutation.mutate(next);
                                  }}
                                />
                              </li>
                            ))}
                          </ul>
                        </div>

                        <Link
                          href="/app/ai/learning"
                          className="btn-secondary inline-flex h-9 px-3 text-[12px]"
                        >
                          Central de aprendizado
                          <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </Link>
                      </>
                    )}
                  </div>
                </Surface>

                <Surface
                  title="Participação dos agentes"
                  description={
                    learning.enabled
                      ? "Escolha quais agentes alimentam o pipeline."
                      : "Ative o aprendizado acima para aplicar participação por agente."
                  }
                  action={
                    <Link href="/app/ai" className="btn-ghost btn-sm h-8 px-2 text-[12px]">
                      Agentes
                    </Link>
                  }
                >
                  {agents.isLoading ? (
                    <div className="flex justify-center py-8">
                      <Spinner />
                    </div>
                  ) : agents.isError ? (
                    <p className="text-sm text-ink-muted">
                      Não foi possível carregar os agentes.
                    </p>
                  ) : (agents.data?.length ?? 0) === 0 ? (
                    <div className="rounded-xl border border-dashed border-black/[0.08] px-4 py-5 dark:border-white/[0.08]">
                      <p className="text-sm font-medium text-ink dark:text-white">
                        Nenhum agente configurado
                      </p>
                      <p className="mt-1 text-[13px] text-ink-muted">
                        Crie um agente para usar IA no atendimento.
                      </p>
                      <Link href="/app/ai" className="btn-primary mt-3 h-9 px-4">
                        Criar agente
                      </Link>
                    </div>
                  ) : (
                    <ul className="divide-y divide-black/[0.04] rounded-xl border border-black/[0.05] dark:divide-white/[0.06] dark:border-white/[0.08]">
                      {(agents.data || []).map((a) => {
                        const participates = a.tools?.continuousLearning !== false;
                        return (
                          <li
                            key={a.id}
                            className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-3"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-[13px] font-semibold text-ink dark:text-white">
                                  {a.name}
                                </p>
                                <StatusDot
                                  tone={a.isActive ? "ok" : "muted"}
                                  label={a.isActive ? "Ativo" : "Pausado"}
                                />
                              </div>
                              <p className="mt-0.5 text-[11px] text-ink-faint">
                                {MODE_LABEL[a.mode] || a.mode}
                                {!learning.enabled
                                  ? " · Aprendizado da empresa desligado"
                                  : participates
                                    ? " · Participa do aprendizado"
                                    : " · Fora do aprendizado"}
                              </p>
                            </div>
                            <div className="flex items-center gap-2.5">
                              <span
                                className={cn(
                                  "text-[11px] font-medium",
                                  learning.enabled && participates
                                    ? "text-emerald-700 dark:text-emerald-300"
                                    : "text-ink-faint"
                                )}
                              >
                                {!learning.enabled
                                  ? "Aguardando empresa"
                                  : participates
                                    ? "Participa"
                                    : "Não participa"}
                              </span>
                              <Switch
                                size="sm"
                                checked={participates}
                                disabled={
                                  agentLearningMutation.isPending || !learning.enabled
                                }
                                aria-label={`Participação de ${a.name} no aprendizado`}
                                onChange={(on) => {
                                  agentLearningMutation.mutate({
                                    id: a.id,
                                    continuousLearning: on,
                                  });
                                }}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Surface>

                <p className="text-[12px] leading-relaxed text-ink-faint">
                  <span className="font-medium text-ink-muted">Veracidade</span> permanece
                  sempre ativa, com ou sem aprendizado.
                </p>
              </div>
            )}

            {/* ─── INTEGRAÇÕES ─── */}
            {tab === "integrations" && (
              <div className="space-y-4" role="tabpanel">
                <SectionTitle title="Integrações" />

                <Surface flush>
                  <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#25D366]/[0.12] text-[#128C7E]">
                          <MessageCircle className="h-4 w-4" strokeWidth={1.75} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-ink dark:text-white">
                            WhatsApp
                          </p>
                          <p className="mt-0.5 text-[12px] text-ink-muted">
                            {waStatus.isLoading
                              ? "Carregando…"
                              : waStatus.isError
                                ? "Status indisponível"
                                : waStatus.data?.connected
                                  ? waStatus.data.phone || "Sessão ativa"
                                  : "Sem conexão ativa"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!waStatus.isLoading && !waStatus.isError ? (
                          <StatusDot
                            tone={waStatus.data?.connected ? "ok" : "warn"}
                            label={waStatus.data?.connected ? "Conectado" : "Off"}
                          />
                        ) : null}
                        <Link
                          href="/app/integrations"
                          className={cn(
                            "btn-sm h-8",
                            waStatus.data?.connected ? "btn-secondary" : "btn-primary"
                          )}
                        >
                          {waStatus.data?.connected ? "Gerenciar" : "Conectar"}
                        </Link>
                      </div>
                    </li>
                    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-300">
                          <Webhook className="h-4 w-4" strokeWidth={1.75} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-ink dark:text-white">
                            Webhooks
                          </p>
                          <p className="mt-0.5 text-[12px] text-ink-muted">
                            Eventos para sistemas externos
                          </p>
                        </div>
                      </div>
                      <Link
                        href="/app/settings/webhooks"
                        className="btn-primary btn-sm h-8"
                      >
                        Gerenciar
                      </Link>
                    </li>
                    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-300">
                          <Code2 className="h-4 w-4" strokeWidth={1.75} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-ink dark:text-white">
                            API
                          </p>
                          <p className="mt-0.5 text-[12px] text-ink-muted">
                            Chaves e escopos conforme o plano
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link href="/docs/api" className="btn-secondary btn-sm h-8">
                          Docs
                        </Link>
                        <Link href="/app/settings/api" className="btn-primary btn-sm h-8">
                          Chaves
                        </Link>
                      </div>
                    </li>
                  </ul>
                </Surface>
              </div>
            )}

            {/* Barra de salvamento */}
            {showSaveBar && (
              <div
                className="sticky bottom-3 z-20 mt-8"
                role="status"
                aria-live="polite"
              >
                <div className="flex items-center gap-3 rounded-2xl border border-line bg-white/95 px-3.5 py-2.5 shadow-[0_10px_32px_-10px_rgba(0,0,0,0.28)] backdrop-blur-md dark:border-white/[0.1] dark:bg-[#151820]/95">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/[0.15] text-amber-700 dark:text-amber-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink-secondary dark:text-gray-300">
                    Alterações não salvas
                  </span>
                  <button
                    type="button"
                    className="btn-ghost btn-sm h-8 shrink-0 px-2.5 text-xs"
                    disabled={saveMutation.isPending}
                    onClick={discard}
                  >
                    Descartar
                  </button>
                  <button
                    type="submit"
                    className="btn-primary btn-sm h-8 shrink-0 px-3 text-xs"
                    disabled={saveMutation.isPending}
                  >
                    {saveMutation.isPending ? "Salvando…" : "Salvar"}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>

      <Modal
        open={Boolean(pendingTab)}
        onClose={() => setPendingTab(null)}
        title="Alterações não salvas"
        description="Salve ou descarte antes de trocar de seção."
        variant="confirm"
        size="sm"
        preventClose={saveMutation.isPending}
        footer={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <button
              type="button"
              className="btn-secondary h-9 px-3.5"
              disabled={saveMutation.isPending}
              onClick={() => setPendingTab(null)}
            >
              Continuar editando
            </button>
            <button
              type="button"
              className="btn-ghost h-9 px-3.5"
              disabled={saveMutation.isPending}
              onClick={() => {
                const next = pendingTab;
                if (baseline) setForm({ ...baseline });
                setPendingTab(null);
                if (next) {
                  setTab(next);
                  setContentKey((k) => k + 1);
                }
              }}
            >
              Descartar
            </button>
            <button
              type="button"
              className="btn-primary h-9 px-4"
              disabled={saveMutation.isPending}
              onClick={() => onSave()}
            >
              {saveMutation.isPending ? "Salvando…" : "Salvar e continuar"}
            </button>
          </div>
        }
      >
        <p className="text-sm text-ink-secondary dark:text-gray-300">
          Alterações da seção atual serão perdidas se você descartar.
        </p>
      </Modal>
    </TenantModule>
  );
}

/* ─── Provedor de IA (BYOK multi-provider) ─── */

type AiProviderConfigResponse = {
  providers: Array<{
    id: string;
    name: string;
    productionReady: boolean;
    models: Array<{ id: string; name: string; enabled: boolean }>;
  }>;
  platformManagedAvailable: boolean;
  platformProvider: string | null;
  platformModel: string | null;
  config: {
    provider: string;
    model: string;
    credentialMode: "platform_managed" | "byok";
    hasApiKey: boolean;
    apiKeyMasked: string | null;
    baseUrl: string | null;
    fallbackProvider: string | null;
    fallbackModel: string | null;
    enabled: boolean;
    lastTestOk: boolean | null;
  };
};

function TenantAiProviderPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["settings-ai-provider"],
    queryFn: () => api<AiProviderConfigResponse>("/settings/ai-provider"),
  });

  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [credentialMode, setCredentialMode] = useState<"platform_managed" | "byok">(
    "platform_managed"
  );
  const [apiKey, setApiKey] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!q.data || hydrated) return;
    setProvider(q.data.config.provider);
    setModel(q.data.config.model);
    setCredentialMode(q.data.config.credentialMode);
    setHydrated(true);
  }, [q.data, hydrated]);

  const models = useMemo(() => {
    const p = q.data?.providers.find((x) => x.id === provider);
    return (p?.models || []).filter((m) => m.enabled);
  }, [q.data, provider]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api("/settings/ai-provider", {
        method: "PUT",
        json: {
          provider,
          model,
          credentialMode,
          apiKey: credentialMode === "byok" && apiKey.trim() ? apiKey.trim() : undefined,
        },
      }),
    onSuccess: () => {
      setApiKey("");
      void qc.invalidateQueries({ queryKey: ["settings-ai-provider"] });
      toast({ kind: "success", title: "Provedor de IA salvo" });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível salvar", description: e.message }),
  });

  const testMutation = useMutation({
    mutationFn: () => {
      if (credentialMode === "byok" && !apiKey.trim() && !q.data?.config.hasApiKey) {
        return Promise.reject(
          new Error("Informe a API Key da empresa para testar a conexão.")
        );
      }
      return api<{
        ok: boolean;
        message: string;
        credentialMode?: string;
        testedSource?: string;
        model?: string;
        provider?: string;
      }>("/settings/ai-provider/test", {
        method: "POST",
        json: {
          provider,
          // SEMPRE o modelo do select (não o salvo antigo)
          model,
          credentialMode,
          // só envia chave se o usuário digitou; senão o backend usa a salva (BYOK) ou plataforma
          apiKey:
            credentialMode === "byok" && apiKey.trim() ? apiKey.trim() : undefined,
        },
      });
    },
    onSuccess: (r) => {
      const modelLabel = r.model || model;
      toast({
        kind: r.ok ? "success" : "error",
        title: r.ok ? "Conexão validada" : "Conexão inválida",
        description: r.message || (r.ok ? `Modelo testado: ${modelLabel}` : undefined),
      });
      void qc.invalidateQueries({ queryKey: ["settings-ai-provider"] });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível testar", description: e.message }),
  });

  if (q.isLoading) {
    return (
      <Surface title="Fornecedor de IA">
        <div className="flex items-center gap-2 py-2 text-sm text-ink-muted" role="status">
          <Spinner className="h-4 w-4" />
          Carregando…
        </div>
      </Surface>
    );
  }

  if (q.isError || !q.data) {
    return (
      <Surface title="Fornecedor de IA">
        <p className="text-sm text-ink-muted" role="alert">
          Não foi possível carregar a configuração de IA.
        </p>
      </Surface>
    );
  }

  const readyProviders = q.data.providers.filter((p) => p.productionReady);

  return (
    <Surface
      data-tour="settings-ai-provider"
      title="Fornecedor de IA"
      description="Provedor e credenciais usados por agentes, copiloto e AUTO."
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="label">Provedor</span>
            <Select
              size="sm"
              value={provider}
              onChange={(v) => {
                setProvider(v);
                const first = q.data?.providers.find((p) => p.id === v)?.models.find((m) => m.enabled);
                if (first) setModel(first.id);
              }}
              options={readyProviders.map((p) => ({ value: p.id, label: p.name }))}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="label">Modelo padrão</span>
            <Select
              size="sm"
              value={model}
              onChange={setModel}
              options={
                models.length
                  ? models.map((m) => ({ value: m.id, label: m.name }))
                  : [{ value: model, label: model }]
              }
            />
          </label>
        </div>

        <div className="space-y-2">
          <span className="label">Credenciais</span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={!q.data.platformManagedAvailable}
              onClick={() => setCredentialMode("platform_managed")}
              className={cn(
                "flex-1 rounded-xl border px-3 py-2.5 text-left text-[13px] transition-colors",
                credentialMode === "platform_managed"
                  ? "border-brand-500/40 bg-brand-500/[0.08] font-semibold text-ink dark:text-white"
                  : "border-black/[0.06] text-ink-muted dark:border-white/[0.1]",
                !q.data.platformManagedAvailable && "opacity-50"
              )}
            >
              Gerenciado pela NexaFlow
              <span className="mt-0.5 block text-[11px] font-normal text-ink-faint">
                {q.data.platformManagedAvailable
                  ? `Usa ${q.data.platformProvider || "provedor"} da plataforma`
                  : "Indisponível neste ambiente"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setCredentialMode("byok")}
              className={cn(
                "flex-1 rounded-xl border px-3 py-2.5 text-left text-[13px] transition-colors",
                credentialMode === "byok"
                  ? "border-brand-500/40 bg-brand-500/[0.08] font-semibold text-ink dark:text-white"
                  : "border-black/[0.06] text-ink-muted dark:border-white/[0.1]"
              )}
            >
              Usar minha própria API Key
              <span className="mt-0.5 block text-[11px] font-normal text-ink-faint">
                BYOK · chave criptografada · só desta empresa
              </span>
            </button>
          </div>
        </div>

        {credentialMode === "byok" ? (
          <label className="block space-y-1.5">
            <span className="label">
              API Key{" "}
              {q.data.config.hasApiKey && q.data.config.apiKeyMasked ? (
                <span className="font-normal normal-case tracking-normal text-ink-faint">
                  (atual: {q.data.config.apiKeyMasked})
                </span>
              ) : null}
            </span>
            <input
              type="password"
              autoComplete="off"
              className="input h-10 text-[13px]"
              placeholder={
                q.data.config.hasApiKey ? "Nova chave (deixe em branco para manter)" : "Cole a API Key"
              }
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <span className="block text-[11px] text-ink-faint">
              Armazenada criptografada · nunca reexibida por completo
            </span>
          </label>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-black/[0.05] pt-3 dark:border-white/[0.08]">
          <button
            type="button"
            className="btn-secondary h-9 px-3.5 text-[13px]"
            disabled={
              testMutation.isPending ||
              (credentialMode === "byok" && !apiKey.trim() && !q.data.config.hasApiKey)
            }
            onClick={() => testMutation.mutate()}
            title={
              credentialMode === "byok" && !apiKey.trim() && !q.data.config.hasApiKey
                ? "Informe a API Key para testar"
                : undefined
            }
          >
            {testMutation.isPending ? "Testando…" : "Testar conexão"}
          </button>
          <button
            type="button"
            className="btn-primary h-9 px-4 text-[13px]"
            disabled={
              saveMutation.isPending ||
              !provider ||
              !model ||
              (credentialMode === "byok" && !apiKey.trim() && !q.data.config.hasApiKey)
            }
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? "Salvando…" : "Salvar provedor"}
          </button>
          {q.data.config.lastTestOk === true ? (
            <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
              Último teste OK
            </span>
          ) : q.data.config.lastTestOk === false ? (
            <span className="text-[11px] font-medium text-rose-600 dark:text-rose-300">
              Último teste falhou
            </span>
          ) : null}
        </div>
        {credentialMode === "byok" && !apiKey.trim() && !q.data.config.hasApiKey ? (
          <p className="text-[12px] text-amber-800 dark:text-amber-200">
            Cole a API Key da empresa antes de testar ou salvar no modo chave própria.
          </p>
        ) : null}
      </div>
    </Surface>
  );
}
