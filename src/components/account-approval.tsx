import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import {
  apiDecideAccount,
  apiListPendingAccounts,
  apiMyAccountStatus,
} from "@/lib/account-api";
import type { PendingRow } from "@/lib/account-db";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

/** Bandeau affiché à un utilisateur dont le compte n'est pas encore validé. */
export function AccountPendingBanner() {
  const { data: session, isPending } = authClient.useSession();
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (isPending || !session?.user) return;
    let alive = true;
    const tick = () =>
      apiMyAccountStatus()
        .then((r) => {
          if (alive) setStatus(r.status);
        })
        .catch(() => {});
    tick();
    const t = window.setInterval(tick, 30_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [isPending, session?.user]);

  if (status !== "pending") return null;
  return (
    <p className="rounded-xl bg-warn/15 px-4 py-3 text-sm text-warn">
      Votre compte est en attente de validation par l'administrateur. Vous pouvez utiliser
      l'application ; le partage de dossiers entre comptes sera actif une fois votre compte validé.
    </p>
  );
}

/** Vu par le propriétaire uniquement : validation des nouveaux comptes. */
export function PendingAccountsAdmin() {
  const { data: session, isPending } = authClient.useSession();
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [recent, setRecent] = useState<PendingRow[]>([]);
  const [visible, setVisible] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await apiListPendingAccounts();
      if (!res.ok) {
        setVisible(false);
        return;
      }
      setVisible(true);
      setPending(res.pending);
      setRecent(res.recent);
    } catch {
      /* réseau */
    }
  }, []);

  useEffect(() => {
    if (isPending || !session?.user) return;
    void refresh();
    const t = window.setInterval(() => void refresh(), 20_000);
    return () => window.clearInterval(t);
  }, [isPending, session?.user, refresh]);

  if (!visible) return null;

  async function decide(row: PendingRow, approve: boolean) {
    setActing(row.user_id);
    try {
      const res = await apiDecideAccount({ data: { targetUserId: row.user_id, approve } });
      if (!res.ok) toast.error("Compte introuvable (déjà traité ?).");
      else toast.success(approve ? `Compte ${row.email} validé.` : `Compte ${row.email} refusé.`);
      void refresh();
    } catch {
      toast.error("Action impossible (réseau).");
    } finally {
      setActing(null);
    }
  }

  return (
    <Card className="space-y-3">
      <h2 className="flex items-center gap-2 font-display font-semibold">
        <ShieldCheck className="size-4 text-accent" />
        Nouveaux comptes à valider
      </h2>
      {pending.length === 0 ? (
        <p className="text-sm text-muted">Aucun compte en attente.</p>
      ) : (
        <ul className="space-y-2">
          {pending.map((row) => (
            <li
              key={row.user_id}
              className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.name || row.email}</p>
                <p className="truncate text-xs text-subtle">{row.email}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void decide(row, true)} disabled={acting === row.user_id}>
                  Valider
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void decide(row, false)}
                  disabled={acting === row.user_id}
                >
                  Refuser
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {recent.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium tracking-wide text-muted">Récemment traités</p>
          <ul className="space-y-1">
            {recent.map((row) => (
              <li key={row.user_id} className="flex items-center gap-2 text-xs text-subtle">
                <Badge tone={row.status === "approved" ? "low" : "neutral"}>
                  {row.status === "approved" ? "Validé" : "Refusé"}
                </Badge>
                <span className="truncate">{row.email}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
