/**
 * Tables pasted into AutoCAD from Excel (OLE2FRAME): concrete grades, beam / column schedules, slab thickness notes,
 * area statements. AutoCAD keeps the whole Excel workbook inside the drawing; the DXF carries it as binary chunks.
 * This reads the workbook (an OLE compound file holding the .xlsx package, or an old .xls) and returns its cells, so
 * the table can be shown on the drawing and read like any other text.
 */
import { unzipSync, strFromU8 } from "fflate";

/** Minimal OLE compound-file reader: every stream by name. */
function cfbStreams(buf: Uint8Array): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.length < 512 || dv.getUint32(0, true) !== 0xe011cfd0) return out;
  const secSize = 1 << dv.getUint16(30, true), miniSize = 1 << dv.getUint16(32, true);
  const nFat = dv.getUint32(44, true), dirStart = dv.getUint32(48, true), miniCut = dv.getUint32(56, true);
  const miniFatStart = dv.getUint32(60, true), difStart = dv.getUint32(68, true);
  const sec = (i: number) => 512 + i * secSize;
  // FAT sector list: 109 in the header, the rest in DIFAT sectors
  const fatSecs: number[] = [];
  for (let i = 0; i < 109 && fatSecs.length < nFat; i++) fatSecs.push(dv.getUint32(76 + i * 4, true));
  for (let d = difStart, guard = 0; d < 0xfffffffa && fatSecs.length < nFat && guard < 1000; guard++) {
    const per = secSize / 4 - 1;
    for (let i = 0; i < per && fatSecs.length < nFat; i++) fatSecs.push(dv.getUint32(sec(d) + i * 4, true));
    d = dv.getUint32(sec(d) + per * 4, true);
  }
  const fat: number[] = [];
  for (const s of fatSecs) { if (sec(s) + secSize > buf.length) break; for (let i = 0; i < secSize / 4; i++) fat.push(dv.getUint32(sec(s) + i * 4, true)); }
  const chain = (start: number, table: number[]) => { const c: number[] = []; for (let s = start, g = 0; s < 0xfffffffa && g < 200000 && s < table.length; g++) { c.push(s); s = table[s]; } return c; };
  const read = (start: number, size: number) => {
    const c = chain(start, fat), o = new Uint8Array(c.length * secSize);
    c.forEach((s, i) => { const p = sec(s); if (p + secSize <= buf.length) o.set(buf.subarray(p, p + secSize), i * secSize); });
    return o.subarray(0, Math.min(size, o.length));
  };
  const dir = read(dirStart, 1 << 30);
  const ents: { name: string; type: number; start: number; size: number }[] = [];
  for (let p = 0; p + 128 <= dir.length; p += 128) {
    const nl = dir[p + 64] | (dir[p + 65] << 8); const type = dir[p + 66];
    let name = ""; for (let i = 0; i < nl - 2 && i < 64; i += 2) { const c = dir[p + i] | (dir[p + i + 1] << 8); if (c) name += String.fromCharCode(c); }
    const dd = new DataView(dir.buffer, dir.byteOffset + p, 128);
    ents.push({ name, type, start: dd.getUint32(116, true), size: dd.getUint32(120, true) });
  }
  const root = ents.find((e) => e.type === 5); if (!root) return out;
  const ministream = read(root.start, root.size);
  const minifat = miniFatStart < 0xfffffffa ? (() => { const b = read(miniFatStart, 1 << 30); const v = new DataView(b.buffer, b.byteOffset, b.byteLength); const a: number[] = []; for (let i = 0; i + 4 <= b.length; i += 4) a.push(v.getUint32(i, true)); return a; })() : [];
  for (const e of ents) {
    if (e.type !== 2) continue;
    if (e.size < miniCut) {
      const c = chain(e.start, minifat), o = new Uint8Array(c.length * miniSize);
      c.forEach((s, i) => o.set(ministream.subarray(s * miniSize, s * miniSize + miniSize), i * miniSize));
      out.set(e.name, o.subarray(0, e.size));
    } else out.set(e.name, read(e.start, e.size));
  }
  return out;
}

