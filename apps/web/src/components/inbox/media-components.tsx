"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Play,
  Pause,
  Download,
  FileText,
  FileSpreadsheet,
  FileArchive,
  Film,
  File,
  X,
  Mic,
  Square,
  Maximize2,
  Send,
  Loader2,
  AlertCircle,
  ExternalLink,
  Volume2,
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui";
import { resolveMediaUrl, formatBytes, formatSeconds, getFileStyle } from "@/lib/media";

/**
 * Player de áudio e mensagens de voz
 */
export function AudioVoicePlayer({
  src,
  initialDuration,
  isOutbound,
}: {
  src: string;
  initialDuration?: number;
  isOutbound?: boolean;
}) {
  const resolvedSrc = resolveMediaUrl(src) || src;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const probingDurationRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration && isFinite(initialDuration) ? initialDuration : 0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [speed, setSpeed] = useState<number>(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    probingDurationRef.current = false;
    audio.currentTime = 0;
    audio.playbackRate = 1;
    setCurrentTime(0);
    setIsPlaying(false);
    setIsLoading(false);
    setHasError(false);
    setSpeed(1);

    if (initialDuration && isFinite(initialDuration) && initialDuration > 0) {
      setDuration(initialDuration);
    } else {
      setDuration(0);
    }

    const onTimeUpdate = () => {
      if (probingDurationRef.current) {
        probingDurationRef.current = false;
        if (isFinite(audio.duration) && audio.duration > 0) {
          setDuration(audio.duration);
        } else if (initialDuration && initialDuration > 0) {
          setDuration(initialDuration);
        }
        audio.currentTime = 0;
        setCurrentTime(0);
        return;
      }

      setCurrentTime(Number.isFinite(audio.currentTime) ? audio.currentTime : 0);
    };
    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      } else if (audio.duration === Infinity) {
        // Fix para browsers (Chrome/Firefox) onde WebM/Opus reporta Infinity
        probingDurationRef.current = true;
        audio.currentTime = 1e101;
      } else if (initialDuration && initialDuration > 0) {
        setDuration(initialDuration);
      }
    };
    const onEnded = () => {
      audio.currentTime = 0;
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const onWaiting = () => setIsLoading(true);
    const onPlaying = () => {
      setIsLoading(false);
      setIsPlaying(true);
      setHasError(false);
    };
    const onPause = () => setIsPlaying(false);
    const onError = () => {
      setIsLoading(false);
      setIsPlaying(false);
      setHasError(true);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onError);

    return () => {
      probingDurationRef.current = false;
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("error", onError);
    };
  }, [resolvedSrc, initialDuration]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      if (audio.ended || (duration > 0 && Math.abs(audio.currentTime - duration) < 0.2)) {
        audio.currentTime = 0;
        setCurrentTime(0);
      }
      audio.play().catch(() => {
        setIsPlaying(false);
        setHasError(true);
      });
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const nextTime = Math.max(0, Math.min(Number(e.target.value), duration || 0));
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const sliderMax = duration > 0 && Number.isFinite(duration) ? duration : 1;
  const sliderTime = Math.max(0, Math.min(currentTime, sliderMax));
  const progress = duration > 0 ? (sliderTime / duration) * 100 : 0;
  const sliderStyle = {
    "--nf-audio-progress": `${Math.max(0, Math.min(progress, 100))}%`,
  } as CSSProperties;

  if (hasError) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 py-1.5 px-2.5 rounded-xl border text-xs transition-colors",
          "border-rose-500/20 bg-rose-500/[0.06] text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-300"
        )}
      >
        <AlertCircle className="h-4 w-4 shrink-0 text-rose-500 dark:text-rose-400" />
        <span className="font-medium">Áudio indisponível</span>
        <a
          href={resolvedSrc}
          target="_blank"
          rel="noopener noreferrer"
          download
          className="ml-auto underline text-[11px] font-semibold hover:opacity-80"
        >
          Baixar
        </a>
      </div>
    );
  }

  const cycleSpeed = () => {
    const nextSpeed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  return (
    <div className="flex items-center gap-3 py-1 w-[220px] sm:w-[245px] max-w-full select-none">
      <audio ref={audioRef} src={resolvedSrc} preload="metadata" />
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? "Pausar áudio" : "Reproduzir áudio"}
        className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400 transition-all active:scale-95 shadow-xs cursor-pointer"
      >
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : isPlaying ? (
          <Pause className="h-3.5 w-3.5 fill-current" />
        ) : (
          <Play className="h-3.5 w-3.5 fill-current translate-x-[1px]" />
        )}
      </button>

      <div className="flex flex-1 flex-col justify-center gap-1 min-w-0">
        <div className="relative flex items-center w-full">
          <input
            type="range"
            min={0}
            max={sliderMax}
            step="any"
            value={sliderTime}
            onChange={handleSeek}
            aria-label="Progresso do áudio"
            aria-valuemin={0}
            aria-valuemax={sliderMax}
            aria-valuenow={sliderTime}
            aria-valuetext={formatSeconds(sliderTime)}
            style={sliderStyle}
            className="nf-audio-slider w-full focus:outline-none"
          />
        </div>
        <div className="flex items-center justify-between text-[11px] tabular-nums font-mono leading-none text-ink-muted dark:text-zinc-400">
          <span className="font-semibold text-ink dark:text-zinc-200">
            {isPlaying || currentTime > 0 ? formatSeconds(sliderTime) : (duration > 0 ? formatSeconds(duration) : "0:00")}
          </span>
          <div className="flex items-center gap-1.5">
            {isPlaying && duration > 0 && (
              <span className="text-[10px] opacity-70">
                {formatSeconds(duration)}
              </span>
            )}
            <button
              type="button"
              onClick={cycleSpeed}
              className="rounded-full px-1.5 py-0.5 text-[9.5px] font-bold tracking-tight bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20 text-ink-secondary dark:text-zinc-200 transition-all tabular-nums cursor-pointer"
              title="Velocidade de reprodução"
            >
              {speed}x
            </button>
          </div>
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
      if (typeof MediaRecorder !== "undefined") {
        if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
          mimeType = "audio/ogg;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          mimeType = "audio/webm;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
          mimeType = "audio/mp4";
        }
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
    } catch {
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
    void startRecording();
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
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-500/20 bg-sky-50/70 p-2.5 dark:border-sky-400/20 dark:bg-sky-950/30">
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
          className="btn-ghost h-8 px-2 text-xs text-ink-muted hover:text-ink dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <X className="h-4 w-4 mr-1" />
          Cancelar
        </button>

        {isRecording ? (
          <button
            type="button"
            onClick={stopRecording}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-red-500 px-3 text-xs font-medium text-white hover:bg-red-600 active:scale-95 transition-all shadow-sm"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            Parar
          </button>
        ) : audioBlob ? (
          <button
            type="button"
            onClick={handleSend}
            disabled={isSending}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-sky-600 px-3 text-xs font-medium text-white hover:bg-sky-700 active:scale-95 transition-all shadow-sm disabled:opacity-50"
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
  const resolvedSrc = resolveMediaUrl(src) || src;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div className="relative max-h-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
        <img
          src={resolvedSrc}
          alt={alt || "Imagem"}
          className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl"
        />
        <div className="absolute right-3 top-3 flex items-center gap-2">
          <a
            href={resolvedSrc}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors shadow-lg"
            title="Baixar imagem"
          >
            <Download className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors shadow-lg"
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
  const style = getFileStyle(file.name, file.type);
  const isTooLarge = file.size > 100 * 1024 * 1024;

  useEffect(() => {
    if (isImage || isVideo) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file, isImage, isVideo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isTooLarge || isSending) return;
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
            disabled={isSending || isTooLarge}
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
                Enviar anexo
              </>
            )}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {isTooLarge && (
          <div className="flex items-center gap-2 p-2.5 rounded-xl border border-red-500/20 bg-red-50 text-red-600 dark:border-red-400/20 dark:bg-red-950/30 dark:text-red-300 text-xs">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Este arquivo excede o limite máximo permitido de 100MB.</span>
          </div>
        )}
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
            <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", style.badgeBg, style.iconColor)}>
              <FileText className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink dark:text-zinc-100">
                {file.name}
              </p>
              <p className="text-xs text-ink-muted dark:text-zinc-400">
                {formatBytes(file.size)} · {style.label}
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
  content,
  onOpenLightbox,
}: {
  type: string;
  mediaUrl?: string | null;
  metadata?: Record<string, unknown>;
  isOutbound?: boolean;
  content?: string | null;
  onOpenLightbox?: (url: string) => void;
}) {
  const meta = metadata || {};
  const filename = (meta.originalName as string) || (meta.filename as string) || "arquivo";
  const sizeBytes = Number(meta.sizeBytes) || 0;
  const mime = (meta.mimetype as string) || "";
  const style = getFileStyle(filename, mime);

  // Se não há mediaUrl válida, renderiza fallback gracioso pelo tipo
  if (!mediaUrl) {
    const isVoiceOrAudio =
      type === "VOICE" ||
      type === "AUDIO" ||
      mime.startsWith("audio/") ||
      /\[áudio\]/i.test(content || "");
    const isImage =
      type === "IMAGE" ||
      mime.startsWith("image/") ||
      /\[imagem\]/i.test(content || "");
    const isVideo =
      type === "VIDEO" ||
      mime.startsWith("video/") ||
      /\[vídeo\]/i.test(content || "");

    const fallbackLabel = isVoiceOrAudio
      ? "Áudio indisponível"
      : isImage
        ? "Imagem indisponível"
        : isVideo
          ? "Vídeo indisponível"
          : "Documento indisponível";

    const Icon = isVoiceOrAudio ? Volume2 : isImage ? ImageIcon : isVideo ? Film : FileText;

    return (
      <div
        className={cn(
          "my-1 flex items-center gap-2.5 rounded-xl border p-2.5 text-xs transition-colors",
          isOutbound
            ? "border-white/20 bg-white/10 text-white/90 dark:border-white/10 dark:bg-white/[0.05] dark:text-zinc-200"
            : "border-black/[0.08] bg-black/[0.02] text-ink-secondary dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-300"
        )}
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{fallbackLabel}</p>
          {filename && filename !== "arquivo" && (
            <p className="truncate text-[10.5px] opacity-75">{filename}</p>
          )}
        </div>
      </div>
    );
  }

  const resolvedUrl = resolveMediaUrl(mediaUrl) || mediaUrl;

  // Download URL com header de download forçado
  const downloadUrl = resolvedUrl.includes("?")
    ? `${resolvedUrl}&download=1`
    : `${resolvedUrl}?download=1`;

  // Imagem
  if (type === "IMAGE" || mime.startsWith("image/")) {
    return (
      <ImageBubbleItem
        src={resolvedUrl}
        filename={filename}
        downloadUrl={downloadUrl}
        isOutbound={isOutbound}
        onOpenLightbox={onOpenLightbox}
      />
    );
  }

  // Áudio ou Mensagem de Voz
  if (type === "VOICE" || type === "AUDIO" || mime.startsWith("audio/")) {
    const audioDur = Number(meta.duration) || Number(meta.durationSecs) || undefined;
    return <AudioVoicePlayer src={resolvedUrl} initialDuration={audioDur} isOutbound={isOutbound} />;
  }

  // Vídeo
  if (type === "VIDEO" || mime.startsWith("video/")) {
    return (
      <div className="mt-1 mb-1 overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-black">
        <video
          src={resolvedUrl}
          controls
          className="max-h-72 w-full rounded-xl bg-black shadow-sm"
          preload="metadata"
        />
      </div>
    );
  }

  // DOCUMENT ou FILE genérico com contraste perfeito em Light e Dark Mode
  return (
    <div className="flex items-center gap-3 py-1 min-w-[220px] max-w-[280px]">
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-xs",
          isOutbound
            ? "bg-white/20 text-white dark:bg-white/15 dark:text-white"
            : style.badgeBg + " " + style.iconColor
        )}
      >
        {style.ext === "PDF" ? (
          <FileText className="h-5 w-5" />
        ) : style.ext === "XLSX" || style.ext === "CSV" ? (
          <FileSpreadsheet className="h-5 w-5" />
        ) : style.ext === "ZIP" || style.ext === "RAR" ? (
          <FileArchive className="h-5 w-5" />
        ) : (
          <FileText className="h-5 w-5" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-xs font-semibold leading-tight",
            isOutbound
              ? "text-white dark:text-zinc-100"
              : "text-ink dark:text-zinc-100"
          )}
          title={filename}
        >
          {filename}
        </p>
        <p
          className={cn(
            "text-[10.5px] mt-0.5 font-medium",
            isOutbound
              ? "text-white/75 dark:text-zinc-300"
              : "text-ink-muted dark:text-zinc-400"
          )}
        >
          {sizeBytes ? formatBytes(sizeBytes) : style.label} · {style.ext}
        </p>
      </div>

      <div className="flex items-center gap-1">
        <a
          href={downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          download={filename}
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all active:scale-95 shadow-xs cursor-pointer",
            isOutbound
              ? "bg-white/20 hover:bg-white/30 text-white dark:bg-white/15 dark:hover:bg-white/25 dark:text-white"
              : "bg-black/5 hover:bg-black/10 text-ink dark:bg-white/10 dark:hover:bg-white/20 dark:text-zinc-200"
          )}
          title="Baixar arquivo"
          aria-label={`Baixar ${filename}`}
        >
          <Download className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}

