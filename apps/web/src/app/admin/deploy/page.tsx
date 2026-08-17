"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  GitBranch,
  GitCommit,
  HelpCircle,
  History,
  Info,
  KeyRound,
  Layers,
  Loader2,
  RefreshCw,
  Rocket,
  RotateCcw,
  Server,
  Settings,
  Sparkles,
  Terminal,
  Trash2,
  XCircle,
} from "lucide-react";
import { api, isSuperadminMfaRequiredError } from "@/lib/api";
import { formatDate, formatRelativeTime, cn } from "@/lib/utils";
import { useAuth } from "@/store/auth";
import {
  AdminErrorState,
  AdminPageHeader,
  AdminPageSkeleton,
  AdminSection,
  MetricCard,
  MetricGrid,
  StatusBadge,
} from "@/components/admin";
import { DialogFooter, FormField, Modal, useToast } from "@/components/ui";
import { ActionMenu } from "@/components/ui-menu";

type EasyPanelState = "CONNECTED" | "NOT_CONFIGURED" | "AUTH_FAILED" | "UNAVAILABLE" | "CHECKING";

type DeploymentStatus =
  | "PENDING"
  | "PREPARING"
  | "BUILDING"
  | "DEPLOYING"
  | "VALIDATING"
  | "COMPLETED"
  | "FAILED";

type DeployOverviewResponse = {
  environment: string;
  isOnline: boolean;
  healthState: "HEALTHY" | "VALIDATING" | "DEGRADED" | "UNKNOWN";
  status: "UP_TO_DATE" | "UPDATE_AVAILABLE" | "DEPLOYING" | "UNKNOWN";
  currentCommit: {
    sha: string;
    shortSha: string;
    message: string;
    author: string;
    deployedAt: string | null;
    deployedBy: string | null;
    isKnown: boolean;
  } | null;
  latestGitHubCommit: {
    sha: string;
    shortSha: string;
    message: string;
    author: string;
    date: string;
    url?: string;
  } | null;
  gitHub: {
    connected: boolean;
    owner: string;
    repo: string;
    branch: string;
    tokenConfigured?: boolean;
    rateLimit?: {
      limit: number;
      remaining: number;
      resetAt: string | null;
      resetEpochMs: number | null;
      isRateLimited: boolean;
      retryAfterSeconds?: number;
    };
    error?: string;
  };
  easyPanel: {
    state: EasyPanelState;
    connected: boolean;
    url?: string;
    projectName: string;
    serviceName: string;
    serviceType: string;
    hasUrl: boolean;
    hasToken: boolean;
    error?: string;
  };
  activeDeployment: {
    id: string;
    status: DeploymentStatus;
    stage: DeploymentStatus;
    branch: string;
    commitShortSha: string;
    commitMessage: string;
    startedAt: string;
    startedByName: string;
    durationSeconds: number;
    healthStatus: string;
  } | null;
};

type GitHubCommitItem = {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string;
  url?: string;
};

type GitHubConfigResponse = {
  configured: boolean;
  owner: string;
  repo: string;
  branch: string;
  tokenConfigured: boolean;
  rateLimit: {
    limit: number;
    remaining: number;
    resetAt: string | null;
    isRateLimited: boolean;
  };
};

type TestGitHubConnectionResponse = {
  success: boolean;
  message: string;
  state: "CONNECTED" | "NOT_CONFIGURED" | "AUTH_FAILED" | "NOT_FOUND" | "RATE_LIMITED" | "UNAVAILABLE";
  details?: {
    authenticated: boolean;
    repoFound: boolean;
    branchFound: boolean;
  };
  rateLimit?: {
    limit: number;
    remaining: number;
    resetAt: string | null;
    isRateLimited: boolean;
  };
  latestCommit?: GitHubCommitItem;
};

type EasyPanelConfigResponse = {
  configured: boolean;
  url: string;
  projectName: string;
  serviceName: string;
  tokenConfigured: boolean;
};

type TestConnectionResponse = {
  success: boolean;
  message: string;
  state: EasyPanelState;
  details?: {
    urlAccessible: boolean;
    authValid: boolean;
    projectFound: boolean;
    serviceFound: boolean;
  };
};

type HistoryItem = {
  id: string;
  environment: string;
  branch: string;
  commitSha: string;
  commitShortSha: string;
  commitMessage: string;
  commitAuthor?: string;
  startedBy: string;
  startedByEmail?: string;
  status: DeploymentStatus;
  startedAt: string;
  finishedAt?: string;
  durationSeconds?: number;
  errorSummary?: string;
  healthStatus?: string;
  isRollback?: boolean;
  rollbackFromSha?: string;
};

type DeploymentDetail = {
  id: string;
  environment: string;
  branch: string;
  commitSha: string;
  commitShortSha: string;
  commitMessage: string;
  commitAuthor?: string;
  startedBy: string;
  startedByEmail?: string;
  status: DeploymentStatus;
  stage: DeploymentStatus;
  services: string[];
  startedAt: string;
  finishedAt?: string;
  durationSeconds?: number;
  errorSummary?: string;
  logs: string;
  logOffset?: number;
  isFinished?: boolean;
  healthStatus?: string;
  apiHealth?: string;
  webHealth?: string;
  healthCheckedAt?: string;
  isRollback?: boolean;
  rollbackFromSha?: string;
};

const STAGES: Array<{ id: DeploymentStatus; label: string }> = [
  { id: "PREPARING", label: "Preparando" },
  { id: "BUILDING", label: "Compilando" },
  { id: "DEPLOYING", label: "Implantando" },
  { id: "VALIDATING", label: "Verificando" },
];

function getStageIndex(status: DeploymentStatus): number {
  switch (status) {
    case "PENDING":
    case "PREPARING":
      return 0;
    case "BUILDING":
      return 1;
    case "DEPLOYING":
      return 2;
    case "VALIDATING":
      return 3;
    case "COMPLETED":
      return 4;
    case "FAILED":
      return -1;
    default:
      return 0;
  }
}

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) {
    return `${m}m ${s.toString().padStart(2, "0")}s`;
  }
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h ${remM.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
}

function useLiveElapsedSeconds(
  startedAt?: string | Date | null,
  isFinished?: boolean,
  fallbackSeconds?: number
): number {
  const [elapsed, setElapsed] = useState<number>(() => {
    if (isFinished && typeof fallbackSeconds === "number") return fallbackSeconds;
    if (!startedAt) return fallbackSeconds || 0;
    const startMs = new Date(startedAt).getTime();
    if (isNaN(startMs)) return fallbackSeconds || 0;
    return Math.max(0, Math.floor((Date.now() - startMs) / 1000));
  });

  useEffect(() => {
    if (isFinished) {
      if (typeof fallbackSeconds === "number") {
        setElapsed(fallbackSeconds);
      }
      return;
    }

    if (!startedAt) {
      setElapsed(fallbackSeconds || 0);
      return;
    }

    const startMs = new Date(startedAt).getTime();
    if (isNaN(startMs)) {
      setElapsed(fallbackSeconds || 0);
      return;
    }

    // Atualiza imediatamente
    setElapsed(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));

    // Timer preciso de 1 segundo para contagem fluida em tempo real
    const interval = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    }, 1000);

    return () => clearInterval(interval);
  }, [startedAt, isFinished, fallbackSeconds]);

  return elapsed;
}

function deployStatusTone(st: DeploymentStatus): "brand" | "neutral" | "success" | "warning" | "danger" {
  switch (st) {
    case "COMPLETED":
      return "success";
    case "FAILED":
      return "danger";
    case "BUILDING":
    case "DEPLOYING":
    case "VALIDATING":
      return "brand";
    case "PREPARING":
    case "PENDING":
      return "warning";
    default:
      return "neutral";
  }
}

function deployStatusLabel(st: DeploymentStatus): string {
  switch (st) {
    case "COMPLETED":
      return "Concluído";
    case "FAILED":
      return "Falhou";
    case "BUILDING":
      return "Compilando";
    case "DEPLOYING":
      return "Implantando";
    case "VALIDATING":
      return "Verificando";
    case "PREPARING":
      return "Preparando";
    case "PENDING":
      return "Aguardando";
    default:
      return st;
  }
}

function healthStatusLabel(status: DeploymentStatus, health?: string): string {
  if (status === "COMPLETED" || health === "HEALTHY") {
    return "Saudável";
  }
  if (status === "VALIDATING" || health === "VERIFYING") {
    return "Verificando";
  }
  if (status === "FAILED") {
    return health === "UNHEALTHY" ? "Falhou na validação" : "Falhou";
  }
  return "Aguardando validação";
}

/**
 * Converte mensagens de commit técnicas/em inglês para descrições elegantes e claras em Português (pt-BR)
 */
