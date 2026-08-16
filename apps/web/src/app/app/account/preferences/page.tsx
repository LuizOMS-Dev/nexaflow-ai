"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  AtSign,
  Bell,
  Compass,
  MessagesSquare,
  Monitor,
  Moon,
  ShieldAlert,
  Sun,
  Volume2,
  ZapOff,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Spinner, Switch, useToast } from "@/components/ui";
import { useAuth, type UserInfo } from "@/store/auth";
import { applyTheme, getStoredThemePreference, type ThemePreference } from "@/lib/theme";
import { applyReduceMotion, isReduceMotionEffective } from "@/lib/motion";
import { playNotificationChime } from "@/lib/audio";
import { applyUser } from "../account-utils";
import {
  AccountRow,
  AccountSaveBar,
  AccountSurface,
} from "../account-ui";

const ADMIN_LANDING_OPTIONS = [
  { value: "OVERVIEW", label: "Visão geral (/admin)" },
  { value: "COMPANIES", label: "Empresas (/admin/companies)" },
  { value: "USERS", label: "Usuários (/admin/users)" },
  { value: "FINANCE", label: "Financeiro (/admin/finance)" },
  { value: "PLANS", label: "Planos (/admin/plans)" },
  { value: "SYSTEM", label: "Sistema & Diagnóstico (/admin/system)" },
];

const WORKSPACE_LANDING_OPTIONS = [
  { value: "HOME", label: "Início (/app)" },
  { value: "INBOX", label: "Caixa de entrada (/app/inbox)" },
  { value: "CRM", label: "CRM & Oportunidades (/app/crm)" },
  { value: "CONTACTS", label: "Contatos (/app/contacts)" },
  { value: "TASKS", label: "Tarefas (/app/tasks)" },
  { value: "AUTOMATIONS", label: "Automações (/app/automations)" },
  { value: "AI", label: "Agentes de IA (/app/ai)" },
  { value: "REPORTS", label: "Relatórios (/app/reports)" },
  { value: "SETTINGS", label: "Configurações (/app/settings)" },
];

