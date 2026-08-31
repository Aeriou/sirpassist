import { useRef, useState } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { compressImage } from "@/lib/compress-image";
import { Button, buttonVariants } from "./ui/button";
import { cn } from "@/lib/utils";

const MAX = 3;

export function SupportPhotos({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function addFiles(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    const room = MAX - value.length;
    if (room <= 0) {
      toast.message("3 captures maximum.");
      return;
    }
    setBusy(true);
    try {
      const next = [...value];
      for (const file of [...files].slice(0, room)) {
        if (!file.type.startsWith("image/")) continue;
        next.push(await compressImage(file, 960, 0.62));
      }
      onChange(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Image illisible.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div>
      <p className="mb-2 text-xs font-medium tracking-wide text-muted">
        Captures d'écran ou photos ({value.length}/{MAX})
      </p>
      {value.length > 0 ? (
        <ul className="mb-3 grid grid-cols-3 gap-2">
          {value.map((src, i) => (
            <li key={`${i}-${src.slice(-12)}`} className="relative overflow-hidden rounded-lg">
              <img src={src} alt="" className="h-24 w-full object-cover" />
              <button
                type="button"
                className="absolute top-1 right-1 flex size-8 items-center justify-center rounded-full bg-bg/80 text-fg"
                aria-label="Retirer la capture"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {value.length < MAX ? (
        <div className="flex flex-wrap gap-2">
          <label className={cn(buttonVariants({ variant: "secondary" }), "cursor-pointer")}>
            <Camera />
            Appareil
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={busy}
              onChange={(e) => void addFiles(e.target.files)}
            />
          </label>
          <label className={cn(buttonVariants(), "cursor-pointer")}>
            <ImagePlus />
            Galerie / capture
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              disabled={busy}
              onChange={(e) => void addFiles(e.target.files)}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