function formatCommitMessagePtBr(rawMessage?: string | null): string {
  if (!rawMessage || !rawMessage.trim()) return "Sem descrição informada";

  const msg = rawMessage.trim();

  // Dicionário exato de todas as mensagens conhecidas e recentes do repositório
  const directTranslations: Record<string, string> = {
    "Deploy manual de versão": "Deploy manual de versão",
    "Deploy automático da branch main": "Deploy automático da branch main",
    "Initial commit": "Commit inicial do projeto",
  };

  if (directTranslations[msg]) {
    return directTranslations[msg];
  }

  // Traduções específicas de cada commit do projeto
  const commitDictionary: Array<[RegExp, string]> = [
    [/style\(deploy\):\s*adjust auto-scroll indicator spacing and subtle pill badge/i, "Ajuste visual: espaçamento do auto-scroll e novo micro-badge dos logs"],
    [/feat\(deploy\):\s*replace integrations dropdown with compact dedicated modal/i, "Integrações: substituição do menu dropdown por modal dedicado e compacto"],
    [/feat\(deploy\):\s*center comparison arrow with symmetric grid and translate all commit descriptions to pt-BR/i, "Interface: centralização geométrica da seta no grid e tradução de versões para pt-BR"],
    [/refactor\(deploy\):\s*refine active deploy state,\s*remove redundant status badge and harmonize version comparison/i, "Refatoração: refinamento do estado de deploy ativo e harmonização da comparação de versões"],
    [/fix\(deploy\):\s*prevent whole-page unmount on transient network drop during container restart and increase retry tolerance/i, "Correção de rede: previne desmontagem de tela na reinicialização de containers com reconexão automática"],
    [/feat\(deploy\):\s*real-time automatic deployment status tracking,\s*live logs,\s*visibility-aware polling and post-deploy auto-sync/i, "Monitoramento em tempo real: logs ao vivo, polling inteligente por aba e sincronização pós-deploy"],
    [/feat\(deploy\):\s*final refinement of deployment details modal UX,\s*timeline,\s*log columns,\s*auto-scroll and health state consistency/i, "Modal de detalhes: timeline contínua, logs operacionais em 3 colunas e validação de saúde"],
    [/feat\(deploy\):\s*final polish of deployment details modal,\s*live stepper,\s*strict health validation and 3-column logs/i, "Modal de detalhes: timeline ao vivo, validação estrita de integridade e logs em 3 colunas"],
    [/feat\(deploy\):\s*unify header controls into Integrações dropdown and Buscar atualizações action/i, "Controles do cabeçalho: unificação dos botões de integração e busca de atualizações"],
    [/feat\(deploy\):\s*refine deploy header controls with dropdown integrations menu and updates sync/i, "Controles do cabeçalho: menu de integrações e sincronização de atualizações"],
    [/feat\(deploy\):\s*refine version comparison strip with elegant spacing,\s*clear hierarchy,\s*and isolated status\/CTA/i, "Faixa de versões: novo bloco de comparação Produção vs GitHub com hierarquia clara"],
    [/feat\(deploy\):\s*refine version comparison card in \/admin\/deploy with clear hierarchy/i, "Faixa de versões: card de comparação de versões em /admin/deploy com hierarquia clara"],
    [/fix\(deploy\):\s*ensure hooks are unconditionally called at top level to avoid React error 310/i, "Correção React: estabilidade no ciclo de vida de hooks para evitar erros de renderização"],
    [/fix\(deploy\):\s*timezone conversion in log viewer and deployment details/i, "Correção de horário: conversão de timezone local (pt-BR) no visualizador de logs"],
    [/fix\(deploy\):\s*real-time 1s continuous elapsed timer for active deployment and modal/i, "Cronômetro em tempo real: contador fluído de 1 segundo sem saltos de renderização"],
    [/feat\(deploy\):\s*definitive github rate limit handling,\s*write-only PAT auth,\s*in-flight deduplication,\s*and refined log viewer/i, "Segurança e Performance: proteção contra rate limit do GitHub, autenticação segura e deduplicação"],
    [/fix\(deploy\):\s*server-side github auth,\s*rate limit resilience,\s*write-only tokens and exact timezone logs/i, "Segurança: autenticação server-side no GitHub, resiliência a rate limit e tokens protegidos"],
    [/fix\(deploy\):\s*unlock modal deploy CTA button to allow direct deployment of main branch/i, "Correção de fluxo: liberação do botão de implantação direta da branch main"],
    [/feat\(deploy\):\s*implement multi-layer GitHub resilience with persistent cache and real sync endpoint/i, "Resiliência GitHub: cache em múltiplas camadas e endpoint de sincronização forçada"],
    [/refactor\(deploy\):\s*refine copy and visual hierarchy of clear confirmation modals and toasts/i, "Refatoração visual: textos claros e hierarquia visual nos modais de confirmação e alertas"],
    [/feat\(deploy\):\s*definitive production hardening of deploy orchestrator,\s*version source of truth,\s*and UI\/UX refinement/i, "Robustez em produção: fonte de verdade imutável para versões e orquestrador seguro"],
    [/feat\(deploy-ui\):\s*implement continuous 1-second live elapsed timer hook without jumps/i, "Interface: hook de contagem regressiva e progresso em tempo real a cada 1 segundo"],
    [/feat\(deploy\):\s*auto-reconcile in-flight deployments on container boot and overview queries/i, "Reconciliação automática: recuperação de deploys ativos após reinício de containers"],
    [/feat\(deploy\):\s*add administrative option to clear deployment history with audit logging/i, "Histórico de deploys: opção administrativa para limpar histórico com registro de auditoria"],
    [/feat\(deploy\):\s*refine deploy confirmation modal with clean information hierarchy,\s*discrete badges,\s*pre-checks and SHA immutability/i, "Confirmação de deploy: modal com checagens prévias, badges discretos e imutabilidade de SHA"],
    [/fix\(deploy\):\s*increase EasyPanel deploy timeout and handle HTTP gateway timeout gracefully to allow background build completion/i, "Integração EasyPanel: suporte a builds longos do Docker sem interrupção por gateway timeout"],
    [/feat\(deploy\):\s*redesign active deploy panel and modal with steppers,\s*accurate health semantics and refined operational logs/i, "Painel de deploy ativo: novo stepper de progresso, semântica de saúde e logs refinados"],
    [/fix\(deploy\):\s*bypass GitHub REST API rate-limits gracefully and send latest commit SHA/i, "Correção de API: tratamento resiliente de rate limit do GitHub e envio de SHA mais recente"],
    [/feat\(deploy\):\s*add administrative option to clear visual GitHub update history with persistent marker and audit log/i, "Atualizações do GitHub: opção para limpar visualmente a lista de commits com auditoria"],
  ];

  for (const [regex, pt] of commitDictionary) {
    if (regex.test(msg)) {
      return pt;
    }
  }

  // Se não foi encontrada correspondência exata, realiza a tradução contextual e gramatical
  let translated = msg;

  // Substitui prefixos convencionais
  const prefixMap: Array<[RegExp, string]> = [
    [/^feat(?:\([^)]*\))?:\s*/i, "Nova funcionalidade: "],
    [/^fix(?:\([^)]*\))?:\s*/i, "Correção: "],
    [/^refactor(?:\([^)]*\))?:\s*/i, "Refatoração: "],
    [/^perf(?:\([^)]*\))?:\s*/i, "Melhoria de desempenho: "],
    [/^style(?:\([^)]*\))?:\s*/i, "Ajuste visual: "],
    [/^chore(?:\([^)]*\))?:\s*/i, "Manutenção: "],
    [/^docs(?:\([^)]*\))?:\s*/i, "Documentação: "],
    [/^test(?:\([^)]*\))?:\s*/i, "Testes: "],
    [/^build(?:\([^)]*\))?:\s*/i, "Build/Compilação: "],
    [/^ci(?:\([^)]*\))?:\s*/i, "Integração contínua: "],
  ];

  for (const [regex, replacement] of prefixMap) {
    if (regex.test(translated)) {
      translated = translated.replace(regex, replacement);
      break;
    }
  }

  // Dicionário extensivo de frases e termos em inglês para pt-BR
  const dictionary: Array<[RegExp, string]> = [
    [/\badjust auto-scroll indicator spacing and subtle pill badge\b/gi, "espaçamento do auto-scroll e novo micro-badge dos logs"],
    [/\breplace integrations dropdown with compact dedicated modal\b/gi, "substituição de menu dropdown por modal compacto de integrações"],
    [/\bcenter comparison arrow with symmetric grid\b/gi, "centralização da seta de comparação com grid simétrico"],
    [/\btranslate all commit descriptions to pt-BR\b/gi, "tradução de todas as descrições para pt-BR"],
    [/\bprevent whole-page unmount on transient network drop during container restart and increase retry tolerance\b/gi, "previne desmontagem de tela na reinicialização dos containers e melhora reconexão"],
    [/\breal-time automatic deployment status tracking, live logs, visibility-aware polling and post-deploy auto-sync\b/gi, "monitoramento em tempo real, logs ao vivo e sincronização pós-deploy"],
    [/\bfinal refinement of deployment details modal UX, timeline, log columns, auto-scroll and health state consistency\b/gi, "refinamento do modal de detalhes, timeline, colunas de logs e validação de saúde"],
    [/\bunify header controls into Integrações dropdown and Buscar atualizações action\b/gi, "unificação dos controles do cabeçalho e busca de atualizações"],
    [/\brefine version comparison strip with elegant spacing, clear hierarchy, and isolated status\/CTA\b/gi, "bloco de comparação Produção vs GitHub com hierarquia clara"],
    [/\bensure hooks are unconditionally called at top level to avoid React error 310\b/gi, "estabilidade de hooks para evitar erros de renderização"],
    [/\btimezone conversion in log viewer and deployment details\b/gi, "conversão de fuso horário local nos logs e detalhes"],
    [/\breal-time 1s continuous elapsed timer for active deployment and modal\b/gi, "cronômetro contínuo de 1s para deploy ativo e modal"],
    [/\bdefinitive github rate limit handling, write-only PAT auth, in-flight deduplication, and refined log viewer\b/gi, "tratamento de rate limit, autenticação protegida e logs refinados"],
    [/\bunlock modal deploy CTA button to allow direct deployment of main branch\b/gi, "desbloqueio do botão de implantação direta da branch main"],
    [/\bimplement multi-layer GitHub resilience with persistent cache and real sync endpoint\b/gi, "resiliência no GitHub com cache persistente e sincronização forçada"],
    [/\brefine copy and visual hierarchy of clear confirmation modals and toasts\b/gi, "textos claros e hierarquia visual nos modais de confirmação"],
    [/\bdefinitive production hardening of deploy orchestrator, version source of truth, and UI\/UX refinement\b/gi, "fonte de verdade imutável para versões e orquestrador seguro"],
    [/\bimplement continuous 1-second live elapsed timer hook without jumps\b/gi, "hook de contagem contínua de 1s sem saltos"],
    [/\bauto-reconcile in-flight deployments on container boot and overview queries\b/gi, "reconciliação de deploys ativos após boot de containers"],
    [/\badd administrative option to clear deployment history with audit logging\b/gi, "opção administrativa para limpar histórico com log de auditoria"],
    [/\brefine deploy confirmation modal with clean information hierarchy, discrete badges, pre-checks and SHA immutability\b/gi, "modal de confirmação com checagens e imutabilidade de versão"],
    [/\bincrease EasyPanel deploy timeout and handle HTTP gateway timeout gracefully to allow background build completion\b/gi, "suporte a builds longos do Docker no EasyPanel"],
    [/\bredesign active deploy panel and modal with steppers, accurate health semantics and refined operational logs\b/gi, "painel de deploy com steppers e logs operacionais"],
    [/\bbypass GitHub REST API rate-limits gracefully and send latest commit SHA\b/gi, "tratamento de limites da API do GitHub e envio do último commit"],
    [/\badd administrative option to clear visual GitHub update history with persistent marker and audit log\b/gi, "opção para limpar histórico visual com registro de auditoria"],
    [/\binitial commit\b/gi, "commit inicial"],
    [/\bupdate\b/gi, "atualização"],
    [/\bupdates\b/gi, "atualizações"],
    [/\bimprove\b/gi, "melhoria"],
    [/\bimproved\b/gi, "melhorado"],
    [/\badd\b/gi, "adição"],
    [/\badded\b/gi, "adicionado"],
    [/\bremove\b/gi, "remoção"],
    [/\bremoved\b/gi, "removido"],
    [/\bdelete\b/gi, "exclusão"],
    [/\bdeleted\b/gi, "excluído"],
    [/\brefactor\b/gi, "refatoração"],
    [/\brefactored\b/gi, "refatorado"],
    [/\boptimize\b/gi, "otimização"],
    [/\boptimized\b/gi, "otimizado"],
    [/\bclean up\b/gi, "limpeza"],
    [/\bcleanup\b/gi, "limpeza"],
    [/\bhandle\b/gi, "tratamento de"],
    [/\bhandling\b/gi, "tratamento de"],
    [/\bprevent\b/gi, "previne"],
    [/\bseamless\b/gi, "fluído"],
    [/\bworkflow\b/gi, "fluxo de trabalho"],
    [/\bpipeline\b/gi, "esteira"],
    [/\bdashboard\b/gi, "painel"],
    [/\bsettings\b/gi, "configurações"],
    [/\bpermissions\b/gi, "permissões"],
    [/\bsecurity\b/gi, "segurança"],
    [/\bperformance\b/gi, "desempenho"],
    [/\bcache\b/gi, "cache"],
    [/\btimeout\b/gi, "tempo limite"],
    [/\bdatabase\b/gi, "banco de dados"],
    [/\bendpoint\b/gi, "ponto de extremidade da API"],
    [/\bauthentication\b/gi, "autenticação"],
    [/\bvalidation\b/gi, "validação"],
  ];

  for (const [pattern, replacement] of dictionary) {
    translated = translated.replace(pattern, replacement);
  }

  return translated;
}

