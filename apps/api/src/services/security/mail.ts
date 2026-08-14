import { env } from "../../lib/env";

/**
 * Camada de e-mail da plataforma.
 *
 * Providers:
 * - log / console → dev (conteúdo redigido de tokens longos)
 * - none → não envia (default em production sem config)
 * - resend → API Resend (MAIL_API_KEY ou RESEND_API_KEY)
 *
 * Production: configure MAIL_PROVIDER=resend + MAIL_API_KEY + MAIL_FROM.
 */
export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  tags?: string[];
};

function redactSecrets(text: string): string {
  return text.replace(/[A-Za-z0-9_-]{20,}/g, "[REDACTED_TOKEN]");
}

export function getMailStatus(): {
  provider: string;
  configured: boolean;
  canSend: boolean;
} {
  const provider = env.mailProvider;
  if (provider === "none") {
    return { provider, configured: true, canSend: false };
  }
  if (provider === "log" || provider === "console") {
    return { provider: "log", configured: true, canSend: false };
  }
  if (provider === "resend") {
    const ok = Boolean(env.mailApiKey);
    return { provider, configured: ok, canSend: ok };
  }
  return { provider, configured: false, canSend: false };
}

export async function sendMail(msg: MailMessage): Promise<{ sent: boolean; mode: string }> {
  const provider = env.mailProvider;

  if (provider === "none") {
    return { sent: false, mode: "none" };
  }

  if (provider === "log" || provider === "console") {
    if (env.nodeEnv === "production") {
      console.warn(`[mail] não entregue to=${msg.to} subject=${msg.subject} (provider=log)`);
      return { sent: false, mode: "disabled-log" };
    }
    const safe = redactSecrets(msg.text);
    console.info(`[mail:dev] to=${msg.to}\nsubject=${msg.subject}\n${safe}`);
    return { sent: true, mode: "dev-log" };
  }

  if (provider === "resend") {
    const apiKey = env.mailApiKey;
    const from = env.mailFrom;
    if (!apiKey) {
      console.warn("[mail] resend sem MAIL_API_KEY/RESEND_API_KEY");
      return { sent: false, mode: "resend-missing-key" };
    }
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [msg.to],
          subject: msg.subject,
          text: msg.text,
          html: msg.html || undefined,
          tags: msg.tags?.map((name) => ({ name, value: "nexaflow" })),
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`[mail:resend] HTTP ${res.status} ${body.slice(0, 200)}`);
        return { sent: false, mode: "resend-error" };
      }
      return { sent: true, mode: "resend" };
    } catch (err) {
      console.error("[mail:resend]", err instanceof Error ? err.message : err);
      return { sent: false, mode: "resend-exception" };
    }
  }

  console.warn(`[mail] provider desconhecido: ${provider}`);
  return { sent: false, mode: "unknown" };
}

export function appPublicUrl(): string {
  return env.appPublicUrl;
}
