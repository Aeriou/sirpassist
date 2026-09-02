import { createServerFn } from "@tanstack/react-start";
import { formatCoords, isoDate } from "./format";
import { inBelgium, isBelgianPostcode } from "./place";
import type { GeoFix, Place } from "./types";
import { emptyPlace } from "./place";

export const CHARLEROI: GeoFix = {
  lat: 50.41082,
  lng: 4.44458,
  address: "Rue de Montigny 42, 6000 Charleroi",
  capturedAt: isoDate(),
};

export const LIEGE: GeoFix = {
  lat: 50.63256,
  lng: 5.57966,
  address: "Rue de la Carrosserie 8, 4020 Liège",
  capturedAt: isoDate(),
};

export function geoLabel(geo?: GeoFix): string {
  if (!geo) return "";
  if (geo.address) return geo.address;
  return formatCoords(geo.lat, geo.lng);
}

type NominatimAddress = Record<string, string | undefined>;
type NominatimHit = {
  lat: string;
  lon: string;
  display_name: string;
  address?: NominatimAddress;
};

const NOMINATIM_HEADERS = {
  "User-Agent": "SiprAssist/1.0 (SIPP terrain Belgique)",
  Accept: "application/json",
  "Accept-Language": "fr",
};

const FETCH_TIMEOUT_MS = 7000;

function hitToPlace(hit: NominatimHit, source: Place["source"]): Place | null {
  const a = hit.address ?? {};
  const cc = (a.country_code ?? "").toLowerCase();
  if (cc && cc !== "be") return null;
  const postcode = (a.postcode ?? "").replace(/\s/g, "").slice(0, 4);
  if (postcode && !isBelgianPostcode(postcode)) return null;
  const street = a.road || a.pedestrian || a.footway || a.square || a.residential || a.hamlet || "";
  const number = a.house_number ?? "";
  const city = a.city || a.town || a.village || a.municipality || a.city_district || "";
  if (!street && !city) return null;
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inBelgium(lat, lng)) return null;
  const label = [ [street, number].filter(Boolean).join(" "), [postcode, city].filter(Boolean).join(" "), "Belgique"]
    .filter(Boolean)
    .join(", ");
  return {
    ...emptyPlace(),
    street,
    number,
    postcode,
    city,
    country: "Belgique",
    lat,
    lng,
    label,
    verified: Boolean(street && city && postcode),
    source,
  };
}

// Photon (komoot) — géocodeur OSM de secours. Nominatim refuse ou limite
// souvent les appels émis depuis un hébergeur (Vercel) ; Photon prend le relais.
type PhotonFeature = {
  geometry?: { coordinates?: number[] };
  properties?: Record<string, string | undefined>;
};

function photonToPlace(f: PhotonFeature, source: Place["source"]): Place | null {
  const p = f.properties ?? {};
  const cc = (p.countrycode ?? "").toLowerCase();
  if (cc && cc !== "be") return null;
  const coords = f.geometry?.coordinates ?? [];
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inBelgium(lat, lng)) return null;
  const postcode = (p.postcode ?? "").replace(/\s/g, "").slice(0, 4);
  if (postcode && !isBelgianPostcode(postcode)) return null;
  const street = p.street || p.name || "";
  const number = p.housenumber ?? "";
  const city = p.city || p.town || p.village || p.county || "";
  if (!street && !city) return null;
  const label = [ [street, number].filter(Boolean).join(" "), [postcode, city].filter(Boolean).join(" "), "Belgique"]
    .filter(Boolean)
    .join(", ");
  return {
    ...emptyPlace(),
    street,
    number,
    postcode,
    city,
    country: "Belgique",
    lat,
    lng,
    label,
    verified: Boolean(street && city && postcode),
    source,
  };
}

async function photonSearch(q: string): Promise<Place[]> {
  const url = `https://photon.komoot.io/api/?lang=fr&limit=6&lat=50.64&lon=4.67&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`photon ${res.status}`);
  const body = (await res.json()) as { features?: PhotonFeature[] };
  return (body.features ?? [])
    .map((f) => photonToPlace(f, "search"))
    .filter((p): p is Place => Boolean(p));
}

async function photonReverse(lat: number, lng: number): Promise<Place | null> {
  const url = `https://photon.komoot.io/reverse?lang=fr&lat=${lat}&lon=${lng}`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`photon ${res.status}`);
  const body = (await res.json()) as { features?: PhotonFeature[] };
  const first = (body.features ?? [])[0];
  return first ? photonToPlace(first, "map") : null;
}

function dedupePlaces(hits: Place[]): Place[] {
  const seen = new Set<string>();
  return hits.filter((h) => {
    if (seen.has(h.label)) return false;
    seen.add(h.label);
    return true;
  });
}

export const reverseGeocode = createServerFn({ method: "POST" })
  .validator((input: { lat: number; lng: number }) => input)
  .handler(async ({ data }): Promise<{ ok: true; place: Place } | { ok: false; error: string }> => {
    if (!inBelgium(data.lat, data.lng)) {
      return { ok: false, error: "Point hors Belgique." };
    }
    let unreachable = 0;

    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${data.lat}&lon=${data.lng}&format=jsonv2&zoom=18&addressdetails=1&accept-language=fr`;
      const res = await fetch(url, { headers: NOMINATIM_HEADERS, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (res.ok) {
        const place = hitToPlace((await res.json()) as NominatimHit, "map");
        if (place) return { ok: true, place };
      } else {
        unreachable++;
      }
    } catch {
      unreachable++;
    }

    try {
      const place = await photonReverse(data.lat, data.lng);
      if (place) return { ok: true, place };
    } catch {
      unreachable++;
    }

    if (unreachable >= 2) {
      return { ok: false, error: "Vérification d'adresse indisponible (réseau)." };
    }
    return { ok: false, error: "Pas d'adresse civique belge à cet endroit." };
  });

export const searchBelgianAddress = createServerFn({ method: "POST" })
  .validator((input: { q: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true; hits: Place[] } | { ok: false; error: string }> => {
    const q = data.q.trim();
    if (q.length < 5) return { ok: true, hits: [] };
    const fakePc = q.match(/\b(\d{5,})\b/);
    if (fakePc) return { ok: true, hits: [] };

    let hits: Place[] = [];
    let unreachable = 0;

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=be&accept-language=fr&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: NOMINATIM_HEADERS, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (res.ok) {
        const body = (await res.json()) as NominatimHit[];
        hits = body.map((h) => hitToPlace(h, "search")).filter((p): p is Place => Boolean(p));
      } else {
        unreachable++;
      }
    } catch {
      unreachable++;
    }

    if (hits.length === 0) {
      try {
        hits = await photonSearch(q);
      } catch {
        unreachable++;
      }
    }

    if (hits.length === 0 && unreachable >= 2) {
      return {
        ok: false,
        error: "Recherche d'adresse momentanément indisponible. Réessayez ou posez le point sur la carte.",
      };
    }
    return { ok: true, hits: dedupePlaces(hits) };
  });

export async function locateGps(): Promise<GeoFix> {
  const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("GPS indisponible sur cet appareil."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 8_000,
    });
  });
  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;
  if (!inBelgium(lat, lng)) {
    throw new Error("Position GPS hors Belgique.");
  }
  return {
    lat,
    lng,
    accuracy: pos.coords.accuracy,
    capturedAt: isoDate(),
  };
}

export async function locatePlaceFromGps(): Promise<Place> {
  const gps = await locateGps();
  const r = await reverseGeocode({ data: { lat: gps.lat, lng: gps.lng } });
  if (!r.ok) throw new Error(r.error);
  return { ...r.place, source: "gps" };
}
