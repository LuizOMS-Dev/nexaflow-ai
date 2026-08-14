"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/logo";

export type AccessKind = "return" | "first" | "admin";
export type AccessStage = "confirm" | "prepare" | "exit";

const STORAGE_KEY = "nexaflow_access_enter";

/** Survives Strict Mode remount so the painel still reveals once. */
let takenKind: AccessKind | null | undefined;

export function markAccessEntrance(kind: AccessKind) {
  takenKind = kind;
  try {
    sessionStorage.setItem(STORAGE_KEY, kind);
  } catch {
    /* ignore */
  }
}

export function peekAccessEntrance(): AccessKind | null {
  if (takenKind) return takenKind;
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    if (v === "return" || v === "first" || v === "admin") {
      takenKind = v;
      return v;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function takeAccessEntrance(): AccessKind | null {
  return peekAccessEntrance();
}

export function clearAccessEntrance() {
  takenKind = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function firstName(name?: string) {
  const n = (name || "").trim().split(/\s+/)[0] || "";
  const banned = new Set(["admin", "administrador", "user", "usuário", "usuario", "superadmin"]);
  if (!n || banned.has(n.toLowerCase())) return "";
  return n[0].toUpperCase() + n.slice(1);
}

export function AccessCinematic({
  kind,
  personName,
  companyName,
  stage,
  intent = "app",
}: {
  kind: AccessKind;
  personName?: string;
  companyName?: string;
  stage: AccessStage;
  /** setup = pousa no cadastro da empresa; app = entra no painel */
  intent?: "setup" | "app";
}) {
  const first = firstName(personName);
  const rawCompany = (companyName || "").trim();
  const company =
    !rawCompany || rawCompany.toLowerCase() === "minha empresa" ? "" : rawCompany;
  const kicker =
    stage === "exit"
      ? "Pronto"
      : kind === "admin"
        ? "Administração"
        : intent === "setup"
          ? "Primeiro acesso"
          : "Acesso";
  const title =
    kind === "admin"
      ? first
        ? `Olá, ${first}`
        : "Plataforma"
      : kind === "first"
        ? first
          ? `Bem-vindo, ${first}`
          : "Bem-vindo"
        : first
          ? `De volta, ${first}`
          : "De volta";
  const line =
    stage === "exit"
      ? intent === "setup"
        ? "Abrindo o cadastro."
        : "Abrindo o painel."
      : kind === "admin"
        ? "Preparando a administração…"
        : intent === "setup"
          ? "Vamos cadastrar sua empresa."
          : company
            ? `Preparando ${company}…`
            : "Preparando o ambiente…";

  return (
    <div
      className={`nf-access-cine is-${stage}`}
      role="status"
      aria-live="polite"
      data-kind={kind}
    >
      <div className="nf-access-cine-veil" aria-hidden />
      <div className="nf-access-cine-grid" aria-hidden />
      <div className="nf-access-cine-bloom" aria-hidden />
      <div className="nf-access-cine-beam" aria-hidden />
      <div className="nf-access-cine-inner">
        <div className="nf-access-cine-mark">
          <Logo variant="full-white" size="lg" withAi />
        </div>
        <p className="nf-access-cine-kicker">{kicker}</p>
        <h2 className="nf-access-cine-title">{title}</h2>
        <p className="nf-access-cine-line" key={line}>
          {line}
        </p>
        <div className="nf-access-cine-track" aria-hidden>
          <span className={stage === "exit" ? "is-done" : undefined} />
        </div>
      </div>
    </div>
  );
}

export function AccessReveal({ kind }: { kind: AccessKind }) {
  const [go, setGo] = useState(false);
  const [off, setOff] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setOff(true);
      return;
    }
    const start = window.setTimeout(() => setGo(true), 48);
    const end = window.setTimeout(() => setOff(true), 820);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(end);
    };
  }, []);

  if (off) return null;

  return (
    <div
      className={`nf-access-reveal ${go ? "is-go" : ""}`}
      aria-hidden
      data-kind={kind}
    >
      <div className="nf-access-reveal-sheet" />
    </div>
  );
}
