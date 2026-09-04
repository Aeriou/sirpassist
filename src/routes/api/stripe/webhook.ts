import { createFileRoute } from "@tanstack/react-router";
import type Stripe from "stripe";

/**
 * Webhook Stripe — la SEULE source d'écriture continue du forfait.
 * Signature vérifiée avec `STRIPE_WEBHOOK_SECRET` ; sans cette variable, le
 * webhook refuse (500) plutôt que d'accepter des events non signés.
 *
 * À configurer une fois : Stripe Dashboard → Developers → Webhooks →
 * endpoint `https://sirpassist.vercel.app/api/stripe/webhook`, events
 * `checkout.session.completed`, `customer.subscription.updated`,
 * `customer.subscription.deleted`, `charge.refunded` → copier le
 * "Signing secret" dans `STRIPE_WEBHOOK_SECRET` (Vercel).
 *
 * `charge.refunded` : un remboursement coupe l'accès IMMÉDIATEMENT
 * (`plan = expired`) et annule l'abonnement pour qu'il ne se renouvelle pas.
 */
export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
        if (!secret) return new Response("webhook not configured", { status: 500 });

        const sig = request.headers.get("stripe-signature") ?? "";
        const body = await request.text();

        const { getStripe } = await import("@/lib/stripe.server");
        const stripe = getStripe();

        let event: Stripe.Event;
        try {
          event = await stripe.webhooks.constructEventAsync(body, sig, secret);
        } catch {
          return new Response("bad signature", { status: 400 });
        }

        const { getSql } = await import("@/lib/db");
        const { writeServerPlan, userIdByStripeCustomer, stripeSubscriptionIdOf } =
          await import("@/lib/plan-server");
        const sql = await getSql();

        const tierOf = (nickname?: string | null): "basic" | "pro" =>
          nickname && nickname.toLowerCase().includes("basic") ? "basic" : "pro";
        const idOf = (v: string | { id: string } | null | undefined): string | null =>
          typeof v === "string" ? v : (v?.id ?? null);

        try {
          if (event.type === "checkout.session.completed") {
            const s = event.data.object;
            const userId = s.client_reference_id ?? s.metadata?.userId ?? null;
            if (userId) {
              await writeServerPlan(sql, {
                userId,
                plan: s.metadata?.plan === "basic" ? "basic" : "pro",
                stripeCustomerId: idOf(s.customer),
                stripeSubscriptionId: idOf(s.subscription),
              });
            }
          } else if (event.type === "customer.subscription.deleted") {
            const sub = event.data.object;
            const userId = await userIdByStripeCustomer(sql, idOf(sub.customer) ?? "");
            if (userId) await writeServerPlan(sql, { userId, plan: "expired" });
          } else if (event.type === "customer.subscription.updated") {
            const sub = event.data.object;
            const userId = await userIdByStripeCustomer(sql, idOf(sub.customer) ?? "");
            if (userId) {
              const active = sub.status === "active" || sub.status === "trialing";
              await writeServerPlan(sql, {
                userId,
                plan: active ? tierOf(sub.items.data[0]?.price?.nickname) : "expired",
              });
            }
          } else if (event.type === "charge.refunded") {
            // Remboursement -> accès coupé tout de suite + abonnement annulé
            // (l'app ne vend que des abonnements, toute charge en est une).
            const charge = event.data.object;
            const userId = await userIdByStripeCustomer(sql, idOf(charge.customer) ?? "");
            if (userId) {
              await writeServerPlan(sql, { userId, plan: "expired" });
              try {
                const subId = await stripeSubscriptionIdOf(sql, userId);
                if (subId) await stripe.subscriptions.cancel(subId);
              } catch {
                /* abonnement déjà annulé / introuvable */
              }
            }
          }
        } catch {
          return new Response("handler error", { status: 500 });
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
