import { describe, expect, it } from "vitest";
import {
  applyTourAction,
  PLATFORM_TOUR_AUTO_OFFER_FROM,
  resolveTourState,
  shouldAutoOffer,
} from "./platform-tour";

describe("platform-tour", () => {
  it("sem preferência salva → NOT_OFFERED com auto-offer", () => {
    const { state, needsBackfill } = resolveTourState(null, new Date());
    expect(state.status).toBe("NOT_OFFERED");
    expect(needsBackfill).toBe(false);
    expect(shouldAutoOffer(state)).toBe(true);
  });

  it("respeita estado já persistido (DISMISSED não reabre)", () => {
    const { state } = resolveTourState(
      {
        platformTour: {
          status: "DISMISSED",
          version: 1,
          dismissReason: "explore_alone",
        },
      },
      new Date()
    );
    expect(state.status).toBe("DISMISSED");
    expect(shouldAutoOffer(state)).toBe(false);
  });

  it("Explorar sozinho dispensa permanentemente o auto-offer", () => {
    const started = applyTourAction(
      { status: "OFFERED", version: 1 },
      "dismiss"
    );
    expect(started.status).toBe("DISMISSED");
    expect(started.dismissReason).toBe("explore_alone");
    expect(shouldAutoOffer(started)).toBe(false);
  });

  it("concluir e reiniciar: restart não apaga completedAt", () => {
    let s = applyTourAction({ status: "STARTED", version: 1 }, "complete", {
      stepId: "settings",
    });
    expect(s.status).toBe("COMPLETED");
    expect(s.completedAt).toBeTruthy();
    const completedAt = s.completedAt;
    s = applyTourAction(s, "restart");
    expect(s.status).toBe("STARTED");
    expect(s.completedAt).toBe(completedAt);
    expect(s.restartedAt).toBeTruthy();
  });

  it("sair do tour marca DISMISSED e não reabre auto-offer", () => {
    const s = applyTourAction(
      { status: "STARTED", version: 1, lastStep: "inbox" },
      "exit",
      { stepId: "inbox" }
    );
    expect(s.status).toBe("DISMISSED");
    expect(s.dismissReason).toBe("manual_exit");
    expect(shouldAutoOffer(s)).toBe(false);
  });
});
