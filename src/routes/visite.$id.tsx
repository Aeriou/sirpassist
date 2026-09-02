import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Camera, FileText, MapPin, Pencil, ScanLine, Users } from "lucide-react";
import { toast } from "sonner";
import { AnomalyCard } from "@/components/anomaly-card";
import { ConfirmDelete } from "@/components/confirm-delete";
import { FdsCard } from "@/components/fds-card";
import { RpsCard } from "@/components/rps-card";
import { PlaceEditor } from "@/components/place-editor";
import { ShareButton } from "@/components/share-button";
import { ShareNotes } from "@/components/share-notes";
import { SiblingMergeButton } from "@/components/sibling-merge-button";
import { SignaturePad } from "@/components/signature-pad";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { formatCoords, formatShortDate, formatStamp, isoDate } from "@/lib/format";
import { emptyPlace, formatPlace, placeFromGeo, placeToGeo } from "@/lib/place";
import { selectWorkspace, useSipr } from "@/lib/store";
import { visitLabel } from "@/lib/workspace";
import type { Place } from "@/lib/types";

export const Route = createFileRoute("/visite/$id")({ component: VisitDetail });

function VisitDetail() {
  const { id } = Route.useParams();
  const visit = useSipr((s) => s.visits.find((v) => v.id === id));
  const allAnomalies = useSipr((s) => s.anomalies);
  const anomalies = allAnomalies.filter((a) => a.visitId === id);
  const allFds = useSipr((s) => s.fds);
  const fds = allFds.filter((f) => f.visitId === id);
  const allRps = useSipr((s) => s.rps);
  const rps = allRps.filter((r) => r.visitId === id);
  const closeVisit = useSipr((s) => s.closeVisit);
  const updateVisit = useSipr((s) => s.updateVisit);
  const removeVisit = useSipr((s) => s.removeVisit);
  const workspace = useSipr(selectWorkspace);
  const profile = useSipr((s) => s.profile);
  const navigate = useNavigate();
  const [signOpen, setSignOpen] = useState(false);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoDraft, setInfoDraft] = useState({
    name: visit?.name ?? "",
    company: visit?.company ?? "",
    interlocutor: visit?.interlocutor ?? "",
    date: visit?.date ?? "",
    notes: visit?.notes ?? "",
  });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [advisorSig, setAdvisorSig] = useState<string | undefined>();
  const [siteSig, setSiteSig] = useState<string | undefined>();
  const [siteName, setSiteName] = useState(visit?.interlocutor ?? "");
  const [draftPlace, setDraftPlace] = useState<Place>(emptyPlace());

  if (!visit) {
    return <p className="text-muted">Visite introuvable.</p>;
  }

  const current = visit;
  const place = current.place ?? placeFromGeo(current.geo, { room: current.site });

  function openPlace() {
    setDraftPlace(place);
    setPlaceOpen(true);
  }

  function savePlace() {
    if (!draftPlace.verified || draftPlace.lat == null) {
      toast.error("Choisissez une adresse belge vérifiée (GPS, carte ou recherche).");
      return;
    }
    updateVisit(current.id, {
      place: draftPlace,
      geo: placeToGeo(draftPlace),
      site: formatPlace(draftPlace),
    });
    setPlaceOpen(false);
    toast.success("Lieu de visite mis à jour.");
  }

  function openInfo() {
    setInfoDraft({
      name: current.name ?? "",
      company: current.company ?? "",
      interlocutor: current.interlocutor ?? "",
      date: current.date ?? "",
      notes: current.notes ?? "",
    });
    setInfoOpen(true);
  }

  function saveInfo() {
    updateVisit(current.id, {
      name: infoDraft.name.trim() || current.name,
      company: infoDraft.company.trim() || current.company,
      interlocutor: infoDraft.interlocutor.trim(),
      date: infoDraft.date || current.date,
      notes: infoDraft.notes.trim() || undefined,
    });
    setInfoOpen(false);
    toast.success("Informations du dossier mises à jour.");
  }

  function confirmClose() {
    updateVisit(current.id, {
      signatures: [
        {
          role: "conseiller",
          name: profile.name,
          dataUrl: advisorSig ?? "",
          signedAt: isoDate(),
        },
        {
          role: "site",
          name: siteName || current.interlocutor,
          dataUrl: siteSig ?? "",
          signedAt: isoDate(),
        },
      ],
    });
    closeVisit(current.id);
    setSignOpen(false);
    toast.success("Visite signée et clôturée.");
  }

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-border)]">
        {visit.coverPhoto ? (
          <img src={visit.coverPhoto} alt="" className="h-40 w-full object-cover md:h-52" />
        ) : null}
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={visit.status === "en_cours" ? "accent" : "low"}>
              {visit.status === "en_cours" ? "En cours" : "Terminée"}
            </Badge>
            <span className="text-xs text-muted">{formatShortDate(visit.date)}</span>
            {place.verified ? <Badge tone="low">Adresse vérifiée</Badge> : <Badge tone="mid">Adresse à vérifier</Badge>}
          </div>
          <h1 className="font-display text-2xl font-semibold">{visitLabel(visit)}</h1>
          {visit.company && visit.company !== visitLabel(visit) ? (
            <p className="text-sm text-muted">{visit.company}</p>
          ) : null}
          <Field label="Nom de la visite (regroupement PGP)">
            <Input
              defaultValue={visitLabel(visit)}
              onBlur={(e) => {
                const next = e.target.value.trim();
                if (!next || next === visitLabel(visit)) return;
                updateVisit(visit.id, { name: next });
                toast.success("Nom de visite mis à jour — les constats du même nom y seront rattachés.");
              }}
            />
          </Field>
          <p className="flex items-start gap-2 text-sm text-muted">
            <MapPin className="mt-0.5 size-4 shrink-0 text-accent" />
            <span>
              {formatPlace(place) || visit.site}
              {place.lat != null && place.lng != null ? (
                <span className="mt-0.5 block font-mono text-xs text-subtle">
                  {formatCoords(place.lat, place.lng)}
                </span>
              ) : null}
            </span>
          </p>
          {visit.interlocutor ? <p className="text-sm text-muted">{visit.interlocutor}</p> : null}
          {visit.notes ? <p className="text-sm text-muted">{visit.notes}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/signalement" search={{ visitId: visit.id }}>
                <Camera />
                Nouveau constat
              </Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link to="/fds" search={{ visitId: visit.id }}>
                <ScanLine />
                Scanner FDS
              </Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link to="/rps" search={{ visitId: visit.id }}>
                <Users />
                Analyse RPS
              </Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link to="/rapport/$id" params={{ id: visit.id }}>
                <FileText />
                Rapport
              </Link>
            </Button>
            <Button variant="outline" onClick={openPlace}>
              <MapPin />
              Lieu
            </Button>
            <Button variant="outline" onClick={openInfo}>
              <Pencil />
              Modifier les infos
            </Button>
            <ShareButton visitId={visit.id} />
            {visit.status === "en_cours" ? (
              <Button variant="outline" onClick={() => setSignOpen(true)}>
                Signer et clôturer
              </Button>
            ) : null}
            <Button variant="outline" className="text-danger" onClick={() => setDeleteOpen(true)}>
              Supprimer le dossier
            </Button>
          </div>
        </div>
      </header>

      {visit.signatures && visit.signatures.length > 0 ? (
        <p className="text-xs text-muted">
          Signé le {formatStamp(new Date(visit.signatures[0].signedAt))} par{" "}
          {visit.signatures.map((s) => s.name).join(" · ")}
        </p>
      ) : null}

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">
          Constats ({anomalies.length})
        </h2>
        {anomalies.length === 0 ? (
          <p className="text-sm text-muted">Aucun constat. Photographiez un défaut pour démarrer.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {anomalies.map((a) => (
              <AnomalyCard key={a.id} anomaly={a} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">
          Notices FDS ({fds.length})
        </h2>
        {fds.length === 0 ? (
          <p className="text-sm text-muted">
            Aucune notice liée. Scannez une étiquette pour l'attacher à ce dossier, ou laissez
            les FDS informatives dans la bibliothèque.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {fds.map((f) => (
              <FdsCard key={f.id} notice={f} visitName={visitLabel(visit)} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">
          Analyses RPS ({rps.length})
        </h2>
        {rps.length === 0 ? (
          <p className="text-sm text-muted">
            Aucune lecture collective liée. Charge, relais de poste, reconnaissance — jamais de
            noms.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {rps.map((s) => (
              <RpsCard key={s.id} situation={s} visitName={visitLabel(visit)} />
            ))}
          </div>
        )}
      </section>

      <SiblingMergeButton visitId={visit.id} />
      <ShareNotes scope="visit" id={visit.id} />

      <Dialog open={placeOpen} onOpenChange={setPlaceOpen}>
        <DialogContent
          className="max-h-[90vh] w-[min(100%-1.5rem,40rem)] overflow-y-auto"
          title="Lieu de la visite"
          description="Adresse civique vérifiée, puis bâtiment, étage, appartement, pièce."
        >
          <PlaceEditor value={draftPlace} onChange={setDraftPlace} />
          <Button className="mt-3 w-full" onClick={savePlace} disabled={!draftPlace.verified}>
            Enregistrer le lieu
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent
          className="max-h-[90vh] w-[min(100%-1.5rem,32rem)] overflow-y-auto"
          title="Informations du dossier"
          description="Corriger une erreur de saisie sans recréer le dossier."
        >
          <div className="space-y-3">
            <Field label="Nom du dossier">
              <Input
                value={infoDraft.name}
                onChange={(e) => setInfoDraft({ ...infoDraft, name: e.target.value })}
                placeholder="Atelier 3 Charleroi"
              />
            </Field>
            <Field label="Entreprise visée">
              <Input
                value={infoDraft.company}
                onChange={(e) => setInfoDraft({ ...infoDraft, company: e.target.value })}
              />
            </Field>
            <Field label="Interlocuteur">
              <Input
                value={infoDraft.interlocutor}
                onChange={(e) => setInfoDraft({ ...infoDraft, interlocutor: e.target.value })}
                placeholder="Chef d'atelier, gérant…"
              />
            </Field>
            <Field label="Date">
              <Input
                type="date"
                value={infoDraft.date}
                onChange={(e) => setInfoDraft({ ...infoDraft, date: e.target.value })}
              />
            </Field>
            <Field label="Notes">
              <Textarea
                value={infoDraft.notes}
                onChange={(e) => setInfoDraft({ ...infoDraft, notes: e.target.value })}
                placeholder="Contexte, accès, points à revoir…"
              />
            </Field>
            <Button className="w-full" onClick={saveInfo}>
              Enregistrer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={signOpen} onOpenChange={setSignOpen}>
        <DialogContent
          title="Signatures de clôture"
          description="Conseiller en prévention et responsable de site. Le rapport PDF suit."
        >
          <div className="space-y-3">
            <SignaturePad
              label={`Conseiller — ${profile.name}`}
              value={advisorSig}
              onChange={setAdvisorSig}
            />
            <Field label="Nom du responsable de site">
              <Input value={siteName} onChange={(e) => setSiteName(e.target.value)} />
            </Field>
            <SignaturePad
              label="Responsable de site"
              value={siteSig}
              onChange={setSiteSig}
            />
            <Button className="w-full" onClick={confirmClose}>
              Valider et clôturer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDelete
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={workspace?.kind === "independant" ? "Supprimer ce client / dossier ?" : "Supprimer ce dossier ?"}
        description={
          anomalies.length
            ? `${anomalies.length} constat${anomalies.length > 1 ? "s" : ""} seront retirés. Les notices FDS et analyses RPS restent en bibliothèque, détachées.`
            : "Le dossier disparaît de l'accueil et du terrain. Notices FDS et analyses RPS restent en bibliothèque."
        }
        confirmLabel="Supprimer le dossier"
        onConfirm={() => {
          removeVisit(current.id);
          toast.message("Dossier supprimé.");
          navigate({ to: "/" });
        }}
      />
    </div>
  );
}
