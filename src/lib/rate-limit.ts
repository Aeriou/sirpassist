/**
 * Limitation de débit à fenêtre fixe, adossée à Postgres. Logique pure —
 * testée dans `scripts/dryrun-rate-limit.mts`.
 */
import type { Sql } from "./db";

export type RateResult = { ok: true } | { ok: false; retryAfter: number };

/**
 * Incrémente le compteur (bucket, subject) pour la fenêtre courante et dit si
 * la limite est dépassée. Atomique via `insert … on conflict … do update`.
 * Purge opportuniste des fenêtres anciennes (~2 % des appels).
 */
export async function hitRateLimit(
  sql: Sql,
  opts: { bucket: string; subject: string; limit: number; windowSec: number },
): Promise<RateResult> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % opts.windowSec);

  const rows = await sql<{ count: number }>`
    insert into rate_limit (bucket, subject, window_start, count)
    values (${opts.bucket}, ${opts.subject}, ${windowStart}, 1)
    on conflict (bucket, subject, window_start)
    do update set count = rate_limit.count + 1
    returning count
  `;
  const count = rows[0]?.count ?? 1;

  if (Math.random() < 0.02) {
    try {
      await sql`delete from rate_limit where window_start < ${now - 24 * 3600}`;
    } catch {
      /* purge best-effort */
    }
  }

  if (count > opts.limit) {
    return { ok: false, retryAfter: windowStart + opts.windowSec - now };
  }
  return { ok: true };
}

/** Adresse IP du client (endpoints publics), sinon "unknown". */
export function clientIpFrom(headers: Headers | undefined | null): string {
  if (!headers) return "unknown";
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim().slice(0, 45) || "unknown";
  return headers.get("x-real-ip")?.slice(0, 45) || "unknown";
}