export default function AccountPreferencesPage() {
  const user = useAuth((s) => s.user);
  const tenant = useAuth((s) => s.tenant);
  const { toast } = useToast();

  const isSuperadmin = user?.platformRole === "SUPERADMIN";

  const [notificationSupport, setNotificationSupport] = useState<"supported" | "unsupported" | "denied" | "granted" | "default">("supported");

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (!("Notification" in window)) {
        setNotificationSupport("unsupported");
      } else {
        setNotificationSupport(Notification.permission);
      }
    }
  }, []);

  const [prefs, setPrefs] = useState({
    theme: (user?.preferences?.theme || getStoredThemePreference() || "system") as ThemePreference,
    reduceMotion: Boolean(user?.preferences?.reduceMotion),
    adminLandingPage: user?.preferences?.adminLandingPage || "OVERVIEW",
    workspaceLandingPage: user?.preferences?.workspaceLandingPage || "HOME",
    notifyMentions: user?.preferences?.notifyMentions !== false,
    notifyAssigned: user?.preferences?.notifyAssigned !== false,
    notifySecurity: user?.preferences?.notifySecurity !== false,
    notificationSound: user?.preferences?.notificationSound !== false,
    browserNotificationsEnabled: Boolean(user?.preferences?.browserNotificationsEnabled),
  });

  useEffect(() => {
    const userTheme = (user?.preferences?.theme || getStoredThemePreference() || "system") as ThemePreference;
    setPrefs({
      theme: userTheme,
      reduceMotion: Boolean(user?.preferences?.reduceMotion),
      adminLandingPage: user?.preferences?.adminLandingPage || "OVERVIEW",
      workspaceLandingPage: user?.preferences?.workspaceLandingPage || "HOME",
      notifyMentions: user?.preferences?.notifyMentions !== false,
      notifyAssigned: user?.preferences?.notifyAssigned !== false,
      notifySecurity: user?.preferences?.notifySecurity !== false,
      notificationSound: user?.preferences?.notificationSound !== false,
      browserNotificationsEnabled: Boolean(user?.preferences?.browserNotificationsEnabled),
    });
    // Aplica reduceMotion ativo
    applyReduceMotion(Boolean(user?.preferences?.reduceMotion));
  }, [user?.preferences]);

  const baseline = useMemo(
    () => ({
      theme: (user?.preferences?.theme || getStoredThemePreference() || "system") as ThemePreference,
      reduceMotion: Boolean(user?.preferences?.reduceMotion),
      adminLandingPage: user?.preferences?.adminLandingPage || "OVERVIEW",
      workspaceLandingPage: user?.preferences?.workspaceLandingPage || "HOME",
      notifyMentions: user?.preferences?.notifyMentions !== false,
      notifyAssigned: user?.preferences?.notifyAssigned !== false,
      notifySecurity: user?.preferences?.notifySecurity !== false,
      notificationSound: user?.preferences?.notificationSound !== false,
      browserNotificationsEnabled: Boolean(user?.preferences?.browserNotificationsEnabled),
    }),
    [user?.preferences]
  );

  const dirty =
    prefs.theme !== baseline.theme ||
    prefs.reduceMotion !== baseline.reduceMotion ||
    (isSuperadmin ? prefs.adminLandingPage !== baseline.adminLandingPage : prefs.workspaceLandingPage !== baseline.workspaceLandingPage) ||
    prefs.notifyMentions !== baseline.notifyMentions ||
    prefs.notifyAssigned !== baseline.notifyAssigned ||
    prefs.notifySecurity !== baseline.notifySecurity ||
    prefs.notificationSound !== baseline.notificationSound ||
    prefs.browserNotificationsEnabled !== baseline.browserNotificationsEnabled;

  useEffect(() => {
    return () => {
      // Restaura o tema salvo no localStorage caso o usuário saia sem salvar
      const saved = getStoredThemePreference();
      applyTheme(saved);
      // Restaura reduceMotion salvo
      applyReduceMotion(baseline.reduceMotion);
    };
  }, [baseline.reduceMotion]);

  function handleThemeChange(id: ThemePreference) {
    setPrefs((p) => ({ ...p, theme: id }));
    // Live preview imediato do tema escolhido
    applyTheme(id, { persist: false });
  }

  function handleReduceMotionChange(enabled: boolean) {
    setPrefs((p) => ({ ...p, reduceMotion: enabled }));
    applyReduceMotion(enabled);
  }

  async function handleBrowserNotificationsToggle(checked: boolean) {
    if (!checked) {
      setPrefs((p) => ({ ...p, browserNotificationsEnabled: false }));
      return;
    }

    if (typeof window === "undefined" || !("Notification" in window)) {
      toast({ kind: "error", title: "Notificações não suportadas neste navegador." });
      return;
    }

    if (Notification.permission === "denied") {
      toast({
        kind: "warning",
        title: "Permissão bloqueada no navegador",
        description: "Para receber alertas, habilite as notificações nas configurações do seu navegador.",
      });
      setNotificationSupport("denied");
      setPrefs((p) => ({ ...p, browserNotificationsEnabled: false }));
      return;
    }

    if (Notification.permission === "default") {
      try {
        const res = await Notification.requestPermission();
        setNotificationSupport(res);
        if (res === "granted") {
          setPrefs((p) => ({ ...p, browserNotificationsEnabled: true }));
          toast({ kind: "success", title: "Notificações do navegador ativadas." });
        } else {
          setPrefs((p) => ({ ...p, browserNotificationsEnabled: false }));
        }
      } catch {
        setPrefs((p) => ({ ...p, browserNotificationsEnabled: false }));
      }
      return;
    }

    setPrefs((p) => ({ ...p, browserNotificationsEnabled: true }));
  }

  function handleDiscard() {
    setPrefs(baseline);
    applyTheme(baseline.theme, { persist: true });
    applyReduceMotion(baseline.reduceMotion);
  }

  const savePrefs = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        theme: prefs.theme,
        reduceMotion: prefs.reduceMotion,
        notifyMentions: prefs.notifyMentions,
        notifyAssigned: prefs.notifyAssigned,
        notifySecurity: prefs.notifySecurity,
        notificationSound: prefs.notificationSound,
        browserNotificationsEnabled: prefs.browserNotificationsEnabled,
      };
      if (isSuperadmin) {
        payload.adminLandingPage = prefs.adminLandingPage;
      } else if (tenant) {
        payload.workspaceLandingPage = prefs.workspaceLandingPage;
      }
      return api<{ user: UserInfo; workspaceLandingPage?: string }>("/auth/preferences", {
        method: "PATCH",
        json: payload,
      });
    },
    onSuccess: (data) => {
      if (data.user) applyUser(data.user);
      applyTheme(prefs.theme, { persist: true });
      applyReduceMotion(prefs.reduceMotion);
      toast({ kind: "success", title: "Preferências salvas com sucesso." });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Erro ao salvar", description: e.message }),
  });

  if (!user) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── 1. APARÊNCIA ── */}
      <AccountSurface title="Aparência" description="Personalize o tema e as transições visuais da plataforma." flush>
        {/* Tema */}
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold tracking-tight text-ink dark:text-zinc-100">Tema da interface</p>
            <p className="mt-0.5 text-[12.5px] text-ink-muted dark:text-zinc-400">
              Escolha entre o modo claro, escuro ou sincronizado com o sistema operacional.
            </p>
          </div>
          <div className="inline-flex shrink-0 items-center rounded-xl border border-black/[0.06] bg-black/[0.03] p-1 dark:border-white/[0.08] dark:bg-white/[0.04]">
            {(
              [
                { id: "system" as const, label: "Sistema", Icon: Monitor },
                { id: "light" as const, label: "Claro", Icon: Sun },
                { id: "dark" as const, label: "Escuro", Icon: Moon },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleThemeChange(id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all duration-180 ease-out active:scale-[0.985]",
                  prefs.theme === id
                    ? "bg-white text-ink shadow-xs dark:bg-[#1f222e] dark:text-white"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                )}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Reduzir animações */}
        <AccountRow
          icon={ZapOff}
          title="Reduzir animações"
          description="Diminui transições e movimentos na interface para maior conforto visual ou desempenho."
          control={
            <Switch
              id="pref-reduce-motion"
              aria-label="Reduzir animações"
              checked={prefs.reduceMotion}
              onChange={handleReduceMotionChange}
              className="py-0"
            />
          }
        />
      </AccountSurface>

      {/* ── 2. NAVEGAÇÃO ── */}
      <AccountSurface title="Navegação" description="Configure os atalhos e a página inicial ao acessar a plataforma." flush>
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black/[0.03] text-ink-muted dark:bg-white/[0.04] dark:text-zinc-400">
              <Compass className="h-4 w-4" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold tracking-tight text-ink dark:text-zinc-100">Página inicial</p>
              <p className="mt-0.5 text-[12.5px] text-ink-muted dark:text-zinc-400">
                {isSuperadmin
                  ? "Destino padrão ao acessar o painel administrativo da plataforma."
                  : "Destino padrão exibido após autenticação no workspace desta empresa."}
              </p>
            </div>
          </div>

          <div className="shrink-0 sm:w-64">
            {isSuperadmin ? (
              <select
                id="pref-admin-landing"
                aria-label="Página inicial administrativa"
                value={prefs.adminLandingPage}
                onChange={(e) => setPrefs((p) => ({ ...p, adminLandingPage: e.target.value }))}
                className="input h-9.5 w-full text-[13px] bg-[var(--surface-raised)]"
              >
                {ADMIN_LANDING_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <select
                id="pref-workspace-landing"
                aria-label="Página inicial do workspace"
                value={prefs.workspaceLandingPage}
                onChange={(e) => setPrefs((p) => ({ ...p, workspaceLandingPage: e.target.value }))}
                className="input h-9.5 w-full text-[13px] bg-[var(--surface-raised)]"
              >
                {WORKSPACE_LANDING_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </AccountSurface>

      {/* ── 3. NOTIFICAÇÕES (Máximo 5 opções úteis) ── */}
      <AccountSurface
        title="Notificações"
        description="Defina quais avisos, sons e alertas você deseja receber na plataforma."
        flush
      >
        <AccountRow
          icon={MessagesSquare}
          title="Conversas atribuídas"
          description="Receba avisos imediatos quando um atendimento for transferido ou direcionado a você."
          control={
            <Switch
              id="pref-assigned"
              aria-label="Notificar conversas atribuídas"
              checked={prefs.notifyAssigned}
              onChange={(notifyAssigned) => setPrefs((p) => ({ ...p, notifyAssigned }))}
              className="py-0"
            />
          }
        />
        <AccountRow
          icon={AtSign}
          title="Menções e notas"
          description="Receba avisos quando colegas mencionarem seu usuário em conversas ou notas internas."
          control={
            <Switch
              id="pref-mentions"
              aria-label="Notificar menções"
              checked={prefs.notifyMentions}
              onChange={(notifyMentions) => setPrefs((p) => ({ ...p, notifyMentions }))}
              className="py-0"
            />
          }
        />
        <AccountRow
          icon={ShieldAlert}
          title="Alertas de segurança"
          description="Seja notificado sobre novos logins a partir de aparelhos ou locais não habituais."
          control={
            <Switch
              id="pref-security"
              aria-label="Alertas de segurança"
              checked={prefs.notifySecurity}
              onChange={(notifySecurity) => setPrefs((p) => ({ ...p, notifySecurity }))}
              className="py-0"
            />
          }
        />
        <AccountRow
          icon={Volume2}
          title="Som das notificações"
          description="Reproduz um aviso sonoro para novas notificações enquanto o NexaFlow estiver aberto."
          control={
            <div className="flex items-center gap-2">
              <Switch
                id="pref-sound"
                aria-label="Som das notificações"
                checked={prefs.notificationSound}
                onChange={(notificationSound) => {
                  setPrefs((p) => ({ ...p, notificationSound }));
                  if (notificationSound) playNotificationChime();
                }}
                className="py-0"
              />
            </div>
          }
        />
        <AccountRow
          icon={Bell}
          title="Notificações do navegador"
          description={
            notificationSupport === "unsupported"
              ? "Não disponível neste navegador."
              : notificationSupport === "denied"
                ? "Bloqueado pelo navegador. Habilite nas permissões do site para receber alertas."
                : "Mostra alertas do NexaFlow no sistema operacional quando permitido pelo navegador."
          }
          control={
            <Switch
              id="pref-browser-notifications"
              aria-label="Notificações do navegador"
              disabled={notificationSupport === "unsupported"}
              checked={prefs.browserNotificationsEnabled && notificationSupport !== "denied"}
              onChange={handleBrowserNotificationsToggle}
              className="py-0"
            />
          }
        />
      </AccountSurface>

      <AccountSaveBar
        dirty={dirty}
        saving={savePrefs.isPending}
        onSave={() => savePrefs.mutate()}
        onDiscard={handleDiscard}
      />
    </div>
  );
}
