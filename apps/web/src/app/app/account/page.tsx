"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Camera,
  Check,
  ChevronDown,
  ImageIcon,
  Lock,
  Palette,
  ShieldCheck,
  Trash2,
  Type,
  UserCheck,
} from "lucide-react";
import { api, getAccessToken } from "@/lib/api";
import {
  AVATAR_COLOR_OPTIONS,
  presetUrl,
  processAvatarFile,
  type AvatarType,
} from "@/lib/avatar";
import { cn } from "@/lib/utils";
import {
  Menu,
  MenuItem,
  MenuSeparator,
  Modal,
  Spinner,
  useToast,
} from "@/components/ui";
import { UserAvatar } from "@/components/user-avatar";
import { useAuth, type UserInfo } from "@/store/auth";
import { AccountBody, AccountCard, AccountCardHeader } from "./account-ui";

type Preset = { id: string; label: string; category: string; url: string };

function applyUser(user: UserInfo) {
  const token = getAccessToken() || useAuth.getState().token;
  const { tenant, memberships } = useAuth.getState();
  if (token) {
    useAuth.getState().setSession({ token, user, tenant, memberships });
  } else {
    useAuth.setState({ user });
  }
}

export default function AccountProfilePage() {
  const user = useAuth((s) => s.user);
  const memberships = useAuth((s) => s.memberships) || [];
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [preview, setPreview] = useState<{
    avatarType: AvatarType;
    avatarUrl?: string | null;
    avatarPresetId?: string | null;
    avatarColor?: string | null;
  } | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [pickedPreset, setPickedPreset] = useState<string | null>(null);
  const [pickedColor, setPickedColor] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setName(user?.name || "");
    setPhone(user?.phone || "");
    setPreview(null);
  }, [
    user?.name,
    user?.phone,
    user?.avatarType,
    user?.avatarUrl,
    user?.avatarPresetId,
    user?.avatarColor,
  ]);

  const liveUser: UserInfo | null = user
    ? {
        ...user,
        ...(preview
          ? {
              avatarType: preview.avatarType,
              avatarUrl: preview.avatarUrl ?? null,
              avatarPresetId: preview.avatarPresetId ?? null,
              avatarColor: preview.avatarColor ?? null,
            }
          : {}),
      }
    : null;

  const presetsQuery = useQuery({
    queryKey: ["avatar-presets"],
    queryFn: () => api<Preset[]>("/auth/avatar/presets"),
    staleTime: 60 * 60 * 1000,
  });

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
    onError: (e: Error) => toast({ kind: "error", title: "Erro ao salvar", description: e.message }),
  });

  const uploadMut = useMutation({
    mutationFn: (dataUrl: string) =>
      api<{ user: UserInfo }>("/auth/avatar", {
        method: "POST",
        json: { dataUrl },
      }),
    onSuccess: (data) => {
      setUploading(false);
      setPreview(null);
      if (data.user) applyUser(data.user);
      toast({ kind: "success", title: "Foto atualizada com sucesso." });
    },
    onError: (e: Error) => {
      setUploading(false);
      setPreview(null);
      toast({ kind: "error", title: "Falha no upload", description: e.message });
    },
  });

  const presetMut = useMutation({
    mutationFn: (presetId: string) =>
      api<{ user: UserInfo }>("/auth/avatar/preset", {
        method: "POST",
        json: { presetId },
      }),
    onSuccess: (data) => {
      setPickerOpen(false);
      setPreview(null);
      if (data.user) applyUser(data.user);
      toast({ kind: "success", title: "Avatar atualizado com sucesso." });
    },
    onError: (e: Error) => toast({ kind: "error", title: "Erro", description: e.message }),
  });

  const initialsMut = useMutation({
    mutationFn: (color?: string) =>
      api<{ user: UserInfo }>("/auth/avatar/initials", {
        method: "POST",
        json: color ? { color } : {},
      }),
    onSuccess: (data) => {
      setColorPickerOpen(false);
      setPreview(null);
      if (data.user) applyUser(data.user);
      toast({ kind: "success", title: "Avatar atualizado." });
    },
    onError: (e: Error) => toast({ kind: "error", title: "Erro", description: e.message }),
  });

  const removeMut = useMutation({
    mutationFn: () =>
      api<{ user: UserInfo }>("/auth/avatar", {
        method: "DELETE",
      }),
    onSuccess: (data) => {
      setPreview(null);
      if (data.user) applyUser(data.user);
      toast({ kind: "success", title: "Foto removida com sucesso." });
    },
    onError: (e: Error) => toast({ kind: "error", title: "Erro", description: e.message }),
  });

  async function onPickFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await processAvatarFile(file, 512);
      setPreview({
        avatarType: "UPLOAD",
        avatarUrl: dataUrl,
        avatarPresetId: null,
      });
      await uploadMut.mutateAsync(dataUrl);
    } catch (e) {
      toast({
        kind: "error",
        title: "Imagem inválida",
        description: e instanceof Error ? e.message : "Tente outro arquivo.",
      });
      setUploading(false);
      setPreview(null);
    }
  }

  function useInitials(color?: string) {
    setPreview({
      avatarType: "INITIALS",
      avatarUrl: null,
      avatarPresetId: null,
      avatarColor: color || user?.avatarColor || "#6366F1",
    });
    initialsMut.mutate(color || user?.avatarColor || undefined);
  }

  function openPicker() {
    setPickedPreset(user?.avatarPresetId || null);
    setPickerOpen(true);
  }

  function openColorPicker() {
    setPickedColor(user?.avatarColor || "#6366F1");
    setColorPickerOpen(true);
  }

  function confirmPreset() {
    if (!pickedPreset) return;
    setPreview({
      avatarType: "NEXA_AVATAR",
      avatarPresetId: pickedPreset,
      avatarUrl: presetUrl(pickedPreset),
    });
    presetMut.mutate(pickedPreset);
  }

  function confirmColor() {
    if (!pickedColor) return;
    useInitials(pickedColor);
  }

  function onSubmitName(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast({ kind: "error", title: "O nome não pode ficar vazio." });
      return;
    }
    profileMut.mutate();
  }

  if (!user) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  const isPlatformAdmin = user.platformRole === "SUPERADMIN";
  const membershipRole = memberships[0]?.role;
  const roleLabel = isPlatformAdmin
    ? "Superadministrador"
    : membershipRole === "ADMIN"
      ? "Administrador"
      : membershipRole === "SUPERVISOR"
        ? "Supervisor"
        : membershipRole === "AGENT"
          ? "Atendente"
          : "Membro";

  const showRemove =
    user.avatarType === "UPLOAD" ||
    user.avatarType === "NEXA_AVATAR" ||
    Boolean(user.avatarUrl) ||
    Boolean(user.avatarPresetId);

  const busy =
    uploading ||
    uploadMut.isPending ||
    presetMut.isPending ||
    initialsMut.isPending ||
    removeMut.isPending;

  const isDirty = name !== (user.name || "") || phone !== (user.phone || "");

  return (
    <div className="space-y-6">
      <AccountCard>
        {/* ── 1. Topo: Identidade do Usuário & Ação Alterar Foto ── */}
        <div className="p-6 sm:p-7">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
            <div className="flex items-start gap-4 sm:gap-5 min-w-0">
              {/* Avatar 64px com borda sutil e foco */}
              <div className="relative shrink-0">
                {liveUser ? (
                  <UserAvatar
                    user={liveUser}
                    size="xl"
                    className="!h-16 !w-16 !text-lg rounded-2xl ring-2 ring-violet-500/20 shadow-md transition-transform"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-2xl bg-zinc-800 animate-pulse" />
                )}
                {busy && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/60 backdrop-blur-xs">
                    <Spinner className="h-5 w-5 text-white" />
                  </div>
                )}
              </div>

              {/* Hierarquia Vertical: Nome -> E-mail -> Cargo */}
              <div className="min-w-0 flex-1 pt-0.5">
                <h2 className="font-display text-lg font-bold tracking-tight text-ink dark:text-white sm:text-xl truncate">
                  {user.name}
                </h2>

                {user.email ? (
                  <p className="mt-0.5 text-xs text-ink-muted dark:text-zinc-400 truncate">
                    {user.email}
                  </p>
                ) : null}

                <div className="mt-2.5">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-violet-500/10 dark:bg-violet-400/15 px-2.5 py-0.5 text-[11px] font-semibold text-violet-700 dark:text-violet-300">
                    <ShieldCheck className="h-3 w-3" strokeWidth={2} />
                    {roleLabel}
                  </span>
                </div>
              </div>
            </div>

            {/* Ação Alterar Foto (Menu do Design System) */}
            <div className="relative shrink-0 self-start">
              <Menu
                align="right"
                minWidth={210}
                trigger={
                  <button
                    type="button"
                    className="btn-secondary h-8 px-3 text-xs font-medium gap-1.5 shadow-xs"
                    disabled={busy}
                  >
                    <Camera className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" strokeWidth={1.75} />
                    <span>Alterar foto</span>
                    <ChevronDown className="h-3 w-3 opacity-60" strokeWidth={1.75} />
                  </button>
                }
              >
                <MenuItem icon={Camera} onClick={() => fileRef.current?.click()}>
                  Enviar imagem
                </MenuItem>
                <MenuItem icon={ImageIcon} onClick={openPicker}>
                  Escolher avatar
                </MenuItem>
                <MenuItem icon={Palette} onClick={openColorPicker}>
                  Cor das iniciais
                </MenuItem>

                <MenuSeparator />

                <MenuItem icon={Type} onClick={() => useInitials()}>
                  Restaurar padrão
                </MenuItem>

                {showRemove ? (
                  <>
                    <MenuSeparator />
                    <MenuItem icon={Trash2} danger onClick={() => removeMut.mutate()}>
                      Remover foto
                    </MenuItem>
                  </>
                ) : null}
              </Menu>

              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => void onPickFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
        </div>

        {/* ── 2. Formulário de Informações Pessoais ── */}
        <AccountBody className="space-y-6">
          <div>
            <h3 className="text-[14px] font-semibold tracking-tight text-ink dark:text-zinc-100">
              Informações pessoais
            </h3>
            <p className="mt-0.5 text-xs text-ink-muted dark:text-zinc-400">
              Seus dados de exibição nas conversas e painéis da plataforma.
            </p>
          </div>

          <form onSubmit={onSubmitName} className="space-y-5">
            {/* Grid 2 Colunas: Nome Completo & Telefone */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
              <div className="flex flex-col">
                <label className="label text-xs font-medium text-ink-secondary dark:text-zinc-300" htmlFor="account-name">
                  Nome completo
                </label>
                <input
                  id="account-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input h-9 text-xs sm:text-[13px] mt-1.5 w-full font-medium"
                  placeholder="Seu nome completo"
                />
              </div>

              <div className="flex flex-col">
                <label className="label text-xs font-medium text-ink-secondary dark:text-zinc-300" htmlFor="account-phone">
                  Telefone / WhatsApp
                </label>
                <input
                  id="account-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="input h-9 text-xs sm:text-[13px] mt-1.5 w-full font-medium"
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>

            {/* Linha de Largura Total: E-mail de acesso */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between">
                <label className="label text-xs font-medium text-ink-secondary dark:text-zinc-300" htmlFor="account-email">
                  E-mail de acesso
                </label>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted dark:text-zinc-400">
                  <Lock className="h-3 w-3 opacity-70" />
                  Não editável
                </span>
              </div>
              <div className="relative mt-1.5 w-full">
                <input
                  id="account-email"
                  type="email"
                  disabled
                  value={user.email || ""}
                  className="input h-9 text-xs sm:text-[13px] w-full cursor-not-allowed bg-black/[0.02] dark:bg-white/[0.02] text-ink-muted dark:text-zinc-400 font-medium"
                />
              </div>
              <p className="mt-1 text-[11px] text-ink-faint dark:text-zinc-500">
                O e-mail é a chave primária da sua conta e não pode ser alterado diretamente por aqui.
              </p>
            </div>

            {/* Rodapé de Ação */}
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="btn-primary h-8.5 px-4 text-xs font-medium bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500 shadow-xs shadow-violet-500/25"
                disabled={profileMut.isPending || !isDirty}
              >
                {profileMut.isPending ? (
                  <>
                    <Spinner className="h-3.5 w-3.5 mr-1.5" />
                    <span>Salvando…</span>
                  </>
                ) : (
                  <span>Salvar alterações</span>
                )}
              </button>
            </div>
          </form>
        </AccountBody>
      </AccountCard>

      {/* ── Modal de Seleção de Avatar Ilustrado ── */}
      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Escolher avatar ilustrado"
        size="md"
      >
        <p className="text-xs text-ink-muted dark:text-zinc-400 mb-4">
          Selecione um dos avatares ilustrados oficiais do NexaFlow para sua identidade.
        </p>

        {presetsQuery.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3 max-h-72 overflow-y-auto p-1">
            {(presetsQuery.data || []).map((preset) => {
              const isSelected = pickedPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setPickedPreset(preset.id)}
                  className={cn(
                    "relative flex flex-col items-center rounded-2xl p-2.5 transition-all",
                    "border border-black/[0.06] dark:border-white/[0.08]",
                    isSelected
                      ? "bg-violet-500/10 border-violet-500 ring-2 ring-violet-500/40 shadow-sm"
                      : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preset.url}
                    alt={preset.label}
                    className="h-12 w-12 rounded-xl object-cover"
                  />
                  <span className="mt-1.5 text-[10.5px] font-medium text-ink dark:text-zinc-300 truncate w-full text-center">
                    {preset.label}
                  </span>
                  {isSelected && (
                    <div className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-violet-600 text-white shadow-xs">
                      <Check className="h-2.5 w-2.5" strokeWidth={2.5} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-black/[0.06] dark:border-white/[0.08]">
          <button
            type="button"
            className="btn-secondary h-8.5 px-3 text-xs"
            onClick={() => setPickerOpen(false)}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary h-8.5 px-4 text-xs bg-violet-600 hover:bg-violet-700"
            disabled={!pickedPreset || presetMut.isPending}
            onClick={confirmPreset}
          >
            {presetMut.isPending ? "Aplicando…" : "Confirmar avatar"}
          </button>
        </div>
      </Modal>

      {/* ── Modal de Seleção de Cor de Iniciais ── */}
      <Modal
        open={colorPickerOpen}
        onClose={() => setColorPickerOpen(false)}
        title="Cor de fundo das iniciais"
      >
        <p className="text-xs text-ink-muted dark:text-zinc-400 mb-4">
          Escolha o tom de destaque para exibir ao redor das letras iniciais do seu nome.
        </p>

        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 py-2">
          {AVATAR_COLOR_OPTIONS.map((c) => {
            const isSelected = pickedColor === c.hex || pickedColor === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setPickedColor(c.hex)}
                className={cn(
                  "flex items-center gap-2 rounded-xl p-2 transition-all border border-black/[0.06] dark:border-white/[0.08]",
                  isSelected
                    ? "bg-violet-500/10 border-violet-500 ring-2 ring-violet-500/40"
                    : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                )}
              >
                <span
                  className="h-6 w-6 rounded-lg shrink-0 shadow-xs"
                  style={{ backgroundColor: c.hex }}
                />
                <span className="text-[11px] font-medium text-ink dark:text-zinc-200 truncate">
                  {c.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-black/[0.06] dark:border-white/[0.08]">
          <button
            type="button"
            className="btn-secondary h-8.5 px-3 text-xs"
            onClick={() => setColorPickerOpen(false)}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary h-8.5 px-4 text-xs bg-violet-600 hover:bg-violet-700"
            disabled={!pickedColor || initialsMut.isPending}
            onClick={confirmColor}
          >
            {initialsMut.isPending ? "Salvando…" : "Aplicar cor"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
