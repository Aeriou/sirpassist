import { useEffect, useRef, useState, type PointerEvent } from "react";

const SIZE = 128;
const MIN_Z = 4;
const MAX_Z = 19;
const clampZ = (z: number) => Math.min(MAX_Z, Math.max(MIN_Z, z));

function lon2n(lon: number, z: number) {
  return ((lon + 180) / 360) * 2 ** z;
}
function lat2n(lat: number, z: number) {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z;
}
function n2lon(x: number, z: number) {
  return (x / 2 ** z) * 360 - 180;
}
function n2lat(y: number, z: number) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export function PlaceMap({
  lat,
  lng,
  onPick,
}: {
  lat?: number;
  lng?: number;
  onPick: (lat: number, lng: number) => void;
}) {
  const [zoom, setZoom] = useState(lat != null ? 16 : 7);
  const [center, setCenter] = useState({ lat: lat ?? 50.5, lng: lng ?? 4.47 });
  const drag = useRef<{ x: number; y: number; lat: number; lng: number; moved: boolean } | null>(null);

  // Recentrer sur le point dès qu'il est choisi ailleurs (recherche, GPS).
  useEffect(() => {
    if (lat != null && lng != null) {
      setCenter({ lat, lng });
      setZoom((z) => (z < 15 ? 16 : z));
    }
  }, [lat, lng]);

  const z = zoom;
  const xf = lon2n(center.lng, z);
  const yf = lat2n(center.lat, z);
  const tx = Math.floor(xf) - 1;
  const ty = Math.floor(yf) - 1;
  const tiles = [0, 1, 2].flatMap((row) =>
    [0, 1, 2].map((col) => ({
      x: tx + col,
      y: ty + row,
      src: `https://tile.openstreetmap.org/${z}/${tx + col}/${ty + row}.png`,
    })),
  );

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, lat: center.lat, lng: center.lng, moved: false };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dxPx = e.clientX - d.x;
    const dyPx = e.clientY - d.y;
    if (Math.abs(dxPx) + Math.abs(dyPx) > 4) d.moved = true;
    const tilesPerPx = 3 / rect.width; // la boîte fait 3 tuiles de large
    const nx = lon2n(d.lng, z) - dxPx * tilesPerPx;
    const ny = lat2n(d.lat, z) - dyPx * tilesPerPx;
    setCenter({ lat: n2lat(ny, z), lng: n2lon(nx, z) });
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return; // un glissement ne pose pas de point
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const nx = tx + (px * 3) / rect.width;
    const ny = ty + (py * 3) / rect.width;
    onPick(n2lat(ny, z), n2lon(nx, z));
  }

  const markerLeft = ((xf - tx) / 3) * 100;
  const markerTop = ((yf - ty) / 3) * 100;

  return (
    <div>
      <div
        className="relative mx-auto aspect-square w-full max-w-sm touch-none select-none overflow-hidden rounded-xl bg-surface-2 shadow-[var(--shadow-border)]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        role="application"
        aria-label="Carte OpenStreetMap Belgique"
      >
        <div className="grid h-full w-full grid-cols-3">
          {tiles.map((t) => (
            <img
              key={`${t.x}-${t.y}`}
              src={t.src}
              alt=""
              draggable={false}
              className="pointer-events-none h-full w-full object-cover"
            />
          ))}
        </div>
        {lat != null && lng != null ? (
          <span
            className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-full rounded-full border-2 border-white bg-accent"
            style={{ left: `${markerLeft}%`, top: `${markerTop}%` }}
          />
        ) : null}
        <div
          className="absolute right-2 top-2 z-10 flex flex-col overflow-hidden rounded-lg shadow-[var(--shadow-border)]"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            aria-label="Zoom avant"
            className="size-8 bg-surface text-lg font-semibold leading-none text-fg hover:bg-accent-dim"
            onClick={() => setZoom((v) => clampZ(v + 1))}
          >
            +
          </button>
          <button
            type="button"
            aria-label="Zoom arrière"
            className="size-8 border-t border-border bg-surface text-lg font-semibold leading-none text-fg hover:bg-accent-dim"
            onClick={() => setZoom((v) => clampZ(v - 1))}
          >
            −
          </button>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">
        Glissez pour vous déplacer, +/− pour zoomer. Touchez la carte pour poser le point — l'adresse
        OSM est vérifiée ensuite.
      </p>
    </div>
  );
}
