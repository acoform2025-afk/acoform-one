/**
 * Checks of the parts the wall / deck check does not see: wall corners (internal / external), beam soffit and side
 * panels, deck props and beam props. They run on the finished 3D scene, so they see exactly what is drawn.
 */
import { inRings, type Issue } from "@/lib/design-engine/design-check";
import type { Scene3 } from "./scene3d";
import { minOf, maxOf } from "@/lib/util/minmax";

type Pt = [number, number];

export type PartsOpts = { propSpacing: number; rowPitch: number; slabMm: number; propKn: number; bulkheads?: number; ribHeights?: number[] };

/** Load a deck prop carries (kN): slab weight 25 kN/m³ + 1.5 construction + 0.5 formwork, over the area one prop holds. A screening estimate, not a design. */
export const deckPropLoad = (slabMm: number, spacingM: number, rowPitchM: number) => (25 * (slabMm / 1000) + 2) * spacingM * rowPitchM;
/** Load a beam prop carries (kN): the whole beam section (25 kN/m³) + 2 kN/m² on its width, over the prop spacing. */
export const beamPropLoad = (widthM: number, depthM: number, spacingM: number) => (25 * widthM * depthM + 2 * widthM) * spacingM;

const union = (iv: [number, number][]) => { const s = iv.filter((x) => x[1] > x[0]).sort((a, b) => a[0] - b[0]); let tot = 0, end = -Infinity; for (const [a, b] of s) { if (b <= end) continue; tot += b - Math.max(a, end); end = b; } return tot; };

