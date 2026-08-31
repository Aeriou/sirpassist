/** Minimal one-or-more-page PDF wrapping JPEG images (A4). */

export async function jpegsToPdf(pages: Blob[]): Promise<Blob> {
  const images = await Promise.all(pages.map((b) => b.arrayBuffer().then((a) => new Uint8Array(a))));
  const W = 595;
  const H = 842;
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let pos = 0;

  function push(data: Uint8Array | string) {
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    chunks.push(bytes);
    pos += bytes.length;
  }

  push("%PDF-1.4\n");
  const objAt: number[] = [];
  function mark() {
    objAt.push(pos);
  }

  mark();
  push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n");
  const pageIds = images.map((_, i) => 3 + i * 3);
  mark();
  push(
    `2 0 obj << /Type /Pages /Count ${images.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >> endobj\n`,
  );

  images.forEach((jpeg, i) => {
    const pageId = 3 + i * 3;
    const imgId = pageId + 1;
    const contentId = pageId + 2;
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im${i} Do Q\n`;
    mark();
    push(
      `${pageId} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im${i} ${imgId} 0 R >> >> /Contents ${contentId} 0 R >> endobj\n`,
    );
    mark();
    push(
      `${imgId} 0 obj << /Type /XObject /Subtype /Image /Width 1240 /Height 1754 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >> stream\n`,
    );
    push(jpeg);
    push("\nendstream endobj\n");
    mark();
    push(`${contentId} 0 obj << /Length ${content.length} >> stream\n${content}endstream endobj\n`);
  });

  const xrefPos = pos;
  push(`xref\n0 ${objAt.length + 1}\n0000000000 65535 f \n`);
  for (const off of objAt) {
    push(`${String(off).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer << /Size ${objAt.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`);
  void offsets;
  const out = new Uint8Array(pos);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return new Blob([out], { type: "application/pdf" });
}

export async function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("JPEG impossible"))), "image/jpeg", quality);
  });
}
