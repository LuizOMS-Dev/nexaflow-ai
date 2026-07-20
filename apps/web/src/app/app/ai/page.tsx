"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  FileUp,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  ActionChoiceCard,
  ContextDivider,
  ContextSummary,
  ContextZone,
  DialogFooter,
  Dropdown,
  DropdownItem,
  EmptyState,
  FieldGrid,
  FormField,
  FormSection,
  Modal,
  PageHeader,
  Select,
  Spinner,
  Switch,
  Tooltip,
  WizardSteps,
  useToast,
} from "@/components/ui";
import { useAuth } from "@/store/auth";
import {
  AgentCommandCenter,
  type AgentFilter,
  type AgentOverview,
} from "@/components/agents/agent-command-center";
import { NiaMarkdown } from "@/components/nexaflow-assistant/nia-markdown";

type AgentTools = {
  allowed?: string[];
  blocked?: string[];
  requireApproval?: string[];
  /** false = não participa do aprendizado (só se a empresa tiver ativado) */
  continuousLearning?: boolean | null;
  /** false = não permite encerramento automático pela IA (só se empresa ativar) */
  autoClose?: boolean | null;
};

type AgentTransferRules = {
  triggers?: string[];
  destination?: string;
  /** Mensagem curta ao transferir (opcional) */
  handoffMessage?: string;
};

type Agent = {
  id: string;
  name: string;
  role?: string | null;
  objective?: string | null;
  personality?: string | null;
  tone?: string | null;
  mode: string;
  model: string;
  isActive: boolean;
  instructions: string;
  restrictions?: string | null;
  transferRules?: AgentTransferRules | null;
  tools?: AgentTools | null;
  updatedAt?: string;
  currentVersion?: number;
  publishStatus?: string;
};

type CompanySettings = {
  name: string;
  settings?: {
    segment?: string | null;
    timezone?: string;
    language?: string;
    phone?: string | null;
    website?: string | null;
    [key: string]: unknown;
  };
};

const MODE_META: Record<string, { label: string; selectLabel: string; help: string }> = {
  AUTO: {
    label: "Automático",
    selectLabel: "Automático — responde sozinho",
    help: "Responde no WhatsApp quando ninguém da equipe assumiu.",
  },
  APPROVE: {
    label: "Aprovação",
    selectLabel: "Aprovação — rascunho para humano",
    help: "Gera resposta para aprovação antes do envio.",
  },
  SUGGEST: {
    label: "Copiloto",
    selectLabel: "Copiloto — só sugere",
    help: "Auxilia o atendente. Não envia mensagens sozinho.",
  },
};

/** Ferramentas — menor privilégio no default comercial */
const TOOL_OPTIONS = [
  {
    id: "consult_contact",
    label: "Consultar contato",
    description: "Lê dados do contato no CRM durante o atendimento.",
  },
  {
    id: "update_contact",
    label: "Atualizar contato",
    description: "Atualiza campos básicos do contato (nome, e-mail, empresa).",
  },
  {
    id: "update_status",
    label: "Alterar status comercial",
    description: "Atualiza o status comercial do lead no CRM.",
  },
  {
    id: "update_priority",
    label: "Alterar prioridade",
    description: "Define a prioridade do lead (baixa a urgente).",
  },
  {
    id: "set_next_action",
    label: "Registrar próxima ação",
    description: "Registra o próximo passo comercial no contato.",
  },
  {
    id: "create_opportunity",
    label: "Criar oportunidade",
    description: "Cria uma oportunidade no funil quando houver interesse comercial.",
  },
  {
    id: "create_task",
    label: "Criar tarefa",
    description: "Cria uma tarefa para a equipe a partir da conversa.",
  },
  {
    id: "create_note",
    label: "Criar nota interna",
    description: "Adiciona nota interna na conversa (não vai ao WhatsApp).",
  },
  {
    id: "transfer",
    label: "Transferir atendimento",
    description: "Encaminha o atendimento para a fila humana.",
  },
] as const;

/** Default ao criar: comercial essencial (sem task/note/priority por padrão) */
const DEFAULT_ALLOWED_TOOLS = [
  "consult_contact",
  "update_contact",
  "update_status",
  "set_next_action",
  "create_opportunity",
  "transfer",
] as const;

const DEFAULT_TRANSFER_TRIGGERS = ["humano", "nao_sabe"] as const;

const SANDBOX_SUGGESTIONS = [
  "Quais são os planos?",
  "Quanto custa o plano Profissional?",
  "Quero falar com uma pessoa",
] as const;

const GOAL_OPTIONS = [
  { id: "atender", label: "Atender clientes" },
  { id: "vender", label: "Vender produtos ou serviços" },
  { id: "qualificar", label: "Qualificar oportunidades" },
  { id: "suporte", label: "Suporte" },
  { id: "agendar", label: "Agendamentos" },
  { id: "cobrar", label: "Cobrança" },
  { id: "outro", label: "Outro" },
] as const;

const TONE_OPTIONS = [
  { id: "amigavel", label: "Profissional e amigável", tone: "profissional e amigável" },
  { id: "direto", label: "Direto e objetivo", tone: "direto e objetivo" },
  { id: "consultivo", label: "Consultivo", tone: "consultivo" },
  { id: "formal", label: "Formal", tone: "formal" },
  { id: "descontraido", label: "Descontraído", tone: "descontraído e leve" },
  { id: "custom", label: "Personalizado", tone: "" },
] as const;

const TRANSFER_OPTIONS = [
  {
    id: "humano",
    label: "Pediu atendimento humano",
    description: "Cliente pede pessoa, atendente ou “falar com alguém”.",
    recommended: true,
  },
  {
    id: "nao_sabe",
    label: "Não sabe responder",
    description: "Sem informação confiável no conhecimento ou nas regras.",
    recommended: true,
  },
  {
    id: "reclamacao",
    label: "Reclamação ou insatisfação",
    description: "Tom de reclamação, frustração ou pedido de cancelamento.",
  },
  {
    id: "compra",
    label: "Intenção de compra",
    description: "Cliente quer fechar, contratar ou avançar a venda.",
  },
  {
    id: "negociacao",
    label: "Negociação ou desconto",
    description: "Pede condição especial, preço customizado ou proposta.",
  },
  {
    id: "urgencia",
    label: "Urgência ou prazo crítico",
    description: "Situação urgente, prazo apertado ou impacto alto.",
  },
  {
    id: "juridico",
    label: "Assunto jurídico ou LGPD",
    description: "Contrato, jurídico, privacidade de dados ou compliance.",
  },
  {
    id: "pagamento",
    label: "Pagamento e cobrança",
    description: "Fatura, atraso, estorno ou disputa de pagamento.",
  },
  {
    id: "tecnico",
    label: "Problema técnico",
    description: "Falha de produto/serviço que exige suporte especializado.",
  },
  {
    id: "outro",
    label: "Outro (personalizado)",
    description: "Defina uma regra específica para o seu negócio.",
  },
] as const;

const HANDOFF_DESTINATION_OPTIONS = [
  {
    id: "queue",
    label: "Fila geral",
    description: "Qualquer atendente disponível assume o chat.",
  },
  {
    id: "supervisor",
    label: "Supervisão",
    description: "Prioriza supervisores na fila humana.",
  },
  {
    id: "sales",
    label: "Comercial",
    description: "Indica handoff com foco em vendas.",
  },
  {
    id: "support",
    label: "Suporte",
    description: "Indica handoff com foco em suporte técnico.",
  },
] as const;

const LIMIT_OPTIONS = [
  { id: "inventar", label: "Inventar informações" },
  { id: "precos", label: "Inventar preços" },
  { id: "promessas", label: "Prometer condições não cadastradas" },
  { id: "pagamento", label: "Confirmar pagamento sem validação" },
  { id: "desconto", label: "Dar descontos sem autorização" },
  { id: "fora", label: "Responder assuntos fora da empresa" },
] as const;

const WIZARD_STEPS = [
  "Objetivo",
  "Personalidade",
  "Conhecimento",
  "Transferência",
  "Limites",
  "Revisão",
] as const;

