"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Code2, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import {
  DialogFooter,
  EmptyState,
  FormField,
  FormSection,
  Modal,
  Spinner,
  useToast,
} from "@/components/ui";
import { TenantPage, TenantSection } from "@/components/tenant/tenant-page";

type Scope = { id: string; label: string };

type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
};

type ApiKeysResponse = {
  apiEnabled: boolean;
  keysLimit: number;
  keys: ApiKeyRow[];
};

type Usage = {
  enabled: boolean;
  last24h: number;
  last7d: number;
  recent: Array<{
    method: string;
    path: string;
    statusCode: number;
    durationMs?: number | null;
    createdAt: string;
  }>;
};

export default function ApiSettingsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [secretOnce, setSecretOnce] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", scopes: ["conversations:read"] as string[] });

  const keysQ = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => api<ApiKeysResponse>("/api-keys"),
  });

  const scopesQ = useQuery({
    queryKey: ["api-scopes"],
    queryFn: () => api<{ scopes: Scope[] }>("/integrations/api-scopes"),
  });

  const usageQ = useQuery({
    queryKey: ["api-keys-usage"],
    queryFn: () => api<Usage>("/api-keys/usage"),
    enabled: Boolean(keysQ.data?.apiEnabled),
  });

  const createMut = useMutation({
    mutationFn: () =>
      api<{ secret: string; id: string }>("/api-keys", {
        method: "POST",
        json: { name: form.name.trim(), scopes: form.scopes },
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      setCreateOpen(false);
      setForm({ name: "", scopes: ["conversations:read"] });
      setSecretOnce(res.secret);
      toast({ kind: "success", title: "Chave criada" });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível criar", description: e.message }),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) =>
      api(`/api-keys/${id}/revoke`, { method: "POST", json: {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast({ kind: "success", title: "Chave revogada" });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Erro ao revogar", description: e.message }),
  });

  const scopes = scopesQ.data?.scopes || [];
  const enabled = keysQ.data?.apiEnabled === true;
  const activeCount = keysQ.data?.keys.filter((k) => !k.revokedAt).length ?? 0;
  const keysLimit = keysQ.data?.keysLimit ?? 0;

  function toggleScope(id: string) {
    setForm((f) => ({
      ...f,
      scopes: f.scopes.includes(id)
        ? f.scopes.filter((s) => s !== id)
        : [...f.scopes, id],
    }));
  }

  function onCreate(e: FormEvent) {
    e.preventDefault();
    createMut.mutate();
  }

  return (
    <TenantPage
      title="API"
      maxWidth="narrow"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/app/settings?tab=integrations"
            className="btn-ghost h-9 w-9 px-0"
            aria-label="Voltar às configurações"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          </Link>
          {enabled ? (
            <button
              type="button"
              className="btn-primary h-9"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
              Nova chave
            </button>
          ) : null}
        </div>
      }
    >
      <p className="text-[12.5px] text-ink-muted">
        Autentique com{" "}
        <code className="rounded bg-black/[0.04] px-1.5 py-0.5 font-mono text-[11.5px] dark:bg-white/[0.06]">
          Authorization: Bearer nxf_live_…
        </code>
        {" · "}
        <Link href="/docs/api" className="font-medium text-brand-600 hover:underline dark:text-brand-300">
          Documentação
        </Link>
      </p>

      {keysQ.isLoading ? (
        <div className="flex justify-center py-16" role="status" aria-label="Carregando">
          <Spinner />
        </div>
      ) : keysQ.isError ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.06] px-5 py-6 text-center"
        >
          <p className="text-sm font-semibold text-ink dark:text-white">
            Não foi possível carregar as chaves
          </p>
          <button
            type="button"
            className="btn-secondary btn-sm mt-3 h-8"
            onClick={() => void keysQ.refetch()}
          >
            Tentar de novo
          </button>
        </div>
      ) : !enabled ? (
        <TenantSection>
          <div className="px-1 py-4 text-center">
            <Code2 className="mx-auto h-7 w-7 text-ink-faint" strokeWidth={1.5} />
            <p className="mt-3 text-sm font-semibold text-ink dark:text-white">
              API não incluída no plano atual
            </p>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] text-ink-muted">
              Planos Empresa e Enterprise incluem chaves com escopos e rate limit.
            </p>
          </div>
        </TenantSection>
      ) : (
        <>
          {usageQ.data?.enabled ? (
            <div className="grid gap-2.5 sm:grid-cols-3">
              <TenantSection>
                <p className="text-[11px] font-medium text-ink-faint">Requisições (24h)</p>
                <p className="mt-1.5 font-display text-xl font-semibold tabular-nums tracking-[-0.03em] text-ink dark:text-white">
                  {usageQ.data.last24h}
                </p>
              </TenantSection>
              <TenantSection>
                <p className="text-[11px] font-medium text-ink-faint">Requisições (7 dias)</p>
                <p className="mt-1.5 font-display text-xl font-semibold tabular-nums tracking-[-0.03em] text-ink dark:text-white">
                  {usageQ.data.last7d}
                </p>
              </TenantSection>
              <TenantSection>
                <p className="text-[11px] font-medium text-ink-faint">Chaves ativas</p>
                <p className="mt-1.5 font-display text-xl font-semibold tabular-nums tracking-[-0.03em] text-ink dark:text-white">
                  {activeCount}
                  <span className="text-[15px] font-medium text-ink-faint">
                    {" "}
                    / {keysLimit}
                  </span>
                </p>
              </TenantSection>
            </div>
          ) : (
            <p className="text-[12px] text-ink-faint">
              {activeCount} / {keysLimit} chaves ativas
            </p>
          )}

          <TenantSection
            title="Chaves"
            action={
              enabled ? (
                <button
                  type="button"
                  className="btn-ghost btn-sm h-8 px-2 text-[12px]"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Nova
                </button>
              ) : null
            }
          >
            {!keysQ.data?.keys.length ? (
              <EmptyState
                icon={<KeyRound className="h-5 w-5" strokeWidth={1.5} />}
                title="Nenhuma chave criada"
                action={
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setCreateOpen(true)}
                  >
                    Criar chave de API
                  </button>
                }
              />
            ) : (
              <ul className="-mx-4 -my-4 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                {keysQ.data.keys.map((k) => (
                  <li
                    key={k.id}
                    className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-ink dark:text-white">
                        {k.name}
                      </p>
                      <p className="mt-0.5 font-mono text-[12px] text-ink-faint">
                        {k.keyPrefix}…
                      </p>
                      <p className="mt-1 text-[11px] text-ink-faint">
                        {(k.scopes || []).join(", ") || "Sem escopos"}
                        {" · "}
                        Criada {formatDate(k.createdAt)}
                        {k.lastUsedAt ? ` · Último uso ${formatDate(k.lastUsedAt)}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {k.revokedAt ? (
                        <span className="text-[11px] font-semibold text-ink-faint">
                          Revogada
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn-ghost h-8 px-2 text-[12px] text-rose-600"
                          onClick={() => {
                            if (
                              confirm(
                                `Revogar a chave "${k.name}"? O acesso será cortado imediatamente.`
                              )
                            ) {
                              revokeMut.mutate(k.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Revogar
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TenantSection>

          {usageQ.data?.recent?.length ? (
            <TenantSection title="Uso recente">
              <ul className="-mx-4 -my-4 divide-y divide-black/[0.04] dark:divide-white/[0.06]">
                {usageQ.data.recent.slice(0, 10).map((r, i) => (
                  <li
                    key={`${r.createdAt}-${i}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[12px]"
                  >
                    <span className="font-mono text-ink-muted">
                      {r.method} {r.path}
                    </span>
                    <span className="text-ink-faint">
                      {r.statusCode}
                      {r.durationMs != null ? ` · ${r.durationMs}ms` : ""} ·{" "}
                      {formatDate(r.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </TenantSection>
          ) : null}
        </>
      )}

      <Modal
        open={Boolean(secretOnce)}
        onClose={() => setSecretOnce(null)}
        title="Chave de API"
        size="md"
        variant="confirm"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="btn-primary h-9"
              onClick={() => {
                if (secretOnce) void navigator.clipboard.writeText(secretOnce);
                toast({ kind: "success", title: "Copiado" });
                setSecretOnce(null);
              }}
            >
              <Copy className="h-3.5 w-3.5" /> Copiar e fechar
            </button>
          </DialogFooter>
        }
      >
        <p className="text-[13px] text-ink-muted">
          Copie esta chave agora. Ela não será exibida novamente.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface-subtle p-3 text-[12px] dark:border-white/[0.08]">
          {secretOnce}
        </pre>
      </Modal>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Criar chave de API"
        size="md"
        variant="contextual"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="btn-secondary h-9"
              onClick={() => setCreateOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="nf-api-key-create"
              className="btn-primary h-9"
              disabled={
                createMut.isPending || !form.name.trim() || form.scopes.length === 0
              }
            >
              {createMut.isPending ? "Criando…" : "Criar chave"}
            </button>
          </DialogFooter>
        }
      >
        <form id="nf-api-key-create" onSubmit={onCreate} className="space-y-4">
          <FormSection title="Identificação" surface>
            <FormField label="Nome" required>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex.: Integração ERP"
                required
              />
            </FormField>
          </FormSection>
          <FormSection title="Escopos" surface>
            <ul className="space-y-1">
              {scopes.map((s) => {
                const on = form.scopes.includes(s.id);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => toggleScope(s.id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px]",
                        on
                          ? "bg-brand-500/10 text-brand-800 dark:text-brand-200"
                          : "text-ink-muted hover:bg-black/[0.03]"
                      )}
                    >
                      <span>
                        <span className="font-medium">{s.label}</span>
                        <span className="ml-2 font-mono text-[11px] opacity-70">{s.id}</span>
                      </span>
                      {on ? <Check className="h-3.5 w-3.5" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </FormSection>
        </form>
      </Modal>
    </TenantPage>
  );
}