export default function AdminDeployPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedCommitToDeploy, setSelectedCommitToDeploy] = useState<GitHubCommitItem | null>(null);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<HistoryItem | null>(null);
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);
  const [integrationsModalOpen, setIntegrationsModalOpen] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [clearHistoryOpen, setClearHistoryOpen] = useState(false);
  const [clearDeployHistoryOpen, setClearDeployHistoryOpen] = useState(false);
  const [visibleCommitCount, setVisibleCommitCount] = useState(5);
  const [isReplacingToken, setIsReplacingToken] = useState(false);
  const [autoScrollLogs, setAutoScrollLogs] = useState(true);
  const [page, setPage] = useState(1);
  const [isTabVisible, setIsTabVisible] = useState(true);

  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const prevActiveRef = useRef<{ id: string; status: string; shortSha: string } | null>(null);

  // Monitora visibilidade da aba para reduzir consumo em background e sincronizar imediatamente ao retornar
  useEffect(() => {
    const handleVisibility = () => {
      const visible = typeof document !== "undefined" ? document.visibilityState === "visible" : true;
      setIsTabVisible(visible);
      if (visible) {
        void qc.invalidateQueries({ queryKey: ["admin-deploy-status"] });
        if (selectedDetailId) {
          void qc.invalidateQueries({ queryKey: ["admin-deploy-detail", selectedDetailId] });
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [qc, selectedDetailId]);

  // Form states do Modal de Configuração do EasyPanel (Write-Only)
  const [cfgUrl, setCfgUrl] = useState("");
  const [cfgProject, setCfgProject] = useState("");
  const [cfgService, setCfgService] = useState("");
  const [cfgToken, setCfgToken] = useState("");
  const [testResult, setTestResult] = useState<TestConnectionResponse | null>(null);

  // Form states do Modal de Configuração do GitHub (Write-Only)
  const [githubConfigModalOpen, setGithubConfigModalOpen] = useState(false);
  const [githubOwner, setGithubOwner] = useState("LuizOMS-Dev");
  const [githubRepo, setGithubRepo] = useState("nexaflow-ai");
  const [githubBranch, setGithubBranch] = useState("main");
  const [githubToken, setGithubToken] = useState("");
  const [isReplacingGithubToken, setIsReplacingGithubToken] = useState(false);
  const [githubTestResult, setGithubTestResult] = useState<TestGitHubConnectionResponse | null>(null);

  // 1. Status geral de deploy (Polling automático com retry resiliente para reinicialização de containers)
  const overviewQuery = useQuery({
    queryKey: ["admin-deploy-status"],
    queryFn: () => api<DeployOverviewResponse>("/admin/deploy/status"),
    enabled: user?.platformRole === "SUPERADMIN",
    refetchInterval: (query) => {
      const active = query.state.data?.activeDeployment;
      if (active) {
        return isTabVisible ? 2000 : 8000;
      }
      return 25000;
    },
    refetchOnWindowFocus: true,
    retry: 15,
    retryDelay: (attempt) => Math.min(1000 * 1.4 ** attempt, 5000),
  });

  // 2. Lista de commits recentes do GitHub (filtrada pelo clear marker)
  const commitsQuery = useQuery({
    queryKey: ["admin-deploy-commits"],
    queryFn: () =>
      api<{ commits: GitHubCommitItem[] }>("/admin/deploy/commits?limit=15"),
    enabled: user?.platformRole === "SUPERADMIN",
    retry: 3,
  });

  // 3. Histórico de deploys (Atualiza em background durante deploys)
  const historyQuery = useQuery({
    queryKey: ["admin-deploy-history", page],
    queryFn: () =>
      api<{
        items: HistoryItem[];
        total: number;
        page: number;
        totalPages: number;
      }>(`/admin/deploy/history?page=${page}&limit=10`),
    enabled: user?.platformRole === "SUPERADMIN",
    refetchInterval: () =>
      overviewQuery.data?.activeDeployment ? (isTabVisible ? 4000 : 10000) : false,
    retry: 10,
    retryDelay: (attempt) => Math.min(1000 * 1.4 ** attempt, 5000),
  });

  // 4. Detalhes do deploy selecionado (Atualização em tempo real de logs e health)
  const detailQuery = useQuery({
    queryKey: ["admin-deploy-detail", selectedDetailId],
    queryFn: () => api<DeploymentDetail>(`/admin/deploy/${selectedDetailId}`),
    enabled: Boolean(selectedDetailId) && user?.platformRole === "SUPERADMIN",
    refetchInterval: (query) => {
      const detail = query.state.data;
      const isFinished = detail?.status === "COMPLETED" || detail?.status === "FAILED" || detail?.isFinished;
      if (isFinished) return false;
      return isTabVisible ? 2000 : 8000;
    },
    refetchOnWindowFocus: true,
    retry: 15,
    retryDelay: (attempt) => Math.min(1000 * 1.4 ** attempt, 5000),
  });

  // Monitora transições do deploy ativo para disparo de toasts de conclusão e sincronização geral
  useEffect(() => {
    const active = overviewQuery.data?.activeDeployment;

    if (active) {
      prevActiveRef.current = {
        id: active.id,
        status: active.status,
        shortSha: active.commitShortSha,
      };
    } else if (prevActiveRef.current) {
      const last = prevActiveRef.current;
      prevActiveRef.current = null;

      // Invalidação imediata de todas as queries pós-deploy
      void qc.invalidateQueries({ queryKey: ["admin-deploy-status"] });
      void qc.invalidateQueries({ queryKey: ["admin-deploy-history"] });
      void qc.invalidateQueries({ queryKey: ["admin-deploy-commits"] });

      if (last.status === "COMPLETED" || overviewQuery.data?.status === "UP_TO_DATE") {
        toast({
          title: "Implantação concluída",
          description: `Versão ${last.shortSha} está ativa e operacional em produção.`,
          kind: "success",
        });
      } else if (last.status === "FAILED") {
        toast({
          title: "Implantação falhou",
          description: "A implantação foi interrompida. Verifique os logs operacionais.",
          kind: "error",
        });
      }
    }
  }, [overviewQuery.data, qc, toast]);

  // 5. Configuração salva do EasyPanel (Write-Only)
  const configQuery = useQuery({
    queryKey: ["admin-deploy-config"],
    queryFn: () => api<EasyPanelConfigResponse>("/admin/deploy/config"),
    enabled: configModalOpen && user?.platformRole === "SUPERADMIN",
  });

  useEffect(() => {
    if (configQuery.data) {
      setCfgUrl(configQuery.data.url || "");
      setCfgProject(configQuery.data.projectName || "i9atendimento");
      setCfgService(configQuery.data.serviceName || "nexaflow");
      setCfgToken("");
      setIsReplacingToken(false);
      setTestResult(null);
    }
  }, [configQuery.data]);

  // 6. Configuração salva do GitHub (Write-Only)
  const githubConfigQuery = useQuery({
    queryKey: ["admin-deploy-github-config"],
    queryFn: () => api<GitHubConfigResponse>("/admin/deploy/github/config"),
    enabled: githubConfigModalOpen && user?.platformRole === "SUPERADMIN",
  });

  useEffect(() => {
    if (githubConfigQuery.data) {
      setGithubOwner(githubConfigQuery.data.owner || "LuizOMS-Dev");
      setGithubRepo(githubConfigQuery.data.repo || "nexaflow-ai");
      setGithubBranch(githubConfigQuery.data.branch || "main");
      setGithubToken("");
      setIsReplacingGithubToken(false);
      setGithubTestResult(null);
    }
  }, [githubConfigQuery.data]);

  // Auto-scroll logs
  useEffect(() => {
    if (autoScrollLogs && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [detailQuery.data?.logs, autoScrollLogs]);

  const copyToClipboard = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    toast({
      title: "Copiado",
      description: `${label} copiado para a área de transferência.`,
      kind: "success",
    });
  };

  // Mutação: Limpar histórico visual de commits do GitHub
  const clearHistoryMut = useMutation({
    mutationFn: () =>
      api<{ success: boolean; message: string }>("/admin/deploy/commits/clear", {
        method: "POST",
      }),
    onSuccess: () => {
      setClearHistoryOpen(false);
      void qc.invalidateQueries({ queryKey: ["admin-deploy-commits"] });
      toast({
        title: "Atualizações recentes limpas",
        description: "Nenhuma alteração foi realizada no repositório GitHub.",
        kind: "success",
      });
    },
    onError: (e) => {
      toast({
        title: "Não foi possível limpar o histórico",
        description: e instanceof Error ? e.message : "Erro interno ao limpar histórico visual.",
        kind: "error",
      });
    },
  });

  // Mutação: Limpar histórico de deploys finalizados (mantém CurrentProductionVersion intacta)
  const clearDeployHistoryMut = useMutation({
    mutationFn: () =>
      api<{ success: boolean; count: number; message: string }>(
        "/admin/deploy/history/clear",
        { method: "POST" }
      ),
    onSuccess: () => {
      setClearDeployHistoryOpen(false);
      void qc.invalidateQueries({ queryKey: ["admin-deploy-history"] });
      void qc.invalidateQueries({ queryKey: ["admin-deploy-status"] });
      toast({
        title: "Histórico de implantações limpo",
        description: "A versão em produção e os serviços implantados permanecem inalterados.",
        kind: "success",
      });
    },
    onError: (e) => {
      toast({
        title: "Não foi possível limpar o histórico",
        description: e instanceof Error ? e.message : "Erro interno ao limpar histórico de implantações.",
        kind: "error",
      });
    },
  });

  // Mutação: Sincronizar e buscar atualizações diretamente do GitHub
  const syncGitHubMut = useMutation({
    mutationFn: () =>
      api<{ success: boolean; count: number; message: string; rateLimited?: boolean }>("/admin/deploy/sync", {
        method: "POST",
      }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["admin-deploy-status"] });
      void qc.invalidateQueries({ queryKey: ["admin-deploy-commits"] });
      toast({
        title: res.success ? "Sincronizado com o GitHub" : "Aviso de sincronização",
        description: res.message,
        kind: res.success ? "success" : "info",
      });
    },
    onError: (e) => {
      toast({
        title: "Falha ao buscar atualizações",
        description: e instanceof Error ? e.message : "Erro ao conectar com a API do GitHub.",
        kind: "error",
      });
    },
  });

  // Mutação: Testar conexão com GitHub
  const testGitHubConnMut = useMutation({
    mutationFn: (body: { owner?: string; repo?: string; branch?: string; token?: string }) =>
      api<TestGitHubConnectionResponse>("/admin/deploy/github/test", {
        method: "POST",
        json: body,
      }),
    onSuccess: (res) => {
      setGithubTestResult(res);
      if (res.success) {
        toast({ title: "GitHub conectado", description: res.message, kind: "success" });
      } else {
        toast({ title: "Falha na conexão com GitHub", description: res.message, kind: "error" });
      }
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Não foi possível testar a conexão com o GitHub.";
      setGithubTestResult({ success: false, state: "UNAVAILABLE", message: msg });
      toast({ title: "Erro no teste", description: msg, kind: "error" });
    },
  });

  // Mutação: Salvar configuração do GitHub
  const saveGitHubConfigMut = useMutation({
    mutationFn: (body: { owner?: string; repo?: string; branch?: string; token?: string }) =>
      api<{ success: boolean; message: string }>("/admin/deploy/github/config", {
        method: "POST",
        json: body,
      }),
    onSuccess: () => {
      setGithubConfigModalOpen(false);
      setGithubToken("");
      setIsReplacingGithubToken(false);
      void qc.invalidateQueries({ queryKey: ["admin-deploy-status"] });
      void qc.invalidateQueries({ queryKey: ["admin-deploy-commits"] });
      void qc.invalidateQueries({ queryKey: ["admin-deploy-github-config"] });
      toast({
        title: "Configuração do GitHub salva",
        description: "Repositório e credenciais atualizados com sucesso.",
        kind: "success",
      });
    },
    onError: (e) => {
      toast({
        title: "Não foi possível salvar",
        description: e instanceof Error ? e.message : "Erro ao salvar configuração do GitHub.",
        kind: "error",
      });
    },
  });

  // Mutação: Testar conexão com EasyPanel
  const testConnMut = useMutation({
    mutationFn: (body: { url: string; token?: string; projectName: string; serviceName: string }) =>
      api<TestConnectionResponse>("/admin/deploy/config/test", {
        method: "POST",
        json: body,
      }),
    onSuccess: (res) => {
      setTestResult(res);
      if (res.success) {
        toast({ title: "Conexão estabelecida", description: res.message, kind: "success" });
      } else {
        toast({ title: "Falha na conexão", description: res.message, kind: "error" });
      }
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Não foi possível testar a conexão.";
      setTestResult({ success: false, state: "UNAVAILABLE", message: msg });
      toast({ title: "Erro no teste", description: msg, kind: "error" });
    },
  });

  // Mutação: Salvar configuração do EasyPanel
  const saveConfigMut = useMutation({
    mutationFn: (body: { url: string; token?: string; projectName: string; serviceName: string }) =>
      api<{ success: boolean; message: string }>("/admin/deploy/config", {
        method: "POST",
        json: body,
      }),
    onSuccess: () => {
      setConfigModalOpen(false);
      setCfgToken("");
      setIsReplacingToken(false);
      void qc.invalidateQueries({ queryKey: ["admin-deploy-status"] });
      void qc.invalidateQueries({ queryKey: ["admin-deploy-config"] });
      toast({
        title: "Configuração salva",
        description: "Parâmetros do EasyPanel atualizados com sucesso.",
        kind: "success",
      });
    },
    onError: (e) => {
      toast({
        title: "Não foi possível salvar",
        description: e instanceof Error ? e.message : "Erro interno ao salvar configuração.",
        kind: "error",
      });
    },
  });

  // Mutação: Iniciar deploy
  const startDeployMut = useMutation({
    mutationFn: (body?: { commitSha?: string; branch?: string }) =>
      api<{ deploymentId: string; status: string }>("/admin/deploy/start", {
        method: "POST",
        json: body || {},
      }),
    onSuccess: (res) => {
      setConfirmOpen(false);
      setSelectedCommitToDeploy(null);
      void qc.invalidateQueries({ queryKey: ["admin-deploy-status"] });
      void qc.invalidateQueries({ queryKey: ["admin-deploy-commits"] });
      void qc.invalidateQueries({ queryKey: ["admin-deploy-history"] });
      toast({
        title: "Deploy iniciado",
        description: "O processo de build e validação foi enviado ao EasyPanel.",
        kind: "success",
      });
      setSelectedDetailId(res.deploymentId);
    },
    onError: (e) => {
      toast({
        title: "Não foi possível iniciar o deploy",
        description: e instanceof Error ? e.message : "Erro interno ao processar a solicitação.",
        kind: "error",
      });
    },
  });

  // Mutação: Rollback
  const rollbackMut = useMutation({
    mutationFn: (id: string) =>
      api<{ deploymentId: string; status: string }>(`/admin/deploy/${id}/rollback`, {
        method: "POST",
      }),
    onSuccess: (res) => {
      setRollbackOpen(false);
      setRollbackTarget(null);
      void qc.invalidateQueries({ queryKey: ["admin-deploy-status"] });
      void qc.invalidateQueries({ queryKey: ["admin-deploy-commits"] });
      void qc.invalidateQueries({ queryKey: ["admin-deploy-history"] });
      toast({
        title: "Rollback iniciado",
        description: "Reimplantando a versão anterior selecionada.",
        kind: "success",
      });
      setSelectedDetailId(res.deploymentId);
    },
    onError: (e) => {
      toast({
        title: "Falha ao iniciar rollback",
        description: e instanceof Error ? e.message : "Erro interno.",
        kind: "error",
      });
    },
  });

  // Timers em tempo real (1s) para contagem fluida e sem congelamentos/saltos (declarados no topo para respeitar as Regras de Hooks)
  const activeLiveSeconds = useLiveElapsedSeconds(
    overviewQuery.data?.activeDeployment?.startedAt,
    !overviewQuery.data?.activeDeployment,
    overviewQuery.data?.activeDeployment?.durationSeconds
  );

  const isDetailFinished =
    detailQuery.data?.status === "COMPLETED" || detailQuery.data?.status === "FAILED";
  const detailLiveSeconds = useLiveElapsedSeconds(
    detailQuery.data?.startedAt,
    isDetailFinished,
    detailQuery.data?.durationSeconds
  );

  if (user?.platformRole !== "SUPERADMIN") return null;

  // Apenas exibe tela de erro se NÃO houver nenhum dado carregado em cache E o carregamento inicial falhou
  if (overviewQuery.isError && !overviewQuery.data) {
    if (isSuperadminMfaRequiredError(overviewQuery.error)) return null;
    return (
      <AdminErrorState
        title="Não foi possível carregar o módulo de deploy"
        description={
          overviewQuery.error instanceof Error
            ? overviewQuery.error.message
            : "Verifique a conexão e permissões do Superadmin."
        }
        onRetry={() => void overviewQuery.refetch()}
      />
    );
  }

  if (overviewQuery.isLoading && !overviewQuery.data) {
    return <AdminPageSkeleton metrics={4} />;
  }

  if (!overviewQuery.data) {
    return null;
  }

  const data = overviewQuery.data;
  const current = data.currentCommit;
  const latest = data.latestGitHubCommit;
  const active = data.activeDeployment;
  const status = data.status; // "UP_TO_DATE" | "UPDATE_AVAILABLE" | "UNKNOWN" | "DEPLOYING"
  const isUpToDate = status === "UP_TO_DATE";
  const isUpdateAvailable = status === "UPDATE_AVAILABLE";
  const isUnknown = status === "UNKNOWN";
  const isGitHubConnected = Boolean(data.gitHub?.connected && latest);

  const allCommits = commitsQuery.data?.commits || [];
  const displayedCommits = allCommits.slice(0, visibleCommitCount);

  const historyItems = historyQuery.data?.items || [];
  const totalPages = historyQuery.data?.totalPages || 1;

  // Estados semânticos oficiais do EasyPanel
  const epState = data.easyPanel?.state || (data.easyPanel?.connected ? "CONNECTED" : "NOT_CONFIGURED");
  let epLabel = "Conectado";
  let epTone: "success" | "neutral" | "warning" | "danger" | "brand" = "success";
  let epHint = `${data.easyPanel?.projectName || "i9atendimento"} / ${data.easyPanel?.serviceName || "nexaflow"}`;

  if (epState === "NOT_CONFIGURED") {
    epLabel = "Não configurado";
    epTone = "neutral";
    epHint = "Configure a integração para habilitar deployments.";
  } else if (epState === "CHECKING") {
    epLabel = "Verificando";
    epTone = "brand";
    epHint = "Testando comunicação com o servidor...";
  } else if (epState === "UNAVAILABLE") {
    epLabel = "Indisponível";
    epTone = "warning";
    epHint = "Servidor EasyPanel temporariamente inacessível.";
  } else if (epState === "AUTH_FAILED") {
    epLabel = "Credenciais inválidas";
    epTone = "danger";
    epHint = "Token inválido ou sem permissão de acesso.";
  }

  const isFetchingAny = overviewQuery.isFetching || commitsQuery.isFetching;
  const tokenIsSaved = Boolean(configQuery.data?.tokenConfigured);
  const githubTokenIsSaved = Boolean(githubConfigQuery.data?.tokenConfigured || data.gitHub?.tokenConfigured);
  const isRateLimited = Boolean(data.gitHub?.rateLimit?.isRateLimited);

  const activeStageIdx = active ? getStageIndex(active.stage || active.status) : 0;

  return (
    <div className="space-y-5">
      {/* 1. Header */}
      <AdminPageHeader
        title="Deploy"
        description="Controle as versões implantadas em produção com integração direta GitHub → EasyPanel."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* 1. Ação: Integrações (Abre o modal compacto de conexões) */}
            <button
              type="button"
              className="admin-btn-secondary h-9 px-3.5 text-[12.5px] font-medium flex items-center gap-2"
              onClick={() => setIntegrationsModalOpen(true)}
            >
              <Layers className="h-3.5 w-3.5 text-gray-400" />
              <span>Integrações</span>
            </button>

            {/* Indicador sutil de reconexão durante reinicialização de containers */}
            {overviewQuery.isFetching && overviewQuery.isError ? (
              <span className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1 text-[11.5px] font-medium text-amber-300 border border-amber-500/20">
                <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
                <span>Reconectando...</span>
              </span>
            ) : null}

            {/* 2. Ação Principal: Buscar atualizações */}
            <button
              type="button"
              className="admin-btn-secondary h-9 px-3.5 text-[12.5px] font-medium text-white border-white/[0.12] hover:bg-white/[0.06] hover:border-white/[0.2] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              onClick={() => syncGitHubMut.mutate()}
              disabled={syncGitHubMut.isPending || isFetchingAny || isRateLimited}
              title={isRateLimited ? "Sincronização temporariamente limitada pelo GitHub" : undefined}
            >
              <RefreshCw
                className={cn(
                  "h-3.5 w-3.5 text-gray-300",
                  (syncGitHubMut.isPending || isFetchingAny) && "animate-spin text-violet-400"
                )}
              />
              <span>
                {syncGitHubMut.isPending
                  ? "Buscando..."
                  : isRateLimited
                  ? "GitHub limitado"
                  : "Buscar atualizações"}
              </span>
            </button>
          </div>
        }
      />

      {/* Aviso discreto quando GitHub estiver limitado por rate limit */}
      {isRateLimited ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3.5 text-amber-200">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
          <div className="space-y-0.5 text-[12px]">
            <p className="font-semibold text-amber-100">GitHub temporariamente limitado</p>
            <p className="text-amber-200/80 leading-relaxed">
              O NexaFlow aguardará o período indicado pelo GitHub antes de sincronizar novamente. Os dados em cache continuam disponíveis normalmente.
            </p>
          </div>
        </div>
      ) : null}

      {/* 2. Grid de Métricas Principais (Padronizados com mesma altura e hierarquia) */}
      <MetricGrid cols={4}>
        <MetricCard
          label="Ambiente"
          value="Produção"
          hint={active ? "Implantação em andamento…" : "Instância online e operacional"}
          icon={<Server className="h-4 w-4" />}
          tone={active ? "warning" : "success"}
          compact
        />

        <MetricCard
          label="Versão em Produção"
          value={current ? current.shortSha : "Não identificada"}
          hint={
            current?.deployedAt
              ? `Implantado há ${formatRelativeTime(current.deployedAt)}`
              : current ? "Versão base de implantação" : "Nenhum deploy registrado"
          }
          icon={<GitCommit className="h-4 w-4" />}
          tone={current ? "brand" : "neutral"}
          compact
        />

        <MetricCard
          label="Repositório GitHub"
          value={data.gitHub?.repo || "LuizOMS-Dev/nexaflow-ai"}
          hint={data.gitHub?.connected ? `Branch: ${data.gitHub?.branch || "main"}` : "Falha na conexão com GitHub"}
          icon={<GitBranch className="h-4 w-4" />}
          tone={data.gitHub?.connected ? "neutral" : "danger"}
          compact
        />

        <MetricCard
          label="EasyPanel"
          value={epLabel}
          hint={epHint}
          icon={<Layers className="h-4 w-4" />}
          tone={epTone}
          compact
        />
      </MetricGrid>

      {/* 3. Painel de Deploy Ativo (Stepper Horizontal) */}
      {active ? (
        <div className="rounded-xl border border-violet-500/20 bg-[#0e1017] p-4 text-white shadow-sm">
          <div className="flex flex-col gap-3.5">
            {/* Topo: Título + Botão Ver Detalhes */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15 text-violet-400">
                  <Rocket className="h-3.5 w-3.5 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white text-[13.5px]">Implantação em andamento</h3>
                    <code className="rounded bg-violet-500/20 px-1.5 py-0.5 font-mono text-[11.5px] font-bold text-violet-300">
                      {active.commitShortSha}
                    </code>
                  </div>
                  <p className="text-[11.5px] text-gray-400 truncate max-w-lg">
                    &quot;{formatCommitMessagePtBr(active.commitMessage)}&quot; · Iniciado por <strong className="text-gray-300">{active.startedByName}</strong> · decorrido: <span className="font-mono text-gray-200">{formatDuration(activeLiveSeconds)}</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="admin-btn-secondary h-7.5 px-3 text-[11.5px] shrink-0"
                onClick={() => setSelectedDetailId(active.id)}
              >
                <Terminal className="h-3 w-3" /> Ver detalhes
              </button>
            </div>

            {/* Stepper Horizontal */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 pt-1">
              {STAGES.map((st, idx) => {
                const isPast = activeStageIdx > idx;
                const isCurrent = activeStageIdx === idx;

                return (
                  <div
                    key={st.id}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] border transition-all",
                      isCurrent
                        ? "bg-violet-500/[0.1] border-violet-500/25 text-white font-medium shadow-[0_0_10px_rgba(139,92,246,0.08)]"
                        : isPast
                        ? "bg-white/[0.02] border-white/[0.06] text-gray-300"
                        : "bg-transparent border-transparent text-gray-500"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold transition-all",
                        isPast
                          ? "bg-emerald-500/20 text-emerald-400"
                          : isCurrent
                          ? "bg-violet-500 text-white"
                          : "bg-white/[0.05] text-gray-500"
                      )}
                    >
                      {isPast ? (
                        <Check className="h-3 w-3 stroke-[2.5]" />
                      ) : isCurrent ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        idx + 1
                      )}
                    </div>
                    <span className="truncate">{st.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Rodapé Informativo */}
            <div className="flex flex-wrap items-center justify-between text-[11.5px] text-gray-400 pt-1">
              <span>
                Etapa atual: <strong className="text-violet-300 font-semibold">{deployStatusLabel(active.stage || active.status)}</strong>
              </span>
              <span>
                Saúde: <strong className="text-gray-400 font-normal">{healthStatusLabel(active.status, active.healthStatus)}</strong>
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {/* 4. Faixa Refinada: Comparação de Versão (Produção vs GitHub) + Status e Ação */}
      <div className="rounded-xl border border-white/[0.08] bg-[#0c0d12] p-4.5 sm:p-5">
        <div className="flex flex-col gap-4.5 lg:flex-row lg:items-center lg:justify-between">
          {/* Bloco de Comparação: Produção e GitHub (Grid simétrico que posiciona a seta exatamente no centro) */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-4 sm:gap-6 flex-1 min-w-0">
            {/* Lado 1: Produção */}
            <div className="min-w-0 space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400 block">
                Versão em produção
              </span>
              <div className="flex items-center gap-2">
                <code className="font-mono text-[14px] font-bold text-violet-300">
                  {current ? current.shortSha : "Não identificada"}
                </code>
              </div>
              <p className="text-[12px] text-gray-400 truncate max-w-sm sm:max-w-md" title={current?.message ? formatCommitMessagePtBr(current.message) : undefined}>
                {current?.deployedAt
                  ? `Implantado há ${formatRelativeTime(current.deployedAt)}`
                  : current?.message ? formatCommitMessagePtBr(current.message) : "Sem versão registrada em produção"}
              </p>
            </div>

            {/* Divisor / Comparador Central perfeitamente no meio */}
            <div className="hidden sm:flex items-center justify-center shrink-0 px-1">
              <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] text-gray-300 shadow-sm">
                <ArrowRight className="h-3.5 w-3.5 stroke-[2]" />
              </div>
            </div>

            {/* Lado 2: GitHub */}
            <div className="min-w-0 space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400 block">
                {active
                  ? `Versão sendo implantada · ${data.gitHub?.branch || "main"}`
                  : `Último no GitHub · ${data.gitHub?.branch || "main"}`}
              </span>
              <div className="flex items-center gap-2">
                <code className={cn("font-mono text-[14px] font-bold", isGitHubConnected ? "text-emerald-300" : "text-gray-400")}>
                  {latest ? latest.shortSha : "—"}
                </code>
              </div>
              <p className="text-[12px] text-gray-400 truncate max-w-sm sm:max-w-md" title={latest?.message ? formatCommitMessagePtBr(latest.message) : undefined}>
                {isGitHubConnected ? (latest?.message ? formatCommitMessagePtBr(latest.message) : "Nenhum commit encontrado") : "Não foi possível consultar o GitHub"}
              </p>
            </div>
          </div>

          {/* Lado Direito / Inferior: Status Semântico + CTA Único Principal */}
          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 pt-3 border-t border-white/[0.06] lg:border-t-0 lg:pt-0 lg:pl-6 lg:border-l lg:border-white/[0.08] shrink-0">
            {/* Status Semântico Discreto */}
            {active ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 text-violet-300 text-[12px] font-medium">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />
                <span>Em implantação</span>
              </div>
            ) : !isGitHubConnected ? (
              <div className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-3 py-1.5 text-gray-400 border border-white/[0.06]">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400/80" />
                <span className="text-[12px] font-medium">Não foi possível consultar o GitHub</span>
              </div>
            ) : isUpToDate ? (
              <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/[0.1] px-3 py-1.5 text-emerald-300 border border-emerald-500/20">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span className="text-[12px] font-medium">Produção atualizada</span>
              </div>
            ) : isUpdateAvailable ? (
              <div className="flex items-center gap-1.5 rounded-lg bg-violet-500/[0.12] px-3 py-1.5 text-violet-200 border border-violet-500/25 shadow-[0_0_12px_rgba(139,92,246,0.1)]">
                <Sparkles className="h-3.5 w-3.5 text-violet-400" />
                <span className="text-[12px] font-medium">Atualização disponível</span>
              </div>
            ) : isUnknown ? (
              <div className="flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-3 py-1.5 text-gray-300 border border-white/[0.08]">
                <HelpCircle className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-[12px] font-medium">Versão atual não identificada</span>
              </div>
            ) : null}

            {/* CTA Principal de Implantação (apenas quando não houver deploy ativo) */}
            {!active && isGitHubConnected && (isUpdateAvailable || isUnknown) ? (
              <button
                type="button"
                className="admin-btn-primary h-9 px-4 text-[12.5px] font-semibold shadow-sm"
                disabled={startDeployMut.isPending || !data.easyPanel?.connected}
                onClick={() => {
                  setSelectedCommitToDeploy(null);
                  setConfirmOpen(true);
                }}
              >
                <Rocket className="h-3.5 w-3.5" />
                {isUnknown ? "Implantar versão" : "Implantar versão mais recente"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* 5. Atualizações Recentes no GitHub (Compacto com Menu ⋯ e Ação Limpar Histórico) */}
      <AdminSection
        title="Atualizações Recentes no GitHub"
        description="Histórico recente da branch principal no GitHub."
        action={
          allCommits.length > 0 ? (
            <button
              type="button"
              className="admin-btn-ghost h-7 px-2 text-[11.5px] text-gray-400 hover:text-rose-400"
              onClick={() => setClearHistoryOpen(true)}
              title="Limpar histórico visual de atualizações exibido neste painel"
            >
              <Trash2 className="h-3 w-3" /> Limpar histórico
            </button>
          ) : null
        }
        flush
      >
        {commitsQuery.isLoading ? (
          <div className="p-6 text-center text-[12px] text-gray-500">
            <RefreshCw className="mx-auto h-4 w-4 animate-spin text-gray-400 mb-1.5" />
            Buscando commits recentes...
          </div>
        ) : allCommits.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.04] text-gray-400">
              <GitCommit className="h-4 w-4" strokeWidth={1.5} />
            </div>
            <p className="mt-1.5 text-[12.5px] font-medium text-gray-300">Nenhuma atualização nova</p>
            <p className="mt-0.5 text-[11px] text-gray-500">
              Novos commits da branch main aparecerão aqui.
            </p>
          </div>
        ) : (
          <div>
            <div className="divide-y divide-white/[0.04]">
              {displayedCommits.map((c, index) => {
                const isCurrent = current?.sha === c.sha || (current?.shortSha === c.shortSha);
                const isLatest = index === 0 && !isCurrent && isUpdateAvailable;

                return (
                  <div
                    key={c.sha}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.02]"
                  >
                    {/* Informações do Commit */}
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <code className="rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[12px] font-bold text-violet-300 shrink-0">
                        {c.shortSha}
                      </code>

                      <p className="truncate text-[13px] font-medium text-gray-200" title={c.message ? formatCommitMessagePtBr(c.message) : undefined}>
                        {c.message ? formatCommitMessagePtBr(c.message) : "Sem descrição"}
                      </p>

                      {isCurrent ? (
                        <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300 shrink-0">
                          Em produção
                        </span>
                      ) : isLatest ? (
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 shrink-0">
                          Mais recente
                        </span>
                      ) : null}

                      <span className="hidden sm:inline text-[11.5px] text-gray-500 truncate shrink-0">
                        · {c.author} · {formatRelativeTime(c.date)}
                      </span>
                    </div>

                    {/* Menu Contextual ⋯ */}
                    <div className="shrink-0">
                      <ActionMenu
                        align="right"
                        aria-label={`Ações para commit ${c.shortSha}`}
                        items={[
                          ...(c.url
                            ? [
                                {
                                  label: "Ver no GitHub",
                                  icon: ExternalLink,
                                  onClick: () => window.open(c.url, "_blank", "noreferrer"),
                                },
                              ]
                            : []),
                          {
                            label: "Copiar SHA",
                            icon: Copy,
                            onClick: () => copyToClipboard(c.sha, "SHA do commit"),
                          },
                          ...(!isCurrent
                            ? [
                                {
                                  label: "Implantar esta versão",
                                  icon: Rocket,
                                  disabled: Boolean(active) || !data.easyPanel?.connected,
                                  onClick: () => {
                                    setSelectedCommitToDeploy(c);
                                    setConfirmOpen(true);
                                  },
                                },
                              ]
                            : []),
                        ]}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Ação Expandir / Recolher */}
            {allCommits.length > 5 ? (
              <div className="border-t border-white/[0.04] p-2 text-center">
                {visibleCommitCount < allCommits.length ? (
                  <button
                    type="button"
                    className="admin-btn-ghost h-7 px-3 text-[11.5px] text-gray-400 hover:text-white"
                    onClick={() => setVisibleCommitCount((c) => Math.min(allCommits.length, c + 5))}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                    Ver mais commits ({allCommits.length - visibleCommitCount} restantes)
                  </button>
                ) : (
                  <button
                    type="button"
                    className="admin-btn-ghost h-7 px-3 text-[11.5px] text-gray-400 hover:text-white"
                    onClick={() => setVisibleCommitCount(5)}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                    Mostrar menos
                  </button>
                )}
              </div>
            ) : null}
          </div>
        )}
      </AdminSection>

      {/* 6. Histórico de Implantações (Destaque Principal) */}
      <AdminSection
        title="Histórico de Deploys"
        description="Registro auditável de todas as implantações, durações e validações de saúde."
        action={
          historyItems.length > 0 ? (
            <button
              type="button"
              className="admin-btn-ghost h-7 px-2 text-[11.5px] text-gray-400 hover:text-rose-400"
              onClick={() => setClearDeployHistoryOpen(true)}
              title="Limpar todos os registros de implantações passadas deste painel"
            >
              <Trash2 className="h-3 w-3" /> Limpar histórico
            </button>
          ) : null
        }
        flush
      >
        {historyItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.04] text-gray-400">
              <History className="h-4 w-4" strokeWidth={1.5} />
            </div>
            <p className="mt-1.5 text-[12.5px] font-medium text-gray-300">Nenhum deploy registrado</p>
            <p className="mt-0.5 text-[11px] text-gray-500">
              O histórico de implantações aparecerá aqui assim que o primeiro deploy for concluído.
            </p>
          </div>
        ) : (
          <>
            <div className="admin-table-wrap overflow-x-auto">
              <table className="admin-table w-full min-w-[720px] border-collapse text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="w-[18%] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                      Versão
                    </th>
                    <th className="w-[18%] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                      Data
                    </th>
                    <th className="w-[18%] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                      Responsável
                    </th>
                    <th className="w-[14%] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                      Duração
                    </th>
                    <th className="w-[16%] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                      Status
                    </th>
                    <th className="w-[16%] px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {historyItems.map((item) => {
                    const isItemCurrent = current?.sha === item.commitSha;
                    return (
                      <tr
                        key={item.id}
                        className="border-b border-white/[0.04] transition-colors last:border-0 hover:bg-white/[0.025]"
                      >
                        <td className="px-4 py-2.5 align-middle">
                          <div className="flex items-center gap-1.5">
                            <code className="font-mono text-[12px] font-semibold text-violet-300">
                              {item.commitShortSha}
                            </code>
                            {item.isRollback ? (
                              <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[9.5px] font-medium text-amber-300">
                                Rollback
                              </span>
                            ) : null}
                          </div>
                        </td>

                        <td className="px-4 py-2.5 align-middle text-gray-300">
                          {formatDate(item.startedAt)}
                        </td>

                        <td className="px-4 py-2.5 align-middle text-gray-300">
                          {item.startedBy}
                        </td>

                        <td className="px-4 py-2.5 align-middle text-gray-400">
                          {formatDuration(item.durationSeconds)}
                        </td>

                        <td className="px-4 py-2.5 align-middle">
                          <StatusBadge tone={deployStatusTone(item.status)} dot={item.status !== "COMPLETED" && item.status !== "FAILED"}>
                            {deployStatusLabel(item.status)}
                          </StatusBadge>
                        </td>

                        <td className="px-4 py-2.5 align-middle text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              className="admin-btn-ghost h-7 px-2 text-[11.5px]"
                              onClick={() => setSelectedDetailId(item.id)}
                            >
                              <Terminal className="h-3 w-3" /> Detalhes
                            </button>

                            {item.status === "COMPLETED" && !isItemCurrent && !active && data.easyPanel?.connected ? (
                              <button
                                type="button"
                                className="admin-btn-ghost h-7 px-2 text-[11.5px] text-amber-300 hover:text-amber-200"
                                onClick={() => {
                                  setRollbackTarget(item);
                                  setRollbackOpen(true);
                                }}
                              >
                                <RotateCcw className="h-3 w-3" /> Restaurar
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            {totalPages > 1 ? (
              <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2.5 text-[11.5px] text-gray-400">
                <span>Total de {historyQuery.data?.total || 0} deploys</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="admin-btn-ghost h-7 px-2.5 text-[11.5px] disabled:opacity-40"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </button>
                  <span className="text-gray-300">
                    Página {page} de {totalPages}
                  </span>
                  <button
                    type="button"
                    className="admin-btn-ghost h-7 px-2.5 text-[11.5px] disabled:opacity-40"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Próxima
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </AdminSection>

      {/* MODAL 0: Integrações do Deploy (Acesso centralizado para EasyPanel e GitHub) */}
      <Modal
        open={integrationsModalOpen}
        onClose={() => setIntegrationsModalOpen(false)}
        title="Integrações do Deploy"
        description="Gerencie as conexões utilizadas pelo processo de implantação."
        size="md"
        footer={
          <div className="flex w-full justify-end">
            <button
              type="button"
              className="admin-btn-secondary h-8.5 px-4 text-[12px] font-medium"
              onClick={() => setIntegrationsModalOpen(false)}
            >
              Fechar
            </button>
          </div>
        }
      >
        <div className="divide-y divide-white/[0.06] py-1">
          {/* Linha 1: EasyPanel */}
          <div className="flex items-center justify-between gap-4 py-3.5 first:pt-1 last:pb-1">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] text-gray-300 border border-white/[0.06]">
                <Layers className="h-4 w-4" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-white text-[13px]">EasyPanel</h4>
                  {epState === "CONNECTED" ? (
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Conectado
                    </span>
                  ) : epState === "AUTH_FAILED" ? (
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-rose-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> Credenciais inválidas
                    </span>
                  ) : epState === "UNAVAILABLE" ? (
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-amber-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Indisponível
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-gray-500" /> Não configurado
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-gray-400 truncate">
                  {data.easyPanel?.projectName && data.easyPanel?.serviceName
                    ? `${data.easyPanel.projectName} / ${data.easyPanel.serviceName}`
                    : "i9atendimento / nexaflow"}
                </p>
              </div>
            </div>

            <button
              type="button"
              className="admin-btn-secondary h-8 px-3 text-[12px] shrink-0 font-medium"
              onClick={() => {
                setIntegrationsModalOpen(false);
                setConfigModalOpen(true);
              }}
            >
              Configurar
            </button>
          </div>

          {/* Linha 2: GitHub */}
          <div className="flex items-center justify-between gap-4 py-3.5 first:pt-1 last:pb-1">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] text-gray-300 border border-white/[0.06]">
                <GitBranch className="h-4 w-4" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-white text-[13px]">GitHub</h4>
                  {data.gitHub?.connected ? (
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Conectado
                    </span>
                  ) : isRateLimited ? (
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-amber-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Limitado temporariamente
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-gray-500" /> Não configurado
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-gray-400 truncate">
                  {data.gitHub?.owner && data.gitHub?.repo
                    ? `${data.gitHub.owner}/${data.gitHub.repo} · ${data.gitHub.branch || "main"}`
                    : "LuizOMS-Dev/nexaflow-ai · main"}
                </p>
              </div>
            </div>

            <button
              type="button"
              className="admin-btn-secondary h-8 px-3 text-[12px] shrink-0 font-medium"
              onClick={() => {
                setIntegrationsModalOpen(false);
                setGithubConfigModalOpen(true);
              }}
            >
              Configurar
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL 1: Confirmação de Deploy (Refinado e Seguro) */}
      <Modal
        open={confirmOpen}
        onClose={() => {
          if (!startDeployMut.isPending) {
            setConfirmOpen(false);
            setSelectedCommitToDeploy(null);
          }
        }}
        title="Implantar em produção?"
        description="Confirme os detalhes da versão antes de enviar o comando ao EasyPanel."
        size="md"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="admin-btn-secondary h-9"
              disabled={startDeployMut.isPending}
              onClick={() => {
                setConfirmOpen(false);
                setSelectedCommitToDeploy(null);
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="admin-btn-primary h-9"
              disabled={
                startDeployMut.isPending ||
                Boolean(active) ||
                !data.easyPanel?.connected
              }
              onClick={() => {
                const targetCommit = selectedCommitToDeploy || latest;
                startDeployMut.mutate({
                  commitSha: targetCommit?.sha || undefined,
                  branch: data.gitHub?.branch || "main",
                });
              }}
            >
              {startDeployMut.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Iniciando implantação…
                </>
              ) : (
                "Implantar em produção"
              )}
            </button>
          </DialogFooter>
        }
      >
        {(() => {
          const target = selectedCommitToDeploy || latest;
          const isEasyPanelOk = Boolean(data.easyPanel?.connected);
          const hasActive = Boolean(active);

          return (
            <div className="space-y-3.5 py-1 text-[12.5px]">
              {/* Bloco Estruturado de Informações */}
              <div className="rounded-xl border border-white/[0.08] bg-[#0c0d12] p-3.5 space-y-3">
                {/* Linha 1: Ambiente e Branch */}
                <div className="grid grid-cols-2 gap-3 pb-2.5 border-b border-white/[0.05]">
                  <div>
                    <span className="text-gray-400 text-[11px] uppercase tracking-wider block font-semibold">
                      Ambiente
                    </span>
                    <div className="mt-1 flex items-center gap-1.5 font-semibold text-emerald-400 text-[12.5px]">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Produção
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-[11px] uppercase tracking-wider block font-semibold">
                      Branch
                    </span>
                    <span className="mt-1 font-mono text-gray-200 text-[12.5px] block">
                      {data.gitHub?.branch || "main"}
                    </span>
                  </div>
                </div>

                {/* Linha 2: Versão Atual */}
                <div className="pb-2.5 border-b border-white/[0.05]">
                  <span className="text-gray-400 text-[11px] uppercase tracking-wider block font-semibold">
                    Versão Atual
                  </span>
                  {current?.isKnown ? (
                    <div className="mt-1 flex items-center gap-2">
                      <code className="font-mono font-semibold text-violet-300">
                        {current.shortSha}
                      </code>
                      {current.deployedAt ? (
                        <span className="text-gray-400 text-[11.5px]">
                          (implantado há {formatRelativeTime(current.deployedAt)})
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-1">
                      <span className="text-gray-300 font-medium">Versão atual não identificada</span>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        O NexaFlow passará a registrar a versão após uma implantação concluída com sucesso.
                      </p>
                    </div>
                  )}
                </div>

                {/* Linha 3: Nova Versão / Commit */}
                <div className="pb-2.5 border-b border-white/[0.05]">
                  <span className="text-gray-400 text-[11px] uppercase tracking-wider block font-semibold">
                    Nova Versão
                  </span>
                  <div className="mt-1">
                    <code className="rounded bg-violet-500/20 px-1.5 py-0.5 font-mono text-[12.5px] font-bold text-violet-300">
                      {target ? target.shortSha : "main"}
                    </code>
                    <p
                      className="mt-1 text-gray-200 text-[12px] line-clamp-2 leading-relaxed font-medium"
                      title={target?.message ? formatCommitMessagePtBr(target.message) : undefined}
                    >
                      {target ? formatCommitMessagePtBr(target.message) : "Última versão da branch main"}
                    </p>
                  </div>
                </div>

                {/* Linha 4: Serviços Afetados */}
                <div>
                  <span className="text-gray-400 text-[11px] uppercase tracking-wider block font-semibold mb-1.5">
                    Serviços Afetados
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 font-mono text-[11.5px] font-semibold text-gray-200">
                      API
                    </span>
                    <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 font-mono text-[11.5px] font-semibold text-gray-200">
                      Web
                    </span>
                  </div>
                </div>
              </div>

              {/* Aviso Operacional Discreto */}
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/15 bg-amber-500/[0.04] p-2.5 text-amber-200/90 text-[11.5px] leading-relaxed">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-400/90" />
                <p>
                  O EasyPanel executará o build e atualizará os serviços selecionados. Após a implantação, o NexaFlow validará API e Web antes de marcar o processo como concluído.
                </p>
              </div>

              {/* Alertas de Pré-checks (se houver impedimentos) */}
              {!isEasyPanelOk ? (
                <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.08] p-2.5 text-rose-300 text-[11.5px] flex items-center gap-2">
                  <XCircle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>EasyPanel não está conectado. Configure a integração antes de implantar.</span>
                </div>
              ) : hasActive ? (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.08] p-2.5 text-amber-300 text-[11.5px] flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                  <span>Já existe uma implantação em andamento no momento.</span>
                </div>
              ) : null}

              {/* Erro inline da mutação se houver */}
              {startDeployMut.isError ? (
                <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.08] p-2.5 text-rose-300 text-[11.5px] flex items-center gap-2">
                  <XCircle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>
                    {startDeployMut.error instanceof Error
                      ? startDeployMut.error.message
                      : "Não foi possível iniciar o deploy."}
                  </span>
                </div>
              ) : null}
            </div>
          );
        })()}
      </Modal>

      {/* MODAL 2: Confirmação de Rollback */}
      <Modal
        open={rollbackOpen && Boolean(rollbackTarget)}
        onClose={() => {
          setRollbackOpen(false);
          setRollbackTarget(null);
        }}
        title={`Restaurar versão ${rollbackTarget?.commitShortSha}?`}
        description="Você está prestes a reverter a produção para uma versão anterior bem-sucedida."
        size="md"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="admin-btn-secondary h-9"
              onClick={() => setRollbackOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="admin-btn-primary h-9 bg-amber-600 hover:bg-amber-500"
              disabled={rollbackMut.isPending}
              onClick={() => rollbackTarget && rollbackMut.mutate(rollbackTarget.id)}
            >
              {rollbackMut.isPending ? "Restaurando…" : "Confirmar restauração"}
            </button>
          </DialogFooter>
        }
      >
        {rollbackTarget ? (
          <div className="space-y-3 py-1 text-[13px]">
            <div className="rounded-xl border border-white/[0.08] bg-[#0c0d12] p-3 space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">Versão alvo:</span>
                <code className="font-mono font-bold text-amber-300">
                  {rollbackTarget.commitShortSha}
                </code>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Mensagem:</span>
                <span className="max-w-[240px] truncate text-right font-medium text-white" title={rollbackTarget?.commitMessage ? formatCommitMessagePtBr(rollbackTarget.commitMessage) : undefined}>
                  {formatCommitMessagePtBr(rollbackTarget.commitMessage)}
                </span>
              </div>
            </div>
            <p className="text-[12px] text-gray-300">
              Esta ação gerará uma nova implantação no histórico e validará a integridade do sistema pós-restauração.
            </p>
          </div>
        ) : null}
      </Modal>

      {/* MODAL 3: Visualizador Operacional de Detalhes da Implantação */}
      <Modal
        open={Boolean(selectedDetailId)}
        onClose={() => setSelectedDetailId(null)}
        title="Detalhes da Implantação"
        description={
          detailQuery.data
            ? `${detailQuery.data.commitShortSha} · ${deployStatusLabel(detailQuery.data.stage || detailQuery.data.status)} · "${formatCommitMessagePtBr(detailQuery.data.commitMessage)}"`
            : "Carregando detalhes…"
        }
        size="lg"
        footer={
          <div className="flex w-full justify-between items-center">
            <button
              type="button"
              className="admin-btn-ghost h-8.5 px-3 text-[12px] flex items-center gap-1.5 text-gray-300 hover:text-white"
              onClick={() => {
                if (detailQuery.data?.logs) {
                  const sanitized = detailQuery.data.logs
                    .replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, "Bearer [REDACTED]")
                    .replace(/(?:token|password|secret|key)=([^\s&]+)/gi, "$1=[REDACTED]");
                  void navigator.clipboard.writeText(sanitized);
                  toast({
                    title: "Logs copiados",
                    description: "Os logs de execução foram copiados para a área de transferência.",
                    kind: "success",
                  });
                }
              }}
            >
              <Copy className="h-3.5 w-3.5 text-gray-400" />
              <span>Copiar logs</span>
            </button>
            <button
              type="button"
              className="admin-btn-secondary h-8.5 px-4 text-[12px] font-medium"
              onClick={() => setSelectedDetailId(null)}
            >
              Fechar
            </button>
          </div>
        }
      >
        <div className="space-y-4 py-1">
          {detailQuery.isLoading ? (
            <p className="text-gray-500 font-mono text-[12px] py-6 text-center">Carregando detalhes do deploy…</p>
          ) : detailQuery.data ? (
            <>
              {/* 1. Progresso (Timeline Contínua) */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">Progresso</span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {STAGES.map((st, idx) => {
                    const detailStageIdx = getStageIndex(detailQuery.data!.stage || detailQuery.data!.status);
                    const isPast = detailStageIdx > idx;
                    const isCurrent = detailStageIdx === idx && detailQuery.data!.status !== "COMPLETED" && detailQuery.data!.status !== "FAILED";
                    const isFailed = detailQuery.data!.status === "FAILED" && detailStageIdx === idx;

                    return (
                      <div
                        key={st.id}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[11.5px] border transition-all",
                          isCurrent
                            ? "bg-violet-500/[0.12] border-violet-500/30 text-white font-medium shadow-[0_0_12px_rgba(139,92,246,0.1)]"
                            : isFailed
                            ? "bg-rose-500/[0.12] border-rose-500/30 text-rose-300 font-medium"
                            : isPast
                            ? "bg-white/[0.02] border-white/[0.06] text-gray-300"
                            : "bg-transparent border-white/[0.04] text-gray-400"
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-all",
                            isPast
                              ? "bg-emerald-500/20 text-emerald-400"
                              : isCurrent
                              ? "bg-violet-500 text-white"
                              : isFailed
                              ? "bg-rose-500 text-white"
                              : "bg-white/[0.06] text-gray-400"
                          )}
                        >
                          {isPast ? (
                            <Check className="h-3 w-3 stroke-[2.5]" />
                          ) : isCurrent ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : isFailed ? (
                            <XCircle className="h-3 w-3" />
                          ) : (
                            idx + 1
                          )}
                        </div>
                        <span className="truncate font-medium">{st.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 2. Informações Gerais da Implantação */}
              <div className="rounded-xl border border-white/[0.08] bg-[#0c0d12] p-3 text-[12.5px] space-y-2">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
                  <div>
                    <span className="text-gray-400 text-[10.5px] font-semibold uppercase tracking-[0.05em] block mb-0.5">Versão</span>
                    <code className="font-mono font-bold text-violet-300 text-[13px]">{detailQuery.data.commitShortSha}</code>
                  </div>
                  <div>
                    <span className="text-gray-400 text-[10.5px] font-semibold uppercase tracking-[0.05em] block mb-0.5">Branch</span>
                    <span className="font-medium text-white">{detailQuery.data.branch}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 text-[10.5px] font-semibold uppercase tracking-[0.05em] block mb-0.5">Iniciado por</span>
                    <span className="font-medium text-white truncate block">{detailQuery.data.startedBy}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 text-[10.5px] font-semibold uppercase tracking-[0.05em] block mb-0.5">Início</span>
                    <span className="text-gray-300 font-medium">{formatDate(detailQuery.data.startedAt)}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 text-[10.5px] font-semibold uppercase tracking-[0.05em] block mb-0.5">Tempo decorrido</span>
                    <span className="font-medium text-white font-mono">{formatDuration(detailLiveSeconds)}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 text-[10.5px] font-semibold uppercase tracking-[0.05em] block mb-0.5">Serviços afetados</span>
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-mono text-gray-300">API</span>
                      <span className="text-gray-600">·</span>
                      <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-mono text-gray-300">Web</span>
                    </div>
                  </div>
                </div>

                {detailQuery.data.errorSummary ? (
                  <div className="mt-2 rounded-lg bg-rose-500/[0.08] p-2.5 text-[12px] text-rose-300 border border-rose-500/20">
                    <strong className="block text-rose-200">Motivo da falha:</strong>
                    {detailQuery.data.errorSummary}
                  </div>
                ) : null}
              </div>

              {/* 3. Validação de Saúde dos Serviços */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">Validação de Saúde</span>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 text-[12.5px]">
                  {/* API */}
                  <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-[#0c0d12] p-3">
                    <span className="font-medium text-white">NexaFlow API</span>
                    {detailQuery.data.apiHealth === "HEALTHY" ? (
                      <span className="flex items-center gap-1.5 text-emerald-400 font-semibold text-[12px]">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Saudável
                      </span>
                    ) : detailQuery.data.apiHealth === "VERIFYING" ? (
                      <span className="flex items-center gap-1.5 text-violet-400 font-medium text-[12px]">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verificando...
                      </span>
                    ) : detailQuery.data.apiHealth === "UNHEALTHY" ? (
                      <span className="flex items-center gap-1.5 text-rose-400 font-semibold text-[12px]">
                        <XCircle className="h-3.5 w-3.5" /> Falhou
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-gray-400 text-[12px]">
                        <span className="h-1.5 w-1.5 rounded-full bg-gray-600" /> Aguardando
                      </span>
                    )}
                  </div>

                  {/* Web */}
                  <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-[#0c0d12] p-3">
                    <span className="font-medium text-white">NexaFlow Web</span>
                    {detailQuery.data.webHealth === "HEALTHY" ? (
                      <span className="flex items-center gap-1.5 text-emerald-400 font-semibold text-[12px]">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Saudável
                      </span>
                    ) : detailQuery.data.webHealth === "VERIFYING" ? (
                      <span className="flex items-center gap-1.5 text-violet-400 font-medium text-[12px]">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verificando...
                      </span>
                    ) : detailQuery.data.webHealth === "UNHEALTHY" ? (
                      <span className="flex items-center gap-1.5 text-rose-400 font-semibold text-[12px]">
                        <XCircle className="h-3.5 w-3.5" /> Falhou
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-gray-400 text-[12px]">
                        <span className="h-1.5 w-1.5 rounded-full bg-gray-600" /> Aguardando
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 4. Logs Operacionais Refinados */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.06em] text-gray-400 px-1">
                  <span>Logs de Execução</span>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 rounded-md bg-white/[0.03] hover:bg-white/[0.06] px-2 py-0.5 text-[10.5px] font-medium text-gray-400 hover:text-gray-200 transition-colors lowercase tracking-normal border border-white/[0.05] mr-1"
                    onClick={() => setAutoScrollLogs((s) => !s)}
                    title="Alternar rolagem automática dos logs"
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full transition-colors",
                        autoScrollLogs ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" : "bg-gray-600"
                      )}
                    />
                    <span>Auto-scroll {autoScrollLogs ? "ativo" : "pausado"}</span>
                  </button>
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-[#07080a] p-3 text-[11.5px]">
                  {detailQuery.data.logs ? (
                    <div
                      ref={logContainerRef}
                      onScroll={(e) => {
                        const el = e.currentTarget;
                        const isBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 35;
                        if (!isBottom && autoScrollLogs) {
                          setAutoScrollLogs(false);
                        } else if (isBottom && !autoScrollLogs) {
                          setAutoScrollLogs(true);
                        }
                      }}
                      className="max-h-[32vh] overflow-y-auto space-y-1 font-mono text-gray-300 leading-relaxed scrollbar-thin selection:bg-violet-500/30 pr-1"
                    >
                      {detailQuery.data.logs.split("\n").map((rawLine, lIdx) => {
                        const line = rawLine.trim();
                        if (!line) return null;

                        const match = line.match(/^\[(.*?)\]\s*(?:\[(.*?)\])?\s*(.*)$/);
                        let timeStr = "";
                        let stage = "";
                        let message = line;

                        if (match) {
                          const rawTime = match[1] || "";
                          stage = match[2] || "";
                          message = match[3] || "";

                          if (rawTime) {
                            const d = new Date(rawTime);
                            if (!isNaN(d.getTime())) {
                              timeStr = new Intl.DateTimeFormat("pt-BR", {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                                hour12: false,
                              }).format(d);
                            } else {
                              timeStr = rawTime;
                            }
                          }
                        }

                        const isSuccess = stage === "SUCCESS" || message.includes("✓") || message.includes("concluído") || message.includes("operacionais");
                        const isFailed = stage === "FAILED" || message.includes("✕") || message.includes("Falha");
                        const isWarning = stage === "WARN" || message.includes("⚠") || message.includes("timeout") || message.includes("background");

                        const cleanMessage = message.replace(/^[✓✕⚠]\s*/, "");

                        return (
                          <div
                            key={lIdx}
                            className="flex items-start gap-2.5 py-0.5 rounded px-1.5 hover:bg-white/[0.02] transition-colors"
                          >
                            <span className="w-[62px] shrink-0 text-gray-400 text-[11px] select-none font-mono tracking-tight pt-0.5">
                              {timeStr}
                            </span>

                            <div className="w-[78px] shrink-0 flex items-center justify-start pt-0.5">
                              {stage ? (
                                <span
                                  className={cn(
                                    "inline-block rounded px-1.5 py-0.2 text-[9px] font-semibold uppercase tracking-wider text-center",
                                    stage === "PREPARING" && "bg-gray-800 text-gray-300",
                                    stage === "BUILDING" && "bg-violet-500/20 text-violet-300",
                                    stage === "DEPLOYING" && "bg-blue-500/20 text-blue-300",
                                    stage === "VERIFYING" && "bg-amber-500/20 text-amber-300",
                                    (stage === "SUCCESS" || isSuccess) && "bg-emerald-500/20 text-emerald-300",
                                    (stage === "FAILED" || isFailed) && "bg-rose-500/20 text-rose-300"
                                  )}
                                >
                                  {stage}
                                </span>
                              ) : null}
                            </div>

                            <span
                              className={cn(
                                "flex-1 min-w-0 text-[11.5px] leading-relaxed break-words font-mono",
                                isSuccess && "text-emerald-300 font-medium",
                                isFailed && "text-rose-300 font-medium",
                                isWarning && "text-amber-300",
                                !isSuccess && !isFailed && !isWarning && "text-gray-300"
                              )}
                            >
                              {cleanMessage}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-gray-500 font-mono text-[11.5px] py-2 text-center">Nenhum log registrado para este deploy.</p>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </Modal>

      {/* MODAL 4: Área Segura de Configuração do EasyPanel (Write-Only Secrets) */}
      <Modal
        open={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        title="Integração com o EasyPanel"
        description="Configure a conexão utilizada para implantar novas versões em produção."
        size="md"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="admin-btn-secondary h-9"
              onClick={() => setConfigModalOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="admin-btn-ghost h-9 text-brand-300 hover:text-brand-200"
              disabled={testConnMut.isPending || !cfgUrl.trim() || !cfgProject.trim() || !cfgService.trim()}
              onClick={() =>
                testConnMut.mutate({
                  url: cfgUrl,
                  token: cfgToken.trim() || undefined,
                  projectName: cfgProject,
                  serviceName: cfgService,
                })
              }
            >
              <RefreshCw className={cn("h-3.5 w-3.5", testConnMut.isPending && "animate-spin")} />
              {testConnMut.isPending ? "Testando…" : "Testar conexão"}
            </button>
            <button
              type="button"
              className="admin-btn-primary h-9"
              disabled={saveConfigMut.isPending || !cfgUrl.trim() || !cfgProject.trim() || !cfgService.trim()}
              onClick={() =>
                saveConfigMut.mutate({
                  url: cfgUrl,
                  token: cfgToken.trim() || undefined,
                  projectName: cfgProject,
                  serviceName: cfgService,
                })
              }
            >
              {saveConfigMut.isPending ? "Salvando…" : "Salvar alterações"}
            </button>
          </DialogFooter>
        }
      >
        <div className="space-y-4 py-1">
          {/* Campo: URL do EasyPanel */}
          <FormField label="URL do servidor EasyPanel" required hint="Endereço HTTPS completo da sua instância EasyPanel">
            <input
              type="url"
              className="input"
              placeholder="https://easypanel.dominio.com.br"
              value={cfgUrl}
              onChange={(e) => setCfgUrl(e.target.value)}
            />
          </FormField>

          {/* Grid: Projeto e Serviço */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Projeto" required hint="Nome do projeto no painel">
              <input
                type="text"
                className="input"
                placeholder="i9atendimento"
                value={cfgProject}
                onChange={(e) => setCfgProject(e.target.value)}
              />
            </FormField>

            <FormField label="Serviço / Compose" required hint="Nome do serviço compose">
              <input
                type="text"
                className="input"
                placeholder="nexaflow"
                value={cfgService}
                onChange={(e) => setCfgService(e.target.value)}
              />
            </FormField>
          </div>

          {/* Campo: Credencial / Token da API (Write-Only) */}
          {tokenIsSaved ? (
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span className="text-[13px] font-semibold text-emerald-300">Token configurado</span>
                </div>
                {!isReplacingToken ? (
                  <button
                    type="button"
                    className="admin-btn-secondary h-7 px-2.5 text-[11.5px]"
                    onClick={() => {
                      setIsReplacingToken(true);
                      setCfgToken("");
                    }}
                  >
                    <KeyRound className="h-3 w-3" /> Substituir token
                  </button>
                ) : (
                  <button
                    type="button"
                    className="admin-btn-ghost h-7 px-2 text-[11.5px] text-gray-400 hover:text-white"
                    onClick={() => {
                      setIsReplacingToken(false);
                      setCfgToken("");
                    }}
                  >
                    Cancelar substituição
                  </button>
                )}
              </div>

              {!isReplacingToken ? (
                <p className="text-[11.5px] text-gray-400 leading-relaxed">
                  Por segurança, credenciais existentes nunca são exibidas ou trafegadas para o navegador.
                </p>
              ) : (
                <div className="pt-2 border-t border-white/[0.06]">
                  <FormField
                    label="Novo token da API"
                    hint="Insira uma nova chave de API para rotacionar a credencial existente."
                  >
                    <input
                      type="password"
                      className="input"
                      placeholder="Insira o novo token de API"
                      value={cfgToken}
                      onChange={(e) => setCfgToken(e.target.value)}
                      autoComplete="new-password"
                    />
                  </FormField>
                </div>
              )}
            </div>
          ) : (
            <FormField
              label="Token da API (EasyPanel API Key)"
              required
              hint="O token é tratado como segredo write-only e criptografado em repouso no servidor (AES-256-GCM)."
            >
              <input
                type="password"
                className="input"
                placeholder="Insira uma nova chave de API"
                value={cfgToken}
                onChange={(e) => setCfgToken(e.target.value)}
                autoComplete="new-password"
              />
            </FormField>
          )}

          {/* Banner de Resultado do Teste de Conexão */}
          {testResult ? (
            <div
              className={cn(
                "rounded-xl p-3 text-[12px] flex items-start gap-2.5 border transition-all",
                testResult.success
                  ? "bg-emerald-500/[0.08] text-emerald-300 border-emerald-500/20"
                  : "bg-rose-500/[0.08] text-rose-300 border-rose-500/20"
              )}
            >
              {testResult.success ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
              )}
              <div>
                <p className="font-semibold">{testResult.message}</p>
                {testResult.details ? (
                  <p className="mt-0.5 text-[11px] opacity-80 leading-relaxed">
                    URL: {testResult.details.urlAccessible ? "OK" : "Inacessível"} · Autenticação: {testResult.details.authValid ? "OK" : "Inválida"} · Projeto: {testResult.details.projectFound ? "OK" : "Não encontrado"} · Serviço: {testResult.details.serviceFound ? "OK" : "Não encontrado"}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </Modal>

      {/* MODAL 7: Área Segura de Configuração do GitHub (Write-Only Secrets) */}
      <Modal
        open={githubConfigModalOpen}
        onClose={() => setGithubConfigModalOpen(false)}
        title="Integração com o GitHub"
        description="Configure o repositório, branch e credencial de acesso para sincronização contínua de versões."
        size="md"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="admin-btn-secondary h-9"
              onClick={() => setGithubConfigModalOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="admin-btn-ghost h-9 text-brand-300 hover:text-brand-200"
              disabled={testGitHubConnMut.isPending || !githubOwner.trim() || !githubRepo.trim() || !githubBranch.trim()}
              onClick={() =>
                testGitHubConnMut.mutate({
                  owner: githubOwner.trim(),
                  repo: githubRepo.trim(),
                  branch: githubBranch.trim(),
                  token: githubToken.trim() || undefined,
                })
              }
            >
              <RefreshCw className={cn("h-3.5 w-3.5", testGitHubConnMut.isPending && "animate-spin")} />
              {testGitHubConnMut.isPending ? "Testando…" : "Testar conexão"}
            </button>
            <button
              type="button"
              className="admin-btn-primary h-9"
              disabled={saveGitHubConfigMut.isPending || !githubOwner.trim() || !githubRepo.trim() || !githubBranch.trim()}
              onClick={() =>
                saveGitHubConfigMut.mutate({
                  owner: githubOwner.trim(),
                  repo: githubRepo.trim(),
                  branch: githubBranch.trim(),
                  token: githubToken.trim() || undefined,
                })
              }
            >
              {saveGitHubConfigMut.isPending ? "Salvando…" : "Salvar alterações"}
            </button>
          </DialogFooter>
        }
      >
        <div className="space-y-4 py-1">
          {/* Grid: Dono e Repositório */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Organização / Usuário (Owner)" required hint="Nome da conta GitHub dona do projeto">
              <input
                type="text"
                className="input"
                placeholder="LuizOMS-Dev"
                value={githubOwner}
                onChange={(e) => setGithubOwner(e.target.value)}
              />
            </FormField>

            <FormField label="Nome do Repositório" required hint="Nome do repositório no GitHub">
              <input
                type="text"
                className="input"
                placeholder="nexaflow-ai"
                value={githubRepo}
                onChange={(e) => setGithubRepo(e.target.value)}
              />
            </FormField>
          </div>

          {/* Campo: Branch principal */}
          <FormField label="Branch de Implantação" required hint="Branch padrão utilizada para publicação em produção">
            <input
              type="text"
              className="input"
              placeholder="main"
              value={githubBranch}
              onChange={(e) => setGithubBranch(e.target.value)}
            />
          </FormField>

          {/* Campo: Token PAT do GitHub (Write-Only) */}
          {githubTokenIsSaved ? (
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span className="text-[13px] font-semibold text-emerald-300">Token configurado</span>
                </div>
                {!isReplacingGithubToken ? (
                  <button
                    type="button"
                    className="admin-btn-secondary h-7 px-2.5 text-[11.5px]"
                    onClick={() => {
                      setIsReplacingGithubToken(true);
                      setGithubToken("");
                    }}
                  >
                    <KeyRound className="h-3 w-3" /> Substituir token
                  </button>
                ) : (
                  <button
                    type="button"
                    className="admin-btn-ghost h-7 px-2 text-[11.5px] text-gray-400 hover:text-white"
                    onClick={() => {
                      setIsReplacingGithubToken(false);
                      setGithubToken("");
                    }}
                  >
                    Cancelar substituição
                  </button>
                )}
              </div>

              {!isReplacingGithubToken ? (
                <p className="text-[11.5px] text-gray-400 leading-relaxed">
                  Por segurança, credenciais existentes nunca são exibidas ou trafegadas para o navegador.
                </p>
              ) : (
                <div className="pt-2 border-t border-white/[0.06]">
                  <FormField
                    label="Novo token de acesso pessoal (PAT / Fine-Grained)"
                    hint="Insira um novo token do GitHub para rotacionar a credencial existente."
                  >
                    <input
                      type="password"
                      className="input"
                      placeholder="github_pat_... ou ghp_..."
                      value={githubToken}
                      onChange={(e) => setGithubToken(e.target.value)}
                      autoComplete="new-password"
                    />
                  </FormField>
                </div>
              )}
            </div>
          ) : (
            <FormField
              label="Token de Acesso Pessoal (GitHub PAT / Fine-Grained)"
              hint="O token é tratado como segredo write-only e criptografado em repouso no servidor (AES-256-GCM)."
            >
              <input
                type="password"
                className="input"
                placeholder="github_pat_... ou ghp_..."
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                autoComplete="new-password"
              />
            </FormField>
          )}

          {/* Banner de Resultado do Teste de Conexão do GitHub */}
          {githubTestResult ? (
            <div
              className={cn(
                "rounded-xl p-3 text-[12px] flex items-start gap-2.5 border transition-all",
                githubTestResult.success
                  ? "bg-emerald-500/[0.08] text-emerald-300 border-emerald-500/20"
                  : "bg-rose-500/[0.08] text-rose-300 border-rose-500/20"
              )}
            >
              {githubTestResult.success ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
              )}
              <div>
                <p className="font-semibold">{githubTestResult.message}</p>
                {githubTestResult.details ? (
                  <p className="mt-0.5 text-[11px] opacity-80 leading-relaxed">
                    Autenticação: {githubTestResult.details.authenticated ? "OK" : "Pendente/Inválida"} · Repositório: {githubTestResult.details.repoFound ? "OK" : "Não encontrado"} · Branch: {githubTestResult.details.branchFound ? "OK" : "Não encontrada"}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </Modal>

      {/* MODAL 5: Confirmação de Limpeza do Histórico Visual de Commits */}
      <Modal
        open={clearHistoryOpen}
        onClose={() => setClearHistoryOpen(false)}
        title="Limpar atualizações recentes?"
        description="Os commits exibidos nesta seção serão ocultados do histórico recente do NexaFlow. Nenhum commit, branch ou arquivo será removido do GitHub."
        size="sm"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="admin-btn-secondary h-9"
              disabled={clearHistoryMut.isPending}
              onClick={() => setClearHistoryOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="admin-btn-primary h-9 bg-rose-600 hover:bg-rose-500"
              disabled={clearHistoryMut.isPending}
              onClick={() => clearHistoryMut.mutate()}
            >
              {clearHistoryMut.isPending ? "Limpando…" : "Limpar histórico"}
            </button>
          </DialogFooter>
        }
      >
        <div className="space-y-2.5 py-1">
          <div className="flex items-start gap-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5 text-[12px] text-gray-300">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-gray-400" />
            <p className="leading-relaxed">
              Novos commits publicados depois desta limpeza continuarão aparecendo normalmente.
            </p>
          </div>
        </div>
      </Modal>

      {/* MODAL 6: Confirmação de Limpeza do Histórico de Deploys */}
      <Modal
        open={clearDeployHistoryOpen}
        onClose={() => setClearDeployHistoryOpen(false)}
        title="Limpar histórico de implantações?"
        description="Os registros exibidos no histórico serão removidos deste painel. Isso não altera a versão atualmente em produção, o código no GitHub ou qualquer serviço no EasyPanel."
        size="sm"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="admin-btn-secondary h-9"
              disabled={clearDeployHistoryMut.isPending}
              onClick={() => setClearDeployHistoryOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="admin-btn-primary h-9 bg-rose-600 hover:bg-rose-500"
              disabled={clearDeployHistoryMut.isPending}
              onClick={() => clearDeployHistoryMut.mutate()}
            >
              {clearDeployHistoryMut.isPending ? "Limpando…" : "Limpar histórico"}
            </button>
          </DialogFooter>
        }
      >
        <div className="space-y-2.5 py-1">
          <div className="flex items-start gap-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5 text-[12px] text-gray-300">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-gray-400" />
            <p className="leading-relaxed">
              Esta ação remove apenas o histórico administrativo exibido no NexaFlow.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
