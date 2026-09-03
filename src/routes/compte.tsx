import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { AuthPanel } from "@/components/auth-panel";
import { doSignOut } from "@/lib/auth/sign-out";
import { GroupSection } from "@/components/group-section";
import { AccountPendingBanner, PendingAccountsAdmin } from "@/components/account-approval";
import { PlanBanner } from "@/components/plan-banner";
import { PlanPicker } from "@/components/plan-picker";
import { WorkspaceSwipeRow } from "@/components/workspace-swipe";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { confirmCheckout } from "@/lib/billing-api";
import { openStripePortal, subscribeWithStripe } from "@/lib/billing-client";
import { planHeadline, planView } from "@/lib/plan";
import { selectWorkspace, useSipr } from "@/lib/store";
import { DEMO_WORKSPACE_ID } from "@/lib/workspace";
import type { AccountKind } from "@/lib/types";

type Search = { billing?: string; session_id?: string };

export const Route = createFileRoute("/compte")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    billing: typeof s.billing === "string" ? s.billing : undefined,
    session_id: typeof s.session_id === "string" ? s.session_id : undefined,
  }),
  component: ComptePage,
});

function ComptePage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const users = useSipr((s) => s.users);
  const sessionUserId = useSipr((s) => s.sessionUserId);
  const workspace = useSipr(selectWorkspace);
  const switchWorkspace = useSipr((s) => s.switchWorkspace);
  const workspaces = useSipr((s) => s.workspaces);
  const session = users.find((u) => u.id === sessionUserId);
  const removeWorkspace = useSipr((s) => s.removeWorkspace);
  const activatePlan = useSipr((s) => s.activatePlan);
  const anomalies = useSipr((s) => s.anomalies);
  const rps = useSipr((s) => s.rps);
  const plan = useMemo(
    () => planView(session, anomalies.filter((a) => !a.demo).length + rps.filter((r) => !r.demo).length),
    [session, anomalies, rps],
  );
  const [gate, setGate] = useState<"login" | "create">("login");

  useEffect(() => {
    if (plan.admin && session && session.plan !== "pro") activatePlan("pro");
  }, [plan.admin, session?.id, session?.plan, activatePlan]);

  useEffect(() => {
    if (search.billing === "cancel") {
      toast.message("Paiement annulé.");
      void navigate({ to: "/compte", search: {}, replace: true });
      return;
    }
    if (search.billing !== "success" || !search.session_id || !session) return;
    let cancelled = false;
    void (async () => {
      const res = await confirmCheckout({
        data: { sessionId: search.session_id! },
      });
      if (cancelled) return;
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      activatePlan(res.plan, { stripeCustomerId: res.customerId, stripeSubscriptionId: res.subscriptionId });
      // Le forfait serveur est déjà persisté par `confirmCheckout` (Neon
      // sipr_billing) + le webhook Stripe — plus d'écriture Supabase ici.
      toast.success(res.plan === "basic" ? "Forfait Basic 9,99 € / mois activé." : "Forfait Pro 15 € / mois activé.");
      void navigate({ to: "/compte", search: {}, replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [search.billing, search.session_id, session?.id]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold md:hidden">Comptes CP</h1>
        <p className="text-sm text-muted">
          Compte : 1er mois Pro offert, puis Basic 9,99 € (terrain) ou Pro 15 € (SIPP). Sans compte :
          5 signalements.
        </p>
      </header>

      <AccountPendingBanner />
      <PendingAccountsAdmin />

      {!session ? (
        <PlanBanner
          view={plan}
          onCreateAccount={() => {
            setGate("create");
            window.requestAnimationFrame(() => {
              document.getElementById("compte-gate")?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
          }}
        />
      ) : null}

      {!plan.admin ? (
        <PlanPicker
          view={plan}
          onPick={(tier) => {
            if (!session) {
              setGate("create");
              toast.message("Créez un compte, puis choisissez Basic ou Pro.");
              window.requestAnimationFrame(() => {
                document.getElementById("compte-gate")?.scrollIntoView({ behavior: "smooth", block: "start" });
              });
              return;
            }
            void subscribeWithStripe(session, tier);
          }}
        />
      ) : null}

      {session ? (
        <Card className="space-y-3">
          <p className="text-xs font-medium tracking-wide text-accent">Session ouverte</p>
          <p className="font-display font-semibold">{session.name}</p>
          <p className="text-sm text-muted">
            {session.title} · N{session.level} · {session.email}
          </p>
          <p className="text-sm text-muted">{planHeadline(plan)}</p>
          <p className="text-sm text-muted">
            {plan.status === "pro" || plan.status === "trial"
              ? "Droits : signalements, RPS, PGP, plusieurs espaces."
              : plan.status === "basic"
                ? "Droits Basic : signalements, visites, FDS, 1 espace. RPS et PGP = Pro."
                : "Choisissez Basic ou Pro pour continuer après l'essai."}
          </p>
          {session.stripeCustomerId && !plan.admin ? (
            <Button variant="outline" onClick={() => void openStripePortal()}>
              Gérer la facturation
            </Button>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={doSignOut}>
              Se déconnecter
            </Button>
          </div>
        </Card>
      ) : null}

      {!session ? (
        <div id="compte-gate" className="scroll-mt-20">
          <AuthPanel showSignOut={false} />
        </div>
      ) : null}

      {workspace ? (
        <WorkspaceCard
          workspace={workspace}
          demo={workspace.id === DEMO_WORKSPACE_ID}
          title={session?.title ?? workspace.name}
          level={session?.level}
          organisation={session?.organisation || workspace.name}
        />
      ) : null}

      <GroupSection />

      {workspaces.length > 0 ? (
        <Card className="space-y-3">
          <h2 className="font-display font-semibold">Espaces sur cet appareil</h2>
          <p className="text-sm text-muted">
            Poubelle ou glissement vers la gauche, puis confirmation. Démo et espaces utilisateur
            peuvent être retirés de cet appareil.
          </p>
          <ul className="space-y-1.5">
            {workspaces.map((w) => (
              <WorkspaceSwipeRow
                key={w.id}
                workspace={w}
                active={w.id === workspace?.id}
                onSelect={() => {
                  switchWorkspace(w.id);
                  toast.success(`Espace « ${w.name} » actif.`);
                }}
                onDelete={() => {
                  removeWorkspace(w.id);
                }}
              />
            ))}
          </ul>
        </Card>
      ) : null}

    </div>
  );
}

function WorkspaceCard({
  workspace,
  demo,
  title,
  level,
  organisation,
}: {
  workspace: { id: string; name: string; kind: AccountKind; code: string };
  demo: boolean;
  title: string;
  level?: number;
  organisation: string;
}) {
  return (
    <Card className="space-y-3">
      <p className="text-xs font-medium tracking-wide text-accent">Espace actif</p>
      <p className="font-display text-lg font-semibold">{organisation || workspace.name}</p>
      <p className="text-sm text-muted">
        {[title, level ? `N${level}` : null].filter(Boolean).join(" · ")}
      </p>
      {demo ? (
        <p className="rounded-lg bg-warn/15 px-3 py-2 text-sm text-warn">
          Espace démo — créez un compte pour un PGP dédié.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-mono text-sm tracking-widest">{workspace.code}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(workspace.code);
              toast.success("Code copié.");
            }}
          >
            <Copy />
            Copier le code
          </Button>
        </div>
      )}
    </Card>
  );
}
