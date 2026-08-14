"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  BookOpen,
  Check,
  Copy,
  FileText,
  Filter,
  GraduationCap,
  Library,
  Link2,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import {
  DialogFooter,
  Dropdown,
  DropdownItem,
  EmptyState,
  FormField,
  Modal,
  Select,
  useToast,
} from "@/components/ui";
import { KnowledgeImportWizard } from "@/components/knowledge-import-wizard";
import { TenantModule } from "@/components/tenant/tenant-module";

/* ═══════════════════════════════════════════════════════════
   Types & helpers — mesma API / mesmos contratos
   ═══════════════════════════════════════════════════════════ */

type AgentLite = { id: string; name: string; isActive?: boolean; role?: string | null };

type Doc = {
  id: string;
  title: string;
  content: string;
  category?: string | null;
  sourceType?: string | null;
  status?: string | null;
  scope?: string | null;
  syncedAt?: string | null;
  updatedAt: string;
  createdAt?: string;
  agents?: AgentLite[];
  agentCount?: number;
  usedByLabel?: string;
  sourceLabel?: string;
  statusLabel?: string;
  isSystem?: boolean;
  editableContent?: boolean;
  isStarterTemplate?: boolean;
  hasExamplePlaceholders?: boolean;
};

const EXAMPLE_MARKERS = [
  "Recurso ou serviço 1",
  "Recurso ou serviço 2",
  "Recurso ou serviço 3",
  "Personalize este conteúdo",
  "Remova todas as informações de exemplo",
  "Valor: R$ 99,00 por mês",
  "Valor: R$ 199,00 por mês",
];

function hasExamplePlaceholders(content: string) {
  return EXAMPLE_MARKERS.some((m) => (content || "").includes(m));
}

type FormState = {
  title: string;
  category: string;
  content: string;
  status: "draft" | "ready" | "archived";
  scope: "all" | "agents";
  agentIds: string[];
};

const emptyForm = (): FormState => ({
  title: "",
  category: "Geral",
  content: "",
  status: "ready",
  scope: "all",
  agentIds: [],
});

const CATEGORY_LABEL: Record<string, string> = {
  comercial: "Comercial",
  suporte: "Suporte",
  regras: "Políticas",
  politicas: "Políticas",
  produtos: "Produtos",
  faq: "FAQ",
  geral: "Geral",
  aprendizado: "Aprendizado",
  outros: "Outros",
};

function categoryLabel(raw?: string | null): string {
  if (!raw?.trim()) return "Geral";
  const key = raw.trim().toLowerCase();
  return CATEGORY_LABEL[key] || raw.trim().replace(/^\w/, (c) => c.toUpperCase());
}

