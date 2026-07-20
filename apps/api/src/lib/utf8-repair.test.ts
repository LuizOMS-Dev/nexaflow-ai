import { describe, expect, it } from "vitest";
import { looksLikeMojibake, repairUtf8Text } from "./utf8-repair";

describe("utf8-repair", () => {
  it("detecta mojibake", () => {
    expect(looksLikeMojibake("VocÃª Ã© Ana")).toBe(true);
    expect(looksLikeMojibake("Você é Ana")).toBe(false);
  });

  it("corrige VocÃª Ã© → Você é", () => {
    expect(repairUtf8Text("VocÃª Ã© Ana")).toBe("Você é Ana");
  });

  it("preserva texto já correto", () => {
    const ok = "Você é Ana, consultora comercial da Fm Conteúdos";
    expect(repairUtf8Text(ok)).toBe(ok);
  });

  it("corrige trecho corrompido sem quebrar acentos já corretos quando possível", () => {
    const mixed = "VocÃª Ã© Ana da Fm Conteúdos";
    const fixed = repairUtf8Text(mixed);
    expect(fixed).toContain("Você é");
    expect(fixed).toContain("Conteúdos");
  });

  it("corrige emoji mojibake ðŸ˜Š → 😊", () => {
    const broken = "Oi! Aqui é a Ana ðŸ˜Š";
    const fixed = repairUtf8Text(broken);
    expect(fixed).toContain("😊");
    expect(fixed).toContain("é");
    expect(fixed).not.toContain("ðŸ");
  });
});
