import { createServerFn } from "@tanstack/react-start";
import { buildKinney, nearestOption, PROBABILITY, EXPOSURE, GRAVITY } from "./kinney";
import { THEMES, type ThemeId } from "./code-bien-etre";
import type { AnomalyDraft } from "./parse-observation";
import { parseObservation, defaultKinneyWhy } from "./parse-observation";
import type { FdsNotice, GhsCode, Urgency } from "./types";
import { parseReality, suggestThemes } from "./fds-reality";

const GHS: GhsCode[] = [
  "GHS01",
  "GHS02",
  "GHS03",
  "GHS04",
  "GHS05",
  "GHS06",
  "GHS07",
  "GHS08",
  "GHS09",
];

type AnalyzeAnomalyInput = {
  transcription: string;
  photo?: string;
};

type AnalyzeFdsInput = {
  photo: string;
};

function extractJson(text: string): unknown {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("JSON introuvable");
  return JSON.parse(raw.slice(start, end + 1));
}

async function grokJson(messages: unknown[], maxTokens = 700): Promise<unknown | null> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return null;
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4.5",
      messages,
      max_tokens: maxTokens,
      temperature: 0.2,
    }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content ?? "";
  try {
    return extractJson(content);
  } catch {
    return null;
  }
}

function asTheme(v: unknown): ThemeId {
  const id = String(v ?? "");
  return THEMES.some((t) => t.id === id) ? (id as ThemeId) : "lieux";
}

function asUrgency(v: unknown): Urgency {
  const u = String(v ?? "");
  if (u === "basse" || u === "moyenne" || u === "haute" || u === "critique") return u;
  return "moyenne";
}

function asGhs(list: unknown): GhsCode[] {
  if (!Array.isArray(list)) return [];
  return list.filter((x): x is GhsCode => GHS.includes(x as GhsCode));
}

export const analyzeAnomaly = createServerFn({ method: "POST" })
  .validator((input: AnalyzeAnomalyInput) => input)
  .handler(async ({ data }): Promise<{ ok: true; draft: AnomalyDraft; source: "ai" | "local" } | { ok: false; error: string }> => {
    const fallback = parseObservation(data.transcription);
    const content: unknown[] = [
      {
        type: "text",
        text: `Tu es un conseiller SIPP belge. À partir de l'observation de terrain (et de la photo si fournie), produis UNIQUEMENT un JSON avec:
{
  "title": "titre court",
  "location": "lieu",
  "description": "2-4 phrases professionnelles — description du danger",
  "theme": "un de: ${THEMES.map((t) => t.id).join(", ")}",
  "urgency": "basse|moyenne|haute|critique",
  "P": 10|6|3|1|0.5|0.2,
  "E": 10|6|3|2|1|0.5,
  "G": 100|40|15|7|3|1,
  "Pwhy": "justification P en 1 phrase, Code du bien-être",
  "Ewhy": "justification E en 1 phrase",
  "Gwhy": "justification G en 1 phrase",
  "legalRef": "référence Code du bien-être au travail",
  "correctiveAction": "mesure concrète",
  "zone": "matériel / zone concerné",
  "danger": "description du danger (1-3 phrases)"
}
Observation: ${data.transcription || "(photo seule)"}`,
      },
    ];
    if (data.photo) {
      content.push({
        type: "image_url",
        image_url: { url: data.photo },
      });
    }

    const parsed = await grokJson(
      [
        {
          role: "system",
          content:
            "Assistant SIPP belge. Réponds uniquement en JSON valide, sans markdown. Méthode Kinney (P×E×G).",
        },
        { role: "user", content },
      ],
      700,
    );

    if (!parsed || typeof parsed !== "object") {
      return { ok: true, draft: fallback, source: "local" };
    }
    const o = parsed as Record<string, unknown>;
    const theme = asTheme(o.theme);
    const P = nearestOption(PROBABILITY, Number(o.P) || fallback.kinney.P);
    const E = nearestOption(EXPOSURE, Number(o.E) || fallback.kinney.E);
    const G = nearestOption(GRAVITY, Number(o.G) || fallback.kinney.G);
    const urgency = asUrgency(o.urgency);
    const location = String(o.zone || o.location || fallback.location).slice(0, 80);
    const description = String(o.danger || o.description || fallback.description).slice(0, 800);
    const correctiveAction = String(o.correctiveAction || fallback.correctiveAction).slice(0, 500);
    return {
      ok: true,
      source: "ai",
      draft: {
        title: String(o.title || fallback.title).slice(0, 120),
        location,
        description,
        theme,
        urgency,
        kinney: buildKinney(P, E, G),
        kinneyWhy: {
          Pwhy: String(o.Pwhy || fallback.kinneyWhy?.Pwhy || "").slice(0, 280),
          Ewhy: String(o.Ewhy || fallback.kinneyWhy?.Ewhy || "").slice(0, 280),
          Gwhy: String(o.Gwhy || fallback.kinneyWhy?.Gwhy || "").slice(0, 280),
          legal: String(o.legalRef || fallback.kinneyWhy?.legal || defaultKinneyWhy(theme, urgency).legal),
        },
        legalRef: String(o.legalRef || fallback.legalRef || ""),
        correctiveAction,
      },
    };
  });

