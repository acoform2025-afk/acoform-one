/** Cut deck zones into n pours of about equal area.
 *  Zones are taken in a sweep along the long side of the floor (so neighbours pour together) and split into n
 *  consecutive groups so that the areas are as even as possible. Every phase gets at least one zone. */
export type PhZone = { code: string; area: number; box: number[] };

export function assignPhases(zones: PhZone[], nWanted: number): { phaseOf: Record<string, number>; n: number; areas: number[] } {
  const n = Math.max(1, Math.min(Math.round(nWanted) || 1, zones.length));
  const phaseOf: Record<string, number> = {};
  if (!zones.length) return { phaseOf, n: 1, areas: [] };
  const x0 = Math.min(...zones.map((z) => z.box[0])), x1 = Math.max(...zones.map((z) => z.box[2]));
  const y0 = Math.min(...zones.map((z) => z.box[1])), y1 = Math.max(...zones.map((z) => z.box[3]));
  const ax = x1 - x0 >= y1 - y0 ? 0 : 1;
  const order = [...zones].sort((p, q) => (p.box[ax] + p.box[ax + 2]) - (q.box[ax] + q.box[ax + 2]));
  const m = order.length, pre = [0];
  for (const z of order) pre.push(pre[pre.length - 1] + z.area);
  const target = pre[m] / n;
  const cost = (a: number, b: number) => (pre[b] - pre[a] - target) ** 2;
  const INF = Infinity;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(INF));
  const cut: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  dp[0][0] = 0;
  for (let k = 1; k <= n; k++) for (let i = k; i <= m; i++) for (let j = k - 1; j < i; j++) {
    const v = dp[k - 1][j] + cost(j, i);
    if (v < dp[k][i]) { dp[k][i] = v; cut[k][i] = j; }
  }
  const areas: number[] = new Array(n).fill(0);
  let i = m;
  for (let k = n; k >= 1; k--) {
    const j = cut[k][i];
    for (let t = j; t < i; t++) { phaseOf[order[t].code] = k; areas[k - 1] += order[t].area; }
    i = j;
  }
  return { phaseOf, n, areas };
}

/** Soft colours for the phases (panel fill on the key plan). */
export const PHASE_COLOURS = ["#dbeafe", "#fde68a", "#d1fae5", "#fbcfe8", "#ddd6fe", "#fed7aa"];
