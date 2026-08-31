import Stripe from "stripe";
import { PLAN_CATALOG, type PaidTier } from "./plan";

/**
 * Stripe secret key — server-only, read from the environment. Set
 * `STRIPE_SECRET_KEY` in the deployment platform's env (Vercel → Project →
 * Settings → Environment Variables). Never hard-code a key here: this file is
 * bundled server-side and the repo is shared.
 */
function secret(): string {
  const env = (process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (!env.startsWith("sk_")) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to the deployment environment.",
    );
  }
  return env;
}

export function getStripe(): Stripe {
  return new Stripe(secret());
}

export async function ensureMonthlyPrice(stripe: Stripe, tier: PaidTier): Promise<string> {
  const spec = PLAN_CATALOG[tier];
  const envKey = tier === "pro" ? process.env.STRIPE_PRICE_ID : process.env.STRIPE_PRICE_ID_BASIC;
  if (envKey?.startsWith("price_")) return envKey;
  const prices = await stripe.prices.list({ active: true, limit: 80 });
  const found = prices.data.find(
    (p) =>
      p.nickname === spec.nickname ||
      (p.unit_amount === spec.cents && p.currency === "eur" && p.recurring?.interval === "month"),
  );
  if (found) return found.id;
  const product = await stripe.products.create({
    name: spec.product,
    description: spec.blurb,
  });
  const price = await stripe.prices.create({
    product: product.id,
    currency: "eur",
    unit_amount: spec.cents,
    recurring: { interval: "month" },
    nickname: spec.nickname,
  });
  return price.id;
}

export function tierFromStripe(nickname?: string | null, metadataPlan?: string | null): PaidTier {
  const raw = `${metadataPlan ?? ""} ${nickname ?? ""}`.toLowerCase();
  if (raw.includes("basic") || raw.includes("9,99") || raw.includes("999")) return "basic";
  return "pro";
}
