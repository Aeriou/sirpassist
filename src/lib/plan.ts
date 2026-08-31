import { addDays, isoDay } from "./format";
import type { Anomaly, RpsSituation, SiprUser } from "./types";

export const GUEST_LIMIT = 5;
export const TRIAL_DAYS = 30;

export const PLAN_CATALOG = {
  basic: {
    id: "basic" as const,
    name: "Basic",
    cents: 999,
    label: "9,99 € / mois",
    nickname: "siprassist-basic-monthly",
    product: "SiprAssist Basic",
    blurb: "Terrain : signalements, visites, cloud.",
    features: [
      "Signalements et visites illimités",
      "Photos horodatées, GPS, signatures",
      "Copie cloud PC / smartphone (1 espace)",
      "Fiches FDS",
    ],
  },
  pro: {
    id: "pro" as const,
    name: "Pro",
    cents: 1500,
    label: "15 € / mois",
    nickname: "siprassist-pro-monthly",
    product: "SiprAssist Pro",
    blurb: "SIPP complet : RPS, PGP, plusieurs sites.",
    features: [
      "Tout Basic",
      "Analyses RPS collectives",
      "PGP, PAA et tableau de bord",
      "Plusieurs espaces (sites / groupe)",
      "Rappels N1–N3 et conflits terrain / bureau",
    ],
  },
} as const;

export type PaidTier = keyof typeof PLAN_CATALOG;
export const PLAN_PRICE_LABEL = "dès 9,99 € / mois";

const ADMIN_EMAILS = ["phpiheyns@hotmail.com"];

export function isAdminEmail(email?: string): boolean {
  return Boolean(email && ADMIN_EMAILS.includes(email.trim().toLowerCase()));
}

export type PlanStatus = "guest" | "trial" | "basic" | "pro" | "expired";

export type PlanView = {
  status: PlanStatus;
  admin: boolean;
  canRecord: boolean;
  canRps: boolean;
  canPgp: boolean;
  canMulti: boolean;
  remaining: number;
  trialEndsAt?: string;
  usage: number;
};

export function trialEndFrom(createdAt: string, from = isoDay()): string {
  const start = (createdAt || from).slice(0, 10);
  return addDays(start, TRIAL_DAYS);
}

export function usageCount(anomalies: Anomaly[], rps: RpsSituation[]): number {
  return anomalies.filter((a) => !a.demo).length + rps.filter((r) => !r.demo).length;
}

export function planView(session: SiprUser | undefined, usage: number, today = isoDay()): PlanView {
  const full = {
    admin: false,
    canRecord: true,
    canRps: true,
    canPgp: true,
    canMulti: true,
    remaining: Number.POSITIVE_INFINITY,
    usage,
  };
  if (!session) {
    const remaining = Math.max(0, GUEST_LIMIT - usage);
    return {
      status: "guest",
      admin: false,
      canRecord: remaining > 0,
      canRps: remaining > 0,
      canPgp: false,
      canMulti: false,
      remaining,
      usage,
    };
  }
  if (isAdminEmail(session.email)) {
    return { status: "pro", ...full, admin: true };
  }
  if (session.plan === "pro") return { status: "pro", ...full };
  if (session.plan === "basic") {
    return {
      status: "basic",
      admin: false,
      canRecord: true,
      canRps: false,
      canPgp: false,
      canMulti: false,
      remaining: Number.POSITIVE_INFINITY,
      usage,
    };
  }
  const trialEndsAt = session.trialEndsAt || trialEndFrom(session.createdAt, today);
  if (today <= trialEndsAt) {
    return { status: "trial", trialEndsAt, ...full };
  }
  return {
    status: "expired",
    admin: false,
    canRecord: false,
    canRps: false,
    canPgp: false,
    canMulti: false,
    remaining: 0,
    trialEndsAt,
    usage,
  };
}

export function planHeadline(view: PlanView): string {
  if (view.status === "pro") return "Forfait Pro — SIPP complet";
  if (view.status === "basic") return "Forfait Basic — terrain";
  if (view.status === "trial" && view.trialEndsAt) {
    return `Essai Pro offert jusqu'au ${formatFr(view.trialEndsAt)}`;
  }
  if (view.status === "expired") return "Essai terminé — Basic 9,99 € ou Pro 15 € / mois";
  return `${view.remaining} enregistrement${view.remaining > 1 ? "s" : ""} gratuit${view.remaining > 1 ? "s" : ""} restant${view.remaining > 1 ? "s" : ""} (5 max sans compte)`;
}

function formatFr(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function blockedMessage(view: PlanView): string {
  if (view.status === "expired") {
    return "Le mois d'essai est terminé. Basic (terrain) 9,99 € / mois, ou Pro (SIPP complet) 15 € / mois.";
  }
  if (view.status === "basic") {
    return "Inclus dans Pro (15 € / mois) : analyses RPS, PGP et PAA.";
  }
  return "Limite atteinte (5 sans compte). Créez un compte : 1er mois offert, puis Basic 9,99 € ou Pro 15 € / mois.";
}
