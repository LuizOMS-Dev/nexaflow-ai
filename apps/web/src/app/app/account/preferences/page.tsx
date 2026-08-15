"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  AtSign,
  Bell,
  MessagesSquare,
  Monitor,
  Moon,
  ShieldAlert,
  Sun,
} from "lucide-react";
import { api, getAccessToken } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Spinner, Switch, useToast } from "@/components/ui";
import { useAuth, type UserInfo } from "@/store/auth";
import { applyUser } from "../account-utils";
import {
  AccountRow,
  AccountSaveBar,
  AccountSectionTitle,
  AccountSurface,
} from "../account-ui";

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
      toast({ kind: "success", title: "Preferências salvas." });
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
    <>
      <AccountSectionTitle
        title="Preferências"
        description="Aparência do app e alertas da sua conta."
      />

      <AccountSurface title="Aparência" flush>
        <div className="flex flex-col gap-3 border-b border-black/[0.05] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between dark:border-white/[0.06]">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-ink dark:text-zinc-200">Tema</p>
            <p className="mt-0.5 text-[12px] text-ink-muted dark:text-zinc-400">
              Claro, escuro ou conforme o sistema.
            </p>
          </div>
          <div className="inline-flex shrink-0 items-center rounded-xl border border-black/[0.06] bg-black/[0.03] p-1 dark:border-white/[0.08] dark:bg-white/[0.05]">
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
                onClick={() => setPrefs((p) => ({ ...p, theme: id }))}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition-all",
                  prefs.theme === id
                    ? "bg-white text-ink shadow-sm dark:bg-[#1f222e] dark:text-white"
                    : "text-ink-muted hover:text-ink dark:text-zinc-400"
                )}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </AccountSurface>

      <AccountSurface title="Notificações" description="O que você quer receber no painel." flush className="mt-4">
        <AccountRow
          icon={MessagesSquare}
          title="Conversas atribuídas"
          description="Aviso quando um atendimento for direcionado a você."
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
          description="Quando alguém citar seu nome em conversas ou notas internas."
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
          description="Novos logins a partir de dispositivos ou locais diferentes."
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
      </AccountSurface>

      <AccountSaveBar
        dirty={dirty}
        saving={savePrefs.isPending}
        onSave={() => savePrefs.mutate()}
        onDiscard={() => setPrefs(baseline)}
      />
    </>
  );
}
