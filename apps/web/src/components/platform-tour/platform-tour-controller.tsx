"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Compass, Sparkles, X } from "lucide-react";
import { api, getAccessToken } from "@/lib/api";
import { useAuth, type UserInfo } from "@/store/auth";
import {
  dispatchTourPrepare,
  filterTourSteps,
  parsePlanEntitlements,
  stageLabel,
  type PlatformTourState,
  type TourStage,
  type TourStepDef,
} from "@/lib/platform-tour";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";

type TourPhase = "idle" | "welcome" | "touring" | "chapter" | "done";

type ShellBridge = {
  expandSidebar: () => void;
  openMobileNav: () => void;
  closeMobileNav: () => void;
  restoreSidebar: (collapsed: boolean) => void;
  getSidebarCollapsed: () => boolean;
  isMobile: () => boolean;
};

type PlatformTourContextValue = {
  startManualTour: () => Promise<void>;
  phase: TourPhase;
};

const PlatformTourContext = createContext<PlatformTourContextValue>({
  startManualTour: async () => {},
  phase: "idle",
});

export function usePlatformTour() {
  return useContext(PlatformTourContext);
}

type ApiTourResponse = {
  tour: PlatformTourState;
  autoOffer: boolean;
  impersonating?: boolean;
  user?: UserInfo;
};

function applyUser(user: UserInfo) {
  const token = getAccessToken() || useAuth.getState().token;
  const { tenant, memberships } = useAuth.getState();
  if (token) {
    useAuth.getState().setSession({ token, user, tenant, memberships });
  } else {
    useAuth.setState({ user });
  }
}

async function postTour(
  action: "offer" | "dismiss" | "start" | "exit" | "complete" | "restart" | "step",
  stepId?: string | null
): Promise<ApiTourResponse> {
  return api<ApiTourResponse>("/auth/platform-tour", {
    method: "POST",
    json: { action, stepId: stepId ?? null },
  });
}

function queryVisibleTarget(selector: string): HTMLElement | null {
  const nodes = document.querySelectorAll(selector);
  for (const node of nodes) {
    const el = node as HTMLElement;
    const r = el.getBoundingClientRect();
    if (r.width > 2 && r.height > 2) {
      const style = window.getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) {
        continue;
      }
      return el;
    }
  }
  return null;
}

function resolveStepTarget(step: TourStepDef): HTMLElement | null {
  const selectors = [step.target, ...(step.fallbackTargets || [])];
  for (const sel of selectors) {
    const el = queryVisibleTarget(sel);
    if (el) return el;
  }
  return null;
}

function waitForStepTarget(step: TourStepDef, timeoutMs = 2800): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const found = resolveStepTarget(step);
    if (found) {
      resolve(found);
      return;
    }

    const start = performance.now();
    const tick = () => {
      const el = resolveStepTarget(step);
      if (el) {
        obs.disconnect();
        window.clearInterval(poll);
        resolve(el);
      } else if (performance.now() - start > timeoutMs) {
        obs.disconnect();
        window.clearInterval(poll);
        resolve(null);
      }
    };
    const obs = new MutationObserver(tick);
    obs.observe(document.body, { childList: true, subtree: true, attributes: true });
    const poll = window.setInterval(tick, 50);
  });
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

type Rect = { top: number; left: number; width: number; height: number };

function readRect(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  const pad = 6;
  return {
    top: Math.max(0, r.top - pad),
    left: Math.max(0, r.left - pad),
    width: r.width + pad * 2,
    height: r.height + pad * 2,
  };
}

function pathMatches(current: string, href?: string): boolean {
  if (!href) return true;
  const targetPath = href.split("?")[0];
  if (targetPath === "/app") return current === "/app";
  return current === targetPath || current.startsWith(`${targetPath}/`);
}

