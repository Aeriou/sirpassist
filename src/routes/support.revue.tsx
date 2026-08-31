import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { reviewSupportTicket } from "@/lib/support-api";
import { supportKindLabel, supportStatusLabel } from "@/lib/support";
import type { SupportStatus, SupportTicket } from "@/lib/types";

type Search = { id?: string; token?: string; action?: "valider" | "refuser" };

export const Route = createFileRoute("/support/revue")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    id: typeof s.id === "string" ? s.id : undefined,
    token: typeof s.token === "string" ? s.token : undefined,
    action: s.action === "valider" || s.action === "refuser" ? s.action : undefined,
  }),
  component: RevuePage,
});

function RevuePage() {
  const search = Route.useSearch();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<SupportStatus>("envoye");

  useEffect(() => {
    if (!search.id || !search.token) {
      setBusy(false);
      setError("Lien incomplet. Utilisez le lien reçu par e-mail.");
      return;
    }
    let cancelled = false;
    void (async () => {
      setBusy(true);
      const res = await reviewSupportTicket({
        data: {
          id: search.id!,
          token: search.token!,
          action: search.action ?? "lire",
        },
      });
      if (cancelled) return;
      setBusy(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTicket(res.ticket);
      setPrompt(res.prompt);
      setStatus(res.status);
    })();
    return () => {
      cancelled = true;
    };
  }, [search.id, search.token, search.action]);

  async function decide(action: "valider" | "refuser") {
    if (!search.id || !search.token) return;
    setBusy(true);
    const res = await reviewSupportTicket({
      data: { id: search.id, token: search.token, action },
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setTicket(res.ticket);
    setPrompt(res.prompt);
    setStatus(res.status);
    toast.success(action === "valider" ? "Validée — bloc Grok prêt." : "Demande refusée.");
  }

  if (busy && !ticket) {
    return <p className="text-sm text-muted">Ouverture de la demande…</p>;
  }
  if (error || !ticket) {
    return (
      <Card>
        <p className="font-display font-semibold">Revue impossible</p>
        <p className="mt-2 text-sm text-muted">{error}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl font-semibold md:hidden">Revue éditeur</h1>
        <p className="text-sm text-muted">
          Validez pour envoyer la tâche à Grok. Vous recevez ensuite le lien d'aperçu ; le serveur
          officiel n'est mis à jour qu'après votre OK.
        </p>
      </header>
      <Card className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge tone={ticket.kind === "bug" ? "high" : "accent"}>{supportKindLabel(ticket.kind)}</Badge>
          <Badge tone={status === "valide" ? "low" : status === "refuse" ? "high" : "neutral"}>
            {supportStatusLabel(status)}
          </Badge>
        </div>
        <h2 className="font-display text-xl font-semibold">{ticket.title}</h2>
        <p className="whitespace-pre-wrap text-sm">{ticket.description}</p>
        {ticket.page ? <p className="text-xs text-muted">Écran : {ticket.page}</p> : null}
        <p className="text-sm text-muted">
          {ticket.authorName} · {ticket.authorTitle} N{ticket.authorLevel}
          <br />
          {ticket.organisation} · {ticket.workspaceName}
        </p>
        {ticket.photos.length > 0 ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {ticket.photos.map((src, i) => (
              <li key={i}>
                <img src={src} alt="" className="max-h-64 w-full rounded-lg object-contain bg-surface-2" />
              </li>
            ))}
          </ul>
        ) : null}
        {status === "envoye" ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="flex-1" disabled={busy} onClick={() => void decide("valider")}>
              <Check />
              Valider et envoyer à Grok
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              disabled={busy}
              onClick={() => void decide("refuser")}
            >
              <X />
              Refuser
            </Button>
          </div>
        ) : null}
      </Card>
      {status === "valide" ? (
        <Card className="space-y-3">
          <p className="font-display font-semibold">Bloc à coller dans Grok</p>
          <p className="text-sm text-muted">
            Ouvrez votre conversation SiprAssist, collez ce texte. Grok fait la tâche et vous
            renvoie le lien modifié. Vous validez ensuite la mise en ligne officielle.
          </p>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-xs">
            {prompt}
          </pre>
          <Button
            className="w-full"
            onClick={() => {
              void navigator.clipboard.writeText(prompt);
              toast.success("Bloc copié.");
            }}
          >
            <Copy />
            Copier pour Grok
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
