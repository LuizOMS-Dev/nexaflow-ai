export type ConversationTag = {
  tag: { id: string; name: string; color: string };
};

export type ScoreBreakdownItem = { label: string; delta?: number };

export type ConversationListItem = {
  id: string;
  status: string;
  isUnread: boolean;
  isFavorite: boolean;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
  aiSentiment?: string | null;
  aiIntent?: string | null;
  aiScore?: number | null;
  contact: {
    id: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    commercialStatus?: string | null;
    priority?: string | null;
    score?: number | null;
    nextAction?: string | null;
    scoreBreakdown?: ScoreBreakdownItem[] | null;
    tags?: ConversationTag[];
  };
  channel?: { id: string; name: string; type: string } | null;
  assignedTo?: { id: string; name: string; avatarUrl?: string | null } | null;
};

export type MessageMeta = {
  agentId?: string;
  agentName?: string;
  aiAuto?: boolean;
  systemNotice?: boolean;
  systemEvent?: boolean;
  eventKind?: string;
  noticeKind?: string;
  humanHandoff?: boolean;
  attendanceClosed?: boolean;
  closeSource?: string;
  closeReason?: string;
  agentUserId?: string;
  pendingApproval?: boolean;
  originalReply?: string;
  sources?: Array<{ title?: string; documentId?: string; score?: number; chunkIndex?: number }>;
  deliveryError?: string;
  sendError?: string;
  deliveryStatus?: string;
  source?: string;
  externalDevice?: boolean;
  [key: string]: unknown;
};

export type ConversationMessage = {
  id: string;
  content: string;
  direction: string;
  type?: string;
  mediaUrl?: string | null;
  isAiGenerated?: boolean;
  aiApproved?: boolean | null;
  createdAt: string;
  metadata?: MessageMeta | null;
  author?: { id: string; name: string; avatarUrl?: string | null } | null;
};

export type ConversationNote = {
  id: string;
  content: string;
  createdAt: string;
  author?: { name: string } | null;
};

export type ConversationDetail = ConversationListItem & {
  aiSummary?: string | null;
  closedAt?: string | null;
  closeReason?: string | null;
  closeSource?: string | null;
  closeNote?: string | null;
  messages: ConversationMessage[];
  notes: ConversationNote[];
  contact: ConversationListItem["contact"] & {
    memory?: { summary?: string | null } | null;
  };
};

export type AiSuggestion = {
  reply: string;
  summary: string;
  intent: string;
  sentiment: string;
  commercialStatus?: string;
  priority?: string;
  score: number;
  nextAction: string;
  tags: string[];
  reasons: string[];
};
