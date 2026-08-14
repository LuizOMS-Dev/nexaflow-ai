import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Entrar · NexaFlow AI",
  description:
    "Acesse a plataforma NexaFlow AI — atendimento WhatsApp, CRM e agentes de IA.",
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
