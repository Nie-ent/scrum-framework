"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/i18n";

export type GraphPoint = { id: string; label: string; href: string; kind: "note" | "task"; group?: string; at?: number };
/** both = เชื่อมหากันทั้งสองทาง (วาดเป็นเส้นเดียว หัวลูกศรสองด้าน) */
export type GraphEdge = { from: string; to: string; both?: boolean };
/** กลุ่ม = โฟลเดอร์ระดับบนสุด · slot = ลำดับสีในชุดสี (null = กลุ่มเล็กที่ใช้สีกลาง) */
export type GraphGroup = { id: string; label: string; slot: number | null; count: number };
type Body = { i: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; fixed: boolean; sx: number; sy: number; scale: number; depth: number; born: number };
type Settings = { gap: number; tight: number };

// ชุดสีแยกหมวด 8 สี (ลำดับตายตัว ไม่วนซ้ำ) — กลุ่มที่เกินใช้สีกลาง และทุกกลุ่มมีชื่อกำกับ ไม่พึ่งสีอย่างเดียว
const PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const FOCAL = 900;
const DEFAULTS: Settings = { gap: 50, tight: 50 };
const STORE = "pace-graph-settings";
// ความเร็วตอนเล่นการเติบโต (เท่าของ 3 จุดต่อวินาที)
const SPEEDS = [0.5, 1, 2, 4, 8];
const subscribe = () => () => {};
const readStore = () => {
  try {
    return localStorage.getItem(STORE);
  } catch {
    // อ่านไม่ได้ (เช่น โหมดส่วนตัว) = ใช้ค่าเริ่มต้น
    return null;
  }
};
const short = (label: string) => (label.length > 24 ? `${label.slice(0, 23)}…` : label);
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * แผนผังความสัมพันธ์แบบ 3 มิติ: จุดผลักกัน เส้นเชื่อมดึงเข้าหากัน และโน้ตในโฟลเดอร์หลักเดียวกันเกาะเป็นกลุ่ม
 * ลากพื้นหลังเพื่อหมุนรอบ · Shift+ลาก (หรือสองนิ้ว) เพื่อเลื่อน · ล้อเมาส์/ถ่างนิ้วเพื่อซูม · ลากจุดเพื่อจัดวาง · คลิกเพื่อเปิด
 * บนเว็บเลือกได้ว่าลากพื้นหลังเพื่อหมุนหรือเลื่อน (Shift สลับชั่วคราว · คลิกขวาลาก = เลื่อนเสมอ)
 * ปุ่มเล่น = ดูแผนผังเติบโตตามลำดับที่โน้ตถูกสร้าง ปรับความเร็วและลากแถบเวลาได้
 * จุดที่อยู่ลึกจะเล็กและจางกว่า · ตัวเลื่อนปรับระยะห่างระหว่างกลุ่มและความกระจุกในกลุ่ม
 * วาดบน canvas และวาดใหม่เฉพาะตอนที่มีอะไรเปลี่ยน (นิ่งแล้วไม่กิน CPU) — ทุกอย่างคำนวณในเบราว์เซอร์ ไม่เรียกเซิร์ฟเวอร์เพิ่ม
 */
