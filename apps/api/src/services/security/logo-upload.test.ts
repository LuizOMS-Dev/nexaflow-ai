import { describe, it, expect } from "vitest";
import { sanitizeLogoInput } from "./logo-upload";

/** PNG 1x1 mínimo válido */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

describe("sanitizeLogoInput", () => {
  it("aceita PNG real via magic bytes", async () => {
    const dataUrl = `data:image/png;base64,${PNG_1X1.toString("base64")}`;
    const out = await sanitizeLogoInput(dataUrl);
    expect(out).toMatch(/^data:image\/png;base64,/);
  });

  it("rejeita SVG declarado", async () => {
    const svg = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>").toString("base64");
    await expect(
      sanitizeLogoInput(`data:image/svg+xml;base64,${svg}`)
    ).rejects.toMatchObject({ code: "LOGO_MIME_DENIED" });
  });

  it("rejeita GIF mesmo com magic bytes de GIF", async () => {
    // GIF89a 1x1 minimal
    const gif = Buffer.from(
      "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      "base64"
    );
    await expect(
      sanitizeLogoInput(`data:image/gif;base64,${gif.toString("base64")}`)
    ).rejects.toMatchObject({ code: "LOGO_MIME_DENIED" });
  });

  it("rejeita URL http externa", async () => {
    await expect(sanitizeLogoInput("https://evil.example/logo.png")).rejects.toMatchObject({
      code: "LOGO_URL_FORBIDDEN",
    });
  });

  it("rejeita MIME mentiroso (texto como png)", async () => {
    const fake = Buffer.from("not-an-image").toString("base64");
    await expect(
      sanitizeLogoInput(`data:image/png;base64,${fake}`)
    ).rejects.toMatchObject({ code: "LOGO_MIME_DENIED" });
  });

  it("null limpa logo", async () => {
    expect(await sanitizeLogoInput(null)).toBeNull();
  });
});
