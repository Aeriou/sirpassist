import { PLAN_CATALOG, type PaidTier, type PlanView } from "@/lib/plan";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PlanPicker({
  view,
  onPick,
}: {
  view: PlanView;
  onPick: (plan: PaidTier) => void;
}) {
  const current: PaidTier | "trial" | "guest" | "expired" =
    view.status === "basic" || view.status === "pro" ? view.status : view.status;
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display font-semibold">Forfaits</h2>
        <p className="text-sm text-muted">
          Basic 9,99 € : terrain. Pro 15 € : SIPP complet (RPS, PGP, plusieurs sites). 1er mois Pro
          offert avec un compte.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {(Object.keys(PLAN_CATALOG) as PaidTier[]).map((id) => {
          const p = PLAN_CATALOG[id];
          const active = current === id;
          const label =
            view.status === "guest"
              ? `Créer un compte — ${p.name}`
              : active
                ? "Forfait actif"
                : current === "basic" && id === "pro"
                  ? "Passer en Pro"
                  : `Choisir ${p.name} · ${p.label}`;
          return (
            <Card key={id} className={cn("flex flex-col space-y-3", active && "ring-1 ring-accent")}>
              <p className="text-xs font-medium tracking-wide text-accent">{p.name}</p>
              <p className="font-display text-xl font-semibold">{p.label}</p>
              <p className="text-sm text-muted">{p.blurb}</p>
              <ul className="space-y-1 text-sm text-muted">
                {p.features.map((f) => (
                  <li key={f}>· {f}</li>
                ))}
              </ul>
              {active ? (
                <p className="mt-auto text-sm text-ok">Forfait actif — droits appliqués.</p>
              ) : (
                <Button
                  type="button"
                  className="mt-auto w-full"
                  variant={id === "pro" ? "default" : "secondary"}
                  onClick={() => onPick(id)}
                >
                  {label}
                </Button>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}
