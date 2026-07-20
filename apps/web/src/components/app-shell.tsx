"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  LayoutDashboard,
  MessagesSquare,
  Users,
  Columns3,
  ListTodo,
  Megaphone,
  GitBranch,
  Sparkles,
  Library,
  UsersRound,
  Radio,
  ChartColumn,
  Settings,
  Shield,
  Moon,
  Sun,
  LogOut,
  Menu,
  X,
  Building2,
  PanelLeftClose,
  PanelLeft,
  Check,
  ChevronDown,
  UserRound,
  ShieldCheck,
  MonitorSmartphone,
  Settings2,
  Activity,
  UserPlus,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { needsCompanyOnboarding } from "@/lib/onboarding";
import { consumeAppEntrance } from "./auth/auth-transition";
import { Spinner, Tooltip } from "./ui";
import { Logo } from "./brand/logo";
import { CommandPalette } from "./command-palette";
import { UserAvatar } from "./user-avatar";
import { NotificationBell } from "./notification-bell";
import { WhatsAppStatusBanner } from "./whatsapp-status-banner";
import { HumanQueueBanner } from "./human-queue-banner";
import { PlatformTourController } from "./platform-tour/platform-tour-controller";
import { tourHrefToDataAttr } from "@/lib/platform-tour";
import { NexaflowAssistantProvider } from "./nexaflow-assistant/nexaflow-assistant-drawer";

const SIDEBAR_KEY = "nexaflow_sidebar_collapsed";

/** Navegação operacional do TENANT (empresa) */
const tenantNavGroups = [
  {
    label: "Principal",
    items: [
      { href: "/app", label: "Início", icon: LayoutDashboard },
      { href: "/app/inbox", label: "Conversas", icon: MessagesSquare },
      { href: "/app/contacts", label: "Contatos", icon: Users },
    ],
  },
  {
    label: "Vendas",
    items: [
      { href: "/app/crm", label: "Funil", icon: Columns3 },
      { href: "/app/tasks", label: "Tarefas", icon: ListTodo },
      { href: "/app/campaigns", label: "Campanhas", icon: Megaphone },
    ],
  },
  {
    label: "Automação",
    items: [
      { href: "/app/automations", label: "Fluxos", icon: GitBranch },
      { href: "/app/ai", label: "Agentes", icon: Sparkles },
      { href: "/app/knowledge", label: "Conhecimento", icon: Library },
    ],
  },
  {
    label: "Gestão",
    items: [
      { href: "/app/team", label: "Equipe", icon: UsersRound },
      { href: "/app/integrations", label: "Canais", icon: Radio },
      { href: "/app/reports", label: "Relatórios", icon: ChartColumn },
      { href: "/app/settings", label: "Configurações", icon: Settings },
    ],
  },
];

/** Navegação exclusiva do SUPERADMIN em contexto GLOBAL (NexaFlow Platform) */
const platformNavGroups = [
  {
    label: "Plataforma",
    items: [
      { href: "/admin", label: "Visão geral", icon: LayoutDashboard },
      { href: "/admin/companies", label: "Empresas", icon: Building2 },
      { href: "/admin/sales-leads", label: "Leads comerciais", icon: UserPlus },
      { href: "/admin/users", label: "Usuários", icon: Users },
      { href: "/admin/finance", label: "Financeiro", icon: ChartColumn },
      { href: "/admin/plans", label: "Planos", icon: Settings },
      { href: "/admin/audit", label: "Auditoria", icon: Shield },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/admin/system/releases", label: "Atualizações", icon: Megaphone },
      { href: "/admin/system/diagnostics", label: "Diagnóstico", icon: Activity },
      { href: "/admin/system/health", label: "Saúde", icon: Radio },
    ],
  },
];

const roleLabel: Record<string, string> = {
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor",
  AGENT: "Atendente",
  SALES: "Comercial",
  READONLY: "Leitura",
  SUPERADMIN: "Super Admin",
};

/** Nomes genéricos / cargo usado como identidade — não preferir como "nome da pessoa" */
const GENERIC_PERSON_NAMES = new Set([
  "admin",
  "administrador",
  "administrator",
  "superadmin",
  "super admin",
  "super-admin",
  "user",
  "usuario",
  "usuário",
  "system",
  "root",
  "nexaflow",
  "membro",
  "member",
]);

function isNavActive(pathname: string, href: string) {
  if (pathname === href) return true;
  // /admin exato — não marcar ativo em /admin/companies
  if (href === "/admin" || href === "/app") return false;
  // Empresas cobre detalhe de tenant
  if (href === "/admin/companies") {
    return (
      pathname.startsWith("/admin/companies") || pathname.startsWith("/admin/tenants")
    );
  }
  return pathname.startsWith(href);
}

/** Fora do AppShell para não remountar a cada re-render (sidebar “travando”) */
function SidebarNavLink({
  href,
  label,
  group,
  icon: Icon,
  pathname,
  collapsed,
  onNavigate,
  disabled,
  disabledReason,
}: {
  href: string;
  label: string;
  group?: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
  /** MFA pendente: item visível, sem navegação */
  disabled?: boolean;
  disabledReason?: string;
}) {
  const active = !disabled && isNavActive(pathname, href);

  const itemClass = cn(
    "nav-item group w-full",
    active && "nav-item-active",
    disabled && "cursor-not-allowed opacity-40 hover:bg-transparent dark:hover:bg-transparent"
  );

  const iconClass = cn(
    "nav-item-icon shrink-0 transition-colors duration-150",
    disabled
      ? "text-[#9AA3B2] dark:text-gray-600"
      : active
        ? "text-brand-600 dark:text-violet-300"
        : "text-[#7A8496] group-hover:text-[#4B5568] dark:text-gray-500 dark:group-hover:text-gray-300"
  );

  const content = (
    <>
      <Icon className={iconClass} strokeWidth={active ? 1.85 : 1.5} />
      <span className="nf-sidebar-label">{label}</span>
    </>
  );

  const tourAttr = tourHrefToDataAttr(href);

  const link = disabled ? (
    <button
      type="button"
      className={itemClass}
      aria-disabled="true"
      disabled
      onClick={(e) => e.preventDefault()}
      {...(tourAttr ? { "data-tour": tourAttr } : {})}
    >
      {content}
    </button>
  ) : (
    <Link
      href={href}
      onClick={onNavigate}
      className={itemClass}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      {...(tourAttr ? { "data-tour": tourAttr } : {})}
    >
      {content}
    </Link>
  );

  // Tooltip: recolhido (label) ou desabilitado (motivo MFA)
  if (collapsed || disabled) {
    return (
      <Tooltip
        content={label}
        subtitle={disabled ? disabledReason || "Indisponível" : group}
        side="right"
        delay={280}
        className={cn("flex w-full", collapsed && "justify-center")}
      >
        {link}
      </Tooltip>
    );
  }

  return link;
}

