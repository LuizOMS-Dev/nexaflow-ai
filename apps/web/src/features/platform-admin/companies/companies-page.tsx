"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { ApiError, isSuperadminMfaRequiredError } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Modal, useToast } from "@/components/ui";
import { useAuth } from "@/store/auth";
import { platformAdminApi } from "../api";
import { FINANCIAL_LABEL, STATUS_LABEL } from "../labels";
import {
  DataTable,
  EmptyHint,
  ErrorHint,
  Field,
  FilterBar,
  PageHeader,
  Pagination,
  Skeleton,
  StatCard,
  Td,
  Th,
  ToneBadge,
  inputClass,
} from "../ui";
import type { PlanRow } from "../types";

export function CompaniesPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <CompaniesInner />
    </Suspense>
  );
}

function CompaniesInner() {
  const user = useAuth((s) => s.user);
  const router = useRouter();
  const sp = useSearchParams();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const filters = {
    search: sp.get("q") || "",
    status: sp.get("status") || "ALL",
    financial: sp.get("financial") || "ALL",
    planId: sp.get("planId") || "",
    page: Number(sp.get("page") || 1),
  };

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (!value || value === "ALL") next.delete(key);
    else next.set(key, value);
    if (key !== "page") next.delete("page");
    router.replace(`/admin/companies?${next.toString()}`);
  }

  const list = useQuery({
    queryKey: ["platform-companies", filters],
    queryFn: () =>
      platformAdminApi.companies({
        search: filters.search || undefined,
        status: filters.status,
        financial: filters.financial,
        planId: filters.planId || undefined,
        page: filters.page,
        limit: 30,
      }),
    enabled: user?.platformRole === "SUPERADMIN",
    retry: false,
  });

  const plans = useQuery({
    queryKey: ["platform-plans-commercial"],
    queryFn: () => platformAdminApi.plans(true),
    enabled: user?.platformRole === "SUPERADMIN",
    staleTime: 60_000,
  });

  if (list.isLoading) return <Skeleton />;
  if (list.error || !list.data) {
    if (isSuperadminMfaRequiredError(list.error)) return null;
    return <ErrorHint title="Não foi possível carregar as empresas" onRetry={() => void list.refetch()} />;
  }

  const data = list.data;
  const summary = data.summary;

  return (
    <div>
      <PageHeader
        title="Empresas"
        description="Crie, cobre, suspenda e entre na operação de cada empresa."
        actions={
          <button type="button" className="admin-btn-primary" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Nova empresa
          </button>
        }
      />

      {summary ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total" value={summary.total} href="/admin/companies" />
          <StatCard
            label="Ativas"
            value={summary.active}
            href="/admin/companies?status=ACTIVE"
            tone="ok"
          />
          <StatCard
            label="Em atraso"
            value={summary.overdue}
            href="/admin/companies?financial=OVERDUE"
            tone={summary.overdue > 0 ? "danger" : "default"}
          />
          <StatCard
            label="Atenção"
            value={summary.needsAttention}
            href="/admin/companies?financial=NEEDS_ATTENTION"
            tone={summary.needsAttention > 0 ? "warn" : "default"}
          />
        </div>
      ) : null}

      <FilterBar>
        <input
          className={`${inputClass} max-w-xs border-white/[0.08] bg-transparent`}
          placeholder="Buscar nome, slug ou e-mail"
          defaultValue={filters.search}
          onKeyDown={(e) => {
            if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value);
          }}
        />
        <select
          className={`${inputClass} w-auto min-w-[9rem] border-white/[0.08] bg-transparent`}
          value={filters.status}
          onChange={(e) => setParam("status", e.target.value)}
        >
          <option value="ALL">Status: todos</option>
          {(["ACTIVE", "TRIAL", "SUSPENDED", "BLOCKED", "CANCELLED", "PENDING_DELETION"] as const).map(
            (k) => (
              <option key={k} value={k}>
                {STATUS_LABEL[k] || k}
              </option>
            )
          )}
        </select>
        <select
          className={`${inputClass} w-auto min-w-[10rem] border-white/[0.08] bg-transparent`}
          value={filters.financial}
          onChange={(e) => setParam("financial", e.target.value)}
        >
          <option value="ALL">Financeiro: todos</option>
          {Object.entries(FINANCIAL_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          className={`${inputClass} w-auto min-w-[9rem] border-white/[0.08] bg-transparent`}
          value={filters.planId}
          onChange={(e) => setParam("planId", e.target.value)}
        >
          <option value="">Plano: todos</option>
          {(plans.data || []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </FilterBar>

      {data.items.length === 0 ? (
        <EmptyHint title="Nenhuma empresa">Ajuste os filtros ou crie uma nova empresa.</EmptyHint>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th>Empresa</Th>
              <Th>Status</Th>
              <Th>Financeiro</Th>
              <Th>Plano</Th>
              <Th>Admin</Th>
              <Th>Criada</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {data.items.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer transition-colors hover:bg-white/[0.03]"
                onClick={() => router.push(`/admin/companies/${row.id}`)}
              >
                <Td>
                  <p className="font-medium text-white">{row.name}</p>
                  <p className="text-[11px] text-white/35">{row.slug}</p>
                </Td>
                <Td>
                  <ToneBadge code={row.status}>
                    {row.statusLabel || STATUS_LABEL[row.status]}
                  </ToneBadge>
                </Td>
                <Td>
                  <ToneBadge code={row.financialStatus}>
                    {row.financialStatusLabel ||
                      FINANCIAL_LABEL[row.financialStatus || ""] ||
                      "—"}
                  </ToneBadge>
                </Td>
                <Td className="text-white/70">
                  {row.plan?.name || "—"}
                  {row.contractedPrice != null ? (
                    <span className="block text-[11px] text-white/35">
                      {formatCurrency(row.contractedPrice)}
                    </span>
                  ) : null}
                </Td>
                <Td className="text-white/60">{row.primaryAdmin?.email || "—"}</Td>
                <Td className="text-white/45">{formatDate(row.createdAt)}</Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      <Pagination
        page={data.page}
        totalPages={data.totalPages}
        total={data.total}
        unit="empresas"
        onPage={(p) => setParam("page", String(p))}
      />

      <CreateCompanyModal
        open={createOpen}
        plans={plans.data || []}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => {
          setCreateOpen(false);
          void qc.invalidateQueries({ queryKey: ["platform-companies"] });
          toast({ title: "Empresa criada.", kind: "success" });
          router.push(`/admin/companies/${id}`);
        }}
        onError={(msg) => toast({ title: msg, kind: "error" })}
      />
    </div>
  );
}

function CreateCompanyModal({
  open,
  plans,
  onClose,
  onCreated,
  onError,
}: {
  open: boolean;
  plans: PlanRow[];
  onClose: () => void;
  onCreated: (id: string) => void;
  onError: (msg: string) => void;
}) {
  const [force, setForce] = useState(false);
  const mut = useMutation({
    mutationFn: platformAdminApi.createCompany,
    onSuccess: (row) => onCreated(row.id),
    onError: (e) => {
      if (e instanceof ApiError && e.code === "SIMILAR_TENANT_NAME") {
        setForce(true);
        onError(e.message);
        return;
      }
      onError(e instanceof Error ? e.message : "Não foi possível criar.");
    },
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("adminPassword") || "").trim();
    mut.mutate({
      name: String(fd.get("name") || ""),
      adminName: String(fd.get("adminName") || ""),
      adminEmail: String(fd.get("adminEmail") || ""),
      adminPassword: password || undefined,
      planId: String(fd.get("planId") || "") || undefined,
      forceSimilarName: force,
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova empresa">
      <form className="space-y-3" onSubmit={onSubmit}>
        <Field label="Nome da empresa">
          <input name="name" required minLength={2} className={inputClass} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Admin — nome">
            <input name="adminName" required minLength={2} className={inputClass} />
          </Field>
          <Field label="Admin — e-mail">
            <input name="adminEmail" type="email" required className={inputClass} />
          </Field>
        </div>
        <Field label="Senha inicial (opcional)">
          <input name="adminPassword" type="password" minLength={10} className={inputClass} />
        </Field>
        <Field label="Plano">
          <select name="planId" className={inputClass} defaultValue="">
            <option value="">Gratuito (padrão)</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        {force ? (
          <p className="text-[12px] text-amber-200/80">
            Já existe nome semelhante. Envie de novo para confirmar a criação.
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="admin-btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="admin-btn-primary" disabled={mut.isPending}>
            {mut.isPending ? "Criando…" : "Criar empresa"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
