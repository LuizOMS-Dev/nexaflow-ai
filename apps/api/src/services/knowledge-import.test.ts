import { describe, expect, it } from "vitest";
import {
  analyzeKnowledgeImport,
  detectSensitive,
  parseStructuredMarkdown,
  findDuplicate,
} from "./knowledge-import";

describe("knowledge-import", () => {
  it("separa seções Markdown", () => {
    const text = `# HORÁRIOS
Seg a sex 8h às 18h.

# PAGAMENTOS
Aceitamos PIX e cartão.
`;
    const s = parseStructuredMarkdown(text);
    expect(s.length).toBe(2);
    expect(s[0].title.toLowerCase()).toContain("hor");
    expect(s[1].content).toMatch(/PIX/i);
  });

  it("bloqueia secrets", () => {
    expect(detectSensitive("api_key=sk-abcdefghijklmnopqrstuvwxyz1234").hit).toBe(true);
    expect(detectSensitive("Funcionamos das 8h às 18h.").hit).toBe(false);
  });

  it("detecta duplicata por título", () => {
    const d = findDuplicate("Formas de pagamento", "PIX e cartão", [
      { id: "1", title: "Formas de pagamento", content: "Aceitamos PIX" },
    ]);
    expect(d?.id).toBe("1");
  });

  it("analyze sem IA produz itens e não publica sozinho", async () => {
    const r = await analyzeKnowledgeImport({
      text: `# ENTREGA
Entregamos em 2 dias.

# TROCAS
Troca em 7 dias com nota.
`,
      filename: "info.txt",
      existing: [],
      useAi: false,
    });
    expect(r.stage).toBe("ready_for_review");
    expect(r.items.length).toBeGreaterThanOrEqual(2);
    expect(r.mode).toBe("structured");
  });
});
