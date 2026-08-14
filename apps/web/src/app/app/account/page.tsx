"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Camera,
  Check,
  ChevronDown,
  ImageIcon,
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
  const [pickedPreset, setPickedPreset] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [showUploadHint, setShowUploadHint] = useState(false);

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
      setShowUploadHint(false);
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

  function confirmPreset() {
    if (!pickedPreset) return;
    setPreview({
      avatarType: "NEXA_AVATAR",
      avatarPresetId: pickedPreset,
      avatarUrl: presetUrl(pickedPreset),
    });
    presetMut.mutate(pickedPreset);
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
  const activeColor = (preview?.avatarColor || user.avatarColor || "#6366F1").toLowerCase();
  const usingInitials =
    (preview?.avatarType || user.avatarType) === "INITIALS" ||
    (!(preview?.avatarType || user.avatarType) && !user.avatarUrl);

  const dirty =
    name.trim() !== (user.name || "").trim() ||
    (phone.trim() || "") !== (user.phone || "").trim();

  return (
    <div className="space-y-4">
      <AccountPanel>
        {/* Identidade unificada */}
        <div className="flex flex-col items-center gap-3 px-4 py-5 text-center sm:flex-row sm:items-center sm:gap-5 sm:text-left sm:px-5">
          <div className="relative shrink-0">
            <UserAvatar user={liveUser} size="2xl" ring className="shadow-soft" />
            {busy ? (
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/35">
                <Spinner className="h-6 w-6 text-white" />
              </span>
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[1.05rem] font-semibold tracking-[-0.02em] text-ink dark:text-white">
              {liveUser.name}
            </p>
            <p className="mt-0.5 truncate text-[13px] text-ink-muted dark:text-zinc-400">
              {user.email}
            </p>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <div className="relative" ref={photoMenuRef}>
                <button
                  type="button"
                  className="btn-secondary h-8 px-3 text-[12.5px]"
                  disabled={busy}
                  aria-expanded={photoMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => setPhotoMenuOpen((v) => !v)}
                >
                  <Camera className="h-3.5 w-3.5" strokeWidth={1.5} />
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
                    className="absolute left-1/2 z-20 mt-1.5 w-48 -translate-x-1/2 overflow-hidden rounded-xl border border-black/[0.06] bg-[var(--surface-raised)] py-1 shadow-lg dark:border-white/[0.08] sm:left-0 sm:translate-x-0"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-ink-secondary hover:bg-black/[0.03] dark:text-gray-300 dark:hover:bg-white/[0.04]"
                      onClick={() => {
                        setShowUploadHint(true);
                        fileRef.current?.click();
                      }}
                    >
                      <Camera className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                      Enviar foto
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-ink-secondary hover:bg-black/[0.03] dark:text-gray-300 dark:hover:bg-white/[0.04]"
                      onClick={() => useInitials()}
                    >
                      <Type className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                      Usar iniciais
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-ink-secondary hover:bg-black/[0.03] dark:text-gray-300 dark:hover:bg-white/[0.04]"
                      onClick={openPicker}
                    >
                      <ImageIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                      Escolher avatar
                    </button>
                    {showRemove ? (
                      <>
                        <div className="my-1 h-px bg-line-soft dark:bg-white/[0.06]" />
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                          onClick={() => {
                            setPhotoMenuOpen(false);
                            removeMut.mutate();
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                          Remover foto
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            {usingInitials ? (
              <div className="mt-3 flex flex-wrap justify-center gap-1.5 sm:justify-start">
                {AVATAR_COLOR_OPTIONS.map((c) => {
                  const active =
                    activeColor === c.hex.toLowerCase() ||
                    activeColor === c.id.toLowerCase();
                  return (
                    <button
                      key={c.id}
                      type="button"
                      title={c.label}
                      aria-label={`Cor ${c.label}`}
                      aria-pressed={active}
                      disabled={busy}
                      onClick={() => useInitials(c.hex)}
                      className={cn(
                        "h-6 w-6 rounded-full transition-transform duration-150",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                        active
                          ? "scale-110 ring-2 ring-violet-400/55 ring-offset-2 ring-offset-white dark:ring-offset-[#12141a]"
                          : "opacity-90 hover:scale-105"
                      )}
                      style={{ backgroundColor: c.hex }}
                    />
                  );
                })}
              </div>
            ) : null}

            {showUploadHint ? (
              <p className="mt-2 text-[11px] text-ink-faint dark:text-zinc-500">
                JPEG, PNG ou WebP · até 5&nbsp;MB
              </p>
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

        <div className="border-t border-black/[0.05] px-4 py-4 dark:border-white/[0.06] sm:px-5">
          <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-faint dark:text-zinc-500">
            Informações pessoais
          </h3>
          <form onSubmit={onSubmitName} className="space-y-3 sm:max-w-md">
            <div>
              <label className="label" htmlFor="account-name">
                Nome
              </label>
              <input
                id="account-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                autoComplete="name"
                maxLength={80}
              />
            </div>

            <div>
              <label className="label" htmlFor="account-phone">
                Telefone
              </label>
              <input
                id="account-phone"
                className="input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Opcional"
                autoComplete="tel"
              />
            </div>

            <div>
              <label className="label" htmlFor="account-email">
                E-mail
              </label>
              <div className="relative">
                <input
                  id="account-email"
                  className="input pr-24 opacity-90"
                  value={user.email}
                  disabled
                  readOnly
                  title="E-mail de login — não editável"
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md bg-black/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-ink-faint dark:bg-white/[0.06] dark:text-zinc-500">
                  Não editável
                </span>
              </div>
            </div>

            {dirty ? (
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  className="btn-secondary h-9 px-3.5"
                  onClick={discard}
                  disabled={saveName.isPending}
                >
                  Descartar
                </button>
                <button
                  type="submit"
                  className="btn-primary h-9 px-4"
                  disabled={saveName.isPending}
                >
                  {saveName.isPending ? "Salvando…" : "Salvar alterações"}
                </button>
              </div>
            ) : null}
          </form>
        </div>
      </AccountPanel>

      <Modal
        open={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          setPickedPreset(null);
        }}
        title="Escolher avatar"
        size="lg"
        variant="quick"
        initialFocus="panel"
        footer={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="btn-secondary h-9 min-w-[5.5rem] px-3.5"
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
              className="btn-primary h-9 px-4 sm:min-w-[8.5rem]"
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
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                    selected
                      ? "border-violet-400/50 bg-violet-500/5 shadow-[0_0_0_1px_rgba(139,92,246,0.25)]"
                      : "border-line hover:border-violet-400/30 hover:bg-black/[0.02] dark:border-white/[0.08] dark:hover:bg-white/[0.03]"
                  )}
                  aria-pressed={selected}
                  aria-label={p.label}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url || presetUrl(p.id)}
                    alt=""
                    className="h-14 w-14 rounded-2xl object-cover shadow-sm"
                  />
                  <span className="line-clamp-1 text-[11px] text-ink-muted dark:text-zinc-400">
                    {p.label}
                  </span>
                  {selected ? (
                    <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-violet-500 text-white">
                      <Check className="h-3 w-3" strokeWidth={2.5} />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}
