import type { VoiceSections } from "./types";

export function splitVoice(text: string): VoiceSections {
  const raw = text.replace(/\s+/g, " ").trim();
  if (!raw) return { danger: "", measure: "", zone: "" };

  const measureMatch = raw.split(
    /(?:mesure corrective|mesure proposée|mesure|corriger|il faut|action)\s*[:\-–,.]?\s*/i,
  );
  const zoneMatch = raw.match(
    /(?:zone|lieu|atelier|quai|cabine|poste|matériel|materiel)\s*[:\-–]?\s*([^.]{3,80})/i,
  );

  let danger = raw;
  let measure = "";
  let zone = "";

  if (measureMatch.length > 1) {
    danger = measureMatch[0].trim();
    measure = measureMatch.slice(1).join(" ").trim();
  }

  if (zoneMatch) {
    zone = zoneMatch[0].trim();
    danger = danger.replace(zoneMatch[0], "").trim();
    measure = measure.replace(zoneMatch[0], "").trim();
  } else {
    const atelier = raw.match(/atelier\s*\d+[^,]*/i);
    const quai = raw.match(/\b(quai|cabine|poste|hall)[^,.]*/i);
    zone = (atelier?.[0] || quai?.[0] || "").trim();
  }

  if (!danger) danger = raw;
  if (!measure) {
    const hint = raw.match(/(consigner|libérer|isoler|fournir|afficher|former|stocker)[^.]*/i);
    measure = hint?.[0]?.trim() ?? "";
  }

  return {
    danger: cap(danger).slice(0, 500),
    measure: cap(measure).slice(0, 400),
    zone: cap(zone).slice(0, 80),
  };
}

function cap(s: string) {
  const t = s.replace(/^[\s,;:.\-–]+/, "").trim();
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1);
}
