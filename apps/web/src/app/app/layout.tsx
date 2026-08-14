import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { AccessGateShell } from "@/components/access-gate/access-gate-shell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AccessGateShell>
      <AppShell>{children}</AppShell>
    </AccessGateShell>
  );
}
