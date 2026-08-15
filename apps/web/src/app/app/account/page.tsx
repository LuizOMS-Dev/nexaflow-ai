"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Camera,
  Check,
  ChevronDown,
  ImageIcon,
  Palette,
  Trash2,
  Type,
} from "lucide-react";
import { api, getAccessToken } from "@/lib/api";
import {
  AVATAR_COLOR_OPTIONS,
  processAvatarFile,
  presetUrl,
  type AvatarType,
} from "@/lib/avatar";
import { cn } from "@/lib/utils";
import { Modal, Spinner, useToast } from "@/components/ui";
import { UserAvatar } from "@/components/user-avatar";
import { useAuth, type UserInfo } from "@/store/auth";
import { AccountPanel } from "./account-ui";

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
  const photoMenuRef = useRef<HTMLDivElement>(null);

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
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);

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

  useEffect(() => {
    if (!photoMenuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!photoMenuRef.current?.contains(e.target as Node)) {
        setPhotoMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [photoMenuOpen]);

  const liveUser: UserInfo | null = user
    ? {
        ...user,
        name: name || user.name,
        ...(preview || {}),
      }
    : null;

  const presetsQuery = useQuery({
    queryKey: ["avatar-presets"],
    queryFn: () =>
      api<{ presets: Preset[]; colors: Array<{ id: string; hex: string; label: string }> }>(
        "/auth/avatar/presets"
      ),
    staleTime: 60_000,
  });

  const saveName = useMutation({
    mutationFn: () =>
      api<{ user: UserInfo; message: string }>("/auth/profile", {
        method: "PATCH",
        json: { name: name.trim(), phone: phone.trim() || null },
      }),
    onSuccess: (data) => {
      if (data.user) applyUser(data.user);
      toast({ kind: "success", title: "Alterações salvas." });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível salvar", description: e.message }),
  });

  const uploadMut = useMutation({
    mutationFn: (image: string) =>
      api<{ user: UserInfo; message: string }>("/auth/avatar/upload", {
        method: "POST",
        json: { image },
      }),
    onSuccess: (data) => {
      if (data.user) applyUser(data.user);
      setPreview(null);
      toast({ kind: "success", title: "Foto atualizada." });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Upload falhou", description: e.message }),
  });

  const initialsMut = useMutation({
    mutationFn: (color?: string) =>
      api<{ user: UserInfo; message: string }>("/auth/avatar/initials", {
        method: "POST",
        json: color ? { color } : {},
      }),
    onSuccess: (data) => {
      if (data.user) applyUser(data.user);
      setPreview(null);
      setColorPickerOpen(false);
      toast({ kind: "success", title: "Avatar atualizado." });
    },
    onError: (e: Error) => toast({ kind: "error", title: "Erro", description: e.message }),
  });

  const presetMut = useMutation({
    mutationFn: (presetId: string) =>
      api<{ user: UserInfo; message: string }>("/auth/avatar/preset", {
        method: "POST",
        json: { presetId },
      }),
    onSuccess: (data) => {
      if (data.user) applyUser(data.user);
      setPreview(null);
      setPickerOpen(false);
      setPickedPreset(null);
      toast({ kind: "success", title: "Avatar atualizado." });
    },
    onError: (e: Error) => toast({ kind: "error", title: "Erro", description: e.message }),
  });

  const removeMut = useMutation({
    mutationFn: () =>
      api<{ user: UserInfo; message: string }>("/auth/avatar", { method: "DELETE" }),
    onSuccess: (data) => {
      if (data.user) applyUser(data.user);
      setPreview(null);
      toast({ kind: "success", title: "Foto removida." });
    },
    onError: (e: Error) => toast({ kind: "error", title: "Erro", description: e.message }),
  });

  async function onPickFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    setPhotoMenuOpen(false);
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
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function useInitials(color?: string) {
    setPhotoMenuOpen(false);
    setPreview({
      avatarType: "INITIALS",
      avatarUrl: null,
      avatarPresetId: null,
      avatarColor: color || user?.avatarColor || "#6366F1",
    });
    initialsMut.mutate(color || user?.avatarColor || undefined);
  }

  function openPicker() {
    setPhotoMenuOpen(false);
    setPickedPreset(user?.avatarPresetId || null);
    setPickerOpen(true);
  }

  function openColorPicker() {
    setPhotoMenuOpen(false);
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
    if (!name.trim() || name.trim().length < 2) {
      toast({ kind: "error", title: "Nome inválido", description: "Informe ao menos 2 caracteres." });
      return;
    }
    saveName.mutate();
  }

  function discard() {
    setName(user?.name || "");
    setPhone(user?.phone || "");
  }

  if (!user || !liveUser) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  const busy =
    uploading ||
    uploadMut.isPending ||
    initialsMut.isPending ||
    presetMut.isPending ||
    removeMut.isPending;

  const showRemove = user.avatarType === "UPLOAD" || preview?.avatarType === "UPLOAD";

  const dirty =
    name.trim() !== (user.name || "").trim() ||
    (phone.trim() || "") !== (user.phone || "").trim();

  const roleLabel =
    user.platformRole === "SUPERADMIN"
      ? "Super Administrador"
      : memberships[0]?.role === "ADMIN"
        ? "Administrador"
        : memberships[0]?.role === "SUPERVISOR"
          ? "Supervisor"
          : "Membro";

  return (
    <AccountPanel>
      {/* 1. Header do Perfil: Avatar + Nome + E-mail + Cargo (Apenas uma vez) */}
      <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4 min-w-0">
          <div className="relative shrink-0">
            <UserAvatar user={liveUser} size="xl" ring />
            {busy ? (
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                <Spinner className="h-5 w-5 text-white" />
              </span>
            ) : null}
          </div>

          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold tracking-tight text-ink dark:text-white">
              {liveUser.name}
            </h2>
            <p className="truncate text-xs text-ink-muted dark:text-zinc-400">
              {user.email}
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                {roleLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Ação Alterar Foto / Avatar (dropdown com opções organizadas) */}
        <div className="relative shrink-0" ref={photoMenuRef}>
          <button
            type="button"
            className="btn-secondary h-8 px-3 text-xs"
            disabled={busy}
            aria-expanded={photoMenuOpen}
            aria-haspopup="menu"
            onClick={() => setPhotoMenuOpen((v) => !v)}
          >
            <Camera className="h-3.5 w-3.5" strokeWidth={1.75} />
            Alterar foto
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 opacity-60 transition-transform",
                photoMenuOpen && "rotate-180"
              )}
              strokeWidth={1.75}
            />
          </button>

          {photoMenuOpen ? (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-1.5 w-48 overflow-hidden rounded-xl border border-black/[0.06] bg-white py-1 shadow-lg dark:border-white/[0.08] dark:bg-zinc-800"
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-ink-secondary hover:bg-black/[0.03] dark:text-zinc-300 dark:hover:bg-white/[0.05]"
                onClick={() => {
                  setPhotoMenuOpen(false);
                  fileRef.current?.click();
                }}
              >
                <Camera className="h-3.5 w-3.5 shrink-0 text-ink-muted dark:text-zinc-400" strokeWidth={1.75} />
                Enviar foto
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-ink-secondary hover:bg-black/[0.03] dark:text-zinc-300 dark:hover:bg-white/[0.05]"
                onClick={openPicker}
              >
                <ImageIcon className="h-3.5 w-3.5 shrink-0 text-ink-muted dark:text-zinc-400" strokeWidth={1.75} />
                Escolher avatar
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-ink-secondary hover:bg-black/[0.03] dark:text-zinc-300 dark:hover:bg-white/[0.05]"
                onClick={openColorPicker}
              >
                <Palette className="h-3.5 w-3.5 shrink-0 text-ink-muted dark:text-zinc-400" strokeWidth={1.75} />
                Cor das iniciais
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-ink-secondary hover:bg-black/[0.03] dark:text-zinc-300 dark:hover:bg-white/[0.05]"
                onClick={() => useInitials()}
              >
                <Type className="h-3.5 w-3.5 shrink-0 text-ink-muted dark:text-zinc-400" strokeWidth={1.75} />
                Restaurar padrão
              </button>
              {showRemove ? (
                <>
                  <div className="my-1 h-px bg-black/[0.05] dark:bg-white/[0.06]" />
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                    onClick={() => {
                      setPhotoMenuOpen(false);
                      removeMut.mutate();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                    Remover foto
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => void onPickFile(e.target.files?.[0] || null)}
          />
        </div>
      </div>

      {/* 2. Informações Pessoais Form */}
      <div className="p-6">
        <h3 className="text-xs font-bold uppercase tracking-wider text-ink-faint dark:text-zinc-500 mb-4">
          Informações Pessoais
        </h3>

        <form onSubmit={onSubmitName} className="space-y-4 max-w-lg">
          <div>
            <label className="label text-xs font-medium" htmlFor="account-name">
              Nome completo
            </label>
            <input
              id="account-name"
              className="input mt-1 h-9 text-xs"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
              autoComplete="name"
              maxLength={80}
            />
          </div>

          <div>
            <label className="label text-xs font-medium" htmlFor="account-phone">
              Telefone
            </label>
            <input
              id="account-phone"
              className="input mt-1 h-9 text-xs"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Opcional"
              autoComplete="tel"
            />
          </div>

          <div>
            <label className="label text-xs font-medium" htmlFor="account-email">
              E-mail de acesso
            </label>
            <div className="relative mt-1">
              <input
                id="account-email"
                className="input h-9 pr-24 text-xs opacity-80"
                value={user.email}
                disabled
                readOnly
                title="E-mail de login — não editável"
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded bg-black/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-ink-muted dark:bg-white/[0.06] dark:text-zinc-400">
                Não editável
              </span>
            </div>
          </div>

          {dirty ? (
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                className="btn-secondary h-8 px-3 text-xs"
                onClick={discard}
                disabled={saveName.isPending}
              >
                Descartar
              </button>
              <button
                type="submit"
                className="btn-primary h-8 px-4 text-xs bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500"
                disabled={saveName.isPending}
              >
                {saveName.isPending ? "Salvando…" : "Salvar alterações"}
              </button>
            </div>
          ) : null}
        </form>
      </div>

      {/* Modal: Escolher avatar preset */}
      <Modal
        open={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          setPickedPreset(null);
        }}
        title="Escolher avatar ilustrado"
        size="lg"
        variant="quick"
        initialFocus="panel"
        footer={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="btn-secondary h-8 px-3 text-xs"
              onClick={() => {
                setPickerOpen(false);
                setPickedPreset(null);
                setPreview(null);
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary h-8 px-4 text-xs bg-violet-600 hover:bg-violet-700"
              disabled={!pickedPreset || presetMut.isPending}
              onClick={confirmPreset}
            >
              {presetMut.isPending ? "Salvando…" : "Salvar avatar"}
            </button>
          </div>
        }
      >
        {presetsQuery.isLoading && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}

        {presetsQuery.data && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {presetsQuery.data.presets.map((p) => {
              const selected = pickedPreset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPickedPreset(p.id);
                    setPreview({
                      avatarType: "NEXA_AVATAR",
                      avatarPresetId: p.id,
                      avatarUrl: p.url || presetUrl(p.id),
                    });
                  }}
                  className={cn(
                    "group relative flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-all duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500",
                    selected
                      ? "border-violet-500/60 bg-violet-500/10 shadow-[0_0_0_1px_rgba(139,92,246,0.3)]"
                      : "border-black/[0.06] hover:border-violet-500/30 hover:bg-black/[0.02] dark:border-white/[0.08] dark:hover:bg-white/[0.03]"
                  )}
                  aria-pressed={selected}
                  aria-label={p.label}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url || presetUrl(p.id)}
                    alt=""
                    className="h-14 w-14 rounded-xl object-cover shadow-xs"
                  />
                  <span className="line-clamp-1 text-[11px] text-ink-muted dark:text-zinc-400">
                    {p.label}
                  </span>
                  {selected ? (
                    <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-white">
                      <Check className="h-3 w-3" strokeWidth={2.5} />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </Modal>

      {/* Modal: Escolher cor das iniciais */}
      <Modal
        open={colorPickerOpen}
        onClose={() => {
          setColorPickerOpen(false);
          setPickedColor(null);
        }}
        title="Escolher cor das iniciais"
        size="sm"
        variant="quick"
        initialFocus="panel"
        footer={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="btn-secondary h-8 px-3 text-xs"
              onClick={() => {
                setColorPickerOpen(false);
                setPickedColor(null);
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary h-8 px-4 text-xs bg-violet-600 hover:bg-violet-700"
              disabled={!pickedColor || initialsMut.isPending}
              onClick={confirmColor}
            >
              {initialsMut.isPending ? "Salvando…" : "Aplicar cor"}
            </button>
          </div>
        }
      >
        <p className="text-xs text-ink-muted dark:text-zinc-400 mb-4">
          Selecione a cor de fundo utilizada quando o seu avatar exibe as iniciais do seu nome.
        </p>

        <div className="flex items-center justify-center gap-3 py-2">
          {AVATAR_COLOR_OPTIONS.map((c) => {
            const selected = (pickedColor || user.avatarColor || "#6366F1").toLowerCase() === c.hex.toLowerCase();
            return (
              <button
                key={c.id}
                type="button"
                title={c.label}
                aria-label={`Cor ${c.label}`}
                aria-pressed={selected}
                onClick={() => setPickedColor(c.hex)}
                className={cn(
                  "h-8 w-8 rounded-full transition-transform duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500",
                  selected
                    ? "scale-110 ring-2 ring-violet-500 ring-offset-2 ring-offset-white dark:ring-offset-zinc-900"
                    : "opacity-85 hover:scale-105 hover:opacity-100"
                )}
                style={{ backgroundColor: c.hex }}
              />
            );
          })}
        </div>
      </Modal>
    </AccountPanel>
  );
}
