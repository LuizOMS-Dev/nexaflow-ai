"use client";

import { useParams } from "next/navigation";
import { CompanyDetailPage } from "@/features/platform-admin/companies/company-detail-page";

export default function Page() {
  const params = useParams<{ id: string }>();
  return <CompanyDetailPage id={params.id} />;
}
