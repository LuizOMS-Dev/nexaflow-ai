/** Contatos 3.0 — tipos alinhados aos DTOs da API (JSON). */

export const LEAD_STATUSES = [
  "NOVO",
  "EM_ANALISE",
  "QUALIFICADO",
  "NAO_QUALIFICADO",
  "EM_NEGOCIACAO",
  "CLIENTE",
  "PERDIDO",
  "NUTRICAO",
] as const;

export const LEAD_PRIORITIES = ["BAIXA", "NORMAL", "ALTA", "URGENTE"] as const;

export const CONTACT_SORTS = [
  "updatedAt",
  "createdAt",
  "name",
  "score",
  "lastInteractionAt",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type LeadPriority = (typeof LEAD_PRIORITIES)[number];
export type ContactSort = (typeof CONTACT_SORTS)[number];
export type SortOrder = "asc" | "desc";
export type ArchivedFilter = "0" | "1" | "all";

export type ContactTag = { id: string; name: string; color: string };

export type ContactResponsible = {
  id: string;
  name: string;
  email: string;
};

export type ContactListItem = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  jobTitle: string | null;
  city: string | null;
  state: string | null;
  document: string | null;
  source: string | null;
  notes: string | null;
  score: number;
  commercialStatus: LeadStatus | string;
  priority: LeadPriority | string;
  nextAction: string | null;
  nextActionDueAt: string | null;
  stage: string | null;
  lastInteractionAt: string | null;
  createdAt: string;
  updatedAt: string;
  consentMarketing: boolean;
  consentWhatsapp: boolean;
  responsibleUser: ContactResponsible | null;
  tags: ContactTag[];
};

export type ContactDetail = ContactListItem & {
  conversations: Array<{
    id: string;
    status: string;
    lastMessageAt: string | null;
    lastMessagePreview: string | null;
    channelId: string | null;
  }>;
  opportunities: Array<{
    id: string;
    title: string;
    value: string | number | null;
    status: string;
    stageId: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    dueAt: string | null;
    priority: string;
  }>;
  notesList: Array<{
    id: string;
    content: string;
    createdAt: string;
    author: { id: string; name: string } | null;
  }>;
  scoreHistory: Array<{
    id: string;
    previousScore: number;
    newScore: number;
    source: string;
    createdAt: string;
    note: string | null;
  }>;
  memory: {
    id: string;
    content: unknown;
    summary: string | null;
    updatedAt: string;
  } | null;
};

export type ContactListQuery = {
  search?: string;
  status?: string;
  priority?: string;
  responsibleUserId?: string;
  tagId?: string;
  archived?: ArchivedFilter;
  sort?: ContactSort;
  order?: SortOrder;
  page?: number;
  limit?: number;
};

export type ContactListResponse = {
  items: ContactListItem[];
  total: number;
  page: number;
  limit: number;
};

export type ContactWriteInput = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  document?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  city?: string | null;
  state?: string | null;
  source?: string | null;
  notes?: string | null;
  commercialStatus?: string;
  priority?: string;
  score?: number;
  nextAction?: string | null;
  nextActionDueAt?: string | null;
  responsibleUserId?: string | null;
  consentMarketing?: boolean;
  consentWhatsapp?: boolean;
  tagIds?: string[];
  archived?: boolean;
};

export type BulkAction =
  | "archive"
  | "restore"
  | "delete"
  | "set_status"
  | "set_priority"
  | "set_responsible";

export type BulkPayload = {
  commercialStatus?: string;
  priority?: string;
  responsibleUserId?: string | null;
  force?: boolean;
};

export type BulkRequest = {
  action: BulkAction;
  mode: "ids" | "allMatching";
  ids?: string[];
  excludeIds?: string[];
  filters?: Partial<ContactListQuery>;
  payload?: BulkPayload;
};

export type BulkResult = { ok: boolean; affected: number };

export type ImportPreview = {
  headers: string[];
  delimiter: string;
  rowCount: number;
  warnings: string[];
  suggestedMap: Record<string, string>;
  sample: Record<string, string>[];
};

export type ImportResult = {
  created: number;
  skipped: number;
  invalid: number;
  errors: Array<{ row: number; message: string }>;
};

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role?: string;
  avatarUrl?: string | null;
};

export type ContactFiltersState = {
  q: string;
  status: string;
  priority: string;
  assignee: string;
  archived: ArchivedFilter;
  sort: ContactSort;
  order: SortOrder;
  page: number;
};

export const IMPORT_FIELDS = [
  "name",
  "phone",
  "email",
  "company",
  "jobTitle",
  "city",
  "state",
  "source",
  "document",
  "notes",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

export const IMPORT_FIELD_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "skip", label: "— ignorar —" },
  { value: "name", label: "Nome" },
  { value: "phone", label: "Telefone" },
  { value: "email", label: "E-mail" },
  { value: "company", label: "Empresa" },
  { value: "jobTitle", label: "Cargo" },
  { value: "city", label: "Cidade" },
  { value: "state", label: "Estado" },
  { value: "source", label: "Origem" },
  { value: "document", label: "Documento" },
  { value: "notes", label: "Notas" },
];

export const CONTACT_SORT_OPTIONS: Array<{ value: ContactSort; label: string }> = [
  { value: "updatedAt", label: "Atualização" },
  { value: "createdAt", label: "Criação" },
  { value: "name", label: "Nome" },
  { value: "score", label: "Score" },
  { value: "lastInteractionAt", label: "Última interação" },
];

export const IMPORT_MAX_ROWS = 2000;
export const IMPORT_MAX_CHARS = 2_000_000;
export const CONTACTS_PAGE_SIZE = 20;

export function statusBadgeClass(status: string): string {
  switch (status) {
    case "NOVO":
      return "badge-brand";
    case "QUALIFICADO":
    case "CLIENTE":
      return "badge-success";
    case "EM_NEGOCIACAO":
      return "badge-warning";
    case "PERDIDO":
      return "badge-danger";
    default:
      return "badge-neutral";
  }
}

export function priorityBadgeClass(priority: string): string {
  switch (priority) {
    case "URGENTE":
      return "badge-danger";
    case "ALTA":
      return "badge-warning";
    case "NORMAL":
      return "badge-brand";
    default:
      return "badge-neutral";
  }
}

export function isArchivedStage(stage?: string | null): boolean {
  return stage === "archived";
}

export function listQueryFromFilters(
  f: ContactFiltersState
): ContactListQuery {
  return {
    search: f.q.trim() || undefined,
    status: f.status || undefined,
    priority: f.priority || undefined,
    responsibleUserId: f.assignee || undefined,
    archived: f.archived,
    sort: f.sort,
    order: f.order,
    page: f.page,
    limit: CONTACTS_PAGE_SIZE,
  };
}

export function bulkFiltersFromState(
  f: ContactFiltersState
): Partial<ContactListQuery> {
  return {
    search: f.q.trim() || undefined,
    status: f.status || undefined,
    priority: f.priority || undefined,
    responsibleUserId: f.assignee || undefined,
    archived: f.archived,
  };
}

export function filtersSignature(f: ContactFiltersState): string {
  return [f.q.trim(), f.status, f.priority, f.assignee, f.archived, f.sort, f.order].join(
    "|"
  );
}
