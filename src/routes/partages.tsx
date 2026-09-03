import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Inbox, Send, Users } from "lucide-react";
import { AuthPanel } from "@/components/auth-panel";
import { AccountPendingBanner } from "@/components/account-approval";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { authClient } from "@/lib/auth/client";
import {
  apiCancelShare,
  apiListIncomingShares,
  apiListOutgoingShares,
  apiPreviewShare,
  apiRespondShare,
} from "@/lib/share-api";
import type { ShareRow } from "@/lib/share-db";
import { isSharePayloadV1, type SharePayloadV1 } from "@/lib/share-payload";
import type { SharedImportPlan } from "@/lib/share-merge";
import { apiListMyInvites, apiRespondInvite } from "@/lib/workspace-api";
import { GroupClasseursReceived } from "@/components/group-classeurs-received";
import { ShareImportDialog } from "@/components/share-import-dialog";
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
  const [pending, setPending] = useState<{ offer: ShareRow; payload: SharePayloadV1 } | null>(null);

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

  async function openImport(offer: ShareRow) {
    setActing(offer.id);
    try {
      const prev = await apiPreviewShare({ data: { offerId: offer.id } });
      if (!prev.ok || !prev.payload || !isSharePayloadV1(prev.payload)) {
        toast.error("Proposition indisponible (déjà traitée ?).");
        void refresh();
        return;
      }
      setPending({ offer, payload: prev.payload });
    } catch {
      toast.error("Chargement impossible (réseau).");
    } finally {
      setActing(null);
    }
  }

  async function confirmImport(plan: SharedImportPlan) {
    if (!pending) return;
    const { offer, payload } = pending;
    setPending(null);
    try {
      const res = await apiRespondShare({ data: { offerId: offer.id, accept: true } });
      if (!res.ok) {
        toast.error("Proposition introuvable (déjà traitée ?).");
        void refresh();
        return;
      }
      const { visitId } = importSharedPayload(payload, {
        threadId: offer.thread_id,
        isReturn: Boolean(offer.reply_to),
        plan,
      });
      toast.success(plan.isMerge ? `« ${offer.title} » mis à jour.` : `« ${offer.title} » importé.`);
      void refresh();
      navigate({ to: "/visite/$id", params: { id: visitId } });
    } catch {
      toast.error("Import impossible (réseau).");
    }
  }

  async function decline(offer: ShareRow) {
    setActing(offer.id);
    try {
      const res = await apiRespondShare({ data: { offerId: offer.id, accept: false } });
      if (!res.ok) toast.error("Proposition introuvable (déjà traitée ?).");
      else toast.message("Proposition refusée.");
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

      <AccountPendingBanner />

      <GroupInvites />

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
                      onClick={() => void openImport(o)}
                      disabled={acting === o.id}
                    >
                      Examiner
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void decline(o)}
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

      <GroupClasseursReceived />

      <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted shadow-[var(--shadow-border)]">
        Pour partager un <strong className="font-medium text-fg">classeur entier</strong> avec un
        groupe (plusieurs visites d'un coup), passez par{" "}
        <Link to="/groupe" className="text-accent">
          Groupe → Partager un classeur
        </Link>
        .
      </p>

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

      {pending ? (
        <ShareImportDialog
          open
          onOpenChange={(v) => {
            if (!v) setPending(null);
          }}
          offer={pending.offer}
          payload={pending.payload}
          onConfirm={(plan) => void confirmImport(plan)}
        />
      ) : null}
    </div>
  );
}

type GroupInvite = { id: string; name: string; kind: string; owner_name: string };

/** Invitations à rejoindre un groupe — répondues ici plutôt que sur /compte,
 *  pour que la pastille de l'en-tête pointe vers un seul endroit. */
function GroupInvites() {
  const [invites, setInvites] = useState<GroupInvite[]>([]);
  const [acting, setActing] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await apiListMyInvites();
      if (r.ok) setInvites(r.invites as GroupInvite[]);
    } catch {
      /* réseau : on retentera */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 20_000);
    return () => window.clearInterval(t);
  }, [refresh]);

  async function respond(inv: GroupInvite, accept: boolean) {
    setActing(inv.id);
    try {
      const res = await apiRespondInvite({ data: { workspaceId: inv.id, accept } });
      if (!res.ok) toast.error("Invitation introuvable (déjà traitée ?).");
      else if (accept) toast.success(`Vous avez rejoint « ${inv.name} ».`);
      else toast.message("Invitation refusée.");
      void refresh();
    } catch {
      toast.error("Action impossible (réseau).");
    } finally {
      setActing(null);
    }
  }

  if (!loaded || invites.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <Users className="size-4 text-accent" />
        Invitations de groupe ({invites.length})
      </h2>
      <ul className="space-y-2">
        {invites.map((inv) => (
          <li key={inv.id}>
            <Card className="space-y-2 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="mid">Groupe</Badge>
                <span className="text-sm font-medium">{inv.name}</span>
              </div>
              {inv.owner_name ? (
                <p className="text-xs text-subtle">Invité par {inv.owner_name}</p>
              ) : null}
              <p className="text-xs text-muted">
                En rejoignant, vous partagez et recevez les dossiers mis en commun dans ce groupe.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => void respond(inv, true)}
                  disabled={acting === inv.id}
                >
                  Rejoindre
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void respond(inv, false)}
                  disabled={acting === inv.id}
                >
                  Refuser
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
