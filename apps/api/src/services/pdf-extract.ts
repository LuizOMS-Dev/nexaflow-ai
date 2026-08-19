/**
 * Extração de texto de PDF. Sem OCR (não há infra).
 * Não executa conteúdo do documento.
 */
import { AppError } from "../lib/errors";

export async function extractPdfText(buffer: Buffer): Promise<string> {
  if (!buffer?.length) {
    throw new AppError("Não foi possível extrair texto deste PDF.", 400, "PDF_EMPTY");
  }
  if (!buffer.subarray(0, 5).toString("latin1").startsWith("%PDF-")) {
    throw new AppError("O arquivo não é um PDF válido.", 400, "PDF_INVALID");
  }

  let text = "";
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse") as (b: Buffer) => Promise<{ text?: string }>;
    const parsed = await pdfParse(buffer);
    text = (parsed?.text || "").replace(/\u0000/g, "").trim();
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("Não foi possível extrair texto deste PDF.", 400, "PDF_EXTRACT_FAILED");
  }

  const compact = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (compact.length < 20) {
    throw new AppError("Não foi possível extrair texto deste PDF.", 400, "PDF_NO_TEXT");
  }
  return compact;
}
