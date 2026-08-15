"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  AtSign,
  MessagesSquare,
  Monitor,
  Moon,
  ShieldAlert,
  Sun,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Spinner, Switch, useToast } from "@/components/ui";
import { useAuth, type UserInfo } from "@/store/auth";
import { applyTheme, getStoredThemePreference, type ThemePreference } from "@/lib/theme";
import { applyUser } from "../account-utils";
import {
  AccountRow,
  AccountSaveBar,
  AccountSurface,
} from "../account-ui";

export default function AccountPreferencesPage() {
  const user = useAuth((s) => s.user);
  const { toast } = useToast();

  const [prefs, setPrefs] = useState({
    theme: (user?.preferences?.theme || getStoredThemePreference() || "system") as ThemePreference,
    notifyMentions: user?.preferences?.notifyMentions !== false,
    notifyAssigned: user?.preferences?.notifyAssigned !== false,
    notifySecurity: user?.preferences?.notifySecurity !== false,
  });

  useEffect(() => {
    const userTheme = (user?.preferences?.theme || getStoredThemePreference() || "system") as ThemePreference;
    setPrefs({
      theme: userTheme,
      notifyMentions: user?.preferences?.notifyMentions !== false,
      notifyAssigned: user?.preferences?.notifyAssigned !== false,
      notifySecurity: user?.preferences?.notifySecurity !== false,
    });
  }, [user?.preferences]);

  const baseline = useMemo(
    () => ({
      theme: (user?.preferences?.theme || getStoredThemePreference() || "system") as ThemePreference,
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

  useEffect(() => {
    return () => {
      // Restaura o tema salvo no localStorage caso o usuário saia sem salvar
      const saved = getStoredThemePreference();
      applyTheme(saved);
    };
  }, []);

  function handleThemeChange(id: ThemePreference) {
    setPrefs((p) => ({ ...p, theme: id }));
    // Live preview imediato do tema escolhido
    applyTheme(id, { persist: false });
  }

  function handleDiscard() {
    setPrefs(baseline);
    // Restaura o tema salvo
    applyTheme(baseline.theme, { persist: true });
  }

  const savePrefs = useMutation({
    mutationFn: () =>
      api<{ user: UserInfo }>("/auth/profile", {
        method: "PATCH",
        json: { preferences: prefs },
      }),
    onSuccess: (data) => {
      if (data.user) applyUser(data.user);
      applyTheme(prefs.theme, { persist: true });
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
      <AccountSurface title="Aparência" description="Personalize a experiência visual da plataforma." flush>
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
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all",
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
      </AccountSurface>

      <AccountSurface
        title="Notificações"
        description="Defina quais avisos e alertas você deseja receber na plataforma."
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
