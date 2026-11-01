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
    const rest = { x: 0, y: 0, tilt: 0, lx: 50, ly: 42, cx: 50, cy: 48 };
    const aim = { ...rest };
    const pose = { x: 0, y: 0, tilt: 0 };
    const poseV = { x: 0, y: 0, tilt: 0 };
    const light = { x: rest.lx, y: rest.ly };
    const lightV = { x: 0, y: 0 };
    const glow = { x: rest.cx, y: rest.cy };
    const glowV = { x: 0, y: 0 };
    let written = Number.NaN;
    let frame = 0;
    let last = performance.now();
    let lastMove = 0;

    const host = root.parentElement ?? root;
    let card = host.querySelector<HTMLElement>(".nf-login-stage-card");

    const apply = () => {
      const px = `${pose.x.toFixed(2)}px`;
      const py = `${pose.y.toFixed(2)}px`;
      const tilt = `${pose.tilt.toFixed(3)}deg`;
      const lx = `${light.x.toFixed(2)}%`;
      const ly = `${light.y.toFixed(2)}%`;
      for (const el of host === root ? [root] : [root, host]) {
        el.style.setProperty("--px", px);
        el.style.setProperty("--py", py);
        el.style.setProperty("--tilt", tilt);
        el.style.setProperty("--lx", lx);
        el.style.setProperty("--ly", ly);
      }
      const glowHost = card?.parentElement ?? card;
      glowHost?.style.setProperty("--cx", `${glow.x.toFixed(1)}%`);
      glowHost?.style.setProperty("--cy", `${glow.y.toFixed(1)}%`);
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
      const idle = now - lastMove > 520;
      const goal = idle ? rest : aim;
      let remaining = Math.min(0.2, Math.max(0, (now - last) / 1000));
      last = now;
      while (remaining > 0.0001) {
        const dt = Math.min(0.016, remaining);
        remaining -= dt;
        const px = spring(pose.x, poseV.x, goal.x, 6.2, dt);
        const py = spring(pose.y, poseV.y, goal.y, 6.2, dt);
        const pt = spring(pose.tilt, poseV.tilt, goal.tilt, 6.2, dt);
        pose.x = px.value;
        poseV.x = px.velocity;
        pose.y = py.value;
        poseV.y = py.velocity;
        pose.tilt = pt.value;
        poseV.tilt = pt.velocity;
        const lx = spring(light.x, lightV.x, goal.lx, 5.2, dt);
        const ly = spring(light.y, lightV.y, goal.ly, 5.2, dt);
        light.x = lx.value;
        lightV.x = lx.velocity;
        light.y = ly.value;
        lightV.y = ly.velocity;
        const cx = spring(glow.x, glowV.x, goal.cx, 7.4, dt);
        const cy = spring(glow.y, glowV.y, goal.cy, 7.4, dt);
        glow.x = cx.value;
        glowV.x = cx.velocity;
        glow.y = cy.value;
        glowV.y = cy.velocity;
      }
      if (idle && Math.hypot(pose.x, pose.y) < 0.08) {
        pose.x = 0;
        pose.y = 0;
        pose.tilt = 0;
        poseV.x = 0;
        poseV.y = 0;
        poseV.tilt = 0;
      }
      const signature = pose.x + pose.y + light.x * 0.01 + glow.x * 0.01;
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
      for (const el of host === root ? [root] : [root, host]) {
        el.style.removeProperty("--px");
        el.style.removeProperty("--py");
        el.style.removeProperty("--tilt");
        el.style.removeProperty("--lx");
        el.style.removeProperty("--ly");
      }
      card?.parentElement?.style.removeProperty("--cx");
      card?.parentElement?.style.removeProperty("--cy");
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
      aim.lx = Math.max(6, Math.min(94, (event.clientX / w) * 100));
      aim.ly = Math.max(6, Math.min(94, (event.clientY / h) * 100));
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
      written = 0;
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
      <div className="nf-login-shift">
        <div className="nf-login-well" />
        <div className="nf-login-orb nf-login-orb-a" />
        <div className="nf-login-orb nf-login-orb-b" />
      </div>
      <div className="nf-login-spotlight" />
      <div className="nf-login-vignette" />
    </div>
  );
}
