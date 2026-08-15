"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  AtSign,
  Bell,
  MessagesSquare,
  Monitor,
  Moon,
  Palette,
  ShieldAlert,
  SlidersHorizontal,
  Sun,
} from "lucide-react";
import { api, getAccessToken } from "@/lib/api";
import { Spinner, Switch, useToast } from "@/components/ui";
import { useAuth, type UserInfo } from "@/store/auth";
import {
  AccountPanel,
  AccountPanelHead,
  AccountRow,
} from "../account-ui";
import { cn } from "@/lib/utils";

function applyUser(user: UserInfo) {
  const token = getAccessToken() || useAuth.getState().token;
  const { tenant, memberships } = useAuth.getState();
  if (token) {
    useAuth.getState().setSession({ token, user, tenant, memberships });
  } else {
    useAuth.setState({ user });
  }
}

export default function AccountPreferencesPage() {
  const user = useAuth((s) => s.user);
  const { toast } = useToast();

  const [prefs, setPrefs] = useState({
    theme: (user?.preferences?.theme || "system") as "light" | "dark" | "system",
    notifyMentions: user?.preferences?.notifyMentions !== false,
    notifyAssigned: user?.preferences?.notifyAssigned !== false,
    notifySecurity: user?.preferences?.notifySecurity !== false,
  });

  useEffect(() => {
    setPrefs({
      theme: (user?.preferences?.theme || "system") as "light" | "dark" | "system",
      notifyMentions: user?.preferences?.notifyMentions !== false,
      notifyAssigned: user?.preferences?.notifyAssigned !== false,
      notifySecurity: user?.preferences?.notifySecurity !== false,
    });
  }, [user?.preferences]);

  const baseline = useMemo(
    () => ({
      theme: (user?.preferences?.theme || "system") as "light" | "dark" | "system",
      notifyMentions: user?.preferences?.notifyMentions !== false,
      notifyAssigned: user?.preferences?.notifyAssigned !== false,
      notifySecurity: user?.preferences?.notifySecurity !== false,
    }),
    [user?.preferences]
  );

  const dirty =
    prefs.theme !== baseline.theme ||
    prefs.notifyMentions !== baseline.notifyMentions ||
    prefs.notifyAssigned !== baseline.notifyAssigned ||
    prefs.notifySecurity !== baseline.notifySecurity;

  const savePrefs = useMutation({
    mutationFn: () =>
      api<{ user: UserInfo }>("/auth/profile", {
        method: "PATCH",
        json: { preferences: prefs },
      }),
    onSuccess: (data) => {
      if (data.user) applyUser(data.user);
      if (prefs.theme === "dark" || prefs.theme === "light") {
        document.documentElement.classList.toggle("dark", prefs.theme === "dark");
        localStorage.setItem("nexaflow_theme", prefs.theme);
      } else {
        localStorage.removeItem("nexaflow_theme");
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        document.documentElement.classList.toggle("dark", prefersDark);
      }
      toast({ kind: "success", title: "Preferências atualizadas com sucesso." });
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
    <div className="space-y-4">
      <AccountPanel>
        {/* Cabeçalho Geral da Página */}
        <AccountPanelHead
          title="Preferências do sistema"
          subtitle="Configure a interface visual e os canais de notificação da sua conta"
          icon={SlidersHorizontal}
        />

        {/* ── SEÇÃO 1: APARÊNCIA ── */}
        <div className="bg-black/[0.015] dark:bg-white/[0.015] px-6 py-2.5 border-b border-black/[0.05] dark:border-white/[0.06]">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-violet-700 dark:text-violet-300">
            Aparência da interface
          </span>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:py-6 hover:bg-black/[0.01] dark:hover:bg-white/[0.015] transition-colors">
          <div className="flex items-start gap-4 min-w-0 flex-1">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/[0.035] text-ink-muted dark:bg-white/[0.06] dark:text-zinc-300 shadow-xs">
              <Palette className="h-4.5 w-4.5" strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium text-ink dark:text-zinc-200">Tema do aplicativo</p>
              <p className="mt-0.5 text-xs text-ink-muted dark:text-zinc-400 leading-relaxed">
                Selecione o modo visual claro, escuro ou sincronizado automaticamente com seu dispositivo.
              </p>
            </div>
          </div>

          {/* Segmented Control: Sistema, Claro, Escuro */}
          <div className="inline-flex shrink-0 items-center rounded-xl bg-black/[0.04] p-1 dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] shadow-xs">
            <button
              type="button"
              onClick={() => setPrefs((p) => ({ ...p, theme: "system" }))}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150",
                prefs.theme === "system"
                  ? "bg-white text-ink shadow-sm font-semibold dark:bg-[#1f222e] dark:text-white"
                  : "text-ink-secondary hover:text-ink dark:text-zinc-400 dark:hover:text-zinc-200"
              )}
            >
              <Monitor className="h-3.5 w-3.5" strokeWidth={prefs.theme === "system" ? 2 : 1.75} />
              <span>Sistema</span>
            </button>
            <button
              type="button"
              onClick={() => setPrefs((p) => ({ ...p, theme: "light" }))}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150",
                prefs.theme === "light"
                  ? "bg-white text-ink shadow-sm font-semibold dark:bg-[#1f222e] dark:text-white"
                  : "text-ink-secondary hover:text-ink dark:text-zinc-400 dark:hover:text-zinc-200"
              )}
            >
              <Sun className="h-3.5 w-3.5" strokeWidth={prefs.theme === "light" ? 2 : 1.75} />
              <span>Claro</span>
            </button>
            <button
              type="button"
              onClick={() => setPrefs((p) => ({ ...p, theme: "dark" }))}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150",
                prefs.theme === "dark"
                  ? "bg-white text-ink shadow-sm font-semibold dark:bg-[#1f222e] dark:text-white"
                  : "text-ink-secondary hover:text-ink dark:text-zinc-400 dark:hover:text-zinc-200"
              )}
            >
              <Moon className="h-3.5 w-3.5" strokeWidth={prefs.theme === "dark" ? 2 : 1.75} />
              <span>Escuro</span>
            </button>
          </div>
        </div>

        {/* ── SEÇÃO 2: NOTIFICAÇÕES ── */}
        <div className="bg-black/[0.015] dark:bg-white/[0.015] px-6 py-2.5 border-b border-black/[0.05] dark:border-white/[0.06]">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-violet-700 dark:text-violet-300">
            Alertas e notificações
          </span>
        </div>

        <AccountRow
          icon={MessagesSquare}
          title="Conversas e chamados atribuídos"
          description="Receba avisos instantâneos quando um novo atendimento for direcionado a você"
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
          title="Menções e notas internas"
          description="Seja notificado quando outro membro da equipe citar seu nome em notas ou mensagens"
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
          title="Alertas de segurança e novos logins"
          description="Notificações imediatas sobre novos acessos a partir de dispositivos não reconhecidos"
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
      </AccountPanel>

      {dirty ? (
        <div className="flex justify-end gap-2.5 pt-2">
          <button
            type="button"
            className="btn-secondary h-8.5 px-3.5 text-xs font-medium"
            disabled={savePrefs.isPending}
            onClick={() => setPrefs(baseline)}
          >
            Descartar
          </button>
          <button
            type="button"
            className="btn-primary h-8.5 px-4 text-xs font-medium bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500 shadow-xs shadow-violet-500/25"
            disabled={savePrefs.isPending}
            onClick={() => savePrefs.mutate()}
          >
            {savePrefs.isPending ? "Salvando…" : "Salvar alterações"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
