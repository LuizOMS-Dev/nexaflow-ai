import { describe, expect, it } from "vitest";
import { sanitizeRequestUrl } from "./logger";

describe("sanitizeRequestUrl", () => {
  it("redige tokens de WebSocket sem esconder a rota", () => {
    expect(sanitizeRequestUrl("/ws?token=secret.jwt.value")).toBe(
      "/ws?token=[redacted]"
    );
  });

  it("redige credenciais em qualquer posição e preserva parâmetros seguros", () => {
    expect(
      sanitizeRequestUrl("/events?tenant=public&access_token=secret&limit=10&api_key=other")
    ).toBe("/events?tenant=public&access_token=[redacted]&limit=10&api_key=[redacted]");
  });
});
