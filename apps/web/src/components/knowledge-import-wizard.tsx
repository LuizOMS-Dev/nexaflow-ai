"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  Download,
  FileText,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  DialogFooter,
  FormField,
  Modal,
  Spinner,
  Switch,
  WizardSteps,
  useToast,
} from "@/components/ui";

type DraftItem = {
  tempId: string;
  title: string;
  category: string;
  content: string;
  selected: boolean;
  duplicateOf: { id: string; title: string } | null;
  conflictNote: string | null;
  blocked: boolean;
  blockReason: string | null;
  /** UI: create | replace | skip */
  action?: "create" | "replace" | "skip";
};

type Analysis = {
  filename: string;
  mode: string;
  items: DraftItem[];
  warnings: string[];
  stats: {
    chars: number;
    sectionsFound: number;
    duplicates: number;
    blocked: number;
    conflicts: number;
  };
};

type Agent = { id: string; name: string; role?: string | null; isActive?: boolean };

type Props = {
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
};

type Step = "upload" | "analyzing" | "review" | "confirming" | "done";

const ACCEPTED = ".txt,.md,.markdown,text/plain,text/markdown";

export function KnowledgeImportWizard({ open, onClose, onDone }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [filename, setFilename] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [allAgents, setAllAgents] = useState(true);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [resultMsg, setResultMsg] = useState("");

  const agentsQuery = useQuery({
    queryKey: ["ai-agents-for-import"],
    queryFn: () => api<Agent[]>("/ai-agents"),
    enabled: open,
  });

  const agents = useMemo(
    () => (agentsQuery.data || []).filter((a) => a.isActive !== false),
    [agentsQuery.data]
  );

  function reset() {
    setStep("upload");
    setFilename("");
    setAnalysis(null);
    setItems([]);
    setEditIdx(null);
    setAllAgents(true);
    setSelectedAgents([]);
    setResultMsg("");
  }

  function handleClose() {
    if (step === "analyzing" || step === "confirming") return;
    reset();
    onClose();
  }

  async function readFile(file: File) {
    const name = file.name || "importacao.txt";
    const lower = name.toLowerCase();
    if (!lower.endsWith(".txt") && !lower.endsWith(".md") && !lower.endsWith(".markdown")) {
      toast({
        kind: "error",
        title: "Formato não suportado",
        description: "Use arquivos .txt ou .md.",
      });
      return;
    }
    if (file.size > 400_000) {
      toast({
        kind: "error",
        title: "Arquivo muito grande",
        description: "Limite aproximado de 400 KB para importação em lote.",
      });
      return;
    }

    setFilename(name);
    setStep("analyzing");
    try {
      const text = await file.text();
      if (!text.trim()) {
        throw new Error("Arquivo vazio.");
      }
      const res = await api<Analysis>("/knowledge/import/analyze", {
        method: "POST",
        json: { text, filename: name, useAi: true },
      });
      const mapped = res.items.map((it) => ({
        ...it,
        action: it.blocked
          ? ("skip" as const)
          : it.duplicateOf
            ? ("skip" as const)
            : ("create" as const),
        selected: !it.blocked && !it.duplicateOf,
      }));
      // duplicatas: selected false by default, action skip until user chooses
      setAnalysis(res);
      setItems(
        mapped.map((it) => ({
          ...it,
          selected: !it.blocked && !it.duplicateOf,
          action: it.blocked || it.duplicateOf ? "skip" : "create",
        }))
      );
      setStep("review");
    } catch (e) {
      setStep("upload");
      toast({
        kind: "error",
        title: "Não foi possível analisar",
        description: e instanceof Error ? e.message : "Tente outro arquivo.",
      });
    }
  }

  const confirmMutation = useMutation({
    mutationFn: () => {
      const payload = items
        .filter((it) => !it.blocked && it.action !== "skip" && it.selected)
        .map((it) => ({
          title: it.title.trim(),
          category: it.category.trim() || "Geral",
          content: it.content.trim(),
          action: it.action === "replace" ? ("replace" as const) : ("create" as const),
          replaceId: it.action === "replace" ? it.duplicateOf?.id : undefined,
        }));
      if (!payload.length) {
        throw new Error("Selecione ao menos um conhecimento para importar.");
      }
      return api<{ message: string; created: unknown[]; updated: unknown[] }>(
        "/knowledge/import/confirm",
        {
          method: "POST",
          json: {
            filename,
            items: payload,
            agentIds: allAgents ? [] : selectedAgents,
            general: allAgents,
          },
        }
      );
    },
    onSuccess: (res) => {
      setResultMsg(res.message);
      setStep("done");
      qc.invalidateQueries({ queryKey: ["knowledge"] });
      toast({ kind: "success", title: res.message || "Importação concluída." });
      onDone?.();
    },
    onError: (e: Error) => {
      setStep("review");
      toast({ kind: "error", title: "Falha ao importar", description: e.message });
    },
  });

  const selectedCount = items.filter(
    (it) => it.selected && !it.blocked && it.action !== "skip"
  ).length;

  const editItem = editIdx != null ? items[editIdx] : null;

  return (
    <>
      <Modal
        open={open && step !== "done"}
        onClose={handleClose}
        title="Importar conhecimento em lote"
        description="Arquivo .txt ou .md"
        icon={<Upload className="h-4 w-4" strokeWidth={1.75} />}
        size="xl"
        variant="contextual"
        preventClose={step === "analyzing" || step === "confirming"}
        footer={
          step === "review" ? (
            <DialogFooter>
              <button
                type="button"
                className="btn-secondary h-9"
                onClick={() => {
                  reset();
                }}
                disabled={confirmMutation.isPending}
              >
                Outro arquivo
              </button>
              <button
                type="button"
                className="btn-primary h-9 px-4"
                disabled={selectedCount === 0 || confirmMutation.isPending}
                onClick={() => {
                  setStep("confirming");
                  confirmMutation.mutate();
                }}
              >
                {confirmMutation.isPending
                  ? "Importando…"
                  : `Confirmar ${selectedCount} conhecimento${selectedCount === 1 ? "" : "s"}`}
              </button>
            </DialogFooter>
          ) : step === "upload" ? (
            <DialogFooter>
              <button type="button" className="btn-secondary h-9" onClick={handleClose}>
                Cancelar
              </button>
              <a
                className="btn-secondary h-9 inline-flex items-center gap-1.5"
                href="/nexa-api/knowledge/import/sample"
                target="_blank"
                rel="noreferrer"
                onClick={async (e) => {
                  e.preventDefault();
                  try {
                    const res = await api<{ content: string; filename: string }>(
                      "/knowledge/import/sample"
                    );
                    const blob = new Blob([res.content || ""], { type: "text/markdown" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = res.filename || "modelo-base-conhecimento.md";
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch (err) {
                    toast({
                      kind: "error",
                      title: "Não foi possível baixar o modelo",
                      description: err instanceof Error ? err.message : undefined,
                    });
                  }
                }}
              >
                <Download className="h-3.5 w-3.5" /> Baixar modelo
              </a>
            </DialogFooter>
          ) : undefined
        }
      >
        <WizardSteps
          steps={["Arquivo", "Análise", "Revisão", "Confirmar"]}
          current={
            step === "upload"
              ? 0
              : step === "analyzing"
                ? 1
                : step === "review"
                  ? 2
                  : 3
          }
        />
        {step === "upload" && (
          <div className="space-y-4">
            <div
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-[1.25rem] border border-dashed border-brand-500/25 bg-gradient-to-b from-brand-500/[0.04] to-transparent px-6 py-12 text-center transition-[border-color,background-color,box-shadow] duration-150",
                "hover:border-brand-500/[0.45] hover:from-brand-500/[0.07] hover:shadow-[0_12px_32px_-20px_rgba(79,70,229,0.35)]",
                "dark:border-brand-400/20 dark:from-brand-400/[0.06] dark:hover:border-brand-400/[0.35]"
              )}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void readFile(f);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
              }}
            >
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 ring-1 ring-brand-500/10 dark:text-brand-300">
                <FileText className="h-5 w-5" strokeWidth={1.6} />
              </span>
              <p className="text-sm font-semibold tracking-tight text-ink dark:text-gray-100">
                Arraste um arquivo ou clique para selecionar
              </p>
              <p className="mt-1.5 text-xs text-ink-muted">
                Formatos suportados: <strong className="font-medium text-ink-secondary">.txt</strong> e{" "}
                <strong className="font-medium text-ink-secondary">.md</strong>
              </p>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void readFile(f);
                  e.target.value = "";
                }}
              />
            </div>
            <p className="text-xs leading-relaxed text-ink-muted">
              A NexaFlow analisa o conteúdo, separa os assuntos e mostra uma revisão. Nada é
              publicado sem a sua confirmação. Não inventamos preços, horários ou políticas.
            </p>
          </div>
        )}

        {step === "analyzing" && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
            <div>
              <p className="text-sm font-medium text-ink dark:text-white">
                Analisando seu conteúdo…
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                Lendo arquivo e preparando conhecimentos para revisão
              </p>
            </div>
          </div>
        )}

        {step === "confirming" && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Spinner className="h-8 w-8" />
            <p className="text-sm font-medium">Adicionando à base…</p>
          </div>
        )}

        {step === "review" && analysis && (
          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-surface-subtle/40 px-4 py-3 dark:border-white/[0.06]">
              <p className="text-sm font-medium text-ink dark:text-white">
                Encontramos {analysis.stats.sectionsFound} conhecimento
                {analysis.stats.sectionsFound === 1 ? "" : "s"} em{" "}
                <span className="font-semibold">{filename}</span>
              </p>
              <p className="mt-0.5 text-[12px] text-ink-muted">
                Modo:{" "}
                {analysis.mode === "structured"
                  ? "estrutura por títulos"
                  : analysis.mode === "ai"
                    ? "organização assistida"
                    : "separação automática"}
                {analysis.stats.duplicates
                  ? ` · ${analysis.stats.duplicates} possível(is) duplicata(s)`
                  : ""}
                {analysis.stats.conflicts
                  ? ` · ${analysis.stats.conflicts} conflito(s)`
                  : ""}
              </p>
            </div>

            {analysis.warnings.length > 0 && (
              <ul className="space-y-1">
                {analysis.warnings.map((w) => (
                  <li
                    key={w}
                    className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200"
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {w}
                  </li>
                ))}
              </ul>
            )}

            <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
              {items.map((it, idx) => (
                <div
                  key={it.tempId}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 dark:border-white/[0.06]",
                    it.blocked
                      ? "border-red-300/50 bg-red-50/50 dark:bg-red-500/10"
                      : "border-line bg-white dark:bg-white/[0.02]"
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <Switch
                      size="sm"
                      disabled={it.blocked}
                      checked={it.selected && !it.blocked && it.action !== "skip"}
                      aria-label={
                        it.selected && it.action !== "skip"
                          ? `Excluir da importação: ${it.title}`
                          : `Incluir na importação: ${it.title}`
                      }
                      onChange={(checked) => {
                        setItems((prev) =>
                          prev.map((p, i) =>
                            i === idx
                              ? {
                                  ...p,
                                  selected: checked,
                                  action: checked
                                    ? p.duplicateOf
                                      ? p.action === "replace"
                                        ? "replace"
                                        : "create"
                                      : "create"
                                    : "skip",
                                }
                              : p
                          )
                        );
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-ink dark:text-gray-100">
                          {it.title}
                        </p>
                        <span className="badge-neutral text-[10px]">{it.category}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[12px] text-ink-muted">
                        {it.content}
                      </p>
                      {it.blocked && (
                        <p className="mt-1 text-[11px] font-medium text-red-600 dark:text-red-300">
                          {it.blockReason || "Bloqueado"}
                        </p>
                      )}
                      {it.conflictNote && (
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="h-3 w-3" /> {it.conflictNote}
                        </p>
                      )}
                      {it.duplicateOf && !it.blocked && (
                        <div className="mt-2 space-y-1.5 rounded-lg bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-900 dark:text-amber-100">
                          <p>
                            Já existe algo semelhante:{" "}
                            <strong>{it.duplicateOf.title}</strong>
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {(
                              [
                                ["skip", "Manter existente"],
                                ["create", "Criar novo"],
                                ["replace", "Substituir"],
                              ] as const
                            ).map(([val, label]) => (
                              <button
                                key={val}
                                type="button"
                                className={cn(
                                  "rounded-md border px-2 py-1 transition-colors",
                                  it.action === val
                                    ? "border-amber-600/40 bg-amber-500/20 font-medium"
                                    : "border-transparent bg-white/50 dark:bg-black/20"
                                )}
                                onClick={() => {
                                  setItems((prev) =>
                                    prev.map((p, i) =>
                                      i === idx
                                        ? {
                                            ...p,
                                            action: val,
                                            selected: val !== "skip",
                                          }
                                        : p
                                    )
                                  );
                                }}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          className="text-[11px] font-medium text-brand-600 hover:underline dark:text-brand-300"
                          onClick={() => setEditIdx(idx)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="text-[11px] font-medium text-ink-muted hover:text-red-600"
                          onClick={() => {
                            setItems((prev) =>
                              prev.map((p, i) =>
                                i === idx ? { ...p, selected: false, action: "skip" } : p
                              )
                            );
                          }}
                        >
                          Remover da importação
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Agentes — base é da empresa; seleção é metadado / intenção */}
            <div className="rounded-xl border border-line px-3 py-3 dark:border-white/[0.06]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                Disponível para
              </p>
              <p className="mt-0.5 text-[12px] text-ink-muted">
                A base de conhecimento é da empresa. Todos os agentes ativos consultam os
                conteúdos publicados.
              </p>
              <div className="mt-2">
                <Switch
                  id="kb-import-all-agents"
                  size="sm"
                  label="Todos os agentes"
                  checked={allAgents}
                  onChange={(checked) => {
                    setAllAgents(checked);
                    if (checked) setSelectedAgents([]);
                  }}
                  className="py-1.5"
                />
              </div>
              {!allAgents && (
                <div className="mt-1 max-h-28 space-y-0.5 overflow-y-auto">
                  {agentsQuery.isLoading ? (
                    <Spinner className="h-4 w-4" />
                  ) : agents.length === 0 ? (
                    <p className="text-xs text-ink-muted">Nenhum agente ativo nesta empresa.</p>
                  ) : (
                    agents.map((a) => (
                      <Switch
                        key={a.id}
                        id={`kb-import-agent-${a.id}`}
                        size="sm"
                        label={a.role ? `${a.name} · ${a.role}` : a.name}
                        checked={selectedAgents.includes(a.id)}
                        onChange={(checked) => {
                          setSelectedAgents((prev) =>
                            checked
                              ? [...prev, a.id]
                              : prev.filter((id) => id !== a.id)
                          );
                        }}
                        className="py-1.5"
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Done */}
      <Modal
        open={open && step === "done"}
        onClose={() => {
          reset();
          onClose();
        }}
        title="Importação concluída"
        size="sm"
        variant="confirm"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="btn-primary h-9 px-4"
              onClick={() => {
                reset();
                onClose();
              }}
            >
              <Check className="h-3.5 w-3.5" /> Ver base de conhecimento
            </button>
          </DialogFooter>
        }
      >
        <p className="text-sm text-ink-secondary dark:text-gray-300">{resultMsg}</p>
      </Modal>

      {/* Edit item */}
      <Modal
        open={editIdx != null && !!editItem}
        onClose={() => setEditIdx(null)}
        title="Editar conhecimento"
        size="lg"
        variant="contextual"
        footer={
          <DialogFooter>
            <button type="button" className="btn-secondary h-9" onClick={() => setEditIdx(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary h-9"
              onClick={() => setEditIdx(null)}
              disabled={!editItem?.title.trim() || !editItem?.content.trim()}
            >
              Aplicar
            </button>
          </DialogFooter>
        }
      >
        {editItem && editIdx != null && (
          <div className="space-y-3">
            <FormField label="Título" required>
              <input
                className="input"
                value={editItem.title}
                onChange={(e) => {
                  const v = e.target.value;
                  setItems((prev) =>
                    prev.map((p, i) => (i === editIdx ? { ...p, title: v } : p))
                  );
                }}
              />
            </FormField>
            <FormField label="Categoria">
              <input
                className="input"
                value={editItem.category}
                onChange={(e) => {
                  const v = e.target.value;
                  setItems((prev) =>
                    prev.map((p, i) => (i === editIdx ? { ...p, category: v } : p))
                  );
                }}
              />
            </FormField>
            <FormField label="Conteúdo" required>
              <textarea
                className="input min-h-[180px]"
                value={editItem.content}
                onChange={(e) => {
                  const v = e.target.value;
                  setItems((prev) =>
                    prev.map((p, i) => (i === editIdx ? { ...p, content: v } : p))
                  );
                }}
              />
            </FormField>
          </div>
        )}
      </Modal>
    </>
  );
}
