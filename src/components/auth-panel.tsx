import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";

/**
 * Panneau d'authentification serveur (Better Auth, e-mail + mot de passe).
 * Utilisé par `/connexion` et par la page « Compte ». La session pilote toute
 * l'application via `SessionBridge`.
 */
export function AuthPanel({ showSignOut = true }: { showSignOut?: boolean }) {
  const { data, isPending, refetch } = authClient.useSession();
  const [mode, setMode] = useState<"login" | "create">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "create") {
        const res = await authClient.signUp.email({
          email: email.trim().toLowerCase(),
          password,
          name: name.trim() || email.trim(),
        });
        if (res.error) {
          toast.error(res.error.message ?? "Création impossible.");
          return;
        }
        toast.success("Compte créé — session ouverte.");
      } else {
        const res = await authClient.signIn.email({
          email: email.trim().toLowerCase(),
          password,
        });
        if (res.error) {
          toast.error(res.error.message ?? "E-mail ou mot de passe incorrect.");
          return;
        }
        toast.success("Session ouverte.");
      }
      setPassword("");
      await refetch?.();
    } catch {
      toast.error("Connexion au serveur impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await authClient.signOut();
      await refetch?.();
      toast.message("Déconnecté.");
    } finally {
      setBusy(false);
    }
  }

  if (isPending) {
    return (
      <Card>
        <p className="text-sm text-muted">Vérification de la session…</p>
      </Card>
    );
  }

  if (data?.user) {
    return (
      <Card className="space-y-3">
        <p className="text-xs font-medium tracking-wide text-accent">Session ouverte</p>
        <p className="font-display font-semibold">{data.user.name}</p>
        <p className="text-sm text-muted">{data.user.email}</p>
        {!data.user.emailVerified ? (
          <p className="text-xs text-muted">E-mail non vérifié (confirmation par e-mail à venir).</p>
        ) : null}
        {showSignOut ? (
          <Button variant="outline" onClick={() => void signOut()} disabled={busy}>
            Se déconnecter
          </Button>
        ) : null}
      </Card>
    );
  }

  return (
    <Card className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode("login")}
          className={
            "min-h-11 rounded-lg text-sm font-medium " +
            (mode === "login" ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted")
          }
        >
          Se connecter
        </button>
        <button
          type="button"
          onClick={() => setMode("create")}
          className={
            "min-h-11 rounded-lg text-sm font-medium " +
            (mode === "create" ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted")
          }
        >
          Créer un compte
        </button>
      </div>

      <form className="space-y-3" onSubmit={(e) => void submit(e)}>
        {mode === "create" ? (
          <Field label="Nom">
            <Input
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>
        ) : null}
        <Field label="E-mail">
          <Input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="Mot de passe">
          <Input
            type="password"
            autoComplete={mode === "create" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </Field>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "…" : mode === "create" ? "Créer le compte" : "Connexion"}
        </Button>
      </form>
      <p className="text-xs text-muted">
        Mot de passe vérifié côté serveur, session sécurisée. Même compte sur PC et smartphone.
      </p>
    </Card>
  );
}
