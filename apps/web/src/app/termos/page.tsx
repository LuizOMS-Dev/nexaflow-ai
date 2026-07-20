import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Termos de uso",
  description: "Condições gerais para acesso e uso da plataforma NexaFlow.",
};

const sections: LegalSection[] = [
  {
    title: "1. Aplicação dos termos",
    paragraphs: [
      "Estes termos apresentam condições gerais de uso da NexaFlow. Plano, preço, implantação, nível de serviço, suporte, vigência, cancelamento e identificação das partes são definidos na proposta ou no contrato aceito pelo cliente, que prevalece em caso de divergência.",
    ],
  },
  {
    title: "2. Conta e acesso",
    items: [
      "Cada pessoa deve usar sua própria conta e manter senha e segundo fator sob controle.",
      "A empresa cliente administra membros, papéis, canais e configurações do seu ambiente.",
      "Acessos suspeitos, indevidos ou compartilhados devem ser comunicados e revogados sem demora.",
    ],
  },
  {
    title: "3. Uso permitido",
    paragraphs: [
      "A plataforma deve ser usada de forma lícita e de acordo com as autorizações dos titulares, regras de mensageria e políticas dos canais integrados. Não é permitido explorar falhas, contornar limites, disseminar malware, praticar fraude, enviar conteúdo ilícito ou usar dados sem base legítima.",
    ],
  },
  {
    title: "4. Dados da empresa cliente",
    paragraphs: [
      "A empresa cliente decide quais dados insere, importa ou conecta à plataforma e responde pela sua origem, qualidade, finalidade e permissões. A NexaFlow trata esses dados para prestar e proteger o serviço, conforme o contrato e o aviso de privacidade.",
    ],
  },
  {
    title: "5. Inteligência artificial e automações",
    paragraphs: [
      "Respostas de IA podem conter erros e devem ser configuradas, testadas e supervisionadas pela empresa cliente. Decisões jurídicas, financeiras, médicas ou de alto impacto não devem depender apenas de uma resposta automatizada. A disponibilidade e o comportamento também podem variar conforme o provedor configurado.",
    ],
  },
  {
    title: "6. Canais e serviços de terceiros",
    paragraphs: [
      "Integrações como WhatsApp, e-mail e provedores de IA dependem de serviços externos, das suas políticas e da configuração do cliente. A NexaFlow não garante disponibilidade contínua de um terceiro nem autoriza práticas destinadas a contornar suas regras.",
    ],
  },
  {
    title: "7. Planos, cobrança e suspensão",
    paragraphs: [
      "Os recursos e limites são os do plano contratado e do catálogo vigente na plataforma, ressalvadas condições registradas na proposta. Atraso, abuso, risco de segurança ou violação contratual podem levar à restrição ou suspensão conforme as condições acordadas.",
    ],
  },
  {
    title: "8. Disponibilidade e alterações",
    paragraphs: [
      "A plataforma pode receber correções, atualizações e mudanças necessárias à segurança ou evolução do serviço. Incidentes e manutenções podem causar indisponibilidade temporária. Compromissos específicos de disponibilidade e suporte só existem quando registrados no contrato aplicável.",
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Condições de uso"
      title="Termos de uso"
      description="Condições gerais da plataforma, complementadas pela proposta e pelo contrato de cada cliente."
      sections={sections}
    />
  );
}
