import { api } from "@/lib/api";
import type {
  AccessPolicy,
  AuditList,
  CompanyDetail,
  CompanyList,
  ConvertLeadInput,
  Overview,
  PlanRow,
  SalesLead,
  SalesLeadHistory,
  SalesLeadList,
  SalesLeadSummary,
  UserList,
} from "./types";

export const platformAdminApi = {
  overview: () => api<Overview>("/admin/overview"),

  companies: (params: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "" && v !== "ALL") q.set(k, String(v));
    }
    return api<CompanyList>(`/admin/tenants?${q.toString()}`);
  },

  company: (id: string) => api<CompanyDetail>(`/admin/tenants/${id}`),

  createCompany: (body: {
    name: string;
    adminName: string;
    adminEmail: string;
    adminPassword?: string;
    accessMethod?: "invite" | "temporary_password";
    planId?: string;
    forceSimilarName?: boolean;
  }) => api<CompanyDetail>("/admin/tenants", { method: "POST", json: body }),

  patchCompany: (id: string, body: Record<string, unknown>) =>
    api<CompanyDetail>(`/admin/tenants/${id}`, { method: "PATCH", json: body }),

  registerPayment: (
    id: string,
    body: { amount: number; method?: string; notes?: string; referencePeriod?: string }
  ) => api(`/admin/tenants/${id}/payments`, { method: "POST", json: body }),

  deleteCompany: (id: string, body: { confirmName: string; reason?: string }) =>
    api(`/admin/tenants/${id}`, { method: "DELETE", json: body }),

  impersonate: (body: { tenantId: string; reason: string; userId?: string }) =>
    api<{
      accessToken: string;
      user: { id: string; name: string; email: string; platformRole?: string | null };
      tenant: {
        id: string;
        name: string;
        slug: string;
        primaryColor?: string;
        logoUrl?: string | null;
        role?: string;
      };
    }>("/admin/impersonate", { method: "POST", json: body }),

  users: (params: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "" && v !== "ALL") q.set(k, String(v));
    }
    return api<UserList>(`/admin/users?${q.toString()}`);
  },

  patchUserStatus: (id: string, status: string, reason?: string) =>
    api(`/admin/users/${id}/status`, { method: "PATCH", json: { status, reason } }),

  plans: (commercial = false) =>
    api<PlanRow[]>(`/admin/plans${commercial ? "?commercial=1" : ""}`),

  patchPlan: (id: string, body: Record<string, unknown>) =>
    api<PlanRow>(`/admin/plans/${id}`, { method: "PATCH", json: body }),

  logs: (params: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v) q.set(k, v);
    }
    return api<AuditList>(`/admin/logs?${q.toString()}`);
  },

  leads: (params: Record<string, string | number | undefined> = {}) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "" && v !== "ALL") q.set(k, String(v));
    }
    return api<SalesLeadList>(`/admin/sales-leads?${q.toString()}`);
  },

  lead: (id: string) => api<SalesLead>(`/admin/sales-leads/${id}`),

  leadSummary: () => api<SalesLeadSummary>("/admin/sales-leads/summary"),

  leadHistory: (id: string) => api<SalesLeadHistory>(`/admin/sales-leads/${id}/history`),

  patchLead: (id: string, status: string) =>
    api<SalesLead>(`/admin/sales-leads/${id}`, { method: "PATCH", json: { status } }),

  convertLead: (id: string, body: ConvertLeadInput) =>
    api<{ company: { id: string; name: string; slug: string }; lead: SalesLead }>(
      `/admin/sales-leads/${id}/convert`,
      { method: "POST", json: body }
    ),

  accessPolicy: () => api<AccessPolicy>("/admin/access-policy"),

  putAccessPolicy: (body: Partial<AccessPolicy>) =>
    api<AccessPolicy>("/admin/access-policy", { method: "PUT", json: body }),

  health: () => api<Record<string, unknown>>("/admin/platform-health"),

  diagnostics: () => api<Record<string, unknown>>("/admin/diagnostics/overview"),

  releases: () => api<unknown>("/admin/changelog"),
};
