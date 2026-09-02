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
      const built =
        anomalyId != null
          ? buildAnomalyPayload({ visit, anomalies, by, originId, anomalyId })
          : buildVisitPayload({ visit, anomalies, by, originId });

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
