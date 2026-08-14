"use client";

import { Loader2, Monitor, QrCode, Smartphone } from "lucide-react";
import { Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { HumanState } from "../types";
import { usePairing } from "./use-pairing";

function formatPhone(raw?: string | null) {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) {
    return `+55 ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.length === 12 && d.startsWith("55")) {
    return `+55 ${d.slice(2, 4)} ${d.slice(4, 8)}-${d.slice(8)}`;
  }
  if (d.length >= 10) return `+${d}`;
  return raw;
}

function headerDot(phase: HumanState): { label: string; tone: "off" | "wait" | "on" | "err" } {
  if (phase === "connected") return { label: "Conectado", tone: "on" };
  if (phase === "preparing" || phase === "awaiting_qr" || phase === "reconnecting") {
    return { label: "Conectando", tone: "wait" };
  }
  if (phase === "qr_visible") return { label: "Aguardando", tone: "wait" };
  if (phase === "qr_expired") return { label: "QR expirado", tone: "wait" };
  if (phase === "error") return { label: "Erro", tone: "err" };
  return { label: "Desconectado", tone: "off" };
}

function WhatsAppMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden className="wa-mark">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

const STEPS = [
  { icon: Smartphone, text: "Abra o WhatsApp no celular" },
  { icon: Monitor, text: "Acesse Aparelhos conectados" },
  { icon: QrCode, text: "Escaneie o código QR" },
] as const;

export function WhatsAppPairingPage() {
  const p = usePairing();
  const id = p.current?.id;
  const dot = headerDot(p.phase);
  const live = p.phase === "connected";
  const hasQr = p.phase === "qr_visible" && Boolean(p.qr);
  const expired = p.phase === "qr_expired";
  const waiting =
    p.phase === "preparing" ||
    p.phase === "awaiting_qr" ||
    p.phase === "reconnecting" ||
    (p.phase === "qr_visible" && !p.qr);

  function onGenerate() {
    if (!p.canManage) return;
    if (expired && id) {
      p.refresh(id);
      return;
    }
    if (id && p.phase !== "not_configured") p.resume(id);
    else p.start();
  }

  if (p.list.isLoading) {
    return (
      <div className="wa-page">
        <div className="flex h-64 items-center justify-center">
          <Spinner />
        </div>
      </div>
    );
  }

  if (p.list.isError) {
    return (
      <div className="wa-page">
        <header className="wa-head">
          <Title />
        </header>
        <p className="wa-page__err">Não foi possível carregar o canal.</p>
        <button type="button" className="btn-secondary h-9" onClick={() => void p.list.refetch()}>
          Tentar de novo
        </button>
      </div>
    );
  }

  const cta = expired
    ? "Gerar novo QR Code"
    : live
      ? "Reconectar"
      : hasQr
        ? "Atualizar QR Code"
        : "Gerar QR Code";

  return (
    <div className="wa-page">
      {!live ? (
        <div className="wa-bar">
          <span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
            WhatsApp não conectado
          </span>
          {p.canManage ? (
            <button type="button" className="wa-bar__cta" onClick={onGenerate} disabled={p.starting || p.resuming || p.spin}>
              Conectar WhatsApp
            </button>
          ) : null}
        </div>
      ) : null}

      <header className="wa-head">
        <Title />
        <div className="wa-head__side">
          {p.items.length > 1 ? (
            <select
              className="wa-page__switch"
              value={p.current?.id ?? ""}
              onChange={(e) => p.setActiveId(e.target.value)}
              aria-label="Número"
            >
              {p.items.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {p.labelOf(ch)}
                </option>
              ))}
            </select>
          ) : null}
          <span className={cn("wa-pill", `wa-pill--${dot.tone}`)}>
            <i />
            {dot.label}
          </span>
        </div>
      </header>

      {p.fail ? <p className="wa-page__err">{p.fail}</p> : null}

      <section className="wa-card">
        <QrFrame
          qr={hasQr ? p.qr : null}
          waiting={waiting || p.starting || p.spin}
          expired={expired}
          live={live}
          phone={formatPhone(p.phone)}
        />
        <div className="wa-card__copy">
          {live ? (
            <>
              <h2>{formatPhone(p.phone) || "WhatsApp conectado"}</h2>
              <p>Este número já envia e recebe mensagens pelo NexaFlow.</p>
            </>
          ) : expired ? (
            <>
              <h2>QR Code expirado</h2>
              <p>Gere um novo código e escaneie de novo no celular.</p>
            </>
          ) : hasQr ? (
            <>
              <h2>Escaneie o QR Code</h2>
              <p>No WhatsApp, acesse Aparelhos conectados &gt; Conectar aparelho e escaneie este código.</p>
            </>
          ) : (
            <>
              <h2>Conecte seu WhatsApp</h2>
              <p>Escaneie o QR Code com o WhatsApp da empresa para começar a enviar e receber mensagens pelo NexaFlow.</p>
            </>
          )}

          {!live ? (
            <ol className="wa-steps">
              {STEPS.map((s, i) => (
                <li key={s.text}>
                  <span className="wa-steps__ico">
                    <s.icon />
                  </span>
                  <span className="wa-steps__num">{i + 1}</span>
                  {s.text}
                </li>
              ))}
            </ol>
          ) : null}

          {hasQr ? (
            <p className="wa-wait">
              <Loader2 className="wa-spin" />
              Aguardando conexão...
            </p>
          ) : null}

          {p.phase === "error" && p.err ? <p className="wa-page__err wa-page__err--inline">{p.err}</p> : null}

          {p.canManage ? (
            <div className="wa-card__actions">
              <button
                type="button"
                className="wa-btn"
                onClick={onGenerate}
                disabled={p.starting || p.resuming || p.spin}
              >
                {p.starting || p.resuming || p.spin ? (
                  <Loader2 className="wa-spin" />
                ) : (
                  <WhatsAppMark size={16} />
                )}
                {cta}
              </button>
              {hasQr ? (
                <button type="button" className="btn-secondary h-10" onClick={() => id && p.pause(id)}>
                  Cancelar
                </button>
              ) : null}
              {live ? (
                <button type="button" className="btn-secondary h-10" onClick={() => id && p.pause(id)}>
                  Desconectar
                </button>
              ) : null}
            </div>
          ) : (
            <p className="wa-muted">Peça a um administrador para conectar o número.</p>
          )}
        </div>
      </section>

      <section className="wa-status" aria-label="Status do canal">
        <h3>
          <StatusPulse live={live} />
          Status do canal
        </h3>
        <ul>
          <StatusRow
            icon="user"
            title="Sessão"
            hint="Conexão com o WhatsApp"
            on={live}
            wait={waiting || hasQr}
          />
          <StatusRow
            icon="hook"
            title="Webhook"
            hint="Recebimento de mensagens"
            on={live}
            wait={waiting || hasQr}
          />
          <StatusRow
            icon="chat"
            title="Mensagens"
            hint="Envio e recebimento"
            on={live}
            wait={false}
          />
        </ul>
      </section>
    </div>
  );
}

function Title() {
  return (
    <div className="wa-head__title">
      <span className="wa-head__logo">
        <WhatsAppMark size={22} />
      </span>
      <div>
        <h1>WhatsApp</h1>
        <p>Gerencie a conexão do número utilizado pela empresa.</p>
      </div>
    </div>
  );
}

function QrFrame({
  qr,
  waiting,
  expired,
  live,
  phone,
}: {
  qr: string | null;
  waiting: boolean;
  expired: boolean;
  live: boolean;
  phone: string | null;
}) {
  return (
    <div className={cn("wa-frame", live && "is-live")}>
      <span className="wa-frame__c wa-frame__c--tl" />
      <span className="wa-frame__c wa-frame__c--tr" />
      <span className="wa-frame__c wa-frame__c--bl" />
      <span className="wa-frame__c wa-frame__c--br" />
      {live ? (
        <div className="wa-frame__live">
          <WhatsAppMark size={48} />
          {phone ? <strong>{phone}</strong> : <span>Conectado</span>}
        </div>
      ) : qr ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt="QR Code do WhatsApp" width={220} height={220} draggable={false} />
      ) : waiting ? (
        <Loader2 className="wa-spin wa-spin--lg" />
      ) : expired ? (
        <div className="wa-frame__ph">
          <WhatsAppMark size={56} />
          <span>Expirado</span>
        </div>
      ) : (
        <div className="wa-frame__ph">
          <WhatsAppMark size={64} />
        </div>
      )}
    </div>
  );
}

function StatusPulse({ live }: { live: boolean }) {
  return <span className={cn("wa-status__pulse", live && "is-on")} aria-hidden />;
}

function StatusRow({
  icon,
  title,
  hint,
  on,
  wait,
}: {
  icon: "user" | "hook" | "chat";
  title: string;
  hint: string;
  on: boolean;
  wait: boolean;
}) {
  const label = on ? "Conectado" : wait ? "Aguardando" : "Desconectado";
  return (
    <li>
      <span className="wa-status__ico" data-icon={icon} aria-hidden />
      <span>
        <strong>{title}</strong>
        <em>{hint}</em>
      </span>
      <span className={cn("wa-pill", on ? "wa-pill--on" : wait ? "wa-pill--wait" : "wa-pill--off")}>
        <i />
        {label}
      </span>
    </li>
  );
}
