import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthPanel } from "@/components/auth-panel";
import { AccountPendingBanner } from "@/components/account-approval";
import { GroupSection } from "@/components/group-section";
import { GroupClasseursReceived } from "@/components/group-classeurs-received";
import { MyClasseursShare } from "@/components/my-classeurs-share";
import { authClient } from "@/lib/auth/client";

export const Route = createFileRoute("/groupe")({ component: GroupePage });

function GroupePage() {
  const { data: session, isPending } = authClient.useSession();

  if (!isPending && !session?.user) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="font-display text-2xl font-semibold md:hidden">Groupe</h1>
          <p className="text-sm text-muted">
            Connectez-vous pour créer un groupe, inviter des collègues et mettre des classeurs en
            commun.
          </p>
        </header>
        <AuthPanel showSignOut={false} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold md:hidden">Groupe</h1>
        <p className="text-sm text-muted">
          Créez un groupe, invitez par e-mail, puis partagez des classeurs entiers (lecture seule
          pour les membres). Le partage ciblé d'un dossier ou d'un constat reste sur{" "}
          <Link to="/partages" className="text-accent">
            Partages
          </Link>
          .
        </p>
      </header>

      <AccountPendingBanner />
      <MyClasseursShare />
      <GroupClasseursReceived />
      <GroupSection />
    </div>
  );
}
