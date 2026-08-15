"use client";

import { FormEvent, useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { api } from "@/lib/api";
import { Spinner, useToast } from "@/components/ui";
import { useAuth, type UserInfo } from "@/store/auth";
import { applyUser } from "./account-utils";
import {
  AccountField,
  AccountSaveBar,
  AccountSectionTitle,
  AccountSurface,
} from "./account-ui";
import { AvatarEditor } from "./avatar-editor";

export default function AccountProfilePage() {
  const user = useAuth((s) => s.user);
  const { toast } = useToast();

  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");

  useEffect(() => {
    setName(user?.name || "");
    setPhone(user?.phone || "");
  }, [user?.name, user?.phone]);

  const profileMut = useMutation({
    mutationFn: () =>
      api<{ user: UserInfo }>("/auth/profile", {
        method: "PATCH",
        json: { name: name.trim(), phone: phone.trim() || null },
      }),
    onSuccess: (data) => {
      if (data.user) applyUser(data.user);
      toast({ kind: "success", title: "Perfil atualizado." });
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

  const isDirty = name !== (user.name || "") || phone !== (user.phone || "");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast({ kind: "error", title: "Informe seu nome." });
      return;
    }
    profileMut.mutate();
  }

  return (
    <>
      <AccountSectionTitle
        title="Perfil"
        description="Foto e dados pessoais exibidos nas conversas e no painel."
      />

      <AccountSurface title="Foto de perfil">
        <AvatarEditor />
      </AccountSurface>

      <form onSubmit={onSubmit}>
        <AccountSurface title="Informações pessoais" className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <AccountField label="Nome completo" htmlFor="account-name">
              <input
                id="account-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input h-9 w-full text-[13px]"
                placeholder="Seu nome completo"
              />
            </AccountField>

            <AccountField label="Telefone / WhatsApp" htmlFor="account-phone">
              <input
                id="account-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input h-9 w-full text-[13px]"
                placeholder="(00) 00000-0000"
              />
            </AccountField>

            <div className="sm:col-span-2">
              <AccountField
                label="E-mail de acesso"
                htmlFor="account-email"
                hint="O e-mail é a chave da sua conta e não pode ser alterado por aqui."
                badge={
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-ink-faint">
                    <Lock className="h-3 w-3" />
                    Bloqueado
                  </span>
                }
              >
                <input
                  id="account-email"
                  type="email"
                  disabled
                  value={user.email || ""}
                  className="input h-9 w-full cursor-not-allowed bg-black/[0.02] text-[13px] text-ink-muted dark:bg-white/[0.02]"
                />
              </AccountField>
            </div>
          </div>
        </AccountSurface>

        <AccountSaveBar
          dirty={isDirty}
          saving={profileMut.isPending}
          onSave={() => profileMut.mutate()}
          onDiscard={() => {
            setName(user.name || "");
            setPhone(user.phone || "");
          }}
        />
      </form>
    </>
  );
}
