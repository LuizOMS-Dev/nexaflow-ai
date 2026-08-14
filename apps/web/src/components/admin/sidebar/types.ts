import type { ComponentType } from "react";

export type SidebarIcon = ComponentType<{
  className?: string;
  strokeWidth?: number;
}>;

export type SidebarNavItem = {
  href: string;
  label: string;
  icon: SidebarIcon;
};

export type SidebarNavGroup = {
  label: string;
  items: SidebarNavItem[];
};

export type SidebarUserInfo = {
  name: string;
  email?: string | null;
  roleBadge?: string | null;
  showRoleBadge?: boolean;
  avatarUrl?: string | null;
  avatarType?: string | null;
  avatarPresetId?: string | null;
  avatarColor?: string | null;
};
