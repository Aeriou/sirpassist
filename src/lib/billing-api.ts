import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { vBool, vOneOf, vReqStr, vStr, vStrArr } from "@/lib/validate";
import type { Sql } from "./db";
import type { PaidTier } from "./plan";

function originOf(raw: string) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    return u.origin;
  } catch {
    return "";
  }
}

async function getSqlClient(): Promise<Sql> {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

async function emailOf(sql: Sql, userId: string): Promise<string> {
  const rows = await sql<{ email: string | null }>`
    select email from "user" where id = ${userId} limit 1
  `;
  return (rows[0]?.email ?? "").trim().toLowerCase();
}

export const startCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  // userId + email viennent de la SESSION vérifiée, jamais du client.
  .validator((input: { origin: string; workspaceId: string; plan: PaidTier }) => ({ origin: vStr(input.origin, 300), workspaceId: vStr(input.workspaceId, 64), plan: vOneOf(input.plan, ["basic", "pro"] as const, "pro") }))
  .handler(async ({ data, context }) => {
    const origin = originOf(data.origin);
    if (!origin) return { ok: false as const, error: "Origine invalide." };
    const sql = await getSqlClient();
    const email = await emailOf(sql, context.userId);
    if (!email.includes("@")) return { ok: false as const, error: "Compte sans e-mail." };
    const plan: PaidTier = data.plan === "basic" ? "basic" : "pro";
    const workspaceId = String(data.workspaceId ?? "").slice(0, 64);
    try {
      const { getStripe, ensureMonthlyPrice } = await import("./stripe.server");
      const stripe = getStripe();
      const price = await ensureMonthlyPrice(stripe, plan);
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        locale: "fr",
        customer_email: email,
        client_reference_id: context.userId,
        line_items: [{ price, quantity: 1 }],
        success_url: `${origin}/compte?billing=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/compte?billing=cancel`,
        allow_promotion_codes: true,
        billing_address_collection: "auto",
        subscription_data: {
          metadata: { userId: context.userId, workspaceId, email, plan },
        },
        metadata: { userId: context.userId, workspaceId, email, plan },
      });
      if (!session.url) return { ok: false as const, error: "Session Stripe sans URL." };
      return { ok: true as const, url: session.url };
    } catch {
      return { ok: false as const, error: "Stripe indisponible." };
    }
  });

export const confirmCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { sessionId: string }) => ({ sessionId: vReqStr(input.sessionId, 100) }))
  .handler(async ({ data, context }) => {
    const sessionId = data.sessionId.trim();
    if (!sessionId.startsWith("cs_")) return { ok: false as const, error: "Session inconnue." };
    try {
      const { getStripe, tierFromStripe } = await import("./stripe.server");
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["subscription", "subscription.items.data.price", "customer"],
      });

      // La session Stripe doit appartenir au compte connecté.
      const owner = session.client_reference_id ?? session.metadata?.userId ?? null;
      if (owner && owner !== context.userId) {
        return { ok: false as const, error: "Cette session de paiement n'est pas la vôtre." };
      }

      const paid = session.payment_status === "paid" || session.status === "complete";
      const sub = session.subscription;
      const subId = typeof sub === "string" ? sub : sub?.id;
      const status = typeof sub === "object" && sub && "status" in sub ? sub.status : undefined;
      const active = status === "active" || status === "trialing" || paid;
      if (!active || !subId) {
        return { ok: false as const, error: "Paiement non confirmé." };
      }
      const customer = session.customer;
      const customerId = typeof customer === "string" ? customer : customer?.id;
      const nickname =
        typeof sub === "object" && sub && "items" in sub
          ? sub.items.data[0]?.price?.nickname
          : undefined;
      const plan = tierFromStripe(nickname, session.metadata?.plan);

      try {
        const { writeServerPlan } = await import("@/lib/plan-server");
        await writeServerPlan(await getSqlClient(), {
          userId: context.userId,
          plan,
          stripeCustomerId: customerId ?? null,
          stripeSubscriptionId: subId,
        });
      } catch {
        /* le webhook rattrapera */
      }

      return {
        ok: true as const,
        plan,
        subscriptionId: subId,
        customerId: customerId ?? "",
        email: (session.customer_email ?? "").toLowerCase(),
      };
    } catch {
      return { ok: false as const, error: "Vérification Stripe impossible." };
    }
  });

export const startBillingPortal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  // L'id client Stripe vient de `sipr_billing` pour CE compte, jamais du client.
  .validator((input: { origin: string }) => ({ origin: vStr(input.origin, 300) }))
  .handler(async ({ data, context }) => {
    const origin = originOf(data.origin);
    if (!origin) return { ok: false as const, error: "Portail de facturation indisponible." };
    const { stripeCustomerIdOf } = await import("@/lib/plan-server");
    const customerId = await stripeCustomerIdOf(await getSqlClient(), context.userId);
    if (!customerId) {
      return { ok: false as const, error: "Aucun abonnement Stripe sur ce compte." };
    }
    try {
      const { getStripe } = await import("./stripe.server");
      const stripe = getStripe();
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${origin}/compte`,
      });
      return { ok: true as const, url: portal.url };
    } catch {
      return { ok: false as const, error: "Portail Stripe indisponible." };
    }
  });
