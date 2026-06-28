"use client";

import { useEffect, useRef } from "react";

function formatTimestamp(d: Date): string {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}, ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const NUMERIC_ROWS = [
  "246 259 246 245 246 245 246 245 246 245 246 245 246 245 246 245 246 245",
  "346 255 246 245 346 255 246 245 346 255 246 245 346 255 246 245 346 255",
  "128 044 092 156 128 044 092 156 128 044 092 156 128 044 092 156 128 044",
];

export function SwarmGraphBackdrop() {
  return (
    <>
      <div className="swarm-overlay-bokeh pointer-events-none absolute inset-0 z-[1]" aria-hidden />
      <div className="swarm-overlay-vignette pointer-events-none absolute inset-0 z-[2]" aria-hidden />
    </>
  );
}

export function SwarmGraphForeground({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tsRef = useRef<HTMLSpanElement>(null);
  const rafRef = useRef(0);
  const offsetRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    const tick = () => {
      if (tsRef.current) {
        tsRef.current.textContent = formatTimestamp(new Date());
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    let running = true;
    const draw = () => {
      if (!running) return;
      offsetRef.current += 0.35;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = "rgba(255,255,255,0.14)";

      NUMERIC_ROWS.forEach((row, i) => {
        const y = canvas.height * (0.2 + i * 0.07);
        const repeat = `${row} ${row} ${row} `;
        const x = -(offsetRef.current + i * 40) % (repeat.length * 5.8);
        ctx.fillText(repeat, x, y);
        ctx.fillText(repeat, x + repeat.length * 5.8, y);
      });

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [active]);

  if (!active) return null;

  return (
    <>
      <div className="swarm-overlay-beam pointer-events-none absolute inset-0 z-[15]" aria-hidden />
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 z-[16] mix-blend-screen"
        aria-hidden
      />
      <span
        ref={tsRef}
        className="pointer-events-none absolute left-3 top-3 z-[25] font-mono text-[10px] tracking-wide text-white/35"
      />
    </>
  );
}

/** @deprecated use SwarmGraphBackdrop + SwarmGraphForeground */
export function SwarmGraphOverlay({ active }: { active: boolean }) {
  return (
    <>
      <SwarmGraphBackdrop />
      <SwarmGraphForeground active={active} />
    </>
  );
}
