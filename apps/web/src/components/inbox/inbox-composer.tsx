"use client";

import { useRef, useState, useEffect, type FormEvent } from "react";
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
  Trash2,
  Square,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatSeconds } from "@/lib/media";

export type InboxComposerProps = {
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
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);
  const [isSendingVoice, setIsSendingVoice] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-resize do textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const newHeight = Math.min(Math.max(el.scrollHeight, 44), 140);
    el.style.height = `${newHeight}px`;
  }, [message]);

  // Fecha menu de anexos ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (attachmentMenuRef.current && !attachmentMenuRef.current.contains(e.target as Node)) {
        setAttachmentMenuOpen(false);
      }
    };
    if (attachmentMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [attachmentMenuOpen]);

  // Iniciar Gravação de Áudio
  const startRecording = async () => {
    try {
      chunksRef.current = [];
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

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const finalType = recorder.mimeType || "audio/ogg";
        const blob = new Blob(chunksRef.current, { type: finalType });
        setRecordedBlob(blob);
        setRecordedDuration(recordSeconds);
      };

      recorder.start(100);
      setIsRecording(true);
      setRecordSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch {
      alert("Permissão de microfone negada ou indisponível.");
    }
  };

  // Parar gravação
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

  // Descartar gravação
  const discardRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    if (previewAudio) {
      previewAudio.pause();
      previewAudio.src = "";
    }
    setIsRecording(false);
    setRecordSeconds(0);
    setRecordedBlob(null);
    setRecordedDuration(0);
    setPreviewPlaying(false);
  };

  // Enviar áudio gravado
  const submitVoice = async () => {
    if (!recordedBlob) return;
    setIsSendingVoice(true);
    try {
      await onSendVoice(recordedBlob, Math.max(1, recordedDuration));
      discardRecording();
    } finally {
      setIsSendingVoice(false);
    }
  };

  // Toggle do preview do áudio gravado
  const togglePreviewAudio = () => {
    if (!recordedBlob) return;
    if (previewPlaying && previewAudio) {
      previewAudio.pause();
      setPreviewPlaying(false);
      return;
    }
    const url = URL.createObjectURL(recordedBlob);
    const audio = new Audio(url);
    audio.onended = () => setPreviewPlaying(false);
    audio.onerror = () => setPreviewPlaying(false);
    audio.play();
    setPreviewAudio(audio);
    setPreviewPlaying(true);
  };

  return (
    <div className="shrink-0 border-t border-black/[0.06] bg-white px-3 py-2.5 dark:border-white/[0.06] dark:bg-[#0e1117] sm:px-4">
      {/* Segmented Mode: Responder vs Nota Interna */}
      <div className="mb-2 flex items-center justify-between">
        <div className="inline-flex rounded-lg bg-black/[0.04] p-0.5 dark:bg-white/[0.06]">
          <button
            type="button"
            onClick={() => setInternal(false)}
            className={cn(
              "rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-all",
              !internal
                ? "bg-white text-ink shadow-xs dark:bg-[#1a1f2c] dark:text-zinc-100"
                : "text-ink-muted hover:text-ink dark:text-zinc-400 dark:hover:text-zinc-200"
            )}
          >
            Responder
          </button>
          <button
            type="button"
            onClick={() => setInternal(true)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-all",
              internal
                ? "bg-amber-500/15 text-amber-900 shadow-xs dark:bg-amber-400/20 dark:text-amber-100"
                : "text-ink-muted hover:text-ink dark:text-zinc-400 dark:hover:text-zinc-200"
            )}
          >
            <StickyNote className="h-3 w-3" />
            Nota interna
          </button>
        </div>

        {internal && (
          <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
            Somente equipe · Visível apenas internamente
          </span>
        )}
      </div>

      {/* Caixa de Entrada Unificada */}
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
            "relative rounded-xl border transition-all duration-150",
            isDraggingFile
              ? "border-violet-500 bg-violet-50/70 ring-2 ring-violet-500/20 dark:border-violet-400 dark:bg-violet-950/30"
              : internal
                ? "border-amber-500/35 bg-amber-500/[0.04] focus-within:border-amber-500/50 focus-within:ring-1 focus-within:ring-amber-500/20 dark:border-amber-400/30 dark:bg-amber-500/[0.05]"
                : "border-black/[0.08] bg-black/[0.015] focus-within:border-violet-500/35 focus-within:bg-white focus-within:ring-1 focus-within:ring-violet-500/20 dark:border-white/[0.08] dark:bg-white/[0.02] dark:focus-within:border-violet-400/35 dark:focus-within:bg-[#12161f]"
          )}
        >
          {isDraggingFile && (
            <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-violet-500/10 backdrop-blur-sm dark:bg-violet-500/20">
              <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                Solte o arquivo para anexar
              </p>
            </div>
          )}

          {isRecording ? (
            /* Barra de Gravação Ativa */
            <div className="flex h-11 items-center justify-between px-3">
              <div className="flex items-center gap-2.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
                <span className="flex h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                <span className="tabular-nums font-mono text-[12.5px]">{formatSeconds(recordSeconds)}</span>
                <div className="flex items-center gap-0.5 h-3 px-1">
                  <span className="w-0.5 h-2 bg-rose-500 rounded-full animate-pulse" />
                  <span className="w-0.5 h-3.5 bg-rose-500 rounded-full animate-pulse [animation-delay:150ms]" />
                  <span className="w-0.5 h-1.5 bg-rose-500 rounded-full animate-pulse [animation-delay:300ms]" />
                  <span className="w-0.5 h-3 bg-rose-500 rounded-full animate-pulse [animation-delay:450ms]" />
                  <span className="w-0.5 h-2 bg-rose-500 rounded-full animate-pulse [animation-delay:200ms]" />
                  <span className="w-0.5 h-3 bg-rose-500 rounded-full animate-pulse [animation-delay:350ms]" />
                  <span className="w-0.5 h-1.5 bg-rose-500 rounded-full animate-pulse [animation-delay:500ms]" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={discardRecording}
                  className="rounded-md px-2.5 py-1 text-xs font-medium text-ink-muted hover:bg-black/5 hover:text-ink dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-200 transition-colors"
                >
                  Descartar
                </button>
                <button
                  type="button"
                  onClick={stopRecording}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md bg-rose-600 px-3 text-xs font-medium text-white hover:bg-rose-700 transition-colors shadow-xs active:scale-95"
                >
                  <Square className="h-3 w-3 fill-current" />
                  Parar
                </button>
              </div>
            </div>
          ) : recordedBlob ? (
            /* Pré-visualização do Áudio antes do envio */
            <div className="flex h-11 items-center justify-between px-3">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={togglePreviewAudio}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-600 text-white hover:bg-violet-700 transition-all shadow-xs"
                >
                  {previewPlaying ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current ml-0.5" />}
                </button>
                <span className="text-xs font-mono font-medium tabular-nums text-ink dark:text-zinc-200">
                  {formatSeconds(recordedDuration)}
                </span>
                <span className="text-[11px] text-ink-muted dark:text-zinc-400">Áudio gravado</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={discardRecording}
                  disabled={isSendingVoice}
                  className="rounded-md px-2.5 py-1 text-xs font-medium text-ink-muted hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400 transition-colors"
                >
                  Excluir
                </button>
                <button
                  type="button"
                  onClick={submitVoice}
                  disabled={isSendingVoice}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md bg-violet-600 px-3 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50 shadow-xs active:scale-95 transition-all"
                >
                  {isSendingVoice ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Enviar
                </button>
              </div>
            </div>
          ) : (
            /* Área de Texto Padrão */
            <>
              <textarea
                ref={textareaRef}
                disabled={disabled}
                className="max-h-[140px] min-h-[44px] w-full resize-none border-0 bg-transparent px-3 pt-2.5 pb-1 text-[13.5px] leading-relaxed text-ink outline-none placeholder:text-ink-faint dark:text-zinc-100"
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

              {/* Barra Inferior de Ações */}
              <div className="flex items-center justify-between gap-2 px-2.5 pb-2 pt-1 border-t border-black/[0.04] dark:border-white/[0.04]">
                <div className="flex items-center gap-1">
                  {/* Menu Popover de Anexos */}
                  <div className="relative" ref={attachmentMenuRef}>
                    <button
                      type="button"
                      disabled={internal || disabled}
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-black/5 hover:text-ink dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-200 transition-colors disabled:opacity-40",
                        attachmentMenuOpen && "bg-black/5 text-ink dark:bg-white/10 dark:text-zinc-200"
                      )}
                      onClick={() => setAttachmentMenuOpen((prev) => !prev)}
                      title="Anexar mídia ou documento"
                    >
                      <Paperclip className="h-4 w-4" />
                    </button>

                    {attachmentMenuOpen && (
                      <div className="absolute bottom-full left-0 mb-2.5 w-60 rounded-xl border border-black/[0.08] bg-white p-1.5 shadow-2xl dark:border-white/[0.1] dark:bg-[#181c24] z-30 animate-scale-in">
                        <button
                          type="button"
                          onClick={() => {
                            setAttachmentMenuOpen(false);
                            imageInputRef.current?.click();
                          }}
                          className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:bg-violet-400/10 dark:text-violet-300">
                            <ImageIcon className="h-4 w-4" />
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
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:bg-sky-400/10 dark:text-sky-300">
                            <FileText className="h-4 w-4" />
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
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-500/10 text-zinc-600 dark:bg-zinc-400/10 dark:text-zinc-300">
                            <FileIcon className="h-4 w-4" />
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
                    className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-black/5 hover:text-ink dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-200 transition-colors disabled:opacity-40"
                    onClick={startRecording}
                    title="Gravar mensagem de voz"
                  >
                    <Mic className="h-4 w-4" />
                  </button>

                  {/* Sugestão de IA */}
                  {onRequestAi && !internal && (
                    <button
                      type="button"
                      disabled={aiLoading || disabled}
                      onClick={onRequestAi}
                      className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11.5px] font-medium text-violet-700 hover:bg-violet-500/10 disabled:opacity-50 dark:text-violet-300 dark:hover:bg-violet-400/10 transition-colors"
                      title="Gerar sugestão de resposta com IA"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {aiLoading ? "Sugerindo…" : "Sugerir"}
                    </button>
                  )}
                </div>

                {/* Botão Enviar */}
                <button
                  type="submit"
                  disabled={isSending || disabled || !message.trim()}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-all shadow-sm active:scale-95 disabled:opacity-40",
                    internal
                      ? "bg-amber-600 text-white hover:bg-amber-700"
                      : "bg-violet-600 text-white hover:bg-violet-700"
                  )}
                >
                  {isSending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <span>{internal ? "Salvar nota" : "Enviar"}</span>
                      {!internal && <Send className="h-3 w-3" />}
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
