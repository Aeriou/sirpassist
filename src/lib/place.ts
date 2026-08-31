import { isoDate } from "./format";
import type { GeoFix, Place } from "./types";

export function emptyPlace(): Place {
  return {
    street: "",
    number: "",
    postcode: "",
    city: "",
    country: "Belgique",
    building: "",
    house: "",
    floor: "",
    unit: "",
    room: "",
    extra: "",
    label: "",
    verified: false,
  };
}

export function formatCivic(p: Pick<Place, "street" | "number" | "postcode" | "city" | "country">): string {
  const line1 = [p.street, p.number].filter(Boolean).join(" ").trim();
  const line2 = [p.postcode, p.city].filter(Boolean).join(" ").trim();
  return [line1, line2, p.country || "Belgique"].filter(Boolean).join(", ");
}

export function formatIndoor(p: Place): string {
  return [
    p.house && `Maison ${p.house}`,
    p.building && `Bâtiment ${p.building}`,
    p.floor && `Étage ${p.floor}`,
    p.unit && `App. / local ${p.unit}`,
    p.room,
    p.extra,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function formatPlace(p?: Place): string {
  if (!p) return "";
  const civic = p.label || formatCivic(p);
  const indoor = formatIndoor(p);
  return indoor ? `${civic} — ${indoor}` : civic;
}

export function placeToGeo(p?: Place): GeoFix | undefined {
  if (!p || p.lat == null || p.lng == null) return undefined;
  return {
    lat: p.lat,
    lng: p.lng,
    address: formatPlace(p),
    capturedAt: isoDate(),
  };
}

export function placeFromGeo(geo?: GeoFix, extras?: Partial<Place>): Place {
  const base = emptyPlace();
  if (!geo) return { ...base, ...extras };
  const parsed = parseCivic(geo.address ?? "");
  return {
    ...base,
    ...parsed,
    lat: geo.lat,
    lng: geo.lng,
    label: geo.address ?? formatCivic(parsed),
    verified: Boolean(geo.address && parsed.postcode && parsed.city),
    source: "gps",
    ...extras,
  };
}

export function parseCivic(address: string): Pick<Place, "street" | "number" | "postcode" | "city" | "country"> {
  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);
  let street = "";
  let number = "";
  let postcode = "";
  let city = "";
  const country = parts.find((p) => /belg/i.test(p)) || "Belgique";
  const pcPart = parts.find((p) => /\b\d{4}\b/.test(p));
  if (pcPart) {
    const m = pcPart.match(/(\d{4})\s+(.+)/);
    if (m) {
      postcode = m[1];
      city = m[2];
    } else {
      postcode = pcPart.match(/\d{4}/)?.[0] ?? "";
    }
  }
  const streetPart = parts[0] ?? "";
  const sm = streetPart.match(/^(.*?)(\d+\s*[a-zA-Z]?)$/);
  if (sm) {
    street = sm[1].trim();
    number = sm[2].trim();
  } else {
    street = streetPart;
  }
  if (!city) city = parts[1]?.replace(/^\d{4}\s*/, "") ?? "";
  return { street, number, postcode, city, country };
}

export function isBelgianPostcode(code: string): boolean {
  return /^\d{4}$/.test(code.trim());
}

export function inBelgium(lat: number, lng: number): boolean {
  return lat >= 49.45 && lat <= 51.55 && lng >= 2.5 && lng <= 6.45;
}
