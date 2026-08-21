"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isSuperadminMfaRequiredError } from "@/lib/api";
import { useToast } from "@/components/ui";
import { useAuth } from "@/store/auth";
import { platformAdminApi } from "../api";
import {
  EmptyHint,
  ErrorHint,
  Field,
  PageHeader,
  Panel,
  Skeleton,
  ToneBadge,
  inputClass,
} from "../ui";

import { MaintenancePanel } from "./maintenance-panel";

type Tab = "saude" | "diagnostico" | "politica" | "manutencao";

export function SystemPage({ initialTab = "saude" }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  return (
    <div>
      <PageHeader
        title="Sistema"
        description="Saúde da instância, diagnóstico, política de acesso e modo de manutenção global."
      />
      <div className="admin-tabs">
        {(
          [
            ["saude", "Saúde"],
            ["diagnostico", "Diagnóstico"],
            ["politica", "Política de acesso"],
            ["manutencao", "Modo de Manutenção"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className="admin-tab"
            data-active={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "saude" ? <HealthPanel /> : null}
      {tab === "diagnostico" ? (
        <ServicePanel
          queryKey="diagnostics"
          title="Diagnóstico"
          fn={platformAdminApi.diagnostics}
        />
      ) : null}
      {tab === "politica" ? <PolicyPanel /> : null}
      {tab === "manutencao" ? <MaintenancePanel /> : null}
    </div>
  );
}

function HealthPanel() {
  const user = useAuth((s) => s.user);
  const q = useQuery({
    queryKey: ["platform-health"],
    queryFn: () => platformAdminApi.health(),
    enabled: user?.platformRole === "SUPERADMIN",
    retry: false,
    refetchInterval: 30_000,
  });
  if (q.isLoading) return <Skeleton rows={2} />;
  if (q.error || !q.data) {
    if (isSuperadminMfaRequiredError(q.error)) return null;
    return <ErrorHint title="Não foi possível ler a saúde" onRetry={() => void q.refetch()} />;
  }
  return <KvGrid data={q.data} />;
}

function ServicePanel({
  queryKey,
  title,
  fn,
}: {
  queryKey: string;
  title: string;
  fn: () => Promise<Record<string, unknown>>;
}) {
  const user = useAuth((s) => s.user);
  const q = useQuery({
    queryKey: ["platform", queryKey],
    queryFn: fn,
    enabled: user?.platformRole === "SUPERADMIN",
    retry: false,
  });
  if (q.isLoading) return <Skeleton rows={2} />;
  if (q.error || !q.data) {
    if (isSuperadminMfaRequiredError(q.error)) return null;
    return <ErrorHint title={`Não foi possível carregar: ${title}`} onRetry={() => void q.refetch()} />;
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-white/50">{title}</p>
        <button type="button" className="admin-btn-ghost h-8 text-[12px]" onClick={() => void q.refetch()}>
          Atualizar
        </button>
      </div>
      <KvGrid data={q.data} />
    </div>
  );
}

function KvGrid({ data }: { data: unknown }) {
  const entries = useMemo(() => flattenEntries(data).slice(0, 48), [data]);
  if (entries.length === 0) {
    return <EmptyHint>Sem dados para exibir.</EmptyHint>;
  }
  return (
    <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map(([k, v, tone]) => (
        <div key={k} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-white/40">{k}</dt>
          <dd className="mt-1 flex flex-wrap items-center gap-2 break-all text-[13px] text-white/85">
            {tone ? <ToneBadge code={tone}>{String(v)}</ToneBadge> : <span>{String(v)}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function flattenEntries(
  data: unknown,
  prefix = ""
): Array<[string, string, string | undefined]> {
  if (data == null) return [];
  if (typeof data !== "object") {
    return [[prefix || "value", String(data), statusCode(String(data))]];
  }
  if (Array.isArray(data)) {
    return [[prefix || "items", `${data.length} itens`, undefined]];
  }
  const out: Array<[string, string, string | undefined]> = [];
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v != null && typeof v === "object" && !Array.isArray(v)) {
      const nested = v as Record<string, unknown>;
      if ("ok" in nested || "status" in nested || "ready" in nested) {
        const status = String(nested.status ?? (nested.ok === true ? "ok" : nested.ok === false ? "down" : "—"));
        out.push([key, status, statusCode(status)]);
        continue;
      }
      out.push(...flattenEntries(v, key));
      continue;
    }
    if (Array.isArray(v)) {
      out.push([key, `${v.length} itens`, undefined]);
      continue;
    }
    const s = v == null ? "—" : String(v);
    out.push([key, s, statusCode(s)]);
  }
  return out;
}

function statusCode(s: string): string | undefined {
  const t = s.toLowerCase();
  if (["ok", "ready", "operational", "up", "true", "connected"].includes(t)) return "ACTIVE";
  if (["degraded", "warn", "warning"].includes(t)) return "SUSPENDED";
  if (["down", "error", "false", "not_ready", "failed"].includes(t)) return "BLOCKED";
  return undefined;
}

function PolicyPanel() {
  const user = useAuth((s) => s.user);
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["platform-access-policy"],
    queryFn: () => platformAdminApi.accessPolicy(),
    enabled: user?.platformRole === "SUPERADMIN",
  });
  const mut = useMutation({
    mutationFn: platformAdminApi.putAccessPolicy,
    onSuccess: () => {
      toast({
        title: "Política de acesso atualizada",
        description: "As regras de suspensão e carência foram salvas com sucesso.",
        kind: "success",
      });
      void qc.invalidateQueries({ queryKey: ["platform-access-policy"] });
    },
    onError: (e) =>
      toast({
        title: "Não foi possível salvar a política",
        description: e instanceof Error ? e.message : "Erro ao aplicar configurações de acesso.",
        kind: "error",
      }),
  });

  if (q.isLoading) return <Skeleton rows={2} />;
  if (q.error || !q.data) {
    return <ErrorHint title="Não foi possível carregar a política" onRetry={() => void q.refetch()} />;
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    mut.mutate({
      graceDays: Number(fd.get("graceDays")),
      autoSuspendNonpayment: fd.get("autoSuspendNonpayment") === "on",
      companySuspendMode: (String(fd.get("companySuspendMode")) as "LIMITED" | "TOTAL") || "LIMITED",
    });
  }

  return (
    <Panel title="Access gate financeiro">
      <form className="grid max-w-lg gap-3" onSubmit={onSubmit}>
        <Field label="Dias de tolerância" hint="Após o vencimento, antes de medidas mais rígidas.">
          <input
            name="graceDays"
            type="number"
            min={0}
            max={90}
            defaultValue={q.data.graceDays}
            className={inputClass}
          />
        </Field>
        <Field label="Modo de suspensão">
          <select name="companySuspendMode" defaultValue={q.data.companySuspendMode} className={inputClass}>
            <option value="LIMITED">Limitado (acesso parcial)</option>
            <option value="TOTAL">Total</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-[13px] text-white/70">
          <input
            name="autoSuspendNonpayment"
            type="checkbox"
            defaultChecked={q.data.autoSuspendNonpayment}
          />
          Suspender automaticamente por inadimplência
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="admin-btn-primary" disabled={mut.isPending}>
            {mut.isPending ? "Salvando…" : "Salvar política"}
          </button>
          <ToneBadge code="ACTIVE">política ativa</ToneBadge>
        </div>
        <p className="text-[12px] text-white/40">
          O motor de billing ainda mantém o bloqueio automático por atraso desligado — esta
          política define o comportamento do access gate.
        </p>
      </form>
    </Panel>
  );
}
