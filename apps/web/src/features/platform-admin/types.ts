export type TenantStatus =
  | "ACTIVE"
  | "TRIAL"
  | "BLOCKED"
  | "SUSPENDED"
  | "CANCELLED"
  | "PENDING_DELETION";

export type FinancialStatus =
  | "IN_GOOD_STANDING"
  | "DUE_TODAY"
  | "DUE_SOON"
  | "OVERDUE"
  | "PAYMENT_PENDING"
  | "TRIAL"
  | "CANCELLED"
  | "SUSPENDED"
  | "UNKNOWN";

export type AlertItem = {
  id: string;
  severity: "warning" | "danger" | "info";
  title: string;
  href?: string;
};

export type Overview = {
  stats: {
    tenants: number;
    users: number;
    conversations: number;
    messages: number;
    contacts?: number;
    activeAgents?: number;
    automationRuns?: number;
    activeTenants?: number;
    suspendedTenants?: number;
    blockedTenants?: number;
    trialTenants?: number;
    cancelledTenants?: number;
    overdueTenants?: number;
    dueSoonTenants?: number;
    paidSubscriptions?: number;
    mrr?: number;
    arr?: number;
    avgTicket?: number;
  };
  finance?: {
    mrr: number;
    arr: number;
    avgTicket: number;
    paidSubscriptions: number;
    revenueByPlan: Array<{
      planId: string;
      planName: string;
      planSlug?: string;
      priceMonthly: number | null;
      priceOnRequest?: boolean;
      priceLabel?: string;
      isActive?: boolean;
      tenants: number;
      mrr: number;
    }>;
    costsAvailable: boolean;
    profitAvailable: boolean;
    note: string;
  };
  usage?: {
    conversations: number;
    messages: number;
    contacts: number;
    activeAgents: number;
    automationRuns: number;
  };
  recentTenants: Array<{
    id: string;
    name: string;
    status: string;
    createdAt: string;
    plan?: { name: string } | null;
    _count: { members: number };
  }>;
  alerts?: AlertItem[];
};

export type CompanyRow = {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  statusLabel?: string;
  createdAt: string;
  plan?: { id: string; name: string; priceMonthly?: number | string } | null;
  _count?: { members: number; contacts: number; conversations: number };
  contractedPrice?: number | null;
  financialStatus?: FinancialStatus;
  financialStatusLabel?: string;
  nextDueAt?: string | null;
  daysOverdue?: number | null;
  needsAttention?: boolean;
  primaryAdmin?: { id: string; name: string; email: string } | null;
};

export type CompanyList = {
  items: CompanyRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary?: {
    total: number;
    active: number;
    overdue: number;
    suspended: number;
    blocked: number;
    trial: number;
    dueIn7Days: number;
    cancelled: number;
    needsAttention: number;
  };
};

export type PlanRow = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  priceMonthly?: number | string;
  priceAnnual?: number | string | null;
  priceOnRequest?: boolean;
  isActive?: boolean;
  sortOrder?: number;
  maxUsers?: number;
  maxChannels?: number;
  maxContacts?: number;
  maxAiMessages?: number;
  badge?: string | null;
  features?: Record<string, unknown> | null;
  _count?: { tenants: number };
};

export type PlatformUser = {
  id: string;
  email: string;
  name: string;
  platformRole?: string | null;
  status?: string | null;
  isActive?: boolean;
  twoFactorEnabled?: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  memberships?: Array<{
    id: string;
    role: string;
    isActive: boolean;
    tenant: { id: string; name: string; slug: string };
  }>;
};

export type UserList = {
  items: PlatformUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type CompanyDetail = CompanyRow & {
  logoUrl?: string | null;
  primaryColor?: string;
  planId?: string | null;
  profile?: {
    segment?: string | null;
    phone?: string | null;
    website?: string | null;
    commercialEmail?: string | null;
    city?: string | null;
    state?: string | null;
    timezone?: string;
    language?: string;
    onboardingCompleted?: boolean;
  };
  lifecycle?: Record<string, string | null>;
  members?: Array<{
    id: string;
    role: string;
    isActive: boolean;
    user: {
      id: string;
      name: string;
      email: string;
      isActive: boolean;
      lastLoginAt?: string | null;
    };
  }>;
  payments?: Array<{
    id: string;
    amount: number;
    paidAt: string;
    referencePeriod?: string | null;
    method?: string | null;
    notes?: string | null;
  }>;
  auditLogs?: Array<{
    id: string;
    action: string;
    createdAt: string;
    user?: { name?: string | null; email?: string | null } | null;
  }>;
  subscription?: {
    id: string;
    billingStatus: string;
    priceMonthly?: number | null;
    billingDueDay?: number | null;
    currentPeriodEnd?: string | null;
  } | null;
  billingDueDay?: number | null;
  limits?: Record<string, number>;
  usage?: Record<string, number>;
};

export type AuditList = {
  items: Array<{
    id: string;
    action: string;
    entity?: string | null;
    createdAt: string;
    user?: { id: string; name: string; email: string } | null;
    tenant?: { id: string; name: string } | null;
    metadata?: unknown;
  }>;
  nextCursor: string | null;
};

export type SalesLead = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  companyName?: string | null;
  teamSize?: string | null;
  message?: string | null;
  source?: string | null;
  status: string;
  createdAt: string;
};

export type CompanyAction =
  | "block"
  | "unblock"
  | "suspend"
  | "reactivate"
  | "cancel_subscription"
  | "request_deletion"
  | "cancel_deletion";

export type AccessPolicy = {
  graceDays: number;
  autoSuspendNonpayment: boolean;
  companySuspendMode: "LIMITED" | "TOTAL";
};
