/**
 * Stair builder: from the stairwell size and the floor height, work out the flights (risers, riser height, tread,
 * landing) of a straight, dog-leg or scissor stair and give them as a row of the stair table. Lengths in mm.
 */
import type { StairRow } from "./calc";

export type StairType = "straight" | "dogleg" | "scissor";
export type StairDesign = { row: StairRow; risersTotal: number; fits: boolean; notes: string[]; runMm: number; landingDepthMm: number };

export function designStair(o: { type: StairType; floorHeightMm: number; wellLenMm: number; wellWidMm: number; riserMax?: number; treadMin?: number; treadMax?: number; gapMm?: number; waistMm?: number; label?: string }): StairDesign {
  const Rmax = o.riserMax ?? 175, Tmin = o.treadMin ?? 250, Tmax = o.treadMax ?? 300, gap = o.gapMm ?? 100;
  const H = Math.max(1000, o.floorHeightMm), L = Math.max(1000, o.wellLenMm), W = Math.max(800, o.wellWidMm);
  const notes: string[] = [];
  const two = o.type !== "straight";
  let n = Math.ceil(H / Rmax);
  if (two && n % 2) n += 1;                                  // equal flights
  const per = two ? n / 2 : n;
  const riser = H / n;
  const flightW = o.type === "dogleg" ? Math.floor((W - gap) / 2) : o.type === "scissor" ? Math.floor((W - gap) / 2) : W;
  // length available for the treads: dog-leg gives one landing depth (= flight width) at the turn; others use the whole length
  const landingDepth = o.type === "dogleg" ? flightW : 0;
  const avail = L - landingDepth;
  const treadsPer = Math.max(1, per - 1);
  let tread = Math.floor(avail / treadsPer / 5) * 5;
  let fits = true;
  if (tread < Tmin) { fits = false; notes.push(`Does not fit: the well gives ${tread} mm per tread (needs ${Tmin} or more). Make the well longer by ${Math.ceil((Tmin - tread) * treadsPer / 10) * 10} mm or add a flight.`); tread = Tmin; }
  if (tread > Tmax) tread = Tmax;
  if (riser < 140 || riser > 190) notes.push(`Riser ${Math.round(riser)} mm is outside 140–190 mm.`);
  const comfort = 2 * riser + tread;
  if (comfort < 550 || comfort > 700) notes.push(`2 × riser + tread = ${Math.round(comfort)} mm (comfortable stairs are 550–700 mm).`);
  if (flightW < 900) notes.push(`Flight width ${flightW} mm is below 900 mm.`);
  const run = treadsPer * tread;
  const landing = o.type === "dogleg" ? (W * landingDepth) / 1e6 : 0;
  const row: StairRow = {
    label: o.label ?? "ST", flights: two ? 2 : 1, width_mm: flightW, risers: per, riser_mm: Math.round(riser), tread_mm: tread, waist_mm: o.waistMm ?? 150,
    open_sides: o.type === "dogleg" ? 1 : o.type === "straight" ? 0 : 0, landing_m2: Math.round((two ? landing / 2 : 0) * 100) / 100,
  };
  return { row, risersTotal: n, fits, notes, runMm: run, landingDepthMm: landingDepth };
}
