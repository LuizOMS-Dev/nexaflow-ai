import { getAccessToken } from "@/lib/api";
import { useAuth, type UserInfo } from "@/store/auth";

export function applyUser(user: UserInfo) {
  const token = getAccessToken() || useAuth.getState().token;
  const { tenant, memberships } = useAuth.getState();
  if (token) {
    useAuth.getState().setSession({ token, user, tenant, memberships });
  } else {
    useAuth.setState({ user });
  }
}

export function getRoleLabel(
  user: UserInfo,
  memberships: Array<{ role: string }>
): string {
  if (user.platformRole === "SUPERADMIN") return "Superadministrador";
  const role = memberships[0]?.role;
  if (role === "ADMIN") return "Administrador";
  if (role === "SUPERVISOR") return "Supervisor";
  if (role === "AGENT") return "Atendente";
  if (role === "SALES") return "Vendas";
  if (role === "READONLY") return "Somente leitura";
  return "Membro";
}

export const MEMBER_ROLE_PT: Record<string, string> = {
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor",
  AGENT: "Atendente",
  SALES: "Vendas",
  READONLY: "Somente leitura",
};
