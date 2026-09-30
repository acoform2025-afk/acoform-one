/**
 * Where the panels of each wall face sit on the plan: the face line (offset to its side of the wall),
 * the joint positions between panels and the filler piece at the end. All in plan px.
 */
import type { Pt } from "./calc";
import type { FaceLayout } from "@/lib/design-engine/floor-panels";

export type FaceMarks = { code: string; a: Pt; b: Pt; n: Pt; joints: Pt[]; fillerFrom: Pt | null; mid: Pt; text: string; ok: boolean };

/** "3×600 + 450 + F137" */
export function panelString(f: FaceLayout): string {
  const parts: string[] = [];
  for (let i = 0; i < f.panels.length;) {
    let j = i; while (j < f.panels.length && f.panels[j] === f.panels[i]) j++;
    parts.push(j - i > 1 ? `${j - i}×${f.panels[i]}` : `${f.panels[i]}`); i = j;
  }
  if (f.filler) parts.push(`F${f.filler}`);
  return parts.join(" + ") || "—";
}

export function faceMarks(faces: FaceLayout[]): FaceMarks[] {
  const out: FaceMarks[] = [];
  for (const f of faces) {
    if (!f.geo) continue;
    const { a: A, b: B, off } = f.geo;
    const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy);
    if (!L) continue;
    const u: Pt = [dx / L, dy / L], n: Pt = [-u[1], u[0]];
    const a: Pt = [A[0] + n[0] * off, A[1] + n[1] * off], b: Pt = [B[0] + n[0] * off, B[1] + n[1] * off];
    const at = (mm: number): Pt => { const k = Math.min(1, mm / Math.max(1, f.length)); return [a[0] + dx * k, a[1] + dy * k]; };
    const joints: Pt[] = []; let run = 0;
    for (const w of f.panels) { run += w; joints.push(at(run)); }
    const side: Pt = off < 0 ? [-n[0], -n[1]] : n;
    out.push({
      code: f.code, a, b, n: side, joints: joints.slice(0, f.filler ? joints.length : Math.max(0, joints.length - 1)),
      fillerFrom: f.filler ? at(run) : null, mid: at(f.length / 2), text: panelString(f), ok: true,
    });
  }
  return out;
}
