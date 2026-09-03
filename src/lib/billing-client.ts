import { toast } from "sonner";
import { startBillingPortal, startCheckout } from "@/lib/billing-api";
import type { PaidTier } from "@/lib/plan";
import type { SiprUser } from "@/lib/types";

export async function subscribeWithStripe(user: SiprUser, plan: PaidTier) {
  // e-mail / userId ne sont plus transmis : le serveur les prend de la session.
  const res = await startCheckout({
    data: {
      origin: window.location.origin,
      workspaceId: user.homeWorkspaceId ?? user.workspaceId,
      plan,
    },
  });
  if (!res.ok) {
    toast.error(res.error);
    return;
  }
  window.location.assign(res.url);
}

export async function openStripePortal() {
  const res = await startBillingPortal({ data: { origin: window.location.origin } });
  if (!res.ok) {
    toast.error(res.error);
    return;
  }
  window.location.assign(res.url);
}
