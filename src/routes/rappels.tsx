import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Mail } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatShortDate } from "@/lib/format";
import { buildReminders, LEVEL_REMINDER } from "@/lib/reminders";
import { useSipr, useWorkspaceAnomalies } from "@/lib/store";
import type { AdvisorLevel } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/rappels")({ component: RappelsPage });

function RappelsPage() {
  const pgp = useSipr((s) => s.pgp);
  const anomalies = useWorkspaceAnomalies();
  const profile = useSipr((s) => s.profile);
  const acked = useSipr((s) => s.ackedReminders);
  const ack = useSipr((s) => s.ackReminder);
  const all = useMemo(() => buildReminders(pgp, anomalies), [pgp, anomalies]);
  const [level, setLevel] = useState<AdvisorLevel | 0>(profile.level);
  const visible = all.filter((r) => (level === 0 ? true : r.level === level) && !acked.includes(r.id));
  const overdue = visible.filter((r) => r.kind === "depassee");

  async function enablePush() {
    if (typeof Notification === "undefined") {
      toast.message("Notifications navigateur indisponibles ici.");
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      toast.message("Autorisation refusée.");
      return;
    }
    const first = overdue[0] ?? visible[0];
    if (first) {
      new Notification(`SiprAssist · ${first.kind === "depassee" ? "Échéance dépassée" : "Rappel PGP"}`, {
        body: `${LEVEL_REMINDER[first.level].tag} — ${first.title}`,
      });
    }
    toast.success("Rappels navigateur activés.");
  }

  function email(r: (typeof all)[number]) {
    const subject = encodeURIComponent(
      `[SiprAssist ${LEVEL_REMINDER[r.level].tag}] ${r.kind === "depassee" ? "Échéance dépassée" : "Rappel"} — ${r.title}`,
    );
    const body = encodeURIComponent(
      `Action PGP ${pgp.paaYear}\n${r.title}\nMesure : ${r.measure}\nResponsable : ${r.owner}\nÉchéance : ${r.dueDate}\nNiveau : ${LEVEL_REMINDER[r.level].audience}\n\nGénéré par SiprAssist.`,
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold md:hidden">Rappels</h1>
          <p className="text-sm text-muted">
            Échéances du PAA, filtrées par niveau de responsabilité. E-mail ou notification push.
          </p>
        </div>
        <Button variant="secondary" onClick={enablePush}>
          <Bell />
          Activer les push
        </Button>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {([0, 1, 2, 3] as const).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setLevel(n)}
            className={cn(
              "min-h-11 rounded-full px-3 text-sm font-medium",
              level === n ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted shadow-[var(--shadow-border)]",
            )}
          >
            {n === 0 ? "Tous" : `N${n}`}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3">
          <p className="font-display text-2xl font-semibold tabular">{overdue.length}</p>
          <p className="text-xs text-muted">Dépassées</p>
        </Card>
        <Card className="p-3">
          <p className="font-display text-2xl font-semibold tabular">{visible.length - overdue.length}</p>
          <p className="text-xs text-muted">À 7 jours</p>
        </Card>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted">Aucun rappel actif pour ce filtre.</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((r) => (
            <li key={r.id} className="rounded-xl bg-surface p-3 shadow-[var(--shadow-border)]">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={r.kind === "depassee" ? "high" : "mid"}>
                  {r.kind === "depassee" ? "Dépassée" : "Approche"}
                </Badge>
                <Badge tone="accent">{LEVEL_REMINDER[r.level].tag}</Badge>
                <span className="text-xs text-subtle">{LEVEL_REMINDER[r.level].audience}</span>
              </div>
              <p className="mt-2 font-medium">{r.title}</p>
              <p className="text-sm text-muted">{r.measure}</p>
              <p className="mt-1 text-xs text-subtle">
                {r.owner || "Non assigné"} · {formatShortDate(r.dueDate)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => email(r)}>
                  <Mail />
                  E-mail
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link to="/pgp">Ouvrir le PAA</Link>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => ack(r.id)}>
                  Marquer lu
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
