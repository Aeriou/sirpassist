import { formatCoords } from "./format";
import type { GeoFix } from "./types";

export async function stampPhoto(
  dataUrl: string,
  meta: { time: string; geo?: GeoFix },
): Promise<string> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0);
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
  return canvas.toDataURL("image/jpeg", 0.82);
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
