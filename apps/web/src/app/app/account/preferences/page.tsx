"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Compass, Sparkles, BookOpen, Megaphone } from "lucide-react";
import { api, getAccessToken } from "@/lib/api";
import { Select, Spinner, Switch, useToast } from "@/components/ui";
import { useAuth, type UserInfo } from "@/store/auth";
import { usePlatformTour } from "@/components/platform-tour/platform-tour-controller";
import { openNexaflowAssistant } from "@/lib/nexaflow-assistant";
import Link from "next/link";

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
  const tenant = useAuth((s) => s.tenant);
  const { toast } = useToast();
  const { startManualTour, phase } = usePlatformTour();

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
      }
      toast({ kind: "success", title: "Preferências salvas" });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Erro ao salvar preferências", description: e.message }),
  });

  const isPlatformAdminOnly =
    user?.platformRole === "SUPERADMIN" && !tenant;

  if (!user) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="card p-5 sm:p-6 sm:max-w-lg">
        <div className="mb-4">
          <h2 className="font-display text-[15px] font-semibold text-ink dark:text-white">
            Preferências
          </h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="pref-theme">
              Tema
            </label>
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

          <div className="divide-y divide-line-soft dark:divide-white/[0.06]">
            <Switch
              id="pref-assigned"
              className="py-3"
              label="Conversas atribuídas"
              checked={prefs.notifyAssigned}
              onChange={(notifyAssigned) => setPrefs((p) => ({ ...p, notifyAssigned }))}
            />
            <Switch
              id="pref-mentions"
              className="py-3"
              label="Menções"
              checked={prefs.notifyMentions}
              onChange={(notifyMentions) => setPrefs((p) => ({ ...p, notifyMentions }))}
            />
            <Switch
              id="pref-security"
              className="py-3"
              label="Alertas de segurança"
              checked={prefs.notifySecurity}
              onChange={(notifySecurity) => setPrefs((p) => ({ ...p, notifySecurity }))}
            />
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              className="btn-primary h-9 px-4"
              disabled={savePrefs.isPending}
              onClick={() => savePrefs.mutate()}
            >
              {savePrefs.isPending ? "Salvando…" : "Salvar preferências"}
            </button>
          </div>
        </div>
      </section>

      {!isPlatformAdminOnly ? (
        <section className="card p-5 sm:p-6 sm:max-w-lg">
          <div className="mb-3">
            <h2 className="font-display text-[15px] font-semibold text-ink dark:text-white">
              Ajuda e aprendizado
            </h2>
            <p className="mt-1 text-[12.5px] text-ink-faint">
              Tire dúvidas sobre a plataforma, refaça o tour ou consulte a documentação.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-black/[0.05] bg-black/[0.015] px-3.5 py-3 dark:border-white/[0.07] dark:bg-white/[0.02]">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/[0.12] text-brand-600 dark:text-brand-300">
                  <Sparkles className="h-4 w-4" strokeWidth={1.6} />
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-ink dark:text-white">
                    NIA
                  </p>
                  <p className="text-[11.5px] text-ink-faint">
                    Assistente da NexaFlow — dúvidas, configurações e navegação.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn-secondary h-8 shrink-0 px-3 text-[12.5px]"
                onClick={() => openNexaflowAssistant()}
              >
                Abrir
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-black/[0.05] bg-black/[0.015] px-3.5 py-3 dark:border-white/[0.07] dark:bg-white/[0.02]">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/[0.12] text-brand-600 dark:text-brand-300">
                  <Compass className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <p className="text-[13px] font-medium text-ink dark:text-white">
                  Tour da plataforma
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary h-8 shrink-0 px-3 text-[12.5px]"
                disabled={phase === "touring" || phase === "welcome"}
                onClick={() => {
                  void startManualTour();
                }}
              >
                Iniciar
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-black/[0.05] bg-black/[0.015] px-3.5 py-3 dark:border-white/[0.07] dark:bg-white/[0.02]">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black/[0.04] text-ink-muted dark:bg-white/[0.06]">
                  <BookOpen className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <p className="text-[13px] font-medium text-ink dark:text-white">
                  Documentação da API
                </p>
              </div>
              <Link
                href="/docs/api"
                className="btn-secondary h-8 shrink-0 px-3 text-[12.5px] leading-8"
              >
                Abrir
              </Link>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-black/[0.05] bg-black/[0.015] px-3.5 py-3 dark:border-white/[0.07] dark:bg-white/[0.02]">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/[0.12] text-brand-600 dark:text-brand-300">
                  <Megaphone className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-ink dark:text-white">
                    Novidades da NexaFlow
                  </p>
                  <p className="text-[11.5px] text-ink-faint">
                    Melhorias, recursos e correções da plataforma.
                  </p>
                </div>
              </div>
              <Link
                href="/app/whats-new"
                className="btn-secondary h-8 shrink-0 px-3 text-[12.5px] leading-8"
              >
                Abrir
              </Link>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