function normalizeTitle(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function statusMeta(status?: string | null): {
  text: string;
  key: "draft" | "ready" | "archived" | "processing";
  className: string;
  dot: string;
} {
  const s = (status || "ready").toLowerCase();
  if (s === "processing" || s === "processando") {
    return {
      text: "Processando",
      key: "processing",
      className:
        "bg-sky-500/[0.12] text-sky-800 ring-1 ring-inset ring-sky-500/20 dark:text-sky-200",
      dot: "bg-sky-500 animate-pulse",
    };
  }
  if (s === "draft" || s === "rascunho") {
    return {
      text: "Rascunho",
      key: "draft",
      className:
        "bg-amber-500/[0.12] text-amber-800 ring-1 ring-inset ring-amber-500/20 dark:text-amber-200",
      dot: "bg-amber-500",
    };
  }
  if (s === "archived" || s === "arquivado") {
    return {
      text: "Arquivado",
      key: "archived",
      className:
        "bg-black/[0.05] text-ink-muted ring-1 ring-inset ring-black/[0.06] dark:bg-white/[0.06] dark:ring-white/[0.08]",
      dot: "bg-ink-faint",
    };
  }
  return {
    text: "Pronto",
    key: "ready",
    className:
      "bg-emerald-500/[0.12] text-emerald-800 ring-1 ring-inset ring-emerald-500/20 dark:text-emerald-200",
    dot: "bg-emerald-500",
  };
}

/** Status de formulário (draft/ready/archived) — processando mapeia para rascunho na edição */
function formStatusKey(status?: string | null): "draft" | "ready" | "archived" {
  const k = statusMeta(status).key;
  if (k === "processing") return "draft";
  return k;
}

function sourceMeta(doc: Doc): {
  label: string;
  key: string;
  Icon: typeof BookOpen;
} {
  // "Planos e preços" da empresa nunca é SYSTEM/plataforma
  const t = (doc.sourceType || "manual").toLowerCase();
  if (t === "system") return { label: "Manual", key: "manual", Icon: BookOpen };
  if (t === "document" || t === "pdf" || t === "file")
    return { label: "Documento", key: "document", Icon: FileText };
  if (t === "import") return { label: "Importação", key: "import", Icon: Upload };
  if (t === "gap") return { label: "Lacuna resolvida", key: "gap", Icon: Sparkles };
  if (t === "learning") return { label: "Aprendizado", key: "learning", Icon: GraduationCap };
  return { label: doc.sourceLabel || "Manual", key: "manual", Icon: BookOpen };
}

function isStarterModel(doc: Doc) {
  return Boolean(
    doc.isStarterTemplate ||
      doc.hasExamplePlaceholders ||
      hasExamplePlaceholders(doc.content) ||
      doc.title === "Planos e preços"
  );
}

function usedByText(doc: Doc): string {
  if (doc.usedByLabel) return doc.usedByLabel;
  if ((doc.scope || "all") === "all") return "Todos os agentes";
  const agents = doc.agents || [];
  if (!agents.length) return "Sem agentes";
  if (agents.length === 1) return agents[0].name;
  return `${agents.length} agentes`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

/* ═══════════════════════════════════════════════════════════
   Page
   ═══════════════════════════════════════════════════════════ */

export default function KnowledgePage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const searchRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [agentFilter, setAgentFilter] = useState("ALL");

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewDoc, setViewDoc] = useState<Doc | null>(null);
  const [editDoc, setEditDoc] = useState<Doc | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<Doc | null>(null);
  const [archiveDoc, setArchiveDoc] = useState<Doc | null>(null);
  /** Seleção múltipla para exclusão em massa */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editForm, setEditForm] = useState<FormState>(emptyForm());

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["knowledge"],
    queryFn: () => api<Doc[]>("/knowledge"),
  });

  const agentsQ = useQuery({
    queryKey: ["ai-agents"],
    queryFn: () => api<AgentLite[]>("/ai-agents"),
    staleTime: 60_000,
  });

  /* ── mutations (preservadas) ── */

  const createMutation = useMutation({
    mutationFn: (publish: boolean) =>
      api("/knowledge", {
        method: "POST",
        json: {
          title: form.title.trim(),
          category: form.category.trim() || "Geral",
          content: form.content.trim(),
          status: publish ? "ready" : "draft",
          scope: form.scope,
          agentIds: form.scope === "agents" ? form.agentIds : [],
          sourceType: "manual",
        },
      }),
    onSuccess: (_d, publish) => {
      qc.invalidateQueries({ queryKey: ["knowledge"] });
      setCreateOpen(false);
      setForm(emptyForm());
      toast({
        kind: "success",
        title: publish ? "Conhecimento publicado" : "Rascunho salvo",
      });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível salvar", description: e.message }),
  });

  const updateMutation = useMutation({
    mutationFn: (opts?: { forceStatus?: "draft" | "ready" | "archived" }) => {
      const status = opts?.forceStatus ?? editForm.status;
      const content = editForm.content.trim();
      if (status === "ready" && hasExamplePlaceholders(content)) {
        return Promise.reject(
          new Error(
            "Este conhecimento ainda contém informações de exemplo. Revise o conteúdo antes de publicar."
          )
        );
      }
      return api<Doc>(`/knowledge/${editDoc!.id}`, {
        method: "PATCH",
        json: {
          title: editForm.title.trim(),
          content,
          category: editForm.category.trim() || "Geral",
          status,
          scope: editForm.scope,
          agentIds: editForm.scope === "agents" ? editForm.agentIds : [],
        },
      });
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["knowledge"] });
      setEditDoc(null);
      if (viewDoc?.id === updated.id) setViewDoc(updated);
      toast({ kind: "success", title: "Conhecimento atualizado" });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível salvar", description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/knowledge/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["knowledge"] });
      setDeleteDoc(null);
      setViewDoc(null);
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      toast({ kind: "success", title: "Conhecimento excluído" });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível excluir", description: e.message }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) =>
      api<{ ok: boolean; deleted: number }>("/knowledge/bulk-delete", {
        method: "POST",
        json: { ids },
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["knowledge"] });
      setBulkDeleteOpen(false);
      setSelectedIds([]);
      setViewDoc(null);
      toast({
        kind: "success",
        title:
          res.deleted === 1
            ? "1 conhecimento excluído"
            : `${res.deleted} conhecimentos excluídos`,
      });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível excluir", description: e.message }),
  });

  const archiveMutation = useMutation({
    mutationFn: (doc: Doc) =>
      api<Doc>(`/knowledge/${doc.id}`, {
        method: "PATCH",
        json: { status: doc.status === "archived" ? "ready" : "archived" },
      }),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["knowledge"] });
      setArchiveDoc(null);
      toast({
        kind: "success",
        title:
          updated.status === "archived" ? "Conhecimento arquivado" : "Conhecimento reativado",
      });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível atualizar", description: e.message }),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => api<Doc>(`/knowledge/${id}/duplicate`, { method: "POST" }),
    onSuccess: (doc) => {
      qc.invalidateQueries({ queryKey: ["knowledge"] });
      toast({
        kind: "success",
        title: "Conhecimento duplicado como rascunho",
      });
      openEdit(doc);
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível duplicar", description: e.message }),
  });

  /* ── derived ── */

  const docs = data || [];
  const agentList = agentsQ.data || [];

  // Remove da seleção IDs que não existem mais (evita loop: só setState se mudar)
  useEffect(() => {
    const list = data;
    setSelectedIds((prev) => {
      if (prev.length === 0) return prev;
      if (!list?.length) return [];
      const alive = new Set(list.map((d) => d.id));
      const next = prev.filter((id) => alive.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [data]);

  const stats = useMemo(() => {
    let ready = 0;
    let draft = 0;
    let archived = 0;
    let processing = 0;
    const agentIds = new Set<string>();
    for (const d of docs) {
      const k = statusMeta(d.status).key;
      if (k === "ready") ready += 1;
      else if (k === "draft") draft += 1;
      else if (k === "processing") processing += 1;
      else archived += 1;
      if ((d.scope || "all") === "all") {
        agentList.forEach((a) => agentIds.add(a.id));
      } else {
        (d.agents || []).forEach((a) => agentIds.add(a.id));
      }
    }
    return {
      total: docs.length,
      ready,
      draft,
      archived,
      processing,
      agentsUsing:
        agentIds.size ||
        (docs.some((d) => (d.scope || "all") === "all") ? agentList.length : 0),
    };
  }, [docs, agentList]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const d of docs) {
      if (d.category?.trim()) set.add(d.category.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [docs]);

  const duplicateIds = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const d of docs) {
      const key = normalizeTitle(d.title);
      if (!key) continue;
      const list = map.get(key) || [];
      list.push(d.id);
      map.set(key, list);
    }
    const dups = new Set<string>();
    for (const ids of map.values()) {
      if (ids.length > 1) ids.forEach((id) => dups.add(id));
    }
    return dups;
  }, [docs]);

  const hasSelectFilters =
    categoryFilter !== "ALL" ||
    statusFilter !== "ALL" ||
    sourceFilter !== "ALL" ||
    agentFilter !== "ALL";
  const hasFilters = Boolean(search.trim()) || hasSelectFilters;
  const activeFilterCount = [
    categoryFilter !== "ALL",
    statusFilter !== "ALL",
    sourceFilter !== "ALL",
    agentFilter !== "ALL",
  ].filter(Boolean).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter((d) => {
      if (categoryFilter !== "ALL") {
        const cat = (d.category || "Geral").trim();
        if (cat.toLowerCase() !== categoryFilter.toLowerCase()) return false;
      }
      if (statusFilter !== "ALL") {
        const key = statusMeta(d.status).key;
        const mapped = key === "processing" ? "draft" : key;
        if (mapped !== statusFilter && key !== statusFilter) return false;
      }
      if (sourceFilter !== "ALL") {
        const src = (d.sourceType || "manual").toLowerCase();
        const mapped = src === "text" ? "manual" : src;
        if (mapped !== sourceFilter && !(sourceFilter === "system" && d.isSystem)) return false;
      }
      if (agentFilter !== "ALL") {
        if ((d.scope || "all") !== "all") {
          const ids = (d.agents || []).map((a) => a.id);
          if (!ids.includes(agentFilter)) return false;
        }
      }
      if (!q) return true;
      return (
        d.title.toLowerCase().includes(q) ||
        d.content.toLowerCase().includes(q) ||
        (d.category || "").toLowerCase().includes(q)
      );
    });
  }, [docs, search, categoryFilter, statusFilter, sourceFilter, agentFilter]);

  const filteredIds = useMemo(() => filtered.map((d) => d.id), [filtered]);
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));
  const someFilteredSelected =
    filteredIds.some((id) => selectedIds.includes(id)) && !allFilteredSelected;

  function clearFilters() {
    setSearch("");
    setCategoryFilter("ALL");
    setStatusFilter("ALL");
    setSourceFilter("ALL");
    setAgentFilter("ALL");
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSelectAllFiltered() {
    if (allFilteredSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
      return;
    }
    setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  function openEdit(doc: Doc) {
    setEditDoc(doc);
    setEditForm({
      title: doc.title,
      category: doc.category || "Geral",
      content: doc.content,
      status: formStatusKey(doc.status),
      scope: doc.scope === "agents" ? "agents" : "all",
      agentIds: (doc.agents || []).map((a) => a.id),
    });
  }

  function openCreateManual() {
    setAddMenuOpen(false);
    setForm(emptyForm());
    setCreateOpen(true);
  }

  function openImport() {
    setAddMenuOpen(false);
    setImportOpen(true);
  }

  function focusSearch() {
    searchRef.current?.focus();
    searchRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const categoryOptions = [
    { value: "ALL", label: "Categoria" },
    ...categories.map((c) => ({ value: c, label: categoryLabel(c) })),
  ];

  const statusOptions = [
    { value: "ALL", label: "Status" },
    { value: "ready", label: "Pronto" },
    { value: "draft", label: "Rascunho" },
    { value: "archived", label: "Arquivado" },
  ];

  const sourceOptions = [
    { value: "ALL", label: "Origem" },
    { value: "manual", label: "Manual" },
    { value: "import", label: "Importação" },
    { value: "system", label: "Sistema" },
    { value: "learning", label: "Aprendizado" },
    { value: "gap", label: "Lacuna" },
  ];

  const agentOptions = [
    { value: "ALL", label: "Agente" },
    ...agentList.map((a) => ({ value: a.id, label: a.name })),
  ];

  const filterSelectClass = (active: boolean) =>
    cn(
      "h-9 text-[12.5px]",
      active &&
        "border-violet-500/[0.35] bg-violet-500/[0.06] ring-1 ring-inset ring-violet-500/20 dark:border-violet-400/[0.35] dark:bg-violet-500/[0.1]"
    );

  /* ═══════════════════════════════════════════════════════════
     Render
     ═══════════════════════════════════════════════════════════ */

  return (
    <TenantModule
      kind="library"
      title="Conhecimento"
      kicker="Biblioteca"
      actions={
        <div className="flex flex-wrap items-center gap-2" data-tour="knowledge-header">
          <button
            type="button"
            className="btn-secondary h-9 px-3 text-[13px]"
            onClick={focusSearch}
            aria-label="Buscar na biblioteca"
          >
            <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
            Busca
          </button>
          <button
            type="button"
            className="btn-secondary h-9 px-3 text-[13px]"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="h-3.5 w-3.5" strokeWidth={1.75} />
            Importar
          </button>
          <button
            type="button"
            className="btn-primary h-9 px-4 text-[13px]"
            onClick={() => setAddMenuOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            Adicionar conhecimento
          </button>
        </div>
      }
    >
      {/* ── Resumo da biblioteca ── */}
      {!isLoading && docs.length > 0 ? (
        <div className="flex flex-wrap items-stretch gap-y-1 rounded-2xl border border-teal-500/15 bg-[var(--surface-raised)] px-2 py-2.5 dark:border-teal-400/15 sm:px-3">
          <StatPill label="Na biblioteca" value={stats.total} />
          <StatDivider />
          <StatPill label="Prontos" value={stats.ready} accent="emerald" />
          <StatDivider />
          <StatPill label="Rascunhos" value={stats.draft + stats.processing} accent="amber" />
          <StatDivider />
          <StatPill label="Arquivados" value={stats.archived} />
          <StatDivider />
          <StatPill
            label={stats.agentsUsing === 1 ? "Agente com acesso" : "Agentes com acesso"}
            value={stats.agentsUsing}
          />
        </div>
      ) : null}

      {/* ── Layout biblioteca: rail de categorias + acervo ── */}
      {docs.length > 0 || hasFilters || isLoading ? (
        <div className="nf-library-layout">
          <nav className="nf-library-rail hidden min-[900px]:block" aria-label="Categorias">
            <button
              type="button"
              data-active={categoryFilter === "ALL" ? "true" : "false"}
              onClick={() => setCategoryFilter("ALL")}
            >
              Todas
              <span className="ml-1 tabular-nums opacity-60">{stats.total}</span>
            </button>
            {categories.map((c) => {
              const count = docs.filter(
                (d) => (d.category || "").toLowerCase() === c.toLowerCase()
              ).length;
              return (
                <button
                  key={c}
                  type="button"
                  data-active={categoryFilter.toLowerCase() === c.toLowerCase() ? "true" : "false"}
                  onClick={() => setCategoryFilter(c)}
                >
                  {categoryLabel(c)}
                  <span className="ml-1 tabular-nums opacity-60">{count}</span>
                </button>
              );
            })}
          </nav>

          <div className="overflow-hidden rounded-2xl border border-black/[0.06] bg-[var(--surface-raised)] dark:border-white/[0.07]">
          {/* Toolbar */}
          <div className="space-y-2.5 border-b border-black/[0.05] p-3 dark:border-white/[0.06] sm:p-3.5">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
                <input
                  ref={searchRef}
                  className="input h-10 pl-9 text-[13.5px]"
                  placeholder="Buscar por título, categoria ou conteúdo…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Buscar na biblioteca de conhecimento"
                />
                {search ? (
                  <button
                    type="button"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-faint hover:bg-black/[0.05] hover:text-ink-muted dark:hover:bg-white/[0.08]"
                    onClick={() => setSearch("")}
                    aria-label="Limpar busca"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>

              <div className="hidden w-full grid-cols-2 gap-2 sm:grid lg:flex lg:w-auto lg:shrink-0">
                <Select
                  className="min-w-0 min-[900px]:hidden lg:w-[160px]"
                  size="sm"
                  triggerClassName={filterSelectClass(categoryFilter !== "ALL")}
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                  options={categoryOptions}
                  aria-label="Filtrar por categoria"
                />
                <Select
                  className="min-w-0 lg:w-[140px]"
                  size="sm"
                  triggerClassName={filterSelectClass(statusFilter !== "ALL")}
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={statusOptions}
                  aria-label="Filtrar por status"
                />
                <Select
                  className="min-w-0 lg:w-[140px]"
                  size="sm"
                  triggerClassName={filterSelectClass(sourceFilter !== "ALL")}
                  value={sourceFilter}
                  onChange={setSourceFilter}
                  options={sourceOptions}
                  aria-label="Filtrar por origem"
                />
                {agentList.length > 0 ? (
                  <Select
                    className="min-w-0 lg:w-[160px]"
                    size="sm"
                    triggerClassName={filterSelectClass(agentFilter !== "ALL")}
                    value={agentFilter}
                    onChange={setAgentFilter}
                    options={agentOptions}
                    aria-label="Filtrar por agente"
                  />
                ) : null}
              </div>

              <button
                type="button"
                className={cn(
                  "inline-flex h-9 items-center justify-center gap-2 rounded-xl border px-3.5 text-[13px] font-medium transition-colors duration-150 sm:hidden",
                  hasSelectFilters
                    ? "border-violet-500/[0.35] bg-violet-500/[0.08] text-violet-800 dark:text-violet-200"
                    : "border-black/[0.08] bg-white text-ink-secondary dark:border-white/[0.1] dark:bg-white/[0.03] dark:text-gray-300"
                )}
                onClick={() => setFiltersOpen(true)}
              >
                <Filter className="h-3.5 w-3.5" strokeWidth={1.75} />
                Filtros
                {activeFilterCount > 0 ? (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-500/20 px-1.5 text-[11px] font-semibold tabular-nums text-violet-800 dark:text-violet-200">
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>
            </div>

            {hasFilters ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11.5px] tabular-nums text-ink-faint">
                  {filtered.length}{" "}
                  {filtered.length === 1 ? "item na biblioteca" : "itens na biblioteca"}
                </span>
                <button
                  type="button"
                  className="inline-flex h-7 items-center gap-1 rounded-full bg-black/[0.04] px-2.5 text-[11px] font-medium text-ink-muted transition-colors duration-150 hover:bg-black/[0.07] dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
                  onClick={clearFilters}
                >
                  <X className="h-3 w-3" />
                  Limpar filtros
                </button>
              </div>
            ) : null}

            {/* Seleção em massa */}
            {!isLoading && filtered.length > 0 ? (
              <div
                className={cn(
                  "flex flex-wrap items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors duration-150",
                  selectedIds.length > 0
                    ? "border-violet-500/25 bg-violet-500/[0.06] dark:border-violet-400/25 dark:bg-violet-500/[0.08]"
                    : "border-black/[0.05] bg-black/[0.015] dark:border-white/[0.07] dark:bg-white/[0.02]"
                )}
              >
                <button
                  type="button"
                  onClick={toggleSelectAllFiltered}
                  className="inline-flex items-center gap-2.5 rounded-xl py-0.5 pr-1 text-left transition-colors duration-150 hover:opacity-90"
                  aria-pressed={allFilteredSelected}
                  aria-label={
                    allFilteredSelected
                      ? "Desmarcar todos"
                      : hasFilters
                        ? `Selecionar todos os ${filtered.length} resultados`
                        : "Selecionar todos"
                  }
                >
                  <SelectMark
                    checked={allFilteredSelected}
                    partial={someFilteredSelected}
                    size="md"
                  />
                  <span className="text-[12.5px] font-medium text-ink-secondary dark:text-gray-300">
                    {allFilteredSelected
                      ? "Tudo selecionado"
                      : someFilteredSelected
                        ? "Seleção parcial"
                        : hasFilters
                          ? `Selecionar lista (${filtered.length})`
                          : "Selecionar todos"}
                  </span>
                </button>

                {selectedIds.length > 0 ? (
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <span className="inline-flex h-7 items-center rounded-full bg-violet-500/[0.15] px-2.5 text-[11px] font-semibold tabular-nums text-violet-800 dark:bg-violet-500/20 dark:text-violet-200">
                      {selectedIds.length}{" "}
                      {selectedIds.length === 1 ? "selecionado" : "selecionados"}
                    </span>
                    <button
                      type="button"
                      className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-black/[0.06] bg-white px-2.5 text-[12px] font-medium text-ink-muted transition-colors duration-150 hover:bg-black/[0.03] dark:border-white/[0.1] dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
                      onClick={clearSelection}
                    >
                      Limpar
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-rose-500/90 px-3 text-[12px] font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-rose-500"
                      onClick={() => setBulkDeleteOpen(true)}
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Excluir
                    </button>
                  </div>
                ) : (
                  <span className="ml-auto hidden text-[11px] text-ink-faint sm:inline">
                    Selecione itens para ações em massa
                  </span>
                )}
              </div>
            ) : null}
          </div>

          {/* Lista / estados */}
          {isLoading ? (
            <div className="divide-y divide-black/[0.04] dark:divide-white/[0.05]">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="skeleton h-4 w-4 rounded" />
                  <div className="skeleton h-9 w-9 rounded-xl" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="skeleton h-4 w-2/5" />
                    <div className="skeleton h-3 w-1/3" />
                  </div>
                  <div className="skeleton hidden h-6 w-16 rounded-full sm:block" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm font-semibold text-ink dark:text-white">
                Não foi possível carregar a biblioteca
              </p>
              <p className="mt-1 text-[13px] text-ink-muted">
                {error instanceof Error ? error.message : "Tente novamente em instantes."}
              </p>
              <button type="button" className="btn-primary mt-4 h-9 px-4" onClick={() => refetch()}>
                Tentar novamente
              </button>
            </div>
          ) : !filtered.length ? (
            <div className="p-6">
              <EmptyState
                compact
                title="Nenhum resultado nesta busca"
                description="Ajuste o termo ou limpe os filtros para ver o acervo completo."
                action={
                  <button type="button" className="btn-secondary h-9" onClick={clearFilters}>
                    Limpar filtros
                  </button>
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.05]" role="list">
              {filtered.map((doc) => (
                <KnowledgeRow
                  key={doc.id}
                  doc={doc}
                  isDup={duplicateIds.has(doc.id)}
                  selected={selectedIds.includes(doc.id)}
                  onToggleSelect={() => toggleSelect(doc.id)}
                  onView={() => setViewDoc(doc)}
                  onEdit={() => openEdit(doc)}
                  onDuplicate={() => duplicateMutation.mutate(doc.id)}
                  onArchive={() => setArchiveDoc(doc)}
                  onDelete={() => setDeleteDoc(doc)}
                />
              ))}
            </ul>
          )}
          </div>
        </div>
      ) : null}

      {/* Empty global (sem docs e sem filtros) */}
      {!isLoading && !isError && !docs.length && !hasFilters ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-violet-500/20 bg-gradient-to-b from-violet-500/[0.05] to-transparent px-6 py-16 text-center dark:border-violet-400/15 dark:from-violet-500/[0.08]">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/[0.12] text-violet-600 ring-1 ring-violet-500/15 dark:text-violet-300">
            <Library className="h-6 w-6" strokeWidth={1.5} />
          </span>
          <h2 className="mt-5 font-display text-lg font-semibold tracking-tight text-ink dark:text-white">
            Biblioteca vazia
          </h2>
          <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-ink-muted">
            Guarde aqui o que os agentes precisam saber — horários, preços, políticas e respostas
            frequentes. Depois é só publicar.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              className="btn-primary h-9 px-4"
              onClick={() => setAddMenuOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar conhecimento
            </button>
            <button
              type="button"
              className="btn-secondary h-9 px-4"
              onClick={() => setImportOpen(true)}
            >
              <Upload className="h-3.5 w-3.5" />
              Importar arquivo
            </button>
          </div>
        </div>
      ) : null}

      {/* Drawer mobile de filtros */}
      <Modal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filtros"
        description="Refine o que aparece na biblioteca."
        size="sm"
        variant="quick"
        footer={
          <DialogFooter>
            {hasSelectFilters ? (
              <button
                type="button"
                className="btn-ghost h-9 px-3 text-[13px]"
                onClick={() => {
                  setCategoryFilter("ALL");
                  setStatusFilter("ALL");
                  setSourceFilter("ALL");
                  setAgentFilter("ALL");
                }}
              >
                Limpar
              </button>
            ) : null}
            <button
              type="button"
              className="btn-primary h-9 px-4"
              onClick={() => setFiltersOpen(false)}
            >
              Aplicar
            </button>
          </DialogFooter>
        }
      >
        <div className="grid gap-3">
          <Select
            size="sm"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={categoryOptions}
            aria-label="Categoria"
            triggerClassName={filterSelectClass(categoryFilter !== "ALL")}
          />
          <Select
            size="sm"
            value={statusFilter}
            onChange={setStatusFilter}
            options={statusOptions}
            aria-label="Status"
            triggerClassName={filterSelectClass(statusFilter !== "ALL")}
          />
          <Select
            size="sm"
            value={sourceFilter}
            onChange={setSourceFilter}
            options={sourceOptions}
            aria-label="Origem"
            triggerClassName={filterSelectClass(sourceFilter !== "ALL")}
          />
          {agentList.length > 0 ? (
            <Select
              size="sm"
              value={agentFilter}
              onChange={setAgentFilter}
              options={agentOptions}
              aria-label="Agente"
              triggerClassName={filterSelectClass(agentFilter !== "ALL")}
            />
          ) : null}
        </div>
      </Modal>

      <KnowledgeImportWizard
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={() => {
          void qc.invalidateQueries({ queryKey: ["knowledge"] });
        }}
      />

      {/* ── Modal: escolher origem ── */}
      <Modal
        open={addMenuOpen}
        onClose={() => setAddMenuOpen(false)}
        title="Adicionar conhecimento"
        icon={<Plus className="h-4 w-4" strokeWidth={1.75} />}
        size="md"
        variant="soft"
        tone="brand"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="btn-secondary h-9"
              onClick={() => setAddMenuOpen(false)}
            >
              Cancelar
            </button>
          </DialogFooter>
        }
      >
        <div className="grid gap-2">
          <OriginChoice
            icon={<BookOpen className="h-4 w-4" strokeWidth={1.75} />}
            title="Escrever manualmente"
            description="Título, texto e quem pode usar — ideal para um item por vez."
            accent="brand"
            onClick={openCreateManual}
          />
          <OriginChoice
            icon={<Upload className="h-4 w-4" strokeWidth={1.75} />}
            title="Importar arquivo"
            description="Arquivo .txt ou .md. Você revisa antes de confirmar."
            accent="violet"
            onClick={openImport}
          />
        </div>
      </Modal>

      {/* ── Modal: criar manual ── */}
      <Modal
        open={createOpen}
        onClose={() => !createMutation.isPending && setCreateOpen(false)}
        title="Novo conhecimento"
        icon={<BookOpen className="h-4 w-4" strokeWidth={1.75} />}
        size="lg"
        variant="contextual"
        tone="brand"
        preventClose={createMutation.isPending}
        footer={
          <DialogFooter>
            <button
              type="button"
              className="btn-ghost h-9 px-3 text-[13px]"
              disabled={createMutation.isPending}
              onClick={() => setCreateOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-secondary h-9 px-3.5"
              disabled={
                createMutation.isPending ||
                !form.title.trim() ||
                !form.content.trim() ||
                (form.scope === "agents" && form.agentIds.length === 0)
              }
              onClick={() => createMutation.mutate(false)}
            >
              Salvar rascunho
            </button>
            <button
              type="button"
              className="btn-primary h-9 px-4"
              disabled={
                createMutation.isPending ||
                !form.title.trim() ||
                !form.content.trim() ||
                (form.scope === "agents" && form.agentIds.length === 0)
              }
              onClick={() => createMutation.mutate(true)}
            >
              {createMutation.isPending ? "Publicando…" : "Publicar"}
            </button>
          </DialogFooter>
        }
      >
        <KnowledgeFormBody
          form={form}
          setForm={setForm}
          agentList={agentList}
          categories={categories}
          mode="create"
        />
      </Modal>

      {/* ── Modal: visualizar ── */}
      <Modal
        open={!!viewDoc}
        onClose={() => setViewDoc(null)}
        title={viewDoc?.title || "Conhecimento"}
        icon={<FileText className="h-4 w-4" strokeWidth={1.75} />}
        size="lg"
        variant="detail"
        footer={
          <DialogFooter>
            <button type="button" className="btn-secondary h-9 px-3.5" onClick={() => setViewDoc(null)}>
              Fechar
            </button>
            {viewDoc ? (
              <button
                type="button"
                className="btn-primary h-9 px-4"
                onClick={() => {
                  openEdit(viewDoc);
                  setViewDoc(null);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </button>
            ) : null}
          </DialogFooter>
        }
      >
        {viewDoc ? <KnowledgeReadView doc={viewDoc} isDup={duplicateIds.has(viewDoc.id)} /> : null}
      </Modal>

      {/* ── Modal: editar ── */}
      <Modal
        open={!!editDoc}
        onClose={() => !updateMutation.isPending && setEditDoc(null)}
        title="Editar conhecimento"
        description={editDoc?.title}
        icon={<Pencil className="h-4 w-4" strokeWidth={1.75} />}
        size="lg"
        variant="contextual"
        preventClose={updateMutation.isPending}
        footer={
          <DialogFooter>
            <button
              type="button"
              className="btn-ghost h-9 px-3"
              disabled={updateMutation.isPending}
              onClick={() => setEditDoc(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-secondary h-9 px-3.5"
              disabled={
                updateMutation.isPending ||
                (editForm.scope === "agents" && editForm.agentIds.length === 0)
              }
              onClick={() => {
                setEditForm((f) => ({ ...f, status: "draft" }));
                updateMutation.mutate({ forceStatus: "draft" });
              }}
            >
              Salvar rascunho
            </button>
            <button
              type="button"
              className="btn-primary h-9 px-4"
              disabled={
                updateMutation.isPending ||
                (editForm.scope === "agents" && editForm.agentIds.length === 0)
              }
              onClick={() => updateMutation.mutate({ forceStatus: "ready" })}
            >
              {updateMutation.isPending ? "Salvando…" : "Salvar alterações"}
            </button>
          </DialogFooter>
        }
      >
        {editDoc ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 font-medium",
                  statusMeta(editDoc.status).className
                )}
              >
                {statusMeta(editDoc.status).text}
              </span>
              <span className="rounded-full bg-black/[0.04] px-2 py-0.5 dark:bg-white/[0.06]">
                {sourceMeta(editDoc).label}
              </span>
              <span>Atualizado {formatDate(editDoc.updatedAt)}</span>
            </div>

            {isStarterModel(editDoc) || hasExamplePlaceholders(editForm.content) ? (
              <p className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-[12px] text-amber-900 dark:text-amber-100">
                Este é um modelo inicial. Substitua os exemplos pelas informações reais da sua
                empresa antes de publicar.
              </p>
            ) : null}

            <KnowledgeFormBody
              form={editForm}
              setForm={setEditForm}
              agentList={agentList}
              categories={categories}
              mode="edit"
            />
          </div>
        ) : null}
      </Modal>

      {/* ── Arquivar ── */}
      <Modal
        open={!!archiveDoc}
        onClose={() => setArchiveDoc(null)}
        title={
          statusMeta(archiveDoc?.status).key === "archived"
            ? "Reativar conhecimento?"
            : "Arquivar conhecimento?"
        }
        description={
          statusMeta(archiveDoc?.status).key === "archived"
            ? "Ele voltará a ficar disponível para os agentes, conforme a disponibilidade."
            : "Ele deixará de ser utilizado pelos agentes, mas continuará na biblioteca."
        }
        variant="confirm"
        size="sm"
        footer={
          <DialogFooter>
            <button type="button" className="btn-secondary h-9" onClick={() => setArchiveDoc(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary h-9"
              disabled={archiveMutation.isPending}
              onClick={() => archiveDoc && archiveMutation.mutate(archiveDoc)}
            >
              {archiveMutation.isPending
                ? "…"
                : statusMeta(archiveDoc?.status).key === "archived"
                  ? "Reativar"
                  : "Arquivar"}
            </button>
          </DialogFooter>
        }
      >
        {archiveDoc ? (
          <p className="text-sm font-medium text-ink dark:text-white">{archiveDoc.title}</p>
        ) : null}
      </Modal>

      {/* ── Excluir ── */}
      <Modal
        open={!!deleteDoc}
        onClose={() => setDeleteDoc(null)}
        title="Excluir este conhecimento?"
        description={
          deleteDoc && (deleteDoc.agentCount || 0) > 0
            ? `Este conhecimento é utilizado por ${deleteDoc.agentCount} agente(s). Prefira arquivar se o histórico for relevante.`
            : "Os agentes deixarão de consultar este conteúdo. Esta ação não pode ser desfeita."
        }
        variant="danger"
        tone="danger"
        size="sm"
        preventClose={deleteMutation.isPending}
        footer={
          <DialogFooter>
            <button
              type="button"
              className="btn-secondary h-9"
              disabled={deleteMutation.isPending}
              onClick={() => setDeleteDoc(null)}
            >
              Cancelar
            </button>
            {deleteDoc ? (
              <button
                type="button"
                className="btn-secondary h-9"
                onClick={() => {
                  setArchiveDoc(deleteDoc);
                  setDeleteDoc(null);
                }}
              >
                Arquivar
              </button>
            ) : null}
            <button
              type="button"
              className="btn-danger h-9"
              disabled={deleteMutation.isPending}
              onClick={() => deleteDoc && deleteMutation.mutate(deleteDoc.id)}
            >
              {deleteMutation.isPending ? "Excluindo…" : "Excluir"}
            </button>
          </DialogFooter>
        }
      >
        {deleteDoc ? (
          <p className="text-sm font-medium text-ink dark:text-white">{deleteDoc.title}</p>
        ) : null}
      </Modal>

      {/* ── Excluir em massa ── */}
      <Modal
        open={bulkDeleteOpen}
        onClose={() => !bulkDeleteMutation.isPending && setBulkDeleteOpen(false)}
        title={
          selectedIds.length === 1
            ? "Excluir 1 conhecimento?"
            : `Excluir ${selectedIds.length} conhecimentos?`
        }
        description="Os agentes deixarão de consultar esses conteúdos. Esta ação não pode ser desfeita."
        variant="danger"
        tone="danger"
        size="sm"
        preventClose={bulkDeleteMutation.isPending}
        footer={
          <DialogFooter>
            <button
              type="button"
              className="btn-secondary h-9"
              disabled={bulkDeleteMutation.isPending}
              onClick={() => setBulkDeleteOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-danger h-9"
              disabled={bulkDeleteMutation.isPending || selectedIds.length === 0}
              onClick={() => bulkDeleteMutation.mutate(selectedIds)}
            >
              {bulkDeleteMutation.isPending
                ? "Excluindo…"
                : selectedIds.length === 1
                  ? "Excluir 1"
                  : `Excluir ${selectedIds.length}`}
            </button>
          </DialogFooter>
        }
      >
        <p className="text-[13px] text-ink-muted">
          {hasFilters && selectedIds.length === filteredIds.length
            ? "Todos os itens da lista filtrada serão excluídos."
            : selectedIds.length === docs.length
              ? "Todos os conhecimentos da empresa serão excluídos."
              : `${selectedIds.length} item(ns) selecionado(s) serão removidos permanentemente.`}
        </p>
      </Modal>
    </TenantModule>
  );
}

/* ═══════════════════════════════════════════════════════════
   Subcomponents (UI only)
   ═══════════════════════════════════════════════════════════ */

function StatPill({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "emerald" | "amber";
}) {
  return (
    <div className="flex min-w-[4.5rem] flex-col px-2 py-0.5 sm:min-w-[5.25rem] sm:px-3">
      <span
        className={cn(
          "text-[1.15rem] font-semibold leading-none tabular-nums tracking-tight text-ink dark:text-white",
          accent === "emerald" && "text-emerald-700 dark:text-emerald-300",
          accent === "amber" && "text-amber-700 dark:text-amber-300"
        )}
      >
        {value}
      </span>
      <span className="mt-1 text-[10.5px] font-medium leading-tight text-ink-faint">{label}</span>
    </div>
  );
}

function StatDivider() {
  return (
    <span
      className="mx-0.5 hidden w-px self-stretch bg-black/[0.08] sm:block dark:bg-white/[0.1]"
      aria-hidden
    />
  );
}

/** Marcador de seleção custom (sem checkbox nativo). */
function SelectMark({
  checked,
  partial = false,
  size = "sm",
}: {
  checked: boolean;
  partial?: boolean;
  size?: "sm" | "md";
}) {
  const dim = size === "md" ? "h-[18px] w-[18px]" : "h-4 w-4";
  const icon = size === "md" ? "h-3 w-3" : "h-2.5 w-2.5";
  const active = checked || partial;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[6px] border transition-all duration-150",
        dim,
        active
          ? "border-violet-500 bg-violet-500 text-white shadow-[0_1px_2px_rgba(109,40,217,0.35)] dark:border-violet-400 dark:bg-violet-500"
          : "border-black/[0.12] bg-white/90 text-transparent shadow-sm dark:border-white/20 dark:bg-white/[0.06]"
      )}
      aria-hidden
    >
      {partial && !checked ? (
        <Minus className={icon} strokeWidth={2.5} />
      ) : (
        <Check className={cn(icon, !checked && "opacity-0")} strokeWidth={2.5} />
      )}
    </span>
  );
}

function OriginChoice({
  icon,
  title,
  description,
  accent,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  accent: "brand" | "violet";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition-colors duration-150",
        "border-black/[0.06] bg-white hover:border-violet-500/30 hover:bg-violet-500/[0.04]",
        "dark:border-white/[0.08] dark:bg-white/[0.02] dark:hover:bg-violet-500/[0.08]"
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          accent === "brand" && "bg-brand-500/[0.12] text-brand-600 dark:text-brand-300",
          accent === "violet" && "bg-violet-500/[0.12] text-violet-600 dark:text-violet-300"
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-ink dark:text-white">{title}</span>
        <span className="mt-0.5 block text-[12px] leading-snug text-ink-muted">{description}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint transition-colors duration-150 group-hover:text-violet-600 dark:group-hover:text-violet-300" />
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
      {children}
    </p>
  );
}

/**
 * Linha da biblioteca — metadados apenas (sem corpo do documento).
 */
function KnowledgeRow({
  doc,
  isDup,
  selected,
  onToggleSelect,
  onView,
  onEdit,
  onDuplicate,
  onArchive,
  onDelete,
}: {
  doc: Doc;
  isDup: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onView: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const st = statusMeta(doc.status);
  const src = sourceMeta(doc);
  const Icon = src.Icon;
  const starter = isStarterModel(doc);
  const agents = doc.agents || [];
  const showAgentAvatars = (doc.scope || "all") === "agents" && agents.length > 0;

  return (
    <li
      className={cn(
        "group relative flex items-stretch gap-0 transition-colors duration-150",
        selected
          ? "bg-violet-500/[0.06] dark:bg-violet-500/[0.1]"
          : "hover:bg-black/[0.02] dark:hover:bg-white/[0.025]"
      )}
    >
      <div className="flex w-full min-w-0 items-center gap-2.5 px-3 py-3 sm:gap-3 sm:px-4 sm:py-3.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          className="shrink-0 rounded-md p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
          aria-pressed={selected}
          aria-label={selected ? `Remover ${doc.title} da seleção` : `Selecionar ${doc.title}`}
        >
          <SelectMark checked={selected} size="md" />
        </button>

        <button
          type="button"
          onClick={onView}
          className="flex min-w-0 flex-1 items-start gap-2.5 text-left sm:items-center sm:gap-3"
        >
          <span
            className={cn(
              "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:mt-0",
              selected
                ? "bg-violet-500/[0.15] text-violet-600 dark:text-violet-300"
                : "bg-black/[0.04] text-ink-muted dark:bg-white/[0.06] dark:text-gray-300"
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate text-[13.5px] font-semibold tracking-tight text-ink dark:text-white">
                {doc.title}
              </span>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  st.className
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", st.dot)} />
                {st.text}
              </span>
              {starter && st.key === "draft" ? (
                <span className="text-[10.5px] font-medium text-ink-faint">Modelo inicial</span>
              ) : null}
              {isDup ? (
                <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-3 w-3" strokeWidth={1.75} />
                  Título semelhante
                </span>
              ) : null}
            </span>

            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-ink-faint">
              <span className="font-medium text-ink-muted dark:text-zinc-400">
                {categoryLabel(doc.category)}
              </span>
              <span aria-hidden className="text-ink-faint/50">
                ·
              </span>
              <span>{src.label}</span>
              <span aria-hidden className="text-ink-faint/50">
                ·
              </span>
              <span>Atualizado {formatDate(doc.updatedAt)}</span>
            </span>

            <span className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-ink-muted">
              {showAgentAvatars ? (
                <>
                  <span className="flex -space-x-1.5">
                    {agents.slice(0, 3).map((a) => (
                      <span
                        key={a.id}
                        title={a.name}
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-500/15 text-[9px] font-bold text-violet-800 ring-1 ring-[var(--surface-raised)] dark:text-violet-200"
                      >
                        {initials(a.name)}
                      </span>
                    ))}
                  </span>
                  <span className="truncate">{usedByText(doc)}</span>
                </>
              ) : (
                <>
                  <Users className="h-3 w-3 shrink-0 opacity-70" strokeWidth={1.75} />
                  <span className="truncate">{usedByText(doc)}</span>
                </>
              )}
            </span>
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="btn-secondary hidden h-8 px-3 text-xs sm:inline-flex"
            onClick={onView}
          >
            Abrir
          </button>
          <Dropdown
            align="right"
            trigger={
              <button type="button" className="btn-ghost h-8 w-8 shrink-0 px-0" aria-label="Mais ações">
                <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
              </button>
            }
          >
            <DropdownItem onClick={onView}>
              <BookOpen className="mr-1.5 inline h-3.5 w-3.5" strokeWidth={1.75} />
              Abrir
            </DropdownItem>
            <DropdownItem onClick={onEdit}>
              <Pencil className="mr-1.5 inline h-3.5 w-3.5" strokeWidth={1.75} />
              Editar
            </DropdownItem>
            <DropdownItem onClick={onEdit}>
              <Link2 className="mr-1.5 inline h-3.5 w-3.5" strokeWidth={1.75} />
              Vincular a agentes
            </DropdownItem>
            <DropdownItem onClick={onDuplicate}>
              <Copy className="mr-1.5 inline h-3.5 w-3.5" strokeWidth={1.75} />
              Duplicar
            </DropdownItem>
            <DropdownItem onClick={onArchive}>
              <Archive className="mr-1.5 inline h-3.5 w-3.5" strokeWidth={1.75} />
              {st.key === "archived" ? "Reativar" : "Arquivar"}
            </DropdownItem>
            <DropdownItem danger onClick={onDelete}>
              <Trash2 className="mr-1.5 inline h-3.5 w-3.5" strokeWidth={1.75} />
              Excluir
            </DropdownItem>
          </Dropdown>
        </div>
      </div>
    </li>
  );
}

function KnowledgeReadView({ doc, isDup }: { doc: Doc; isDup: boolean }) {
  const st = statusMeta(doc.status);
  const src = sourceMeta(doc);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", st.className)}>
          {st.text}
        </span>
        <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] font-medium text-ink-muted dark:bg-white/[0.06]">
          {categoryLabel(doc.category)}
        </span>
        <span className="text-[11px] text-ink-faint">
          {`${src.label} · Atualizado ${formatDate(doc.updatedAt)}`}
        </span>
      </div>

      <div className="flex items-center gap-2 text-[12px] text-ink-muted">
        <Users className="h-3.5 w-3.5 text-ink-faint" strokeWidth={1.75} />
        <span>{usedByText(doc)}</span>
        {doc.agents && doc.agents.length > 1 && (doc.scope || "all") === "agents" ? (
          <span className="truncate text-ink-faint">
            · {doc.agents.map((a) => a.name).join(", ")}
          </span>
        ) : null}
      </div>

      {isStarterModel(doc) && formStatusKey(doc.status) === "draft" ? (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-[12px] text-amber-900 dark:text-amber-100">
          Modelo inicial. Personalize com as informações comerciais da sua empresa.
        </p>
      ) : null}

      {isDup ? (
        <p className="inline-flex items-center gap-1.5 text-[12px] font-medium text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} />
          Existe outro conteúdo com título semelhante.
        </p>
      ) : null}

      <div>
        <SectionLabel>Conteúdo</SectionLabel>
        <div className="mt-2 max-h-[50vh] overflow-y-auto rounded-xl border border-black/[0.05] bg-black/[0.015] px-4 py-3.5 text-[13.5px] leading-[1.65] whitespace-pre-wrap text-ink-secondary dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-gray-300">
          {doc.content}
        </div>
      </div>
    </div>
  );
}

function KnowledgeFormBody({
  form,
  setForm,
  agentList,
  categories,
  mode,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  agentList: AgentLite[];
  categories: string[];
  mode: "create" | "edit";
}) {
  return (
    <div className="space-y-5">
      <section className="space-y-2.5">
        <SectionLabel>Conteúdo</SectionLabel>
        <div className="space-y-3">
          <FormField label="Título" required>
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              placeholder="Ex.: Horários de atendimento"
            />
          </FormField>
          <FormField label="Categoria">
            <input
              className="input"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="Comercial, Suporte, FAQ…"
              list={`knowledge-cats-${mode}`}
            />
            <datalist id={`knowledge-cats-${mode}`}>
              {["Comercial", "Suporte", "Políticas", "Produtos", "FAQ", "Geral"].map((c) => (
                <option key={c} value={c} />
              ))}
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </FormField>
          <FormField label="Texto" required>
            <textarea
              className="input min-h-[200px] resize-y px-3.5 py-3 text-[13.5px] leading-[1.65]"
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              required
              placeholder="Descreva a informação de forma clara e atualizada…"
            />
          </FormField>
        </div>
      </section>

      <section className="space-y-2.5">
        <SectionLabel>Disponibilidade</SectionLabel>
        <ScopePicker
          scope={form.scope}
          agentIds={form.agentIds}
          agents={agentList}
          onScope={(scope) =>
            setForm({
              ...form,
              scope,
              agentIds: scope === "all" ? [] : form.agentIds,
            })
          }
          onToggleAgent={(id) =>
            setForm({
              ...form,
              agentIds: form.agentIds.includes(id)
                ? form.agentIds.filter((x) => x !== id)
                : [...form.agentIds, id],
            })
          }
        />
      </section>

      <section className="space-y-2.5">
        <SectionLabel>Publicação</SectionLabel>
        {mode === "create" ? (
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { value: "draft" as const, label: "Rascunho", hint: "Salvar sem publicar" },
                { value: "ready" as const, label: "Pronto", hint: "Disponível aos agentes" },
              ] as const
            ).map((opt) => {
              const active = form.status === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm({ ...form, status: opt.value })}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-left transition-colors duration-150",
                    active
                      ? "border-violet-500/[0.35] bg-violet-500/[0.08] dark:border-violet-400/40 dark:bg-violet-500/[0.12]"
                      : "border-black/[0.06] hover:border-black/[0.1] dark:border-white/[0.08] dark:hover:border-white/[0.14]"
                  )}
                >
                  <p className="text-[13px] font-semibold text-ink dark:text-white">{opt.label}</p>
                  <p className="mt-0.5 text-[11px] text-ink-faint">{opt.hint}</p>
                </button>
              );
            })}
          </div>
        ) : (
          <Select
            size="sm"
            value={form.status === "archived" ? "archived" : form.status}
            onChange={(v) =>
              setForm({
                ...form,
                status: v === "draft" ? "draft" : v === "archived" ? "archived" : "ready",
              })
            }
            options={[
              { value: "ready", label: "Pronto" },
              { value: "draft", label: "Rascunho" },
              { value: "archived", label: "Arquivado" },
            ]}
            aria-label="Status"
          />
        )}
      </section>
    </div>
  );
}

