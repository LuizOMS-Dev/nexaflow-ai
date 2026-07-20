import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Aviso de privacidade",
  description: "Como a NexaFlow trata dados pessoais no site e na plataforma.",
};

const sections: LegalSection[] = [
  {
    title: "1. Escopo",
    paragraphs: [
      "Este aviso descreve o tratamento de dados no site comercial e na plataforma NexaFlow. Na operação de atendimento e CRM, a empresa cliente define quais dados de seus contatos serão inseridos e como serão usados; as responsabilidades específicas devem constar na proposta e no contrato aplicáveis.",
    ],
  },
  {
    title: "2. Dados tratados",
    items: [
      "Dados enviados no pedido de demonstração: nome, e-mail, empresa, telefone, tamanho da equipe e mensagem.",
      "Dados de conta e segurança: identificação, vínculo com empresas, sessões, tentativas de acesso e registros de auditoria.",
      "Dados inseridos pela empresa cliente: contatos, conversas, tarefas, oportunidades, documentos e configurações necessárias ao uso dos módulos contratados.",
      "Dados técnicos necessários ao funcionamento, à prevenção de abuso e ao diagnóstico de falhas.",
    ],
  },
  {
    title: "3. Finalidades",
    items: [
      "Responder pedidos comerciais e prestar suporte.",
      "Disponibilizar autenticação, atendimento, CRM, automações e recursos de IA configurados pela empresa cliente.",
      "Proteger contas, investigar incidentes, limitar abuso e manter registros operacionais.",
      "Cumprir obrigações contratuais e legais aplicáveis.",
    ],
  },
  {
    title: "4. Cookies e sessões",
    paragraphs: [
      "A plataforma usa cookies estritamente necessários para autenticação, renovação de sessão e proteção do acesso. Eles não são apresentados como cookies de publicidade ou rastreamento comercial.",
    ],
  },
  {
    title: "5. Fornecedores e transferências",
    paragraphs: [
      "Dados podem ser processados por provedores de infraestrutura, e-mail, mensageria e inteligência artificial conforme a configuração da operação. A relação de fornecedores, regiões e condições aplicáveis deve ser confirmada na contratação, pois pode variar por ambiente e plano.",
    ],
  },
  {
    title: "6. Retenção e segurança",
    paragraphs: [
      "Os dados são mantidos pelo período necessário à prestação do serviço, segurança, exercício de direitos e obrigações aplicáveis. A plataforma implementa controles como senhas com hash, segregação por empresa, sessões revogáveis, registros de auditoria e proteção de segredos sensíveis; nenhum sistema, porém, elimina integralmente os riscos de segurança.",
    ],
  },
  {
    title: "7. Solicitações sobre dados",
    paragraphs: [
      "Titulares podem solicitar informações, correção, revisão ou exclusão pelos canais oficiais informados na relação comercial. Quando o pedido envolver dados controlados por uma empresa cliente, ele poderá ser encaminhado a essa empresa para avaliação e resposta.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacidade"
      title="Aviso de privacidade"
      description="Um resumo objetivo do tratamento de dados efetivamente previsto pelo site e pela plataforma. Dados societários e contatos legais devem ser completados no contrato antes da venda em produção."
      sections={sections}
    />
  );
}
