export type OpsNav = "inbox" | "mine" | "waiting" | "ai" | "closed";
export type ConversationNavCounts = Record<OpsNav, number>;

export function buildConversationParams(opts: {
  opsNav: OpsNav;
  search: string;
  userId?: string;
  unreadOnly: boolean;
  needsApproval: boolean;
  archived: boolean;
}): URLSearchParams {
  const params = new URLSearchParams();
  if (opts.search.trim()) params.set("search", opts.search.trim());
  if (opts.unreadOnly) params.set("unread", "1");
  if (opts.needsApproval) params.set("pendingApproval", "1");

  switch (opts.opsNav) {
    case "inbox":
      params.set("status", "OPEN");
      break;
    case "mine":
      if (opts.userId) params.set("assignedToId", opts.userId);
      break;
    case "waiting":
      params.set("status", "PENDING");
      params.set("unassigned", "1");
      break;
    case "ai":
      params.set("status", "OPEN");
      params.set("unassigned", "1");
      break;
    case "closed":
      params.set("status", opts.archived ? "ARCHIVED" : "CLOSED");
      break;
  }
  return params;
}
