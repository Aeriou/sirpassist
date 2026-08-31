import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";

/**
 * Phase 2 — nouvelle authentification serveur (Better Auth, e-mail + mot de passe).
 *
 * Page de test isolée : ne touche pas encore à la page « Compte » existante.
 * La vérification du mot de passe, le hachage et la session se font côté serveur
 * (`/api/auth/*`), la session est un cookie `__Host-` signé.
 */
export const Route = createFileRoute("/connexion")({ component: ConnexionPage });

function ConnexionPage() {
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

  return (
    <div className="mx-auto max-w-md space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold">Connexion sécurisée</h1>
        <p className="text-sm text-muted">
          Nouvelle authentification : mot de passe vérifié et session gérées côté serveur.
          Page de test — la page « Compte » actuelle n'est pas encore migrée.
        </p>
      </header>

      {isPending ? (
        <Card>
          <p className="text-sm text-muted">Vérification de la session…</p>
        </Card>
      ) : data?.user ? (
        <Card className="space-y-3">
          <p className="text-xs font-medium tracking-wide text-accent">Session ouverte (serveur)</p>
          <p className="font-display font-semibold">{data.user.name}</p>
          <p className="text-sm text-muted">{data.user.email}</p>
          <p className="text-sm text-muted">
            id : <span className="font-mono">{data.user.id}</span>
            {data.user.emailVerified ? " · e-mail vérifié" : " · e-mail non vérifié"}
          </p>
          <Button variant="outline" onClick={() => void signOut()} disabled={busy}>
            Se déconnecter
          </Button>
        </Card>
      ) : (
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
              {busy
                ? "…"
                : mode === "create"
                  ? "Créer le compte"
                  : "Connexion"}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
