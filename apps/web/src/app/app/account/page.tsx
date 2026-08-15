"use client";

import { FormEvent, useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Spinner, useToast } from "@/components/ui";
import { useAuth, type UserInfo } from "@/store/auth";
import { applyUser, getRoleLabel } from "./account-utils";
import {
  AccountField,
  AccountSaveBar,
  AccountSurface,
} from "./account-ui";
import { ProfileAvatarSection } from "./avatar-editor";

export default function AccountProfilePage() {
  const user = useAuth((s) => s.user);
  const memberships = useAuth((s) => s.memberships) || [];
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
      toast({ kind: "success", title: "Perfil atualizado com sucesso." });
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

  const roleLabel = getRoleLabel(user, memberships);
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
      <form onSubmit={onSubmit}>
        <AccountSurface flush>
          {/* Cabeçalho interno do Perfil: Avatar + Nome + E-mail + Cargo + Alterar foto */}
          <ProfileAvatarSection user={user} roleLabel={roleLabel} />

          {/* Divisor interno + Informações pessoais */}
          <div className="border-t border-black/[0.05] dark:border-white/[0.06] p-5 sm:p-6 space-y-5">
            <div>
              <h3 className="text-[14px] font-semibold tracking-tight text-ink dark:text-zinc-100">
                Informações pessoais
              </h3>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-muted dark:text-zinc-400">
                Seus dados de identificação e contato na plataforma.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <AccountField label="Nome completo" htmlFor="account-name">
                <input
                  id="account-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input h-9.5 w-full text-[13px]"
                  placeholder="Seu nome completo"
                />
              </AccountField>

              <AccountField label="Telefone / WhatsApp" htmlFor="account-phone">
                <input
                  id="account-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="input h-9.5 w-full text-[13px]"
                  placeholder="(00) 00000-0000"
                />
              </AccountField>

              <div className="sm:col-span-2">
                <AccountField
                  label="E-mail de acesso"
                  htmlFor="account-email"
                  locked
                  hint="O e-mail é utilizado para login e não pode ser alterado diretamente."
                >
                  <input
                    id="account-email"
                    type="email"
                    disabled
                    value={user.email || ""}
                    className="input h-9.5 w-full cursor-not-allowed bg-black/[0.02] text-[13px] text-ink-muted dark:bg-white/[0.02]"
                  />
                </AccountField>
              </div>
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
