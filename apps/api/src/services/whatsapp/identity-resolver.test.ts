import { describe, expect, it } from "vitest";
import {
  detectJidType,
  isLid,
  isPhoneJid,
  isGroupJid,
  extractPhoneDigitsFromJid,
  extractLid,
  formatWahaDestinationChatId,
} from "./identity-resolver";

describe("WhatsAppIdentityResolver — JID / LID Types and Parsing", () => {
  it("detects LID vs Phone JID vs Group vs Broadcast", () => {
    expect(detectJidType("12345678901234@lid")).toBe("LID");
    expect(detectJidType("5534999999999@c.us")).toBe("PHONE_JID");
    expect(detectJidType("5534999999999@s.whatsapp.net")).toBe("PHONE_JID");
    expect(detectJidType("120363024829392@g.us")).toBe("GROUP");
    expect(detectJidType("status@broadcast")).toBe("BROADCAST");
    expect(detectJidType("unknown")).toBe("UNKNOWN");
  });

  it("isLid, isPhoneJid, isGroupJid helpers", () => {
    expect(isLid("9876543210@lid")).toBe(true);
    expect(isLid("5511999999999@c.us")).toBe(false);
    expect(isPhoneJid("5511999999999@c.us")).toBe(true);
    expect(isPhoneJid("5511999999999@s.whatsapp.net")).toBe(true);
    expect(isGroupJid("12345@g.us")).toBe(true);
  });

  it("extractPhoneDigitsFromJid extracts phone ONLY from Phone JIDs, never from LID", () => {
    expect(extractPhoneDigitsFromJid("5534999999999@c.us")).toBe("5534999999999");
    expect(extractPhoneDigitsFromJid("5511988887777:2@s.whatsapp.net")).toBe("5511988887777");
    // CRUCIAL: LID must never be parsed as a phone number
    expect(extractPhoneDigitsFromJid("12345678901234@lid")).toBeNull();
    expect(extractPhoneDigitsFromJid("120363024829392@g.us")).toBeNull();
  });

  it("extractLid extracts LID string only when valid", () => {
    expect(extractLid("12345678901234@lid")).toBe("12345678901234@lid");
    expect(extractLid("5534999999999@c.us")).toBeNull();
  });

  it("formatWahaDestinationChatId preserves @lid and @c.us without corrupting delivery targets", () => {
    // 1. LID is preserved exactly
    expect(formatWahaDestinationChatId("12345678901234@lid")).toBe("12345678901234@lid");
    
    // 2. @c.us is preserved
    expect(formatWahaDestinationChatId("5534999999999@c.us")).toBe("5534999999999@c.us");
    
    // 3. @s.whatsapp.net is converted to @c.us with same phone digits
    expect(formatWahaDestinationChatId("5534999999999:0@s.whatsapp.net")).toBe("5534999999999@c.us");
    
    // 4. Raw phone numbers are formatted to @c.us
    expect(formatWahaDestinationChatId("5534999999999")).toBe("5534999999999@c.us");
    expect(formatWahaDestinationChatId("+55 (34) 99999-9999")).toBe("5534999999999@c.us");
  });
});
