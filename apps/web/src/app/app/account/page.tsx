"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Camera,
  Check,
  ChevronDown,
  ImageIcon,
  Type,
  Trash2,
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
      toast({ kind: "success", title: "Perfil atualizado" });
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
      toast({ kind: "success", title: "Foto do perfil atualizada." });
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
      toast({ kind: "success", title: "Avatar atualizado.", description: "Usando suas iniciais." });
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
      toast({ kind: "success", title: "Foto removida.", description: "Voltando para iniciais." });
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

  return (
    <div className="space-y-4">
      <section className="card overflow-hidden p-5 sm:p-6">
        <div className="mb-5">
          <h2 className="font-display text-[15px] font-semibold text-ink dark:text-white">
            Perfil
          </h2>
        </div>

        <form onSubmit={onSubmitName} className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
          {/* Avatar column */}
          <div className="flex shrink-0 flex-col items-center gap-3 sm:items-start">
            <div className="relative">
              <UserAvatar user={liveUser} size="2xl" ring className="shadow-soft" />
              {busy && (
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/30">
                  <Spinner className="h-6 w-6 text-white" />
                </span>
              )}
            </div>

            <div className="relative" ref={photoMenuRef}>
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={busy}
                aria-expanded={photoMenuOpen}
                aria-haspopup="menu"
                onClick={() => setPhotoMenuOpen((v) => !v)}
              >
                <Camera className="h-3.5 w-3.5" strokeWidth={1.5} />
                Alterar foto
                <ChevronDown
                  className={cn("h-3.5 w-3.5 opacity-60 transition-transform", photoMenuOpen && "rotate-180")}
                  strokeWidth={1.75}
                />
              </button>

              {photoMenuOpen ? (
                <div
                  role="menu"
                  className="absolute left-1/2 z-20 mt-1.5 w-48 -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-lg dark:border-white/[0.08] dark:bg-[#1a1f29] sm:left-0 sm:translate-x-0"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-ink-secondary hover:bg-black/[0.03] dark:text-gray-300 dark:hover:bg-white/[0.04]"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Camera className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Enviar foto
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-ink-secondary hover:bg-black/[0.03] dark:text-gray-300 dark:hover:bg-white/[0.04]"
                    onClick={() => useInitials()}
                  >
                    <Type className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Usar iniciais
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-ink-secondary hover:bg-black/[0.03] dark:text-gray-300 dark:hover:bg-white/[0.04]"
                    onClick={openPicker}
                  >
                    <ImageIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Escolher avatar
                  </button>
                  {showRemove ? (
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                      onClick={() => {
                        setPhotoMenuOpen(false);
                        removeMut.mutate();
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                      Remover foto
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Cores — só visíveis quando iniciais */}
            {(user.avatarType === "INITIALS" ||
              preview?.avatarType === "INITIALS" ||
              (!user.avatarType && !preview)) && (
              <div className="flex flex-wrap justify-center gap-1.5 sm:justify-start">
                {AVATAR_COLOR_OPTIONS.map((c) => {
                  const active =
                    activeColor === c.hex.toLowerCase() || activeColor === c.id.toLowerCase();
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
                          ? "scale-110 ring-2 ring-violet-400/60 ring-offset-2 ring-offset-white dark:ring-offset-[#14171e]"
                          : "hover:scale-105 opacity-90"
                      )}
                      style={{ backgroundColor: c.hex }}
                    />
                  );
                })}
              </div>
            )}

            <p className="max-w-[11rem] text-center text-[10px] leading-relaxed text-ink-faint sm:text-left">
              JPEG, PNG ou WebP · até 5 MB
            </p>

            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => void onPickFile(e.target.files?.[0] || null)}
            />
          </div>

          {/* Fields */}
          <div className="min-w-0 flex-1 space-y-3.5 sm:max-w-md">
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
              <label className="label" htmlFor="account-email">
                E-mail
              </label>
              <input
                id="account-email"
                className="input"
                value={user.email}
                disabled
                readOnly
              />
              <p className="mt-1 text-[11px] text-ink-faint">O e-mail não pode ser alterado aqui.</p>
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

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                className="btn-primary h-9 px-4"
                disabled={saveName.isPending}
              >
                {saveName.isPending ? "Salvando…" : "Salvar alterações"}
              </button>
            </div>
          </div>
        </form>
      </section>

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
                  <span className="text-xs font-medium text-ink-secondary dark:text-gray-300">
                    {p.label}
                  </span>
                  {selected && (
                    <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-violet-500 text-white shadow">
                      <Check className="h-3 w-3" strokeWidth={2.5} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}
