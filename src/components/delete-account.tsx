import { useEffect, useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth/client";
import { apiMyAccountStatus } from "@/lib/account-api";
import { Button } from "./ui/button";
import { Dialog, DialogContent } from "./ui/dialog";
import { Field, Input } from "./ui/input";

/**
 * Suppression de compte par l'utilisateur (droit à l'effacement). Masqué pour
 * le compte propriétaire. Le serveur purge les données liées (voir le hook
 * `afterDelete` dans auth/server.ts) ; ici on nettoie le cache local et on
 * renvoie à l'accueil.
 */
export function DeleteAccountButton() {
  const { data: session } = authClient.useSession();
  const [owner, setOwner] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session?.user) return;
    let alive = true;
    apiMyAccountStatus()
      .then((r) => {
        if (alive) setOwner(r.owner);
      })
      .catch(() => {
        if (alive) setOwner(false);
      });
    return () => {
      alive = false;
    };
  }, [session?.user]);

  if (!session?.user || owner !== false) return null;

  async function confirmDelete() {
    if (!password.trim()) return;
    setBusy(true);
    const userId = session?.user?.id;
    try {
      const res = await authClient.deleteUser({ password });
      if (res.error) {
        toast.error(res.error.message || "Suppression impossible.");
        return;
      }
      try {
        if (userId) {
          localStorage.removeItem(`siprassist-v5::${userId}`);
          localStorage.removeItem(`siprassist-v5::${userId}::claimed`);
        }
      } catch {
        /* stockage indisponible */
      }
      toast.success("Compte supprimé.");
      window.location.assign("/");
    } catch {
      toast.error("Suppression impossible (réseau).");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-full text-danger"
        onClick={() => setOpen(true)}
      >
        Supprimer mon compte
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="w-[min(100%-1.5rem,28rem)]"
          title="Supprimer votre compte"
          description="Définitif. Votre compte, vos dossiers synchronisés sur le serveur, vos groupes et vos partages sont effacés. Les dossiers gardés en local sur d'autres appareils ne sont pas touchés."
        >
          <div className="space-y-3">
            <Field label="Votre mot de passe">
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="text-danger"
                variant="outline"
                onClick={() => void confirmDelete()}
                disabled={busy || !password.trim()}
              >
                {busy ? "Suppression…" : "Supprimer définitivement"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Annuler
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
