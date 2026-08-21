"use client";

import { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Download,
  FileText,
  Film,
  File,
  X,
  Mic,
  Square,
  Volume2,
  VolumeX,
  Maximize2,
  UploadCloud,
  Send,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui";

function formatSeconds(secs: number) {
  if (isNaN(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatBytes(bytes: number) {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Player de áudio e mensagens de voz
 */
export function AudioVoicePlayer({
  src,
  isOutbound,
}: {
  src: string;
  isOutbound?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const onWaiting = () => setIsLoading(true);
    const onPlaying = () => {
      setIsLoading(false);
      setIsPlaying(true);
    };
    const onPause = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("pause", onPause);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => setIsPlaying(false));
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const nextTime = Number(e.target.value);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-2.5 py-1 min-w-[200px] max-w-xs">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        type="button"
        onClick={togglePlay}
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95",
          isOutbound
            ? "bg-white text-zinc-900 shadow-sm hover:bg-zinc-100"
            : "bg-sky-500 text-white shadow-sm hover:bg-sky-600 dark:bg-sky-400 dark:text-zinc-950"
        )}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isPlaying ? (
          <Pause className="h-4 w-4 fill-current" />
        ) : (
          <Play className="h-4 w-4 fill-current ml-0.5" />
        )}
      </button>

      <div className="flex flex-1 flex-col justify-center">
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={handleSeek}
          className={cn(
            "h-1.5 w-full cursor-pointer appearance-none rounded-lg accent-sky-500",
            isOutbound ? "bg-white/25" : "bg-black/10 dark:bg-white/15"
          )}
        />
        <div
          className={cn(
            "mt-1 flex items-center justify-between text-[10.5px] tabular-nums",
            isOutbound ? "text-white/70 dark:text-zinc-900/70" : "text-ink-faint dark:text-zinc-400"
          )}
        >
          <span>{formatSeconds(currentTime)}</span>
          <span>{formatSeconds(duration)}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Gravador de voz nativo do navegador
 */
export function AudioVoiceRecorder({
  onCancel,
  onSendAudio,
}: {
  onCancel: () => void;
  onSendAudio: (blob: Blob, durationSecs: number) => Promise<void>;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = async () => {
    try {
      setErr(null);
      chunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      let mimeType = "audio/webm;codecs=opus";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
          ? "audio/ogg;codecs=opus"
          : "audio/mp4";
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
      };

      recorder.start(100);
      setIsRecording(true);
      setSeconds(0);

      timerRef.current = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    } catch (e) {
      setErr("Permissão de microfone negada ou indisponível");
    }
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    setIsRecording(false);
  };

  const cancelRecording = () => {
    stopRecording();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    onCancel();
  };

  useEffect(() => {
    startRecording();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const handleSend = async () => {
    if (!audioBlob) return;
    setIsSending(true);
    try {
      await onSendAudio(audioBlob, seconds);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-500/20 bg-sky-50/70 p-2.5 dark:border-sky-400/20 dark:bg-sky-950/20">
      <div className="flex items-center gap-2.5">
        {isRecording ? (
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500"></span>
            </span>
            <span className="text-xs font-semibold text-red-600 dark:text-red-400">
              Gravando {formatSeconds(seconds)}
            </span>
          </div>
        ) : audioUrl ? (
          <div className="flex items-center gap-2">
            <AudioVoicePlayer src={audioUrl} />
          </div>
        ) : err ? (
          <span className="text-xs text-red-500">{err}</span>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={cancelRecording}
          disabled={isSending}
          className="btn-ghost h-8 px-2 text-xs text-ink-muted hover:text-ink"
        >
          <X className="h-4 w-4 mr-1" />
          Cancelar
        </button>

        {isRecording ? (
          <button
            type="button"
            onClick={stopRecording}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-red-500 px-3 text-xs font-medium text-white hover:bg-red-600 active:scale-95"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            Parar
          </button>
        ) : audioBlob ? (
          <button
            type="button"
            onClick={handleSend}
            disabled={isSending}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-sky-600 px-3 text-xs font-medium text-white hover:bg-sky-700 active:scale-95 disabled:opacity-50"
          >
            {isSending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Enviar áudio
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Modal de visualização de imagem em tela cheia (Lightbox)
 */
export function ImageLightboxModal({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt?: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="relative max-h-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
        <img
          src={src}
          alt={alt || "Imagem"}
          className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl"
        />
        <div className="absolute right-3 top-3 flex items-center gap-2">
          <a
            href={src}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
            title="Baixar imagem"
          >
            <Download className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
            title="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Modal de confirmação e legenda antes de enviar anexo
 */
export function AttachmentPreviewModal({
  file,
  onClose,
  onSend,
  isSending,
}: {
  file: File;
  onClose: () => void;
  onSend: (caption: string) => Promise<void>;
  isSending: boolean;
}) {
  const [caption, setCaption] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");

  useEffect(() => {
    if (isImage || isVideo) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file, isImage, isVideo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSend(caption.trim());
  };

  return (
    <Modal
      open={true}
      onClose={() => !isSending && onClose()}
      title="Enviar anexo"
      footer={
        <>
          <button
            type="button"
            className="btn-secondary h-9 text-sm"
            disabled={isSending}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary h-9 text-sm inline-flex items-center gap-1.5"
            disabled={isSending}
            onClick={handleSubmit}
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Enviar arquivo
              </>
            )}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {isImage && previewUrl ? (
          <div className="flex justify-center overflow-hidden rounded-xl bg-black/5 dark:bg-white/5 p-2">
            <img
              src={previewUrl}
              alt={file.name}
              className="max-h-64 max-w-full rounded-lg object-contain"
            />
          </div>
        ) : isVideo && previewUrl ? (
          <div className="flex justify-center overflow-hidden rounded-xl bg-black/5 dark:bg-white/5 p-2">
            <video
              src={previewUrl}
              controls
              className="max-h-64 max-w-full rounded-lg"
            />
          </div>
        ) : (
          <div className="flex items-center gap-3.5 rounded-xl border border-black/[0.08] bg-black/[0.02] p-3.5 dark:border-white/[0.08] dark:bg-white/[0.03]">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:bg-sky-400/10 dark:text-sky-300">
              <FileText className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink dark:text-zinc-100">
                {file.name}
              </p>
              <p className="text-xs text-ink-muted dark:text-zinc-400">
                {formatBytes(file.size)} · {file.type || "Documento"}
              </p>
            </div>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-muted dark:text-zinc-400">
            Legenda opcional
          </label>
          <input
            type="text"
            className="input w-full h-9 text-sm"
            placeholder="Adicionar uma legenda…"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            autoFocus
          />
        </div>
      </form>
    </Modal>
  );
}

/**
 * Renderizador de mensagens multimídia dentro do balão
 */
export function MediaBubble({
  type,
  mediaUrl,
  metadata,
  isOutbound,
  onOpenLightbox,
}: {
  type: string;
  mediaUrl?: string | null;
  metadata?: Record<string, unknown>;
  isOutbound?: boolean;
  onOpenLightbox?: (url: string) => void;
}) {
  if (!mediaUrl) return null;

  const meta = metadata || {};
  const filename = (meta.filename as string) || "arquivo";
  const sizeBytes = Number(meta.sizeBytes) || 0;
  const mime = (meta.mimetype as string) || "";

  if (type === "IMAGE" || mime.startsWith("image/")) {
    return (
      <div className="mt-1.5 mb-1 overflow-hidden rounded-xl">
        <div
          className="group relative cursor-pointer overflow-hidden rounded-xl bg-black/5 dark:bg-white/5"
          onClick={() => onOpenLightbox?.(mediaUrl)}
        >
          <img
            src={mediaUrl}
            alt={filename}
            className="max-h-72 w-auto max-w-full rounded-xl object-cover transition-transform duration-200 group-hover:scale-[1.02]"
            loading="lazy"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white">
              <Maximize2 className="h-4 w-4" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (type === "VOICE" || type === "AUDIO" || mime.startsWith("audio/")) {
    return (
      <div className="my-1">
        <AudioVoicePlayer src={mediaUrl} isOutbound={isOutbound} />
      </div>
    );
  }

  if (type === "VIDEO" || mime.startsWith("video/")) {
    return (
      <div className="mt-1.5 mb-1 overflow-hidden rounded-xl">
        <video
          src={mediaUrl}
          controls
          className="max-h-72 w-full rounded-xl bg-black"
          preload="metadata"
        />
      </div>
    );
  }

  // DOCUMENT ou FILE genérico
  return (
    <a
      href={mediaUrl}
      target="_blank"
      rel="noopener noreferrer"
      download={filename}
      className={cn(
        "my-1 flex items-center gap-3 rounded-xl border p-2.5 transition-colors",
        isOutbound
          ? "border-white/20 bg-white/10 hover:bg-white/20 text-white"
          : "border-black/[0.08] bg-black/[0.03] hover:bg-black/[0.06] text-ink dark:border-white/[0.08] dark:bg-white/[0.04] dark:hover:bg-white/[0.08] dark:text-zinc-100"
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          isOutbound ? "bg-white/20 text-white" : "bg-sky-500/10 text-sky-600 dark:bg-sky-400/10 dark:text-sky-300"
        )}
      >
        <FileText className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold">{filename}</p>
        <p
          className={cn(
            "text-[10.5px]",
            isOutbound ? "text-white/70" : "text-ink-muted dark:text-zinc-400"
          )}
        >
          {sizeBytes ? formatBytes(sizeBytes) : "Documento"}
        </p>
      </div>
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isOutbound ? "bg-white/15 hover:bg-white/25" : "bg-black/5 hover:bg-black/10 dark:bg-white/10"
        )}
      >
        <Download className="h-4 w-4" />
      </div>
    </a>
  );
}
