import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
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

export const startCheckout = createServerFn({ method: "POST" })
  .validator((input: { origin: string; email: string; userId: string; workspaceId: string; plan: PaidTier }) => input)
  .handler(async ({ data }) => {
    const origin = originOf(data.origin);
    const email = data.email.trim().toLowerCase();
    const plan: PaidTier = data.plan === "basic" ? "basic" : "pro";
    if (!origin) return { ok: false as const, error: "Origine invalide." };
    if (!email.includes("@")) return { ok: false as const, error: "E-mail du compte requis." };
    try {
      const { getStripe, ensureMonthlyPrice } = await import("./stripe.server");
      const stripe = getStripe();
      const price = await ensureMonthlyPrice(stripe, plan);
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        locale: "fr",
        customer_email: email,
        client_reference_id: data.userId,
        line_items: [{ price, quantity: 1 }],
        success_url: `${origin}/compte?billing=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/compte?billing=cancel`,
        allow_promotion_codes: true,
        billing_address_collection: "auto",
        subscription_data: {
          metadata: {
            userId: data.userId,
            workspaceId: data.workspaceId,
            email,
            plan,
          },
        },
        metadata: {
          userId: data.userId,
          workspaceId: data.workspaceId,
          email,
          plan,
        },
      });
      if (!session.url) return { ok: false as const, error: "Session Stripe sans URL." };
      return { ok: true as const, url: session.url };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "Stripe indisponible.",
      };
    }
  });

export const confirmCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { sessionId: string; email: string }) => input)
  .handler(async ({ data, context }) => {
    const sessionId = data.sessionId.trim();
    if (!sessionId.startsWith("cs_")) return { ok: false as const, error: "Session inconnue." };
    try {
      const { getStripe, tierFromStripe } = await import("./stripe.server");
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["subscription", "subscription.items.data.price", "customer"],
      });
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

      // Source de vérité serveur, immédiate (le webhook fait ensuite le suivi).
      try {
        const { getSql } = await import("@/lib/db");
        const { writeServerPlan } = await import("@/lib/plan-server");
        await writeServerPlan(await getSql(), {
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
        email: (session.customer_email || data.email).toLowerCase(),
      };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "Vérification Stripe impossible.",
      };
    }
  });

export const startBillingPortal = createServerFn({ method: "POST" })
  .validator((input: { origin: string; customerId: string }) => input)
  .handler(async ({ data }) => {
    const origin = originOf(data.origin);
    const customerId = data.customerId.trim();
    if (!origin || !customerId.startsWith("cus_")) {
      return { ok: false as const, error: "Portail de facturation indisponible." };
    }
    try {
      const { getStripe } = await import("./stripe.server");
      const stripe = getStripe();
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${origin}/compte`,
      });
      return { ok: true as const, url: portal.url };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "Portail Stripe indisponible.",
      };
    }
  });