/** Prioridade: nome real da pessoa → local do e-mail (se não genérico) → nome cadastrado → e-mail */
function resolveDisplayName(name: string | null | undefined, email: string | null | undefined): string {
  const raw = (name || "").trim();
  const mail = (email || "").trim();
  const normalized = raw.toLowerCase();

  if (raw && !GENERIC_PERSON_NAMES.has(normalized)) {
    return raw;
  }

  const local = mail.includes("@") ? mail.split("@")[0] : "";
  if (local && !GENERIC_PERSON_NAMES.has(local.toLowerCase())) {
    return local
      .replace(/[._-]+/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }

  if (raw) return raw;
  if (mail) return mail;
  return "Usuário";
}

/** Papel para badge / tooltip */
function resolveRoleBadge(
  platformRole: string | null | undefined,
  tenantRole: string | null | undefined,
  opts?: { platformContext?: boolean; impersonating?: boolean }
): string | null {
  if (opts?.platformContext) return "Superadministrador";
  if (opts?.impersonating && platformRole === "SUPERADMIN") {
    return "Super Admin · Impersonando";
  }
  if (platformRole === "SUPERADMIN" && !opts?.impersonating) return roleLabel.SUPERADMIN;
  const key = tenantRole || platformRole || "";
  if (!key) return null;
  return roleLabel[key] || key;
}

function readImpersonatingFlag(): boolean {
  try {
    return sessionStorage.getItem("nexaflow_impersonating") === "1";
  } catch {
    return false;
  }
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, tenant, memberships, hydrated, logout, switchTenant, setSession, clearTenant } =
    useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [impersonating, setImpersonating] = useState(false);
  const [dark, setDark] = useState(false);
  const [enterAnim, setEnterAnim] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  /** Mantém o menu no DOM durante a animação de saída */
  const [userMenuPresent, setUserMenuPresent] = useState(false);
  /** Classe visual aberta (CSS transition) */
  const [userMenuAnim, setUserMenuAnim] = useState(false);
  /** true = popover flutuante (sidebar recolhida); false = 100% dentro da sidebar */
  const [userMenuFloating, setUserMenuFloating] = useState(false);
  const [userMenuPos, setUserMenuPos] = useState<{
    left: number;
    bottom: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const [userMenuPortalReady, setUserMenuPortalReady] = useState(false);
  const companyRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userMenuPanelRef = useRef<HTMLDivElement>(null);
  const userMenuBtnRef = useRef<HTMLButtonElement>(null);
  const userMenuCloseTimer = useRef<number | null>(null);
  const onboarding = needsCompanyOnboarding(tenant);
  const multiTenant = memberships.length > 1;
  const isOnboardingRoute = pathname.startsWith("/app/onboarding");

  useEffect(() => {
    if (hydrated && !user) router.replace("/login");
  }, [hydrated, user, router]);

  useEffect(() => {
    if (!hydrated || !user || !tenant) return;
    // Onboarding só no contexto tenant
    if (onboarding && !isOnboardingRoute) router.replace("/app/onboarding");
  }, [hydrated, user, tenant, pathname, router, onboarding, isOnboardingRoute]);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    setUserMenuPortalReady(true);
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1");
      setImpersonating(readImpersonatingFlag());
    } catch {
      /* ignore */
    }
  }, []);

  // SUPERADMIN global: limpa tenant residual e não usa /app operacional
  useEffect(() => {
    if (!hydrated || !user) return;
    const imp = readImpersonatingFlag();
    if (user.platformRole !== "SUPERADMIN" || imp) return;
    if (tenant) clearTenant();
    if (pathname.startsWith("/app") && !pathname.startsWith("/app/account")) {
      router.replace("/admin");
    }
  }, [hydrated, user, tenant, pathname, router, clearTenant]);

  // Trava scroll do body no painel — scroll só no main
  useEffect(() => {
    if (isOnboardingRoute) {
      document.documentElement.classList.remove("nf-panel-lock");
      return;
    }
    document.documentElement.classList.add("nf-panel-lock");
    return () => {
      document.documentElement.classList.remove("nf-panel-lock");
    };
  }, [isOnboardingRoute]);

  // Propaga altura do banner para toasts/modais (fixed na viewport)
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--nf-banner-height",
      impersonating ? "2.5rem" : "0px"
    );
    return () => {
      document.documentElement.style.setProperty("--nf-banner-height", "0px");
    };
  }, [impersonating]);

  useEffect(() => {
    const kind = consumeAppEntrance();
    if (!kind) return;
    setEnterAnim(true);
    const t = window.setTimeout(() => setEnterAnim(false), 700);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setCompanyOpen(false);
    setUserMenuOpen(false);
    setUserMenuAnim(false);
    setUserMenuPresent(false);
    setUserMenuFloating(false);
    setUserMenuPos(null);
    if (userMenuCloseTimer.current) {
      window.clearTimeout(userMenuCloseTimer.current);
      userMenuCloseTimer.current = null;
    }
  }, [pathname]);

  /**
   * Só para sidebar RECOLHIDA: popover à direita do avatar.
   * Expandida usa menu inline (sem portal).
   */
  const computeFloatingUserMenuPos = useCallback((btn: HTMLElement) => {
    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 8;
    const width = Math.min(260, Math.max(220, Math.min(vw - 16, 260)));
    const estHeight = 340;
    let left = r.right + gap;
    if (left + width > vw - 8) {
      left = Math.max(8, r.left - width - gap);
    }
    let bottom = Math.max(8, vh - r.bottom);
    let maxHeight = Math.max(200, vh - bottom - 8);
    if (estHeight > maxHeight) {
      bottom = Math.max(8, Math.min(bottom, vh - Math.min(estHeight, vh - 16) - 8));
      maxHeight = Math.max(200, vh - bottom - 8);
    }
    maxHeight = Math.min(maxHeight, Math.min(vh - 16, 480));
    return { left, bottom, width, maxHeight };
  }, []);

  const updateUserMenuPos = useCallback(() => {
    if (!userMenuFloating) return;
    const btn = userMenuBtnRef.current;
    if (!btn || typeof btn.getBoundingClientRect !== "function") return;
    const r = btn.getBoundingClientRect();
    if (r.width < 1 && r.height < 1) return;
    setUserMenuPos(computeFloatingUserMenuPos(btn));
  }, [computeFloatingUserMenuPos, userMenuFloating]);

  function openUserMenuFrom(btn: HTMLButtonElement, floating: boolean) {
    userMenuBtnRef.current = btn;
    if (userMenuCloseTimer.current) {
      window.clearTimeout(userMenuCloseTimer.current);
      userMenuCloseTimer.current = null;
    }
    setUserMenuFloating(floating);
    if (floating) {
      setUserMenuPos(computeFloatingUserMenuPos(btn));
    } else {
      setUserMenuPos(null);
    }
    setUserMenuOpen(true);
    setUserMenuPresent(true);
    // 2 rAF: pinta estado fechado e anima para aberto (fluido)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setUserMenuAnim(true));
    });
  }

  function closeUserMenu() {
    setUserMenuOpen(false);
    setUserMenuAnim(false);
    if (userMenuCloseTimer.current) window.clearTimeout(userMenuCloseTimer.current);
    userMenuCloseTimer.current = window.setTimeout(() => {
      setUserMenuPresent(false);
      setUserMenuFloating(false);
      setUserMenuPos(null);
      userMenuCloseTimer.current = null;
    }, 300);
  }

  useEffect(() => {
    if (!companyOpen && !userMenuOpen) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (companyOpen && companyRef.current && !companyRef.current.contains(t)) {
        setCompanyOpen(false);
      }
      if (userMenuOpen) {
        const inBtn = userMenuBtnRef.current?.contains(t);
        const inPanel = userMenuPanelRef.current?.contains(t);
        const inFooter = userMenuRef.current?.contains(t);
        if (!inBtn && !inPanel && !inFooter) closeUserMenu();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setCompanyOpen(false);
        closeUserMenu();
        userMenuBtnRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [companyOpen, userMenuOpen]);

  useLayoutEffect(() => {
    if (!userMenuPresent || !userMenuFloating) return;
    updateUserMenuPos();
    const onWin = () => updateUserMenuPos();
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    const rail = document.querySelector(".nf-sidebar-rail");
    const ro = rail ? new ResizeObserver(onWin) : null;
    if (rail && ro) ro.observe(rail);
    return () => {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
      ro?.disconnect();
    };
  }, [userMenuPresent, userMenuFloating, updateUserMenuPos, collapsed, mobileOpen]);

  /**
   * Contexto GLOBAL da plataforma (antes de qualquer return — Rules of Hooks).
   * SUPERADMIN real e FORA de impersonação.
   */
  const isPlatformContext =
    Boolean(user?.platformRole === "SUPERADMIN" && !impersonating);
  const isSuperAdminInTenant =
    Boolean(user?.platformRole === "SUPERADMIN" && impersonating);

  /** SUPERADMIN sem MFA: sidebar admin desabilitada só se a política ainda exigir 2FA */
  const mfaStatus = useQuery({
    queryKey: ["mfa-status"],
    queryFn: () =>
      api<{
        enabled: boolean;
        backupCodesRemaining: number;
        requiredForAdmin?: boolean;
        policyRequired?: boolean;
      }>("/auth/mfa/status"),
    enabled: Boolean(hydrated && user?.platformRole === "SUPERADMIN" && !impersonating),
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const changelogUnseenQuery = useQuery({
    queryKey: ["changelog-unseen"],
    queryFn: () => api<{ count: number }>("/changelog/unseen-count"),
    enabled: Boolean(hydrated && user && !isPlatformContext),
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: true,
  });
  const changelogUnseen = changelogUnseenQuery.data?.count ?? 0;
  const mfaBlocksAdmin =
    mfaStatus.isError ||
    Boolean(mfaStatus.data?.requiredForAdmin) ||
    (mfaStatus.data != null &&
      mfaStatus.data.requiredForAdmin === undefined &&
      mfaStatus.data.policyRequired !== false &&
      mfaStatus.data.enabled === false);
  const adminNavLocked =
    isPlatformContext && (mfaStatus.isLoading || mfaBlocksAdmin);
  const adminNavLockReason =
    "Configure a autenticação em duas etapas para continuar.";

  if (!hydrated || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F5F7] dark:bg-[#0B0C10]">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  const currentUser = user;

  if (isOnboardingRoute) {
    return <div className="min-h-screen bg-[#F4F5F7] dark:bg-[#0B0C10]">{children}</div>;
  }

  function toggleTheme() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("nexaflow_theme", next ? "dark" : "light");
    setDark(next);
    // Mantém preferência em memória alinhada ao tema ativo (sem nova API)
    const u = useAuth.getState().user;
    if (u) {
      useAuth.setState({
        user: {
          ...u,
          preferences: { ...(u.preferences || {}), theme: next ? "dark" : "light" },
        },
      });
    }
  }

  function toggleCollapsed() {
    // Fecha menus abertos para não “grudar” durante a animação da rail
    closeUserMenu();
    setCompanyOpen(false);
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  async function onSwitchTenant(tenantId: string) {
    if (tenantId === tenant?.id) {
      setCompanyOpen(false);
      return;
    }
    await switchTenant(tenantId);
    window.location.reload();
  }

  const companyLabel = onboarding ? "Configurar empresa" : tenant?.name || "Empresa";
  const companyInitials = (companyLabel || "E")
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const displayName = resolveDisplayName(currentUser.name, currentUser.email);
  const roleBadge = resolveRoleBadge(currentUser.platformRole, tenant?.role, {
    platformContext: isPlatformContext,
    impersonating,
  });
  /* Badge só se agregar informação (não repetir o mesmo texto do nome) */
  const showRoleBadge =
    !!roleBadge && roleBadge.toLowerCase() !== displayName.toLowerCase();

  // Em impersonação: nav da empresa; senão superadmin = só plataforma
  const homeHref = isPlatformContext ? "/admin" : "/app";
  const activeNavGroups =
    isPlatformContext || (currentUser.platformRole === "SUPERADMIN" && !impersonating)
      ? platformNavGroups
      : tenantNavGroups;

  function CompanyBadge({ size = 28 }: { size?: number }) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-[8px] text-[10px] font-semibold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
        style={{
          width: size,
          height: size,
          backgroundColor: tenant?.primaryColor || "#6366F1",
        }}
      >
        {tenant?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tenant.logoUrl}
            alt=""
            className="rounded-[8px] object-cover"
            style={{ width: size, height: size }}
          />
        ) : (
          companyInitials
        )}
      </div>
    );
  }

  function CompanySwitcher({ isCollapsed }: { isCollapsed: boolean }) {
    // SUPERADMIN global: sem badge na lateral
    if (isPlatformContext) {
      return null;
    }

    // Sempre abre menu (lista + gerenciar). Uma empresa: só a atual com ✓, sem card/slug.

    function onCompanyClick(e?: ReactMouseEvent) {
      e?.preventDefault();
      e?.stopPropagation();
      if (onboarding) {
        router.push("/app/onboarding");
        return;
      }
      setCompanyOpen((v) => !v);
    }

    const companyList =
      memberships.length > 0
        ? memberships
        : tenant
          ? [
              {
                tenantId: tenant.id,
                tenant: { name: tenant.name || companyLabel, slug: tenant.slug },
              },
            ]
          : [];

    const companyPopover = companyOpen ? (
      <div
        className={cn(
          "nf-company-menu nf-sidebar-popover absolute overflow-hidden",
          isCollapsed
            ? "left-full top-0 z-[60] ml-2 w-56"
            : "left-0 right-0 top-full z-[60] w-full max-w-full"
        )}
        role="listbox"
        aria-label="Empresas"
      >
        <p className="nf-company-menu-title">Empresas</p>
        <div className="nf-company-menu-list">
          {companyList.map((m) => {
            const active = m.tenantId === tenant?.id;
            const name = m.tenant.name || "Empresa";
            return (
              <button
                key={m.tenantId}
                type="button"
                role="option"
                aria-selected={active}
                title={name}
                onClick={(ev) => {
                  ev.stopPropagation();
                  if (active) {
                    setCompanyOpen(false);
                    return;
                  }
                  void onSwitchTenant(m.tenantId);
                }}
                className={cn("nf-company-menu-item", active && "is-current")}
              >
                <span className="nf-company-menu-check" aria-hidden>
                  <Check className="h-3 w-3" strokeWidth={2.5} />
                </span>
                <span className="nf-company-menu-text min-w-0 flex-1">
                  <span className="nf-company-menu-name">{name}</span>
                  {active ? (
                    <span className="nf-company-menu-sub">Empresa atual</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
        <div className="nf-company-menu-divider" aria-hidden />
        <div className="nf-company-menu-footer">
          <button
            type="button"
            role="menuitem"
            className="nf-company-menu-action"
            onClick={(ev) => {
              ev.stopPropagation();
              setCompanyOpen(false);
              setMobileOpen(false);
              router.push("/app/account/companies");
            }}
          >
            <Building2 className="h-3.5 w-3.5 shrink-0 opacity-70" strokeWidth={1.5} />
            Gerenciar empresas
          </button>
          {isSuperAdminInTenant ? (
            <button
              type="button"
              role="menuitem"
              className="nf-company-menu-action nf-company-menu-action--admin"
              onClick={(ev) => {
                ev.stopPropagation();
                setCompanyOpen(false);
                void endImpersonation();
              }}
            >
              <Shield className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={1.5} />
              Voltar para Administração
            </button>
          ) : null}
        </div>
      </div>
    ) : null;

    return (
      <div
        className={cn(
          "relative",
          companyOpen && "z-50",
          isCollapsed && "flex justify-center"
        )}
        ref={companyRef}
      >
        {isCollapsed ? (
          <Tooltip
            content={companyLabel}
            subtitle={impersonating ? "Impersonação" : "Empresa atual"}
            side="right"
            delay={280}
            className={companyOpen ? "pointer-events-none opacity-0" : undefined}
          >
            <button
              type="button"
              onClick={onCompanyClick}
              className={cn(
                "nf-sidebar-icon-btn",
                companyOpen &&
                  "bg-black/[0.05] ring-1 ring-brand-500/[0.15] dark:bg-white/[0.07] dark:ring-violet-400/20"
              )}
              aria-label={`Empresa: ${companyLabel}. Abrir seletor`}
              aria-haspopup="listbox"
              aria-expanded={companyOpen}
            >
              <CompanyBadge size={26} />
            </button>
          </Tooltip>
        ) : (
          <button
            type="button"
            onClick={onCompanyClick}
            className={cn("nf-company-switcher-btn", companyOpen && "is-open")}
            aria-haspopup="listbox"
            aria-expanded={companyOpen}
          >
            <CompanyBadge size={28} />
            <div className="min-w-0 flex-1">
              <p className="nf-sidebar-label truncate text-[12.5px] font-medium leading-tight text-ink dark:text-gray-100">
                {companyLabel}
              </p>
              <p className="nf-sidebar-label mt-0.5 truncate text-[10px] leading-tight text-ink-faint">
                {impersonating ? "Acesso como Superadmin" : "Empresa atual"}
              </p>
            </div>
            <ChevronDown
              className={cn(
                "nf-company-chevron h-3.5 w-3.5 shrink-0",
                companyOpen && "is-open"
              )}
              strokeWidth={1.75}
              aria-hidden
            />
          </button>
        )}
        {companyPopover}
      </div>
    );
  }

  function goUserMenu(path: string) {
    closeUserMenu();
    setMobileOpen(false);
    router.push(path);
  }

  const userMenuItemClass = cn(
    "flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-left text-[12.5px] leading-snug",
    "text-ink-secondary dark:text-gray-300",
    "transition-colors duration-150",
    "hover:bg-black/[0.04] dark:hover:bg-white/[0.05]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#14171e]"
  );
  const userMenuItemIcon =
    "h-3.5 w-3.5 shrink-0 text-ink-faint/80 dark:text-gray-500";
  const userMenuSectionLabel =
    "px-2 pb-0.5 pt-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-ink-faint dark:text-gray-500";
  const userMenuDivider = "mx-2 h-px shrink-0 bg-line/70 dark:bg-white/[0.06]";

  /** Conteúdo compartilhado: inline (expandida) ou floating (recolhida) */
  function UserMenuPanel({
    floating,
    maxHeight,
  }: {
    floating?: boolean;
    maxHeight?: number;
  }) {
    return (
      <div
        ref={userMenuPanelRef}
        role="menu"
        aria-label="Menu da conta"
        className={cn(
          "nf-user-menu flex w-full min-w-0 max-w-full flex-col overflow-hidden rounded-xl border border-line bg-white",
          "dark:border-[#262b36] dark:bg-[#14171e]",
          floating ? "nf-user-menu--floating shadow-panel" : "nf-user-menu--inline"
        )}
        style={{
          height: "auto",
          maxHeight: maxHeight ?? "min(360px, 50vh)",
          boxSizing: "border-box",
        }}
      >
        <div className="nf-user-menu-body min-h-0 overflow-y-auto overscroll-contain [flex:0_1_auto]">
          <div className="border-b border-line/70 px-2 py-1.5 dark:border-white/[0.06]">
            <div className="flex items-center gap-2">
              <UserAvatar
                user={{
                  name: displayName,
                  email: currentUser.email,
                  avatarUrl: currentUser.avatarUrl,
                  avatarType: currentUser.avatarType,
                  avatarPresetId: currentUser.avatarPresetId,
                  avatarColor: currentUser.avatarColor,
                }}
                size="sm"
              />
              <div className="min-w-0 flex-1 overflow-hidden">
                <p
                  className="truncate text-[12.5px] font-semibold leading-tight text-ink dark:text-white"
                  title={displayName}
                >
                  {displayName}
                </p>
                {showRoleBadge && roleBadge ? (
                  <p className="truncate text-[10.5px] font-normal leading-tight text-ink-muted dark:text-gray-400">
                    {roleBadge}
                  </p>
                ) : null}
                {currentUser.email ? (
                  <p
                    className="truncate text-[10.5px] leading-tight text-ink-faint dark:text-gray-500"
                    title={currentUser.email}
                  >
                    {currentUser.email}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="px-1 py-0.5" role="group" aria-label="Conta">
            <p className={userMenuSectionLabel}>Conta</p>
            <button type="button" role="menuitem" className={userMenuItemClass} onClick={() => goUserMenu("/app/account")}>
              <UserRound className={userMenuItemIcon} strokeWidth={1.5} aria-hidden />
              Minha conta
            </button>
            <button type="button" role="menuitem" className={userMenuItemClass} onClick={() => goUserMenu("/app/account/security")}>
              <ShieldCheck className={userMenuItemIcon} strokeWidth={1.5} aria-hidden />
              Segurança
            </button>
            <button type="button" role="menuitem" className={userMenuItemClass} onClick={() => goUserMenu("/app/account/sessions")}>
              <MonitorSmartphone className={userMenuItemIcon} strokeWidth={1.5} aria-hidden />
              Sessões
            </button>
            <button type="button" role="menuitem" className={userMenuItemClass} onClick={() => goUserMenu("/app/account/preferences")}>
              <Settings2 className={userMenuItemIcon} strokeWidth={1.5} aria-hidden />
              Preferências
            </button>
          </div>

          {!isPlatformContext ? (
            <>
              <div className={userMenuDivider} aria-hidden />
              <div className="px-1 py-0.5" role="group" aria-label="Ajuda e plataforma">
                <p className={userMenuSectionLabel}>Ajuda e plataforma</p>
                <button
                  type="button"
                  role="menuitem"
                  className={userMenuItemClass}
                  onClick={() => {
                    closeUserMenu();
                    setMobileOpen(false);
                    window.dispatchEvent(new CustomEvent("nexaflow:open-assistant"));
                  }}
                >
                  <Sparkles
                    className="h-3.5 w-3.5 shrink-0 text-violet-500/80 dark:text-violet-400/75"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <span className="flex min-w-0 flex-col items-start leading-tight">
                    <span>NIA</span>
                    <span className="text-[10px] font-normal text-ink-faint dark:text-gray-500">
                      Assistente
                    </span>
                  </span>
                </button>
                <button type="button" role="menuitem" className={userMenuItemClass} onClick={() => goUserMenu("/app/whats-new")}>
                  <Megaphone className={userMenuItemIcon} strokeWidth={1.5} aria-hidden />
                  <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                    <span>Novidades</span>
                    {changelogUnseen > 0 ? (
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500 dark:bg-violet-400"
                        aria-label="Novidades não lidas"
                      />
                    ) : null}
                  </span>
                </button>
              </div>
            </>
          ) : null}

          <div className={userMenuDivider} aria-hidden />
          <div className="px-1 py-0.5" role="group" aria-label="Aparência">
            <div className="flex items-center justify-between gap-2 rounded-md px-2 py-0.5">
              <div className="min-w-0">
                <p className="text-[12.5px] leading-snug text-ink-secondary dark:text-gray-300">Aparência</p>
                <p className="text-[10px] leading-tight text-ink-faint dark:text-gray-500">
                  {dark ? "Escuro" : "Claro"}
                </p>
              </div>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={dark}
                aria-label={dark ? "Alternar para modo claro" : "Alternar para modo escuro"}
                title={dark ? "Modo claro" : "Modo escuro"}
                className={cn(
                  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                  "text-ink-muted transition-colors duration-150",
                  "hover:bg-black/[0.05] hover:text-ink dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/[0.35]"
                )}
                onClick={() => toggleTheme()}
              >
                {dark ? (
                  <Sun className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                ) : (
                  <Moon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                )}
              </button>
            </div>
          </div>

          {impersonating ? (
            <>
              <div className={userMenuDivider} aria-hidden />
              <div className="px-1 py-0.5">
                <button
                  type="button"
                  role="menuitem"
                  className={cn(
                    userMenuItemClass,
                    "text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-500/10"
                  )}
                  onClick={() => {
                    closeUserMenu();
                    void endImpersonation();
                  }}
                >
                  <Shield className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={1.5} aria-hidden />
                  Encerrar impersonação
                </button>
              </div>
            </>
          ) : null}
        </div>

        <div className="nf-user-menu-footer shrink-0 border-t border-line/70 dark:border-white/[0.06]">
          <div className="px-1 py-0.5">
            <button
              type="button"
              role="menuitem"
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-left text-[12.5px]",
                "text-ink-secondary transition-colors duration-150 dark:text-gray-400",
                "hover:bg-red-50/80 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 focus-visible:text-red-600"
              )}
              onClick={() => {
                closeUserMenu();
                setMobileOpen(false);
                void logout().finally(() => router.push("/login"));
              }}
            >
              <LogOut className="h-3.5 w-3.5 shrink-0 opacity-55" strokeWidth={1.5} aria-hidden />
              Sair
            </button>
          </div>
        </div>
      </div>
    );
  }

  function UserFooter({ isCollapsed }: { isCollapsed: boolean }) {
    const avatarUser = {
      name: displayName,
      email: currentUser.email,
      avatarUrl: currentUser.avatarUrl,
      avatarType: currentUser.avatarType,
      avatarPresetId: currentUser.avatarPresetId,
      avatarColor: currentUser.avatarColor,
    };

    function onTriggerClick(e: ReactMouseEvent<HTMLButtonElement>) {
      e.preventDefault();
      e.stopPropagation();
      const btn = e.currentTarget;
      if (userMenuOpen && userMenuBtnRef.current === btn) {
        closeUserMenu();
        return;
      }
      // Expandida / mobile drawer: menu DENTRO da sidebar. Recolhida: popover flutuante.
      openUserMenuFrom(btn, isCollapsed);
    }

    if (isCollapsed) {
      return (
        <div
          className="relative flex flex-col items-center gap-1.5"
          ref={userMenuRef}
        >
          <NotificationBell collapsed />
          <Tooltip
            content={displayName}
            subtitle={showRoleBadge ? roleBadge || undefined : undefined}
            side="right"
            delay={280}
            className={userMenuOpen && userMenuFloating ? "pointer-events-none opacity-0" : undefined}
          >
            <button
              type="button"
              ref={userMenuBtnRef}
              onClick={onTriggerClick}
              className={cn(
                "nf-sidebar-icon-btn",
                userMenuOpen &&
                  "bg-black/[0.06] ring-1 ring-brand-500/25 dark:bg-white/[0.08] dark:ring-violet-400/30"
              )}
              aria-label={`Conta de ${displayName}`}
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
            >
              <UserAvatar user={avatarUser} size="sm" />
            </button>
          </Tooltip>
        </div>
      );
    }

    // Expandida: menu OVERLAY acima do trigger (não empurra a nav → sem scrollbar)
    return (
      <div
        className="nf-user-footer relative w-full min-w-0 max-w-full"
        ref={userMenuRef}
      >
        {userMenuPresent && !userMenuFloating ? (
          <div
            className={cn(
              "nf-user-menu-anchor w-full min-w-0 max-w-full",
              userMenuAnim && "is-open"
            )}
            onTransitionEnd={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.propertyName !== "opacity" && e.propertyName !== "transform") return;
              if (!userMenuAnim && !userMenuOpen) {
                if (userMenuCloseTimer.current) {
                  window.clearTimeout(userMenuCloseTimer.current);
                  userMenuCloseTimer.current = null;
                }
                setUserMenuPresent(false);
                setUserMenuFloating(false);
                setUserMenuPos(null);
              }
            }}
          >
            <UserMenuPanel floating={false} />
          </div>
        ) : null}
        <div className="flex w-full min-w-0 items-center gap-0.5">
          <button
            type="button"
            ref={userMenuBtnRef}
            onClick={onTriggerClick}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1.5 text-left",
              "transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
              "hover:bg-black/[0.04] dark:hover:bg-white/[0.05]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30",
              userMenuOpen && !userMenuFloating
                ? "bg-black/[0.05] ring-1 ring-brand-500/20 dark:bg-white/[0.06] dark:ring-violet-400/25"
                : "bg-transparent"
            )}
            aria-label={`Conta de ${displayName}`}
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
          >
            <UserAvatar user={avatarUser} size="sm" />
            <p
              className="nf-sidebar-label min-w-0 flex-1 truncate text-xs font-medium text-ink dark:text-gray-100"
              title={displayName}
            >
              {displayName}
            </p>
          </button>
          <div
            className="nf-user-footer-bell shrink-0"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <NotificationBell />
          </div>
        </div>
      </div>
    );
  }

  const userMenuPortal =
    userMenuPortalReady &&
    userMenuPresent &&
    userMenuFloating &&
    userMenuPos &&
    createPortal(
      <div
        className={cn("nf-user-menu-floating-wrap fixed", userMenuAnim && "is-open")}
        style={{
          left: userMenuPos.left,
          bottom: userMenuPos.bottom,
          width: userMenuPos.width,
          zIndex: "var(--z-popover)",
          maxHeight: userMenuPos.maxHeight,
        }}
        onTransitionEnd={(e) => {
          if (e.target !== e.currentTarget) return;
          if (!userMenuAnim && !userMenuOpen) {
            if (userMenuCloseTimer.current) {
              window.clearTimeout(userMenuCloseTimer.current);
              userMenuCloseTimer.current = null;
            }
            setUserMenuPresent(false);
            setUserMenuFloating(false);
            setUserMenuPos(null);
          }
        }}
      >
        <UserMenuPanel floating maxHeight={userMenuPos.maxHeight} />
      </div>,
      document.body
    );

  function SidebarContent({ forceExpanded = false }: { forceExpanded?: boolean }) {
    const isCollapsed = forceExpanded ? false : collapsed;

    function onSidebarAmbientMove(e: ReactPointerEvent<HTMLElement>) {
      if (typeof window === "undefined") return;
      if (window.matchMedia("(pointer: coarse)").matches) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (window.matchMedia("(max-width: 1023px)").matches) return;
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      // Deslocamento mínimo (2–6px) — não segue o cursor de forma direta
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = (e.clientY - r.top) / r.height - 0.5;
      const px = Math.max(-4, Math.min(4, nx * 8));
      const py = Math.max(-3, Math.min(3, ny * 6));
      el.style.setProperty("--nf-sb-px", `${px.toFixed(2)}px`);
      el.style.setProperty("--nf-sb-py", `${py.toFixed(2)}px`);
    }

    function onSidebarAmbientLeave(e: ReactPointerEvent<HTMLElement>) {
      e.currentTarget.style.setProperty("--nf-sb-px", "0px");
      e.currentTarget.style.setProperty("--nf-sb-py", "0px");
    }

    return (
      <aside
        className={cn(
          "nf-app-enter-aside nf-sidebar flex h-full w-full flex-col border-r bg-[var(--surface-sidebar)]",
          isCollapsed && "nf-sidebar-collapsed"
        )}
        data-collapsed={isCollapsed ? "true" : "false"}
        data-user-menu-open={userMenuPresent && !userMenuFloating && !isCollapsed ? "true" : "false"}
        onPointerMove={onSidebarAmbientMove}
        onPointerLeave={onSidebarAmbientLeave}
      >
        {/* Ambient — luz institucional, centro neutro, sem glow por item */}
        <div className="nf-sidebar-ambient" aria-hidden>
          <span className="nf-sidebar-ambient-blob nf-sidebar-ambient-blob--top" />
          <span className="nf-sidebar-ambient-blob nf-sidebar-ambient-blob--bottom" />
          <span className="nf-sidebar-ambient-grain nf-ambient-grain" />
        </div>

        <div className="nf-sidebar-inner">
        {/* Topo: marca + collapse */}
        <div
          className={cn(
            "shrink-0",
            companyOpen && "relative z-50",
            isCollapsed ? "px-0 pt-3" : "px-3 pt-3"
          )}
        >
          {isCollapsed ? (
            <div className="flex flex-col items-center gap-1.5">
              <Link
                href={homeHref}
                className="flex h-9 w-9 items-center justify-center rounded-[10px] transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                onClick={() => setMobileOpen(false)}
                aria-label="NexaFlow AI"
              >
                <Logo size="sm" variant="mark" />
              </Link>
              <Tooltip content="Expandir menu" side="right" delay={250}>
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  className="nf-sidebar-toggle hidden lg:inline-flex"
                  aria-label="Expandir menu"
                  title="Expandir menu"
                >
                  <PanelLeft className="h-3.5 w-3.5" strokeWidth={1.6} />
                </button>
              </Tooltip>
              {!isPlatformContext && (
                <>
                  <div className="nf-sidebar-divider my-0.5" aria-hidden />
                  <CompanySwitcher isCollapsed />
                </>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 px-0.5">
                <Link
                  href={homeHref}
                  className="inline-flex min-w-0 items-center"
                  onClick={() => setMobileOpen(false)}
                >
                  <Logo size="sm" className="nf-sidebar-brand" />
                </Link>
                <Tooltip content="Recolher menu" side="bottom" delay={250}>
                  <button
                    type="button"
                    onClick={toggleCollapsed}
                    className="nf-sidebar-toggle hidden lg:inline-flex"
                    aria-label="Recolher menu"
                    title="Recolher menu"
                  >
                    <PanelLeftClose className="h-3.5 w-3.5" strokeWidth={1.6} />
                  </button>
                </Tooltip>
              </div>
              {!isPlatformContext && (
                <div className="mt-2">
                  <CompanySwitcher isCollapsed={false} />
                </div>
              )}
            </>
          )}
        </div>

        <div
          className={cn(
            "mt-2 h-px shrink-0 bg-black/[0.05] dark:bg-white/[0.055]",
            isCollapsed ? "mx-3" : "mx-3.5"
          )}
          aria-hidden
        />

        {/* Navegação — única área com scroll na sidebar */}
        <nav
          className={cn(
            "nf-sidebar-nav",
            isCollapsed ? "px-2 py-2" : "px-2.5 py-2"
          )}
        >
          <div
            className={cn(
              isCollapsed
                ? "flex flex-col items-center gap-0.5"
                : "space-y-2.5"
            )}
          >
            {activeNavGroups.map((group, gi) => {
              /* Divisor só entre blocos distintos no recolhido (meio da lista tenant) */
              const midDivider = isCollapsed && !isPlatformContext && gi === 2;
              return (
                <div
                  key={group.label}
                  className={cn(isCollapsed && "flex w-full flex-col items-center")}
                >
                  {midDivider && <div className="nf-sidebar-divider mb-2 mt-1" aria-hidden />}
                  {!isCollapsed && (
                    <p
                      className={cn(
                        "nf-sidebar-group-title",
                        isPlatformContext && "nf-sidebar-group-title--platform"
                      )}
                    >
                      {group.label}
                    </p>
                  )}
                  <div
                    className={cn(
                      isCollapsed ? "flex flex-col items-center gap-0.5" : "space-y-px"
                    )}
                  >
                    {group.items.map((item) => (
                      <SidebarNavLink
                        key={item.href}
                        href={item.href}
                        label={item.label}
                        group={group.label}
                        icon={item.icon}
                        pathname={pathname}
                        collapsed={isCollapsed}
                        onNavigate={() => setMobileOpen(false)}
                        disabled={adminNavLocked}
                        disabledReason={adminNavLockReason}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </nav>

        {/* Rodapé: perfil + sino — superfície sutil integrada */}
        <div
          className={cn(
            "nf-sidebar-footer relative z-20 shrink-0 border-t border-black/[0.05] dark:border-white/[0.055]",
            "bg-black/[0.015] dark:bg-white/[0.02]",
            isCollapsed ? "px-0 py-2.5" : "px-2.5 py-2"
          )}
        >
          <UserFooter isCollapsed={isCollapsed} />
        </div>
        </div>
      </aside>
    );
  }

  async function endImpersonation() {
    try {
      const data = await import("@/lib/api").then(({ api }) =>
        api<{
          accessToken: string;
          user: {
            id: string;
            email: string;
            name: string;
            platformRole?: string | null;
          };
          tenant: null;
          memberships?: Array<{
            tenantId: string;
            role: string;
            tenant: { id: string; name: string; slug: string };
          }>;
        }>("/admin/stop-impersonation", { method: "POST" })
      );
      try {
        sessionStorage.removeItem("nexaflow_impersonating");
      } catch {
        /* ignore */
      }
      setSession({
        token: data.accessToken,
        user: data.user,
        tenant: null,
        memberships: data.memberships || [],
      });
      window.location.href = "/admin";
    } catch {
      window.location.href = "/admin";
    }
  }

  function onShellAmbientMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(pointer: coarse)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(max-width: 1023px)").matches) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    // 2–4px de inércia — luz ambiente, não spotlight
    const nx = (e.clientX - r.left) / r.width - 0.5;
    const ny = (e.clientY - r.top) / r.height - 0.5;
    const px = Math.max(-3.5, Math.min(3.5, nx * 7));
    const py = Math.max(-2.5, Math.min(2.5, ny * 5));
    el.style.setProperty("--nf-shell-px", `${px.toFixed(2)}px`);
    el.style.setProperty("--nf-shell-py", `${py.toFixed(2)}px`);
  }

  function onShellAmbientLeave(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.style.setProperty("--nf-shell-px", "0px");
    e.currentTarget.style.setProperty("--nf-shell-py", "0px");
  }

  const shellTree = (
    <div
      className={cn("nf-app-shell", enterAnim && "nf-app-enter")}
      data-collapsed={collapsed ? "true" : "false"}
      data-impersonating={impersonating ? "true" : "false"}
      onPointerMove={onShellAmbientMove}
      onPointerLeave={onShellAmbientLeave}
    >
      {/* Fundo principal: ambient global (abaixo de todo conteúdo) */}
      <div className="nf-shell-ambient" aria-hidden>
        <div className="nf-shell-ambient-layer">
          <span className="nf-shell-ambient-glow nf-shell-ambient-glow--a" />
          <span className="nf-shell-ambient-glow nf-shell-ambient-glow--b" />
          <span className="nf-shell-ambient-glow nf-shell-ambient-glow--c" />
        </div>
        <span className="nf-shell-ambient-vignette" />
        <span className="nf-ambient-grain" />
      </div>

      {/* Banner de impersonação — contexto tenant com superadmin */}
      {impersonating && (
        <div className="nf-shell-banner" role="status">
          <span className="min-w-0 flex-1">
            Você está acessando
            {tenant?.name ? ` a ${tenant.name}` : " uma empresa"} como Superadministrador.
            Ações são auditadas.
          </span>
          <button
            type="button"
            className="btn-secondary btn-sm h-7 shrink-0"
            onClick={() => void endImpersonation()}
          >
            Voltar para Administração
          </button>
        </div>
      )}

      <div className="nf-shell-body relative z-[var(--z-content)]">
        {/* Desktop: sidebar no fluxo — reflow */}
        <div className="nf-sidebar-rail" aria-label="Navegação principal">
          <SidebarContent />
        </div>

        {/* Mobile: drawer overlay */}
        {mobileOpen && (
          <div className="nf-sidebar-drawer lg:hidden">
            <div
              className="nf-modal-backdrop absolute inset-0 bg-black/40 backdrop-blur-[2px]"
              onClick={() => setMobileOpen(false)}
            />
            <div className="nf-sidebar-drawer-panel">
              <SidebarContent forceExpanded />
            </div>
          </div>
        )}

        <div className="nf-app-enter-main nf-main">
          <header className="nf-mobile-header sticky top-0 flex items-center gap-3 border-b px-4 lg:hidden">
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menu"
            >
              {mobileOpen ? (
                <X className="h-5 w-5" strokeWidth={1.5} />
              ) : (
                <Menu className="h-5 w-5" strokeWidth={1.5} />
              )}
            </button>
            <Logo size="sm" />
            <span className="ml-auto min-w-0 truncate text-xs text-ink-muted">
              {isPlatformContext ? "" : tenant?.name || ""}
            </span>
          </header>

          {/* Único scroll principal do painel — conteúdo estável sobre o ambient.
              Em /app/settings o scroll fica NAS COLUNAS (menu não desce com o conteúdo). */}
          <main
            className={cn(
              "nf-main-scroll",
              pathname === "/app/settings" && "nf-main-scroll--settings"
            )}
          >
            {/* Banners fora do .page para largura estável e sem “bug” de layout */}
            {/* Aviso de fila humana — sticky no topo de toda a área principal */}
            {!isPlatformContext &&
              !pathname?.startsWith("/app/onboarding") &&
              !pathname?.startsWith("/admin") && <HumanQueueBanner />}
            {!isPlatformContext &&
              !pathname?.startsWith("/app/onboarding") &&
              !pathname?.startsWith("/admin") && (
                <div className="mx-auto w-full max-w-[var(--nf-page-max-width)] px-0">
                  <WhatsAppStatusBanner />
                </div>
              )}
            <div
              key={pathname}
              className={cn(
                "page nf-page-enter nf-cq",
                pathname === "/app/settings" && "page--settings-fill"
              )}
            >
              {children}
            </div>
          </main>
        </div>
      </div>

      <CommandPalette />
      {!isPlatformContext && tenant ? <NexaflowAssistantProvider /> : null}
      {userMenuPortal}
    </div>
  );

  // Tour da plataforma — apenas contexto tenant (nunca Admin global)
  if (!isPlatformContext && tenant) {
    return (
      <PlatformTourController
        shell={{
          expandSidebar: () => {
            setCollapsed(false);
            try {
              localStorage.setItem(SIDEBAR_KEY, "0");
            } catch {
              /* ignore */
            }
          },
          openMobileNav: () => setMobileOpen(true),
          closeMobileNav: () => setMobileOpen(false),
          restoreSidebar: (wasCollapsed) => {
            setCollapsed(wasCollapsed);
            try {
              localStorage.setItem(SIDEBAR_KEY, wasCollapsed ? "1" : "0");
            } catch {
              /* ignore */
            }
          },
          getSidebarCollapsed: () => collapsed,
          isMobile: () =>
            typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches,
        }}
      >
        {shellTree}
      </PlatformTourController>
    );
  }

  return shellTree;
}