const xmlText = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const colNo = (ref: string) => { let n = 0; for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

export type OleTable = { rows: string[][]; colW: number[] };

/** The first sheet of an .xlsx package that has cells: rows of cell texts, and the column widths (Excel units). */
function xlsxTable(zip: Uint8Array): OleTable | null {
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(zip); } catch { return null; }
  const shared: string[] = [];
  const ss = files["xl/sharedStrings.xml"];
  if (ss) for (const si of strFromU8(ss).matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(xmlText([...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join("")));
  const sheets = Object.keys(files).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  for (const sh of sheets) {
    const x = strFromU8(files[sh]);
    const grid = new Map<number, Map<number, string>>();
    for (const c of x.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = c[1].match(/\br="([A-Z]+\d+)"/)?.[1]; if (!ref || !c[2]) continue;
      const t = c[1].match(/\bt="(\w+)"/)?.[1];
      const v = c[2].match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const is = c[2].match(/<is>([\s\S]*?)<\/is>/)?.[1];
      let val = t === "s" && v != null ? shared[Number(v)] ?? "" : t === "inlineStr" && is ? xmlText([...is.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join("")) : v != null ? xmlText(v) : "";
      if (/^-?\d+\.\d{6,}$/.test(val)) val = String(Math.round(Number(val) * 1000) / 1000);
      val = val.replace(/\s+/g, " ").trim(); if (!val) continue;
      const r = Number(ref.match(/\d+$/)![0]) - 1;
      (grid.get(r) ?? grid.set(r, new Map()).get(r)!).set(colNo(ref), val);
    }
    if (!grid.size) continue;
    const rIdx = [...grid.keys()].sort((a, b) => a - b), r0 = rIdx[0], r1 = rIdx[rIdx.length - 1];
    const cAll = [...grid.values()].flatMap((m) => [...m.keys()]), c0 = Math.min(...cAll), c1 = Math.max(...cAll);
    const widths = new Map<number, number>();
    for (const m of x.matchAll(/<col\b[^>]*\bmin="(\d+)"[^>]*\bmax="(\d+)"[^>]*\bwidth="([\d.]+)"/g)) for (let i = Number(m[1]) - 1; i <= Number(m[2]) - 1; i++) widths.set(i, Number(m[3]));
    const rows: string[][] = [];
    for (let r = r0; r <= r1; r++) { const row: string[] = []; for (let c = c0; c <= c1; c++) row.push(grid.get(r)?.get(c) ?? ""); rows.push(row); }
    const colW: number[] = []; for (let c = c0; c <= c1; c++) colW.push(widths.get(c) ?? 8.43);
    return { rows, colW };
  }
  return null;
}

/** An OLE2FRAME's binary data → its table, when it is an Excel workbook (else null: a picture, a Word page …). */
export function oleTable(data: Uint8Array): OleTable | null {
  // AutoCAD puts a small header before the compound file
  let at = -1;
  for (let i = 0; i + 8 <= Math.min(data.length, 4096); i++) if (data[i] === 0xd0 && data[i + 1] === 0xcf && data[i + 2] === 0x11 && data[i + 3] === 0xe0 && data[i + 4] === 0xa1 && data[i + 5] === 0xb1) { at = i; break; }
  if (at < 0) return null;
  let streams: Map<string, Uint8Array>;
  try { streams = cfbStreams(data.subarray(at)); } catch { return null; }
  // Excel 2007+: the .xlsx package as one stream ("Package"); some writers embed the zip under another name
  for (const [, s] of streams) if (s.length > 4 && s[0] === 0x50 && s[1] === 0x4b) { const t = xlsxTable(s); if (t) return t; }
  return null;
}

/** Hex chunks (DXF group 310) → bytes. */
export function hexBytes(chunks: string[]): Uint8Array {
  const hex = chunks.join("").replace(/[^0-9a-fA-F]/g, "");
  const out = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
