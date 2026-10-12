"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/i18n";

export type GraphPoint = { id: string; label: string; href: string; kind: "note" | "task" };
/** both = เชื่อมหากันทั้งสองทาง (วาดเป็นเส้นเดียว หัวลูกศรสองด้าน) */
export type GraphEdge = { from: string; to: string; both?: boolean };
type Body = { id: string; x: number; y: number; vx: number; vy: number; fixed: boolean };

const short = (label: string) => (label.length > 24 ? `${label.slice(0, 23)}…` : label);

/**
 * แผนผังความสัมพันธ์แบบมีแรง (จุดผลักกัน เส้นเชื่อมดึงเข้าหากัน) — ขยับเองจนนิ่ง
 * ลากจุดเพื่อจัดวาง · ลากพื้นหลังเพื่อเลื่อน · หมุนล้อเมาส์/ถ่างนิ้วเพื่อซูม · ชี้ที่จุดเพื่อเน้นสิ่งที่เชื่อมกัน · คลิกเพื่อเปิด
 * ตำแหน่งถูกเขียนลง DOM ตรง ๆ ทุกเฟรม (ไม่ผ่าน state) เพื่อให้ลื่น
 */
export function ForceGraph({ points, edges }: { points: GraphPoint[]; edges: GraphEdge[] }) {
  const tr = useT();
  const router = useRouter();
  const svg = useRef<SVGSVGElement>(null);
  const world = useRef<SVGGElement>(null);
  const nodeEls = useRef(new Map<string, SVGGElement>());
  const lineEls = useRef<(SVGLineElement | null)[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  // สถานะของการจำลอง (เปลี่ยนทุกเฟรม จึงอยู่ใน ref ไม่ใช่ state)
  const sim = useRef({ alpha: 1, view: { x: 0, y: 0, k: 1 }, frame: 0, bodies: new Map<string, Body>() });

  const { dots, pairs, neighbors } = useMemo(() => {
    const ids = new Set(points.map((p) => p.id));
    const pairs = edges.filter((e) => ids.has(e.from) && ids.has(e.to));
    const neighbors = new Map<string, Set<string>>();
    for (const { from, to } of pairs) {
      neighbors.set(from, (neighbors.get(from) ?? new Set()).add(to));
      neighbors.set(to, (neighbors.get(to) ?? new Set()).add(from));
    }
    // จุดที่ถูกเชื่อมมากใหญ่กว่า
    const dots = points.map((p) => ({ ...p, r: 5 + Math.min(11, (neighbors.get(p.id)?.size ?? 0) * 1.8) }));
    return { dots, pairs, neighbors };
  }, [points, edges]);

  useEffect(() => {
    const state = sim.current;
    // เริ่มเป็นเกลียวรอบจุดกลาง แล้วปล่อยให้แรงจัดวางเอง
    const bodies: Body[] = dots.map((p, i) => {
      const angle = i * 2.4;
      const radius = 30 + 16 * Math.sqrt(i);
      return { id: p.id, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, vx: 0, vy: 0, fixed: false };
    });
    state.bodies = new Map(bodies.map((b) => [b.id, b]));
    const radius = new Map(dots.map((d) => [d.id, d.r]));
    const links = pairs.map((e) => ({ a: state.bodies.get(e.from)!, b: state.bodies.get(e.to)!, ra: radius.get(e.from)! + 3, rb: radius.get(e.to)! + 3 }));
    const paint = () => {
      for (const b of bodies) nodeEls.current.get(b.id)?.setAttribute("transform", `translate(${b.x.toFixed(1)} ${b.y.toFixed(1)})`);
      links.forEach(({ a, b, ra, rb }, i) => {
        const line = lineEls.current[i];
        if (!line) return;
        // ปลายเส้นหยุดที่ขอบวงกลม ให้หัวลูกศรไม่ถูกจุดบัง
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const fit = d > ra + rb + 4 ? 1 : 0;
        line.setAttribute("x1", (a.x + (dx / d) * ra * fit).toFixed(1));
        line.setAttribute("y1", (a.y + (dy / d) * ra * fit).toFixed(1));
        line.setAttribute("x2", (b.x - (dx / d) * rb * fit).toFixed(1));
        line.setAttribute("y2", (b.y - (dy / d) * rb * fit).toFixed(1));
      });
      const { x, y, k } = state.view;
      world.current?.setAttribute("transform", `translate(${x} ${y}) scale(${k})`);
    };
    const tick = () => {
      const alpha = state.alpha;
      for (let i = 0; i < bodies.length; i++) {
        const a = bodies[i];
        // ดึงเข้าหากลางเบา ๆ ไม่ให้ลอยหาย
        a.vx -= a.x * 0.008 * alpha;
        a.vy -= a.y * 0.008 * alpha;
        for (let j = i + 1; j < bodies.length; j++) {
          const b = bodies[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) {
            dx = Math.random() - 0.5;
            dy = Math.random() - 0.5;
            d2 = 1;
          }
          if (d2 > 160000) continue;
          const force = (7000 / d2) * alpha;
          const d = Math.sqrt(d2);
          a.vx += (dx / d) * force;
          a.vy += (dy / d) * force;
          b.vx -= (dx / d) * force;
          b.vy -= (dy / d) * force;
        }
      }
      for (const { a, b } of links) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const pull = (d - 130) * 0.03 * alpha;
        a.vx += (dx / d) * pull;
        a.vy += (dy / d) * pull;
        b.vx -= (dx / d) * pull;
        b.vy -= (dy / d) * pull;
      }
      for (const b of bodies) {
        if (b.fixed) {
          b.vx = b.vy = 0;
          continue;
        }
        b.vx *= 0.82;
        b.vy *= 0.82;
        b.x += b.vx;
        b.y += b.vy;
      }
      state.alpha = Math.max(0, alpha - 0.004);
    };
    const center = () => {
      const box = svg.current?.getBoundingClientRect();
      if (box) state.view = { ...state.view, x: box.width / 2, y: box.height / 2 };
    };
    center();
    state.alpha = 1;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // ไม่เล่นอนิเมชัน: คำนวณจนนิ่งแล้ววาดครั้งเดียว
      while (state.alpha > 0) tick();
      paint();
      return;
    }
    const loop = () => {
      if (state.alpha > 0) tick();
      paint();
      state.frame = requestAnimationFrame(loop);
    };
    state.frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(state.frame);
  }, [dots, pairs]);

  // ลากจุด / ลากพื้นหลัง / ซูม
  const drag = useRef<{ body?: Body; href?: string; x: number; y: number; moved: boolean } | null>(null);
  const toWorld = (clientX: number, clientY: number) => {
    const box = svg.current!.getBoundingClientRect();
    const { x, y, k } = sim.current.view;
    return { x: (clientX - box.left - x) / k, y: (clientY - box.top - y) / k };
  };
  const onDown = (e: React.PointerEvent, dot?: GraphPoint) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const body = dot ? sim.current.bodies.get(dot.id) : undefined;
    drag.current = { body, href: dot?.href, x: e.clientX, y: e.clientY, moved: false };
    if (body) body.fixed = true;
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) d.moved = true;
    if (d.body) {
      const p = toWorld(e.clientX, e.clientY);
      d.body.x = p.x;
      d.body.y = p.y;
      sim.current.alpha = Math.max(sim.current.alpha, 0.35);
    } else {
      sim.current.view.x += e.clientX - d.x;
      sim.current.view.y += e.clientY - d.y;
      d.x = e.clientX;
      d.y = e.clientY;
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.body) return;
    d.body.fixed = false;
    e.stopPropagation();
    if (!d.moved && d.href) router.push(d.href);
  };
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = el.getBoundingClientRect();
      const view = sim.current.view;
      const k = Math.min(3, Math.max(0.3, view.k * (e.deltaY < 0 ? 1.12 : 0.89)));
      // ซูมรอบตำแหน่งเมาส์
      const mx = e.clientX - box.left;
      const my = e.clientY - box.top;
      view.x = mx - ((mx - view.x) / view.k) * k;
      view.y = my - ((my - view.y) / view.k) * k;
      view.k = k;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const lit = (id: string) => hover === null || hover === id || neighbors.get(hover)?.has(id);

  return (
    <svg
      ref={svg}
      role="img"
      aria-label={tr("แผนผังความสัมพันธ์ของโน้ต")}
      className="h-[min(70vh,40rem)] w-full cursor-grab touch-none select-none rounded-xl bg-surface-sunken/50 active:cursor-grabbing"
      onPointerDown={(e) => onDown(e)}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <defs>
        {/* หัวลูกศรบอกทิศของลิงก์: ชี้ไปหาโน้ต/งานที่ถูกอ้างถึง */}
        <marker id="graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M0 1.5 9 5 0 8.5z" className="fill-subtle" />
        </marker>
        <marker id="graph-arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M0 1.5 9 5 0 8.5z" className="fill-primary" />
        </marker>
      </defs>
      <g ref={world}>
        <g strokeLinecap="round">
          {pairs.map(({ from, to, both }, i) => {
            const on = hover !== null && (from === hover || to === hover);
            const arrow = `url(#graph-arrow${on ? "-on" : ""})`;
            return <line key={i} ref={(el) => { lineEls.current[i] = el; }} markerEnd={arrow} markerStart={both ? arrow : undefined} className={`transition-opacity duration-200 ${on ? "stroke-primary" : "stroke-subtle"}`} strokeWidth={on ? 1.8 : both ? 1.4 : 1} opacity={hover === null || on ? 1 : 0.15} />;
          })}
        </g>
        {dots.map((b) => (
          <g
            key={b.id}
            ref={(el) => { if (el) nodeEls.current.set(b.id, el); else nodeEls.current.delete(b.id); }}
            className="cursor-pointer transition-opacity duration-200"
            opacity={lit(b.id) ? 1 : 0.18}
            onPointerDown={(e) => onDown(e, b)}
            onPointerEnter={() => setHover(b.id)}
            onPointerLeave={() => setHover(null)}
          >
            <title>{b.label}</title>
            <circle r={b.r + 8} fill="transparent" />
            <circle r={hover === b.id ? b.r + 2 : b.r} className={`transition-all duration-150 ${b.kind === "task" ? "fill-success" : neighbors.has(b.id) ? "fill-primary" : "fill-subtle"}`} stroke="var(--surface)" strokeWidth={1.5} />
            <text y={b.r + 13} textAnchor="middle" fontSize={11} className={`pointer-events-none ${hover === b.id ? "fill-foreground font-semibold" : "fill-muted-foreground"}`}>{short(b.label)}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
