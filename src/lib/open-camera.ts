export function isPhoneCamera(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPod|Android.*Mobile/i.test(navigator.userAgent);
}

export function cameraSupported(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

export async function getCameraStream(
  prefer: "environment" | "user" = "environment",
): Promise<MediaStream> {
  const md = navigator.mediaDevices;
  if (!md?.getUserMedia) {
    throw new Error("Caméra web indisponible sur ce navigateur.");
  }
  const other = prefer === "environment" ? "user" : "environment";
  const attempts: MediaStreamConstraints[] = [
    {
      audio: false,
      video: {
        facingMode: { ideal: prefer },
        width: { ideal: 1280 },
        height: { ideal: 960 },
      },
    },
    { audio: false, video: { facingMode: prefer } },
    { audio: false, video: { facingMode: other } },
    { audio: false, video: true },
  ];
  let last: unknown;
  for (const constraints of attempts) {
    try {
      return await md.getUserMedia(constraints);
    } catch (err) {
      last = err;
    }
  }
  const msg =
    last instanceof Error
      ? last.name === "NotAllowedError"
        ? "Caméra refusée. Autorisez-la dans Chrome (cadenas → Autorisations)."
        : last.name === "NotFoundError"
          ? "Aucune caméra détectée sur la tablette."
          : last.message
      : "Impossible d'ouvrir la caméra.";
  throw new Error(msg);
}

export function stopStream(stream?: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

export function captureFrame(video: HTMLVideoElement): string {
  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 960;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible");
  ctx.drawImage(video, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.82);
}
