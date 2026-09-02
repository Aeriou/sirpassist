import type { Kinney, RiskLevel } from "./kinney";
import type { ThemeId } from "./code-bien-etre";

export type AdvisorLevel = 1 | 2 | 3;
export type VisitStatus = "en_cours" | "terminee";
export type AnomalyStatus = "brouillon" | "ouverte" | "validee" | "en_cours" | "cloturee";
export type Urgency = "basse" | "moyenne" | "haute" | "critique";
export type AccountKind = "entreprise" | "independant";
export type GhsCode =
  | "GHS01"
  | "GHS02"
  | "GHS03"
  | "GHS04"
  | "GHS05"
  | "GHS06"
  | "GHS07"
  | "GHS08"
  | "GHS09";

export type RecordAuthor = {
  userId?: string;
  name: string;
  title: string;
  level: AdvisorLevel;
};

export type Workspace = {
  id: string;
  kind: AccountKind;
  name: string;
  code: string;
  createdAt: string;
};

export type SiprPlan = "trial" | "basic" | "pro";

export type SiprUser = {
  id: string;
  name: string;
  email: string;
  title: string;
  level: AdvisorLevel;
  organisation: string;
  kind: AccountKind;
  workspaceId: string;
  salt: string;
  passwordHash: string;
  createdAt: string;
  plan?: SiprPlan;
  trialEndsAt?: string;
  proSince?: string;
  homeWorkspaceId?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  totpSecret?: string;
  totpEnabled?: boolean;
  totpBackupHashes?: string[];
};

export type Profile = {
  name: string;
  title: string;
  level: AdvisorLevel;
  organisation: string;
  kind?: AccountKind;
  workspaceId?: string;
};

export type GeoFix = {
  lat: number;
  lng: number;
  accuracy?: number;
  address?: string;
  capturedAt: string;
};

export type Place = {
  street: string;
  number: string;
  postcode: string;
  city: string;
  country: string;
  building: string;
  house: string;
  floor: string;
  unit: string;
  room: string;
  extra: string;
  lat?: number;
  lng?: number;
  label: string;
  verified: boolean;
  source?: "gps" | "map" | "search" | "manual";
};

export type KinneyJustification = {
  Pwhy: string;
  Ewhy: string;
  Gwhy: string;
  legal: string;
};

export type VoiceSections = {
  danger: string;
  measure: string;
  zone: string;
};

export type VisitSignature = {
  role: "conseiller" | "site";
  name: string;
  dataUrl: string;
  signedAt: string;
};

export type Visit = {
  id: string;
  name: string;
  company: string;
  site: string;
  interlocutor: string;
  date: string;
  status: VisitStatus;
  coverPhoto?: string;
  notes?: string;
  geo?: GeoFix;
  place?: Place;
  signatures?: VisitSignature[];
  workspaceId: string;
  demo?: boolean;
};

export type Anomaly = {
  id: string;
  visitId: string;
  photo?: string;
  title: string;
  location: string;
  description: string;
  transcription?: string;
  theme: ThemeId;
  urgency: Urgency;
  kinney: Kinney;
  kinneyWhy?: KinneyJustification;
  voice?: VoiceSections;
  geo?: GeoFix;
  capturedAt?: string;
  legalRef?: string;
  status: AnomalyStatus;
  correctiveAction: string;
  assignedTo?: string;
  dueDate?: string;
  createdAt: string;
  author?: RecordAuthor;
  workspaceId: string;
  demo?: boolean;
};

export type FdsRealityTheme =
  | "fds"
  | "etiquettes_clp"
  | "ventilation"
  | "epi"
  | "protection_collective";

/** Optional workplace checklist after a product photo — none of the fields are required. */
export type FdsReality = {
  products?: string;
  hazards?: string;
  exposed?: string;
  duration?: string;
  prevention?: string;
  themes?: FdsRealityTheme[];
};

export type FdsNotice = {
  id: string;
  productName: string;
  manufacturer?: string;
  photo?: string;
  pictograms: GhsCode[];
  signalWord: "DANGER" | "ATTENTION";
  hazards: string[];
  ppe: string[];
  firstAid: string;
  notice: string[];
  createdAt: string;
  workspaceId: string;
  visitId?: string;
  reality?: FdsReality;
  demo?: boolean;
};

export type PgpStatus = "brouillon" | "cppt" | "valide";
export type PaaLineStatus = "retenue" | "reportee" | "realisee";
export type Quarter = "Q1" | "Q2" | "Q3" | "Q4";

export type PgpObjective = {
  theme: ThemeId;
  goal: string;
  indicator: string;
  enabled: boolean;
};

export type PaaLine = {
  id: string;
  anomalyId?: string;
  title: string;
  theme: ThemeId;
  measure: string;
  owner: string;
  dueDate?: string;
  quarter: Quarter;
  budget: number;
  included: boolean;
  status: PaaLineStatus;
  origin: "visite" | "pgp" | "rps";
  level: AdvisorLevel;
  demo?: boolean;
  rpsId?: string;
};

export type PgpPlan = {
  company: string;
  employer: string;
  workers: number;
  sipp: string;
  physician: string;
  pgpStart: number;
  pgpEnd: number;
  paaYear: number;
  cpptDate: string;
  budget: number;
  status: PgpStatus;
  notes: string;
  objectives: PgpObjective[];
  lines: PaaLine[];
};

export type { Kinney, RiskLevel, ThemeId };

export type RpsDimensionId = "charge" | "relais" | "roles" | "reconnaissance" | "climat" | "moyens";
export type RpsScore = 0 | 1 | 2 | 3;
export type RpsAttention = "veille" | "attention" | "intervention" | "urgence";
export type RpsStatus = "ouverte" | "en_cours" | "reevaluee" | "cloturee";

export type RpsSituation = {
  id: string;
  title: string;
  unit: string;
  facts: string;
  scores: Record<RpsDimensionId, RpsScore>;
  attention: RpsAttention;
  diagnosis: string;
  measures: string[];
  avoid: string[];
  visitId?: string;
  status: RpsStatus;
  createdAt: string;
  reviewedAt?: string;
  workspaceId: string;
  charterAccepted: boolean;
  demo?: boolean;
};

export type SupportKind = "bug" | "amelioration";
export type SupportStatus = "envoye" | "valide" | "refuse";

export type SupportTicket = {
  id: string;
  kind: SupportKind;
  title: string;
  description: string;
  page?: string;
  photos: string[];
  authorName: string;
  authorEmail: string;
  authorTitle: string;
  authorLevel: AdvisorLevel;
  organisation: string;
  workspaceName: string;
  createdAt: string;
  status: SupportStatus;
  reviewedAt?: string;
};

export type DeletedIds = {
  visits: string[];
  anomalies: string[];
  fds: string[];
  rps: string[];
  paa: string[];
};

export type WorkspaceCloudSnapshot = {
  v: 1;
  savedAt: string;
  workspace: Workspace;
  visits: Visit[];
  anomalies: Anomaly[];
  fds: FdsNotice[];
  rps: RpsSituation[];
  pgp: PgpPlan;
  users: SiprUser[];
  deleted?: DeletedIds;
};
