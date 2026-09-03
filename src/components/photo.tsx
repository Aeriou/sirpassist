import { useEffect, useState } from "react";
import { resolveAsset } from "@/lib/asset-cache";
import { cn } from "@/lib/utils";

/**
 * Affiche une photo : la copie locale si elle est là (data URL ou chemin), sinon
 * on va la chercher sur le serveur par son `assetId` (photos synchronisées à
 * part du blob de dossiers). Rien de bloquant : un cadre discret pendant le
 * chargement.
 */
export function Photo({
  dataUrl,
  assetId,
  alt = "",
  className,
}: {
  dataUrl?: string;
  assetId?: string;
  alt?: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string | undefined>(dataUrl || undefined);

  useEffect(() => {
    if (dataUrl) {
      setSrc(dataUrl);
      return;
    }
    if (!assetId) {
      setSrc(undefined);
      return;
    }
    let alive = true;
    void resolveAsset(assetId).then((d) => {
      if (alive) setSrc(d ?? undefined);
    });
    return () => {
      alive = false;
    };
  }, [dataUrl, assetId]);

  if (src) return <img src={src} alt={alt} className={className} />;
  if (!assetId) return null;
  return (
    <div className={cn("grid place-items-center bg-surface-2 text-xs text-subtle", className)}>
      Photo…
    </div>
  );
}
