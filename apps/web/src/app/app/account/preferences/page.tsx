"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, getAccessToken } from "@/lib/api";
import { Select, Spinner, Switch, useToast } from "@/components/ui";
import { useAuth, type UserInfo } from "@/store/auth";
import {
  AccountPanel,
  AccountPanelHead,
  AccountRow,
} from "../account-ui";

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
      toast({ kind: "success", title: "Alterações salvas." });
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
        {/* Cabeçalho Unificado */}
        <AccountPanelHead
          title="Preferências da Conta"
          subtitle="Personalize a aparência do sistema e suas notificações"
        />

        {/* 1. Aparência */}
        <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-medium text-ink dark:text-zinc-200">Tema da interface</p>
            <p className="mt-0.5 text-xs text-ink-muted dark:text-zinc-400">
              Escolha entre o modo claro, escuro ou sincronizado com o seu sistema operacional.
            </p>
          </div>
          <div className="w-40 shrink-0">
            <Select
              id="pref-theme"
              value={prefs.theme}
              onChange={(theme) =>
                setPrefs((p) => ({
                  ...p,
                  theme: theme as "light" | "dark" | "system",
                }))
              }
              options={[
                { value: "system", label: "Sistema" },
                { value: "light", label: "Claro" },
                { value: "dark", label: "Escuro" },
              ]}
              aria-label="Tema"
            />
          </div>
        </div>

        {/* 2. Notificações */}
        <AccountRow
          title="Conversas atribuídas"
          description="Receba alertas quando uma nova conversa for designada a você"
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
          title="Menções e comentários"
          description="Receba alertas quando for mencionado em mensagens ou notas internas"
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
          title="Alertas de segurança"
          description="Notificações críticas sobre novos logins e alterações em credenciais"
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
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            className="btn-secondary h-8 px-3 text-xs"
            disabled={savePrefs.isPending}
            onClick={() => setPrefs(baseline)}
          >
            Descartar
          </button>
          <button
            type="button"
            className="btn-primary h-8 px-4 text-xs bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500"
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
