import { Link, useRouterState } from "@tanstack/react-router";
import { blockedMessage, planHeadline, type PlanView } from "@/lib/plan";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function PlanBanner({
  view,
  onCreateAccount,
}: {
  view: PlanView;
  onCreateAccount?: () => void;
}) {
  if (view.status === "pro") return null;
  const blocked = !view.canRecord;
  const onCompte = useRouterState({ select: (s) => s.location.pathname === "/compte" });
  return (
    <Card className={blocked ? "space-y-3 bg-warn/10" : "space-y-2"}>
      <p className="text-xs font-medium tracking-wide text-accent">Accès</p>
      <p className="font-display font-semibold">{planHeadline(view)}</p>
      <p className="text-sm text-muted">
        {blocked
          ? blockedMessage(view)
          : view.status === "guest"
            ? "Sans compte : 5 signalements. Un compte : 1er mois Pro offert, puis Basic 9,99 € ou Pro 15 € / mois."
            : view.status === "basic"
              ? "Terrain illimité. RPS, PGP et PAA sont dans Pro (15 € / mois)."
              : "Essai Pro : tout est ouvert. Ensuite Basic 9,99 € (terrain) ou Pro 15 € (SIPP complet)."}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        {view.status === "guest" ? (
          onCompte ? (
            <Button type="button" className="w-full sm:w-auto" onClick={onCreateAccount}>
              Créer un compte
            </Button>
          ) : (
            <Button asChild className="w-full sm:w-auto">
              <Link to="/compte">Se connecter / créer un compte</Link>
            </Button>
          )
        ) : null}
        {view.status === "trial" || view.status === "expired" || view.status === "basic" ? (
          onCompte ? null : (
            <Button variant={view.status === "basic" ? "outline" : "default"} asChild className="w-full sm:w-auto">
              <Link to="/compte">{view.status === "basic" ? "Passer en Pro" : "Choisir un forfait"}</Link>
            </Button>
          )
        ) : null}
      </div>
    </Card>
  );
}
