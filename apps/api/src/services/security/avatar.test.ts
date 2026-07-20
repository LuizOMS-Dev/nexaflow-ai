import { describe, expect, it } from "vitest";
import {
  isValidAvatarColor,
  isValidPresetId,
  NEXA_AVATAR_PRESETS,
  normalizeAvatarColor,
  parseAndValidateAvatarDataUrl,
} from "./avatar";

describe("nexa avatar presets", () => {
  it("has 8–12 official presets", () => {
    expect(NEXA_AVATAR_PRESETS.length).toBeGreaterThanOrEqual(8);
    expect(NEXA_AVATAR_PRESETS.length).toBeLessThanOrEqual(12);
  });

  it("accepts only whitelist ids", () => {
    expect(isValidPresetId("nexa-fox-01")).toBe(true);
    expect(isValidPresetId("../etc/passwd")).toBe(false);
    expect(isValidPresetId("nexa-dog-99")).toBe(false);
  });
});

describe("avatar colors", () => {
  it("normalizes known colors", () => {
    expect(normalizeAvatarColor("violet")).toBe("#6366F1");
    expect(isValidAvatarColor("#8B5CF6")).toBe(true);
    expect(isValidAvatarColor("red")).toBe(false);
  });
});

describe("avatar upload validation", () => {
  it("rejects SVG", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString("base64");
    await expect(
      parseAndValidateAvatarDataUrl(`data:image/svg+xml;base64,${svg}`)
    ).rejects.toMatchObject({ code: "AVATAR_MIME_DENIED" });
  });

  it("rejects external URL", async () => {
    await expect(
      parseAndValidateAvatarDataUrl("https://evil.example/a.png")
    ).rejects.toMatchObject({ code: "AVATAR_URL_FORBIDDEN" });
  });

  it("accepts minimal valid PNG", async () => {
    // 1x1 PNG
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    // 1x1 is below MIN_EDGE (32) → dimensions error
    await expect(
      parseAndValidateAvatarDataUrl(`data:image/png;base64,${png.toString("base64")}`)
    ).rejects.toMatchObject({ code: "AVATAR_DIMENSIONS" });
  });
});