export function ForceGraph({ points, edges, groups }: { points: GraphPoint[]; edges: GraphEdge[]; groups: GraphGroup[] }) {
  const tr = useT();
  const router = useRouter();
  const canvas = useRef<HTMLCanvasElement>(null);
  // ค่าที่ผู้ใช้ปรับไว้ครั้งก่อน (จำไว้ในเบราว์เซอร์นี้) — ปรับในหน้านี้แล้วใช้ค่าที่ปรับล่าสุด
  const stored = useSyncExternalStore(subscribe, readStore, () => null);
  const [edited, setEdited] = useState<Settings | null>(null);
  const settings = useMemo(() => {
    if (edited) return edited;
    try {
      const saved = JSON.parse(stored ?? "null") as Partial<Settings> | null;
      return saved ? { gap: clamp(Number(saved.gap ?? DEFAULTS.gap) || 0, 0, 100), tight: clamp(Number(saved.tight ?? DEFAULTS.tight) || 0, 0, 100) } : DEFAULTS;
    } catch {
      return DEFAULTS;
    }
  }, [edited, stored]);
  // สถานะที่เปลี่ยนทุกเฟรมอยู่ใน ref ไม่ใช่ state
  const sim = useRef({ alpha: 1, frame: 0, bodies: [] as Body[], view: { yaw: 0.5, pitch: -0.3, k: 1, x: 0, y: 0, fit: true }, hover: -1, focal: FOCAL, settings: DEFAULTS, kick: () => {}, shown: 0, playing: false, speed: 1, carry: 0, last: 0, until: 0, play: () => {}, pause: () => {}, seek: (() => {}) as (n: number) => void });
  // ความคืบหน้าของการเล่น ผูกกับชุดข้อมูลที่กำลังแสดง (ข้อมูลเปลี่ยน = กลับไปแสดงครบ)
  const [progress, setProgress] = useState<{ of: unknown; shown: number; playing: boolean } | null>(null);
  const [speed, setSpeed] = useState(1);
  const [mode, setMode] = useState<"rotate" | "pan">("rotate");

  const { dots, pairs, neighbors, groupIndex, byRank } = useMemo(() => {
    const index = new Map(points.map((p, i) => [p.id, i]));
    const pairs = edges.flatMap((e) => (index.has(e.from) && index.has(e.to) ? [{ a: index.get(e.from)!, b: index.get(e.to)!, both: Boolean(e.both) }] : []));
    const neighbors = points.map(() => new Set<number>());
    for (const { a, b } of pairs) {
      neighbors[a].add(b);
      neighbors[b].add(a);
    }
    const groupIndex = new Map(groups.map((g, i) => [g.id, i]));
    // จุดที่ถูกเชื่อมมากใหญ่กว่า
    // ลำดับที่ถูกสร้าง (เก่าสุดก่อน) — ใช้ตอนเล่นการเติบโตของแผนผัง
    const byRank = points.map((_, i) => i).sort((a, b) => (points[a].at ?? 0) - (points[b].at ?? 0) || points[a].label.localeCompare(points[b].label, "th"));
    const rank = points.map(() => 0);
    byRank.forEach((i, r) => (rank[i] = r));
    const dots = points.map((p, i) => ({ ...p, rank: rank[i], r: 5 + Math.min(11, neighbors[i].size * 1.8), g: p.group !== undefined ? (groupIndex.get(p.group) ?? -1) : -1 }));
    return { dots, pairs, neighbors, groupIndex, byRank };
  }, [points, edges, groups]);

  const change = (next: Settings) => {
    setEdited(next);
    try {
      localStorage.setItem(STORE, JSON.stringify(next));
    } catch {
      // จำไม่ได้ก็ไม่เป็นไร
    }
  };
  useEffect(() => {
    sim.current.settings = settings;
    // ปรับตัวเลื่อน = ปลุกการจัดวางให้ขยับไปตำแหน่งใหม่
    sim.current.alpha = Math.max(sim.current.alpha, 0.6);
    sim.current.kick();
  }, [settings]);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const state = sim.current;
    const css = getComputedStyle(el);
    const token = (name: string) => css.getPropertyValue(name).trim();
    const ink = { surface: token("--surface"), subtle: token("--subtle"), muted: token("--muted-foreground"), fg: token("--foreground"), primary: token("--primary"), neutral: token("--neutral") };
    const font = css.fontFamily;
    const colorOf = (g: number) => (g >= 0 && groups[g].slot !== null ? PALETTE[groups[g].slot!] : ink.subtle);

    // จุดยึดของแต่ละกลุ่มกระจายบนทรงกลม (เกลียวฟีโบนักชี) — ระยะจากกลางคูณด้วยตัวเลื่อน "ระยะห่างระหว่างกลุ่ม"
    const anchors = groups.map((_, i) => {
      if (groups.length === 1) return { x: 0, y: 0, z: 0 };
      const y = 1 - ((i + 0.5) / groups.length) * 2;
      const ring = Math.sqrt(1 - y * y);
      const angle = i * 2.399963;
      return { x: Math.cos(angle) * ring, y, z: Math.sin(angle) * ring };
    });
    const reach = 60 + 26 * Math.sqrt(dots.length);
    // เริ่มใกล้จุดยึดของกลุ่มตัวเอง แล้วปล่อยให้แรงจัดวางเอง
    const bodies: Body[] = dots.map((d, i) => {
      const a = d.g >= 0 ? anchors[d.g] : { x: 0, y: 0, z: 0 };
      const angle = i * 2.4;
      const radius = 20 + 9 * Math.sqrt(i);
      return { i, x: a.x * reach + Math.cos(angle) * radius, y: a.y * reach + Math.sin(angle) * radius, z: a.z * reach + Math.sin(angle * 1.7) * radius, vx: 0, vy: 0, vz: 0, fixed: false, sx: 0, sy: 0, scale: 1, depth: 0, born: -Infinity };
    });
    state.bodies = bodies;
    state.hover = -1;
    state.shown = dots.length;
    state.playing = false;
    // จุดที่ยังไม่ถึงคิวตอนเล่น = ยังไม่มีอยู่: ไม่ถูกวาด ไม่ออกแรง และกดไม่ได้
    const seen = (i: number) => dots[i].rank < state.shown;
    const report = () => setProgress({ of: dots, shown: state.shown, playing: state.playing });
    // จุดถัดไปโผล่ข้างสิ่งที่มันเชื่อมอยู่ (ไม่มี = ที่จุดยึดของกลุ่ม) แล้วให้แรงจัดวางต่อ
    const reveal = (now: number) => {
      const i = byRank[state.shown];
      const b = bodies[i];
      const spread = (state.settings.gap / 50) ** 1.6 * reach;
      const g = dots[i].g;
      let from = g >= 0 ? { x: anchors[g].x * spread, y: anchors[g].y * spread, z: anchors[g].z * spread } : { x: 0, y: 0, z: 0 };
      for (const n of neighbors[i]) {
        if (seen(n)) {
          from = bodies[n];
          break;
        }
      }
      b.x = from.x + (Math.random() - 0.5) * 40;
      b.y = from.y + (Math.random() - 0.5) * 40;
      b.z = from.z + (Math.random() - 0.5) * 40;
      b.vx = b.vy = b.vz = 0;
      b.born = now;
      state.shown++;
      state.alpha = Math.max(state.alpha, 0.5);
      state.until = now + 1200;
    };

    const tick = () => {
      const alpha = state.alpha;
      const tight = state.settings.tight / 100;
      // ปลายตัวเลื่อนด้าน "ห่าง" ดันกลุ่มออกไปราว 3 เท่าของค่าเริ่มต้น
      const spread = (state.settings.gap / 50) ** 1.6 * reach;
      const repel = 9000 * (1.5 - tight);
      const rest = 150 - 80 * tight;
      const hold = 0.004 + tight * 0.05;
      for (let i = 0; i < bodies.length; i++) {
        if (!seen(i)) continue;
        const a = bodies[i];
        const g = dots[i].g;
        // ดึงเข้าหาจุดยึดของกลุ่ม (ไม่มีกลุ่ม = ดึงเข้ากลางเบา ๆ ไม่ให้ลอยหาย)
        const pull = g >= 0 ? hold : 0.008;
        a.vx -= (a.x - (g >= 0 ? anchors[g].x * spread : 0)) * pull * alpha;
        a.vy -= (a.y - (g >= 0 ? anchors[g].y * spread : 0)) * pull * alpha;
        a.vz -= (a.z - (g >= 0 ? anchors[g].z * spread : 0)) * pull * alpha;
        for (let j = i + 1; j < bodies.length; j++) {
          if (!seen(j)) continue;
          const b = bodies[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let dz = a.z - b.z;
          let d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < 1) {
            dx = Math.random() - 0.5;
            dy = Math.random() - 0.5;
            dz = Math.random() - 0.5;
            d2 = 1;
          }
          if (d2 > 250000) continue;
          const d = Math.sqrt(d2);
          const force = ((repel / d2) * alpha) / d;
          a.vx += dx * force;
          a.vy += dy * force;
          a.vz += dz * force;
          b.vx -= dx * force;
          b.vy -= dy * force;
          b.vz -= dz * force;
        }
      }
      for (const { a: ia, b: ib } of pairs) {
        if (!seen(ia) || !seen(ib)) continue;
        const a = bodies[ia];
        const b = bodies[ib];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        // เส้นข้ามกลุ่มดึงเบากว่า ไม่อย่างนั้นกลุ่มจะถูกลากมากองรวมกัน
        const pull = ((d - rest) * (dots[ia].g === dots[ib].g ? 0.03 : 0.006) * alpha) / d;
        a.vx += dx * pull;
        a.vy += dy * pull;
        a.vz += dz * pull;
        b.vx -= dx * pull;
        b.vy -= dy * pull;
        b.vz -= dz * pull;
      }
      for (const b of bodies) {
        if (b.fixed) {
          b.vx = b.vy = b.vz = 0;
          continue;
        }
        b.vx *= 0.82;
        b.vy *= 0.82;
        b.vz *= 0.82;
        b.x += b.vx;
        b.y += b.vy;
        b.z += b.vz;
      }
      state.alpha = Math.max(0, alpha - 0.004);
    };

    let width = 0;
    let height = 0;
    const order = bodies.map((b) => b);
    const widths: number[] = [];
    const paint = (now: number) => {
      const view = state.view;
      const live = bodies.filter((b) => seen(b.i));
      // จุดที่เพิ่งโผล่ค่อย ๆ โตขึ้น
      const grow = (b: Body) => 1 - (1 - clamp((now - b.born) / 400, 0, 1)) ** 3;
      const cy = Math.cos(view.yaw);
      const sy = Math.sin(view.yaw);
      const cp = Math.cos(view.pitch);
      const sp = Math.sin(view.pitch);
      let far = 1;
      const box = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
      for (const b of live) {
        // หมุนรอบแกนตั้ง (yaw) แล้วแกนนอน (pitch) จากนั้นฉายแบบมีระยะ: ยิ่งลึกยิ่งเล็ก
        const x1 = b.x * cy + b.z * sy;
        const z1 = -b.x * sy + b.z * cy;
        const y1 = b.y * cp - z1 * sp;
        const z2 = b.y * sp + z1 * cp;
        b.sx = x1;
        b.sy = y1;
        b.depth = z2;
        far = Math.max(far, Math.abs(z2));
      }
      // กล้องถอยตามขนาดของแผนผัง — ไม่อย่างนั้นจุดที่อยู่หน้าสุดจะใหญ่เกินจริงเมื่อกลุ่มอยู่ห่างกันมาก
      const focal = (state.focal = Math.max(FOCAL, far * 2.5));
      for (const b of live) {
        // เก็บตำแหน่งก่อนซูม/เลื่อนไว้ก่อน
        b.scale = focal / (focal + b.depth);
        b.sx *= b.scale;
        b.sy *= b.scale;
        box.left = Math.min(box.left, b.sx);
        box.right = Math.max(box.right, b.sx);
        box.top = Math.min(box.top, b.sy);
        box.bottom = Math.max(box.bottom, b.sy);
      }
      // ยังไม่ได้ซูม/เลื่อนเอง: ปรับให้เห็นทั้งแผนผังพอดีกรอบ (เผื่อที่ให้ป้ายชื่อ) — หมุนแล้วก็ยังพอดี
      if (view.fit && live.length > 0 && width > 0) {
        const k = clamp(Math.min((width - 150) / Math.max(1, box.right - box.left), (height - 110) / Math.max(1, box.bottom - box.top)), 0.2, 1.6);
        // ตอนเล่น กล้องค่อย ๆ ถอยตามแผนผังที่โตขึ้น ไม่กระตุกทุกครั้งที่มีจุดใหม่
        const ease = now < state.until ? 0.08 : 1;
        view.k += (k - view.k) * ease;
        view.x += ((-(box.left + box.right) / 2) * k - view.x) * ease;
        view.y += ((-(box.top + box.bottom) / 2) * k + 10 - view.y) * ease;
      }
      for (const b of live) {
        b.sx = width / 2 + view.x + b.sx * view.k;
        b.sy = height / 2 + view.y + b.sy * view.k;
        // ขนาดจุดตามความลึกและการซูม แต่ไม่เล็กจนกดไม่ได้หรือใหญ่จนบังกัน
        b.scale = clamp(b.scale * view.k, 0.45, 1.8);
      }
      // 1 = หน้าสุด, 0.4 = ลึกสุด
      const fade = (depth: number) => 1 - 0.6 * clamp((depth + far) / (2 * far), 0, 1);
      const hover = state.hover;
      const lit = (i: number) => hover < 0 || i === hover || neighbors[hover].has(i);
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.lineCap = "round";

      for (const { a: ia, b: ib, both } of pairs) {
        if (!seen(ia) || !seen(ib)) continue;
        const a = bodies[ia];
        const b = bodies[ib];
        const on = hover >= 0 && (ia === hover || ib === hover);
        const dx = b.sx - a.sx;
        const dy = b.sy - a.sy;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const ra = (dots[ia].r + 3) * a.scale;
        const rb = (dots[ib].r + 3) * b.scale;
        if (d < ra + rb + 4) continue;
        const ux = dx / d;
        const uy = dy / d;
        const x1 = a.sx + ux * ra;
        const y1 = a.sy + uy * ra;
        const x2 = b.sx - ux * rb;
        const y2 = b.sy - uy * rb;
        ctx.globalAlpha = hover >= 0 && !on ? 0.08 : (on ? 1 : 0.6) * fade((a.depth + b.depth) / 2) * Math.min(grow(a), grow(b));
        ctx.strokeStyle = ctx.fillStyle = on ? ink.primary : ink.subtle;
        ctx.lineWidth = on ? 1.8 : both ? 1.4 : 1;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        // หัวลูกศรชี้ไปหาสิ่งที่ถูกอ้างถึง
        const head = (x: number, y: number, dir: number, size: number) => {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - dir * (ux * size - uy * size * 0.45), y - dir * (uy * size + ux * size * 0.45));
          ctx.lineTo(x - dir * (ux * size + uy * size * 0.45), y - dir * (uy * size - ux * size * 0.45));
          ctx.closePath();
          ctx.fill();
        };
        head(x2, y2, 1, clamp(7 * b.scale, 4, 9));
        if (both) head(x1, y1, -1, clamp(7 * a.scale, 4, 9));
      }

      // จุดที่ลึกวาดก่อน จุดที่อยู่หน้าทับ
      order.sort((a, b) => b.depth - a.depth);
      for (const b of order) {
        if (!seen(b.i)) continue;
        const d = dots[b.i];
        const r = (b.i === hover ? d.r + 2 : d.r) * b.scale * grow(b);
        const linked = neighbors[b.i].size > 0;
        ctx.globalAlpha = lit(b.i) ? fade(b.depth) : 0.12;
        ctx.beginPath();
        if (d.kind === "task") ctx.roundRect(b.sx - r, b.sy - r, r * 2, r * 2, r * 0.3);
        else ctx.arc(b.sx, b.sy, r, 0, Math.PI * 2);
        // งาน = สี่เหลี่ยมสีกลาง · โน้ตที่เชื่อมแล้ว = จุดทึบสีของกลุ่ม · โน้ตที่ยังไม่ถูกเชื่อม = วงกลวง
        const color = d.kind === "task" ? ink.neutral : colorOf(d.g);
        ctx.fillStyle = linked || d.kind === "task" ? color : ink.surface;
        ctx.fill();
        ctx.lineWidth = linked || d.kind === "task" ? 1.5 : 2;
        ctx.strokeStyle = linked || d.kind === "task" ? ink.surface : color;
        ctx.stroke();
      }

      // ป้ายที่วางไปแล้ว — ป้ายใหม่ที่จะทับของเดิมไม่ถูกวาด ข้อความจึงไม่ซ้อนกันไม่ว่าจุดจะแน่นแค่ไหน (ซูมเข้าแล้วเห็นเพิ่มเอง)
      const placed: { x: number; y: number; w: number; h: number }[] = [];
      const fits = (x: number, y: number, w: number, h: number) => {
        if (placed.some((p) => x < p.x + p.w && p.x < x + w && y < p.y + p.h && p.y < y + h)) return false;
        placed.push({ x, y, w, h });
        return true;
      };
      ctx.textAlign = "center";

      // ชื่อกลุ่มลอยเหนือกลุ่ม ได้ที่ก่อนป้ายของจุด (ซ่อนตอนกำลังชี้ที่จุด เพื่อให้เห็นสิ่งที่เชื่อมกันชัด)
      if (hover < 0) {
        ctx.textBaseline = "bottom";
        ctx.font = `600 12px ${font}`;
        groups.forEach((group, g) => {
          const members = live.filter((b) => dots[b.i].g === g);
          if (members.length < 2) return;
          const cx = members.reduce((sum, b) => sum + b.sx, 0) / members.length;
          const top = Math.min(...members.map((b) => b.sy - dots[b.i].r * b.scale));
          const depth = members.reduce((sum, b) => sum + b.depth, 0) / members.length;
          const text = short(group.label);
          const w = ctx.measureText(text).width;
          if (!fits(cx - w / 2 - 14, top - 24, w + 20, 18)) return;
          ctx.globalAlpha = 0.35 + 0.6 * fade(depth);
          ctx.fillStyle = colorOf(g);
          ctx.beginPath();
          ctx.arc(cx - w / 2 - 7, top - 16, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = ink.fg;
          ctx.fillText(text, cx + 3, top - 9);
        });
      }

      // ป้ายของจุด: ตอนชี้อยู่ = เฉพาะสิ่งที่เชื่อมกัน · ปกติ = จุดที่ถูกเชื่อมมากและอยู่หน้าได้ที่ก่อน
      ctx.textBaseline = "top";
      ctx.font = `11px ${font}`;
      const wanted = live.filter((b) => b.i !== hover && (hover < 0 || lit(b.i))).sort((a, b) => neighbors[b.i].size - neighbors[a.i].size || a.depth - b.depth);
      for (const b of wanted) {
        const text = short(dots[b.i].label);
        const w = (widths[b.i] ??= ctx.measureText(text).width);
        const y = b.sy + dots[b.i].r * b.scale + 4;
        if (!fits(b.sx - w / 2 - 3, y - 1, w + 6, 15)) continue;
        ctx.globalAlpha = fade(b.depth) * 0.95 * grow(b);
        ctx.fillStyle = ink.muted;
        ctx.fillText(text, b.sx, y);
      }

      // ป้ายของจุดที่กำลังชี้: ชื่อเต็มบนพื้นทึบ อยู่บนสุดเสมอ
      if (hover >= 0) {
        const b = bodies[hover];
        const text = dots[hover].label.length > 60 ? `${dots[hover].label.slice(0, 59)}…` : dots[hover].label;
        ctx.globalAlpha = 1;
        ctx.font = `600 12px ${font}`;
        ctx.textBaseline = "middle";
        const w = ctx.measureText(text).width + 16;
        const x = clamp(b.sx, w / 2 + 4, width - w / 2 - 4);
        const y = b.sy + (dots[hover].r + 2) * b.scale + 16;
        ctx.fillStyle = ink.surface;
        ctx.strokeStyle = ink.subtle;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x - w / 2, y - 11, w, 22, 8);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = ink.fg;
        ctx.fillText(text, x, y);
      }
      ctx.globalAlpha = 1;
    };

    // วาดเฉพาะตอนที่มีอะไรเปลี่ยน: kick() เริ่มวง แล้ววงหยุดเองเมื่อการจัดวางนิ่ง
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const loop = (now: number) => {
      state.frame = 0;
      if (state.playing) {
        state.carry += (Math.min(100, now - state.last) / 1000) * 3 * state.speed;
        state.last = now;
        const before = state.shown;
        while (state.carry >= 1 && state.shown < dots.length) {
          reveal(now);
          state.carry -= 1;
        }
        if (state.shown >= dots.length) state.playing = false;
        if (state.shown !== before || !state.playing) report();
      }
      if (still) while (state.alpha > 0) tick();
      else if (state.alpha > 0) tick();
      paint(now);
      if (state.alpha > 0 || state.playing || now < state.until) state.frame = requestAnimationFrame(loop);
    };
    state.play = () => {
      // เล่นจากต้นเมื่อแสดงครบอยู่แล้ว ไม่อย่างนั้นเล่นต่อจากที่หยุดไว้
      if (state.shown >= dots.length) {
        state.shown = 0;
        state.carry = 1;
      }
      state.playing = true;
      state.last = performance.now();
      report();
      state.kick();
    };
    state.pause = () => {
      state.playing = false;
      report();
    };
    state.seek = (n: number) => {
      const now = performance.now();
      state.playing = false;
      state.hover = -1;
      if (n < state.shown) state.shown = n;
      else while (state.shown < n) reveal(now);
      state.alpha = Math.max(state.alpha, 0.4);
      report();
      state.kick();
    };
    state.kick = () => {
      if (!state.frame) state.frame = requestAnimationFrame(loop);
    };
    const resize = new ResizeObserver(() => {
      const box = el.getBoundingClientRect();
      width = box.width;
      height = box.height;
      el.width = Math.round(width * devicePixelRatio);
      el.height = Math.round(height * devicePixelRatio);
      state.kick();
    });
    resize.observe(el);
    state.alpha = 1;
    state.kick();
    return () => {
      resize.disconnect();
      cancelAnimationFrame(state.frame);
      state.frame = 0;
      state.kick = () => {};
      state.play = state.pause = () => {};
      state.seek = () => {};
    };
  }, [dots, pairs, neighbors, groups, byRank]);

  // จุดที่อยู่ใต้ตำแหน่งนี้ (ตัวที่อยู่หน้าสุดก่อน) — พื้นที่กดใหญ่กว่าจุดเล็กน้อย
  const hit = useCallback(
    (clientX: number, clientY: number) => {
      const box = canvas.current!.getBoundingClientRect();
      const x = clientX - box.left;
      const y = clientY - box.top;
      let found = -1;
      for (const b of sim.current.bodies) {
        if (dots[b.i].rank >= sim.current.shown) continue;
        const reach = dots[b.i].r * b.scale + 7;
        if ((b.sx - x) ** 2 + (b.sy - y) ** 2 <= reach * reach && (found < 0 || b.depth < sim.current.bodies[found].depth)) found = b.i;
      }
      return found;
    },
    [dots],
  );

  // ลากจุด / หมุน / เลื่อน / ซูม
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ body: number; pan: boolean; x: number; y: number; moved: boolean } | null>(null);
  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    const box = canvas.current!.getBoundingClientRect();
    const view = sim.current.view;
    const k = clamp(view.k * factor, 0.25, 4);
    // ซูมรอบตำแหน่งเมาส์
    const mx = clientX - box.left - box.width / 2;
    const my = clientY - box.top - box.height / 2;
    view.x = mx - ((mx - view.x) / view.k) * k;
    view.y = my - ((my - view.y) / view.k) * k;
    view.k = k;
    view.fit = false;
    sim.current.kick();
  };
  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.current.size > 1) {
      // นิ้วที่สองลง = เปลี่ยนเป็นซูม/เลื่อน ปล่อยจุดที่ลากอยู่
      if (drag.current && drag.current.body >= 0) sim.current.bodies[drag.current.body].fixed = false;
      drag.current = null;
      return;
    }
    // ปุ่มกลาง/ขวา = เลื่อนเสมอ · ปุ่มซ้ายตามโหมดที่เลือก โดย Shift สลับเป็นอีกโหมดชั่วคราว
    const other = e.button === 1 || e.button === 2;
    const body = other ? -1 : hit(e.clientX, e.clientY);
    drag.current = { body, pan: other || (mode === "pan") !== e.shiftKey, x: e.clientX, y: e.clientY, moved: false };
    if (body >= 0) sim.current.bodies[body].fixed = true;
  };
  const onMove = (e: React.PointerEvent) => {
    const state = sim.current;
    const before = touches.current.get(e.pointerId);
    if (before && touches.current.size === 2) {
      const other = [...touches.current.entries()].find(([id]) => id !== e.pointerId)![1];
      const was = Math.hypot(before.x - other.x, before.y - other.y) || 1;
      const now = Math.hypot(e.clientX - other.x, e.clientY - other.y) || 1;
      state.view.fit = false;
      state.view.x += (e.clientX - before.x) / 2;
      state.view.y += (e.clientY - before.y) / 2;
      zoomAt((e.clientX + other.x) / 2, (e.clientY + other.y) / 2, now / was);
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      return;
    }
    const d = drag.current;
    if (!d) {
      // แค่ชี้: เน้นจุดและสิ่งที่เชื่อมกัน
      const over = e.pointerType === "mouse" ? hit(e.clientX, e.clientY) : -1;
      if (over !== state.hover) {
        state.hover = over;
        canvas.current!.style.cursor = over >= 0 ? "pointer" : "";
        state.kick();
      }
      return;
    }
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) <= 4) return;
    d.moved = true;
    d.x = e.clientX;
    d.y = e.clientY;
    const { yaw, pitch } = state.view;
    if (d.body >= 0) {
      // ย้ายจุดในระนาบของจอ (ความลึกเท่าเดิม): แปลงระยะบนจอกลับเป็นพิกัด 3 มิติ
      const b = state.bodies[d.body];
      state.view.fit = false;
      const unit = (state.focal / (state.focal + b.depth)) * state.view.k;
      const a = dx / unit;
      const up = dy / unit;
      const z1 = -up * Math.sin(pitch);
      b.x += a * Math.cos(yaw) - z1 * Math.sin(yaw);
      b.y += up * Math.cos(pitch);
      b.z += a * Math.sin(yaw) + z1 * Math.cos(yaw);
      state.alpha = Math.max(state.alpha, 0.35);
    } else if (d.pan) {
      state.view.fit = false;
      state.view.x += dx;
      state.view.y += dy;
    } else {
      // หมุนรอบได้ไม่จำกัด · ก้ม/เงยได้ถึงมองจากบนและล่างตรง ๆ
      state.view.yaw += dx * 0.006;
      state.view.pitch = clamp(pitch - dy * 0.006, -Math.PI / 2, Math.PI / 2);
    }
    state.kick();
  };
  const onUp = (e: React.PointerEvent) => {
    touches.current.delete(e.pointerId);
    const d = drag.current;
    drag.current = null;
    if (!d || d.body < 0) return;
    sim.current.bodies[d.body].fixed = false;
    if (!d.moved && e.type === "pointerup") router.push(dots[d.body].href);
  };
  const onLeave = () => {
    if (drag.current || sim.current.hover < 0) return;
    sim.current.hover = -1;
    sim.current.kick();
  };
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // ถ่างนิ้วบนแทร็กแพด (มากับ ctrlKey) = ซูมละเอียด · ปัดซ้ายขวา = เลื่อน · หมุนล้อ = ซูม
      if (e.ctrlKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
      else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        sim.current.view.fit = false;
        sim.current.view.x -= e.deltaX;
        sim.current.kick();
      } else zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 0.89);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  const resetView = () => {
    sim.current.view = { yaw: 0.5, pitch: -0.3, k: 1, x: 0, y: 0, fit: true };
    sim.current.kick();
  };

  const slider = (label: string, key: keyof Settings, low: string, high: string) => (
    <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <span className="flex items-center gap-2 font-normal">
        <span>{low}</span>
        <input type="range" min={0} max={100} step={5} value={settings[key]} onChange={(e) => change({ ...settings, [key]: Number(e.target.value) })} className="h-11 min-w-0 flex-1 accent-indigo-600 sm:h-6" />
        <span>{high}</span>
      </span>
    </label>
  );

  const shown = progress && progress.of === dots ? progress.shown : dots.length;
  const playing = Boolean(progress && progress.of === dots && progress.playing);
  const tab = (active: boolean) => `inline-flex min-h-8 items-center rounded-full px-3.5 text-xs transition ${active ? "bg-surface font-semibold text-primary shadow-soft" : "text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2 px-2 pt-1">
        {groupIndex.size > 1 && slider(tr("ระยะห่างระหว่างกลุ่ม"), "gap", tr("ชิด"), tr("ห่าง"))}
        {slider(tr("ความกระจุกของจุด"), "tight", tr("กระจาย"), tr("กระจุก"))}
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          {tr("ลากเพื่อ")}
          <span className="inline-flex rounded-full bg-surface-sunken p-0.5">
            <button type="button" aria-pressed={mode === "rotate"} onClick={() => setMode("rotate")} className={tab(mode === "rotate")}>{tr("หมุน")}</button>
            <button type="button" aria-pressed={mode === "pan"} onClick={() => setMode("pan")} className={tab(mode === "pan")}>{tr("เลื่อน")}</button>
          </span>
        </div>
        <button type="button" onClick={resetView} className="btn-ghost min-h-9 px-3 py-1.5 text-xs">{tr("รีเซ็ตมุมมอง")}</button>
      </div>
      {dots.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-2">
          <button type="button" onClick={() => (playing ? sim.current.pause() : sim.current.play())} aria-label={playing ? tr("หยุด") : tr("เล่นการเติบโตของแผนผัง")} className="btn-ghost min-h-9 gap-1.5 px-3 py-1.5 text-xs">
            <svg viewBox="0 0 16 16" className="size-3.5 fill-current" aria-hidden="true">{playing ? <path d="M3 2h4v12H3zM9 2h4v12H9z" /> : <path d="M4 2l10 6-10 6z" />}</svg>
            {playing ? tr("หยุด") : tr("เล่น")}
          </button>
          <label className="flex min-w-48 flex-1 items-center gap-2 text-xs text-muted-foreground">
            <span className="sr-only">{tr("ลำดับการสร้าง")}</span>
            <input type="range" min={0} max={dots.length} step={1} value={shown} onChange={(e) => sim.current.seek(Number(e.target.value))} className="h-11 min-w-0 flex-1 accent-indigo-600 sm:h-6" />
            <span className="w-14 text-right tabular-nums">{shown}/{dots.length}</span>
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            {tr("ความเร็ว")}
            <input
              type="range"
              min={0}
              max={SPEEDS.length - 1}
              step={1}
              value={speed}
              onChange={(e) => {
                const next = Number(e.target.value);
                setSpeed(next);
                sim.current.speed = SPEEDS[next];
              }}
              className="h-11 w-24 accent-indigo-600 sm:h-6"
            />
            <span className="w-8 font-normal tabular-nums">{SPEEDS[speed]}×</span>
          </label>
        </div>
      )}
      <canvas
        ref={canvas}
        role="img"
        aria-label={tr("แผนผังความสัมพันธ์ของโน้ต")}
        className="block h-[min(70vh,40rem)] w-full cursor-grab touch-none select-none rounded-xl bg-surface-sunken/50 active:cursor-grabbing"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={onLeave}
        onContextMenu={(e) => e.preventDefault()}
      />
      {groups.length > 0 && (
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 px-2 text-xs text-muted-foreground">
          {groups.map((g) => (
            <li key={g.id} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: g.slot === null ? "var(--subtle)" : PALETTE[g.slot] }} />
              {g.label} <span className="text-subtle">{g.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
