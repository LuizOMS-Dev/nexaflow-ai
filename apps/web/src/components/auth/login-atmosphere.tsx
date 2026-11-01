"use client";

import { useEffect, useRef } from "react";

/**
 * Fundo contínuo do login: orbes lentos, grade suave e brilho que segue o ponteiro.
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
    const target = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.42 };
    const glow = { x: target.x, y: target.y };
    const pose = { x: target.x, y: target.y };
    const glowV = { x: 0, y: 0 };
    const poseV = { x: 0, y: 0 };
    let written = { x: Number.NaN, y: Number.NaN };
    let frame = 0;
    let samples = 0;
    let last = performance.now();

    const host = root.parentElement ?? root;

    let card = host.querySelector<HTMLElement>(".nf-login-stage-card");
    let cardRect = card?.getBoundingClientRect() ?? null;

    const apply = (glowX: number, glowY: number, poseX: number, poseY: number) => {
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      const nx = (poseX / w - 0.5) * 16;
      const ny = (poseY / h - 0.5) * 12;
      const lx = `${((glowX / w) * 100).toFixed(2)}%`;
      const ly = `${((glowY / h) * 100).toFixed(2)}%`;
      const px = `${nx.toFixed(2)}px`;
      const py = `${ny.toFixed(2)}px`;
      const tilt = `${((poseX / w - 0.5) * 0.85).toFixed(3)}deg`;
      for (const el of host === root ? [root] : [root, host]) {
        el.style.setProperty("--lx", lx);
        el.style.setProperty("--ly", ly);
        el.style.setProperty("--px", px);
        el.style.setProperty("--py", py);
        el.style.setProperty("--tilt", tilt);
      }
      if (!card || !card.isConnected || samples % 12 === 0) {
        card = host.querySelector<HTMLElement>(".nf-login-stage-card");
        cardRect = card?.getBoundingClientRect() ?? null;
      }
      if (card && cardRect && cardRect.width) {
        const inset = 0.22;
        const span = 1 + inset * 2;
        const cx = (((poseX - cardRect.left) / cardRect.width + inset) / span) * 100;
        const cy = (((poseY - cardRect.top) / cardRect.height + inset) / span) * 100;
        const glowHost = card.parentElement ?? card;
        glowHost.style.setProperty("--cx", `${Math.max(0, Math.min(100, cx)).toFixed(1)}%`);
        glowHost.style.setProperty("--cy", `${Math.max(0, Math.min(100, cy)).toFixed(1)}%`);
      }
    };

    const tick = (now: number) => {
      if (document.hidden) {
        frame = 0;
        return;
      }
      samples += 1;
      let remaining = Math.min(0.2, Math.max(0, (now - last) / 1000));
      last = now;
      while (remaining > 0.0001) {
        const dt = Math.min(0.016, remaining);
        remaining -= dt;
        const glowW = 9;
        const poseW = 5.5;
        glowV.x += (glowW * glowW * (target.x - glow.x) - 2 * glowW * glowV.x) * dt;
        glowV.y += (glowW * glowW * (target.y - glow.y) - 2 * glowW * glowV.y) * dt;
        glow.x += glowV.x * dt;
        glow.y += glowV.y * dt;
        poseV.x += (poseW * poseW * (glow.x - pose.x) - 2 * poseW * poseV.x) * dt;
        poseV.y += (poseW * poseW * (glow.y - pose.y) - 2 * poseW * poseV.y) * dt;
        pose.x += poseV.x * dt;
        pose.y += poseV.y * dt;
      }
      const dx = pose.x - written.x;
      const dy = pose.y - written.y;
      if (dx * dx + dy * dy > 0.12) {
        apply(glow.x, glow.y, pose.x, pose.y);
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
      for (const el of host === root ? [root] : [root, host]) {
        el.style.removeProperty("--lx");
        el.style.removeProperty("--ly");
        el.style.removeProperty("--px");
        el.style.removeProperty("--py");
        el.style.removeProperty("--tilt");
      }
      card?.parentElement?.style.removeProperty("--cx");
      card?.parentElement?.style.removeProperty("--cy");
      card?.style.removeProperty("--cx");
      card?.style.removeProperty("--cy");
    };

    const onPointer = (event: PointerEvent) => {
      if (reduce) return;
      target.x = event.clientX;
      target.y = event.clientY;
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
    if (!reduce) {
      apply(glow.x, glow.y, pose.x, pose.y);
      written = { x: pose.x, y: pose.y };
      frame = window.requestAnimationFrame(tick);
    }

    return () => {
      reduceQuery.removeEventListener("change", onChange);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointer);
      halt();
    };
  }, []);

  return (
    <div ref={ref} className="nf-login-atmo" aria-hidden>
      <div className="nf-login-well" />
      <div className="nf-login-parallax nf-login-parallax-far">
        <div className="nf-login-orb nf-login-orb-a" />
      </div>
      <div className="nf-login-parallax nf-login-parallax-mid">
        <div className="nf-login-orb nf-login-orb-b" />
      </div>
      <div className="nf-login-spotlight" />
      <div className="nf-login-vignette" />
    </div>
  );
}
