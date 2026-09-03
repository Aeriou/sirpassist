import { formatCoords } from "./format";
import type { GeoFix } from "./types";

// Photo de constat : sert à COMPRENDRE le dossier ET à faire foi (preuve CBE).
// On l'allège (largeur plafonnée, JPEG) SANS toucher à sa valeur légale : le
// bandeau horodaté — date/heure + lieu (adresse ou coordonnées GPS) + mention
// « SiprAssist · preuve CBE » — est REDESSINÉ dans les pixels APRÈS le
// redimensionnement, donc toujours net et lisible sur l'image stockée.
// ~150–350 Ko à 1600 px / q0.75 : léger, avec de la marge pour zoomer un détail.
export const PHOTO_MAX_W = 1600;
export const PHOTO_QUALITY = 0.75;

export async function stampPhoto(
  dataUrl: string,
  meta: { time: string; geo?: GeoFix; maxW?: number; quality?: number },
): Promise<string> {
  const maxW = meta.maxW ?? PHOTO_MAX_W;
  const quality = meta.quality ?? PHOTO_QUALITY;
  const img = await loadImage(dataUrl);
  const srcW = img.naturalWidth || img.width || 1;
  const srcH = img.naturalHeight || img.height || 1;
  const scale = Math.min(1, maxW / Math.max(srcW, srcH));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(srcW * scale));
  canvas.height = Math.max(1, Math.round(srcH * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  // 1) image redimensionnée, PUIS 2) bandeau de preuve par-dessus (ci-dessous).
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const h = canvas.height;
  const w = canvas.width;
  const bar = Math.max(48, Math.round(h * 0.11));
  ctx.fillStyle = "rgba(12, 18, 24, 0.78)";
  ctx.fillRect(0, h - bar, w, bar);
  ctx.fillStyle = "#4a9e86";
  ctx.fillRect(0, h - bar, w, 2);
  const pad = Math.max(10, Math.round(w * 0.02));
  const timeSize = Math.max(12, Math.round(w * 0.028));
  const subSize = Math.max(10, Math.round(w * 0.022));
  ctx.fillStyle = "#e8eef2";
  ctx.font = `600 ${timeSize}px ui-monospace, "IBM Plex Mono", monospace`;
  ctx.textBaseline = "top";
  ctx.fillText(meta.time, pad, h - bar + 8);
  ctx.fillStyle = "#8b97a4";
  ctx.font = `500 ${subSize}px "IBM Plex Sans", system-ui, sans-serif`;
  const line = meta.geo
    ? `${meta.geo.address ?? formatCoords(meta.geo.lat, meta.geo.lng)}`
    : "GPS non verrouillé";
  ctx.fillText(clip(ctx, line, w - pad * 2), pad, h - bar + 8 + timeSize + 4);
  ctx.fillStyle = "#4a9e86";
  ctx.font = `600 ${subSize}px "IBM Plex Sans", system-ui, sans-serif`;
  const mark = "SiprAssist · preuve CBE";
  const mw = ctx.measureText(mark).width;
  ctx.fillText(mark, w - pad - mw, h - bar + 8);
  return canvas.toDataURL("image/jpeg", quality);
}

function clip(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 4 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith("data:") && !src.startsWith("blob:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image illisible"));
    img.src = src;
  });
}
