import { canvasToJpeg, jpegsToPdf } from "./pdf";
import { isoDay } from "./format";
import type { Anomaly, FdsNotice, PgpPlan, Profile, RpsSituation, Visit } from "./types";
import { formatPlace } from "./place";
import { themeById } from "./code-bien-etre";
import { formatEuro } from "./format";
import { FDS_REALITY_QUESTIONS, FDS_REALITY_THEMES, hasReality } from "./fds-reality";

export type ArchivePayload = {
  profile: Profile;
  visits: Visit[];
  anomalies: Anomaly[];
  fds: FdsNotice[];
  rps?: RpsSituation[];
  pgp: PgpPlan;
};

type Dir = FileSystemDirectoryHandle;

export async function pickDirectory(): Promise<Dir | null> {
  const w = window as Window & {
    showDirectoryPicker?: (o?: { mode?: "readwrite" }) => Promise<Dir>;
  };
  if (!w.showDirectoryPicker) return null;
  return w.showDirectoryPicker({ mode: "readwrite" });
}

export async function ensureDir(parent: Dir, name: string): Promise<Dir> {
  return parent.getDirectoryHandle(safeName(name), { create: true });
}

export async function writeFile(dir: Dir, name: string, data: Blob | string) {
  const handle = await dir.getFileHandle(safeName(name), { create: true });
  const w = await handle.createWritable();
  await w.write(typeof data === "string" ? new Blob([data], { type: "text/plain;charset=utf-8" }) : data);
  await w.close();
}

