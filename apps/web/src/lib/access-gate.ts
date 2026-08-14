/** Tipos do Access Gate (espelho do backend). */

export type AccessLevel = "FULL" | "WARNING" | "RESTRICTED" | "BLOCKED";

export type AccessCode =
  | "FULL_ACCESS"
  | "PAYMENT_GRACE"
  | "PAYMENT_OVERDUE"
  | "PAYMENT_SUSPENDED"
  | "USER_BLOCKED"
  | "USER_SUSPENDED"
  | "USER_DISABLED"
  | "COMPANY_BLOCKED"
  | "COMPANY_SUSPENDED"
  | "COMPANY_CANCELLED"
  | "COMPANY_PENDING_DELETION"
  | "MEMBERSHIP_INACTIVE";

export type AccessState = {
  level: AccessLevel;
  code: AccessCode;
  title: string;
  message: string;
  userStatus: string;
  companyStatus: string | null;
  financialStatus: string;
  financialLabel: string;
  capabilities: {
    canUseApp: boolean;
    canMutate: boolean;
    canAccessBilling: boolean;
    canUsePublicApi: boolean;
    canDispatchWebhooks: boolean;
    canRunAutomations: boolean;
    canRunCampaigns: boolean;
    canRunAiAuto: boolean;
    canSendWhatsAppAuto: boolean;
  };
  operationalPaused: boolean;
  impersonating: boolean;
  warningBanner: null | {
    kind: "payment_grace" | "payment_overdue";
    title: string;
    body: string;
    ctaLabel?: string;
    ctaHref?: string;
  };
  graceDays: number;
  daysOverdue: number | null;
  publicReason: string | null;
  nextDueAt: string | null;
};

export function isAccessGateCode(code?: string): boolean {
  if (!code) return false;
  return [
    "USER_BLOCKED",
    "USER_SUSPENDED",
    "USER_DISABLED",
    "COMPANY_BLOCKED",
    "COMPANY_SUSPENDED",
    "COMPANY_CANCELLED",
    "COMPANY_PENDING_DELETION",
    "MEMBERSHIP_INACTIVE",
    "PAYMENT_SUSPENDED",
    "PAYMENT_GRACE",
    "PAYMENT_OVERDUE",
    "TENANT_BLOCKED",
    "TENANT_SUSPENDED",
    "TENANT_PENDING_DELETION",
    "TENANT_UNAVAILABLE",
  ].includes(code);
}
