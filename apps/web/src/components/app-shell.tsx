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
  Rocket,
  ChartColumn,
  Settings,
  Shield,
  ShieldAlert,
  ArrowLeft,
  Menu,
  X,
  Building2,
  PanelLeftClose,
  PanelLeft,
  ChevronDown,
  Activity,
  UserPlus,
  Wallet,
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
import {
  applyTheme,
  getStoredThemePreference,
  setupSystemThemeListener,
  type ThemePreference,
} from "@/lib/theme";
import { HumanQueueBanner } from "./human-queue-banner";
import { PlatformTourController } from "./platform-tour/platform-tour-controller";
import { tourHrefToDataAttr } from "@/lib/platform-tour";
import { NexaflowAssistantProvider } from "./nexaflow-assistant/nexaflow-assistant-drawer";
import {
  AdminSidebar,
  SidebarUserCard,
  UserMenuDropdown,
} from "./admin/sidebar";
import { TenantUserMenu } from "./tenant-user-menu";
import { TenantCompanyMenu } from "./tenant-company-menu";

const SIDEBAR_KEY = "nexaflow_sidebar_collapsed";

/** Navegação operacional do TENANT (empresa) */
const tenantNavGroups = [
  {
    label: "Principal",
    items: [
      { href: "/app", label: "Início", icon: LayoutDashboard },
      { href: "/app/inbox", label: "Conversas", icon: MessagesSquare },
    ],
  },
  {
    label: "Vendas",
    items: [
      { href: "/app/contacts", label: "Contatos", icon: Users },
      { href: "/app/crm", label: "Funil", icon: Columns3 },
      { href: "/app/finance", label: "Financeiro", icon: Wallet },
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

/** Navegação exclusiva do SUPERADMIN — Plataforma / Gestão / Segurança / Sistema */
const platformNavGroups = [
  {
    label: "Plataforma",
    items: [
      { href: "/admin", label: "Visão geral", icon: LayoutDashboard },
      { href: "/admin/finance", label: "Financeiro", icon: ChartColumn },
      { href: "/admin/plans", label: "Planos", icon: Settings },
    ],
  },
  {
    label: "Gestão",
    items: [
      { href: "/admin/companies", label: "Empresas", icon: Building2 },
      { href: "/admin/sales-leads", label: "Leads", icon: UserPlus },
      { href: "/admin/users", label: "Usuários", icon: Users },
    ],
  },
  {
    label: "Segurança",
    items: [{ href: "/admin/audit", label: "Auditoria", icon: Shield }],
  },
  {
    label: "Sistema",
    items: [
      { href: "/admin/deploy", label: "Deploy", icon: Rocket },
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
  SALES: "Vendas",
  READONLY: "Somente leitura",
  SUPERADMIN: "Superadministrador",
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
  platform,
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
  /** Contexto Superadmin — estilo violeta mais contido */
  platform?: boolean;
}) {
  const active = !disabled && isNavActive(pathname, href);

  const itemClass = cn(
    "nf-sb-link group",
    active && "is-active",
    platform && "is-platform",
    disabled && "is-disabled",
    collapsed && "is-collapsed"
  );

  const content = (
    <>
      <span className="nf-sb-link-ico" aria-hidden>
        <Icon className="nf-sb-link-svg" strokeWidth={active ? 2.05 : 1.7} />
      </span>
      <span className="nf-sb-link-label nf-sidebar-label">{label}</span>
      {active ? <span className="nf-sb-link-rail" aria-hidden /> : null}
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
      aria-label={collapsed ? (group ? `${label} · ${group}` : label) : undefined}
      title={collapsed ? undefined : undefined}
      {...(tourAttr ? { "data-tour": tourAttr } : {})}
    >
      {content}
    </Link>
  );

  // Tooltip apenas quando a barra estiver recolhida (collapsed)
  if (collapsed) {
    return (
      <Tooltip
        content={label}
        subtitle={group ? group : platform ? "Administração" : undefined}
        side="right"
        delay={120}
        className="flex w-full justify-center"
      >
        {link}
      </Tooltip>
    );
  }

  return link;
}

import { getUserDisplayName } from "@/lib/user";

/** Resolução do nome de exibição do usuário com fallback amigável */
function resolveDisplayName(user: { name?: string | null; displayName?: string | null; email?: string | null } | null | undefined): string {
  return getUserDisplayName(user);
}

/** Papel para badge / tooltip */
function resolveRoleBadge(
  platformRole: string | null | undefined,
  tenantRole: string | null | undefined,
  opts?: { platformContext?: boolean; impersonating?: boolean }
): string | null {
  if (opts?.platformContext) return "Superadministrador";
  if (opts?.impersonating && platformRole === "SUPERADMIN") {
    return "Superadministrador · Impersonando";
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
  const [appTheme, setAppThemeState] = useState<"light" | "dark" | "system">("system");
  const [enterAnim, setEnterAnim] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  /** Mantém o menu no DOM durante a animação de saída */
  const [userMenuPresent, setUserMenuPresent] = useState(false);
  /** Classe visual aberta (CSS transition) */
  const [userMenuAnim, setUserMenuAnim] = useState(false);
  const [userMenuPos, setUserMenuPos] = useState<{
    left: number;
    top?: number;
    bottom?: number;
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
  const [endingImpersonation, setEndingImpersonation] = useState(false);

  useEffect(() => {
    if (hydrated && !user) router.replace("/login");
  }, [hydrated, user, router]);

  useEffect(() => {
    if (!hydrated || !user || !tenant) return;
    // Onboarding só no contexto tenant
    if (onboarding && !isOnboardingRoute) router.replace("/app/onboarding");
  }, [hydrated, user, tenant, pathname, router, onboarding, isOnboardingRoute]);

  useEffect(() => {
    const pref = getStoredThemePreference();
    const effective = applyTheme(pref);
    setAppThemeState(pref);
    setDark(effective === "dark");

    const cleanup = setupSystemThemeListener((eff) => {
      setDark(eff === "dark");
    });

    setUserMenuPortalReady(true);
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1");
      setImpersonating(readImpersonatingFlag());
    } catch {
      /* ignore */
    }

    return cleanup;
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
    setUserMenuPos(null);
    if (userMenuCloseTimer.current) {
      window.clearTimeout(userMenuCloseTimer.current);
      userMenuCloseTimer.current = null;
    }
  }, [pathname]);

  /**
   * Posicionamento inteligente do menu de usuário via PORTAL.
   * Abre preferencialmente acima do botão gatilho, com flip/shift de colisão
   * e largura independente (268px a 276px), sem nunca ser cortado pela sidebar.
   */
  const computeFloatingUserMenuPos = useCallback((btn: HTMLElement) => {
    const r = btn.getBoundingClientRect();
    const aside = btn.closest("aside") || btn.closest(".nf-sidebar");
    const asideRect = aside ? aside.getBoundingClientRect() : null;
    const isSidebarCollapsed =
      aside?.classList.contains("nf-sidebar-collapsed") ||
      aside?.getAttribute("data-collapsed") === "true" ||
      (asideRect && asideRect.width < 100);

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const sideOffset = 8;
    const padding = 10;
    const estHeight = 330;

    let left: number;
    let width: number;

    if (asideRect && !isSidebarCollapsed && asideRect.width >= 160) {
      // Sidebar expandida: borda esquerda e direita perfeitamente alinhadas com a largura útil da sidebar
      const inset = 8;
      left = asideRect.left + inset;
      width = Math.max(180, asideRect.width - inset * 2);
    } else if (asideRect && isSidebarCollapsed) {
      // Sidebar recolhida: abre flutuando ao lado direito
      left = Math.min(vw - 250, asideRect.right + sideOffset);
      width = Math.min(235, vw - left - padding);
    } else {
      // Fallback
      width = Math.min(240, Math.max(200, r.width));
      left = Math.max(padding, Math.min(r.left, vw - width - padding));
    }

    if (left + width > vw - padding) {
      left = Math.max(padding, vw - width - padding);
    }
    if (left < padding) left = padding;

    const spaceAbove = r.top - sideOffset - padding;
    const spaceBelow = vh - r.bottom - sideOffset - padding;

    let top: number | undefined;
    let bottom: number | undefined;
    let maxHeight = 400;

    if (spaceAbove >= Math.min(estHeight, 220) || spaceAbove >= spaceBelow) {
      bottom = vh - r.top + sideOffset;
      maxHeight = Math.max(180, Math.min(420, spaceAbove));
    } else {
      top = r.bottom + sideOffset;
      maxHeight = Math.max(180, Math.min(420, spaceBelow));
    }

    return { left, top, bottom, width, maxHeight };
  }, []);

  const updateUserMenuPos = useCallback(() => {
    if (!userMenuPresent) return;
    const btn = userMenuBtnRef.current;
    if (!btn || typeof btn.getBoundingClientRect !== "function") return;
    const r = btn.getBoundingClientRect();
    if (r.width < 1 && r.height < 1) return;
    setUserMenuPos(computeFloatingUserMenuPos(btn));
  }, [computeFloatingUserMenuPos, userMenuPresent]);

  function openUserMenuFrom(btn: HTMLButtonElement) {
    userMenuBtnRef.current = btn;
    if (userMenuCloseTimer.current) {
      window.clearTimeout(userMenuCloseTimer.current);
      userMenuCloseTimer.current = null;
    }
    const pos = computeFloatingUserMenuPos(btn);
    setUserMenuPos(pos);
    setUserMenuOpen(true);
    setUserMenuPresent(true);
    setUserMenuAnim(true);
  }

  function closeUserMenu() {
    setUserMenuOpen(false);
    setUserMenuAnim(false);
    if (userMenuCloseTimer.current) window.clearTimeout(userMenuCloseTimer.current);
    userMenuCloseTimer.current = window.setTimeout(() => {
      setUserMenuPresent(false);
      setUserMenuPos(null);
      userMenuCloseTimer.current = null;
    }, 180);
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
        if (!inBtn && !inPanel) closeUserMenu();
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
    if (!userMenuPresent) return;
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
  }, [userMenuPresent, updateUserMenuPos, collapsed, mobileOpen]);

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

  const mfaBlocksAdmin =
    mfaStatus.isError ||
    Boolean(mfaStatus.data?.requiredForAdmin) ||
    (mfaStatus.data != null &&
      mfaStatus.data.requiredForAdmin === undefined &&
      mfaStatus.data.policyRequired !== false &&
      mfaStatus.data.enabled === false);
  const adminNavLocked = false;
  const adminNavLockReason = undefined;



  function handleSetTheme(t: ThemePreference) {
    setAppThemeState(t);
    const effective = applyTheme(t);
    setDark(effective === "dark");
    const u = useAuth.getState().user;
    if (u) {
      useAuth.setState({
        user: {
          ...u,
          preferences: { ...(u.preferences || {}), theme: t },
        },
      });
    }
  }

  function toggleTheme() {
    const next = !document.documentElement.classList.contains("dark");
    handleSetTheme(next ? "dark" : "light");
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

  /** Atalho SaaS: Ctrl/⌘ + B alterna sidebar (desktop) */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.key.toLowerCase() !== "b") return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
        return;
      }
      e.preventDefault();
      toggleCollapsed();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  const displayName = resolveDisplayName(user);
  const roleBadge = resolveRoleBadge(user?.platformRole, tenant?.role, {
    platformContext: isPlatformContext,
    impersonating,
  });
  /* Badge só se agregar informação (não repetir o mesmo texto do nome) */
  const showRoleBadge =
    !!roleBadge && roleBadge.toLowerCase() !== displayName.toLowerCase();

  // Em impersonação: nav da empresa; senão superadmin = só plataforma
  const homeHref = isPlatformContext ? "/admin" : "/app";
  const activeNavGroups =
    isPlatformContext || (user?.platformRole === "SUPERADMIN" && !impersonating)
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

    const menuItems = companyList.map((m) => ({
      tenantId: m.tenantId,
      name: m.tenant.name || "Empresa",
      active: m.tenantId === tenant?.id,
      color: m.tenantId === tenant?.id ? tenant?.primaryColor : null,
    }));

    const companyPopover = companyOpen ? (
      <div
        className={cn(
          "absolute z-[60]",
          isCollapsed
            ? "left-full top-0 ml-2 w-[15.5rem]"
            : "left-0 right-0 top-[calc(100%+6px)]"
        )}
      >
        <TenantCompanyMenu
          items={menuItems}
          onSelect={(tenantId) => {
            if (tenantId === tenant?.id) {
              setCompanyOpen(false);
              return;
            }
            void onSwitchTenant(tenantId);
          }}
          onManage={() => {
            setCompanyOpen(false);
            setMobileOpen(false);
            router.push("/app/account/companies");
          }}
          showBackToAdmin={isSuperAdminInTenant}
          onBackToAdmin={() => {
            setCompanyOpen(false);
            void endImpersonation();
          }}
        />
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
            subtitle={impersonating ? "Impersonação" : "Empresa"}
            side="right"
            delay={160}
            className={companyOpen ? "pointer-events-none opacity-0" : undefined}
          >
            <button
              type="button"
              onClick={onCompanyClick}
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/35",
                companyOpen && "bg-white/[0.06] ring-1 ring-violet-400/25"
              )}
              aria-label={`Empresa: ${companyLabel}. Abrir seletor`}
              aria-haspopup="listbox"
              aria-expanded={companyOpen}
            >
              <CompanyBadge size={28} />
            </button>
          </Tooltip>
        ) : (
          <button
            type="button"
            onClick={onCompanyClick}
            className={cn(
              "flex w-full min-w-0 items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left transition-colors",
              "hover:bg-black/[0.04] dark:hover:bg-white/[0.05]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/35",
              companyOpen && "bg-white/[0.06] ring-1 ring-white/[0.08]"
            )}
            aria-haspopup="listbox"
            aria-expanded={companyOpen}
          >
            <CompanyBadge size={28} />
            <div className="min-w-0 flex-1 text-left">
              <p className="nf-sidebar-label truncate text-[13px] font-medium leading-tight text-ink dark:text-zinc-100">
                {companyLabel}
              </p>
              <p className="nf-sidebar-label mt-0.5 truncate text-[11px] leading-tight text-ink-faint dark:text-zinc-500">
                {impersonating
                  ? "Como Superadmin"
                  : roleBadge || "Membro"}
              </p>
            </div>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform duration-200",
                companyOpen && "rotate-180 text-violet-300"
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

  const sidebarUserInfo = {
    name: displayName,
    email: user?.email,
    roleBadge,
    showRoleBadge,
    avatarUrl: user?.avatarUrl,
    avatarType: user?.avatarType,
    avatarPresetId: user?.avatarPresetId,
    avatarColor: user?.avatarColor,
  };

  /** Menu de conta premium: identidade + Minha conta + tema + sair */
  function UserMenuPanel({
    maxHeight,
  }: {
    maxHeight?: number;
  }) {
    return (
      <TenantUserMenu
        panelRef={userMenuPanelRef}
        user={sidebarUserInfo}
        dark={dark}
        maxHeight={maxHeight}
        theme={appTheme}
        onSetTheme={handleSetTheme}
        onAccount={() => goUserMenu("/app/account")}
        onPreferences={() => goUserMenu("/app/account/preferences")}
        onLogout={() => {
          closeUserMenu();
          setMobileOpen(false);
          void logout().finally(() => router.push("/login"));
        }}
      />
    );
  }

  function UserFooter({ isCollapsed }: { isCollapsed: boolean }) {
    const avatarUser = {
      name: displayName,
      email: user?.email,
      avatarUrl: user?.avatarUrl,
      avatarType: user?.avatarType,
      avatarPresetId: user?.avatarPresetId,
      avatarColor: user?.avatarColor,
    };

    function onTriggerClick(e: ReactMouseEvent<HTMLButtonElement>) {
      e.preventDefault();
      e.stopPropagation();
      const btn = e.currentTarget;
      if (userMenuOpen && userMenuBtnRef.current === btn) {
        closeUserMenu();
        return;
      }
      openUserMenuFrom(btn);
    }

    // Admin: card de usuário dedicado
    if (isPlatformContext) {
      return (
        <SidebarUserCard
          user={sidebarUserInfo}
          collapsed={isCollapsed}
          open={userMenuOpen}
          onTriggerClick={onTriggerClick}
          triggerRef={userMenuBtnRef}
          rootRef={userMenuRef}
        />
      );
    }

    if (isCollapsed) {
      return (
        <div className="relative flex w-full flex-col items-center gap-2" ref={userMenuRef}>
          <NotificationBell collapsed />
          <Tooltip
            content={displayName}
            subtitle={showRoleBadge ? roleBadge || undefined : undefined}
            side="right"
            delay={280}
            className={userMenuOpen ? "pointer-events-none opacity-0" : undefined}
          >
            <button
              type="button"
              ref={userMenuBtnRef}
              onClick={onTriggerClick}
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/35",
                userMenuOpen && "bg-white/[0.07] ring-1 ring-violet-400/30"
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

    return (
      <div className="relative z-30 w-full min-w-0" ref={userMenuRef}>
        <div className="flex w-full min-w-0 items-center gap-0.5">
          <button
            type="button"
            ref={userMenuBtnRef}
            onClick={onTriggerClick}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
              "hover:bg-black/[0.04] dark:hover:bg-white/[0.05]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/35",
              userMenuOpen && "bg-black/[0.06] dark:bg-white/[0.08]"
            )}
            aria-label={`Conta de ${displayName}`}
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
          >
            <UserAvatar user={avatarUser} size="sm" />
            <span className="flex min-w-0 flex-1 flex-col gap-px">
              <span
                className="nf-sidebar-label truncate text-[12.5px] font-medium leading-tight text-ink dark:text-zinc-100"
                title={displayName}
              >
                {displayName}
              </span>
              <span className="nf-sidebar-label truncate text-[10.5px] leading-tight text-ink-faint dark:text-zinc-500">
                {roleBadge || (user?.platformRole === "SUPERADMIN" ? "Superadministrador" : "Membro")}
              </span>
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform duration-200",
                userMenuOpen && "rotate-180 text-violet-500 dark:text-violet-300"
              )}
              strokeWidth={1.75}
              aria-hidden
            />
          </button>
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center"
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
    userMenuPos &&
    createPortal(
      <div
        className={cn(
          "nf-user-menu-floating-wrap fixed",
          userMenuAnim && "is-open"
        )}
        style={{
          left: userMenuPos.left,
          top: userMenuPos.top,
          bottom: userMenuPos.bottom,
          width: userMenuPos.width,
          zIndex: 9999,
          maxHeight: userMenuPos.maxHeight,
        }}
      >
        <UserMenuPanel maxHeight={userMenuPos.maxHeight} />
      </div>,
      document.body
    );

  function SidebarContent({ forceExpanded = false }: { forceExpanded?: boolean }) {
    const isCollapsed = forceExpanded ? false : collapsed;

    // ── Área administrativa (Superadmin): shell dedicado premium ──
    // Força AdminSidebar SEMPRE que for contexto de plataforma.
    if (isPlatformContext) {
      return (
        <AdminSidebar
          key="admin-sidebar-v5"
          collapsed={isCollapsed}
          pathname={pathname}
          homeHref="/admin"
          navGroups={platformNavGroups}
          onNavigate={() => setMobileOpen(false)}
          onToggleCollapsed={toggleCollapsed}
          navLocked={adminNavLocked}
          navLockReason={adminNavLockReason}
          userMenuOpen={false}
          footer={<UserFooter isCollapsed={isCollapsed} />}
        />
      );
    }

    function onSidebarAmbientMove(e: ReactPointerEvent<HTMLElement>) {
      if (typeof window === "undefined") return;
      if (window.matchMedia("(pointer: coarse)").matches) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (window.matchMedia("(max-width: 1023px)").matches) return;
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
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

    // ── Tenant (empresa) ──
    return (
      <aside
        className={cn(
          "nf-app-enter-aside nf-sidebar nf-sb",
          isCollapsed && "nf-sidebar-collapsed nf-sb--collapsed"
        )}
        data-collapsed={isCollapsed ? "true" : "false"}
        data-platform="false"
        data-user-menu-open="false"
        onPointerMove={onSidebarAmbientMove}
        onPointerLeave={onSidebarAmbientLeave}
      >
        <div className="nf-sb-glow" aria-hidden>
          <span className="nf-sb-glow-a" />
          <span className="nf-sb-glow-b" />
        </div>
        <div className="nf-sidebar-inner nf-sb-inner">
          <header
            className={cn(
              "nf-sb-brand",
              companyOpen && "relative z-50",
              isCollapsed && "nf-sb-brand--collapsed"
            )}
          >
            {isCollapsed ? (
              <div className="nf-sb-brand-col">
                <Tooltip content="NexaFlow AI" side="right" delay={140}>
                  <Link
                    href={homeHref}
                    className="nf-sb-logo-btn"
                    onClick={() => setMobileOpen(false)}
                    aria-label="NexaFlow AI"
                  >
                    <Logo size="sm" variant="mark" />
                  </Link>
                </Tooltip>
                <Tooltip content="Expandir" subtitle="Ctrl + B" side="right" delay={140}>
                  <button
                    type="button"
                    onClick={toggleCollapsed}
                    className="nf-sb-collapse-btn hidden lg:inline-flex"
                    aria-label="Expandir menu (Ctrl+B)"
                  >
                    <PanelLeft className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </Tooltip>
                <div className="nf-sb-sep" aria-hidden />
                <CompanySwitcher isCollapsed />
              </div>
            ) : (
              <>
                <div className="nf-sb-brand-row">
                  <Link
                    href={homeHref}
                    className="nf-sb-brand-link"
                    onClick={() => setMobileOpen(false)}
                    aria-label="NexaFlow AI"
                  >
                    <Logo size="sm" className="nf-sidebar-brand" />
                  </Link>
                  <Tooltip content="Recolher" subtitle="Ctrl + B" side="bottom" delay={180}>
                    <button
                      type="button"
                      onClick={toggleCollapsed}
                      className="nf-sb-collapse-btn hidden lg:inline-flex"
                      aria-label="Recolher menu (Ctrl+B)"
                    >
                      <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  </Tooltip>
                </div>
                <div className="nf-sb-workspace">
                  <CompanySwitcher isCollapsed={false} />
                </div>
              </>
            )}
          </header>

          <div className={cn("nf-sb-rule", isCollapsed && "nf-sb-rule--collapsed")} aria-hidden />

          <nav
            className={cn("nf-sidebar-nav nf-sb-nav", isCollapsed && "nf-sb-nav--collapsed")}
            aria-label="Navegação principal"
          >
            <div className={cn("nf-sb-nav-stack", isCollapsed && "nf-sb-nav-stack--collapsed")}>
              {activeNavGroups.map((group, gi) => {
                const showCollapsedDivider = isCollapsed && gi > 0 && gi === 2;
                return (
                  <div
                    key={group.label}
                    className={cn("nf-sb-group", isCollapsed && "nf-sb-group--collapsed")}
                    data-group={group.label}
                  >
                    {showCollapsedDivider ? (
                      <div className="nf-sb-group-sep" aria-hidden />
                    ) : null}
                    {!isCollapsed ? (
                      <p className="nf-sb-group-label">{group.label}</p>
                    ) : null}
                    <div
                      className={cn(
                        "nf-sb-group-items",
                        isCollapsed && "nf-sb-group-items--collapsed"
                      )}
                      role="group"
                      aria-label={group.label}
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
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </nav>

          <footer
            className={cn(
              "nf-sidebar-footer nf-sb-footer",
              isCollapsed && "nf-sb-footer--collapsed"
            )}
          >
            <UserFooter isCollapsed={isCollapsed} />
          </footer>
        </div>
      </aside>
    );
  }

  async function endImpersonation() {
    if (endingImpersonation) return;
    setEndingImpersonation(true);
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
      window.location.href = "/admin/companies";
    } catch {
      try {
        sessionStorage.removeItem("nexaflow_impersonating");
      } catch {
        /* ignore */
      }
      window.location.href = "/admin/companies";
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

  if (!hydrated || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F5F7] dark:bg-[#0B0C10]">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  if (isOnboardingRoute) {
    return <div className="min-h-screen bg-[#F4F5F7] dark:bg-[#0B0C10]">{children}</div>;
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
        <aside
          role="status"
          aria-label="Sessão de suporte administrativo"
          className="relative z-[var(--z-banner)] flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.08] bg-[#0c0d12]/95 px-4 py-1.5 text-[12px] text-zinc-300 shadow-sm backdrop-blur-xl transition-all sm:px-6"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-400" />
            </span>
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-[11px] font-medium text-zinc-400">Modo Suporte:</span>
              <span className="truncate text-zinc-200">
                Visualizando <strong className="font-medium text-white">{tenant?.name || "esta empresa"}</strong>
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={endingImpersonation}
            onClick={() => void endImpersonation()}
            className="inline-flex h-6.5 shrink-0 items-center gap-1.5 rounded-md border border-white/[0.12] bg-white/[0.05] px-2.5 text-[11px] font-medium text-zinc-200 shadow-sm transition-all hover:border-white/25 hover:bg-white/[0.10] hover:text-white active:scale-[0.98] disabled:opacity-50 cursor-pointer"
          >
            {endingImpersonation ? (
              <>
                <Spinner className="h-3 w-3" />
                <span>Saindo…</span>
              </>
            ) : (
              <>
                <ArrowLeft className="h-3 w-3 text-zinc-400" />
                <span>Sair do suporte</span>
              </>
            )}
          </button>
        </aside>
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

          {/*
            Fila humana FORA do scroll: shrink-0 no flex do .nf-main.
            Assim a área de conteúdo encolhe e não “desce cortando” o rodapé.
          */}
          {!isPlatformContext &&
            !pathname?.startsWith("/app/onboarding") &&
            !pathname?.startsWith("/admin") && <HumanQueueBanner />}

          {/* Único scroll principal do painel — inclusive Configurações (sem scroll interno). */}
          <main className="nf-main-scroll">
            {!isPlatformContext &&
              !pathname?.startsWith("/app/onboarding") &&
              !pathname?.startsWith("/admin") && (
                <div className="mx-auto w-full max-w-[var(--nf-page-max-width)] px-0">
                  <WhatsAppStatusBanner />
                </div>
              )}
            <div key={pathname} className="page nf-page-enter nf-cq">
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