export function downloadBlob(name: string, data: Blob | string) {
  const blob = typeof data === "string" ? new Blob([data], { type: "text/plain;charset=utf-8" }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function archiveJson(payload: ArchivePayload): string {
  return JSON.stringify({ savedAt: new Date().toISOString(), ...payload }, null, 2);
}

export function reportHtml(title: string, body: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"/><title>${esc(title)}</title>
<style>
  body{font-family:system-ui,sans-serif;color:#111;max-width:720px;margin:24px auto;padding:0 16px;line-height:1.45}
  h1{font-size:1.4rem} h2{font-size:1.1rem;margin-top:1.4em}
  .muted{color:#555;font-size:.9rem} img{max-width:100%;border-radius:8px}
  @media print { body { margin: 12mm } }
</style></head><body>${body}</body></html>`;
}

export function visitHtml(visit: Visit, anomalies: Anomaly[], profile: Profile, fds: FdsNotice[] = [], rps: RpsSituation[] = []): string {
  const rows = anomalies
    .map(
      (a) =>
        `<h2>${esc(a.title)}</h2><p class="muted">${esc(a.location)} · Kinney ${a.kinney.score} · ${esc(a.author?.name ?? profile.name)}</p><p>${esc(a.description)}</p><p><strong>Mesure</strong> — ${esc(a.correctiveAction)}</p>`,
    )
    .join("");
  const fdsRows = fds
    .map((f) => {
      const reality = hasReality(f.reality)
        ? FDS_REALITY_QUESTIONS.map((q) => {
            const answer = (f.reality?.[q.key] ?? "").trim();
            return answer ? `<p><strong>${esc(q.label)}</strong> ${esc(answer)}</p>` : "";
          }).join("")
        : "";
      return `<h2>FDS — ${esc(f.productName)}</h2><p class="muted">${f.signalWord}</p><ol>${f.notice.map((l) => `<li>${esc(l)}</li>`).join("")}</ol>${reality}`;
    })
    .join("");
  const rpsRows = rps
    .map(
      (s) =>
        `<h2>RPS — ${esc(s.title)}</h2><p class="muted">${esc(s.unit)} — lecture collective, sans identité</p><p>${esc(s.diagnosis)}</p><ol>${s.measures.map((m) => `<li>${esc(m)}</li>`).join("")}</ol>`,
    )
    .join("");
  return reportHtml(
    `Visite ${visit.name || visit.company}`,
    `<h1>${esc(visit.company)}</h1><p class="muted">${esc(visit.place ? formatPlace(visit.place) : visit.site)} · ${esc(visit.date)}</p><p>Conseiller : ${esc(profile.name)}, ${esc(profile.title)} N${profile.level}</p>${rows}${fdsRows}${rpsRows}`,
  );
}

export function anomalyHtml(a: Anomaly, profile: Profile): string {
  const author = a.author;
  return reportHtml(
    a.title,
    `<h1>${esc(a.title)}</h1>
    <p class="muted">${esc(a.location)}</p>
    ${a.photo && a.photo.startsWith("data:") ? `<p><img src="${a.photo}" alt=""/></p>` : ""}
    <p>${esc(a.description)}</p>
    <p><strong>Mesure</strong> — ${esc(a.correctiveAction)}</p>
    <p class="muted">Rédigé par ${esc(author?.name ?? profile.name)}, ${esc(author?.title ?? profile.title)} (CP N${author?.level ?? profile.level})</p>
    <p class="muted">${esc(a.legalRef ?? "")}</p>`,
  );
}

export function fdsHtml(n: FdsNotice, visitName?: string): string {
  const realityBlock = hasReality(n.reality)
    ? `<h2>La réalité — questions de poste</h2>
    <dl>${FDS_REALITY_QUESTIONS.map((q) => {
      const answer = (n.reality?.[q.key] ?? "").trim();
      if (!answer) return "";
      return `<dt>${esc(q.label)}</dt><dd>${esc(answer)}</dd>`;
    }).join("")}</dl>
    <p>${(n.reality?.themes ?? [])
      .map((id) => FDS_REALITY_THEMES.find((t) => t.id === id)?.label ?? id)
      .map(esc)
      .join(" · ")}</p>`
    : "";
  const scope = n.visitId
    ? `<p class="muted">Liée au dossier ${esc(visitName || n.visitId)}</p>`
    : `<p class="muted">Notice informative</p>`;
  return reportHtml(
    n.productName,
    `<h1>${esc(n.productName)}</h1><p class="muted">${esc(n.manufacturer ?? "")} · ${n.signalWord}</p>
    ${scope}
    <h2>Notice de poste</h2><ol>${n.notice.map((l) => `<li>${esc(l)}</li>`).join("")}</ol>
    <h2>EPI</h2><p>${n.ppe.map(esc).join(" · ")}</p>
    <p>${esc(n.firstAid)}</p>
    ${realityBlock}`,
  );
}

export function paaHtml(pgp: PgpPlan): string {
  const lines = pgp.lines
    .filter((l) => l.included)
    .map(
      (l) =>
        `<tr><td>${esc(themeById(l.theme).short)}</td><td>${esc(l.title)}</td><td>${esc(l.owner)}</td><td>${l.quarter}</td><td>${formatEuro(l.budget)}</td></tr>`,
    )
    .join("");
  return reportHtml(
    `PAA ${pgp.paaYear}`,
    `<h1>PAA ${pgp.paaYear} — ${esc(pgp.company)}</h1>
    <table cellspacing="0" cellpadding="6" border="1">${lines}</table>`,
  );
}

type NamedFile = { path: string; data: Blob | string };

async function archiveFiles(payload: ArchivePayload, opts: { pdf: boolean }): Promise<NamedFile[]> {
  const files: NamedFile[] = [{ path: "sauvegarde.json", data: archiveJson(payload) }];
  for (const v of payload.visits) {
    const related = payload.anomalies.filter((a) => a.visitId === v.id);
    const relatedFds = payload.fds.filter((f) => f.visitId === v.id);
    const relatedRps = (payload.rps ?? []).filter((r) => r.visitId === v.id);
    files.push({
      path: `visites/${safeName(v.company)}.html`,
      data: visitHtml(v, related, payload.profile, relatedFds, relatedRps),
    });
  }
  for (const a of payload.anomalies) {
    files.push({
      path: `constats/${safeName(a.title)}.html`,
      data: anomalyHtml(a, payload.profile),
    });
  }
  for (const f of payload.fds) {
    const visit = payload.visits.find((v) => v.id === f.visitId);
    files.push({
      path: `etiquettes/${safeName(f.productName)}.html`,
      data: fdsHtml(f, visit ? visit.name || visit.company : undefined),
    });
  }
  files.push({
    path: `paa/paa-${payload.pgp.paaYear}.html`,
    data: paaHtml(payload.pgp),
  });
  if (opts.pdf) {
    const pages = await overviewPdfPages(payload);
    if (pages.length) {
      files.push({
        path: `pdf/dossier-sipp-${isoDay()}.pdf`,
        data: await jpegsToPdf(pages),
      });
    }
  }
  return files;
}

export async function exportToDirectory(
  root: Dir,
  folderName: string,
  payload: ArchivePayload,
  opts: { pdf: boolean },
): Promise<string> {
  const dest = await ensureDir(root, folderName.trim() || `SiprAssist-${isoDay()}`);
  const day = await ensureDir(dest, isoDay());
  const files = await archiveFiles(payload, opts);
  for (const file of files) {
    const parts = file.path.split("/");
    const name = parts.pop()!;
    let dir = day;
    for (const part of parts) {
      dir = await ensureDir(dir, part);
    }
    await writeFile(dir, name, file.data);
  }
  return dest.name;
}

export async function archiveZip(payload: ArchivePayload, opts: { pdf: boolean }): Promise<Blob> {
  const files = await archiveFiles(payload, opts);
  const entries: { name: string; data: Uint8Array }[] = [];
  const enc = new TextEncoder();
  for (const file of files) {
    const buf =
      typeof file.data === "string"
        ? enc.encode(file.data)
        : new Uint8Array(await file.data.arrayBuffer());
    entries.push({ name: file.path, data: buf });
  }
  return zipStore(entries);
}

export async function downloadArchivePdf(payload: ArchivePayload) {
  const pages = await overviewPdfPages(payload);
  if (!pages.length) throw new Error("PDF impossible à générer.");
  downloadBlob(`siprassist-${isoDay()}.pdf`, await jpegsToPdf(pages));
}

export async function overviewPdfPages(payload: ArchivePayload): Promise<Blob[]> {
  const canvas = document.createElement("canvas");
  canvas.width = 1240;
  canvas.height = 1754;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  const pages: Blob[] = [];

  ctx.fillStyle = "#0c1218";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#4a9e86";
  ctx.fillRect(0, 0, 16, canvas.height);
  ctx.fillStyle = "#e8eef2";
  ctx.font = "600 42px system-ui";
  ctx.fillText("SiprAssist — dossier SIPP", 64, 160);
  ctx.font = "400 28px system-ui";
  ctx.fillStyle = "#8b97a4";
  ctx.fillText(payload.profile.name, 64, 220);
  ctx.fillText(`${payload.profile.title} · CP N${payload.profile.level}`, 64, 260);
  ctx.fillText(payload.pgp.company, 64, 310);
  ctx.fillText(
    `${payload.visits.length} visites · ${payload.anomalies.length} constats · ${payload.fds.length} notices`,
    64,
    370,
  );
  ctx.fillText(isoDay(), 64, 420);
  pages.push(await canvasToJpeg(canvas));

  ctx.fillStyle = "#f4f6f8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0c1218";
  ctx.font = "600 32px system-ui";
  ctx.fillText("Constats", 64, 80);
  ctx.font = "400 22px system-ui";
  let y = 130;
  for (const a of payload.anomalies.slice(0, 22)) {
    ctx.fillText(`• ${a.title.slice(0, 70)}  (${a.author?.name ?? payload.profile.name})`, 64, y);
    y += 36;
    if (y > 1680) break;
  }
  pages.push(await canvasToJpeg(canvas));
  return pages;
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&" + "amp;" : c === "<" ? "&" + "lt;" : c === ">" ? "&" + "gt;" : "&" + "quot;",
  );
}

function safeName(s: string) {
  return s.replace(/[^\w .-]+/gi, "_").slice(0, 80) || "fichier";
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(files: { name: string; data: Uint8Array }[]): Blob {
  const enc = new TextEncoder();
  const now = new Date();
  const time = ((now.getHours() & 31) << 11) | ((now.getMinutes() & 63) << 5) | ((now.getSeconds() / 2) & 31);
  const date =
    (((now.getFullYear() - 1980) & 127) << 9) | (((now.getMonth() + 1) & 15) << 5) | (now.getDate() & 31);
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = enc.encode(file.name);
    const crc = crc32(file.data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, file.data.length, true);
    lv.setUint32(22, file.data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    chunks.push(local, file.data);

    const ch = new Uint8Array(46 + name.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, file.data.length, true);
    cv.setUint32(24, file.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    ch.set(name, 46);
    central.push(ch);
    offset += local.length + file.data.length;
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const parts = [...chunks, ...central, eocd];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return new Blob([out], { type: "application/zip" });
}
