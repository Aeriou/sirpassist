import { useState, useEffect, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bug, LifeBuoy, Lightbulb, Send } from "lucide-react";
import { toast } from "sonner";
import { SupportPhotos } from "@/components/support-photos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { isoDate } from "@/lib/format";
import { useOnline } from "@/lib/online";
import { selectWorkspace, useSipr } from "@/lib/store";
import { submitSupportTicket } from "@/lib/support-api";
import {
  mailtoDraft,
  SUPPORT_KINDS,
  supportKindLabel,
  supportStatusLabel,
} from "@/lib/support";
import type { SupportKind, SupportTicket } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/support/")({ component: SupportPage });

function SupportPage() {
  const sessionUserId = useSipr((s) => s.sessionUserId);
  const users = useSipr((s) => s.users);
  const session = users.find((u) => u.id === sessionUserId);
  const tickets = useSipr((s) => s.tickets);
  const [lastPage, setLastPage] = useState("");
  useEffect(() => {
    try {
      setLastPage(sessionStorage.getItem("sipr-last-page") || "");
    } catch {
      /* private mode */
    }
  }, []);

  if (!session) {
    return (
      <div className="space-y-4">
        <header>
          <h1 className="font-display text-2xl font-semibold md:hidden">Support</h1>
          <p className="text-sm text-muted">
            Signaler un bug ou proposer une amélioration — uniquement avec un compte CP.
          </p>
        </header>
        <Card className="space-y-3">
          <LifeBuoy className="size-8 text-accent" />
          <p className="font-display font-semibold">Compte requis</p>
          <p className="text-sm text-muted">
            Créez un compte (entreprise ou indépendant) pour envoyer une demande. L'éditeur
            reçoit vos coordonnées avec le message.
          </p>
          <Button asChild>
            <Link to="/compte">Créer un compte / ouvrir la session</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold md:hidden">Support</h1>
      </header>
      <SupportForm
        session={{
          name: session.name,
          email: session.email,
          title: session.title,
          level: session.level,
          organisation: session.organisation,
        }}
        pageHint={lastPage}
      />
      <MyTickets tickets={tickets.filter((t) => t.authorEmail === session.email)} />
    </div>
  );
}

function SupportForm({
  session,
  pageHint,
}: {
  session: {
    name: string;
    email: string;
    title: string;
    level: 1 | 2 | 3;
    organisation: string;
  };
  pageHint: string;
}) {
  const workspace = useSipr(selectWorkspace);
  const addTicket = useSipr((s) => s.addTicket);
  const online = useOnline();
  const [kind, setKind] = useState<SupportKind | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [page, setPage] = useState(pageHint);
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (pageHint) setPage((p) => p || pageHint);
  }, [pageHint]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!kind) {
      toast.error("Choisissez bug ou amélioration.");
      return;
    }
    if (!title.trim() || !description.trim()) {
      toast.error("Titre et description obligatoires.");
      return;
    }
    const draft: SupportTicket = {
      id: `local_${Date.now().toString(36)}`,
      kind,
      title: title.trim(),
      description: description.trim(),
      page: page.trim() || undefined,
      photos,
      authorName: session.name,
      authorEmail: session.email,
      authorTitle: session.title,
      authorLevel: session.level,
      organisation: session.organisation,
      workspaceName: workspace?.name || session.organisation,
      createdAt: isoDate(),
      status: "envoye",
    };
    setBusy(true);
    try {
      const res = await submitSupportTicket({
        data: {
          origin: window.location.origin,
          kind: draft.kind,
          title: draft.title,
          description: draft.description,
          page: draft.page,
          photos: draft.photos,
          authorName: draft.authorName,
          authorEmail: draft.authorEmail,
          authorTitle: draft.authorTitle,
          authorLevel: draft.authorLevel,
          organisation: draft.organisation,
          workspaceName: draft.workspaceName,
        },
      });
      if (!res.ok) {
        addTicket(draft);
        toast.error(res.error);
        window.location.href = mailtoDraft(draft);
        return;
      }
      addTicket({ ...draft, id: res.id });
      setTitle("");
      setDescription("");
      setPhotos([]);
      setKind(null);
      if (res.mailed) {
        toast.success("Demande envoyée — l'éditeur la reçoit par e-mail.");
      } else {
        toast.message("Enregistrée. Ouvrez votre messagerie pour l'envoyer aussi par e-mail.");
        window.location.href = mailtoDraft(draft);
      }
    } catch (err) {
      addTicket(draft);
      toast.error(err instanceof Error ? err.message : "Envoi interrompu.");
      window.location.href = mailtoDraft(draft);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {SUPPORT_KINDS.map((k) => {
          const Icon = k.id === "bug" ? Bug : Lightbulb;
          const on = kind === k.id;
          return (
            <button
              key={k.id}
              type="button"
              onClick={() => setKind(k.id)}
              className={cn(
                "flex min-h-20 flex-col items-start gap-1 rounded-xl px-4 py-3 text-left shadow-[var(--shadow-border)]",
                on ? "bg-accent text-accent-fg" : "bg-surface-2 text-fg",
              )}
            >
              <span className="flex items-center gap-2 font-medium">
                <Icon className="size-4" />
                {k.label}
              </span>
              <span className={cn("text-xs", on ? "opacity-90" : "text-muted")}>{k.hint}</span>
            </button>
          );
        })}
      </div>
      <form className="space-y-3" onSubmit={(e) => void submit(e)}>
        <Field label="Titre">
          <Input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={kind === "amelioration" ? "Ex. Export Excel du PAA" : "Ex. La caméra se fige"}
          />
        </Field>
        <Field label="Description">
          <Textarea
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ce que vous voyez, ce que vous attendiez, comment reproduire. Une idée claire pour une amélioration."
          />
        </Field>
        <Field label="Écran concerné (optionnel)">
          <Input
            value={page}
            onChange={(e) => setPage(e.target.value)}
            placeholder="/pgp, Signaler, tableau…"
          />
        </Field>
        <SupportPhotos value={photos} onChange={setPhotos} />
        {!online ? (
          <p className="text-xs text-muted">
            Hors-ligne : la messagerie de l'appareil sera proposée.
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={busy || !kind}>
          <Send />
          {busy ? "Envoi…" : "Envoyer à l'éditeur"}
        </Button>
      </form>
    </Card>
  );
}

function MyTickets({ tickets }: { tickets: SupportTicket[] }) {
  if (tickets.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-semibold">Mes demandes</h2>
      <ul className="space-y-2">
        {tickets.map((t) => (
          <li key={t.id} className="rounded-xl bg-surface p-3 shadow-[var(--shadow-border)]">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={t.kind === "bug" ? "high" : "accent"}>{supportKindLabel(t.kind)}</Badge>
              <Badge
                tone={
                  t.status === "valide" ? "low" : t.status === "refuse" ? "high" : "neutral"
                }
              >
                {supportStatusLabel(t.status)}
              </Badge>
            </div>
            <p className="mt-2 font-medium">{t.title}</p>
            <p className="line-clamp-2 text-sm text-muted">{t.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
