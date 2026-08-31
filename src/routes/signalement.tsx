import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { toast } from "sonner";
import { KinneyCalculator } from "@/components/kinney-calculator";
import { PhotoCapture } from "@/components/photo-capture";
import { VoiceCapture } from "@/components/voice-capture";
import { VisitPicker } from "@/components/visit-picker";
import { PlanBanner } from "@/components/plan-banner";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { analyzeAnomaly } from "@/lib/ai";
import { THEMES } from "@/lib/code-bien-etre";
import { addDays, isoDate, isoDay } from "@/lib/format";
import { geoLabel, locatePlaceFromGps } from "@/lib/geo";
import { formatPlace, placeToGeo } from "@/lib/place";
import { buildKinney } from "@/lib/kinney";
import { useOnline } from "@/lib/online";
import { parseObservation, type AnomalyDraft } from "@/lib/parse-observation";
import { splitVoice } from "@/lib/parse-voice";
import { currentAuthor, selectWorkspace, useSipr, useWorkspaceVisits } from "@/lib/store";
import { blockedMessage } from "@/lib/plan";
import { usePlan } from "@/lib/use-plan";
import { matchVisitByName, visitLabel } from "@/lib/workspace";
import type { GeoFix, ThemeId, Urgency, VoiceSections } from "@/lib/types";

type Search = { visitId?: string };

export const Route = createFileRoute("/signalement")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    visitId: typeof s.visitId === "string" ? s.visitId : undefined,
  }),
  component: Signalement,
});

const URGENCIES: Urgency[] = ["basse", "moyenne", "haute", "critique"];

