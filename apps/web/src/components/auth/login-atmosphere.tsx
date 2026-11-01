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
      const nx = (poseX / w - 0.5) * 50;
      const ny = (poseY / h - 0.5) * 38;
      const lx = `${((glowX / w) * 100).toFixed(2)}%`;
      const ly = `${((glowY / h) * 100).toFixed(2)}%`;
      const px = `${nx.toFixed(2)}px`;
      const py = `${ny.toFixed(2)}px`;
      const tilt = `${((poseX / w - 0.5) * 2.15).toFixed(3)}deg`;
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
        const cx = ((poseX - cardRect.left) / cardRect.width) * 100;
        const cy = ((poseY - cardRect.top) / cardRect.height) * 100;
        const glowHost = card.parentElement ?? card;
        glowHost.style.setProperty("--cx", `${Math.max(-20, Math.min(120, cx)).toFixed(1)}%`);
        glowHost.style.setProperty("--cy", `${Math.max(-20, Math.min(120, cy)).toFixed(1)}%`);
      }
    };

    const tick = (now: number) => {
      if (document.hidden) {
        frame = 0;
        return;
      }
      samples += 1;
      let remaining = Math.min(0.28, Math.max(0, (now - last) / 1000));
      last = now;
      while (remaining > 0.0001) {
        const dt = Math.min(0.032, remaining);
        remaining -= dt;
        const glowK = 1 - Math.exp(-dt / 0.08);
        const poseK = 1 - Math.exp(-dt / 0.2);
        glow.x += (target.x - glow.x) * glowK;
        glow.y += (target.y - glow.y) * glowK;
        pose.x += (glow.x - pose.x) * poseK;
        pose.y += (glow.y - pose.y) * poseK;
      }
      const dx = pose.x - written.x;
      const dy = pose.y - written.y;
      if (dx * dx + dy * dy > 0.04) {
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
      <div className="nf-login-aurora" />
      <div className="nf-login-veil" />
      <div className="nf-login-band" />
      <div className="nf-login-mesh" />
      <div className="nf-login-parallax nf-login-parallax-far">
        <div className="nf-login-orb nf-login-orb-a" />
      </div>
      <div className="nf-login-parallax nf-login-parallax-mid">
        <div className="nf-login-orb nf-login-orb-b" />
      </div>
      <div className="nf-login-parallax nf-login-parallax-near">
        <div className="nf-login-orb nf-login-orb-c" />
      </div>
      <div className="nf-login-grid" />
      <div className="nf-login-spotlight" />
      <div className="nf-login-follow" />
      <div className="nf-login-vignette" />
    </div>
  );
}
