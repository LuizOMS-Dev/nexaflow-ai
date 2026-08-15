"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Camera,
  Check,
  ChevronDown,
  ImageIcon,
  Palette,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  AVATAR_COLOR_OPTIONS,
  NEXA_AVATAR_PRESETS,
  presetUrl,
  processAvatarFile,
  type AvatarType,
} from "@/lib/avatar";
import { cn } from "@/lib/utils";
import { Menu, MenuItem, MenuSeparator, Modal, Spinner, useToast } from "@/components/ui";
import { UserAvatar } from "@/components/user-avatar";
import { useAuth, type UserInfo } from "@/store/auth";
import { applyUser } from "./account-utils";

export function ProfileAvatarSection({
  user,
  roleLabel,
}: {
  user: UserInfo;
  roleLabel?: string;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

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

  const liveUser: UserInfo = {
    ...user,
    ...(preview
      ? {
          avatarType: preview.avatarType,
          avatarUrl: preview.avatarUrl ?? null,
          avatarPresetId: preview.avatarPresetId ?? null,
          avatarColor: preview.avatarColor ?? null,
        }
      : {}),
  };

  const uploadMut = useMutation({
    mutationFn: (dataUrl: string) =>
      api<{ user: UserInfo }>("/auth/avatar", { method: "POST", json: { dataUrl } }),
    onSuccess: (data) => {
      setUploading(false);
      setPreview(null);
      if (data.user) applyUser(data.user);
      toast({ kind: "success", title: "Foto atualizada." });
    },
    onError: (e: Error) => {
      setUploading(false);
      setPreview(null);
      toast({ kind: "error", title: "Falha no upload", description: e.message });
    },
  });

  const presetMut = useMutation({
    mutationFn: (presetId: string) =>
      api<{ user: UserInfo }>("/auth/avatar/preset", { method: "POST", json: { presetId } }),
    onSuccess: (data) => {
      setPickerOpen(false);
      setPreview(null);
      if (data.user) applyUser(data.user);
      toast({ kind: "success", title: "Avatar atualizado." });
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
    mutationFn: () => api<{ user: UserInfo }>("/auth/avatar", { method: "DELETE" }),
    onSuccess: (data) => {
      setPreview(null);
      if (data.user) applyUser(data.user);
      toast({ kind: "success", title: "Foto removida." });
    },
    onError: (e: Error) => toast({ kind: "error", title: "Erro", description: e.message }),
  });

  async function onPickFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await processAvatarFile(file, 512);
      setPreview({ avatarType: "UPLOAD", avatarUrl: dataUrl, avatarPresetId: null });
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
      avatarColor: color || user.avatarColor || "#6366F1",
    });
    initialsMut.mutate(color || user.avatarColor || undefined);
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

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-5 sm:p-6">
        <div className="flex items-center gap-4 min-w-0">
          <div className="relative shrink-0">
            <UserAvatar
              user={liveUser}
              size="lg"
              className="!h-16 !w-16 !text-xl !rounded-2xl ring-2 ring-black/[0.04] dark:ring-white/[0.08]"
            />
            {busy ? (
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50 backdrop-blur-xs">
                <Spinner className="h-5 w-5 text-white" />
              </div>
            ) : null}
          </div>

          <div className="min-w-0 flex-1 space-y-0.5">
            <h2 className="truncate text-base sm:text-[17px] font-bold tracking-tight text-ink dark:text-white">
              {user.name}
            </h2>
            {user.email ? (
              <p className="truncate text-[13px] text-ink-muted dark:text-zinc-400">
                {user.email}
              </p>
            ) : null}
            {roleLabel ? (
              <div className="pt-1">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-violet-500/[0.06] dark:bg-violet-500/[0.1] border border-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-700/90 dark:text-violet-300/90">
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-500/60 dark:bg-violet-400/70" />
                  {roleLabel}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 self-start sm:self-center">
          <Menu
            align="right"
            minWidth={220}
            trigger={
              <button
                type="button"
                className="btn-secondary h-8.5 px-3 text-xs font-medium gap-1.5"
                disabled={busy}
              >
                <Camera className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>Alterar foto</span>
                <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" strokeWidth={1.75} />
              </button>
            }
          >
            <MenuItem icon={Camera} onClick={() => fileRef.current?.click()}>
              Enviar imagem
            </MenuItem>
            <MenuItem
              icon={ImageIcon}
              onClick={() => {
                setPickedPreset(user.avatarPresetId || null);
                setPickerOpen(true);
              }}
            >
              Escolher avatar
            </MenuItem>
            <MenuItem
              icon={Palette}
              onClick={() => {
                setPickedColor(user.avatarColor || "#6366F1");
                setColorPickerOpen(true);
              }}
            >
              Cor das iniciais
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={RotateCcw} onClick={() => useInitials()}>
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

      {/* Modal: Escolher avatar pré-definido */}
      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} title="Escolher avatar" size="md">
        <div className="grid max-h-72 grid-cols-4 gap-2 overflow-y-auto p-1">
          {NEXA_AVATAR_PRESETS.map((preset) => {
            const selected = pickedPreset === preset.id;
            const url = presetUrl(preset.id);
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setPickedPreset(preset.id)}
                className={cn(
                  "relative flex flex-col items-center rounded-xl p-2 transition-all border",
                  selected
                    ? "border-violet-500 bg-violet-500/10 ring-2 ring-violet-500/30"
                    : "border-black/[0.06] hover:bg-black/[0.03] dark:border-white/[0.08] dark:hover:bg-white/[0.04]"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={preset.label} className="h-11 w-11 rounded-lg object-cover" />
                <span className="mt-1 w-full truncate text-center text-[10px] font-medium">{preset.label}</span>
                {selected ? (
                  <div className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-violet-600 text-white">
                    <Check className="h-2.5 w-2.5" strokeWidth={2.5} />
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end gap-2 border-t border-black/[0.06] pt-4 dark:border-white/[0.08]">
          <button type="button" className="btn-secondary h-8 px-3 text-xs" onClick={() => setPickerOpen(false)}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary h-8 px-4 text-xs bg-violet-600 hover:bg-violet-700"
            disabled={!pickedPreset || presetMut.isPending}
            onClick={confirmPreset}
          >
            {presetMut.isPending ? "Aplicando…" : "Confirmar"}
          </button>
        </div>
      </Modal>

      {/* Modal: Cor das iniciais */}
      <Modal open={colorPickerOpen} onClose={() => setColorPickerOpen(false)} title="Cor das iniciais">
        <div className="grid grid-cols-3 gap-2 py-1 sm:grid-cols-5">
          {AVATAR_COLOR_OPTIONS.map((c) => {
            const selected = pickedColor === c.hex || pickedColor === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setPickedColor(c.hex)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border p-2 transition-all",
                  selected
                    ? "border-violet-500 bg-violet-500/10 ring-2 ring-violet-500/30"
                    : "border-black/[0.06] dark:border-white/[0.08]"
                )}
              >
                <span className="h-5 w-5 shrink-0 rounded-md" style={{ backgroundColor: c.hex }} />
                <span className="truncate text-[11px] font-medium">{c.label}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end gap-2 border-t border-black/[0.06] pt-4 dark:border-white/[0.08]">
          <button type="button" className="btn-secondary h-8 px-3 text-xs" onClick={() => setColorPickerOpen(false)}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary h-8 px-4 text-xs bg-violet-600 hover:bg-violet-700"
            disabled={!pickedColor || initialsMut.isPending}
            onClick={confirmColor}
          >
            {initialsMut.isPending ? "Salvando…" : "Aplicar"}
          </button>
        </div>
      </Modal>
    </>
  );
}

export const AvatarEditor = ProfileAvatarSection;

