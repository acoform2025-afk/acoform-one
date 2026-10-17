/** Smallest / largest of a list without spreading it into a call: Math.min(...xs) overflows the call stack on
 *  very large lists (every point of a whole-building drawing). Empty list → Infinity / -Infinity like Math.min/max. */
export function minOf(xs: ArrayLike<number> | Iterable<number>): number {
  let m = Infinity;
  for (const v of xs as Iterable<number>) if (v < m) m = v;
  return m;
}
export function maxOf(xs: ArrayLike<number> | Iterable<number>): number {
  let m = -Infinity;
  for (const v of xs as Iterable<number>) if (v > m) m = v;
  return m;
}
