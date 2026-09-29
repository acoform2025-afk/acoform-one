import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * AutoCAD .dwg → .dxf using GNU LibreDWG's `dwg2dxf` (open source, GPL-3). It runs as a separate program
 * on the server (installed in the Docker image), so the app itself does not link to it.
 * Output keeps the drawing's own DXF version — forcing an older version drops entities from newer DWGs.
 */
export async function dwgToDxf(dwg: Uint8Array, timeoutMs = 90_000): Promise<string> {
  const bin = process.env.DWG2DXF_BIN || "dwg2dxf";
  const dir = await mkdtemp(path.join(os.tmpdir(), "dwg-"));
  const src = path.join(dir, "in.dwg"), out = path.join(dir, "out.dxf");
  try {
    await writeFile(src, dwg);
    await new Promise<void>((resolve, reject) => {
      execFile(bin, ["-y", "-o", out, src], { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err) => {
        // dwg2dxf prints warnings and can exit non-zero on minor problems; judge by the output file below
        if (err && (err as NodeJS.ErrnoException).code === "ENOENT") reject(new Error("DWG reader is not installed on this server."));
        else if (err && err.killed) reject(new Error("This DWG took too long to read. Save it as DXF in AutoCAD and upload that."));
        else resolve();
      });
    });
    const text = await readFile(out, "utf8").catch(() => "");
    if (!/\bENTITIES\b/.test(text)) throw new Error("This DWG could not be read. In AutoCAD use Save As → DXF and upload the DXF instead.");
    return text;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
