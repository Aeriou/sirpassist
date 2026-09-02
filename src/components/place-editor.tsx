import { useState } from "react";
import { toast } from "sonner";
import { Check, MapPin, Search } from "lucide-react";
import { PlaceMap } from "./place-map";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Field, Input } from "./ui/input";
import { locatePlaceFromGps, reverseGeocode, searchBelgianAddress } from "@/lib/geo";
import { formatCivic, formatIndoor, inBelgium, isBelgianPostcode } from "@/lib/place";
import type { Place } from "@/lib/types";
import { cn } from "@/lib/utils";

export function PlaceEditor({
  value,
  onChange,
}: {
  value: Place;
  onChange: (p: Place) => void;
}) {
  const [query, setQuery] = useState(value.label || formatCivic(value));
  const [hits, setHits] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<"gps" | "map" | "search" | null>(null);

  async function search() {
    const q = query.trim();
    if (q.length < 5) {
      toast.error("Saisissez une adresse belge (rue, n°, code postal, ville).");
      return;
    }
    if (/\b\d{5,}\b/.test(q)) {
      setHits([]);
      onChange({ ...value, verified: false, label: "" });
      toast.error("Code postal invalide. Un code belge a 4 chiffres (ex. 6000).");
      return;
    }
    setBusy("search");
    setSearching(true);
    try {
      const res = await searchBelgianAddress({ data: { q } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setHits(res.hits);
      if (res.hits.length === 0) {
        toast.error(
          "Adresse introuvable — corrigez l'orthographe, posez le point sur la carte, ou remplissez les champs à la main.",
        );
      }
    } finally {
      setBusy(null);
      setSearching(false);
    }
  }

  function pickHit(p: Place) {
    onChange({
      ...value,
      street: p.street,
      number: p.number,
      postcode: p.postcode,
      city: p.city,
      country: "Belgique",
      lat: p.lat,
      lng: p.lng,
      label: p.label,
      verified: p.verified,
      source: "search",
    });
    setQuery(p.label);
    setHits([]);
    toast.success("Adresse civique vérifiée (OpenStreetMap).");
  }

  async function gps() {
    setBusy("gps");
    try {
      const p = await locatePlaceFromGps();
      onChange({
        ...value,
        street: p.street,
        number: p.number,
        postcode: p.postcode,
        city: p.city,
        country: "Belgique",
        lat: p.lat,
        lng: p.lng,
        label: p.label,
        verified: p.verified,
        source: "gps",
      });
      setQuery(p.label);
      setHits([]);
      toast.success(p.verified ? "GPS verrouillé, adresse vérifiée." : "GPS pris — affinez l'adresse.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "GPS refusé ou indisponible.");
    } finally {
      setBusy(null);
    }
  }

  async function pickMap(lat: number, lng: number) {
    if (!inBelgium(lat, lng)) {
      toast.error("Point hors Belgique.");
      return;
    }
    setBusy("map");
    try {
      const r = await reverseGeocode({ data: { lat, lng } });
      if (!r.ok) {
        onChange({ ...value, lat, lng, verified: false, label: "", source: "map" });
        toast.error(r.error);
        return;
      }
      const p = r.place;
      onChange({
        ...value,
        street: p.street,
        number: p.number,
        postcode: p.postcode,
        city: p.city,
        country: "Belgique",
        lat: p.lat,
        lng: p.lng,
        label: p.label,
        verified: p.verified,
        source: "map",
      });
      setQuery(p.label);
      toast.success(p.verified ? "Point carte vérifié." : "Point posé — complètez l'adresse.");
    } finally {
      setBusy(null);
    }
  }

  function patchIndoor(patch: Partial<Place>) {
    onChange({ ...value, ...patch });
  }

  function patchCivic(patch: Partial<Pick<Place, "street" | "number" | "postcode" | "city">>) {
    const merged = { ...value, ...patch };
    onChange({ ...merged, source: "manual", verified: false, label: formatCivic(merged) });
  }

  const indoor = formatIndoor(value);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium tracking-wide text-muted">Adresse civique (Belgique)</p>
        {value.verified ? (
          <Badge tone="low">Vérifiée</Badge>
        ) : (
          <Badge tone="mid">Non vérifiée</Badge>
        )}
      </div>

      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (value.verified) onChange({ ...value, verified: false });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
          placeholder="Rue, n°, code postal, ville"
          aria-invalid={!value.verified}
        />
        <Button type="button" variant="secondary" onClick={() => void search()} disabled={busy === "search"}>
          <Search />
          Vérifier
        </Button>
      </div>

      {hits.length > 0 ? (
        <ul className="max-h-40 overflow-y-auto rounded-xl bg-surface-2 p-1">
          {hits.map((h) => (
            <li key={h.label + h.lat}>
              <button
                type="button"
                className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent-dim"
                onClick={() => pickHit(h)}
              >
                {h.label}
                {!h.verified ? <span className="mt-0.5 block text-xs text-warn">Incomplet — à préciser</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : searching ? (
        <p className="text-xs text-muted">Recherche OpenStreetMap…</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => void gps()} disabled={busy === "gps"}>
          <MapPin />
          {busy === "gps" ? "GPS…" : "Position GPS"}
        </Button>
      </div>

      <PlaceMap lat={value.lat} lng={value.lng} onPick={(a, b) => void pickMap(a, b)} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="Rue" className="col-span-2">
          <Input
            value={value.street}
            onChange={(e) => patchCivic({ street: e.target.value })}
            placeholder="Rue de la Loi"
          />
        </Field>
        <Field label="N°">
          <Input
            value={value.number}
            onChange={(e) => patchCivic({ number: e.target.value })}
            placeholder="16"
          />
        </Field>
        <Field label="Code postal">
          <Input
            value={value.postcode}
            onChange={(e) => patchCivic({ postcode: e.target.value.replace(/\D/g, "").slice(0, 4) })}
            inputMode="numeric"
            placeholder="1000"
          />
        </Field>
        <Field label="Ville" className="col-span-2 sm:col-span-2">
          <Input
            value={value.city}
            onChange={(e) => patchCivic({ city: e.target.value })}
            placeholder="Bruxelles"
          />
        </Field>
      </div>
      <p className="text-xs text-subtle">
        Le plus fiable : GPS, carte ou recherche (adresse « Vérifiée »). Vous pouvez aussi remplir
        ces champs à la main — l'adresse sera alors marquée « Non vérifiée ».
      </p>

      <p className="pt-1 text-xs font-medium tracking-wide text-muted">Lieu précis sur site</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Maison / nom">
          <Input
            value={value.house}
            onChange={(e) => patchIndoor({ house: e.target.value })}
            placeholder="Villa, annexe…"
          />
        </Field>
        <Field label="Bâtiment / hall">
          <Input
            value={value.building}
            onChange={(e) => patchIndoor({ building: e.target.value })}
            placeholder="Hall B, immeuble A"
          />
        </Field>
        <Field label="Étage">
          <Input
            value={value.floor}
            onChange={(e) => patchIndoor({ floor: e.target.value })}
            placeholder="RDC, 2, -1"
          />
        </Field>
        <Field label="App. / local">
          <Input
            value={value.unit}
            onChange={(e) => patchIndoor({ unit: e.target.value })}
            placeholder="12, bureau 4"
          />
        </Field>
        <Field label="Pièce / zone" className="col-span-2">
          <Input
            value={value.room}
            onChange={(e) => patchIndoor({ room: e.target.value })}
            placeholder="Atelier 3, cuisine, quai nord"
          />
        </Field>
        <Field label="Précision" className="col-span-2">
          <Input
            value={value.extra}
            onChange={(e) => patchIndoor({ extra: e.target.value })}
            placeholder="Colonne nord, près de l'issue…"
          />
        </Field>
      </div>
      {indoor ? <p className={cn("text-sm text-muted")}>{indoor}</p> : null}
      {value.postcode && !isBelgianPostcode(value.postcode) ? (
        <p className="text-sm text-danger">Code postal belge invalide.</p>
      ) : null}
    </div>
  );
}
