import { createFileRoute } from "@tanstack/react-router";
import { AuthPanel } from "@/components/auth-panel";

/**
 * Connexion serveur (Better Auth). La session pilote toute l'application
 * via `SessionBridge`.
 */
export const Route = createFileRoute("/connexion")({ component: ConnexionPage });

function ConnexionPage() {
  return (
    <div className="mx-auto max-w-md space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold">Connexion</h1>
        <p className="text-sm text-muted">
          Mot de passe vérifié et session gérés côté serveur. Une fois connecté, vous l'êtes
          dans toute l'application.
        </p>
      </header>
      <AuthPanel />
    </div>
  );
}
