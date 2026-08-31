import type { MouseEvent } from "react";

const SIZE = 128;

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
  const z = lat != null ? 16 : 7;
  const clat = lat ?? 50.5;
  const clng = lng ?? 4.47;
  const xf = lon2n(clng, z);
  const yf = lat2n(clat, z);
  const tx = Math.floor(xf) - 1;
  const ty = Math.floor(yf) - 1;
  const tiles = [0, 1, 2].flatMap((row) =>
    [0, 1, 2].map((col) => ({
      x: tx + col,
      y: ty + row,
      src: `https://tile.openstreetmap.org/${z}/${tx + col}/${ty + row}.png`,
    })),
  );

  function click(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const scale = rect.width / (SIZE * 3);
    const nx = tx + px / (SIZE * scale);
    const ny = ty + py / (SIZE * scale);
    onPick(n2lat(ny, z), n2lon(nx, z));
  }

  const markerLeft = ((xf - tx) / 3) * 100;
  const markerTop = ((yf - ty) / 3) * 100;

  return (
    <div>
      <div
        className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl bg-surface-2 shadow-[var(--shadow-border)]"
        onClick={click}
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
      </div>
      <p className="mt-2 text-xs text-muted">Touchez la carte pour poser le point — l'adresse OSM est vérifiée ensuite.</p>
    </div>
  );
}
