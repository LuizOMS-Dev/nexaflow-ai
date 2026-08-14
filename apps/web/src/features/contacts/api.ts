import { api } from "@/lib/api";
import type {
  BulkRequest,
  BulkResult,
  ContactDetail,
  ContactListQuery,
  ContactListResponse,
  ContactWriteInput,
  ImportPreview,
  ImportResult,
  TeamMember,
} from "./types";

function toSearchParams(q: ContactListQuery): string {
  const sp = new URLSearchParams();
  if (q.search) sp.set("search", q.search);
  if (q.status) sp.set("status", q.status);
  if (q.priority) sp.set("priority", q.priority);
  if (q.responsibleUserId) sp.set("responsibleUserId", q.responsibleUserId);
  if (q.tagId) sp.set("tagId", q.tagId);
  if (q.archived) sp.set("archived", q.archived);
  if (q.sort) sp.set("sort", q.sort);
  if (q.order) sp.set("order", q.order);
  if (q.page) sp.set("page", String(q.page));
  if (q.limit) sp.set("limit", String(q.limit));
  return sp.toString();
}

export function fetchContacts(q: ContactListQuery) {
  return api<ContactListResponse>(`/contacts?${toSearchParams(q)}`);
}

export function fetchContact(id: string) {
  return api<ContactDetail>(`/contacts/${id}`);
}

export function fetchContactScoreHistory(id: string) {
  return api<ContactDetail["scoreHistory"]>(`/contacts/${id}/score-history`);
}

export function createContact(body: ContactWriteInput) {
  return api<{ id: string }>("/contacts", { method: "POST", json: body });
}

export function updateContact(id: string, body: ContactWriteInput) {
  return api<ContactDetail>(`/contacts/${id}`, { method: "PATCH", json: body });
}

export function deleteContact(id: string, opts?: { force?: boolean }) {
  const qs = opts?.force ? "?force=true" : "";
  return api<{ ok: true }>(`/contacts/${id}${qs}`, { method: "DELETE" });
}

export function bulkContacts(body: BulkRequest) {
  return api<BulkResult>("/contacts/bulk", { method: "POST", json: body });
}

export function previewContactImport(csv: string, delimiter?: string) {
  return api<ImportPreview>("/contacts/import/preview", {
    method: "POST",
    json: { csv, delimiter },
    timeoutMs: 30_000,
  });
}

export function commitContactImport(input: {
  csv: string;
  fieldMap: Record<string, string>;
  skipDuplicates: boolean;
  delimiter?: string;
}) {
  return api<ImportResult>("/contacts/import", {
    method: "POST",
    json: input,
    timeoutMs: 60_000,
  });
}

export async function fetchTeamMembers(): Promise<TeamMember[]> {
  const data = await api<{ items?: TeamMember[] }>("/team/members");
  return data.items ?? [];
}
