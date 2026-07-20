/**
 * Help Knowledge da PLATAFORMA NexaFlow (não é KnowledgeDoc do tenant).
 * Conteúdo alinhado ao comportamento real: rotas, modos, status WA, Access Gate, etc.
 * Seed com upsert por seedKey — não depende de tabela vazia.
 *
 * productVersion: alinhar ao changelog publicado quando o módulo mudar.
 */
export type HelpSeedDoc = {
  /** Chave estável para upsert (não mudar após publicar) */
  seedKey: string;
  title: string;
  category: string;
  content: string;
  sortOrder: number;
  productVersion?: string;
};

const V = "1.9.0";

export const HELP_KNOWLEDGE_SEED: HelpSeedDoc[] = [
  // ─── INÍCIO ───────────────────────────────────────────────
  {
    seedKey: "inicio-guia",
    title: "Guia de início",
    category: "Início",
    sortOrder: 10,
    productVersion: V,
    content: `A NexaFlow é a plataforma de atendimento, CRM e IA da sua empresa.

Primeiros passos típicos:
1. Complete o onboarding da empresa.
2. Conecte o WhatsApp em Canais (/app/integrations).
3. Revise o agente de IA na área de Agentes.
4. Personalize o Conhecimento com dados reais e publique como Pronto.
5. Convide a equipe em Equipe (/app/team).

Tour: Minha Conta → Preferências → Tour da plataforma.
NIA (Assistente NexaFlow): ícone de ajuda no painel — ajuda a usar a plataforma, não atende clientes finais.

Se o menu não mostrar uma área, pode ser permissão (papel) ou plano (entitlement).`,
  },
  {
    seedKey: "inicio-vocabulario",
    title: "Vocabulário NexaFlow",
    category: "Início",
    sortOrder: 12,
    productVersion: V,
    content: `Termos padrão da plataforma:

- Atendimento / Conversas: inbox com clientes finais.
- Agente: IA da EMPRESA que atende clientes (WhatsApp etc.).
- NIA: assistente da plataforma NexaFlow (ajuda a usar o painel).
- Conhecimento: documentos oficiais da empresa para os agentes.
- Funil: pipeline comercial (oportunidades e estágios).
- Oportunidade: card no funil.
- Empresa / tenant: a conta da sua organização.
- Usuário / membro: pessoa da equipe com um papel (RBAC).
- Handoff: passagem da IA para humano.
- Canais: integrações de mensagens (ex.: WhatsApp).
- Fluxos: automações por gatilho e ações.
- Novidades: changelog público da NexaFlow (não logs técnicos).

Não confunda planos de assinatura NexaFlow com "Planos e preços" no Conhecimento da empresa.`,
  },

  // ─── CONVERSAS ────────────────────────────────────────────
  {
    seedKey: "conversas-inbox",
    title: "Conversas (Inbox)",
    category: "Conversas",
    sortOrder: 20,
    productVersion: V,
    content: `Área: Conversas (/app/inbox). Permissão: conversations.read. Plano: inbox.

Onde a equipe atende mensagens dos canais (ex.: WhatsApp).

O que fazer:
- Abrir conversa e ler o histórico.
- Responder como humano.
- Assumir atendimento (handoff) quando a IA estava no modo Automático/Aprovação.
- Transferir para outro atendente (se tiver permissão).
- Usar sugestões no modo Copiloto (se o plano e o agente permitirem).
- Notas internas não vão para o cliente.
- Finalizar ou reabrir conversa conforme o fluxo da empresa.

Participantes típicos na timeline: Cliente, IA (agente), Humano, sistema (handoff/avisos).

Não confunda Conversas (clientes finais) com a NIA (ajuda da plataforma).`,
  },
  {
    seedKey: "conversas-handoff",
    title: "Handoff e assumir atendimento",
    category: "Conversas",
    sortOrder: 22,
    productVersion: V,
    content: `Handoff = transferir o atendimento da IA para um humano.

Como acontece:
1. Cliente pede humano / regras do agente disparam / tool de transferência / degradação da IA.
2. A conversa entra na fila de atendimento humano.
3. A equipe é notificada (quando configurado).
4. O atendente assume a conversa; a IA deixa de responder sozinha nessa conversa.

Configuração de regras: no agente em Agentes (triggers de handoff).
Na conversa: use "Assumir atendimento" / ações de handoff da tela.

Se a IA "parou de responder" e há handoff ativo, isso é esperado — um humano deve continuar.

A NIA (assistente da plataforma) também pode encaminhar para suporte NexaFlow quando SUPPORT_AVAILABLE=true; isso é outro fluxo (suporte da plataforma, não handoff de cliente).`,
  },
  {
    seedKey: "conversas-faq",
    title: "FAQ — Conversas",
    category: "Conversas",
    sortOrder: 25,
    productVersion: V,
    content: `P: Como altero o responsável de uma conversa?
R: Abra a conversa em Conversas e use a ação de atribuir/transferir (requer permissão).

P: Como faço o agente parar de responder?
R: Assuma o atendimento (handoff) ou desative o modo Automático do agente / desative o agente.

P: Por que a conversa não aparece?
R: Filtros da inbox, permissão conversations.read, canal não vinculado, ou conversa em outro status (finalizada).

P: O que é nota interna?
R: Mensagem só para a equipe; o cliente não vê.

P: Como transfiro para um humano (do ponto de vista do cliente)?
R: Configure handoff no agente e/ou peça "falar com atendente"; a equipe recebe a fila.`,
  },

  // ─── CONTATOS / CRM / FUNIL / TAREFAS ─────────────────────
  {
    seedKey: "contatos",
    title: "Contatos",
    category: "Contatos",
    sortOrder: 30,
    productVersion: V,
    content: `Área: Contatos (/app/contacts). Permissão: contacts.read / contacts.write.

Cadastro de pessoas e empresas que conversam com você.

Você pode buscar, filtrar, editar dados e tags, arquivar ou excluir conforme permissão, e ver histórico vinculado às conversas.

Não invente campos: use apenas o que o formulário do painel oferece.`,
  },
  {
    seedKey: "funil-crm",
    title: "Funil (CRM)",
    category: "Funil",
    sortOrder: 40,
    productVersion: V,
    content: `Área: Funil (/app/crm). Permissão: crm.read. Entitlement: crm.

Pipeline comercial com estágios e oportunidades (cards).

Uso típico:
1. Abra o Funil.
2. Mova cards entre estágios.
3. Atualize valor, estágio, notas e próxima ação.
4. Relacione contatos e tarefas quando a tela oferecer.

Se o menu não mostrar Funil: plano sem CRM ou sem permissão crm.read.

P: Por que uma oportunidade não aparece?
R: Filtros de estágio/responsável, permissão, ou oportunidade em outro funil/status. Confirme o plano (crm).`,
  },
  {
    seedKey: "tarefas",
    title: "Tarefas",
    category: "Tarefas",
    sortOrder: 50,
    productVersion: V,
    content: `Área: Tarefas (/app/tasks). Permissão: tasks.read / tasks.write.

Pendências da equipe (follow-ups, retornos).

Crie, atribua, conclua e acompanhe prazos no painel.
O agente de atendimento pode criar tarefas se a ferramenta correspondente estiver habilitada no agente.

Tarefas atrasadas podem gerar notificação (TASK_OVERDUE), conforme configurações.`,
  },

  // ─── AGENTES ──────────────────────────────────────────────
  {
    seedKey: "agentes-geral",
    title: "Agentes de IA",
    category: "Agentes",
    sortOrder: 60,
    productVersion: V,
    content: `Área: Agentes (menu lateral — NÃO fica em Configurações). Permissão: ai.manage. Entitlement: ai.

Agentes atendem os CLIENTES da empresa (WhatsApp etc.). São diferentes da NIA.

Campos principais de identidade/comportamento:
- Nome, função, objetivo, tom, personalidade, comportamento, limites, regras da empresa.

Configuração operacional (separada):
- Ativo/inativo
- Modo: Copiloto (SUGGEST), Aprovação (APPROVE), Automático (AUTO)
- Ferramentas (tools) autorizadas
- Conhecimento vinculado (status Pronto)
- Regras de handoff
- Testes / sandbox na própria área de Agentes

Como configurar:
1. Abra Agentes.
2. Crie ou selecione o agente.
3. Defina identidade e instruções.
4. Escolha o modo.
5. Habilite só as ferramentas necessárias.
6. Vincule conhecimento publicado (Pronto).
7. Configure handoff.
8. Teste antes de ativar no canal.

Política de veracidade: o agente não inventa preços/fatos — usa Conhecimento Pronto e dados oficiais.`,
  },
  {
    seedKey: "agentes-modos",
    title: "Modos do agente (Copiloto, Aprovação, Automático)",
    category: "Agentes",
    sortOrder: 62,
    productVersion: V,
    content: `Modos reais na plataforma (valores internos → rótulo humano):

- Copiloto (SUGGEST): a IA sugere respostas; o humano envia.
- Aprovação (APPROVE): a IA prepara rascunho; o humano aprova antes do envio.
- Automático (AUTO): a IA responde sozinha dentro das regras, knowledge e tools, até handoff.

Agente inativo: não atende, independentemente do modo.

Exemplos:
- Treinar equipe sem envio automático → Copiloto.
- Controle de qualidade → Aprovação.
- Atendimento 24h com regras claras → Automático + handoff bem configurado.

Empresa com Access Gate restrito/bloqueado pode pausar IA automática (canRunAiAuto=false).`,
  },
  {
    seedKey: "agentes-nao-responde",
    title: "Diagnóstico — agente não responde",
    category: "Agentes",
    sortOrder: 64,
    productVersion: V,
    content: `Quando o usuário diz "meu agente não responde", diagnosticar em camadas (a NIA consulta o que puder no estado da sessão):

1. Conta / Access Gate: empresa suspensa, bloqueada ou inadimplente pausa operações automáticas.
2. Permissão e plano: entitlement ai, permissão ai.manage para configurar.
3. Canal: WhatsApp precisa estar conectado (CONNECTED) para envio.
4. Agente ativo? (isActive)
5. Modo: Copiloto não envia sozinho; Aprovação espera humano; Automático envia.
6. Handoff ativo na conversa? Humano deve assumir — a IA para de auto-responder.
7. Conhecimento: se a resposta depende de fatos oficiais, docs em Rascunho não entram.
8. Tools: ferramenta necessária desabilitada ou sem permissão.
9. Erro técnico / degradação da IA da plataforma.

Não diga "resolvido" só por orientar. Não diga que reconectou se não executou a ação.

Desambiguação: "não funciona" pode ser (a) não responde clientes ou (b) não salva/ativa no painel — pergunte só se o contexto não bastar.`,
  },
  {
    seedKey: "agentes-import-config",
    title: "Importar configuração do agente",
    category: "Agentes",
    sortOrder: 66,
    productVersion: V,
    content: `Em Agentes existe importação de CONFIGURAÇÃO conceitual (identidade/comportamento).

Importa apenas (allowlist):
- Nome, função, objetivo, tom, personalidade, comportamento, limites, regras da empresa.

NÃO importa / NÃO altera automaticamente:
- Modo (Copiloto/Aprovação/Automático)
- Tools / permissões de ferramentas
- Knowledge vinculado
- Handoff
- Canais
- Automações
- Ativo/inativo

Isso é diferente de Importar conhecimento (Base de Conhecimento).
Após importar config, revise e salve; depois ajuste modo, tools e knowledge manualmente.`,
  },
  {
    seedKey: "agentes-faq",
    title: "FAQ — Agentes",
    category: "Agentes",
    sortOrder: 68,
    productVersion: V,
    content: `P: Qual a diferença entre Copiloto e Automático?
R: Copiloto só sugere; Automático envia sozinho (até handoff).

P: Por que o agente não usou meu conhecimento?
R: Status Rascunho, não vinculado ao agente, placeholders iniciais, ou consulta sem termos relevantes.

P: Como vinculo conhecimento a um agente específico?
R: Em Conhecimento, disponibilidade "agentes específicos"; ou na edição do agente, vincule docs Pronto.

P: Por que a ferramenta não roda?
R: Tool desligada no agente, requer aprovação, Access Gate pausou operações, ou plano/permissão.

P: Onde vejo aprendizado?
R: Aprendizado (área de Agentes / Aprendizado) — sugestões e lacunas; não publica sozinho.`,
  },

  // ─── CONHECIMENTO ─────────────────────────────────────────
  {
    seedKey: "conhecimento-base",
    title: "Base de Conhecimento",
    category: "Conhecimento",
    sortOrder: 70,
    productVersion: V,
    content: `Área: Conhecimento (/app/knowledge). Permissão: ai.manage. Entitlement: ai.

Documentos da EMPRESA usados pelos agentes no atendimento (não pela NIA).

Status:
- Rascunho (draft): a IA NÃO usa.
- Pronto (ready): pode ser consultado pelos agentes autorizados.
- Arquivado: fora de uso.

Disponibilidade: todos os agentes | agentes específicos.

Fonte Manual: texto da equipe. Também há importação em massa de conhecimento (não confunda com import de config do agente).

"Planos e preços" inicial costuma ser modelo — personalize com dados reais da empresa e publique só o que for verdade.

Como publicar:
1. Novo conhecimento (título, categoria, texto).
2. Salve e revise.
3. Altere status para Pronto.
4. Confirme vínculo com o agente.

FAQ: "Por que está em Rascunho?" — porque ainda não foi marcado Pronto; até lá o agente não usa.`,
  },
  {
    seedKey: "conhecimento-vs-nia",
    title: "Conhecimento da empresa vs NIA",
    category: "Conhecimento",
    sortOrder: 72,
    productVersion: V,
    content: `Duas bases distintas:

1) KnowledgeDoc (empresa): fatos comerciais/operacionais dos CLIENTES da empresa. Status Pronto. Usado pelos Agentes.

2) Help Knowledge (plataforma): documentação da NexaFlow. Usada só pela NIA. Sem tenantId. Gerida no Superadmin.

A NIA nunca deve ler Knowledge comercial de outro tenant nem inventar a partir de rascunhos.

Planos de assinatura NexaFlow (Inicial, Profissional, etc.) ≠ documento "Planos e preços" da empresa.`,
  },

  // ─── APRENDIZADO ──────────────────────────────────────────
  {
    seedKey: "aprendizado",
    title: "Aprendizado contínuo",
    category: "Agentes",
    sortOrder: 80,
    productVersion: V,
    content: `Área: Aprendizado (rota de Aprendizado sob Agentes). Permissão: ai.manage.

O aprendizado contínuo da EMPRESA registra lacunas e sugestões a partir do atendimento.

Regras importantes:
- Não altera sozinho a verdade oficial.
- Sugestões precisam de revisão humana antes de virar Conhecimento Pronto.
- Empresa pode ativar/desativar; agentes podem participar ou não (conforme UI/plano).
- Separado do feedback 👍/👎 da NIA (ajuda da plataforma).

Nunca diga que a IA "aprende qualquer coisa automaticamente" e publica sozinha.`,
  },

  // ─── WHATSAPP / CANAIS ────────────────────────────────────
  {
    seedKey: "whatsapp-estados",
    title: "WhatsApp — estados e conexão",
    category: "Canais",
    sortOrder: 90,
    productVersion: V,
    content: `Área: Canais (/app/integrations). Permissão: channels.manage.

Como conectar:
1. Abra Canais.
2. Selecione WhatsApp.
3. Clique em Conectar.
4. Leia o QR Code com o WhatsApp do celular.

Estados canônicos (traduza para o usuário em linguagem humana; não mostre o enum cru se houver rótulo amigável):

- NOT_CONFIGURED: ainda não configurou o canal → "WhatsApp ainda não configurado".
- CONNECTING: iniciando conexão → "Conectando…".
- QR_REQUIRED (QR pendente): precisa ler o QR → "Aguardando leitura do QR Code".
- CONNECTED: sessão autenticada de verdade → "Conectado".
- RECONNECTING: tentando restabelecer → "Reconectando…".
- DISCONNECTED: canal existe mas sessão não está aberta → "Desconectado".
- LOGGED_OUT: sessão encerrada no aparelho/servidor → "Sessão encerrada — reconecte".
- ERROR: falha → "Erro na conexão — reconecte ou fale com suporte".

Regra crítica: existir registro de canal no banco NÃO significa CONNECTED. Só evidência real de sessão aberta.

Limite de canais depende do plano (maxChannels).
Desconexão gera alerta/notificação CHANNEL_DISCONNECTED quando aplicável.`,
  },
  {
    seedKey: "whatsapp-faq",
    title: "FAQ — WhatsApp",
    category: "Canais",
    sortOrder: 92,
    productVersion: V,
    content: `P: Por que meu WhatsApp desconectou?
R: Sessão expirada, logout no celular, reinício do servidor, erro de rede, ou LOGGED_OUT. Reconecte em Canais.

P: Por que o QR não aparece?
R: Status não é QR_REQUIRED; fluxo de conectar não iniciado; permissão channels.manage; ou canal em ERROR/RECONNECTING. Tente Conectar de novo em Canais.

P: WhatsApp conectado mas agente não responde?
R: Veja diagnóstico de agente (ativo, modo, handoff, knowledge, Access Gate).

P: Posso ter vários números?
R: Depende do limite de canais do plano.

P: E-mail e Telegram em campanhas?
R: Podem aparecer como futuro/desabilitados na UI — não diga que estão disponíveis se a tela marca (futuro).`,
  },

  // ─── AUTOMAÇÕES / CAMPANHAS ───────────────────────────────
  {
    seedKey: "automacoes",
    title: "Automações (Fluxos)",
    category: "Automações",
    sortOrder: 100,
    productVersion: V,
    content: `Área: Fluxos (/app/automations). Entitlement: automations.

Automações = gatilho (evento) + ações disponíveis + estado ativo/inativo + histórico de execução.

Como usar:
1. Abra Fluxos.
2. Crie ou edite um fluxo.
3. Defina o evento que inicia (gatilho).
4. Adicione apenas ações que a plataforma e o plano suportam.
5. Ative só após revisar.

Erros comuns: gatilho errado, ação sem permissão/plano, empresa com canRunAutomations=false (Access Gate), falha de execução (notificação AUTOMATION_FAILED).

Não invente ações que não existem na UI.`,
  },
  {
    seedKey: "campanhas",
    title: "Campanhas",
    category: "Campanhas",
    sortOrder: 110,
    productVersion: V,
    content: `Área: Campanhas (/app/campaigns). Entitlement: campaigns.

Envios em massa conforme o plano e canais disponíveis.

Boas práticas:
- Só contatos com consentimento adequado.
- WhatsApp precisa estar conectado para envios por WhatsApp.
- Empresa suspensa/bloqueada ou sem canRunCampaigns não deve disparar campanhas.
- Nunca incentive spam ou mensagens abusivas.

Canais na criação: o que a UI marcar como (futuro) está desabilitado — oriente só o disponível (ex.: WhatsApp).

Se a área não aparece: plano sem campaigns ou permissão insuficiente.`,
  },

  // ─── EQUIPE ───────────────────────────────────────────────
  {
    seedKey: "equipe",
    title: "Equipe e permissões",
    category: "Equipe",
    sortOrder: 120,
    productVersion: V,
    content: `Área: Equipe (/app/team). Permissão: team.manage.

Como convidar:
1. Abra Equipe.
2. Convide por e-mail.
3. Escolha o papel (ex.: Administrador, Supervisor, Atendente — conforme papéis reais da UI).
4. Acompanhe convites pendentes e assentos (seats) do plano.

RBAC: cada papel define o que a pessoa vê e altera.
Sem settings.read/settings.write a pessoa não altera Configurações da empresa.
Limite de usuários = maxUsers do plano.

Convites pendentes podem ser revogados por quem tem team.manage.`,
  },

  // ─── API / WEBHOOKS ───────────────────────────────────────
  {
    seedKey: "api",
    title: "API e chaves",
    category: "API",
    sortOrder: 130,
    productVersion: V,
    content: `Área: Configurações → API (/app/settings/api). Docs: /docs/api.
Entitlement: api. Permissão de settings conforme papel.

Como criar chave (se o plano incluir API):
1. Confirme no estado do plano (apiEnabled / features.api) — não memorize preços.
2. Abra Configurações → API.
3. Crie a chave, defina scopes e guarde o valor (não é reexibido).
4. Use só no backend da integração.
5. Revogue chaves comprometidas.

Nunca peça a chave completa ao usuário na conversa.
Rate limits e scopes seguem a documentação pública.

Se o plano não tem API: diga com clareza; não invente endpoints.`,
  },
  {
    seedKey: "webhooks",
    title: "Webhooks",
    category: "Webhooks",
    sortOrder: 140,
    productVersion: V,
    content: `Área: Configurações → Webhooks (/app/settings/webhooks).

Webhooks notificam seu sistema sobre eventos da NexaFlow (URL HTTPS, eventos, secret/assinatura, deliveries, retry, teste).

Como criar (se o plano incluir):
1. Abra Webhooks.
2. Informe URL HTTPS.
3. Selecione eventos.
4. Guarde o secret com segurança — a NIA nunca deve pedir o secret completo.
5. Use teste de entrega se a tela oferecer.

Falhas podem notificar WEBHOOK_FAILED.
Access Gate pode bloquear dispatch (canDispatchWebhooks).`,
  },

  // ─── PLANOS / COBRANÇA / ACCESS GATE ──────────────────────
  {
    seedKey: "planos-cobranca",
    title: "Planos e cobrança NexaFlow",
    category: "Planos",
    sortOrder: 150,
    productVersion: V,
    content: `Planos de assinatura NexaFlow definem limites da plataforma: usuários, canais, créditos de IA, API, webhooks, CRM, campanhas, etc.

Isso é DIFERENTE do conhecimento "Planos e preços" da Base de Conhecimento da empresa (produtos que a empresa vende).

Regras para a NIA:
- Consulte dados estruturados da sessão (planName, features, limites).
- Nunca memorize preços fixos no prompt.
- Se perguntarem "meu plano tem API?": use apiEnabled / features.api do estado operacional.
- Administradores: Configurações / área de plano e cobrança da empresa.
- Não confirme pagamento sem dado real de billing.`,
  },
  {
    seedKey: "access-gate",
    title: "Access Gate — bloqueios e suspensões",
    category: "Planos",
    sortOrder: 152,
    productVersion: V,
    content: `A NexaFlow decide acesso em camadas (Access Gate). Explique em linguagem humana:

Usuário:
- Bloqueado / desativado (DISABLED): não usa o painel.
- Suspenso (SUSPENDED): acesso restrito ou negado conforme política.

Empresa:
- Bloqueada (BLOCKED) / exclusão pendente: acesso bloqueado.
- Suspensa (SUSPENDED) / cancelada: operações restritas.
- Financeiro em tolerância (grace) ou atraso (overdue): acesso com aviso.
- Suspensa por inadimplência: operações automáticas pausadas; orientar regularização de pagamento.

Níveis: FULL | WARNING | RESTRICTED | BLOCKED.

Em estado restrito/bloqueado a NIA:
- Orienta cobrança, plano, conta e suporte.
- NÃO ensina contornar bloqueio.
- NÃO afirma que reativou a empresa.

P: Por que a empresa está suspensa?
R: Status da empresa ou inadimplência após período de tolerância. Admin deve regularizar pagamento ou contatar suporte NexaFlow.`,
  },

  // ─── CONFIG / CONTA / SEGURANÇA ───────────────────────────
  {
    seedKey: "configuracoes",
    title: "Configurações e Minha Conta",
    category: "Configurações",
    sortOrder: 160,
    productVersion: V,
    content: `Configurações da empresa: /app/settings (settings.read / settings.write).
Minha Conta: /app/account — perfil, empresas, preferências, segurança, sessões.

Preferências: tema, notificações, Tour da plataforma, preferências da NIA.
Segurança: senha, MFA, sessões ativas, logout de todos os dispositivos.

P: Por que não consigo acessar Configurações?
R: Papel sem settings.read ou Access Gate bloqueando. Peça a um administrador.`,
  },
  {
    seedKey: "seguranca-mfa",
    title: "Segurança, MFA e sessões",
    category: "Segurança",
    sortOrder: 170,
    productVersion: V,
    content: `Área: Minha Conta → Segurança (/app/account/security) e Sessões (/app/account/sessions).

Orientação correta:
- Troca de senha pelo fluxo oficial.
- MFA: ativar/desativar com os passos da tela; nunca ensinar burlar MFA.
- Sessões: listar e encerrar sessões; logout-all quando disponível.
- Recuperação de senha: fluxo de e-mail oficial.
- API keys e webhook secrets: tratar como segredos; rotacionar se vazarem.

A NIA nunca deve pedir senha, código MFA, API key completa ou secret de webhook.
Nunca ensinar formas de contornar segurança ou Access Gate.`,
  },

  // ─── RELATÓRIOS / TOUR / NIA / NOVIDADES ───────────────────
  {
    seedKey: "relatorios",
    title: "Relatórios",
    category: "Relatórios",
    sortOrder: 180,
    productVersion: V,
    content: `Área: Relatórios (/app/reports). Permissão: reports.read. Entitlement: reports.

Métricas operacionais e, conforme o plano, relatórios avançados.

Se um relatório não aparece: limitação de plano ou de permissão.`,
  },
  {
    seedKey: "tour",
    title: "Tour da plataforma",
    category: "Ajuda",
    sortOrder: 190,
    productVersion: V,
    content: `O tour guiado mostra áreas principais (Conversas, Agentes, Conhecimento, NIA, Novidades, etc. conforme a versão do tour).

Como iniciar: Minha Conta → Preferências → Tour da plataforma → Iniciar.
É preferência por usuário, não por empresa.
Complementa a NIA; não substitui.`,
  },
  {
    seedKey: "nia-assistente",
    title: "NIA — Assistente NexaFlow",
    category: "Ajuda",
    sortOrder: 200,
    productVersion: V,
    content: `A NIA é a assistente oficial da plataforma NexaFlow.

Ela:
- Explica funcionalidades e orienta passo a passo.
- Usa Help Knowledge publicada + estado real (WhatsApp, plano, permissões, tela).
- Respeita multi-tenant, RBAC e Access Gate.
- Pode abrir navegação segura (rotas allowlisted) e Tour.
- Pode encaminhar ao suporte da plataforma se disponível.

Ela NÃO:
- Atende clientes finais da empresa.
- Usa Knowledge comercial do tenant.
- Inventa preços, rotas ou permissões.
- Executa ações destrutivas (suspender, apagar, enviar campanha) sozinha.

Identidade: já conhece o primeiro nome e a empresa da sessão — não pede e-mail de novo quando autenticada.

P: Quero falar com humano (suporte NexaFlow)
R: Se SUPPORT_AVAILABLE, oriente o canal de suporte; senão, diga que o canal não está configurado e sugira o admin da empresa.`,
  },
  {
    seedKey: "novidades",
    title: "Novidades e atualizações",
    category: "Ajuda",
    sortOrder: 210,
    productVersion: V,
    content: `Área: Novidades (/app/whats-new).

Changelog público da NexaFlow (releases publicadas). Não são logs técnicos de servidor.

P: O que mudou? / O que tem de novo? / Última atualização?
R: Responder só com releases PUBLICADAS do changelog oficial injetado no contexto da NIA.
Não inventar features. Não misturar com AuditLog ou painel Superadmin de diagnóstico.`,
  },
  {
    seedKey: "suporte-escalonamento",
    title: "Quando escalar para suporte humano",
    category: "Ajuda",
    sortOrder: 220,
    productVersion: V,
    content: `A NIA deve escalar / indicar suporte quando:
- Não consegue diagnosticar após dados disponíveis.
- Erro técnico persiste após passos corretos.
- Pagamento específico ou faturamento que exige análise humana.
- Conta bloqueada sem ação possível no self-service.
- Falha crítica de canal/IA.
- Usuário pede humano explicitamente.

Não diga que abriu ticket se SUPPORT_AVAILABLE=false.
Não diga "resolvido" se apenas orientou.
Não diga "reconectei" ou "pagamento confirmado" sem ter executado/confirmado com dados reais.`,
  },

  // ─── FAQ GERAL / DIAGNÓSTICO ──────────────────────────────
  {
    seedKey: "faq-geral",
    title: "FAQ geral da plataforma",
    category: "Ajuda",
    sortOrder: 230,
    productVersion: V,
    content: `P: Por que a API não aparece?
R: Plano sem entitlement api, ou papel sem acesso a Configurações → API.

P: Por que não crio Webhook?
R: Mesmo critério de API/integrações + Access Gate canDispatchWebhooks.

P: Como regularizo pagamento?
R: Admin da empresa na área de cobrança/plano; se suspenso por inadimplência, quite o débito ou contate suporte NexaFlow.

P: Diferença NIA vs Agente?
R: NIA ajuda a usar a NexaFlow; Agente atende clientes da empresa.

P: Onde adiciono conhecimento?
R: /app/knowledge — criar, revisar, status Pronto, vincular ao agente.

P: Como configuro a Julia (ou outro agente)?
R: Abra Agentes, selecione o agente e edite identidade, modo, Ferramentas, Conhecimento e Handoff; teste no sandbox.`,
  },
  {
    seedKey: "diagnostico-camadas",
    title: "Ordem de diagnóstico da NIA",
    category: "Ajuda",
    sortOrder: 240,
    productVersion: V,
    content: `Antes de listar 10 verificações manuais, use dados reais da sessão nesta ordem:

1. ESTADO DA CONTA (Access Gate, suspensão, bloqueio, inadimplência)
2. PERMISSÃO (RBAC do usuário)
3. ENTITLEMENT (plano / features)
4. STATUS DO CANAL (WhatsApp canônico)
5. STATUS DO AGENTE (ativo, modo)
6. MODO DE OPERAÇÃO (Copiloto não envia sozinho)
7. KNOWLEDGE (Pronto vs Rascunho, vínculo)
8. TOOLS (habilitadas / aprovação)
9. HANDOFF (fila humana ativa)
10. ERRO TÉCNICO (degradação IA, falhas de webhook/automação)

Só pergunte ao usuário o que não puder consultar.
Seja clara e objetiva, mas entregue o detalhe necessário para resolver a dúvida (passos em procedimentos; causa + correção em diagnósticos).`,
  },
];

/** Versão de produto associada ao pacote de seed atual */
export const HELP_KNOWLEDGE_SEED_VERSION = V;
