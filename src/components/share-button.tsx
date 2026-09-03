import { useState } from "react";
import { toast } from "sonner";
import { Share2 } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { apiSendShare } from "@/lib/share-api";
import {
  buildAnomalyPayload,
  buildVisitPayload,
  summarize,
} from "@/lib/share-payload";
import { resolveAsset } from "@/lib/asset-cache";
import { isDataUrl } from "@/lib/asset-id";
import { useSipr } from "@/lib/store";
import { Button } from "./ui/button";
import { Dialog, DialogContent } from "./ui/dialog";
import { Field, Input } from "./ui/input";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Bouton « Partager… » d'un dossier (visite) ou d'un constat. Ouvre une petite
 * fenêtre : adresse e-mail du collègue → une proposition part. Le collègue
 * l'accepte ou la refuse depuis « Partages ». Modèle copie (cf. share-payload).
 */
export function ShareButton({
  visitId,
  anomalyId,
  replyTo,
  defaultEmail,
  label,
  variant = "outline",
  onSent,
}: {
  visitId: string;
  anomalyId?: string;
  replyTo?: string | null;
  defaultEmail?: string;
  label?: string;
  variant?: "outline" | "secondary" | "default";
  onSent?: () => void;
}) {
  const { data: session } = authClient.useSession();
  const visit = useSipr((s) => s.visits.find((v) => v.id === visitId));
  const anomalies = useSipr((s) => s.anomalies);
  const updateVisit = useSipr((s) => s.updateVisit);
  const updateAnomaly = useSipr((s) => s.updateAnomaly);
  const profile = useSipr((s) => s.profile);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [busy, setBusy] = useState(false);

  if (!session?.user || !visit) return null;

  const targetAnomaly = anomalyId ? anomalies.find((a) => a.id === anomalyId) : undefined;
  const btnLabel = label ?? (anomalyId ? "Partager le constat" : "Partager le dossier");

  async function send() {
    if (!visit) return;
    const to = email.trim().toLowerCase();
    if (!EMAIL_RE.test(to)) {
      toast.error("Adresse e-mail invalide.");
      return;
    }
    setBusy(true);
    try {
      const by = {
        name: session?.user?.name || profile.name || "Conseiller",
        email: (session?.user?.email || "").toLowerCase(),
      };
      const originId = () => crypto.randomUUID();

      // Le magasin d'images est PAR COMPTE : le partage doit transporter les
      // octets de la photo, pas seulement son id. Si la copie locale a été
      // déchargée (sync serveur), on la ré-hydrate depuis MON magasin avant
      // d'emballer.
      const scope = anomalies.filter(
        (a) => a.visitId === visit.id && (anomalyId == null || a.id === anomalyId),
      );
      const hydrated = await Promise.all(
        scope.map(async (a) => {
          if (isDataUrl(a.photo) || !a.photoAssetId) return a;
          const d = await resolveAsset(a.photoAssetId);
          return d ? { ...a, photo: d } : a;
        }),
      );
      let coverVisit = visit;
      if (!isDataUrl(visit.coverPhoto) && visit.coverPhotoAssetId) {
        const d = await resolveAsset(visit.coverPhotoAssetId);
        if (d) coverVisit = { ...visit, coverPhoto: d };
      }

      const built =
        anomalyId != null
          ? buildAnomalyPayload({ visit: coverVisit, anomalies: hydrated, by, originId, anomalyId })
          : buildVisitPayload({ visit: coverVisit, anomalies: hydrated, by, originId });

      // Persister les identifiants d'origine sur mes enregistrements locaux :
      // un futur retour pourra ainsi être rapproché (étape 2).
      if (!visit.shareOriginId) {
        updateVisit(visit.id, { shareOriginId: built.assigned.visitOriginId });
      }
      for (const [localId, oid] of Object.entries(built.assigned.anomalyOriginIds)) {
        const a = anomalies.find((x) => x.id === localId);
        if (a && !a.shareOriginId) updateAnomaly(localId, { shareOriginId: oid });
      }

      const res = await apiSendShare({
        data: {
          toEmail: to,
          kind: built.payload.kind,
          title:
            built.payload.kind === "visit"
              ? visit.name || visit.company
              : targetAnomaly?.title || "Constat",
          summary: summarize(built.payload),
          payload: built.payload,
          replyTo: replyTo ?? null,
        },
      });

      if (!res.ok) {
        toast.error(
          res.reason === "unknown_user"
            ? "Aucun compte SiprAssist avec cette adresse e-mail."
            : res.reason === "self"
              ? "C'est votre propre adresse."
              : res.reason === "sender_pending"
                ? "Votre compte est en attente de validation — le partage sera possible ensuite."
                : res.reason === "target_pending"
                  ? "Ce compte n'est pas encore validé par l'administrateur."
                  : res.reason === "too_large"
                    ? "Dossier trop lourd à partager (trop de photos). Partagez constat par constat."
                    : res.reason === "rate_limited"
                      ? "Trop de partages d'affilée — réessayez dans un moment."
                      : "Envoi impossible.",
        );
        return;
      }
      toast.success(`Proposition envoyée à ${res.toName || res.toEmail}.`);
      setOpen(false);
      setEmail(defaultEmail ?? "");
      onSent?.();
    } catch {
      toast.error("Envoi impossible (réseau).");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant={variant} onClick={() => setOpen(true)}>
        <Share2 />
        {btnLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="w-[min(100%-1.5rem,28rem)]"
          title={anomalyId ? "Partager ce constat" : "Partager ce dossier"}
          description="Le collègue reçoit une proposition dans « Partages » et l'accepte ou la refuse. Une copie est transmise — vos versions évoluent ensuite séparément."
        >
          <div className="space-y-3">
            <Field label="E-mail du collègue (compte SiprAssist)">
              <Input
                type="email"
                inputMode="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="prenom.nom@exemple.be"
              />
            </Field>
            <Button className="w-full" onClick={() => void send()} disabled={busy}>
              {busy ? "Envoi…" : "Envoyer la proposition"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
