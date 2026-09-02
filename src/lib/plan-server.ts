import type { Sql } from "./db";

/**
 * Accès Pro gratuit à vie du propriétaire — vérifié CÔTÉ SERVEUR uniquement.
 * Cette constante n'est jamais envoyée au navigateur (ce module est server-only,
 * importé seulement par `plan-api.ts` / le webhook).
 */
export const OWNER_EMAILS = ["phpiheyns@hotmail.com"];

export function isOwnerEmail(email?: string | null): boolean {
  const e = (email ?? "").trim().toLowerCase();
  return e !== "" && OWNER_EMAILS.includes(e);
}

export type ServerPlan = "trial" | "basic" | "pro" | "expired";

export type PlanResult = {
  plan: ServerPlan;
  trialEndsAt: string | null;
  owner: boolean;
};

type BillingRow = {
  plan: string;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

const TRIAL_DAYS = 30;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Forfait effectif d'un utilisateur : propriétaire -> `pro` ; sinon la ligne
 * `sipr_billing` ; sinon un essai de 30 jours à partir d'aujourd'hui.
 */
export async function resolveServerPlan(
  sql: Sql,
  userId: string,
  email: string | null,
): Promise<PlanResult> {
  if (isOwnerEmail(email)) {
    return { plan: "pro", trialEndsAt: null, owner: true };
  }

  const rows = await sql<BillingRow>`
    select plan, trial_ends_at, stripe_customer_id, stripe_subscription_id
    from sipr_billing where user_id = ${userId} limit 1
  `;
  const row = rows[0];
  const today = new Date().toISOString().slice(0, 10);

  if (!row) {
    // Pas encore de ligne : essai depuis aujourd'hui.
    return { plan: "trial", trialEndsAt: addDays(today, TRIAL_DAYS), owner: false };
  }

  if (row.plan === "basic" || row.plan === "pro") {
    return { plan: row.plan, trialEndsAt: null, owner: false };
  }

  const trialEndsAt = row.trial_ends_at ?? addDays(today, TRIAL_DAYS);
  return {
    plan: today <= trialEndsAt ? "trial" : "expired",
    trialEndsAt,
    owner: false,
  };
}

/** Écrit / met à jour la ligne de forfait (webhook Stripe + confirmation paiement). */
export async function writeServerPlan(
  sql: Sql,
  input: {
    userId: string;
    plan: ServerPlan;
    trialEndsAt?: string | null;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
  },
): Promise<void> {
  await sql`
    insert into sipr_billing
      (user_id, plan, trial_ends_at, stripe_customer_id, stripe_subscription_id, updated_at)
    values (
      ${input.userId}, ${input.plan}, ${input.trialEndsAt ?? null},
      ${input.stripeCustomerId ?? null}, ${input.stripeSubscriptionId ?? null}, now()
    )
    on conflict (user_id) do update set
      plan = excluded.plan,
      trial_ends_at = coalesce(excluded.trial_ends_at, sipr_billing.trial_ends_at),
      stripe_customer_id = coalesce(excluded.stripe_customer_id, sipr_billing.stripe_customer_id),
      stripe_subscription_id = coalesce(excluded.stripe_subscription_id, sipr_billing.stripe_subscription_id),
      updated_at = now()
  `;
}

/** Retrouve l'utilisateur par son id client Stripe (webhook). */
export async function userIdByStripeCustomer(
  sql: Sql,
  customerId: string,
): Promise<string | null> {
  const rows = await sql<{ user_id: string }>`
    select user_id from sipr_billing where stripe_customer_id = ${customerId} limit 1
  `;
  return rows[0]?.user_id ?? null;
}
