import { createFileRoute, Link } from "@tanstack/react-router";
import { Layers } from "lucide-react";
import { AuthPanel } from "@/components/auth-panel";
import { GroupClasseursReceived } from "@/components/group-classeurs-received";
import { authClient } from "@/lib/auth/client";

export const Route = createFileRoute("/classeurs-partages")({ component: SharedClasseursPage });

function SharedClasseursPage() {
  const { data: session, isPending } = authClient.useSession();

  if (!isPending && !session?.user) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="font-display text-2xl font-semibold md:hidden">Classeurs de groupe</h1>
          <p className="text-sm text-muted">Connectez-vous pour voir les classeurs mis en commun.</p>
        </header>
        <AuthPanel showSignOut={false} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold">
          <Layers className="size-5 text-accent" />
          Classeurs de groupe
        </h1>
        <p className="text-sm text-muted">
          En lecture seule. Retrouvez-les aussi sur{" "}
          <Link to="/partages" className="text-accent">
            Partages
          </Link>{" "}
          et{" "}
          <Link to="/groupe" className="text-accent">
            Groupe
          </Link>
          .
        </p>
      </header>
      <GroupClasseursReceived />
    </div>
  );
}
