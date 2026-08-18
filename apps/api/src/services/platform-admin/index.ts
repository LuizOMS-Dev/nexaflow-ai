export { getPlatformOverview } from "./overview";
export {
  listCompanies,
  getCompanyOverview,
  createCompany,
  updateCompanyProfile,
  updateTenantStatus,
  requestCompanyDeletion,
  type ListCompaniesQuery,
} from "./companies";
export {
  listUsers,
  getUsersKpis,
  getUserDetail,
  updateUserStatus,
  revokeUserSessions,
  resetUserMfa,
  updateUserPlatformRole,
  type ListUsersQuery,
} from "./users";
export {
  listTenantMembers,
  addTenantMember,
  updateTenantMemberRole,
  toggleTenantMemberStatus,
  removeTenantMember,
} from "./memberships";
export {
  getTenantBillingDetail,
  registerTenantPayment,
  cancelTenantSubscription,
} from "./billing";
export {
  startImpersonationSession,
  stopImpersonationSession,
} from "./impersonation";
export { listPlans, createPlan, updatePlan } from "./plans";
export { listAuditLogs, clearTenantLogs, clearPlatformLogs } from "./audit-logs";
export {
  listSalesLeads,
  getSalesLead,
  updateSalesLeadStatus,
  convertSalesLeadToCompany,
  SALES_LEAD_STATUSES,
} from "./leads";
export { isTestFixtureTenant, tenantSettings } from "./fixtures";
export { enrichTenantBilling } from "./billing-view";

// Backward compatibility alias for getCompany
export const getCompany = async (id: string) => {
  const { getCompanyOverview } = await import("./companies");
  return getCompanyOverview(id);
};
