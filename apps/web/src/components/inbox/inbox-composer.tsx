"use client";

import { useRef, useState, useEffect, type CSSProperties, type FormEvent } from "react";
import {
  Paperclip,
  Image as ImageIcon,
  FileText,
  File as FileIcon,
  Mic,
  Sparkles,
  Send,
  StickyNote,
  X,
  Play,
  Pause,
  Square,
  Trash2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatSeconds } from "@/lib/media";

export type InboxComposerProps = {
  conversationId?: string | null;
  message: string;
  setMessage: (v: string) => void;
  internal: boolean;
  setInternal: (v: boolean) => void;
  onSend: (e: FormEvent) => Promise<void>;
  isSending: boolean;
  onSendVoice: (blob: Blob, durationSecs: number) => Promise<void>;
  onSelectFile: (file: File) => void;
  onRequestAi?: () => void;
  aiLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
};

export function InboxComposer({
  conversationId,
  message,
  setMessage,
  internal,
  setInternal,
  onSend,
  isSending,
  onSendVoice,
  onSelectFile,
  onRequestAi,
  aiLoading = false,
  disabled = false,
  placeholder,
}: InboxComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentMenuRef = useRef<HTMLDivElement | null>(null);

  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // Estados de Gravação de Voz
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const [isSendingVoice, setIsSendingVoice] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const recordSecondsRef = useRef<number>(0);
  const finalDurationRef = useRef<number>(0);
  const recordingSessionRef = useRef<number>(0);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Auto-resize do textarea compacto (min 36px, max 120px)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const newHeight = Math.min(Math.max(el.scrollHeight, 36), 120);
    el.style.height = `${newHeight}px`;
  }, [message]);

  // Se trocar de conversa durante gravação ou preview, descarta para evitar vazamento
  useEffect(() => {
    if (isRecording || recordedBlob || previewAudioUrl) {
      discardRecording();
    }
  }, [conversationId]);

  // Fecha menu de anexos ao clicar fora ou pressionar Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (attachmentMenuRef.current && !attachmentMenuRef.current.contains(e.target as Node)) {
        setAttachmentMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAttachmentMenuOpen(false);
      }
    };
    if (attachmentMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [attachmentMenuOpen]);

  // Limpeza de recursos ao desmontar
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.src = "";
      }
      if (previewAudioUrl) {
        URL.revokeObjectURL(previewAudioUrl);
      }
    };
  }, [previewAudioUrl]);

  // Iniciar Gravação de Áudio
  const startRecording = async () => {
    if (internal) return;
    setMicError(null);

    // Reseta completamente qualquer estado e timer de gravação anterior
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.src = "";
    }
    if (previewAudioUrl) {
      URL.revokeObjectURL(previewAudioUrl);
      setPreviewAudioUrl(null);
    }
    chunksRef.current = [];
    setRecordedBlob(null);
    setRecordedDuration(0);
    setPreviewPlaying(false);
    setPreviewCurrentTime(0);
    setRecordSeconds(0);
    recordSecondsRef.current = 0;
    finalDurationRef.current = 0;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      let mimeType = "audio/webm;codecs=opus";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "audio/ogg;codecs=opus";
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "audio/mp4";
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "";
      }

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      const recordingSessionId = ++recordingSessionRef.current;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        if (recordingSessionId !== recordingSessionRef.current) {
          chunksRef.current = [];
          return;
        }
        const finalType = recorder.mimeType || "audio/ogg";
        const blob = new Blob(chunksRef.current, { type: finalType });
        const measuredDuration = (Date.now() - startTimeRef.current) / 1000;
        const finalDur = Math.max(
          1,
          finalDurationRef.current || recordSecondsRef.current || measuredDuration
        );
        const url = URL.createObjectURL(blob);

        setRecordedBlob(blob);
        setRecordedDuration(finalDur);
        setPreviewAudioUrl(url);
        setPreviewCurrentTime(0);
        setPreviewPlaying(false);
      };

      startTimeRef.current = Date.now();
      recordSecondsRef.current = 0;
      setRecordSeconds(0);

      recorder.start(100);
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        const elapsed = Math.max(0, Math.floor((Date.now() - startTimeRef.current) / 1000));
        recordSecondsRef.current = elapsed;
        setRecordSeconds(elapsed);
      }, 200);
    } catch {
      setMicError("Não foi possível acessar o microfone. Verifique a permissão do navegador.");
    }
  };

  // Parar gravação
  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const elapsed = Math.max(1, (Date.now() - startTimeRef.current) / 1000);
    finalDurationRef.current = elapsed;
    recordSecondsRef.current = elapsed;
    setRecordSeconds(Math.floor(elapsed));

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
  };

  // Descartar gravação
  const discardRecording = () => {
    recordingSessionRef.current += 1;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.src = "";
    }
    if (previewAudioUrl) {
      URL.revokeObjectURL(previewAudioUrl);
      setPreviewAudioUrl(null);
    }
    chunksRef.current = [];
    setIsRecording(false);
    setRecordSeconds(0);
    recordSecondsRef.current = 0;
    finalDurationRef.current = 0;
    setRecordedBlob(null);
    setRecordedDuration(0);
    setPreviewPlaying(false);
    setPreviewCurrentTime(0);
  };

  // Enviar áudio gravado
  const submitVoice = async () => {
    if (!recordedBlob) return;
    setIsSendingVoice(true);
    try {
      const dur = Math.max(1, recordedDuration || recordSecondsRef.current || 1);
      await onSendVoice(recordedBlob, dur);
      discardRecording();
    } catch {
      // Em caso de falha de envio, mantém o áudio intacto para permitir tentar novamente
    } finally {
      setIsSendingVoice(false);
    }
  };

  // Toggle do preview do áudio gravado
  const togglePreviewAudio = () => {
    const audio = previewAudioRef.current;
    if (!audio) return;

    if (previewPlaying) {
      audio.pause();
      setPreviewPlaying(false);
    } else {
      audio.play().then(() => {
        setPreviewPlaying(true);
      }).catch(() => {
        setPreviewPlaying(false);
      });
    }
  };

  const handlePreviewSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = previewAudioRef.current;
    const nextTime = Math.max(0, Math.min(Number(e.target.value), recordedDuration || 0));
    setPreviewCurrentTime(nextTime);
    if (audio) {
      audio.currentTime = nextTime;
    }
  };

  return (
    <div className="shrink-0 border-t border-black/[0.06] bg-white px-3 py-2 dark:border-white/[0.06] dark:bg-[#0c0e14] sm:px-4 sm:py-2.5">
      {/* Alerta amigável de erro de microfone */}
      {micError && (
        <div className="mb-1.5 flex items-center justify-between gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-2.5 py-1 text-xs text-red-600 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-300">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate text-[11px]">{micError}</span>
          </div>
          <button
            type="button"
            onClick={() => setMicError(null)}
            className="p-0.5 text-red-500 hover:text-red-700 dark:hover:text-red-200"
            title="Fechar aviso"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Segmented Mode: Responder vs Nota Interna */}
      <div className="mb-1.5 flex items-center justify-between">
        <div className="inline-flex rounded-lg bg-black/[0.03] p-0.5 dark:bg-white/[0.05]">
          <button
            type="button"
            onClick={() => {
              if (isRecording) discardRecording();
              setInternal(false);
            }}
            className={cn(
              "rounded-md px-2.5 py-0.5 text-[11px] font-medium transition-colors",
              !internal
                ? "bg-white text-ink shadow-2xs dark:bg-[#181c24] dark:text-zinc-100 font-semibold"
                : "text-ink-muted hover:text-ink dark:text-zinc-400 dark:hover:text-zinc-200"
            )}
          >
            Responder
          </button>
          <button
            type="button"
            onClick={() => {
              if (isRecording) discardRecording();
              setInternal(true);
            }}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-[11px] font-medium transition-colors",
              internal
                ? "bg-amber-500/15 text-amber-900 shadow-2xs dark:bg-amber-400/20 dark:text-amber-100 font-semibold"
                : "text-ink-muted hover:text-ink dark:text-zinc-400 dark:hover:text-zinc-200"
            )}
          >
            <StickyNote className="h-2.5 w-2.5" />
            Nota interna
          </button>
        </div>

        {internal && (
          <span className="text-[10.5px] font-normal text-amber-700/80 dark:text-amber-300/80">
            Somente equipe · Visível apenas internamente
          </span>
        )}
      </div>

      {/* Caixa de Entrada Unificada e Compacta */}
      <form onSubmit={onSend}>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!internal) setIsDraggingFile(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDraggingFile(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDraggingFile(false);
            if (internal) return;
            const f = e.dataTransfer.files?.[0];
            if (f) onSelectFile(f);
          }}
          className={cn(
            "relative rounded-xl border transition-colors duration-150",
            isDraggingFile
              ? "border-violet-500 bg-violet-50/70 ring-1 ring-violet-500/20 dark:border-violet-400 dark:bg-violet-950/30"
              : internal
                ? "border-amber-500/25 bg-amber-500/[0.02] focus-within:border-amber-500/40 focus-within:bg-white focus-within:ring-1 focus-within:ring-amber-500/20 dark:border-amber-400/25 dark:bg-amber-500/[0.03] dark:focus-within:bg-[#14161a]"
                : "border-black/[0.06] bg-black/[0.015] focus-within:border-violet-500/30 focus-within:bg-white focus-within:ring-1 focus-within:ring-violet-500/20 dark:border-white/[0.06] dark:bg-white/[0.02] dark:focus-within:border-violet-400/30 dark:focus-within:bg-[#121620]"
          )}
        >
          {isDraggingFile && (
            <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-violet-500/10 backdrop-blur-xs dark:bg-violet-500/20">
              <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                Solte o arquivo para anexar
              </p>
            </div>
          )}

          {isRecording ? (
            /* Barra de Gravação Ativa Compacta */
            <div className="flex h-10 items-center justify-between px-3">
              <div className="flex items-center gap-2.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
                <span className="flex h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                <span className="tabular-nums font-mono text-[12px]">{formatSeconds(recordSeconds)}</span>
                <div className="flex items-center gap-0.5 h-3 px-1">
                  <span className="w-0.5 h-2 bg-rose-500 rounded-full animate-pulse" />
                  <span className="w-0.5 h-3.5 bg-rose-500 rounded-full animate-pulse [animation-delay:150ms]" />
                  <span className="w-0.5 h-1.5 bg-rose-500 rounded-full animate-pulse [animation-delay:300ms]" />
                  <span className="w-0.5 h-3 bg-rose-500 rounded-full animate-pulse [animation-delay:450ms]" />
                  <span className="w-0.5 h-2 bg-rose-500 rounded-full animate-pulse [animation-delay:200ms]" />
                  <span className="w-0.5 h-3 bg-rose-500 rounded-full animate-pulse [animation-delay:350ms]" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5 rounded-lg border border-black/[0.06] bg-black/[0.02] p-0.5 dark:border-white/[0.08] dark:bg-white/[0.035]">
                  <button
                    type="button"
                    onClick={discardRecording}
                    className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium text-ink-muted transition-colors hover:bg-white hover:text-ink hover:shadow-2xs dark:text-zinc-400 dark:hover:bg-white/[0.07] dark:hover:text-zinc-200"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden />
                    Descartar
                  </button>
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="inline-flex h-7 items-center gap-1.5 rounded-md border border-rose-500/20 bg-rose-500/10 px-2.5 text-[11px] font-semibold text-rose-700 transition-all hover:border-rose-500/30 hover:bg-rose-500/15 active:scale-[0.98] dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300 dark:hover:bg-rose-400/15"
                  >
                    <Square className="h-2.5 w-2.5 fill-current" aria-hidden />
                    Parar
                  </button>
                </div>
              </div>
            </div>
          ) : recordedBlob && previewAudioUrl ? (
            /* Pré-visualização do Áudio com Seeker e Tempo Atual / Duração Total */
            <div className="flex h-11 items-center justify-between gap-3 px-3">
              <audio
                ref={previewAudioRef}
                src={previewAudioUrl}
                preload="metadata"
                onLoadedMetadata={() => {
                  const audio = previewAudioRef.current;
                  if (audio && isFinite(audio.duration) && audio.duration > 0) {
                    setRecordedDuration((currentDuration) =>
                      Math.max(currentDuration, audio.duration)
                    );
                  }
                }}
                onTimeUpdate={() => {
                  if (previewAudioRef.current) {
                    const ct = previewAudioRef.current.currentTime;
                    setPreviewCurrentTime(Math.min(ct, recordedDuration || ct));
                  }
                }}
                onEnded={() => {
                  setPreviewPlaying(false);
                  setPreviewCurrentTime(0);
                }}
              />
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <button
                  type="button"
                  onClick={togglePreviewAudio}
                  aria-label={previewPlaying ? "Pausar prévia" : "Reproduzir prévia"}
                  title={previewPlaying ? "Pausar prévia" : "Reproduzir prévia"}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white hover:bg-violet-700 transition-colors shadow-xs active:scale-95 cursor-pointer"
                >
                  {previewPlaying ? (
                    <Pause className="h-3.5 w-3.5 fill-current" />
                  ) : (
                    <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
                  )}
                </button>

                <div className="flex flex-1 flex-col justify-center min-w-0">
                  <input
                    type="range"
                    min={0}
                    max={recordedDuration || 1}
                    step="any"
                    value={Math.max(0, Math.min(previewCurrentTime, recordedDuration || 1))}
                    onChange={handlePreviewSeek}
                    aria-label="Progresso do áudio"
                    aria-valuemin={0}
                    aria-valuemax={recordedDuration || 1}
                    aria-valuenow={Math.max(0, Math.min(previewCurrentTime, recordedDuration || 1))}
                    aria-valuetext={formatSeconds(previewCurrentTime)}
                    style={
                      {
                        "--nf-audio-progress": `${
                          recordedDuration > 0
                            ? Math.max(0, Math.min((previewCurrentTime / recordedDuration) * 100, 100))
                            : 0
                        }%`,
                      } as CSSProperties
                    }
                    className="nf-audio-slider w-full focus:outline-none focus-visible:ring-1 focus-visible:ring-violet-500/40"
                  />
                  <div className="mt-0.5 flex items-center justify-between text-[10px] tabular-nums font-mono text-ink-muted/80 dark:text-zinc-400">
                    <span className="font-semibold text-ink dark:text-zinc-200">
                      {formatSeconds(previewCurrentTime)}
                    </span>
                    <span>{formatSeconds(recordedDuration)}</span>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={discardRecording}
                  disabled={isSendingVoice}
                  className="rounded-md px-2 py-1 text-xs font-medium text-ink-muted hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400 transition-colors cursor-pointer"
                >
                  Descartar
                </button>
                <button
                  type="button"
                  onClick={submitVoice}
                  disabled={isSendingVoice}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md bg-violet-600 px-3 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50 shadow-xs active:scale-95 transition-all cursor-pointer"
                >
                  {isSendingVoice ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3 w-3" />
                  )}
                  <span>Enviar áudio</span>
                </button>
              </div>
            </div>
          ) : (
            /* Área de Texto Compacta com Auto-Resize */
            <>
              <textarea
                ref={textareaRef}
                disabled={disabled}
                className="max-h-[120px] min-h-[36px] w-full resize-none border-0 bg-transparent px-3 pt-2 pb-1 text-[13px] leading-relaxed text-ink outline-none ring-0 placeholder:text-ink-faint dark:text-zinc-100 focus:ring-0 focus:outline-none"
                placeholder={
                  placeholder ||
                  (internal
                    ? "Escreva uma nota para a equipe…"
                    : "Escreva uma mensagem…")
                }
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onPaste={(e) => {
                  if (internal) return;
                  const items = e.clipboardData?.items;
                  if (!items) return;
                  for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    if (item.type.indexOf("image") !== -1) {
                      const file = item.getAsFile();
                      if (file) {
                        e.preventDefault();
                        onSelectFile(file);
                        break;
                      }
                    }
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (message.trim() && !isSending && !disabled) {
                      onSend(e as unknown as FormEvent);
                    }
                  }
                }}
              />

              {/* Barra Inferior de Ações Alinhada e Compacta */}
              <div className="flex items-center justify-between gap-2 px-2 pb-1.5 pt-0.5 border-t border-black/[0.03] dark:border-white/[0.03]">
                <div className="flex items-center gap-1">
                  {/* Menu Popover de Anexos */}
                  <div className="relative" ref={attachmentMenuRef}>
                    <button
                      type="button"
                      disabled={internal || disabled}
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-black/5 hover:text-ink dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed",
                        attachmentMenuOpen && "bg-black/5 text-ink dark:bg-white/10 dark:text-zinc-200"
                      )}
                      onClick={() => setAttachmentMenuOpen((prev) => !prev)}
                      title={internal ? "Anexos não disponíveis em notas internas" : "Anexar mídia ou documento"}
                      aria-label={internal ? "Anexos não disponíveis em notas internas" : "Anexar mídia ou documento"}
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                    </button>

                    {attachmentMenuOpen && !internal && (
                      <div className="absolute bottom-full left-0 mb-2 w-56 rounded-xl border border-black/[0.08] bg-white p-1.5 shadow-2xl dark:border-white/[0.1] dark:bg-[#181c24] z-30 animate-scale-in">
                        <button
                          type="button"
                          onClick={() => {
                            setAttachmentMenuOpen(false);
                            imageInputRef.current?.click();
                          }}
                          className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                        >
                          <div className="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:bg-violet-400/10 dark:text-violet-300">
                            <ImageIcon className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-ink dark:text-zinc-100">Foto ou vídeo</p>
                            <p className="text-[10px] text-ink-muted dark:text-zinc-400">Imagens e vídeos</p>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAttachmentMenuOpen(false);
                            docInputRef.current?.click();
                          }}
                          className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                        >
                          <div className="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:bg-sky-400/10 dark:text-sky-300">
                            <FileText className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-ink dark:text-zinc-100">Documento</p>
                            <p className="text-[10px] text-ink-muted dark:text-zinc-400">PDF, Word e planilhas</p>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAttachmentMenuOpen(false);
                            fileInputRef.current?.click();
                          }}
                          className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                        >
                          <div className="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-lg bg-zinc-500/10 text-zinc-600 dark:bg-zinc-400/10 dark:text-zinc-300">
                            <FileIcon className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-ink dark:text-zinc-100">Arquivo</p>
                            <p className="text-[10px] text-ink-muted dark:text-zinc-400">Outros formatos suportados</p>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Gravação de Voz */}
                  <button
                    type="button"
                    disabled={internal || disabled}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-black/5 hover:text-ink dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    onClick={startRecording}
                    title={internal ? "Gravação de voz não disponível em notas internas" : "Gravar mensagem de voz"}
                    aria-label={internal ? "Gravação de voz não disponível em notas internas" : "Gravar mensagem de voz"}
                  >
                    <Mic className="h-3.5 w-3.5" />
                  </button>

                  {/* Sugestão de IA */}
                  {onRequestAi && !internal && (
                    <button
                      type="button"
                      disabled={aiLoading || disabled}
                      onClick={onRequestAi}
                      className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-violet-700 hover:bg-violet-500/10 disabled:opacity-40 dark:text-violet-300 dark:hover:bg-violet-400/10 transition-colors"
                      title="Gerar sugestão de resposta com IA"
                      aria-label="Gerar sugestão de resposta com IA"
                    >
                      <Sparkles className="h-3 w-3" />
                      <span>{aiLoading ? "Sugerindo…" : "Sugerir"}</span>
                    </button>
                  )}
                </div>

                {/* Botão Principal de Envio / Salvar Nota */}
                <button
                  type="submit"
                  disabled={isSending || disabled || !message.trim()}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-all shadow-2xs active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed",
                    internal
                      ? "bg-amber-600 text-white hover:bg-amber-700"
                      : "bg-violet-600 text-white hover:bg-violet-700"
                  )}
                >
                  {isSending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      <span>{internal ? "Salvar nota" : "Enviar"}</span>
                      {!internal && <Send className="h-2.5 w-2.5" />}
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </form>

      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={imageInputRef}
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSelectFile(f);
          e.target.value = "";
        }}
      />
      <input
        type="file"
        ref={docInputRef}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSelectFile(f);
          e.target.value = "";
        }}
      />
      <input
        type="file"
        ref={fileInputRef}
        accept="*/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSelectFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
