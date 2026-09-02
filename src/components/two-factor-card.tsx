import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";

type Setup = { uri: string; qr: string; backupCodes: string[] };

/**
 * Double authentification (TOTP) via le plugin `twoFactor` de Better Auth.
 * Le secret et les codes de secours sont chiffrés au repos côté serveur ; la
 * vérification et le verrouillage après échecs sont serveur aussi.
 * Se masque tout seul s'il n'y a pas de session serveur.
 */
export function TwoFactorCard() {
  const { data, refetch } = authClient.useSession();
  const enabled = Boolean(
    (data?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled,
  );

  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<null | "enable" | "disable">(null);
  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");

  if (!data?.user) return null;

  async function startEnable(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await authClient.twoFactor.enable({ password });
      if (res.error || !res.data) {
        toast.error(res.error?.message ?? "Mot de passe incorrect.");
        return;
      }
      const encodeQR = (await import("qr")).default;
      setSetup({
        uri: res.data.totpURI,
        qr: encodeQR(res.data.totpURI, "data-url"),
        backupCodes: res.data.backupCodes,
      });
      setPassword("");
      setAsk(null);
    } catch {
      toast.error("Activation impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await authClient.twoFactor.verifyTotp({ code: code.trim() });
      if (res.error) {
        toast.error("Code incorrect — vérifiez l'heure du téléphone.");
        return;
      }
      toast.success("Double authentification activée.");
      setSetup(null);
      setCode("");
      await refetch?.();
    } finally {
      setBusy(false);
    }
  }

  async function disable(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await authClient.twoFactor.disable({ password });
      if (res.error) {
        toast.error(res.error.message ?? "Mot de passe incorrect.");
        return;
      }
      toast.message("Double authentification désactivée.");
      setPassword("");
      setAsk(null);
      await refetch?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-display font-semibold">Double authentification</h2>
        <p className="text-sm text-muted">
          Un code à 6 chiffres d'une application (Google Authenticator, Authy…) demandé à chaque
          connexion.
        </p>
      </div>

      {/* Étape 1 bis : QR à scanner + codes de secours */}
      {setup ? (
        <div className="space-y-3">
          <p className="text-sm">Scannez ce QR code dans votre application d'authentification :</p>
          <img
            src={setup.qr}
            alt="QR code de configuration"
            className="h-44 w-44 rounded-lg bg-white p-2"
          />
          <details className="text-sm">
            <summary className="cursor-pointer text-accent">Impossible de scanner ? Saisir la clé</summary>
            <p className="mt-1 break-all font-mono text-xs text-muted">{setup.uri}</p>
          </details>
          <div className="rounded-lg bg-surface-2 p-3">
            <p className="text-sm font-medium">Codes de secours (à garder hors de l'appareil) :</p>
            <ul className="mt-1 grid grid-cols-2 gap-1 font-mono text-sm">
              {setup.backupCodes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          <form className="space-y-2" onSubmit={(e) => void confirmEnable(e)}>
            <Field label="Code à 6 chiffres de l'application">
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </Field>
            <Button type="submit" disabled={busy}>
              {busy ? "…" : "Activer"}
            </Button>
          </form>
        </div>
      ) : enabled ? (
        <>
          <p className="text-sm text-ok">Active — un code est demandé à chaque connexion.</p>
          {ask === "disable" ? (
            <form className="space-y-2" onSubmit={(e) => void disable(e)}>
              <Field label="Mot de passe pour confirmer">
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Field>
              <div className="flex gap-2">
                <Button type="submit" variant="danger" disabled={busy}>
                  Désactiver
                </Button>
                <Button type="button" variant="ghost" onClick={() => setAsk(null)}>
                  Annuler
                </Button>
              </div>
            </form>
          ) : (
            <Button type="button" variant="outline" onClick={() => setAsk("disable")}>
              Désactiver
            </Button>
          )}
        </>
      ) : ask === "enable" ? (
        <form className="space-y-2" onSubmit={(e) => void startEnable(e)}>
          <Field label="Mot de passe pour confirmer">
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "…" : "Continuer"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAsk(null)}>
              Annuler
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setAsk("enable")}>
          Activer la 2FA
        </Button>
      )}
    </Card>
  );
}
