"use client";

import { useEffect, useRef } from "react";

/**
 * Fundo do login. O card descansa no centro: o ponteiro só o empurra alguns
 * pixels e a pose volta sozinha. O brilho fica atrás do painel.
 * Com prefers-reduced-motion (ou data-reduce-motion) fica estático.
 */
export function LoginAtmosphere() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reduced = () =>
      reduceQuery.matches || document.documentElement.dataset.reduceMotion === "true";

    let reduce = reduced();
    const rest = { x: 0, y: 0, cx: 50, cy: 46 };
    const aim = { ...rest };
    const pose = { x: 0, y: 0 };
    const poseV = { x: 0, y: 0 };
    const glow = { x: rest.cx, y: rest.cy };
    const glowV = { x: 0, y: 0 };
    let written = { x: Number.NaN, y: Number.NaN };
    let frame = 0;
    let last = performance.now();
    let lastMove = 0;

    const host = root.parentElement ?? root;
    let card = host.querySelector<HTMLElement>(".nf-login-stage-card");

    const apply = () => {
      const px = `${pose.x.toFixed(2)}px`;
      const py = `${pose.y.toFixed(2)}px`;
      host.style.setProperty("--px", px);
      host.style.setProperty("--py", py);
      const glowHost = card?.parentElement ?? card;
      glowHost?.style.setProperty("--cx", `${glow.x.toFixed(1)}%`);
      glowHost?.style.setProperty("--cy", `${glow.y.toFixed(1)}%`);
    };

    const tick = (now: number) => {
      if (document.hidden) {
        frame = 0;
        return;
      }
      if (!card || !card.isConnected) {
        card = host.querySelector<HTMLElement>(".nf-login-stage-card");
      }
      const idle = now - lastMove > 240;
      const goal = idle ? rest : aim;
      let remaining = Math.min(0.2, Math.max(0, (now - last) / 1000));
      last = now;
      while (remaining > 0.0001) {
        const dt = Math.min(0.016, remaining);
        remaining -= dt;
        const poseW = 8;
        const glowW = 7;
        poseV.x += (poseW * poseW * (goal.x - pose.x) - 2 * poseW * poseV.x) * dt;
        poseV.y += (poseW * poseW * (goal.y - pose.y) - 2 * poseW * poseV.y) * dt;
        pose.x += poseV.x * dt;
        pose.y += poseV.y * dt;
        glowV.x += (glowW * glowW * (goal.cx - glow.x) - 2 * glowW * glowV.x) * dt;
        glowV.y += (glowW * glowW * (goal.cy - glow.y) - 2 * glowW * glowV.y) * dt;
        glow.x += glowV.x * dt;
        glow.y += glowV.y * dt;
      }
      if (Math.hypot(pose.x, pose.y) < 0.05 && idle) {
        pose.x = 0;
        pose.y = 0;
        poseV.x = 0;
        poseV.y = 0;
      }
      const moved = Math.hypot(pose.x - written.x, pose.y - written.y);
      if (moved > 0.04 || Number.isNaN(written.x)) {
        apply();
        written = { x: pose.x, y: pose.y };
      }
      frame = window.requestAnimationFrame(tick);
    };

    const halt = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    };

    const stop = () => {
      halt();
      host.style.removeProperty("--px");
      host.style.removeProperty("--py");
      card?.parentElement?.style.removeProperty("--cx");
      card?.parentElement?.style.removeProperty("--cy");
    };

    const onPointer = (event: PointerEvent) => {
      if (reduce) return;
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      const dx = event.clientX / w - 0.5;
      const dy = event.clientY / h - 0.46;
      aim.x = Math.max(-3.5, Math.min(3.5, dx * 7));
      aim.y = Math.max(-2.5, Math.min(2.5, dy * 5));
      aim.cx = Math.max(42, Math.min(58, 50 + dx * 12));
      aim.cy = Math.max(38, Math.min(56, 46 + dy * 10));
      lastMove = performance.now();
    };

    const onLeave = (event: Event) => {
      if ("relatedTarget" in event && (event as PointerEvent).relatedTarget) return;
      lastMove = 0;
    };

    const onChange = () => {
      reduce = reduced();
      if (reduce) stop();
      else if (!frame && !document.hidden) frame = window.requestAnimationFrame(tick);
    };

    const onVisibility = () => {
      if (reduce) return;
      if (document.hidden) halt();
      else if (!frame) {
        last = performance.now();
        frame = window.requestAnimationFrame(tick);
      }
    };

    reduceQuery.addEventListener("change", onChange);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("blur", onLeave);
    document.documentElement.addEventListener("pointerout", onLeave);
    if (!reduce) {
      apply();
      written = { x: pose.x, y: pose.y };
      frame = window.requestAnimationFrame(tick);
    }

    return () => {
      reduceQuery.removeEventListener("change", onChange);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("blur", onLeave);
      document.documentElement.removeEventListener("pointerout", onLeave);
      halt();
    };
  }, []);

  return (
    <div ref={ref} className="nf-login-atmo" aria-hidden>
      <div className="nf-login-well" />
      <div className="nf-login-orb nf-login-orb-a" />
      <div className="nf-login-vignette" />
    </div>
  );
}