function ImageBubbleItem({
  src,
  filename,
  downloadUrl,
  isOutbound,
  onOpenLightbox,
}: {
  src: string;
  filename: string;
  downloadUrl: string;
  isOutbound?: boolean;
  onOpenLightbox?: (url: string) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    if (imgRef.current) {
      if (imgRef.current.complete && imgRef.current.naturalWidth > 0) {
        setLoaded(true);
      }
    }
  }, [src]);

  if (failed) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 p-2 rounded-xl border text-xs transition-colors",
          isOutbound
            ? "border-white/20 bg-white/10 text-white dark:border-white/10 dark:bg-white/[0.05] dark:text-zinc-200"
            : "border-black/[0.08] bg-black/[0.02] text-ink dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-200"
        )}
      >
        <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
        <span className="truncate">Imagem indisponível ({filename})</span>
        <a
          href={downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          download
          className="ml-auto underline font-medium text-[11px]"
        >
          Baixar
        </a>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl">
      <div
        className="group relative cursor-pointer overflow-hidden rounded-xl bg-black/[0.03] dark:bg-white/[0.04] max-h-72 min-h-[120px] min-w-[180px] flex items-center justify-center"
        onClick={() => onOpenLightbox?.(src)}
      >
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/5 dark:bg-white/5 animate-pulse z-10">
            <Loader2 className="h-5 w-5 animate-spin text-ink-muted/70 dark:text-zinc-400" />
          </div>
        )}
        <img
          ref={imgRef}
          src={src}
          alt={filename}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setFailed(true);
          }}
          className={cn(
            "max-h-72 w-auto max-w-full rounded-xl object-contain transition-all duration-200 group-hover:scale-[1.015]",
            loaded ? "opacity-100 scale-100" : "opacity-0 scale-95"
          )}
        />
        {loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition-opacity group-hover:opacity-100 z-20">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-xs shadow-md">
              <Maximize2 className="h-4 w-4" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