export const analyzeFds = createServerFn({ method: "POST" })
  .validator((input: AnalyzeFdsInput) => input)
  .handler(async ({ data }): Promise<
    | { ok: true; notice: Omit<FdsNotice, "id" | "createdAt" | "workspaceId">; source: "ai" | "local" }
    | { ok: false; error: string }
  > => {
    const parsed = await grokJson(
      [
        {
          role: "system",
          content:
            "Expert FDS / CLP belge. Extraire l'étiquette chimique. Réponds uniquement en JSON valide.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyse cette étiquette de produit chimique. JSON strict:
{
  "productName": "",
  "manufacturer": "",
  "pictograms": ["GHS01"..."GHS09"],
  "signalWord": "DANGER"|"ATTENTION",
  "hazards": ["Hxxx — ..."],
  "ppe": ["gants", "lunettes", ...],
  "firstAid": "1-2 phrases",
  "notice": ["ligne1","ligne2","ligne3","ligne4","ligne5"],
  "reality": {
    "products": "produit vu sur l'étiquette (ou vide)",
    "hazards": "dangers lisibles (ou vide)",
    "exposed": "",
    "duration": "",
    "prevention": "EPI / ventilation / mesures lues (ou vide)",
    "themes": ["fds","etiquettes_clp","ventilation","epi","protection_collective"]
  }
}
La notice (5 lignes) est une consigne de poste ultra-simple pour un ouvrier, en français de Belgique.
Les champs reality sont des AIDE-MÉMOIRE facultatifs pour le conseiller (questions « La réalité »). Ne rien inventer pour « qui est exposé » ni « combien de temps » si ce n'est pas sur l'étiquette — laisser une chaîne vide.`,
            },
            { type: "image_url", image_url: { url: data.photo } },
          ],
        },
      ],
      1000,
    );

    if (!parsed || typeof parsed !== "object") {
      return {
        ok: false,
        error: "Analyse indisponible. Réessayez ou saisissez la notice manuellement.",
      };
    }
    const o = parsed as Record<string, unknown>;
    const notice = Array.isArray(o.notice)
      ? o.notice.map((x) => String(x)).slice(0, 5)
      : [];
    while (notice.length < 5) notice.push("");
    const pictograms = asGhs(o.pictograms);
    const ppe = Array.isArray(o.ppe) ? o.ppe.map((x) => String(x)).slice(0, 8) : [];
    const hazards = Array.isArray(o.hazards) ? o.hazards.map((x) => String(x)).slice(0, 8) : [];
    const parsedReality = parseReality(o.reality);
    const reality = parsedReality
      ? {
          ...parsedReality,
          themes:
            parsedReality.themes?.length
              ? parsedReality.themes
              : suggestThemes({ pictograms, ppe, notice, hazards }),
        }
      : { themes: suggestThemes({ pictograms, ppe, notice, hazards }) };
    return {
      ok: true,
      source: "ai",
      notice: {
        productName: String(o.productName || "Produit non identifié").slice(0, 80),
        manufacturer: o.manufacturer ? String(o.manufacturer).slice(0, 80) : undefined,
        photo: data.photo,
        pictograms,
        signalWord: String(o.signalWord).toUpperCase() === "ATTENTION" ? "ATTENTION" : "DANGER",
        hazards,
        ppe,
        firstAid: String(o.firstAid || "").slice(0, 280),
        notice,
        reality,
      },
    };
  });
