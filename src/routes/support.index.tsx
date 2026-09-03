import { useCallback, useState, useEffect, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bug, LifeBuoy, Lightbulb, Send } from "lucide-react";
import { toast } from "sonner";
import { SupportPhotos } from "@/components/support-photos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { isoDate } from "@/lib/format";
import { selectWorkspace, useSipr } from "@/lib/store";
import {
  apiListSupportTickets,
  apiReviewTicket,
  submitSupportTicket,
} from "@/lib/support-api";
import { SUPPORT_KINDS, supportKindLabel, supportStatusLabel } from "@/lib/support";
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
            Créez un compte (entreprise ou indépendant) pour envoyer une demande. Elle apparaît
            dans l'application côté éditeur — aucune adresse e-mail n'est échangée.
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
      <OwnerInbox />
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

function OwnerInbox() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await apiListSupportTickets();
      if (!res.ok) {
        setVisible(false);
        return;
      }
      setVisible(true);
      setTickets(res.tickets);
    } catch {
      /* réseau */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(t);
  }, [refresh]);

  if (!visible) return null;

  async function review(id: string, action: "valider" | "refuser" | "traiter") {
    setActing(id);
    try {
      const res = await apiReviewTicket({ data: { id, action } });
      if (!res.ok) {
        toast.error("Demande introuvable.");
      } else {
        if (action === "valider") {
          try {
            await navigator.clipboard.writeText(res.prompt);
            toast.success("Validée — bloc pour Grok copié dans le presse-papier.");
          } catch {
            toast.success("Validée.");
          }
        } else {
          toast.message(action === "refuser" ? "Refusée." : "Marquée traitée.");
        }
      }
      void refresh();
    } catch {
      toast.error("Action impossible (réseau).");
    } finally {
      setActing(null);
    }
  }

  const waiting = tickets.filter((t) => t.status === "envoye");
  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-semibold">
        Demandes reçues{waiting.length > 0 ? ` · ${waiting.length} à traiter` : ""}
      </h2>
      {tickets.length === 0 ? (
        <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted shadow-[var(--shadow-border)]">
          Aucune demande.
        </p>
      ) : (
        <ul className="space-y-2">
          {tickets.map((t) => (
            <li key={t.id} className="rounded-xl bg-surface p-3 shadow-[var(--shadow-border)]">
              <button
                type="button"
                className="w-full text-left"
                onClick={() => setOpen((o) => (o === t.id ? null : t.id))}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={t.kind === "bug" ? "high" : "accent"}>{supportKindLabel(t.kind)}</Badge>
                  <Badge
                    tone={
                      t.status === "valide" || t.status === "traite"
                        ? "low"
                        : t.status === "refuse"
                          ? "high"
                          : "mid"
                    }
                  >
                    {supportStatusLabel(t.status)}
                  </Badge>
                  <span className="text-xs text-subtle">{t.page || ""}</span>
                </div>
                <p className="mt-2 font-medium">{t.title}</p>
                <p className="text-xs text-subtle">
                  {t.authorName} · {t.organisation || t.workspaceName}
                </p>
              </button>
              {open === t.id ? (
                <div className="mt-3 space-y-3 border-t border-border pt-3">
                  <p className="whitespace-pre-wrap text-sm">{t.description}</p>
                  {t.photos.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {t.photos.map((p, i) => (
                        <img key={i} src={p} alt="" className="h-20 w-full rounded-lg object-cover" />
                      ))}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => void review(t.id, "valider")}
                      disabled={acting === t.id}
                    >
                      Valider (copier pour Grok)
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void review(t.id, "traiter")}
                      disabled={acting === t.id}
                    >
                      Marquer traitée
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void review(t.id, "refuser")}
                      disabled={acting === t.id}
                    >
                      Refuser
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
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
          kind: draft.kind,
          title: draft.title,
          description: draft.description,
          page: draft.page,
          photos: draft.photos,
          authorName: draft.authorName,
          authorTitle: draft.authorTitle,
          authorLevel: draft.authorLevel,
          organisation: draft.organisation,
          workspaceName: draft.workspaceName,
        },
      });
      if (!res.ok) {
        addTicket(draft);
        toast.error(res.error);
        return;
      }
      addTicket({ ...draft, id: res.id });
      setTitle("");
      setDescription("");
      setPhotos([]);
      setKind(null);
      toast.success("Demande envoyée à l'éditeur.");
    } catch (err) {
      addTicket(draft);
      toast.error(
        String((err as Error)?.message).includes("Unauthorized")
          ? "Connectez-vous pour envoyer une demande."
          : "Envoi interrompu — réessayez.",
      );
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
        <Button type="submit" className="w-full" disabled={busy || !kind}>
          <Send />
          {busy ? "Envoi…" : "Envoyer la demande"}
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
