import { describe, expect, it } from "vitest";
import {
  isMeaningfulCustomerReturnMessage,
  isTrivialCustomerAckMessage,
} from "./resume-guard";

describe("resume-guard — ack não reabre IA", () => {
  it.each([
    "ok",
    "OK!",
    "blz",
    "beleza",
    "obrigado",
    "Obrigada!!",
    "muito obrigado",
    "valeu",
    "vlw",
    "tudo bem",
    "td bem",
    "tudo certo",
    "perfeito",
    "show",
    "combinado",
    "ok obrigado",
    "blz valeu",
    "👍",
    "kkkk",
    "tchau",
    "bom dia",
    "boa noite",
    "entendi",
    "ta bom",
    "só isso",
    "sem problema",
  ])("trata como trivial: %s", (msg) => {
    expect(isTrivialCustomerAckMessage(msg)).toBe(true);
    expect(isMeaningfulCustomerReturnMessage(msg)).toBe(false);
  });

  it.each([
    "quero falar de novo sobre o plano",
    "ainda preciso de ajuda com o pagamento",
    "pode me passar o valor do basico?",
    "o atendente não me respondeu",
    "mudei de ideia, quero contratar",
    "tem desconto para anual?",
    "preciso remarcar a reunião",
  ])("trata como pedido real: %s", (msg) => {
    expect(isTrivialCustomerAckMessage(msg)).toBe(false);
    expect(isMeaningfulCustomerReturnMessage(msg)).toBe(true);
  });
});
