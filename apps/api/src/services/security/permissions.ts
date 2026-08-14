import type { MemberRole, PlatformRole } from "@prisma/client";

export type Permission =
  | "users.read"
  | "users.create"
  | "users.update"
  | "users.delete"
  | "contacts.read"
  | "contacts.create"
  | "contacts.update"
  | "contacts.delete"
  | "conversations.read"
  | "conversations.reply"
  | "conversations.assign"
  | "crm.read"
  | "crm.create"
  | "crm.update"
  | "crm.delete"
  | "tasks.read"
  | "tasks.create"
  | "tasks.update"
  | "settings.read"
  | "settings.update"
  | "ai.manage"
  | "channels.manage"
  | "team.manage"
  | "reports.read"
  | "onboarding.complete"
  | "audit.read";

const ROLE_PERMS: Record<MemberRole, Permission[]> = {
  ADMIN: [
    "users.read",
    "users.create",
    "users.update",
    "users.delete",
    "contacts.read",
    "contacts.create",
    "contacts.update",
    "contacts.delete",
    "conversations.read",
    "conversations.reply",
    "conversations.assign",
    "crm.read",
    "crm.create",
    "crm.update",
    "crm.delete",
    "tasks.read",
    "tasks.create",
    "tasks.update",
    "settings.read",
    "settings.update",
    "ai.manage",
    "channels.manage",
    "team.manage",
    "reports.read",
    "onboarding.complete",
    "audit.read",
  ],
  SUPERVISOR: [
    "users.read",
    "contacts.read",
    "contacts.create",
    "contacts.update",
    "conversations.read",
    "conversations.reply",
    "conversations.assign",
    "crm.read",
    "crm.create",
    "crm.update",
    "tasks.read",
    "tasks.create",
    "tasks.update",
    "settings.read",
    "reports.read",
    "ai.manage",
    "channels.manage",
  ],
  AGENT: [
    "contacts.read",
    "contacts.create",
    "contacts.update",
    "conversations.read",
    "conversations.reply",
    "tasks.read",
    "tasks.create",
    "tasks.update",
    "crm.read",
    "reports.read",
  ],
  SALES: [
    "contacts.read",
    "contacts.create",
    "contacts.update",
    "conversations.read",
    "conversations.reply",
    "crm.read",
    "crm.create",
    "crm.update",
    "tasks.read",
    "tasks.create",
    "tasks.update",
    "reports.read",
  ],
  READONLY: [
    "contacts.read",
    "conversations.read",
    "crm.read",
    "tasks.read",
    "reports.read",
    "settings.read",
  ],
};

export function permissionsForRole(
  role?: MemberRole | null,
  platformRole?: PlatformRole | string | null,
  opts?: { impersonating?: boolean }
): Permission[] {
  // Superadmin real (sem impersonação) tem tudo
  if (platformRole === "SUPERADMIN" && !opts?.impersonating) {
    return Object.values(ROLE_PERMS.ADMIN);
  }
  if (!role) return [];
  return ROLE_PERMS[role] || [];
}

export function hasPermission(
  role: MemberRole | null | undefined,
  platformRole: PlatformRole | string | null | undefined,
  permission: Permission,
  opts?: { impersonating?: boolean }
): boolean {
  if (platformRole === "SUPERADMIN" && !opts?.impersonating) return true;
  return permissionsForRole(role, platformRole, opts).includes(permission);
}
