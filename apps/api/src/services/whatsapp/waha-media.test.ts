import { describe, expect, it } from "vitest";
import { mediaPublicUrl, parseMediaPublicUrl, resolveAllowedWahaMediaUrl } from "./waha-media";

describe("waha media paths", () => {
  it("gera URL pública isolada por tenant", () => {
    expect(mediaPublicUrl("tenant1", "ab12cd.bin")).toBe("/media/wa/tenant1/ab12cd.bin");
  });

  it("parse rejeita path traversal", () => {
    expect(parseMediaPublicUrl("/media/wa/t1/../t2/x.bin")).toBeNull();
    expect(parseMediaPublicUrl("/media/wa/t1/ok.jpg")).toEqual({
      tenantId: "t1",
      filename: "ok.jpg",
    });
    expect(parseMediaPublicUrl("https://evil/media/wa/t1/ok.jpg")).toBeNull();
  });
});

describe("resolveAllowedWahaMediaUrl", () => {
  it("aceita host do gateway e path relativo", () => {
    const rel = resolveAllowedWahaMediaUrl("/api/files/abc");
    expect(rel).toBeTruthy();
    expect(rel).toContain("/api/files/abc");
  });

  it("bloqueia SSRF para host externo", () => {
    expect(resolveAllowedWahaMediaUrl("http://169.254.169.254/latest")).toBeNull();
    expect(resolveAllowedWahaMediaUrl("https://evil.example/file")).toBeNull();
    expect(resolveAllowedWahaMediaUrl("file:///etc/passwd")).toBeNull();
  });
});
