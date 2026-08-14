"use client";

import { useRef, useState, type DragEvent } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { ApiError } from "@/lib/api";
import {
  DialogFooter,
  FormField,
  Modal,
  Select,
  Spinner,
  Switch,
  WizardSteps,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import { IMPORT_FIELD_OPTIONS, IMPORT_MAX_ROWS } from "../types";
import type { useContactImport } from "../hooks/use-contact-import";

type Imp = ReturnType<typeof useContactImport>;

type Props = {
  imp: Imp;
};

const SAMPLE_LABELS: Record<string, string> = {
  name: "Nome",
  phone: "Telefone",
  email: "E-mail",
  company: "Empresa",
  jobTitle: "Cargo",
  city: "Cidade",
  state: "Estado",
  source: "Origem",
  document: "Documento",
  notes: "Notas",
};

export function ContactImportWizard({ imp }: Props) {
  const {
    open,
    close,
    step,
    setStep,
    steps,
    fileName,
    preview,
    fieldMap,
    setHeaderField,
    skipDuplicates,
    setSkipDuplicates,
    result,
    localError,
    loadFile,
    loadText,
    previewMut,
    commitMut,
    issues,
    samples,
    canMapContinue,
    tooManyRows,
  } = imp;

  const fileRef = useRef<HTMLInputElement>(null);
  const [paste, setPaste] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const commitErr =
    commitMut.error instanceof ApiError ? commitMut.error : null;

  function handleClose() {
    if (previewMut.isPending || commitMut.isPending) return;
    setPaste("");
    close();
  }

  async function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await loadFile(file);
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Importar contatos"
      description="O servidor lê o CSV. O mapeamento precisa ter nome ou telefone."
      variant="soft"
      size="lg"
      preventClose={previewMut.isPending || commitMut.isPending}
      footer={
        <DialogFooter>
          <button
            type="button"
            className="btn-secondary h-9"
            onClick={handleClose}
            disabled={previewMut.isPending || commitMut.isPending}
          >
            {step >= 5 ? "Fechar" : "Cancelar"}
          </button>
          {step === 2 ? (
            <button
              type="button"
              className="btn-primary h-9"
              disabled={!canMapContinue || tooManyRows}
              onClick={() => setStep(3)}
            >
              Validar
            </button>
          ) : null}
          {step === 3 ? (
            <button type="button" className="btn-primary h-9" onClick={() => setStep(4)}>
              Revisar
            </button>
          ) : null}
          {step === 4 ? (
            <button
              type="button"
              className="btn-primary h-9"
              disabled={commitMut.isPending || tooManyRows}
              onClick={() => commitMut.mutate()}
            >
              {commitMut.isPending ? "Importando…" : "Importar"}
            </button>
          ) : null}
        </DialogFooter>
      }
    >
      <WizardSteps steps={[...steps]} current={step - 1} />

      {step === 1 ? (
        <div className="space-y-3">
          <div
            className={cn(
              "flex flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-10 text-center",
              dragOver
                ? "border-brand-500/50 bg-brand-500/[0.04]"
                : "border-black/[0.1] bg-black/[0.015] dark:border-white/[0.1] dark:bg-white/[0.02]"
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <FileSpreadsheet className="mb-2 h-6 w-6 text-ink-faint" aria-hidden />
            <p className="text-[13.5px] font-medium text-ink dark:text-white">
              Arraste um .csv ou escolha o arquivo
            </p>
            <p className="mt-1 text-[12px] text-ink-muted">
              Máximo {IMPORT_MAX_ROWS.toLocaleString("pt-BR")} linhas · 2 MB
            </p>
            <button
              type="button"
              className="btn-secondary mt-4 h-9 gap-1.5"
              onClick={() => fileRef.current?.click()}
              disabled={previewMut.isPending}
            >
              <Upload className="h-3.5 w-3.5" />
              Escolher arquivo
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void loadFile(file);
                e.target.value = "";
              }}
            />
          </div>
          <details className="rounded-xl border border-black/[0.06] px-3 py-2 dark:border-white/[0.07]">
            <summary className="cursor-pointer text-[12.5px] font-medium text-ink-secondary">
              Avançado — colar texto CSV
            </summary>
            <textarea
              className="input mt-2 min-h-[120px] font-mono text-[12px]"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder="nome,telefone,email"
            />
            <button
              type="button"
              className="btn-secondary mt-2 h-8 text-[12px]"
              disabled={!paste.trim() || previewMut.isPending}
              onClick={() => loadText(paste, "colar.csv")}
            >
              Usar texto colado
            </button>
          </details>
          {previewMut.isPending ? (
            <div className="flex items-center gap-2 text-[12.5px] text-ink-muted">
              <Spinner className="h-4 w-4" /> Lendo no servidor…
            </div>
          ) : null}
          {localError ? (
            <p className="text-[12.5px] text-rose-600 dark:text-rose-400" role="alert">
              {localError}
            </p>
          ) : null}
        </div>
      ) : null}

      {step === 2 && preview ? (
        <div className="space-y-3">
          <p className="text-[12.5px] text-ink-muted">
            {fileName ? `${fileName} · ` : ""}
            {preview.rowCount.toLocaleString("pt-BR")} linhas · delimitador{" "}
            {preview.delimiter === "\t" ? "tab" : preview.delimiter}
          </p>
          {tooManyRows ? (
            <p className="text-[12.5px] text-rose-600" role="alert">
              Máximo {IMPORT_MAX_ROWS.toLocaleString("pt-BR")} linhas.
            </p>
          ) : null}
          {!canMapContinue ? (
            <p className="text-[12.5px] text-amber-700 dark:text-amber-200">
              Mapeie pelo menos Nome ou Telefone.
            </p>
          ) : null}
          <div className="space-y-2">
            {preview.headers.map((h) => (
              <div
                key={h}
                className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_14rem]"
              >
                <p className="truncate text-[13px] text-ink dark:text-gray-200">{h || "—"}</p>
                <Select
                  size="sm"
                  value={fieldMap[h] || "skip"}
                  onChange={(v) => setHeaderField(h, v)}
                  options={IMPORT_FIELD_OPTIONS}
                  aria-label={`Mapear coluna ${h}`}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-3">
          <p className="text-[12.5px] text-ink-muted">
            Contagens locais no arquivo — não consultam duplicata no tenant.
            A importação final é validada no servidor.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            <Stat label="Linhas no arquivo" value={issues.rows} />
            <Stat label="Sem nome e telefone" value={issues.missingIdentity} warn />
            <Stat label="Telefone inválido" value={issues.invalidPhone} warn />
            <Stat label="E-mail inválido" value={issues.invalidEmail} warn />
          </ul>
          {preview?.warnings.length ? (
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-faint">
                Avisos do servidor
              </p>
              <ul className="space-y-1 text-[12.5px] text-ink-secondary">
                {preview.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 4 ? (
        <div className="space-y-3">
          <Switch
            checked={skipDuplicates}
            onChange={setSkipDuplicates}
            label="Pular duplicatas"
            description="Telefone ou e-mail já existentes no tenant não são recriados."
          />
          <p className="text-[12px] text-ink-muted">
            Amostra mapeada (até 5 linhas do preview do servidor)
          </p>
          <div className="overflow-x-auto rounded-xl border border-black/[0.06] dark:border-white/[0.07]">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-black/[0.05] text-[11px] text-ink-faint dark:border-white/[0.06]">
                  {Object.keys(samples[0] || { name: "" }).map((k) => (
                    <th key={k} className="px-2.5 py-1.5 font-medium">
                      {SAMPLE_LABELS[k] ?? k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {samples.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-black/[0.04] last:border-0 dark:border-white/[0.05]"
                  >
                    {Object.values(row).map((v, j) => (
                      <td key={j} className="max-w-[10rem] truncate px-2.5 py-1.5">
                        {v || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {commitErr ? (
            <p className="text-[12.5px] text-rose-600 dark:text-rose-400" role="alert">
              {commitErr.message}
            </p>
          ) : null}
        </div>
      ) : null}

      {step === 5 ? (
        <div className="space-y-3">
          {commitMut.isPending ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : result ? (
            <>
              <ul className="grid gap-2 sm:grid-cols-3">
                <Stat label="Criados" value={result.created} />
                <Stat label="Ignorados" value={result.skipped} />
                <Stat label="Inválidos" value={result.invalid} warn />
              </ul>
              {result.errors.length ? (
                <div>
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-faint">
                    Até 50 erros
                  </p>
                  <ul className="max-h-40 space-y-1 overflow-y-auto text-[12.5px] text-ink-secondary">
                    {result.errors.map((err) => (
                      <li key={`${err.row}-${err.message}`}>
                        Linha {err.row}: {err.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : commitErr ? (
            <p className="text-[12.5px] text-rose-600 dark:text-rose-400" role="alert">
              {commitErr.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <li className="rounded-xl border border-black/[0.05] px-3 py-2 dark:border-white/[0.06]">
      <p className="text-[11px] text-ink-faint">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-[1.15rem] font-semibold tabular-nums",
          warn && value > 0
            ? "text-amber-700 dark:text-amber-200"
            : "text-ink dark:text-white"
        )}
      >
        {value.toLocaleString("pt-BR")}
      </p>
    </li>
  );
}
