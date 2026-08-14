"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/store/auth";
import { hasPermission, type Permission } from "@/lib/permissions";
import { fetchContacts, fetchTeamMembers } from "../api";
import {
  CONTACT_SORTS,
  listQueryFromFilters,
  type ArchivedFilter,
  type ContactFiltersState,
  type ContactSort,
  type SortOrder,
} from "../types";

function isArchived(v: string | null): v is ArchivedFilter {
  return v === "0" || v === "1" || v === "all";
}

function isSort(v: string | null): v is ContactSort {
  return !!v && (CONTACT_SORTS as readonly string[]).includes(v);
}

function filtersFromSearch(sp: URLSearchParams): ContactFiltersState {
  const pageRaw = Number(sp.get("page") || "1");
  const archivedRaw = sp.get("archived");
  const sortRaw = sp.get("sort");
  return {
    q: (sp.get("q") ?? "").trim(),
    status: sp.get("status") ?? "",
    priority: sp.get("priority") ?? "",
    assignee: sp.get("assignee") ?? "",
    archived: isArchived(archivedRaw) ? archivedRaw : "0",
    sort: isSort(sortRaw) ? sortRaw : "updatedAt",
    order: sp.get("order") === "asc" ? "asc" : "desc",
    page: Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1,
  };
}

function writeSearch(f: ContactFiltersState, contactId: string | null): string {
  const sp = new URLSearchParams();
  if (f.q) sp.set("q", f.q);
  if (f.status) sp.set("status", f.status);
  if (f.priority) sp.set("priority", f.priority);
  if (f.assignee) sp.set("assignee", f.assignee);
  if (f.archived !== "0") sp.set("archived", f.archived);
  if (f.sort !== "updatedAt") sp.set("sort", f.sort);
  if (f.order !== "desc") sp.set("order", f.order);
  if (f.page > 1) sp.set("page", String(f.page));
  if (contactId) sp.set("contactId", contactId);
  return sp.toString();
}

function normalizeQs(qs: string): string {
  const sp = new URLSearchParams(qs);
  return [...sp.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

function readImpersonating(): boolean {
  try {
    return sessionStorage.getItem("nexaflow_impersonating") === "1";
  } catch {
    return false;
  }
}

export function useContactList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const user = useAuth((s) => s.user);
  const tenant = useAuth((s) => s.tenant);

  const initial = useMemo(() => filtersFromSearch(searchParams), [searchParams]);

  const [qInput, setQInput] = useState(searchParams.get("q") ?? "");
  const [filters, setFilters] = useState<ContactFiltersState>(initial);
  const [filtersOpen, setFiltersOpen] = useState(
    initial.archived !== "0" ||
      initial.sort !== "updatedAt" ||
      initial.order !== "desc"
  );

  const impersonating = readImpersonating();
  const can = useCallback(
    (perm: Permission) =>
      hasPermission(tenant?.role, user?.platformRole, perm, { impersonating }),
    [tenant?.role, user?.platformRole, impersonating]
  );

  const canRead = can("contacts.read");
  const canCreate = can("contacts.create");
  const canUpdate = can("contacts.update");
  const canDelete = can("contacts.delete");

  const contactId = searchParams.get("contactId");

  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = qInput.trim();
      setFilters((prev) => {
        if (prev.q === next) return prev;
        return { ...prev, q: next, page: 1 };
      });
    }, 280);
    return () => window.clearTimeout(t);
  }, [qInput]);

  useEffect(() => {
    const qs = writeSearch(filters, contactId);
    if (normalizeQs(qs) === normalizeQs(searchParams.toString())) return;
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [filters, contactId, pathname, router, searchParams]);

  const setFilter = useCallback(
    <K extends keyof ContactFiltersState>(key: K, value: ContactFiltersState[K]) => {
      setFilters((prev) => {
        const next = { ...prev, [key]: value };
        if (key !== "page") next.page = 1;
        return next;
      });
    },
    []
  );

  const setPage = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page: Math.max(1, page) }));
  }, []);

  const setSort = useCallback((sort: ContactSort, order?: SortOrder) => {
    setFilters((prev) => ({
      ...prev,
      sort,
      order: order ?? prev.order,
      page: 1,
    }));
  }, []);

  const setContactId = useCallback(
    (id: string | null) => {
      const qs = writeSearch(filtersRef.current, id);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router]
  );

  const listQuery = useMemo(() => listQueryFromFilters(filters), [filters]);

  const list = useQuery({
    queryKey: ["contacts", listQuery],
    queryFn: () => fetchContacts(listQuery),
    enabled: canRead,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });

  const team = useQuery({
    queryKey: ["contacts-team-members"],
    queryFn: fetchTeamMembers,
    enabled: canRead,
    staleTime: 60_000,
  });

  const memberOptions = useMemo(
    () =>
      (team.data ?? []).map((m) => ({
        value: m.id,
        label: m.name,
        description: m.email,
      })),
    [team.data]
  );

  return {
    qInput,
    setQInput,
    filters,
    setFilter,
    setPage,
    setSort,
    filtersOpen,
    setFiltersOpen,
    contactId,
    setContactId,
    list,
    memberOptions,
    canRead,
    canCreate,
    canUpdate,
    canDelete,
  };
}
