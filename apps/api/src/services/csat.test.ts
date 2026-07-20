import { describe, expect, it } from "vitest";
import { parseCsatRating } from "./csat";

describe("CSAT parse", () => {
  it("aceita números 1–5", () => {
    expect(parseCsatRating("5")).toBe(5);
    expect(parseCsatRating("1")).toBe(1);
    expect(parseCsatRating("nota 4")).toBe(4);
    expect(parseCsatRating("3/5")).toBe(3);
  });

  it("aceita palavras e estrelas", () => {
    expect(parseCsatRating("ótimo")).toBe(5);
    expect(parseCsatRating("ruim")).toBe(2);
    expect(parseCsatRating("⭐⭐⭐⭐")).toBe(4);
  });

  it("rejeita texto que não é nota", () => {
    expect(parseCsatRating("quero o plano basico")).toBeNull();
    expect(parseCsatRating("")).toBeNull();
  });
});