export function PlatformTourController({
  shell,
  children,
}: {
  shell: ShellBridge;
  children?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname() || "/app";
  const user = useAuth((s) => s.user);
  const tenant = useAuth((s) => s.tenant);
  const hydrated = useAuth((s) => s.hydrated);

  const [phase, setPhase] = useState<TourPhase>("idle");
  const [steps, setSteps] = useState<TourStepDef[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [popoverPos, setPopoverPos] = useState<{
    top: number;
    left: number;
    placement: "right" | "left" | "bottom" | "top";
  } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showFinale, setShowFinale] = useState(false);
  /** Setup steps aguardando após etapa 1 (capítulo) */
  const [pendingSetup, setPendingSetup] = useState<TourStepDef[]>([]);

  const prevCollapsedRef = useRef<boolean | null>(null);
  const offeredRef = useRef(false);
  const activeRef = useRef(false);
  const shellRef = useRef(shell);
  shellRef.current = shell;

  const isPlatformAdmin =
    user?.platformRole === "SUPERADMIN" &&
    (() => {
      try {
        return sessionStorage.getItem("nexaflow_impersonating") !== "1";
      } catch {
        return true;
      }
    })();

  const isImpersonating = (() => {
    try {
      return sessionStorage.getItem("nexaflow_impersonating") === "1";
    } catch {
      return false;
    }
  })();

  const buildAllSteps = useCallback((): TourStepDef[] => {
    const entitlements = parsePlanEntitlements(tenant?.plan);
    return filterTourSteps({
      role: tenant?.role,
      platformRole: user?.platformRole,
      impersonating: isImpersonating,
      entitlements,
    });
  }, [tenant?.plan, tenant?.role, user?.platformRole, isImpersonating]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!hydrated || !user || !tenant) return;
    if (isPlatformAdmin || isImpersonating) return;
    if (offeredRef.current || phase !== "idle") return;

    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const data = await api<ApiTourResponse>("/auth/platform-tour");
        if (cancelled) return;
        if (data.impersonating || !data.autoOffer) return;
        if (data.tour.status !== "NOT_OFFERED" && data.tour.status !== "OFFERED") return;

        const ready = await waitForStepTarget(
          {
            id: "map_home",
            stage: "nav",
            target: '[data-tour="nav-home"]',
            title: "",
            description: "",
            order: 0,
          },
          4000
        );
        if (cancelled || !ready) return;

        offeredRef.current = true;
        setPhase("welcome");
        if (data.tour.status === "NOT_OFFERED") {
          try {
            const res = await postTour("offer");
            if (res.user) applyUser(res.user);
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* silencioso */
      }
    }, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [hydrated, user, tenant, isPlatformAdmin, isImpersonating, phase]);

  const lastHrefRef = useRef<string | null>(null);

  const prepareForStep = useCallback((step: TourStepDef) => {
    const s = shellRef.current;
    if (prevCollapsedRef.current === null) {
      prevCollapsedRef.current = s.getSidebarCollapsed();
    }
    const wantSidebar = step.keepSidebar ?? step.stage === "nav";
    if (wantSidebar) {
      if (s.isMobile()) s.openMobileNav();
      else s.expandSidebar();
    } else {
      if (s.isMobile()) s.closeMobileNav();
      else s.expandSidebar();
    }
  }, []);

  const restoreShellAfterTour = useCallback(() => {
    const s = shellRef.current;
    if (s.isMobile()) s.closeMobileNav();
    if (prevCollapsedRef.current !== null) {
      s.restoreSidebar(prevCollapsedRef.current);
      prevCollapsedRef.current = null;
    }
    dispatchTourPrepare("close-agent-create");
    dispatchTourPrepare("close-agent-edit");
    lastHrefRef.current = null;
  }, []);

  const endTourUi = useCallback(() => {
    activeRef.current = false;
    setTargetRect(null);
    setPopoverPos(null);
    setStepIndex(0);
    setSteps([]);
    setPendingSetup([]);
    restoreShellAfterTour();
  }, [restoreShellAfterTour]);

  const positionFor = useCallback((el: HTMLElement) => {
    const rect = readRect(el);
    setTargetRect(rect);

    const popW = Math.min(340, window.innerWidth - 24);
    const popH = 220;
    const gap = 14;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isMobile = vw < 1024;

    if (isMobile) {
      setPopoverPos({
        top: Math.max(12, vh - popH - 12),
        left: 12,
        placement: "bottom",
      });
      return;
    }

    const spaceRight = vw - (rect.left + rect.width);
    const spaceLeft = rect.left;
    let placement: "right" | "left" | "bottom" | "top" = "right";
    let top = rect.top + rect.height / 2 - popH / 2;
    let left = rect.left + rect.width + gap;

    if (spaceRight < popW + 16 && spaceLeft > spaceRight) {
      placement = "left";
      left = rect.left - popW - gap;
    }
    if (left < 12) left = 12;
    if (left + popW > vw - 12) left = vw - popW - 12;
    if (top < 12) top = 12;
    if (top + popH > vh - 12) top = Math.max(12, vh - popH - 12);

    if (spaceRight < 90 && spaceLeft < 90) {
      placement = "bottom";
      top = Math.min(rect.top + rect.height + gap, vh - popH - 12);
      left = Math.min(Math.max(12, rect.left), vw - popW - 12);
    }

    setPopoverPos({ top, left, placement });
  }, []);

  const ensureRoute = useCallback(
    async (href?: string) => {
      if (!href) return false;
      const curPath =
        typeof window !== "undefined" ? window.location.pathname : pathname;
      const curSearch =
        typeof window !== "undefined" ? window.location.search.replace(/^\?/, "") : "";
      const [targetPath, targetQuery = ""] = href.split("?");

      const samePath = pathMatches(curPath, href);
      const sameQuery = !targetQuery || targetQuery === curSearch;
      if (samePath && sameQuery) {
        lastHrefRef.current = href;
        return false;
      }

      router.push(href);
      lastHrefRef.current = href;
      // rota nova: espera um pouco; mesma área (só query) mais curto
      await sleep(samePath ? 160 : 260);
      return true;
    },
    [pathname, router]
  );

  const showStepAt = useCallback(
    async (list: TourStepDef[], index: number) => {
      if (!list.length) {
        endTourUi();
        setPhase("idle");
        return;
      }

      let i = index;
      while (i < list.length) {
        const step = list[i];
        prepareForStep(step);
        const navigated = await ensureRoute(step.href);
        if (step.prepare) {
          dispatchTourPrepare(step.prepare);
          const slow =
            step.prepare === "open-agent-create" ||
            step.prepare === "open-agent-edit" ||
            step.prepare.startsWith("edit-tab-");
          await sleep(slow ? 220 : 40);
        }
        // paint
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        if (navigated) await sleep(60);

        const el = await waitForStepTarget(step, navigated ? 3200 : 1800);
        if (el) {
          el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
          await sleep(70);
          positionFor(el);
          setStepIndex(i);
          setSteps(list);
          setPhase("touring");
          try {
            await postTour("step", step.id);
          } catch {
            /* opcional */
          }
          return;
        }
        i += 1;
      }

      try {
        const res = await postTour("complete", list[list.length - 1]?.id);
        if (res.user) applyUser(res.user);
      } catch {
        /* ignore */
      }
      endTourUi();
      setShowFinale(true);
      setPhase("done");
    },
    [endTourUi, ensureRoute, positionFor, prepareForStep]
  );

  const beginNavStage = useCallback(
    async (all: TourStepDef[]) => {
      const nav = all.filter((s) => s.stage === "nav");
      const agents = all.filter((s) => s.stage === "agents");
      setPendingSetup(agents);
      activeRef.current = true;
      setShowFinale(false);
      lastHrefRef.current = null;
      if (!nav.length && agents.length) {
        setPendingSetup([]);
        await showStepAt(agents, 0);
        return;
      }
      await showStepAt(nav, 0);
    },
    [showStepAt]
  );

  const startManualTour = useCallback(async () => {
    if (isPlatformAdmin || isImpersonating || busy) return;
    setBusy(true);
    try {
      const list = buildAllSteps();
      if (!list.length) return;
      const res = await postTour("restart");
      if (res.user) applyUser(res.user);
      await beginNavStage(list);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }, [beginNavStage, buildAllSteps, busy, isImpersonating, isPlatformAdmin]);

  // Assistente NexaFlow → iniciar tour (mesmo fluxo manual)
  useEffect(() => {
    const onStart = () => {
      void startManualTour();
    };
    window.addEventListener("nexaflow:start-platform-tour", onStart);
    return () => window.removeEventListener("nexaflow:start-platform-tour", onStart);
  }, [startManualTour]);

  const onExploreAlone = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await postTour("dismiss");
      if (res.user) applyUser(res.user);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
      setPhase("idle");
    }
  };

  const onStartTour = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const list = buildAllSteps();
      if (!list.length) {
        setPhase("idle");
        return;
      }
      const res = await postTour("start", list[0].id);
      if (res.user) applyUser(res.user);
      await beginNavStage(list);
    } catch {
      setPhase("idle");
    } finally {
      setBusy(false);
    }
  };

  const completeTour = async (lastStepId?: string) => {
    setBusy(true);
    try {
      const res = await postTour("complete", lastStepId);
      if (res.user) applyUser(res.user);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
      endTourUi();
      setShowFinale(true);
      setPhase("done");
    }
  };

  const onExitTour = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const stepId = steps[stepIndex]?.id;
      const res = await postTour("exit", stepId);
      if (res.user) applyUser(res.user);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
      endTourUi();
      setPhase("idle");
    }
  };

  const onNext = async () => {
    if (!steps.length) return;
    const current = steps[stepIndex];
    const next = stepIndex + 1;

    // fim da etapa 1 (nav) com setup pendente → capítulo
    if (
      next >= steps.length &&
      current?.stage === "nav" &&
      pendingSetup.length > 0
    ) {
      setTargetRect(null);
      setPopoverPos(null);
      setPhase("chapter");
      return;
    }

    if (next >= steps.length) {
      await completeTour(current?.id);
      return;
    }
    await showStepAt(steps, next);
  };

  const onPrev = async () => {
    if (stepIndex <= 0) return;
    await showStepAt(steps, stepIndex - 1);
  };

  const onContinueSetup = async () => {
    const setup = pendingSetup;
    setPendingSetup([]);
    if (!setup.length) {
      await completeTour(steps[stepIndex]?.id);
      return;
    }
    await showStepAt(setup, 0);
  };

  const onSkipSetup = async () => {
    setPendingSetup([]);
    await completeTour(steps[stepIndex]?.id);
  };

  useEffect(() => {
    if (phase !== "touring" || !steps[stepIndex]) return;
    const step = steps[stepIndex];
    function update() {
      const el = queryVisibleTarget(step.target);
      if (el) positionFor(el);
    }
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [phase, steps, stepIndex, positionFor]);

  useEffect(() => {
    if (phase !== "touring" && phase !== "welcome" && phase !== "chapter") return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        if (phase === "welcome") void onExploreAlone();
        else if (phase === "chapter") void onSkipSetup();
        else void onExitTour();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (phase === "idle" || phase === "done") {
      activeRef.current = false;
    }
  }, [phase]);

  const ctx = useMemo(() => ({ startManualTour, phase }), [startManualTour, phase]);

  const current = steps[stepIndex];
  const total = steps.length;
  const isLastNav =
    current?.stage === "nav" && stepIndex >= total - 1 && pendingSetup.length > 0;
  const isLast = stepIndex >= total - 1 && !isLastNav;
  const stage: TourStage | undefined = current?.stage;
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const nextLabel = isLastNav
    ? "Continuar"
    : isLast
      ? "Concluir"
      : "Próximo";

  return (
    <PlatformTourContext.Provider value={ctx}>
      {children}

      {mounted && phase === "welcome"
        ? createPortal(
            <div
              className="fixed inset-0 z-[220] flex items-center justify-center p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="nf-tour-welcome-title"
            >
              <div
                className="absolute inset-0 bg-black/[0.55] transition-opacity duration-200 dark:bg-black/70"
                onClick={() => void onExploreAlone()}
              />
              <div
                className={cn(
                  "relative w-full max-w-[400px] overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-2xl",
                  "dark:border-white/[0.1] dark:bg-[#12151c]"
                )}
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-brand-500/[0.1] to-transparent dark:from-brand-500/[0.14]" />
                <div className="relative px-6 pb-5 pt-6">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/[0.12] text-brand-600 dark:text-brand-300">
                      <Compass className="h-5 w-5" strokeWidth={1.6} />
                    </span>
                    <Logo size="sm" />
                  </div>
                  <h2
                    id="nf-tour-welcome-title"
                    className="mt-5 font-display text-[1.25rem] font-semibold tracking-tight text-ink dark:text-white"
                  >
                    Bem-vindo à NexaFlow
                  </h2>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">
                    Um passeio rápido pelo menu e, em seguida, pelos agentes.
                  </p>
                  <p className="mt-2 text-[11.5px] text-ink-faint">Cerca de 2 minutos. Pode sair quando quiser.</p>

                  <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      className="btn-secondary h-10 px-4 text-[13px]"
                      disabled={busy}
                      onClick={() => void onExploreAlone()}
                    >
                      Explorar sozinho
                    </button>
                    <button
                      type="button"
                      className="btn-primary h-10 px-4 text-[13px]"
                      disabled={busy}
                      onClick={() => void onStartTour()}
                    >
                      Iniciar tour
                      <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {/* Transição leve entre mapa e agentes */}
      {mounted && phase === "chapter"
        ? createPortal(
            <div
              className="fixed inset-0 z-[230] flex items-end justify-center p-4 sm:items-center"
              role="dialog"
              aria-modal="true"
              aria-labelledby="nf-tour-chapter-title"
            >
              <div
                className="absolute inset-0 bg-black/[0.45] dark:bg-black/60"
                onClick={() => void onContinueSetup()}
              />
              <div className="relative w-full max-w-[380px] rounded-2xl border border-black/[0.08] bg-white px-5 py-5 shadow-2xl dark:border-white/[0.1] dark:bg-[#12151c]">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/[0.12] text-brand-600 dark:text-brand-300">
                    <Sparkles className="h-4 w-4" strokeWidth={1.6} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                      Parte 2 · Agentes
                    </p>
                    <h2
                      id="nf-tour-chapter-title"
                      className="mt-0.5 text-[15px] font-semibold text-ink dark:text-white"
                    >
                      Configurar agentes
                    </h2>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
                      Criação, edição, conhecimento e canal.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="btn-ghost h-8 px-2 text-[12px] text-ink-faint"
                    onClick={() => void onSkipSetup()}
                  >
                    Encerrar tour
                  </button>
                  <button
                    type="button"
                    className="btn-primary h-8 px-3.5 text-[12px]"
                    onClick={() => void onContinueSetup()}
                  >
                    Ver agentes
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {mounted && phase === "touring" && targetRect && popoverPos && current
        ? createPortal(
            <div className="fixed inset-0 z-[230]" aria-live="polite">
              <div
                className="pointer-events-none absolute rounded-xl ring-2 ring-brand-400/50 dark:ring-brand-300/40"
                style={{
                  top: targetRect.top,
                  left: targetRect.left,
                  width: targetRect.width,
                  height: targetRect.height,
                  boxShadow: "0 0 0 9999px rgba(0,0,0,0.52)",
                  transition: reducedMotion
                    ? undefined
                    : "top 160ms ease, left 160ms ease, width 160ms ease, height 160ms ease",
                }}
              />
              <div className="absolute inset-0" aria-hidden />

              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="nf-tour-step-title"
                className={cn(
                  "pointer-events-auto absolute z-10 w-[min(320px,calc(100vw-24px))] rounded-2xl border border-black/[0.08] bg-white p-4 shadow-xl",
                  "dark:border-white/[0.1] dark:bg-[#14171e]"
                )}
                style={{
                  top: popoverPos.top,
                  left:
                    typeof window !== "undefined" && window.innerWidth < 1024
                      ? 12
                      : popoverPos.left,
                  right:
                    typeof window !== "undefined" && window.innerWidth < 1024
                      ? 12
                      : undefined,
                  width:
                    typeof window !== "undefined" && window.innerWidth < 1024
                      ? "auto"
                      : undefined,
                  transition: reducedMotion ? undefined : "top 160ms ease, left 160ms ease",
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium tabular-nums text-ink-faint">
                      {stage ? `${stageLabel(stage)} · ` : ""}
                      {stepIndex + 1} de {total}
                    </p>
                    <h3
                      id="nf-tour-step-title"
                      className="mt-0.5 text-[14px] font-semibold text-ink dark:text-white"
                    >
                      {current.title}
                    </h3>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost h-7 w-7 shrink-0 px-0"
                    aria-label="Sair do tour"
                    onClick={() => void onExitTour()}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
                  {current.description}
                </p>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    className="btn-ghost h-8 px-2 text-[12px] text-ink-faint"
                    onClick={() => void onExitTour()}
                  >
                    Sair do tour
                  </button>
                  <div className="ml-auto flex items-center gap-1.5">
                    {stepIndex > 0 ? (
                      <button
                        type="button"
                        className="btn-secondary h-8 px-3 text-[12px]"
                        onClick={() => void onPrev()}
                      >
                        Anterior
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn-primary h-8 px-3.5 text-[12px]"
                      onClick={() => void onNext()}
                    >
                      {nextLabel}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {mounted && phase === "done" && showFinale
        ? createPortal(
            <div
              className="fixed inset-0 z-[220] flex items-center justify-center p-4"
              role="dialog"
              aria-modal="true"
            >
              <div
                className="absolute inset-0 bg-black/50 dark:bg-black/[0.65]"
                onClick={() => setPhase("idle")}
              />
              <div className="relative w-full max-w-[360px] rounded-2xl border border-black/[0.08] bg-white px-6 py-6 shadow-2xl dark:border-white/[0.1] dark:bg-[#12151c]">
                <h2 className="font-display text-[1.15rem] font-semibold text-ink dark:text-white">
                  Pronto
                </h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
                  Menu e agentes mapeados. Pode usar a plataforma.
                </p>
                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    className="btn-primary h-9 px-4 text-[13px]"
                    onClick={() => {
                      setShowFinale(false);
                      setPhase("idle");
                    }}
                  >
                    Começar a usar
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </PlatformTourContext.Provider>
  );
}