function ScopePicker({
  scope,
  agentIds,
  agents,
  onScope,
  onToggleAgent,
}: {
  scope: "all" | "agents";
  agentIds: string[];
  agents: AgentLite[];
  onScope: (s: "all" | "agents") => void;
  onToggleAgent: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onScope("all")}
          className={cn(
            "rounded-xl border px-3.5 py-3 text-left transition-colors duration-150",
            scope === "all"
              ? "border-violet-500/[0.35] bg-violet-500/[0.08] dark:border-violet-400/40 dark:bg-violet-500/[0.12]"
              : "border-black/[0.06] hover:border-black/[0.1] dark:border-white/[0.08] dark:hover:border-white/[0.14]"
          )}
        >
          <p className="text-[13px] font-semibold text-ink dark:text-white">Todos os agentes</p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-ink-faint">
            Disponível para todos os agentes ativos desta empresa.
          </p>
        </button>
        <button
          type="button"
          onClick={() => onScope("agents")}
          className={cn(
            "rounded-xl border px-3.5 py-3 text-left transition-colors duration-150",
            scope === "agents"
              ? "border-violet-500/[0.35] bg-violet-500/[0.08] dark:border-violet-400/40 dark:bg-violet-500/[0.12]"
              : "border-black/[0.06] hover:border-black/[0.1] dark:border-white/[0.08] dark:hover:border-white/[0.14]"
          )}
        >
          <p className="text-[13px] font-semibold text-ink dark:text-white">Agentes específicos</p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-ink-faint">
            Somente os agentes selecionados poderão usar este conteúdo.
          </p>
        </button>
      </div>

      {scope === "agents" ? (
        !agents.length ? (
          <p className="text-[12px] text-ink-faint">
            Nenhum agente cadastrado. Crie agentes em Agentes.
          </p>
        ) : (
          <ul className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-black/[0.05] p-1.5 dark:border-white/[0.08]">
            {agents.map((a) => {
              const on = agentIds.includes(a.id);
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onToggleAgent(a.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-150",
                      on
                        ? "bg-violet-500/10 dark:bg-violet-500/[0.15]"
                        : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                        on
                          ? "bg-violet-500/20 text-violet-800 dark:text-violet-200"
                          : "bg-black/[0.06] text-ink-muted dark:bg-white/[0.08]"
                      )}
                    >
                      {initials(a.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink dark:text-white">
                        {a.name}
                      </span>
                      {a.role ? (
                        <span className="block truncate text-[11px] text-ink-faint">{a.role}</span>
                      ) : null}
                    </span>
                    {on ? (
                      <Check
                        className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-300"
                        strokeWidth={2.25}
                      />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </div>
  );
}
