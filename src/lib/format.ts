import { format, formatDistanceToNow, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

export function formatDate(iso: string, pattern = "d MMMM yyyy"): string {
  try {
    return format(parseISO(iso), pattern, { locale: fr });
  } catch {
    return iso;
  }
}

export function formatShortDate(iso: string): string {
  return formatDate(iso, "d MMM yyyy");
}

export function fromNow(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { locale: fr, addSuffix: true });
  } catch {
    return "";
  }
}

export function isoDate(d = new Date()): string {
  return d.toISOString();
}

export function isoDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatEuro(n: number): string {
  return new Intl.NumberFormat("fr-BE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatStamp(d = new Date()): string {
  return format(d, "dd/MM/yyyy HH:mm:ss", { locale: fr });
}

export function formatCoords(lat: number, lng: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "O";
  return `${Math.abs(lat).toFixed(5)}° ${ns}  ${Math.abs(lng).toFixed(5)}° ${ew}`;
}
