import { describe, expect, it } from "vitest";
import { parseUserAgent } from "./user-agent";

describe("User-Agent & OS Matrix Parser", () => {
  describe("Navegadores e Precedência Crítica", () => {
    it("Opera no Windows — OPR/ deve prevalecer sobre Chrome", () => {
      const ua =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 OPR/108.0.0.0";
      const res = parseUserAgent(ua);
      expect(res.browser).toBe("Opera");
      expect(res.os).toBe("Windows");
      expect(res.displayTitle).toBe("Opera · Windows");
    });

    it("Microsoft Edge no Windows — Edg/ deve prevalecer sobre Chrome", () => {
      const ua =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0";
      const res = parseUserAgent(ua);
      expect(res.browser).toBe("Edge");
      expect(res.os).toBe("Windows");
      expect(res.displayTitle).toBe("Edge · Windows");
    });

    it("Samsung Internet no Android — SamsungBrowser/ deve prevalecer sobre Chrome", () => {
      const ua =
        "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.5938.140 Mobile Safari/537.36";
      const res = parseUserAgent(ua);
      expect(res.browser).toBe("Samsung Internet");
      expect(res.os).toBe("Android");
      expect(res.displayTitle).toBe("Samsung Internet · Android");
    });

    it("Firefox Desktop no Linux", () => {
      const ua = "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0";
      const res = parseUserAgent(ua);
      expect(res.browser).toBe("Firefox");
      expect(res.os).toBe("Linux");
      expect(res.displayTitle).toBe("Firefox · Linux");
    });

    it("Firefox no iOS (FxiOS)", () => {
      const ua =
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/124.0 Mobile/15E148 Safari/605.1.15";
      const res = parseUserAgent(ua);
      expect(res.browser).toBe("Firefox");
      expect(res.os).toBe("iOS");
      expect(res.displayTitle).toBe("Firefox · iOS");
    });

    it("Chrome Desktop no macOS", () => {
      const ua =
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
      const res = parseUserAgent(ua);
      expect(res.browser).toBe("Chrome");
      expect(res.os).toBe("macOS");
      expect(res.displayTitle).toBe("Chrome · macOS");
    });

    it("Chrome no iOS (CriOS)", () => {
      const ua =
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0.6312.52 Mobile/15E148 Safari/604.1";
      const res = parseUserAgent(ua);
      expect(res.browser).toBe("Chrome");
      expect(res.os).toBe("iOS");
      expect(res.displayTitle).toBe("Chrome · iOS");
    });

    it("Chromium puro no Linux", () => {
      const ua =
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chromium/123.0.0.0 Safari/537.36";
      const res = parseUserAgent(ua);
      expect(res.browser).toBe("Chrome");
      expect(res.os).toBe("Linux");
      expect(res.displayTitle).toBe("Chrome · Linux");
    });

    it("Safari puro no macOS (sem Chromium/Chrome)", () => {
      const ua =
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
      const res = parseUserAgent(ua);
      expect(res.browser).toBe("Safari");
      expect(res.os).toBe("macOS");
      expect(res.displayTitle).toBe("Safari · macOS");
    });

    it("Safari no iPhone (iOS)", () => {
      const ua =
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1";
      const res = parseUserAgent(ua);
      expect(res.browser).toBe("Safari");
      expect(res.os).toBe("iOS");
      expect(res.displayTitle).toBe("Safari · iOS");
    });

    it("Safari no iPad (iPadOS)", () => {
      const ua =
        "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
      const res = parseUserAgent(ua);
      expect(res.browser).toBe("Safari");
      expect(res.os).toBe("iPadOS");
      expect(res.displayTitle).toBe("Safari · iPadOS");
    });
  });

  describe("Sistemas Operacionais", () => {
    it("Identifica ChromeOS (CrOS)", () => {
      const ua =
        "Mozilla/5.0 (X11; CrOS x86_64 15753.55.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.111 Safari/537.36";
      const res = parseUserAgent(ua);
      expect(res.os).toBe("ChromeOS");
      expect(res.browser).toBe("Chrome");
      expect(res.displayTitle).toBe("Chrome · ChromeOS");
    });

    it("Identifica Android Tablet", () => {
      const ua =
        "Mozilla/5.0 (Linux; Android 13; SM-X906B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36";
      const res = parseUserAgent(ua);
      expect(res.os).toBe("Android");
      expect(res.deviceType).toBe("Tablet");
    });
  });

  describe("Tratamento do Brave e Ausência de Sinais", () => {
    it("Identifica Brave se houver sinal explícito fornecido no cliente/label", () => {
      const ua =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
      const res = parseUserAgent(ua, "Brave Browser no Windows");
      expect(res.browser).toBe("Brave");
      expect(res.os).toBe("Windows");
      expect(res.displayTitle).toBe("Brave · Windows");
    });

    it("Classifica legitimamente como Chrome quando Brave omite o User-Agent padrão sem sinal", () => {
      const ua =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
      const res = parseUserAgent(ua);
      expect(res.browser).toBe("Chrome");
      expect(res.os).toBe("Windows");
      expect(res.displayTitle).toBe("Chrome · Windows");
    });
  });

  describe("Fallbacks Seguros e Valores Nulos", () => {
    it("Lida com User-Agent nulo e label genérico", () => {
      const res = parseUserAgent(null, "Desktop");
      expect(res.browser).toBeNull();
      expect(res.os).toBeNull();
      expect(res.displayTitle).toBe("Desktop");
    });

    it("Preserva label customizado válido quando não há UA", () => {
      const res = parseUserAgent(null, "App Mobile Corporativo");
      expect(res.displayTitle).toBe("App Mobile Corporativo");
    });
  });
});
