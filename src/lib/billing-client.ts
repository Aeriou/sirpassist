import { toast } from "sonner";
import { startBillingPortal, startCheckout } from "@/lib/billing-api";
import type { PaidTier } from "@/lib/plan";
import type { SiprUser } from "@/lib/types";

export async function subscribeWithStripe(user: SiprUser, plan: PaidTier) {
  const res = await startCheckout({
    data: {
      origin: window.location.origin,
      email: user.email,
      userId: user.id,
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

export async function openStripePortal(customerId: string) {
  const res = await startBillingPortal({
    data: { origin: window.location.origin, customerId },
  });
  if (!res.ok) {
    toast.error(res.error);
    return;
  }
  window.location.assign(res.url);
}
