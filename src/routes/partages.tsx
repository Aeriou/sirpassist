import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Inbox, Send } from "lucide-react";
import { AuthPanel } from "@/components/auth-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { authClient } from "@/lib/auth/client";
import {
  apiCancelShare,
  apiListIncomingShares,
  apiListOutgoingShares,
  apiRespondShare,
} from "@/lib/share-api";
import type { ShareRow } from "@/lib/share-db";
import { isSharePayloadV1 } from "@/lib/share-payload";
import { useSipr } from "@/lib/store";
import { formatStamp } from "@/lib/format";

export const Route = createFileRoute("/partages")({ component: PartagesPage });

const STATUS_LABEL: Record<string, string> = {
  pending: "En attente",
  accepted: "Accepté",
  declined: "Refusé",
  cancelled: "Annulé",
};

function stamp(iso: string): string {
  try {
    return formatStamp(new Date(iso));
  } catch {
    return iso;
  }
}

function PartagesPage() {
  const { data: session, isPending } = authClient.useSession();
  const navigate = useNavigate();
  const importSharedPayload = useSipr((s) => s.importSharedPayload);
  const [incoming, setIncoming] = useState<ShareRow[]>([]);
  const [outgoing, setOutgoing] = useState<ShareRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [inc, out] = await Promise.all([
        apiListIncomingShares(),
        apiListOutgoingShares(),
      ]);
      if (inc.ok) setIncoming(inc.offers);
      if (out.ok) setOutgoing(out.offers);
    } catch {
      /* réseau : on retentera au prochain tick */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isPending || !session?.user) return;
    void refresh();
    const t = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(t);
  }, [isPending, session?.user, refresh]);

  async function respond(offer: ShareRow, accept: boolean) {
    setActing(offer.id);
    try {
      const res = await apiRespondShare({ data: { offerId: offer.id, accept } });
      if (!res.ok) {
        toast.error("Proposition introuvable (déjà traitée ?).");
        void refresh();
        return;
      }
      if (accept && res.payload && isSharePayloadV1(res.payload)) {
        const { visitId } = importSharedPayload(res.payload, { threadId: offer.thread_id });
        toast.success(`« ${offer.title} » importé dans vos dossiers.`);
        void refresh();
        navigate({ to: "/visite/$id", params: { id: visitId } });
        return;
      }
      toast.message(accept ? "Proposition acceptée." : "Proposition refusée.");
      void refresh();
    } catch {
      toast.error("Action impossible (réseau).");
    } finally {
      setActing(null);
    }
  }

  async function cancel(offer: ShareRow) {
    setActing(offer.id);
    try {
      const res = await apiCancelShare({ data: { offerId: offer.id } });
      if (!res.ok) toast.error("Trop tard — la proposition n'est plus en attente.");
      else toast.message("Proposition annulée.");
      void refresh();
    } catch {
      toast.error("Action impossible (réseau).");
    } finally {
      setActing(null);
    }
  }

  if (!isPending && !session?.user) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="font-display text-2xl font-semibold md:hidden">Partages</h1>
          <p className="text-sm text-muted">
            Connectez-vous pour recevoir et envoyer des dossiers entre conseillers.
          </p>
        </header>
        <AuthPanel showSignOut={false} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold md:hidden">Partages</h1>
        <p className="text-sm text-muted">
          Propositions de dossiers et de constats entre conseillers. Rien n'entre dans vos
          données sans votre acceptation.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Inbox className="size-4 text-accent" />
          Reçus{incoming.length > 0 ? ` (${incoming.length})` : ""}
        </h2>
        {loading ? (
          <p className="text-sm text-muted">Chargement…</p>
        ) : incoming.length === 0 ? (
          <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted shadow-[var(--shadow-border)]">
            Aucune proposition en attente.
          </p>
        ) : (
          <ul className="space-y-2">
            {incoming.map((o) => (
              <li key={o.id}>
                <Card className="space-y-2 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{o.kind === "visit" ? "Dossier" : "Constat"}</Badge>
                    {o.reply_to ? <Badge tone="mid">Retour</Badge> : null}
                    <span className="text-xs text-subtle">{stamp(o.created_at)}</span>
                  </div>
                  <p className="text-sm font-medium">{o.title}</p>
                  {o.summary ? <p className="text-sm text-muted">{o.summary}</p> : null}
                  <p className="text-xs text-subtle">
                    De {o.from_name || o.from_email}
                    {o.from_name ? ` · ${o.from_email}` : ""}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm"
                      onClick={() => void respond(o, true)}
                      disabled={acting === o.id}
                    >
                      Accepter
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void respond(o, false)}
                      disabled={acting === o.id}
                    >
                      Refuser
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Send className="size-4 text-accent" />
          Envoyés
        </h2>
        {outgoing.length === 0 ? (
          <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted shadow-[var(--shadow-border)]">
            Vous n'avez encore rien partagé. Le bouton « Partager » est sur chaque dossier et
            chaque constat.
          </p>
        ) : (
          <ul className="space-y-2">
            {outgoing.map((o) => (
              <li key={o.id}>
                <Card className="space-y-1 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={o.status === "accepted" ? "low" : o.status === "pending" ? "mid" : "neutral"}>
                      {STATUS_LABEL[o.status] ?? o.status}
                    </Badge>
                    <Badge tone="neutral">{o.kind === "visit" ? "Dossier" : "Constat"}</Badge>
                    <span className="text-xs text-subtle">{stamp(o.created_at)}</span>
                  </div>
                  <p className="text-sm font-medium">{o.title}</p>
                  <p className="text-xs text-subtle">Pour {o.to_email}</p>
                  {o.status === "pending" ? (
                    <div className="pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void cancel(o)}
                        disabled={acting === o.id}
                      >
                        Annuler
                      </Button>
                    </div>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