function modelDisplayName(model: string): string {
  const m = (model || "").toLowerCase();
  if (!m) return "Modelo padrão";
  if (m.includes("llama-3.3") && m.includes("70b")) return "Llama 3.3 70B";
  if (m.includes("llama-3.1") && m.includes("70b")) return "Llama 3.1 70B";
  if (m.includes("llama-3.1") && m.includes("8b")) return "Llama 3.1 8B";
  if (m.includes("llama")) {
    return model
      .replace(/-/g, " ")
      .replace(/\bversatile\b/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  if (m.includes("gpt-4o")) return "GPT-4o";
  if (m.includes("gpt-4")) return "GPT-4";
  return "Modelo padrão";
}

function displayableObjective(agent: Agent): string | null {
  const objective = agent.objective?.trim();
  if (!objective) return null;
  const looksLikeInstructions =
    objective.length > 220 ||
    objective.includes("\n") ||
    /^(?:você é|voce e|you are)\b|\b(?:sua função é|instruções|restrições|regras obrigatórias|nunca revele)\b/i.test(
      objective
    );
  return looksLikeInstructions ? null : objective;
}

function agentSummary(agent: Agent): string {
  const objective = displayableObjective(agent);
  if (objective) return objective.length > 140 ? `${objective.slice(0, 137)}…` : objective;
  const role = agent.role?.trim();
  if (role) return `Atende clientes no papel de ${role.toLowerCase()}.`;
  return "Agente configurado para apoiar a operação da empresa.";
}

function toggleIn(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function suggestName(goals: string[]): string {
  if (goals.includes("vender") || goals.includes("qualificar")) return "Ana";
  if (goals.includes("suporte")) return "Sofia";
  if (goals.includes("cobrar")) return "Lucas";
  if (goals.includes("agendar")) return "Clara";
  return "Ana";
}

function suggestRole(goals: string[]): string {
  const labels = GOAL_OPTIONS.filter((g) => goals.includes(g.id) && g.id !== "outro").map(
    (g) => g.label
  );
  if (!labels.length) return "Atendimento";
  if (labels.length === 1) return labels[0];
  return labels.slice(0, 2).join(" e ");
}

type WizardState = {
  step: number;
  goals: string[];
  goalOther: string;
  toneId: string;
  toneCustom: string;
  knowledge: string;
  transfers: string[];
  transferOther: string;
  limits: string[];
  limitsCustom: string;
  name: string;
  mode: string;
};

const emptyWizard = (): WizardState => ({
  step: 0,
  goals: ["atender"],
  goalOther: "",
  toneId: "amigavel",
  toneCustom: "",
  knowledge: "",
  transfers: ["humano", "nao_sabe"],
  transferOther: "",
  limits: ["inventar", "precos", "fora"],
  limitsCustom: "",
  name: "Ana",
  mode: "SUGGEST",
});

function ChipMulti({
  options,
  selected,
  onToggle,
}: {
  options: ReadonlyArray<{ id: string; label: string }>;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onToggle(o.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
              on
                ? "border-brand-500/40 bg-brand-500/10 text-brand-700 dark:border-brand-400/40 dark:bg-brand-500/[0.15] dark:text-brand-300"
                : "border-line text-ink-muted hover:border-line hover:bg-black/[0.02] dark:border-white/[0.08] dark:hover:bg-white/[0.04]"
            )}
          >
            {on ? <Check className="h-3 w-3" strokeWidth={2.25} /> : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function AiPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const tenant = useAuth((s) => s.tenant);

  const [createChoiceOpen, setCreateChoiceOpen] = useState(false);

  const [manualOpen, setManualOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizard, setWizard] = useState<WizardState>(emptyWizard);
  const [wizardError, setWizardError] = useState("");
  const [manualError, setManualError] = useState("");
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [chatAgent, setChatAgent] = useState<Agent | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<
    Array<{ id: string; role: "user" | "assistant"; content: string }>
  >([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<AgentFilter>("all");
  const [lastMeta, setLastMeta] = useState<{
    durationMs?: number;
    model?: string;
    provider?: string;
    note?: string;
    passed?: boolean;
  } | null>(null);

  const [form, setForm] = useState({
    name: "",
    role: "",
    instructions: "",
    mode: "SUGGEST",
    model: "llama-3.1-8b-instant",
  });
  const [editTab, setEditTab] = useState<
    "geral" | "comportamento" | "handoff" | "ferramentas" | "conhecimento"
  >("geral");
  const [editForm, setEditForm] = useState({
    name: "",
    role: "",
    objective: "",
    instructions: "",
    restrictions: "",
    personality: "",
    tone: "",
    mode: "AUTO",
    model: "llama-3.1-8b-instant",
    isActive: true,
    transfers: [] as string[],
    transferOther: "",
    destination: "queue",
    handoffMessage: "",
    tools: [] as string[],
    continuousLearning: true as boolean,
    autoClose: true as boolean,
  });

  /** Importar configuração (só formulário — não salva) */
  type ImportFormMap = {
    name?: string;
    role?: string;
    objective?: string;
    tone?: string;
    personality?: string;
    instructions?: string;
    restrictions?: string;
  };
  type ImportPreview = {
    form: ImportFormMap;
    found: string[];
    warnings: string[];
    ignoredOperational: boolean;
    ignoredOperationalHints?: string[];
  };
  const [importOpen, setImportOpen] = useState(false);
  const [importTarget, setImportTarget] = useState<"edit" | "manual">("edit");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState("");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importSelected, setImportSelected] = useState<Record<string, boolean>>({});

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["ai-agents"],
    queryFn: () => api<Agent[]>("/ai-agents"),
  });

  const overview = useQuery({
    queryKey: ["ai-agents-overview"],
    queryFn: () => api<AgentOverview>("/ai-agents/overview"),
    staleTime: 15_000,
    retry: false,
  });

  const company = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<CompanySettings>("/settings"),
    staleTime: 60_000,
    retry: false,
  });

  const waStatus = useQuery({
    queryKey: ["whatsapp-status"],
    queryFn: () => api<{ connected: boolean }>("/whatsapp/status"),
    staleTime: 20_000,
    retry: false,
  });

  type AgentKnowledgeItem = {
    id: string;
    title: string;
    category?: string | null;
    status?: string | null;
    statusLabel?: string;
    sourceLabel?: string;
    updatedAt?: string;
    scope?: string | null;
  };

  const agentKnowledge = useQuery({
    queryKey: ["agent-knowledge", editAgent?.id],
    queryFn: () => api<AgentKnowledgeItem[]>(`/ai-agents/${editAgent!.id}/knowledge`),
    enabled: Boolean(editAgent?.id) && editTab === "conhecimento",
    staleTime: 20_000,
  });

  const channelConnected = Boolean(waStatus.data?.connected);
  const companyName =
    company.data?.name || tenant?.name || "sua empresa";
  const companySegment =
    (company.data?.settings?.segment as string) || "seu segmento";

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api("/ai-agents", { method: "POST", json: body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-agents"] });
      qc.invalidateQueries({ queryKey: ["ai-agents-overview"] });
      setManualOpen(false);
      setWizardOpen(false);
      setWizard(emptyWizard());
      toast({ kind: "success", title: "Agente criado" });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível criar", description: e.message }),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api(`/ai-agents/${id}`, { method: "PATCH", json: body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-agents"] });
      qc.invalidateQueries({ queryKey: ["ai-agents-overview"] });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível atualizar", description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/ai-agents/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-agents"] });
      qc.invalidateQueries({ queryKey: ["ai-agents-overview"] });
      toast({ kind: "success", title: "Agente excluído" });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível excluir", description: e.message }),
  });

  const chatMutation = useMutation({
    mutationFn: (content: string) =>
      api<{
        reply?: string;
        content?: string;
        sandbox?: boolean;
        agent?: { mode?: string; model?: string };
        meta?: {
          durationMs?: number;
          model?: string;
          provider?: string;
          note?: string;
          passed?: boolean;
        };
      }>(`/ai-agents/${chatAgent!.id}/test`, {
        method: "POST",
        json: {
          message: content,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        },
      }),
    onSuccess: (res, content) => {
      const reply = res.reply || res.content || "(sem resposta)";
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "user", content },
        { id: crypto.randomUUID(), role: "assistant", content: reply },
      ]);
      setLastMeta({
        durationMs: res.meta?.durationMs,
        model: res.meta?.model || res.agent?.model,
        provider: res.meta?.provider,
        note: res.meta?.note || (res.sandbox ? "Sandbox — sem envio real" : undefined),
        passed: res.meta?.passed,
      });
      qc.invalidateQueries({ queryKey: ["ai-agents-overview"] });
      setChatInput("");
    },
    onError: (e: Error) =>
      toast({
        kind: "error",
        title: "O teste não foi concluído",
        description: e.message,
      }),
  });

  const saveEditMutation = useMutation({
    mutationFn: () =>
      api(`/ai-agents/${editAgent!.id}`, {
        method: "PATCH",
        json: {
          name: editForm.name.trim(),
          role: editForm.role.trim() || null,
          objective: editForm.objective.trim() || null,
          personality: editForm.personality.trim() || null,
          tone: editForm.tone.trim() || null,
          instructions: editForm.instructions,
          restrictions: editForm.restrictions.trim() || null,
          mode: editForm.mode,
          model: editForm.model,
          isActive: editForm.isActive,
          transferRules: {
            triggers: (() => {
              const base = editForm.transfers.filter((t) => t !== "outro");
              const custom = editForm.transferOther.trim();
              if (editForm.transfers.includes("outro") && custom) {
                return [...base, custom];
              }
              return base.length ? base : [...DEFAULT_TRANSFER_TRIGGERS];
            })(),
            destination: editForm.destination || "queue",
            handoffMessage: editForm.handoffMessage.trim() || null,
          },
          tools: {
            allowed: editForm.tools,
            blocked: [
              "delete_contact",
              "manage_users",
              "cancel_subscription",
              "register_payment",
              "change_contract",
              "grant_discount",
            ],
            continuousLearning: editForm.continuousLearning,
            autoClose: editForm.autoClose,
          },
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-agents"] });
      qc.invalidateQueries({ queryKey: ["ai-agents-overview"] });
      setEditAgent(null);
      toast({ kind: "success", title: "Agente atualizado" });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível salvar", description: e.message }),
  });

  function openWizard() {
    setWizard({
      ...emptyWizard(),
      goals: [],
      transfers: [...DEFAULT_TRANSFER_TRIGGERS],
      limits: [],
      name: "Julia",
    });
    setWizardError("");
    setWizardOpen(true);
  }

  function openManual() {
    setForm({
      name: "",
      role: "",
      instructions: "",
      mode: "SUGGEST",
      model: "llama-3.1-8b-instant",
    });
    setManualError("");
    setManualOpen(true);
  }

  function openEdit(agent: Agent) {
    setEditAgent(agent);
    setEditTab("geral");
    const triggers = agent.transferRules?.triggers;
    const knownIds = new Set<string>(TRANSFER_OPTIONS.map((t) => t.id as string));
    const list: string[] =
      Array.isArray(triggers) && triggers.length
        ? triggers.map(String)
        : [...DEFAULT_TRANSFER_TRIGGERS];
    const known = list.filter((t) => knownIds.has(t));
    const customParts = list.filter((t) => !knownIds.has(t));
    const transfers = customParts.length
      ? [...known.filter((t) => t !== "outro"), "outro"]
      : known.length
        ? known
        : [...DEFAULT_TRANSFER_TRIGGERS];
    const allowed = agent.tools?.allowed;
    const dest = agent.transferRules?.destination || "queue";
    setEditForm({
      name: agent.name,
      role: agent.role || "",
      objective: agent.objective || "",
      instructions: agent.instructions || "",
      restrictions: agent.restrictions || "",
      personality: agent.personality || "",
      tone: agent.tone || "",
      mode: agent.mode,
      model: agent.model || "llama-3.1-8b-instant",
      isActive: agent.isActive,
      transfers,
      transferOther: customParts.join("; "),
      destination: HANDOFF_DESTINATION_OPTIONS.some((d) => d.id === dest)
        ? dest
        : "queue",
      handoffMessage: agent.transferRules?.handoffMessage || "",
      tools: Array.isArray(allowed) && allowed.length ? allowed : [...DEFAULT_ALLOWED_TOOLS],
      continuousLearning: agent.tools?.continuousLearning !== false,
      autoClose: agent.tools?.autoClose !== false,
    });
  }

  // Tour: abrir edição / criação e trocar abas
  useEffect(() => {
    function onTourEvent(e: Event) {
      const d = (
        e as CustomEvent<{
          openAgentCreate?: boolean;
          closeAgentCreate?: boolean;
          openAgentEdit?: boolean;
          closeAgentEdit?: boolean;
          editTab?: "geral" | "comportamento" | "handoff" | "ferramentas" | "conhecimento";
        }>
      ).detail;
      if (!d) return;

      if (d.closeAgentCreate) setCreateChoiceOpen(false);
      if (d.closeAgentEdit) {
        setEditAgent(null);
        setManualOpen(false);
      }

      if (d.openAgentCreate) {
        setEditAgent(null);
        setManualOpen(false);
        setCreateChoiceOpen(true);
      }

      if (d.openAgentEdit) {
        setCreateChoiceOpen(false);
        const list = data || [];
        if (list.length > 0) {
          setManualOpen(false);
          openEdit(list[0]);
          if (d.editTab) setEditTab(d.editTab);
        } else {
          // Sem agentes: mostra formulário manual como preview da edição
          setEditAgent(null);
          setManualOpen(true);
        }
      } else if (d.editTab && editAgent) {
        setEditTab(d.editTab);
      }
    }
    window.addEventListener("nexaflow:tour", onTourEvent);
    return () => window.removeEventListener("nexaflow:tour", onTourEvent);
    // openEdit is stable enough via data/agents in closure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, editAgent]);

  function validateManual(): string | null {
    if (form.name.trim().length < 2) return "Informe o nome do agente (mínimo 2 caracteres).";
    if (form.role.trim().length < 2) return "Informe a função do agente.";
    if (form.instructions.trim().length < 20) {
      return "Descreva como o agente deve agir (mínimo 20 caracteres).";
    }
    if (!form.mode) return "Selecione o modo de resposta.";
    return null;
  }

  const manualValid = useMemo(() => !validateManual(), [form.name, form.role, form.instructions, form.mode]);

  async function onCreateManual(e: FormEvent) {
    e.preventDefault();
    const err = validateManual();
    if (err) {
      setManualError(err);
      toast({ kind: "error", title: "Preencha os campos obrigatórios", description: err });
      return;
    }
    setManualError("");
    await createMutation.mutateAsync({
      name: form.name.trim(),
      role: form.role.trim(),
      instructions: form.instructions.trim(),
      mode: form.mode,
      model: form.model,
    });
  }

  function buildWizardPayload() {
    const goalLabels = [
      ...GOAL_OPTIONS.filter((g) => wizard.goals.includes(g.id) && g.id !== "outro").map(
        (g) => g.label
      ),
      ...(wizard.goals.includes("outro") && wizard.goalOther.trim()
        ? [wizard.goalOther.trim()]
        : []),
    ];
    const goalText = goalLabels.join("; ") || "Atender clientes";

    const toneOpt = TONE_OPTIONS.find((t) => t.id === wizard.toneId);
    const tone =
      wizard.toneId === "custom"
        ? wizard.toneCustom.trim() || "profissional e amigável"
        : toneOpt?.tone || "profissional e amigável";

    const transferLabels = [
      ...TRANSFER_OPTIONS.filter(
        (t) => wizard.transfers.includes(t.id) && t.id !== "outro"
      ).map((t) => t.label),
      ...(wizard.transfers.includes("outro") && wizard.transferOther.trim()
        ? [wizard.transferOther.trim()]
        : []),
    ];

    const limitLabels = [
      ...LIMIT_OPTIONS.filter((l) => wizard.limits.includes(l.id)).map((l) => l.label),
      ...(wizard.limitsCustom.trim() ? [wizard.limitsCustom.trim()] : []),
    ];

    const role = suggestRole(wizard.goals);
    // Limites específicos da empresa (veracidade global já é política NexaFlow)
    const companyLimits = limitLabels.filter(
      (l) => !/inventar/i.test(l)
    );
    const restrictions = companyLimits.length
      ? `Não: ${companyLimits.join("; ")}.`
      : "Não oferecer desconto sem autorização. Não prometer prazos não cadastrados.";

    const transferBlock = transferLabels.length
      ? `TRANSFERÊNCIA PARA HUMANO\n- ${transferLabels.join("\n- ")}`
      : "TRANSFERÊNCIA PARA HUMANO\n- Quando o cliente pedir um humano ou você não souber responder.";

    // Só comportamento — nome/função/empresa injetados no runtime pelos campos estruturados
    const instructions = `COMPORTAMENTO
- Mensagens curtas, profissionais, em português do Brasil. Tom: ${tone}.
- Faça uma pergunta por vez quando estiver qualificando.
- Peça o nome do cliente se não souber.
- Use somente informações do conhecimento e fontes oficiais da empresa.
- Objetivo: ${goalText}.
${wizard.knowledge.trim() ? `\nCONHECIMENTO ESPECÍFICO (reforço)\n${wizard.knowledge.trim()}` : ""}
${transferBlock ? `\n${transferBlock}` : ""}
- Off-topic: recuse de forma leve e volte ao atendimento.`;

    return {
      name: wizard.name.trim() || suggestName(wizard.goals),
      role,
      objective: goalText,
      personality: tone,
      tone,
      instructions,
      restrictions,
      mode: wizard.mode,
      model: "llama-3.1-8b-instant",
      greeting: `Oi! Tudo bem? Como posso te ajudar?`,
      transferRules: {
        triggers: (() => {
          const base = wizard.transfers.filter((t) => t !== "outro");
          const custom = wizard.transferOther.trim();
          if (wizard.transfers.includes("outro") && custom) {
            return [...base, custom];
          }
          return base.length ? base : [...DEFAULT_TRANSFER_TRIGGERS];
        })(),
        destination: "queue",
      },
      tools: {
        allowed: [...DEFAULT_ALLOWED_TOOLS],
        blocked: [
          "delete_contact",
          "manage_users",
          "cancel_subscription",
          "register_payment",
          "change_contract",
          "grant_discount",
        ],
      },
    };
  }

  /** Mensagem de erro da etapa atual; null = ok */
  function wizardStepError(step = wizard.step): string | null {
    if (step === 0) {
      if (!wizard.goals.length) return "Marque pelo menos um objetivo.";
      if (wizard.goals.includes("outro") && wizard.goalOther.trim().length < 2) {
        return "Descreva o objetivo em “Outro”.";
      }
      return null;
    }
    if (step === 1) {
      if (!wizard.toneId) return "Escolha como o agente deve conversar.";
      if (wizard.toneId === "custom" && wizard.toneCustom.trim().length < 2) {
        return "Descreva o tom de voz personalizado.";
      }
      return null;
    }
    if (step === 2) {
      if (wizard.knowledge.trim().length < 15) {
        return "Escreva o que o agente precisa conhecer (produtos, serviços, etc.).";
      }
      return null;
    }
    if (step === 3) {
      if (!wizard.transfers.length) return "Marque pelo menos uma regra de transferência.";
      if (wizard.transfers.includes("outro") && wizard.transferOther.trim().length < 2) {
        return "Descreva a regra em “Outro”.";
      }
      return null;
    }
    if (step === 4) {
      if (!wizard.limits.length && wizard.limitsCustom.trim().length < 5) {
        return "Marque pelo menos um limite ou escreva um limite personalizado.";
      }
      return null;
    }
    if (step === 5) {
      if (wizard.name.trim().length < 2) return "Informe o nome do agente.";
      if (!wizard.mode) return "Selecione o modo inicial.";
      return null;
    }
    return null;
  }

  function canAdvanceWizard(): boolean {
    return wizardStepError() === null;
  }

  function tryAdvanceWizard() {
    const err = wizardStepError();
    if (err) {
      setWizardError(err);
      toast({ kind: "error", title: "Complete esta etapa", description: err });
      return;
    }
    setWizardError("");
    setWizard((w) => ({
      ...w,
      step: Math.min(WIZARD_STEPS.length - 1, w.step + 1),
      name: w.step === 0 ? suggestName(w.goals) : w.name,
    }));
  }

  function tryCreateFromWizard() {
    // Valida todas as etapas antes de criar
    for (let s = 0; s <= 5; s++) {
      const err = wizardStepError(s);
      if (err) {
        setWizardError(err);
        setWizard((w) => ({ ...w, step: s }));
        toast({ kind: "error", title: "Falta preencher algo", description: err });
        return;
      }
    }
    setWizardError("");
    createMutation.mutate(buildWizardPayload());
  }

  const agents = data || [];
  const readinessByAgent = useMemo(
    () => new Map((overview.data?.agents || []).map((item) => [item.agentId, item])),
    [overview.data?.agents]
  );
  const filteredAgents = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return agents.filter((agent) => {
      const readiness = readinessByAgent.get(agent.id);
      const matchesSearch =
        !term ||
        [agent.name, agent.role, agent.objective]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(term));
      const matchesFilter =
        filter === "all" ||
        (filter === "active" && agent.isActive) ||
        (filter === "attention" && readiness?.readyForAuto === false);
      return matchesSearch && matchesFilter;
    });
  }, [agents, filter, readinessByAgent, search]);
  const modeHelp = useMemo(() => MODE_META[form.mode]?.help, [form.mode]);
  const editModeHelp = useMemo(() => MODE_META[editForm.mode]?.help, [editForm.mode]);

  const reviewTone =
    wizard.toneId === "custom"
      ? wizard.toneCustom || "Personalizado"
      : TONE_OPTIONS.find((t) => t.id === wizard.toneId)?.label || "—";

  const IMPORT_FIELD_META: Array<{
    key: keyof ImportFormMap;
    label: string;
  }> = [
    { key: "name", label: "Nome" },
    { key: "role", label: "Função" },
    { key: "objective", label: "Objetivo" },
    { key: "tone", label: "Tom" },
    { key: "personality", label: "Personalidade" },
    { key: "instructions", label: "Comportamento" },
    { key: "restrictions", label: "Limites" },
  ];

  function openImportConfig(target: "edit" | "manual") {
    setImportTarget(target);
    setImportPreview(null);
    setImportSelected({});
    setImportError("");
    setImportOpen(true);
  }

  async function onImportFile(file: File | null) {
    if (!file) return;
    setImportError("");
    setImportBusy(true);
    setImportPreview(null);
    try {
      const lower = file.name.toLowerCase();
      if (file.size > 200_000) {
        throw new Error("Arquivo muito grande (máx. ~200 KB).");
      }
      if (lower.includes(".") && !/\.(txt|md|markdown|text)$/i.test(lower)) {
        throw new Error("Use arquivo .txt ou .md.");
      }
      const text = await file.text();
      const res = await api<ImportPreview & { message?: string }>("/ai-agents/import-config", {
        method: "POST",
        json: {
          text,
          filename: file.name,
          agentId: importTarget === "edit" ? editAgent?.id : undefined,
        },
      });
      setImportPreview(res);
      const current =
        importTarget === "edit"
          ? editForm
          : {
              name: form.name,
              role: form.role,
              objective: "",
              tone: "",
              personality: "",
              instructions: form.instructions,
              restrictions: "",
            };
      const sel: Record<string, boolean> = {};
      for (const { key } of IMPORT_FIELD_META) {
        const incoming = (res.form?.[key] || "").trim();
        if (!incoming) continue;
        const existing = String((current as Record<string, string>)[key] || "").trim();
        // vazio → marca; já preenchido → desmarca (usuário escolhe)
        sel[key] = !existing;
      }
      // se nada marcado (tudo conflito), marca todos com valor
      if (!Object.values(sel).some(Boolean)) {
        for (const k of Object.keys(sel)) sel[k] = true;
      }
      setImportSelected(sel);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Não foi possível importar.");
    } finally {
      setImportBusy(false);
    }
  }

  function applyImportConfig() {
    if (!importPreview?.form) return;
    const f = importPreview.form;
    const pick = (k: keyof ImportFormMap) =>
      importSelected[k] && f[k]?.trim() ? f[k]!.trim() : undefined;

    if (importTarget === "edit") {
      setEditForm((prev) => ({
        ...prev,
        name: pick("name") ?? prev.name,
        role: pick("role") ?? prev.role,
        objective: pick("objective") ?? prev.objective,
        tone: pick("tone") ?? prev.tone,
        personality: pick("personality") ?? prev.personality,
        instructions: pick("instructions") ?? prev.instructions,
        restrictions: pick("restrictions") ?? prev.restrictions,
      }));
      setEditTab("geral");
      toast({
        kind: "success",
        title: "Configuração aplicada",
        description: "Revise os campos e salve o agente quando estiver pronto.",
      });
    } else {
      const extras = [
        pick("objective") ? `Objetivo: ${pick("objective")}` : "",
        pick("tone") ? `Tom: ${pick("tone")}` : "",
        pick("personality") ? `Personalidade: ${pick("personality")}` : "",
        pick("restrictions") ? `Limites: ${pick("restrictions")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const baseInstr = pick("instructions") || form.instructions;
      setForm((prev) => ({
        ...prev,
        name: pick("name") ?? prev.name,
        role: pick("role") ?? prev.role,
        instructions: extras
          ? baseInstr
            ? `${baseInstr}\n\n${extras}`
            : extras
          : baseInstr || prev.instructions,
      }));
      toast({
        kind: "success",
        title: "Configuração aplicada",
        description: "Revise o formulário e crie o agente manualmente.",
      });
    }
    setImportOpen(false);
    setImportPreview(null);
  }

  return (
    <div className="w-full min-w-0 space-y-6">
      <div data-tour="ai-page-header">
        <PageHeader
          title="Agentes"
          description="Configure, teste e acompanhe os agentes de IA antes de colocá-los na operação."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/app/ai/quality"
                className="btn-secondary h-9 px-3 text-xs"
              >
                Qualidade
              </Link>
              <Link
                href="/app/ai/learning"
                className="btn-secondary h-9 px-3 text-xs"
                data-tour="ai-learning-link"
              >
                Aprendizado
              </Link>
              <button
                type="button"
                className="btn-primary"
                data-tour="ai-new-agent"
                onClick={() => setCreateChoiceOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" /> Novo agente
              </button>
            </div>
          }
        />
      </div>

      <AgentCommandCenter
        overview={overview.data}
        isLoading={overview.isLoading}
        hasError={overview.isError}
        search={search}
        onSearchChange={setSearch}
        filter={filter}
        onFilterChange={setFilter}
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="card space-y-3 p-5">
              <div className="flex gap-3">
                <div className="skeleton h-10 w-10 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-1/2" />
                  <div className="skeleton h-3 w-1/3" />
                </div>
              </div>
              <div className="skeleton h-10 w-full" />
              <div className="skeleton h-8 w-full" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          title="Não foi possível carregar os agentes. Tente novamente."
          action={
            <button type="button" className="btn-primary" onClick={() => refetch()}>
              Tentar de novo
            </button>
          }
        />
      ) : !agents.length ? (
        <div data-tour="ai-agents-empty">
          <EmptyState
            icon={<Bot className="h-5 w-5" strokeWidth={1.5} />}
            title="Nenhum agente criado"
            action={
              <button type="button" className="btn-primary" onClick={() => setCreateChoiceOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Criar agente
              </button>
            }
          />
        </div>
      ) : !filteredAgents.length ? (
        <EmptyState
          icon={<Bot className="h-5 w-5" strokeWidth={1.5} />}
          title="Nenhum agente corresponde aos filtros"
          description="Ajuste a busca ou selecione outro filtro para ver seus agentes."
          action={
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setSearch("");
                setFilter("all");
              }}
            >
              Limpar filtros
            </button>
          }
        />
      ) : (
        <div
          data-tour="ai-agents-grid"
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {filteredAgents.map((agent, agentIdx) => {
            const mode = MODE_META[agent.mode] || MODE_META.SUGGEST;
            const summary = agentSummary(agent);
            const awaitingChannel = agent.isActive && !channelConnected;
            const tourPrimary = agentIdx === 0;
            const readiness = readinessByAgent.get(agent.id);

            return (
              <article
                key={agent.id}
                className="card-hover flex min-h-[292px] w-full flex-col p-5"
                {...(tourPrimary ? { "data-tour": "ai-agent-card" } : {})}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500/[0.15] to-violet-500/[0.15] text-brand-600 dark:text-violet-300">
                    <Bot className="h-4 w-4" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-display text-[15px] font-semibold leading-snug text-ink dark:text-white">
                          {agent.name}
                        </h3>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          {agent.role || "Assistente"}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0",
                          agent.isActive ? "badge-success" : "badge-neutral"
                        )}
                      >
                        {agent.isActive ? "Ativo" : "Desativado"}
                      </span>
                    </div>
                    {awaitingChannel && (
                      <p className="mt-1.5 text-[11px] text-ink-faint">
                        Aguardando conexão do WhatsApp
                      </p>
                    )}
                  </div>
                </div>

                <p className="mt-3 line-clamp-2 flex-1 text-[13px] leading-relaxed text-ink-secondary dark:text-gray-300">
                  {summary}
                </p>

                <div
                  className="mt-3 flex flex-wrap items-center gap-1.5"
                  {...(tourPrimary ? { "data-tour": "ai-agent-mode" } : {})}
                >
                  <span className="badge-brand">{mode.label}</span>
                  {agent.currentVersion ? (
                    <span className="badge-neutral">Versão {agent.currentVersion}</span>
                  ) : null}
                  {displayableObjective(agent) ? (
                    <span className="max-w-[12rem] truncate text-[11px] text-ink-faint" title={displayableObjective(agent) || undefined}>
                      {displayableObjective(agent)}
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 rounded-xl border border-line-soft bg-surface-subtle/45 px-3 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.025]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11.5px] font-semibold text-ink-secondary dark:text-gray-300">
                      Prontidão para automático
                    </span>
                    <span
                      className={cn(
                        "text-[11.5px] font-semibold",
                        readiness?.readyForAuto
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-amber-700 dark:text-amber-300"
                      )}
                    >
                      {readiness ? `${readiness.score}%` : "Verificando…"}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width]",
                        readiness?.readyForAuto ? "bg-emerald-500" : "bg-amber-500"
                      )}
                      style={{ width: `${readiness?.score || 0}%` }}
                    />
                  </div>
                  <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-ink-faint">
                    {readiness?.readyForAuto
                      ? "Configuração atual aprovada em todos os controles."
                      : readiness?.blockers[0]?.detail || "Calculando os controles do agente."}
                  </p>
                </div>

                <div
                  className="mt-3 flex items-center gap-2"
                  {...(tourPrimary ? { "data-tour": "ai-agent-actions" } : {})}
                >
                  <button
                    type="button"
                    className="btn-primary h-8 flex-1 text-xs"
                    onClick={() => {
                      setChatAgent(agent);
                      setMessages([]);
                      setLastMeta(null);
                      setChatInput("");
                      setDetailsOpen(false);
                    }}
                  >
                    Testar agente
                  </button>
                  <button
                    type="button"
                    className="btn-secondary h-8 flex-1 text-xs"
                    onClick={() => openEdit(agent)}
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Editar
                  </button>
                  <Dropdown
                    align="right"
                    trigger={
                      <button
                        type="button"
                        className="btn-ghost h-8 w-8 shrink-0 px-0"
                        aria-label="Mais ações"
                      >
                        <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    }
                  >
                    <DropdownItem
                      onClick={() =>
                        patchMutation.mutate({
                          id: agent.id,
                          body: { isActive: !agent.isActive },
                        })
                      }
                    >
                      {agent.isActive ? (
                        <>
                          <Pause className="mr-1.5 inline h-3.5 w-3.5" /> Pausar
                        </>
                      ) : (
                        <>
                          <Play className="mr-1.5 inline h-3.5 w-3.5" /> Ativar
                        </>
                      )}
                    </DropdownItem>
                    <DropdownItem
                      danger
                      onClick={() => {
                        if (
                          window.confirm(
                            `Excluir o agente “${agent.name}”? Esta ação não pode ser desfeita.`
                          )
                        ) {
                          deleteMutation.mutate(agent.id);
                        }
                      }}
                    >
                      <Trash2 className="mr-1.5 inline h-3.5 w-3.5" /> Excluir
                    </DropdownItem>
                  </Dropdown>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Escolha de método de criação */}
      <Modal
        open={createChoiceOpen}
        onClose={() => setCreateChoiceOpen(false)}
        title="Novo agente"
        icon={<Bot className="h-4 w-4" strokeWidth={1.75} />}
        size="md"
        variant="soft"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="btn-secondary h-9"
              onClick={() => setCreateChoiceOpen(false)}
            >
              Cancelar
            </button>
          </DialogFooter>
        }
      >
        <div className="grid gap-2.5">
          <div data-tour="ai-create-wizard">
            <ActionChoiceCard
              accent="violet"
              icon={<Sparkles className="h-4 w-4" strokeWidth={1.75} />}
              title="Criar com assistente"
              description="Guiado."
              onClick={() => {
                setCreateChoiceOpen(false);
                openWizard();
              }}
            />
          </div>
          <div data-tour="ai-create-manual">
            <ActionChoiceCard
              accent="brand"
              icon={<Plus className="h-4 w-4" strokeWidth={1.75} />}
              title="Criar manualmente"
              description="Campos livres."
              onClick={() => {
                setCreateChoiceOpen(false);
                openManual();
              }}
            />
          </div>
          <ActionChoiceCard
            accent="amber"
            icon={<FileUp className="h-4 w-4" strokeWidth={1.75} />}
            title="Importar configuração"
            description="Preenche nome, função e instruções a partir de um arquivo .txt/.md — sem ativar nem alterar tools."
            onClick={() => {
              setCreateChoiceOpen(false);
              openManual();
              window.setTimeout(() => openImportConfig("manual"), 80);
            }}
          />
        </div>
      </Modal>

      {/* ─── Criar manualmente · CONTEXTUAL ─── */}
      <Modal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        title="Criar agente"
        icon={<Bot className="h-4 w-4" strokeWidth={1.75} />}
        size="lg"
        variant="contextual"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="btn-secondary h-9 min-w-[5.5rem] px-3.5"
              onClick={() => setManualOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="nf-manual-agent-form"
              className="btn-primary h-9 px-4 sm:min-w-[8.5rem]"
              disabled={createMutation.isPending || !manualValid}
            >
              {createMutation.isPending ? "Criando…" : "Criar agente"}
            </button>
          </DialogFooter>
        }
      >
        <form
          id="nf-manual-agent-form"
          data-tour="ai-manual-form"
          onSubmit={onCreateManual}
          className="space-y-4"
        >
          <div data-tour="ai-manual-identity">
            <FormSection title="Identidade" surface>
              <FieldGrid>
                <FormField label="Nome" required>
                  <input
                    className="input"
                    value={form.name}
                    onChange={(e) => {
                      setForm({ ...form, name: e.target.value });
                      setManualError("");
                    }}
                    required
                    minLength={2}
                    placeholder="Ex.: Ana"
                  />
                </FormField>
                <FormField label="Função" required>
                  <input
                    className="input"
                    value={form.role}
                    onChange={(e) => {
                      setForm({ ...form, role: e.target.value });
                      setManualError("");
                    }}
                    required
                    minLength={2}
                    placeholder="Ex.: Consultora comercial"
                  />
                </FormField>
              </FieldGrid>
            </FormSection>
          </div>

          <FormSection title="Comportamento" surface>
            <div data-tour="ai-manual-instructions">
              <FormField label="Instruções" htmlFor="manual-instructions" required>
                <textarea
                  id="manual-instructions"
                  className="input min-h-[120px]"
                  value={form.instructions}
                  onChange={(e) => {
                    setForm({ ...form, instructions: e.target.value });
                    setManualError("");
                  }}
                  placeholder="Como responder, o que pode fazer e limites."
                  required
                  minLength={20}
                />
              </FormField>
            </div>
            <div data-tour="ai-manual-mode">
              <FormField label="Modo de resposta" required>
                <Select
                  value={form.mode}
                  onChange={(mode) => {
                    setForm({ ...form, mode });
                    setManualError("");
                  }}
                  options={[
                    { value: "SUGGEST", label: MODE_META.SUGGEST.selectLabel },
                    { value: "APPROVE", label: MODE_META.APPROVE.selectLabel },
                    { value: "AUTO", label: MODE_META.AUTO.selectLabel },
                  ]}
                  aria-label="Modo de resposta"
                />
                {modeHelp && <p className="mt-1.5 text-[11px] text-ink-faint">{modeHelp}</p>}
                {form.mode === "AUTO" && (
                  <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-200/90">
                    <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 opacity-80" strokeWidth={1.75} />
                    Teste o agente antes de usar respostas automáticas.
                  </p>
                )}
              </FormField>
            </div>
          </FormSection>

          {manualError ? (
            <p className="flex items-start gap-1.5 text-[12px] text-red-600 dark:text-red-400">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              {manualError}
            </p>
          ) : null}
        </form>
      </Modal>

      {/* ─── Wizard assistente · WIZARD ─── */}
      <Modal
        open={wizardOpen}
        onClose={() => {
          if (createMutation.isPending) return;
          setWizardOpen(false);
        }}
        title="Criar com assistente"
        description={`Usando dados de ${companyName}${companySegment !== "seu segmento" ? ` · ${companySegment}` : ""}.`}
        icon={<Sparkles className="h-4 w-4" strokeWidth={1.75} />}
        size="xl"
        variant="soft"
        preventClose={createMutation.isPending}
        footer={
          <DialogFooter className="sm:justify-between">
            <button
              type="button"
              className="btn-ghost h-9 px-3"
              disabled={wizard.step === 0 || createMutation.isPending}
              onClick={() => {
                setWizardError("");
                setWizard((w) => ({ ...w, step: Math.max(0, w.step - 1) }));
              }}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Voltar
            </button>
            {wizard.step < WIZARD_STEPS.length - 1 ? (
              <button
                type="button"
                className="btn-primary h-9 px-4 sm:min-w-[8rem]"
                disabled={!canAdvanceWizard()}
                onClick={tryAdvanceWizard}
              >
                Continuar <ChevronRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                type="button"
                className="btn-primary h-9 px-4 sm:min-w-[8.5rem]"
                disabled={!canAdvanceWizard() || createMutation.isPending}
                onClick={tryCreateFromWizard}
              >
                {createMutation.isPending ? "Criando…" : "Criar agente"}
              </button>
            )}
          </DialogFooter>
        }
      >
        <WizardSteps steps={[...WIZARD_STEPS]} current={wizard.step} />

        <div className="min-h-[220px] space-y-4">
          {wizard.step === 0 && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-ink dark:text-white">
                  O que você quer que este agente faça?
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">Pode escolher mais de um objetivo.</p>
              </div>
              <ChipMulti
                options={GOAL_OPTIONS}
                selected={wizard.goals}
                onToggle={(id) => {
                  setWizardError("");
                  setWizard((w) => ({ ...w, goals: toggleIn(w.goals, id) }));
                }}
              />
              {wizard.goals.includes("outro") && (
                <input
                  className="input"
                  placeholder="Descreva o objetivo *"
                  value={wizard.goalOther}
                  onChange={(e) => {
                    setWizardError("");
                    setWizard((w) => ({ ...w, goalOther: e.target.value }));
                  }}
                />
              )}
            </div>
          )}

          {wizard.step === 1 && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-ink dark:text-white">
                  Como ele deve conversar?
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">Escolha o tom principal.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {TONE_OPTIONS.map((t) => {
                  const on = wizard.toneId === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setWizardError("");
                        setWizard((w) => ({ ...w, toneId: t.id }));
                      }}
                      className={cn(
                        "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                        on
                          ? "border-brand-500/40 bg-brand-500/10 text-brand-700 dark:border-brand-400/40 dark:bg-brand-500/[0.15] dark:text-brand-300"
                          : "border-line text-ink-muted dark:border-white/[0.08]"
                      )}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
              {wizard.toneId === "custom" && (
                <input
                  className="input"
                  placeholder="Descreva o tom de voz *"
                  value={wizard.toneCustom}
                  onChange={(e) => {
                    setWizardError("");
                    setWizard((w) => ({ ...w, toneCustom: e.target.value }));
                  }}
                />
              )}
            </div>
          )}

          {wizard.step === 2 && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-ink dark:text-white">
                  O que esse agente precisa conhecer sobre sua empresa?{" "}
                  <span className="text-red-500">*</span>
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Produtos, serviços, planos, preços ou informações importantes. Documentos da Base
                  de Conhecimento também podem ser usados depois.
                </p>
              </div>
              <textarea
                className="input min-h-[140px]"
                placeholder="Ex.: planos, preços, políticas de garantia… *"
                value={wizard.knowledge}
                onChange={(e) => {
                  setWizardError("");
                  setWizard((w) => ({ ...w, knowledge: e.target.value }));
                }}
              />
            </div>
          )}

          {wizard.step === 3 && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-ink dark:text-white">
                  Quando o agente deve chamar alguém da equipe?{" "}
                  <span className="text-red-500">*</span>
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Marque pelo menos uma regra. A IA pausa quando um humano assume.
                </p>
              </div>
              <div className="divide-y divide-black/[0.05] rounded-xl border border-black/[0.06] dark:divide-white/[0.06] dark:border-white/[0.07]">
                {TRANSFER_OPTIONS.map((t) => {
                  const on = wizard.transfers.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setWizardError("");
                        setWizard((w) => ({
                          ...w,
                          transfers: toggleIn(w.transfers, t.id),
                        }));
                      }}
                      className={cn(
                        "flex w-full items-start gap-3 px-3.5 py-2.5 text-left transition",
                        on
                          ? "bg-brand-500/[0.05] dark:bg-brand-500/[0.08]"
                          : "hover:bg-black/[0.015] dark:hover:bg-white/[0.03]"
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-md border",
                          on
                            ? "border-brand-500 bg-brand-500 text-white dark:border-brand-400 dark:bg-brand-400 dark:text-[#0b0c10]"
                            : "border-black/[0.15] dark:border-white/20"
                        )}
                        aria-hidden
                      >
                        {on ? (
                          <span className="text-[10px] font-bold leading-none">✓</span>
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[13px] font-medium text-ink dark:text-white">
                            {t.label}
                          </span>
                          {"recommended" in t && t.recommended ? (
                            <span className="badge-brand text-[10px]">Recomendado</span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-faint">
                          {t.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {wizard.transfers.includes("outro") && (
                <input
                  className="input"
                  placeholder="Descreva a regra personalizada *"
                  value={wizard.transferOther}
                  onChange={(e) => {
                    setWizardError("");
                    setWizard((w) => ({ ...w, transferOther: e.target.value }));
                  }}
                />
              )}
            </div>
          )}

          {wizard.step === 4 && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-ink dark:text-white">
                  O que este agente nunca deve fazer? <span className="text-red-500">*</span>
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Marque limites ou escreva um limite personalizado.
                </p>
              </div>
              <ChipMulti
                options={LIMIT_OPTIONS}
                selected={wizard.limits}
                onToggle={(id) => {
                  setWizardError("");
                  setWizard((w) => ({ ...w, limits: toggleIn(w.limits, id) }));
                }}
              />
              <textarea
                className="input min-h-[72px]"
                placeholder="Limites adicionais (opcional se já marcou acima)"
                value={wizard.limitsCustom}
                onChange={(e) => {
                  setWizardError("");
                  setWizard((w) => ({ ...w, limitsCustom: e.target.value }));
                }}
              />
            </div>
          )}

          {wizard.step === 5 && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">
                    Nome do agente <span className="text-red-500">*</span>
                  </label>
                  <input
                    className="input"
                    value={wizard.name}
                    onChange={(e) => {
                      setWizardError("");
                      setWizard((w) => ({ ...w, name: e.target.value }));
                    }}
                    required
                    minLength={2}
                  />
                </div>
                <div>
                  <label className="label">
                    Modo inicial <span className="text-red-500">*</span>
                  </label>
                  <Select
                    value={wizard.mode}
                    onChange={(mode) => {
                      setWizardError("");
                      setWizard((w) => ({ ...w, mode }));
                    }}
                    options={[
                      { value: "SUGGEST", label: MODE_META.SUGGEST.selectLabel },
                      { value: "APPROVE", label: MODE_META.APPROVE.selectLabel },
                      { value: "AUTO", label: MODE_META.AUTO.selectLabel },
                    ]}
                    aria-label="Modo inicial"
                  />
                </div>
              </div>

              <dl className="space-y-2 rounded-xl border border-line-soft px-3.5 py-3 text-xs dark:border-white/[0.06]">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-faint">Empresa</dt>
                  <dd className="text-right font-medium text-ink dark:text-gray-200">
                    {companyName}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-faint">Função</dt>
                  <dd className="text-right font-medium text-ink dark:text-gray-200">
                    {suggestRole(wizard.goals)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-faint">Tom</dt>
                  <dd className="text-right font-medium text-ink dark:text-gray-200">{reviewTone}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-faint">Objetivos</dt>
                  <dd className="max-w-[60%] text-right font-medium text-ink dark:text-gray-200">
                    {GOAL_OPTIONS.filter((g) => wizard.goals.includes(g.id))
                      .map((g) => g.label)
                      .join(", ") || "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-faint">Transferência</dt>
                  <dd className="max-w-[60%] text-right font-medium text-ink dark:text-gray-200">
                    {wizard.transfers.length
                      ? `${wizard.transfers.length} regra(s)`
                      : "Padrão"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-faint">Limites</dt>
                  <dd className="max-w-[60%] text-right font-medium text-ink dark:text-gray-200">
                    {wizard.limits.length + (wizard.limitsCustom.trim() ? 1 : 0)} definido(s)
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </div>

        {wizardError ? (
          <p className="mt-3 flex items-start gap-1.5 text-[12px] text-red-600 dark:text-red-400">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            {wizardError}
          </p>
        ) : null}
      </Modal>

      {/* ─── Central do agente · CONTEXTUAL ─── */}
      <Modal
        open={!!editAgent}
        onClose={() => setEditAgent(null)}
        title={editAgent ? editAgent.name : "Agente"}
        description={
          editAgent
            ? `${editAgent.role || "Assistente"} · ${
                editForm.isActive
                  ? MODE_META[editForm.mode]?.label || editForm.mode
                  : "Desativado"
              }`
            : undefined
        }
        icon={<Pencil className="h-4 w-4" strokeWidth={1.75} />}
        size="lg"
        variant="contextual"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="btn-secondary h-9 min-w-[5.5rem] px-3.5"
              onClick={() => setEditAgent(null)}
              disabled={saveEditMutation.isPending}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="nf-edit-agent-form"
              className="btn-primary h-9 px-4 sm:min-w-[9rem]"
              disabled={saveEditMutation.isPending || editForm.name.trim().length < 2}
            >
              {saveEditMutation.isPending ? "Salvando…" : "Salvar"}
            </button>
          </DialogFooter>
        }
      >
        <form
          id="nf-edit-agent-form"
          data-tour="ai-edit-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            saveEditMutation.mutate();
          }}
        >
          <div
            data-tour="ai-edit-tabs"
            className="flex flex-wrap gap-1 border-b border-line pb-2 dark:border-white/[0.06]"
            role="tablist"
            aria-label="Seções do agente"
          >
            {(
              [
                { id: "geral", label: "Geral" },
                { id: "comportamento", label: "Comportamento" },
                { id: "handoff", label: "Handoff" },
                { id: "ferramentas", label: "Ferramentas" },
                { id: "conhecimento", label: "Conhecimento" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={editTab === t.id}
                data-tour={`ai-edit-tab-${t.id}`}
                onClick={() => setEditTab(t.id)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
                  editTab === t.id
                    ? "bg-brand-500/[0.15] text-brand-700 ring-1 ring-inset ring-brand-500/20 dark:bg-brand-500/[0.18] dark:text-brand-200"
                    : "text-ink-muted hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {editTab === "geral" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-black/[0.05] bg-black/[0.015] px-3.5 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.025]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-faint">
                  Veracidade e segurança
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
                  Só usa informações confiáveis. Se não souber, não inventa.
                </p>
              </div>
              <FormSection title="Aprendizado contínuo" surface>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-ink dark:text-white">
                      Aprendizado contínuo
                    </p>
                    <p className="mt-0.5 text-[12px] text-ink-faint">
                      {(company.data?.settings?.continuousLearning as { enabled?: boolean } | undefined)
                        ?.enabled === true
                        ? "Ativo na empresa. Pode desligar neste agente."
                        : "Desligado na empresa (Configurações → IA)."}
                    </p>
                  </div>
                  <Switch
                    size="sm"
                    checked={editForm.continuousLearning}
                    disabled={
                      (company.data?.settings?.continuousLearning as { enabled?: boolean } | undefined)
                        ?.enabled !== true
                    }
                    aria-label="Participar do aprendizado contínuo"
                    onChange={(continuousLearning) =>
                      setEditForm({ ...editForm, continuousLearning })
                    }
                  />
                </div>
                {(company.data?.settings?.continuousLearning as { enabled?: boolean } | undefined)
                  ?.enabled !== true ? (
                  <p className="mt-2 text-[11px] text-ink-faint">
                    <Link href="/app/settings" className="text-brand-600 underline-offset-2 hover:underline dark:text-brand-400">
                      Abrir Configurações → IA
                    </Link>
                  </p>
                ) : null}
              </FormSection>
              <FormSection title="Encerramento automático" surface>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-ink dark:text-white">
                      Encerramento automático
                    </p>
                    <p className="mt-0.5 text-[12px] text-ink-faint">
                      Depende de Configurações → Atendimento.
                    </p>
                  </div>
                  <Switch
                    size="sm"
                    checked={editForm.autoClose}
                    aria-label="Permitir encerramento inteligente"
                    onChange={(autoClose) => setEditForm({ ...editForm, autoClose })}
                  />
                </div>
              </FormSection>
              <div data-tour="ai-edit-identity">
                <FormSection title="Identidade" surface>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[12px] text-ink-faint">
                      Nome, função e objetivo. Separado de conhecimento e ferramentas.
                    </p>
                    <button
                      type="button"
                      className="btn-secondary h-8 px-2.5 text-[12px]"
                      onClick={() => openImportConfig("edit")}
                    >
                      <FileUp className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Importar configuração
                    </button>
                  </div>
                  <FieldGrid>
                    <FormField label="Nome" required>
                      <input
                        className="input"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        required
                      />
                    </FormField>
                    <FormField label="Função">
                      <input
                        className="input"
                        value={editForm.role}
                        onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                        placeholder="Ex.: Consultora comercial"
                      />
                    </FormField>
                  </FieldGrid>
                  <FormField label="Objetivo">
                    <textarea
                      className="input min-h-[72px] text-[13px]"
                      value={editForm.objective}
                      onChange={(e) => setEditForm({ ...editForm, objective: e.target.value })}
                      placeholder="O que este agente deve alcançar"
                    />
                  </FormField>
                </FormSection>
              </div>
              <div data-tour="ai-edit-mode">
                <FormSection title="Operação" surface>
                <FieldGrid>
                  <FormField label="Modo">
                    <Select
                      value={editForm.mode}
                      onChange={(mode) => setEditForm({ ...editForm, mode })}
                      options={[
                        { value: "SUGGEST", label: MODE_META.SUGGEST.selectLabel },
                        { value: "APPROVE", label: MODE_META.APPROVE.selectLabel },
                        { value: "AUTO", label: MODE_META.AUTO.selectLabel },
                      ]}
                      aria-label="Modo"
                    />
                    {editModeHelp ? (
                      <p className="mt-1.5 text-[11px] text-ink-faint">{editModeHelp}</p>
                    ) : null}
                  </FormField>
                  <FormField label="Status">
                    <Select
                      value={editForm.isActive ? "active" : "paused"}
                      onChange={(v) =>
                        setEditForm({ ...editForm, isActive: v === "active" })
                      }
                      options={[
                        { value: "active", label: "Ativo" },
                        { value: "paused", label: "Desativado" },
                      ]}
                      aria-label="Status"
                    />
                  </FormField>
                </FieldGrid>
                {editForm.mode === "AUTO" && editForm.isActive ? (
                  <p className="flex items-start gap-1.5 text-[11px] text-amber-800 dark:text-amber-200">
                    <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.75} />
                    Teste no sandbox antes de deixar em automático.
                  </p>
                ) : null}
                <p className="text-[12px] text-ink-faint">
                  Modelo: <span className="font-medium text-ink-muted">Gerenciado pela NexaFlow</span>
                </p>
              </FormSection>
              </div>
            </div>
          )}

          {editTab === "comportamento" && (
            <div className="space-y-4" data-tour="ai-edit-behavior">
              <FormSection title="Personalidade" surface>
                <FieldGrid>
                  <FormField label="Tom">
                    <input
                      className="input w-full min-w-0"
                      value={editForm.tone}
                      onChange={(e) => setEditForm({ ...editForm, tone: e.target.value })}
                      placeholder="Ex.: profissional e próximo"
                    />
                  </FormField>
                  <FormField label="Personalidade">
                    <input
                      className="input w-full min-w-0"
                      value={editForm.personality}
                      onChange={(e) =>
                        setEditForm({ ...editForm, personality: e.target.value })
                      }
                      placeholder="Ex.: consultiva e objetiva"
                    />
                  </FormField>
                </FieldGrid>
              </FormSection>
              <FormSection title="Como deve agir" surface>
                <FormField
                  label="Comportamento"
                >
                  <textarea
                    className="input min-h-[140px] w-full text-[13px] leading-relaxed"
                    value={editForm.instructions}
                    onChange={(e) =>
                      setEditForm({ ...editForm, instructions: e.target.value })
                    }
                    placeholder="Ex.: Faça uma pergunta por vez. Entenda o tamanho da equipe antes de recomendar um plano."
                  />
                </FormField>
              </FormSection>
              <FormSection title="Limites da empresa" surface>
                <FormField
                  label="O que não pode fazer"
                >
                  <textarea
                    className="input min-h-[88px] w-full text-[13px] leading-relaxed"
                    value={editForm.restrictions}
                    onChange={(e) =>
                      setEditForm({ ...editForm, restrictions: e.target.value })
                    }
                    placeholder="Ex.: Não oferecer desconto sem autorização. Não prometer prazo de implantação."
                  />
                </FormField>
              </FormSection>
            </div>
          )}

          {editTab === "handoff" && (
            <div data-tour="ai-edit-handoff" className="space-y-4">
              <div className="rounded-xl border border-black/[0.05] bg-black/[0.015] px-3.5 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.025]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-faint">
                  Transferência para humano
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
                  Defina quando a IA deve parar e chamar a equipe. A conversa fica na fila
                  até alguém assumir — sem inventar respostas quando faltar informação.
                </p>
              </div>

              <FormSection title="Quando transferir" surface>
                <div
                  className="divide-y divide-black/[0.05] rounded-xl border border-black/[0.06] dark:divide-white/[0.06] dark:border-white/[0.07]"
                  role="group"
                  aria-label="Regras de handoff"
                >
                  {TRANSFER_OPTIONS.map((t) => {
                    const on = editForm.transfers.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() =>
                          setEditForm({
                            ...editForm,
                            transfers: toggleIn(editForm.transfers, t.id),
                          })
                        }
                        className={cn(
                          "flex w-full items-start gap-3 px-3.5 py-2.5 text-left transition",
                          on
                            ? "bg-brand-500/[0.05] dark:bg-brand-500/[0.08]"
                            : "hover:bg-black/[0.015] dark:hover:bg-white/[0.03]"
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-md border",
                            on
                              ? "border-brand-500 bg-brand-500 text-white dark:border-brand-400 dark:bg-brand-400 dark:text-[#0b0c10]"
                              : "border-black/[0.15] dark:border-white/20"
                          )}
                          aria-hidden
                        >
                          {on ? (
                            <span className="text-[10px] font-bold leading-none">✓</span>
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[13px] font-medium text-ink dark:text-white">
                              {t.label}
                            </span>
                            {"recommended" in t && t.recommended ? (
                              <span className="badge-brand text-[10px]">Recomendado</span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-faint">
                            {t.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {editForm.transfers.includes("outro") ? (
                  <FormField
                    label="Regra personalizada"
                    className="mt-3"
                    hint="Salva junto às demais regras de handoff."
                  >
                    <input
                      className="input"
                      placeholder="Ex.: Cliente mencionar integração ERP"
                      value={editForm.transferOther}
                      onChange={(e) =>
                        setEditForm({ ...editForm, transferOther: e.target.value })
                      }
                    />
                  </FormField>
                ) : null}
                {!editForm.transfers.length ? (
                  <p className="mt-2 text-[12px] text-amber-700 dark:text-amber-200">
                    Selecione ao menos uma regra. Sem regras, o padrão seguro (humano / não
                    sabe) será usado.
                  </p>
                ) : null}
              </FormSection>

              <FormSection title="Destino do handoff" surface>
                <div className="grid gap-2" role="radiogroup" aria-label="Destino">
                  {HANDOFF_DESTINATION_OPTIONS.map((d) => {
                    const selected = editForm.destination === d.id;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setEditForm({ ...editForm, destination: d.id })}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                          selected
                            ? "border-brand-500/[0.35] bg-brand-500/[0.06] dark:border-brand-400/[0.35] dark:bg-brand-500/10"
                            : "border-black/[0.06] bg-white hover:border-black/[0.1] dark:border-white/[0.08] dark:bg-[#12141A] dark:hover:bg-white/[0.03]"
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                            selected
                              ? "border-brand-500 bg-brand-500 dark:border-brand-400 dark:bg-brand-400"
                              : "border-black/[0.15] dark:border-white/20"
                          )}
                          aria-hidden
                        >
                          {selected ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-white dark:bg-[#0b0c10]" />
                          ) : null}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-medium text-ink dark:text-white">
                            {d.label}
                          </span>
                          <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-faint">
                            {d.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </FormSection>

              <FormSection title="Mensagem ao transferir" surface>
                <FormField
                  label="Texto opcional"
                  hint="Se vazio, o agente usa uma mensagem natural padrão."
                >
                  <textarea
                    className="input min-h-[72px]"
                    placeholder="Ex.: Vou te conectar com um especialista da equipe agora."
                    value={editForm.handoffMessage}
                    onChange={(e) =>
                      setEditForm({ ...editForm, handoffMessage: e.target.value })
                    }
                    maxLength={400}
                  />
                </FormField>
              </FormSection>
            </div>
          )}

          {editTab === "ferramentas" && (
            <FormSection title="Permissões" surface>
              <div className="divide-y divide-black/[0.05] rounded-xl border border-black/[0.05] dark:divide-white/[0.06] dark:border-white/[0.06]">
                {TOOL_OPTIONS.map((t) => {
                  const on = editForm.tools.includes(t.id);
                  return (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                    >
                      <div className="min-w-0">
                        <Tooltip content={t.description} side="top" delay={200}>
                          <span className="cursor-help text-[13px] font-medium text-ink underline decoration-dotted decoration-ink-faint/50 underline-offset-2 dark:text-gray-100">
                            {t.label}
                          </span>
                        </Tooltip>
                      </div>
                      <Switch
                        size="sm"
                        checked={on}
                        aria-label={t.label}
                        onChange={(value) =>
                          setEditForm({
                            ...editForm,
                            tools: value
                              ? editForm.tools.includes(t.id)
                                ? editForm.tools
                                : [...editForm.tools, t.id]
                              : editForm.tools.filter((id) => id !== t.id),
                          })
                        }
                      />
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-[12px] text-ink-faint">
                Menor privilégio: ative só o necessário. Excluir dados, usuários, assinaturas
                e pagamentos permanecem bloqueados pela NexaFlow.
              </p>
            </FormSection>
          )}

          {editTab === "conhecimento" && (
            <FormSection
              title="Conhecimentos disponíveis"
              surface
            >
              {agentKnowledge.isLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              ) : !agentKnowledge.data?.length ? (
                <div className="rounded-xl border border-dashed border-black/[0.08] px-4 py-5 dark:border-white/[0.08]">
                  <p className="text-sm text-ink-muted">
                    Nenhum conhecimento pronto disponível para este agente.
                  </p>
                  <Link href="/app/knowledge" className="btn-primary mt-3 inline-flex h-9 px-4">
                    Abrir base de conhecimento
                  </Link>
                </div>
              ) : (
                <>
                  <ul className="divide-y divide-black/[0.04] rounded-xl border border-black/[0.05] dark:divide-white/[0.06] dark:border-white/[0.06]">
                    {agentKnowledge.data.slice(0, 12).map((k) => (
                      <li key={k.id} className="px-3.5 py-2.5">
                        <p className="text-[13px] font-medium text-ink dark:text-white">
                          {k.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-ink-faint">
                          {k.statusLabel || k.status || "Pronto"}
                          {k.category ? ` · ${k.category}` : ""}
                          {k.sourceLabel ? ` · ${k.sourceLabel}` : ""}
                          {k.scope === "all" ? " · Todos os agentes" : " · Vinculado"}
                        </p>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/app/knowledge"
                    className="btn-secondary mt-3 inline-flex h-8 px-3 text-xs"
                  >
                    Gerenciar vínculos na base
                  </Link>
                </>
              )}
            </FormSection>
          )}
        </form>
      </Modal>

      {/* ─── Importar configuração do agente ─── */}
      <Modal
        open={importOpen}
        onClose={() => {
          if (importBusy) return;
          setImportOpen(false);
          setImportPreview(null);
          setImportError("");
        }}
        title="Importar configuração do agente"
        description="Importe um arquivo com a identidade e as instruções do agente para preencher nome, função, objetivo, tom, personalidade, comportamento e limites."
        size="md"
        variant="contextual"
        preventClose={importBusy}
        footer={
          <DialogFooter>
            <button
              type="button"
              className="btn-secondary h-9"
              disabled={importBusy}
              onClick={() => {
                setImportOpen(false);
                setImportPreview(null);
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary h-9"
              disabled={
                importBusy ||
                !importPreview ||
                !Object.values(importSelected).some(Boolean)
              }
              onClick={() => applyImportConfig()}
            >
              Aplicar configuração
            </button>
          </DialogFooter>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-black/[0.05] bg-black/[0.015] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-muted dark:border-white/[0.06] dark:bg-white/[0.025]">
            Preenche só a identidade e o comportamento.{" "}
            <strong className="font-medium text-ink-secondary dark:text-gray-300">
              Não altera
            </strong>{" "}
            modo, ferramentas, handoff, conhecimento nem ativa o agente. Você revisa e salva
            manualmente.
          </div>

          <FormField label="Arquivo (.txt ou .md)">
            <input
              type="file"
              accept=".txt,.md,.markdown,text/plain,text/markdown"
              className="block w-full text-[13px] text-ink-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand-500/10 file:px-3 file:py-1.5 file:text-[12.5px] file:font-medium file:text-brand-700 dark:file:text-brand-200"
              disabled={importBusy}
              onChange={(e) => void onImportFile(e.target.files?.[0] || null)}
            />
          </FormField>

          {importBusy ? (
            <div className="flex items-center gap-2 text-[13px] text-ink-faint">
              <Spinner className="h-4 w-4" /> Lendo e extraindo campos…
            </div>
          ) : null}

          {importError ? (
            <p
              role="alert"
              className="rounded-xl border border-red-500/20 bg-red-500/5 px-3.5 py-2.5 text-sm text-red-600 dark:text-red-300"
            >
              {importError}
            </p>
          ) : null}

          {importPreview?.warnings?.length ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3.5 py-2.5 text-[12.5px] text-amber-900 dark:text-amber-100">
              {importPreview.warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
              {importPreview.ignoredOperationalHints?.length ? (
                <p className="mt-1 text-[11.5px] opacity-80">
                  Ignorado: {importPreview.ignoredOperationalHints.join(", ")}.
                </p>
              ) : null}
            </div>
          ) : null}

          {importPreview ? (
            <div className="space-y-2">
              <p className="text-[12px] font-medium text-ink dark:text-white">
                Pré-visualização — escolha o que aplicar
              </p>
              {IMPORT_FIELD_META.map(({ key, label }) => {
                const value = (importPreview.form?.[key] || "").trim();
                if (!value) return null;
                const checked = Boolean(importSelected[key]);
                return (
                  <label
                    key={key}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition",
                      checked
                        ? "border-brand-500/30 bg-brand-500/[0.05] dark:border-brand-400/30"
                        : "border-black/[0.06] dark:border-white/[0.08]"
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={(e) =>
                        setImportSelected((s) => ({ ...s, [key]: e.target.checked }))
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-medium text-ink dark:text-white">
                        {label}
                      </span>
                      <span className="mt-0.5 block whitespace-pre-wrap text-[12px] leading-relaxed text-ink-muted">
                        {value}
                      </span>
                    </span>
                  </label>
                );
              })}
              {!IMPORT_FIELD_META.some(
                ({ key }) => (importPreview.form?.[key] || "").trim()
              ) ? (
                <p className="text-[12.5px] text-ink-faint">
                  Nenhum campo permitido identificado no arquivo.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </Modal>

      {/* ─── Sandbox de teste · SANDBOX ─── */}
      <Modal
        open={!!chatAgent}
        onClose={() => setChatAgent(null)}
        title={chatAgent ? `Testar · ${chatAgent.name}` : "Testar agente"}
        description="Nenhuma mensagem é enviada a clientes."
        size="lg"
        variant="sandbox"
      >
        <div className="flex min-h-[min(420px,calc(100dvh-14rem))] flex-1 flex-col">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            {chatAgent && (
              <span className="badge-neutral">
                {MODE_META[chatAgent.mode]?.label || chatAgent.mode}
              </span>
            )}
            <span className="badge-brand">Sandbox</span>
            {lastMeta?.passed === true ? (
              <span className="badge-success">Teste aprovado</span>
            ) : lastMeta?.passed === false ? (
              <span className="badge-warning">Teste não aprovado</span>
            ) : null}
            {lastMeta && (
              <button
                type="button"
                className="text-[11px] font-medium text-brand-600 hover:underline dark:text-brand-400"
                onClick={() => setDetailsOpen((v) => !v)}
              >
                {detailsOpen ? "Ocultar detalhes" : "Detalhes do teste"}
              </button>
            )}
          </div>

          {detailsOpen && lastMeta && (
            <div className="mb-2.5 rounded-xl border border-line-soft bg-surface-subtle/50 px-3 py-2 text-[11px] text-ink-muted dark:border-white/[0.06] dark:bg-white/[0.03]">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
                {lastMeta.model ? (
                  <div>
                    <dt className="text-ink-faint">Modelo</dt>
                    <dd className="font-medium text-ink-secondary dark:text-gray-300">
                      {modelDisplayName(lastMeta.model)}
                    </dd>
                  </div>
                ) : null}
                {lastMeta.provider ? (
                  <div>
                    <dt className="text-ink-faint">Provedor</dt>
                    <dd className="font-medium text-ink-secondary dark:text-gray-300">
                      {lastMeta.provider}
                    </dd>
                  </div>
                ) : null}
                {lastMeta.durationMs != null ? (
                  <div>
                    <dt className="text-ink-faint">Tempo</dt>
                    <dd className="font-medium text-ink-secondary dark:text-gray-300">
                      {lastMeta.durationMs} ms
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line-soft bg-gradient-to-b from-surface-muted/50 to-transparent dark:border-white/[0.07] dark:from-white/[0.03]">
            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3 sm:p-4">
              {messages.length === 0 && !chatMutation.isPending ? (
                <div className="flex h-full min-h-[200px] flex-col items-center justify-center px-2 py-6 text-center">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
                    <Bot className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <p className="text-sm font-medium text-ink dark:text-white">
                    Conversa de teste com {chatAgent?.name || "o agente"}
                  </p>
                  <p className="mt-1 max-w-xs text-xs text-ink-muted">
                    Simule o cliente. Escolha uma sugestão ou digite livremente.
                  </p>
                  <div className="mt-4 flex w-full max-w-sm flex-col gap-1.5">
                    {SANDBOX_SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="rounded-xl border border-line bg-white/90 px-3 py-2.5 text-left text-[12px] text-ink-secondary transition-colors hover:border-brand-400/40 hover:bg-brand-500/[0.04] dark:border-white/[0.08] dark:bg-[#14171e] dark:text-gray-300 dark:hover:bg-white/[0.04]"
                        onClick={() => {
                          if (chatMutation.isPending) return;
                          chatMutation.mutate(s);
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed",
                        m.role === "user"
                          ? "ml-auto bg-brand-600 text-white shadow-sm"
                          : "mr-auto border border-line bg-white text-ink dark:border-white/[0.08] dark:bg-[#1a1f29] dark:text-gray-100"
                      )}
                    >
                      {m.role === "assistant" ? (
                        <NiaMarkdown content={m.content} />
                      ) : (
                        <span className="whitespace-pre-wrap">{m.content}</span>
                      )}
                    </div>
                  ))}
                  {chatMutation.isPending && (
                    <div className="mr-auto inline-flex items-center gap-2 rounded-2xl border border-line bg-white px-3.5 py-2 text-xs text-ink-faint dark:border-white/[0.08] dark:bg-[#1a1f29]">
                      <Spinner className="h-3.5 w-3.5" /> Gerando resposta…
                    </div>
                  )}
                </>
              )}
            </div>

            <form
              className="flex shrink-0 gap-2 border-t border-line-soft/80 p-3 dark:border-white/[0.06]"
              onSubmit={(e) => {
                e.preventDefault();
                if (!chatInput.trim() || chatMutation.isPending) return;
                chatMutation.mutate(chatInput.trim());
              }}
            >
              <input
                className="input"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Digite como se fosse o cliente…"
                aria-label="Mensagem de teste"
              />
              <button
                type="submit"
                className="btn-primary h-9 shrink-0 px-4"
                disabled={chatMutation.isPending || !chatInput.trim()}
              >
                Enviar
              </button>
            </form>
          </div>
        </div>
      </Modal>
    </div>
  );
}
