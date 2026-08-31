import { useSipr } from "./store";
import { planView, usageCount } from "./plan";

export function usePlan() {
  const sessionUserId = useSipr((s) => s.sessionUserId);
  const users = useSipr((s) => s.users);
  const anomalies = useSipr((s) => s.anomalies);
  const rps = useSipr((s) => s.rps);
  const session = users.find((u) => u.id === sessionUserId);
  return { session, view: planView(session, usageCount(anomalies, rps)) };
}
