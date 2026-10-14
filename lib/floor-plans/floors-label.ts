/**
 * "Floors covered" label as written on a drawing: "4 to 7", "4TH-7TH FLOOR", "2, 6, 10 & 14", "1-3 and 9", "typical 5-12".
 * Returns the floor numbers and how many floors that is (the standard floor is formed once per floor).
 */
export function parseFloorsLabel(raw: string): { floors: number[]; count: number; text: string } | null {
  const s = String(raw ?? "").toLowerCase().replace(/(\d+)\s*(st|nd|rd|th)\b/g, "$1").replace(/\bfloors?\b|\btypical\b|\bplan\b/g, " ");
  const set = new Set<number>();
  // ranges first: 4 to 7, 4-7, 4 – 7, 4 upto 7
  const rest = s.replace(/(\d{1,3})\s*(?:to|upto|up to|through|-|–|—)\s*(\d{1,3})/g, (_m, a, b) => {
    const x = +a, y = +b;
    if (y >= x && y - x < 200) for (let i = x; i <= y; i++) set.add(i);
    return " ";
  });
  for (const m of rest.matchAll(/\d{1,3}/g)) { const n = +m[0]; if (n >= 0 && n < 200) set.add(n); }
  if (!set.size) return null;
  const floors = [...set].sort((a, b) => a - b);
  const runs: string[] = [];
  for (let i = 0; i < floors.length;) {
    let j = i; while (j + 1 < floors.length && floors[j + 1] === floors[j] + 1) j++;
    runs.push(j - i >= 2 ? `${floors[i]}–${floors[j]}` : floors.slice(i, j + 1).join(", "));
    i = j + 1;
  }
  return { floors, count: floors.length, text: runs.join(", ") };
}
