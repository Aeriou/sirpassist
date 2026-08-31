import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, SwitchCamera, X } from "lucide-react";
import { toast } from "sonner";
import { compressImage } from "@/lib/compress-image";
import { formatStamp } from "@/lib/format";
import {
  cameraSupported,
  captureFrame,
  getCameraStream,
  isPhoneCamera,
  stopStream,
} from "@/lib/open-camera";
import { stampPhoto } from "@/lib/stamp-photo";
import type { GeoFix } from "@/lib/types";
import { Button, buttonVariants } from "./ui/button";
import { cn } from "@/lib/utils";

export function PhotoCapture({
  value,
  onChange,
  label = "Photo du constat",
  geo,
}: {
  value?: string;
  onChange: (url?: string) => void;
  label?: string;
  geo?: GeoFix;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [live, setLive] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState(false);

  useEffect(() => {
    setPhone(isPhoneCamera());
  }, []);

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    (async () => {
      try {
        const stream = await getCameraStream(facing);
        if (cancelled) {
          stopStream(stream);
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        video.setAttribute("webkit-playsinline", "true");
        await video.play().catch(() => undefined);
      } catch (err) {
        setLive(false);
        toast.error(err instanceof Error ? err.message : "Caméra indisponible.");
      }
    })();
    return () => {
      cancelled = true;
      stopStream(streamRef.current);
      streamRef.current = null;
      const video = videoRef.current;
      if (video) video.srcObject = null;
    };
  }, [live, facing]);

  async function processDataUrl(dataUrl: string) {
    try {
      const stamped = await stampPhoto(dataUrl, { time: formatStamp(), geo });
      onChange(stamped);
    } catch {
      onChange(dataUrl);
    }
  }

  async function onFile(file?: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const url = await compressImage(file);
      await processDataUrl(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible de lire la photo.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function openLive() {
    if (!cameraSupported()) {
      toast.message("Utilisez Galerie — la caméra web n'est pas exposée.");
      fileRef.current?.click();
      return;
    }
    setLive(true);
  }

  async function snap() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      toast.error("Flux caméra pas encore prêt — patientez une seconde.");
      return;
    }
    setBusy(true);
    try {
      const frame = captureFrame(video);
      await processDataUrl(frame);
      setLive(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Capture impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="mb-2 text-xs font-medium tracking-wide text-muted">{label}</p>
      {value ? (
        <div className="relative overflow-hidden rounded-xl">
          <img src={value} alt="Constat" className="h-48 w-full object-cover" />
          <Button
            type="button"
            size="icon-sm"
            variant="secondary"
            className="absolute top-2 right-2"
            aria-label="Retirer la photo"
            onClick={() => onChange(undefined)}
          >
            <X />
          </Button>
        </div>
      ) : (
        <div
          className={cn(
            "flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl bg-surface-2 px-4 py-6 shadow-[var(--shadow-border)]",
          )}
        >
          <p className="text-sm text-muted">
            Caméra dans la page (tablette Android) — photo horodatée, preuve CBE.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={openLive} disabled={busy}>
              <Camera />
              Appareil
            </Button>
            <label
              className={cn(buttonVariants({ variant: "secondary" }), "cursor-pointer")}
            >
              <ImagePlus />
              Galerie
              <input
                ref={fileRef}
                type="file"
                accept="image/*,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp,.heic"
                capture={phone ? "environment" : undefined}
                className="sr-only"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
            </label>
          </div>
        </div>
      )}

      {live ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          <video
            ref={videoRef}
            className="min-h-0 flex-1 w-full object-cover"
            playsInline
            muted
            autoPlay
          />
          <div className="flex items-center justify-between gap-3 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button type="button" variant="secondary" onClick={() => setLive(false)}>
              Annuler
            </Button>
            <button
              type="button"
              aria-label="Prendre la photo"
              disabled={busy}
              onClick={() => void snap()}
              className="size-16 rounded-full border-4 border-white bg-accent shadow-lg disabled:opacity-40"
            />
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label="Changer de caméra"
              onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
            >
              <SwitchCamera />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