function Signalement() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const online = useOnline();
  const visits = useWorkspaceVisits();
  const workspace = useSipr(selectWorkspace);
  const addAnomaly = useSipr((s) => s.addAnomaly);
  const ensureVisitByName = useSipr((s) => s.ensureVisitByName);
  const profile = useSipr((s) => s.profile);
  const sessionUserId = useSipr((s) => s.sessionUserId);
  const users = useSipr((s) => s.users);
  const authorLive = currentAuthor({ profile, users, sessionUserId });
  const { view: plan } = usePlan();
  const fromSearch = visits.find((v) => v.id === search.visitId);
  const active = fromSearch ?? visits.find((v) => v.status === "en_cours") ?? visits[0];
  const [visitName, setVisitName] = useState("");
  const [visitTouched, setVisitTouched] = useState(Boolean(search.visitId));
  const visit = matchVisitByName(visits, visitName) ?? (visitName.trim() ? undefined : active);

  useEffect(() => {
    if (visitTouched) return;
    const picked = visits.find((v) => v.id === search.visitId);
    const next = picked ?? visits.find((v) => v.status === "en_cours") ?? visits[0];
    setVisitName(next ? visitLabel(next) : "");
  }, [visits, search.visitId, visitTouched]);
  const [photo, setPhoto] = useState<string | undefined>();
  const [speech, setSpeech] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<AnomalyDraft | null>(null);
  const [voice, setVoice] = useState<VoiceSections>({ danger: "", measure: "", zone: "" });
  const [geo, setGeo] = useState<GeoFix | undefined>(visit?.geo ?? placeToGeo(visit?.place));
  const [capturedAt, setCapturedAt] = useState(isoDate());
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    setGeo(visit?.geo ?? placeToGeo(visit?.place));
  }, [visit?.id]);

  const canAnalyze = useMemo(() => speech.trim().length > 4 || Boolean(photo), [speech, photo]);

  async function createFiche() {
    if (!canAnalyze) {
      toast.error("Ajoutez une photo ou une dictée.");
      return;
    }
    setBusy(true);
    setCapturedAt(isoDate());
    const localVoice = splitVoice(speech);
    try {
      if (!online) {
        const local = parseObservation(speech);
        if (geo?.address && local.location === "Non précisé") local.location = geo.address;
        setDraft(local);
        setVoice({
          danger: localVoice.danger || local.description,
          measure: localVoice.measure || local.correctiveAction,
          zone: localVoice.zone || geoLabel(geo) || local.location,
        });
        toast.message("Fiche locale — synchro IA dès le retour du réseau.");
        return;
      }
      const res = await analyzeAnomaly({ data: { transcription: speech, photo } });
      if (res.ok) {
        const d = res.draft;
        if (geo?.address && (!d.location || d.location === "Non précisé")) {
          d.location = geo.address;
        }
        setDraft(d);
        setVoice({
          danger: localVoice.danger || d.description,
          measure: localVoice.measure || d.correctiveAction,
          zone: localVoice.zone || d.location,
        });
        toast.success(res.source === "ai" ? "Fiche structurée (danger / mesure / zone)." : "Fiche construite localement.");
      } else {
        const local = parseObservation(speech);
        setDraft(local);
        setVoice(localVoice);
        toast.message("Fiche construite à partir de la dictée.");
      }
    } catch {
      const local = parseObservation(speech);
      setDraft(local);
      setVoice(localVoice);
      toast.message("Fiche construite hors-ligne.");
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!draft) return;
    if (!plan.canRecord) {
      toast.error(blockedMessage(plan));
      navigate({ to: "/compte" });
      return;
    }
    const name = visitName.trim();
    if (!name) {
      toast.error("Indiquez le nom de la visite.");
      return;
    }
    const resolvedVisitId = ensureVisitByName(name);
    if (!resolvedVisitId) {
      toast.error("Indiquez le nom de la visite.");
      return;
    }
    const due =
      draft.urgency === "critique" || draft.urgency === "haute"
        ? addDays(isoDay(), 2)
        : addDays(isoDay(), 21);
    const author = currentAuthor(useSipr.getState());
    const linked = visits.find((v) => v.id === resolvedVisitId);
    const id = addAnomaly({
      visitId: resolvedVisitId,
      photo,
      transcription: speech,
      title: draft.title,
      location: voice.zone || draft.location,
      description: voice.danger || draft.description,
      theme: draft.theme,
      urgency: draft.urgency,
      kinney: draft.kinney,
      kinneyWhy: draft.kinneyWhy,
      voice,
      geo,
      capturedAt,
      legalRef: draft.legalRef,
      correctiveAction: voice.measure || draft.correctiveAction,
      assignedTo: linked?.interlocutor,
      dueDate: due,
      author,
    });
    toast.success(
      visit
        ? `Constat regroupé dans « ${visitLabel(visit)} ».`
        : `Nouvelle visite « ${name} » créée — constat enregistré.`,
    );
    navigate({ to: "/anomalie/$id", params: { id } });
  }

  function patch(p: Partial<AnomalyDraft>) {
    if (!draft) return;
    setDraft({ ...draft, ...p });
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold md:hidden">Signalement</h1>
        <p className="text-sm text-muted">
          Photo horodatée, dictée continue, Kinney suggéré. Le nom de visite (libre) regroupe les
          constats dans le PGP de l'espace {workspace?.name ?? "courant"}. Constat au nom de{" "}
          {authorLive.name}, {authorLive.title} (N{authorLive.level}).{" "}
          <Link to="/compte" className="text-accent">
            Changer de CP
          </Link>
        </p>
        <p className="mt-2 rounded-xl bg-surface px-3 py-2 text-sm text-muted shadow-[var(--shadow-border)]">
          Charge d'équipe, pauses non relayées, reconnaissance :{" "}
          <Link to="/rps" search={visit?.id ? { visitId: visit.id } : undefined} className="text-accent">
            analyse RPS collective
          </Link>{" "}
          — poste et organisation, jamais un nom.
        </p>
      </header>

      <PlanBanner view={plan} />

      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface px-3 py-2 text-sm shadow-[var(--shadow-border)]">
        <MapPin className="size-4 shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          {geoLabel(geo) || (visit?.place ? formatPlace(visit.place) : "Adresse de la visite non définie")}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={locating}
          onClick={async () => {
            setLocating(true);
            try {
              const p = await locatePlaceFromGps();
              setGeo(placeToGeo(p));
              toast.success("GPS du constat verrouillé.");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "GPS indisponible.");
            } finally {
              setLocating(false);
            }
          }}
        >
          {locating ? "GPS…" : "GPS"}
        </Button>
      </div>

      <VisitPicker
        visits={visits}
        name={visitName}
        onNameChange={(n) => {
          setVisitTouched(true);
          setVisitName(n);
        }}
        workspaceName={workspace?.name}
      />

      <PhotoCapture value={photo} onChange={setPhoto} geo={geo} />
      <VoiceCapture value={speech} onChange={setSpeech} />

      {!draft ? (
        <div className="flex flex-col gap-2">
          <Button className="w-full" size="lg" disabled={busy || !canAnalyze} onClick={createFiche}>
            {busy ? "Rédaction de la fiche…" : "Créer la fiche d'anomalie"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              setPhoto("/seed/cable.jpg");
              setSpeech(
                "Prise atelier 3 dénudée, danger électrocution. Mesure : consigner et appeler un BA4. Zone : colonne nord atelier 3.",
              );
            }}
          >
            Remplir l'exemple (câble dénudé)
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          <Field label="Titre">
            <Input value={draft.title} onChange={(e) => patch({ title: e.target.value })} />
          </Field>
          <Field label="Description du danger">
            <Textarea
              value={voice.danger}
              onChange={(e) => setVoice({ ...voice, danger: e.target.value })}
            />
          </Field>
          <Field label="Mesure corrective proposée">
            <Textarea
              value={voice.measure}
              onChange={(e) => setVoice({ ...voice, measure: e.target.value })}
            />
          </Field>
          <Field label="Matériel / zone concerné">
            <Input
              value={voice.zone}
              onChange={(e) => setVoice({ ...voice, zone: e.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Thématique (Code du bien-être)">
              <NativeSelect
                value={draft.theme}
                onChange={(e) => patch({ theme: e.target.value as ThemeId })}
              >
                {THEMES.map((t) => (
                  <option key={t.id} value={t.id}>
                    Livre {t.livre} — {t.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Urgence">
              <NativeSelect
                value={draft.urgency}
                onChange={(e) => patch({ urgency: e.target.value as Urgency })}
              >
                {URGENCIES.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <KinneyCalculator
            P={draft.kinney.P}
            E={draft.kinney.E}
            G={draft.kinney.G}
            justification={draft.kinneyWhy}
            onChange={({ P, E, G }) => patch({ kinney: buildKinney(P, E, G) })}
          />
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setDraft(null)}>
              Revenir
            </Button>
            <Button className="flex-1" onClick={save} disabled={!plan.canRecord}>
              Enregistrer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
