import { describe, expect, it } from "vitest";
import { extractPdfText } from "./pdf-extract";

describe("extractPdfText", () => {
  it("rejeita buffer vazio", async () => {
    await expect(extractPdfText(Buffer.alloc(0))).rejects.toMatchObject({
      code: "PDF_EMPTY",
    });
  });

  it("rejeita arquivo que não é PDF", async () => {
    await expect(extractPdfText(Buffer.from("hello world this is not a pdf"))).rejects.toMatchObject({
      code: "PDF_INVALID",
    });
  });

  it("informa quando o PDF não tem texto extraível", async () => {
    const header = Buffer.from("%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
    await expect(extractPdfText(header)).rejects.toMatchObject({
      message: "Não foi possível extrair texto deste PDF.",
    });
  });
});
