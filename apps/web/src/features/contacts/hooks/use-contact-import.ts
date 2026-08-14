"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { commitContactImport, previewContactImport } from "../api";
import { IMPORT_MAX_CHARS, IMPORT_MAX_ROWS, type ImportPreview, type ImportResult } from "../types";

const WIZARD_STEPS = ["Arquivo", "Mapear", "Validar", "Revisar", "Importar"] as const;

export type ImportIssueCounts = {
  rows: number;
  missingIdentity: number;
  invalidPhone: number;
  invalidEmail: number;
  mappedName: boolean;
  mappedPhone: boolean;
};

/** Parser local só para contagens/amostras — o commit envia o CSV cru. */
function parseCsv(text: string, delimiter: string): { headers: string[]; rows: string[][] } {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    if (row.every((c) => c.trim() === "")) {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (inQuotes) {
      if (ch === '"') {
        if (next === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      pushField();
      continue;
    }
    if (ch === "\r") {
      pushField();
      pushRow();
      if (next === "\n") i++;
      continue;
    }
    if (ch === "\n") {
      pushField();
      pushRow();
      continue;
    }
    field += ch;
  }
  pushField();
  if (row.length > 1 || (row.length === 1 && row[0] !== "")) pushRow();

  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => h.trim());
  const data = rows.slice(1).map((r) => {
    const out = r.slice(0, headers.length);
    while (out.length < headers.length) out.push("");
    return out;
  });
  return { headers, rows: data };
}

function looksLikePhone(raw: string): boolean {
  if (!/^[\d\s+\-()./]+$/.test(raw.trim())) return false;
  const d = raw.replace(/\D/g, "");
  return d.length >= 10 && d.length <= 15 && !/^(\d)\1{9,}$/.test(d);
}

function looksLikeEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(raw.trim());
}

function mapRow(
  headers: string[],
  cells: string[],
  fieldMap: Record<string, string>
): { name: string; phone: string; email: string; extras: Record<string, string> } {
  const extras: Record<string, string> = {};
  let name = "";
  let phone = "";
  let email = "";
  headers.forEach((h, i) => {
    const field = fieldMap[h];
    if (!field || field === "skip") return;
    const value = (cells[i] ?? "").trim();
    if (field === "name") name = value;
    else if (field === "phone") phone = value;
    else if (field === "email") email = value;
    else extras[field] = value;
  });
  return { name, phone, email, extras };
}

function countIssues(
  csv: string,
  delimiter: string,
  fieldMap: Record<string, string>
): ImportIssueCounts {
  const parsed = parseCsv(csv, delimiter);
  const mappedName = Object.values(fieldMap).includes("name");
  const mappedPhone = Object.values(fieldMap).includes("phone");
  let missingIdentity = 0;
  let invalidPhone = 0;
  let invalidEmail = 0;
  for (const cells of parsed.rows) {
    const row = mapRow(parsed.headers, cells, fieldMap);
    if (!row.name && !looksLikePhone(row.phone)) missingIdentity++;
    if (row.phone && !looksLikePhone(row.phone)) invalidPhone++;
    if (row.email && !looksLikeEmail(row.email)) invalidEmail++;
  }
  return {
    rows: parsed.rows.length,
    missingIdentity,
    invalidPhone,
    invalidEmail,
    mappedName,
    mappedPhone,
  };
}

function mappedSamples(
  preview: ImportPreview | null,
  fieldMap: Record<string, string>
): Array<Record<string, string>> {
  if (!preview) return [];
  return preview.sample.slice(0, 5).map((raw) => {
    const out: Record<string, string> = {};
    for (const [header, field] of Object.entries(fieldMap)) {
      if (!field || field === "skip") continue;
      out[field] = raw[header] ?? "";
    }
    return out;
  });
}

export function useContactImport() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fieldMap, setFieldMap] = useState<Record<string, string>>({});
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep(1);
    setCsv("");
    setFileName("");
    setPreview(null);
    setFieldMap({});
    setSkipDuplicates(true);
    setResult(null);
    setLocalError(null);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    reset();
  }, [reset]);

  const previewMut = useMutation({
    mutationFn: (text: string) => previewContactImport(text),
    onSuccess: (data) => {
      setPreview(data);
      setFieldMap(data.suggestedMap);
      setResult(null);
      setLocalError(null);
      setStep(2);
    },
    onError: (err) => {
      setLocalError(err instanceof ApiError ? err.message : "Não foi possível ler o CSV");
    },
  });

  const commitMut = useMutation({
    mutationFn: () =>
      commitContactImport({
        csv,
        fieldMap,
        skipDuplicates,
        delimiter: preview?.delimiter,
      }),
    onSuccess: (data) => {
      setResult(data);
      setStep(5);
      void qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });

  const loadText = useCallback(
    (text: string, name?: string) => {
      setLocalError(null);
      if (!text.trim()) {
        setLocalError("Cole ou escolha um arquivo CSV.");
        return;
      }
      if (text.length > IMPORT_MAX_CHARS) {
        setLocalError("Arquivo acima de 2 MB. Reduza o CSV.");
        return;
      }
      setCsv(text);
      if (name) setFileName(name);
      previewMut.mutate(text);
    },
    [previewMut]
  );

  const loadFile = useCallback(
    async (file: File) => {
      setLocalError(null);
      const lower = file.name.toLowerCase();
      if (!lower.endsWith(".csv") && file.type !== "text/csv") {
        setLocalError("Use um arquivo .csv.");
        return;
      }
      if (file.size > IMPORT_MAX_CHARS) {
        setLocalError("Arquivo acima de 2 MB. Reduza o CSV.");
        return;
      }
      const text = await file.text();
      loadText(text, file.name);
    },
    [loadText]
  );

  const setHeaderField = useCallback((header: string, field: string) => {
    setFieldMap((prev) => ({ ...prev, [header]: field }));
  }, []);

  const issues = useMemo(
    () => countIssues(csv, preview?.delimiter || ",", fieldMap),
    [csv, preview?.delimiter, fieldMap]
  );

  const samples = useMemo(() => mappedSamples(preview, fieldMap), [preview, fieldMap]);

  const canMapContinue = issues.mappedName || issues.mappedPhone;
  const tooManyRows = (preview?.rowCount ?? 0) > IMPORT_MAX_ROWS;

  return {
    open,
    setOpen,
    close,
    reset,
    step,
    setStep,
    steps: WIZARD_STEPS,
    csv,
    fileName,
    preview,
    fieldMap,
    setHeaderField,
    skipDuplicates,
    setSkipDuplicates,
    result,
    localError,
    setLocalError,
    loadFile,
    loadText,
    previewMut,
    commitMut,
    issues,
    samples,
    canMapContinue,
    tooManyRows,
  };
}
