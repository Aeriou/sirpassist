/**
 * Gardes de validation runtime pour les `createServerFn().validator()`.
 * Pas de dépendance schéma — juste des coercions sûres. Sur entrée douteuse :
 * on normalise (chaîne vide, tableau vide…) ou on lève `BadInputError`.
 */
export class BadInputError extends Error {
  readonly status = 400;
  constructor(msg = "Requête invalide.") {
    super(msg);
    this.name = "BadInputError";
  }
}

export function vStr(x: unknown, max = 10_000): string {
  return typeof x === "string" ? x.slice(0, max) : "";
}

export function vReqStr(x: unknown, max = 10_000): string {
  if (typeof x !== "string" || x.length === 0) throw new BadInputError();
  return x.slice(0, max);
}

/** true UNIQUEMENT si `x === true`. */
export function vBool(x: unknown): boolean {
  return x === true;
}

export function vFiniteNum(x: unknown): number {
  const n = typeof x === "number" ? x : Number(x);
  if (!Number.isFinite(n)) throw new BadInputError();
  return n;
}

export function vIntInRange(x: unknown, min: number, max: number, fallback: number): number {
  const n = typeof x === "number" ? x : Number(x);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  return i < min ? min : i > max ? max : i;
}

export function vOneOf<T extends string>(x: unknown, allowed: readonly T[], fallback: T): T {
  return typeof x === "string" && (allowed as readonly string[]).includes(x) ? (x as T) : fallback;
}

export function vStrArr(x: unknown, maxLen: number, maxItemLen = 500_000): string[] {
  if (!Array.isArray(x)) return [];
  return x.filter((v) => typeof v === "string").slice(0, maxLen).map((v) => v.slice(0, maxItemLen));
}

export function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

export function vObject(x: unknown, maxJsonBytes = 15_000_000): Record<string, unknown> {
  if (!isPlainObject(x)) throw new BadInputError();
  if (JSON.stringify(x).length > maxJsonBytes) throw new BadInputError("Charge utile trop volumineuse.");
  return x;
}
