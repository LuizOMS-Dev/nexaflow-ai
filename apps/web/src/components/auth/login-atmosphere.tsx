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
    const target = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.4 };
    const current = { x: target.x, y: target.y };
    let frame = 0;

    const host = root.parentElement ?? root;

    const apply = (x: number, y: number) => {
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      const nx = (x / w - 0.5) * 72;
      const ny = (y / h - 0.5) * 56;
      const lx = `${((x / w) * 100).toFixed(2)}%`;
      const ly = `${((y / h) * 100).toFixed(2)}%`;
      const px = `${nx.toFixed(2)}px`;
      const py = `${ny.toFixed(2)}px`;
      for (const el of host === root ? [root] : [root, host]) {
        el.style.setProperty("--lx", lx);
        el.style.setProperty("--ly", ly);
        el.style.setProperty("--px", px);
        el.style.setProperty("--py", py);
      }
    };

    const tick = () => {
      current.x += (target.x - current.x) * 0.072;
      current.y += (target.y - current.y) * 0.072;
      apply(current.x, current.y);
      frame = window.requestAnimationFrame(tick);
    };

    const stop = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      for (const el of host === root ? [root] : [root, host]) {
        el.style.removeProperty("--lx");
        el.style.removeProperty("--ly");
        el.style.removeProperty("--px");
        el.style.removeProperty("--py");
      }
    };

    const onPointer = (event: PointerEvent) => {
      if (reduce) return;
      target.x = event.clientX;
      target.y = event.clientY;
    };

    const onChange = () => {
      reduce = reduced();
      if (reduce) stop();
      else if (!frame) frame = window.requestAnimationFrame(tick);
    };

    reduceQuery.addEventListener("change", onChange);
    window.addEventListener("pointermove", onPointer, { passive: true });
    if (!reduce) {
      apply(current.x, current.y);
      frame = window.requestAnimationFrame(tick);
    }

    return () => {
      reduceQuery.removeEventListener("change", onChange);
      window.removeEventListener("pointermove", onPointer);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={ref} className="nf-login-atmo" aria-hidden>
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
