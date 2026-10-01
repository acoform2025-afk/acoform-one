/**
 * Stored drawings: the DXF made from a DWG is saved gzip-compressed (DXF text shrinks ~10×, so big drawings fit the
 * 50 MB storage limit). These read either form — plain DXF or gzip — in the browser and on the server (Node 22).
 */
export async function dxfTextFromBlob(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    const s = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
    return await new Response(s).text();
  }
  return new TextDecoder().decode(buf);
}

export async function gzipText(text: string): Promise<Blob> {
  const s = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Blob([await new Response(s).arrayBuffer()], { type: "application/dxf" });   // typed, so storage accepts it
}