export function partsChecks(sc: Scene3, o: PartsOpts): Omit<Issue, "id">[] {
  const out: Omit<Issue, "id">[] = [];
  const Hm = sc.H;

  // ── wall corners: the layout has corner pieces for right-angle corners (60° … 120°); any other angle has no standard corner
  let angled = 0;
  for (const poly of sc.walls) for (const ring of poly) {
    const r: Pt[] = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
    for (let i = 0; i < r.length && angled < 40; i++) {
      const a = r[(i + r.length - 1) % r.length], v = r[i], c = r[(i + 1) % r.length];
      const u: Pt = [a[0] - v[0], a[1] - v[1]], w: Pt = [c[0] - v[0], c[1] - v[1]];
      const lu = Math.hypot(...u), lw = Math.hypot(...w); if (lu < 0.15 || lw < 0.15) continue;
      const ang = (Math.acos(Math.max(-1, Math.min(1, (u[0] * w[0] + u[1] * w[1]) / (lu * lw)))) * 180) / Math.PI;
      if ((ang >= 60 && ang <= 120) || ang >= 165) continue;
      angled++;
      out.push({ sev: "warn", kind: "corner", where: "Wall corner", detail: `Wall corner of ${Math.round(ang)}° — the standard internal / external corner pieces are for right angles; this one needs an angled corner made to drawing.`, at: [Math.round(v[0] * 1000) / 1000, Math.round(v[1] * 1000) / 1000], z: Hm / 2 });
    }
  }

  // ── beam soffit and side panels: the run of panels must cover the whole beam (a part-run leaves a slot for the concrete)
  for (const [bi, b] of sc.beams.entries()) {
    const dx = b.b[0] - b.a[0], dy = b.b[1] - b.a[1], L = Math.hypot(dx, dy); if (L < 0.3) continue;
    const ux = dx / L, uy = dy / L;
    const proj = (x: number, z: number): [number, number] => [(x - b.a[0]) * ux + (z - b.a[1]) * uy, -(x - b.a[0]) * uy + (z - b.a[1]) * ux];
    const bottom: [number, number][] = [], sideL: [number, number][] = [], sideR: [number, number][] = [];
    for (const p of sc.panels) {
      if (p.k !== "bside" && p.k !== "bbot") continue;
      const q = p.p.map((v) => proj(v[0], v[2]));
      const t0 = minOf(q.map((v) => v[0])), t1 = maxOf(q.map((v) => v[0])), s0 = minOf(q.map((v) => v[1])), s1 = maxOf(q.map((v) => v[1]));
      if (t1 < -0.05 || t0 > L + 0.05) continue;
      const half = b.w / 2;
      if (p.k === "bbot" && s0 >= -half - 0.06 && s1 <= half + 0.06) bottom.push([Math.max(0, t0), Math.min(L, t1)]);
      else if (p.k === "bside" && Math.abs(s1 - s0) < 0.12) { const m = (s0 + s1) / 2; if (Math.abs(m - half) < 0.12) sideR.push([Math.max(0, t0), Math.min(L, t1)]); else if (Math.abs(m + half) < 0.12) sideL.push([Math.max(0, t0), Math.min(L, t1)]); }
    }
    const mid: Pt = [(b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2];
    for (const [name, iv] of [["soffit (bottom) panels", bottom], ["side panels (one side)", sideL], ["side panels (other side)", sideR]] as const) {
      if (!iv.length) continue;
      const cov = union(iv as [number, number][]);
      if (L - cov > 0.1) out.push({ sev: "warn", kind: "beam-parts", where: `Beam ${bi + 1}`, detail: `Beam ${name} cover ${Math.round(cov * 1000)} mm of the ${Math.round(L * 1000)} mm beam — ${Math.round((L - cov) * 1000)} mm is open, concrete will run out. Add a made-to-size panel.`, at: [Math.round(mid[0] * 1000) / 1000, Math.round(mid[1] * 1000) / 1000], z: Hm - b.d / 2 });
    }
  }

  // ── beam ends: a beam end that meets neither a wall nor another beam is open — the soffit bulkhead (SB) closes it
  {
    const hasBot = new Set<number>();
    for (const p of sc.panels) if (p.k === "bbot") for (const [bi, b] of sc.beams.entries()) {
      const dx = b.b[0] - b.a[0], dy = b.b[1] - b.a[1], L = Math.hypot(dx, dy); if (L < 0.3) continue;
      const cx = p.p.reduce((a, v) => a + v[0], 0) / p.p.length, cz = p.p.reduce((a, v) => a + v[2], 0) / p.p.length;
      const t = ((cx - b.a[0]) * dx + (cz - b.a[1]) * dy) / L, sd = Math.abs(-(cx - b.a[0]) * dy / L + (cz - b.a[1]) * dx / L);
      if (t > -0.05 && t < L + 0.05 && sd < b.w / 2 + 0.06) hasBot.add(bi);
    }
    const inWall = (q: Pt) => sc.walls.some((poly) => inRings(q, poly));
    const inBeam = (q: Pt, skip: number) => sc.beams.some((o2, k) => {
      if (k === skip) return false;
      const dx = o2.b[0] - o2.a[0], dy = o2.b[1] - o2.a[1], L = Math.hypot(dx, dy); if (L < 0.3) return false;
      const t = ((q[0] - o2.a[0]) * dx + (q[1] - o2.a[1]) * dy) / L, sd = Math.abs(-(q[0] - o2.a[0]) * dy / L + (q[1] - o2.a[1]) * dx / L);
      return t > -0.05 && t < L + 0.05 && sd < o2.w / 2 + 0.05;
    });
    for (const [bi, b] of sc.beams.entries()) {
      if (!hasBot.has(bi)) continue;
      const dx = b.b[0] - b.a[0], dy = b.b[1] - b.a[1], L = Math.hypot(dx, dy); if (L < 0.3) continue;
      const ux = dx / L, uy = dy / L;
      const open: Pt[] = [];
      for (const [e, sgn] of [[b.a, -1], [b.b, 1]] as const) {
        const q: Pt = [e[0] + ux * sgn * 0.12, e[1] + uy * sgn * 0.12];
        if (!inWall(q) && !inBeam(q, bi)) open.push([Math.round(e[0] * 1000) / 1000, Math.round(e[1] * 1000) / 1000]);
      }
      if (open.length && open.length > (o.bulkheads ?? 0)) out.push({ sev: "warn", kind: "beam-parts", where: `Beam ${bi + 1}`, detail: `${open.length} open beam end${open.length > 1 ? "s" : ""} (not against a wall or another beam) and ${o.bulkheads ?? 0} soffit bulkhead${(o.bulkheads ?? 0) === 1 ? "" : "s"} (SB) in the rules — concrete will run out of the end. Set “Soffit bulkheads (SB) per beam” in Settings, or close the end with a made-to-size plate.`, at: open[0], z: Hm - b.d / 2 });
    }
  }

  // ── wall back-ribs: every wall face should carry a rib at each row height of the rules that is below the wall top;
  //    a row that is missing or covers under 80 % of the face is flagged (the video's "back-rib missing" check)
  const ribList = sc.acc?.ribs ?? [];
  if (ribList.length && o.ribHeights?.length) {
    const byFace = new Map<string, typeof sc.panels>();
    for (const p of sc.panels) if ((p.k === "std" || p.k === "top") && p.z && p.n) { const l = byFace.get(p.z); if (l) l.push(p); else byFace.set(p.z, [p]); }
    let flagged = 0;
    for (const [face, ps] of byFace) {
      if (flagged >= 30) break;
      const a0 = ps[0].p[0], a1 = ps[0].p[1], n = ps[0].n!;
      const dx = a1[0] - a0[0], dz = a1[2] - a0[2], dl = Math.hypot(dx, dz); if (dl < 1e-6) continue;
      const ux = dx / dl, uz = dz / dl;
      const T = ps.flatMap((p) => p.p.map((v) => (v[0] - a0[0]) * ux + (v[2] - a0[2]) * uz));
      const t0 = minOf(T), t1 = maxOf(T), L = t1 - t0; if (L < 0.4) continue;
      const top = maxOf(ps.flatMap((p) => p.p.map((v) => v[1])));
      const sOf = (x: number, z: number) => (x - a0[0]) * n[0] + (z - a0[2]) * n[2];
      const tOf = (x: number, z: number) => (x - a0[0]) * ux + (z - a0[2]) * uz;
      const rows = o.ribHeights.map((h) => h / 1000).filter((h) => h < top - 0.05);
      const missing: string[] = [];
      for (const h of rows) {
        const iv: [number, number][] = [];
        for (const r of ribList) {
          if (Math.abs(r[1] - h) > 0.04) continue;
          const s0 = sOf(r[0], r[2]), s1 = sOf(r[3], r[4]);
          if (s0 < -0.02 || s0 > 0.4 || s1 < -0.02 || s1 > 0.4 || Math.abs(s0 - s1) > 0.06) continue;
          const ta = tOf(r[0], r[2]), tb = tOf(r[3], r[4]);
          iv.push([Math.max(t0, Math.min(ta, tb)), Math.min(t1, Math.max(ta, tb))]);
        }
        if (union(iv) < 0.8 * L) missing.push(`${Math.round(h * 1000)}`);
      }
      const hi = rows.length ? maxOf(rows) : 0;
      const topGap = rows.length && top - hi > 0.6 ? `the top ${Math.round((top - hi) * 1000)} mm of the face has no rib` : "";
      if (missing.length || topGap) {
        flagged++;
        const mx = (a0[0] + ux * (t0 + t1) / 2), mz = (a0[2] + uz * (t0 + t1) / 2);
        out.push({ sev: "warn", kind: "back-rib", where: `Wall face ${face}`, detail: `${missing.length ? `Back-rib row${missing.length > 1 ? "s" : ""} at ${missing.join(", ")} mm missing or covering under 80 % of the ${Math.round(L * 1000)} mm face` : ""}${missing.length && topGap ? "; " : ""}${topGap}. Check the back-rib heights in Settings (Detailed rules) or add a rib by hand.`, at: [Math.round(mx * 1000) / 1000, Math.round(mz * 1000) / 1000], z: missing.length ? Number(missing[0]) / 1000 : Math.max(0, top - 0.1) });
      }
    }
  }

  // ── props: load on a deck prop and on a beam prop against the capacity of the prop
  const kn = o.propKn;
  if (kn > 0) {
    const dl = deckPropLoad(o.slabMm, o.propSpacing, o.rowPitch);
    if (dl > kn && sc.acc?.props.some((p) => p[4] === 0)) {
      const p = sc.acc!.props.find((q) => q[4] === 0)!;
      out.push({ sev: "warn", kind: "props", where: "Deck props", detail: `A deck prop carries about ${dl.toFixed(1)} kN (${o.slabMm} mm slab, props ${Math.round(o.propSpacing * 1000)} mm apart, keels ${Math.round(o.rowPitch * 1000)} mm apart) against ${kn} kN capacity — close the prop or keel spacing. Screening estimate only; your engineer confirms.`, at: [p[0], p[1]], z: Hm });
    }
    for (const [bi, b] of sc.beams.entries()) {
      const bl = beamPropLoad(b.w, b.d, o.propSpacing);
      if (bl > kn) out.push({ sev: "warn", kind: "props", where: `Beam ${bi + 1}`, detail: `A prop under this ${Math.round(b.w * 1000)} × ${Math.round(b.d * 1000)} mm beam carries about ${bl.toFixed(1)} kN at ${Math.round(o.propSpacing * 1000)} mm spacing against ${kn} kN capacity — add props or close the spacing. Screening estimate only.`, at: [Math.round(((b.a[0] + b.b[0]) / 2) * 1000) / 1000, Math.round(((b.a[1] + b.b[1]) / 2) * 1000) / 1000], z: Hm - b.d / 2 });
    }
  }
  return out;
}
