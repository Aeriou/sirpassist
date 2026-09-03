import { PHOTO_MAX_W, PHOTO_QUALITY } from "./stamp-photo";

export async function compressImage(
  source: File | Blob,
  maxW = PHOTO_MAX_W,
  quality = PHOTO_QUALITY,
): Promise<string> {
  const drawn = await drawToCanvas(source, maxW);
  return drawn.toDataURL("image/jpeg", quality);
}

export async function fileToDataUrl(file: File): Promise<string> {
  return compressImage(file);
}

async function drawToCanvas(source: File | Blob, maxW: number): Promise<HTMLCanvasElement> {
  try {
    if (typeof createImageBitmap === "function") {
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
      } catch {
        bitmap = await createImageBitmap(source);
      }
      const canvas = sizeCanvas(bitmap.width, bitmap.height, maxW);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponible");
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      return canvas;
    }
  } catch {
    /* FileReader fallback below */
  }
  const img = await blobToImage(source);
  const canvas = sizeCanvas(img.naturalWidth || img.width, img.naturalHeight || img.height, maxW);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function sizeCanvas(srcW: number, srcH: number, maxW: number) {
  const w0 = Math.max(1, srcW);
  const h0 = Math.max(1, srcH);
  const long = Math.max(w0, h0);
  const scale = Math.min(1, maxW / long);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w0 * scale));
  canvas.height = Math.max(1, Math.round(h0 * scale));
  return canvas;
}

function blobToImage(source: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image illisible sur cet appareil"));
    };
    img.src = url;
  });
}
