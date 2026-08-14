import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { AdminShell } from "./admin-shell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <AdminShell>{children}</AdminShell>
    </AppShell>
  );
}
