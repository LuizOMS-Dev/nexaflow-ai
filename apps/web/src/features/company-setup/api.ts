import { api } from "@/lib/api";

export type CompanySetupPayload = {
  id: string;
  name: string;
  slug: string;
  primaryColor: string;
  logoUrl?: string | null;
  settings?: Record<string, unknown>;
  plan?: unknown;
  onboardingCompleted?: boolean;
};

export type CompanySetupState = {
  needed: boolean;
  canComplete: boolean;
  company: CompanySetupPayload;
};

export function fetchCompanySetup() {
  return api<CompanySetupState>("/onboarding/company");
}

export function completeCompanySetup(body: {
  name: string;
  segment?: string;
  phone?: string;
  website?: string;
  commercialEmail?: string;
  city?: string;
  state?: string;
  primaryColor?: string;
  logoUrl?: string | null;
}) {
  return api<CompanySetupPayload>("/onboarding/company", {
    method: "POST",
    json: body,
  });
}
