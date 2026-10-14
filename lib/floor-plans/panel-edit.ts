/**
 * Manual panel layout for a wall face: the panels typed or picked by hand replace the automatic ones.
 * Written the way the layout shows them: "3×600 + 450 + 300" (× or x), a filler "F137" is left to the program.
 */
export function parsePanelString(raw: string): number[] | null {
  const out: number[] = [];
  const parts = String(raw ?? "").toLowerCase().replace(/×/g, "x").split(/[+,;&]|\band\b/).map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    if (/^f\s*\d+/.test(p)) continue;                                // filler: worked out from what is left
    const m = p.match(/^(?:(\d{1,3})\s*x\s*)?(\d{2,4})$/);
    if (!m) return null;
    const n = m[1] ? +m[1] : 1, w = +m[2];
    if (w < 50 || w > 1200 || n < 1 || n > 60) return null;
    for (let i = 0; i < n; i++) out.push(w);
  }
  return out.length ? out : null;
}

export function panelText(panels: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < panels.length;) { let j = i; while (j < panels.length && panels[j] === panels[i]) j++; parts.push(j - i > 1 ? `${j - i}×${panels[i]}` : `${panels[i]}`); i = j; }
  return parts.join(" + ");
}

/** What a hand layout leaves on a face: the sum, the filler (rounded to 5 mm, taken up in the joints when under the tolerance) or the overrun. */
export function faceBalance(length: number, panels: number[], tol = 25) {
  const sum = panels.reduce((a, b) => a + b, 0), left = length - sum;
  if (left < -tol) return { sum, filler: 0, over: Math.round(-left), status: "over" as const };
  const filler = left < tol ? 0 : Math.round(left / 5) * 5;
  return { sum, filler, over: 0, status: filler === 0 ? ("exact" as const) : filler < 100 ? ("narrow" as const) : ("filler" as const) };
}
