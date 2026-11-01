"use client";

import { useEffect, useRef } from "react";

/**
 * O card acompanha o ponteiro e permanece onde o cursor parou.
 * O brilho fica só atrás do painel. Sem aura fixa no fundo.
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
    const aim = { x: 0, y: 0, tilt: 0, cx: 50, cy: 48 };
    const pose = { x: 0, y: 0, tilt: 0 };
    const poseV = { x: 0, y: 0, tilt: 0 };
    const glow = { x: aim.cx, y: aim.cy };
    const glowV = { x: 0, y: 0 };
    let written = Number.NaN;
    let frame = 0;
    let last = performance.now();
    let armed = false;

    const host = root.parentElement ?? root;
    let card = host.querySelector<HTMLElement>(".nf-login-stage-card");

    const apply = () => {
      const px = `${pose.x.toFixed(2)}px`;
      const py = `${pose.y.toFixed(2)}px`;
      const tilt = `${pose.tilt.toFixed(3)}deg`;
      host.style.setProperty("--px", px);
      host.style.setProperty("--py", py);
      host.style.setProperty("--tilt", tilt);
      const glowHost = card?.parentElement ?? card;
      if (glowHost) {
        glowHost.style.setProperty("--cx", `${glow.x.toFixed(1)}%`);
        glowHost.style.setProperty("--cy", `${glow.y.toFixed(1)}%`);
        if (armed) glowHost.classList.add("is-following");
      }
    };

    const spring = (
      value: number,
      velocity: number,
      goal: number,
      omega: number,
      dt: number
    ) => {
      const nextV = velocity + (omega * omega * (goal - value) - 2 * omega * velocity) * dt;
      return { value: value + nextV * dt, velocity: nextV };
    };

    const tick = (now: number) => {
      if (document.hidden) {
        frame = 0;
        return;
      }
      if (!card || !card.isConnected) {
        card = host.querySelector<HTMLElement>(".nf-login-stage-card");
      }
      let remaining = Math.min(0.2, Math.max(0, (now - last) / 1000));
      last = now;
      while (remaining > 0.0001) {
        const dt = Math.min(0.016, remaining);
        remaining -= dt;
        const px = spring(pose.x, poseV.x, aim.x, 6.2, dt);
        const py = spring(pose.y, poseV.y, aim.y, 6.2, dt);
        const pt = spring(pose.tilt, poseV.tilt, aim.tilt, 6.2, dt);
        pose.x = px.value;
        poseV.x = px.velocity;
        pose.y = py.value;
        poseV.y = py.velocity;
        pose.tilt = pt.value;
        poseV.tilt = pt.velocity;
        const cx = spring(glow.x, glowV.x, aim.cx, 7.4, dt);
        const cy = spring(glow.y, glowV.y, aim.cy, 7.4, dt);
        glow.x = cx.value;
        glowV.x = cx.velocity;
        glow.y = cy.value;
        glowV.y = cy.velocity;
      }
      const signature = pose.x + pose.y + glow.x * 0.05;
      if (Math.abs(signature - written) > 0.03 || Number.isNaN(written)) {
        apply();
        written = signature;
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
      host.style.removeProperty("--tilt");
      const glowHost = card?.parentElement;
      glowHost?.style.removeProperty("--cx");
      glowHost?.style.removeProperty("--cy");
      glowHost?.classList.remove("is-following");
      armed = false;
    };

    const onPointer = (event: PointerEvent) => {
      if (reduce) return;
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      const dx = event.clientX / w - 0.5;
      const dy = event.clientY / h - 0.46;
      aim.x = Math.max(-11, Math.min(11, dx * 22));
      aim.y = Math.max(-8, Math.min(8, dy * 16));
      aim.tilt = Math.max(-0.7, Math.min(0.7, dx * 1.2));
      if (!card || !card.isConnected) {
        card = host.querySelector<HTMLElement>(".nf-login-stage-card");
      }
      const rect = card?.getBoundingClientRect();
      if (rect && rect.width) {
        const nx = Math.max(-0.4, Math.min(1.4, (event.clientX - rect.left) / rect.width));
        const ny = Math.max(-0.35, Math.min(1.4, (event.clientY - rect.top) / rect.height));
        const inset = 0.24;
        const span = 1 + inset * 2;
        aim.cx = Math.max(22, Math.min(78, ((nx + inset) / span) * 100));
        aim.cy = Math.max(22, Math.min(78, ((ny + inset) / span) * 100));
      }
      armed = true;
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
    if (!reduce) frame = window.requestAnimationFrame(tick);

    return () => {
      reduceQuery.removeEventListener("change", onChange);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointer);
      halt();
    };
  }, []);

  return <div ref={ref} className="nf-login-atmo" aria-hidden />;
}
