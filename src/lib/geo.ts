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

export const reverseGeocode = createServerFn({ method: "POST" })
  .validator((input: { lat: number; lng: number }) => input)
  .handler(async ({ data }): Promise<{ ok: true; place: Place } | { ok: false; error: string }> => {
    if (!inBelgium(data.lat, data.lng)) {
      return { ok: false, error: "Point hors Belgique." };
    }
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${data.lat}&lon=${data.lng}&format=jsonv2&zoom=18&addressdetails=1&accept-language=fr`;
      const res = await fetch(url, { headers: NOMINATIM_HEADERS });
      if (!res.ok) return { ok: false, error: "Vérification d'adresse indisponible." };
      const body = (await res.json()) as NominatimHit;
      const place = hitToPlace(body, "map");
      if (!place) return { ok: false, error: "Pas d'adresse civique belge à cet endroit." };
      return { ok: true, place };
    } catch {
      return { ok: false, error: "Vérification d'adresse indisponible (réseau)." };
    }
  });

export const searchBelgianAddress = createServerFn({ method: "POST" })
  .validator((input: { q: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true; hits: Place[] } | { ok: false; error: string }> => {
    const q = data.q.trim();
    if (q.length < 5) return { ok: true, hits: [] };
    const fakePc = q.match(/\b(\d{5,})\b/);
    if (fakePc) return { ok: true, hits: [] };
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=be&accept-language=fr&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: NOMINATIM_HEADERS });
      if (!res.ok) return { ok: false, error: "Recherche d'adresse indisponible." };
      const body = (await res.json()) as NominatimHit[];
      const hits = body.map((h) => hitToPlace(h, "search")).filter((p): p is Place => Boolean(p));
      const seen = new Set<string>();
      const unique = hits.filter((h) => {
        const k = h.label;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      return { ok: true, hits: unique };
    } catch {
      return { ok: false, error: "Recherche d'adresse indisponible (réseau)." };
    }
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
