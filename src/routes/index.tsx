import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  Camera,
  ClipboardCheck,
  FolderPlus,
  GitMerge,
  ScanLine,
  ShieldAlert,
  Timer,
  Users,
} from "lucide-react";
import { ArchiveMenu } from "@/components/archive-menu";
import { AnomalyCard } from "@/components/anomaly-card";
import { Photo } from "@/components/photo";
import { DeleteIconButton } from "@/components/confirm-delete";
import { ClasseursHome } from "@/components/classeurs-home";
import { DossierDialog } from "@/components/dossier-dialog";
import { PlanBanner } from "@/components/plan-banner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RiskBadge } from "@/components/risk-badge";
import { formatShortDate } from "@/lib/format";
import { apiListWorkspaces } from "@/lib/workspace-api";
import { currentAuthor, dueSoon, selectWorkspace, useSipr, useWorkspaceAnomalies, useWorkspaceVisits } from "@/lib/store";
import { DEMO_WORKSPACE_ID, visitLabel } from "@/lib/workspace";
import { usePlan } from "@/lib/use-plan";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const profile = useSipr((s) => s.profile);
  const visits = useWorkspaceVisits();
  const anomalies = useWorkspaceAnomalies();
  const workspace = useSipr(selectWorkspace);
  const users = useSipr((s) => s.users);
  const sessionUserId = useSipr((s) => s.sessionUserId);
  const removeVisit = useSipr((s) => s.removeVisit);
  const author = currentAuthor({ profile, users, sessionUserId });
  const conflicts = useSipr((s) => s.conflicts);
  const openConflicts =
    workspace?.id === DEMO_WORKSPACE_ID ? conflicts.filter((c) => c.status === "ouvert") : [];
  const inProgress = visits.filter((v) => v.status === "en_cours");
  const [dossierOpen, setDossierOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const open = anomalies.filter((a) => a.status !== "cloturee");
  const overdue = anomalies.filter((a) => a.status !== "cloturee" && dueSoon(a.dueDate));
  const extreme = anomalies.filter(
    (a) => a.kinney.level === "extreme" || a.kinney.level === "tres_eleve",
  );
  const greeting =
    profile.level === 1
      ? "Préparez le CPPT et la défense CBE."
      : profile.level === 2
        ? "Suivez les actions et uniformisez les rapports."
        : "Terminez la visite — le rapport s'écrit tout seul.";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return inProgress;
    return inProgress.filter((v) =>
      [visitLabel(v), v.company, v.site, v.interlocutor].some((s) => s.toLowerCase().includes(q)),
    );
  }, [inProgress, query]);
  const visible = query.trim() || showAll ? filtered : filtered.slice(0, 12);
  const independant = workspace?.kind === "independant";
  const { view: plan } = usePlan();

  return (
    <div className="min-w-0 space-y-6">
      <header>
        <p className="text-sm text-muted">Bonjour, {profile.name.split(" ")[0]}</p>
        <h1 className="mt-1 font-display text-2xl font-semibold md:text-3xl">{greeting}</h1>
        <p className="mt-2 text-sm text-muted">
          Espace {independant ? "indépendant" : "groupe"} « {workspace?.name} »
          — PGP dédié. Constats signés par {author.name}, {author.title} (N{author.level})
          {sessionUserId ? " — session ouverte." : "."}{" "}
          <Link to="/compte" className="text-accent">
            Comptes et espaces
          </Link>
        </p>
      </header>

      <PlanBanner view={plan} />

      {workspace?.id === DEMO_WORKSPACE_ID ? (
        <Card className="space-y-2">
          <p className="font-display font-semibold">Espace démo</p>
          <p className="text-sm text-muted">
            Les exemples Duquinexistepas / Toutvabien partagent un PGP de démonstration. Enregistrez-vous
            en entreprise (PGP commun au groupe) ou en indépendant (PGP personnel) pour isoler vos
            remarques.
          </p>
          <Button asChild>
            <Link to="/compte">Créer mon espace</Link>
          </Button>
        </Card>
      ) : null}

      <ArchiveMenu />

      {sessionUserId ? <MyGroups /> : null}

      <section className="min-w-0 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold">
              {independant ? "Clients / dossiers en cours" : "Visites en cours"}
            </h2>
            <p className="text-sm text-muted">
              {inProgress.length} ouvert{inProgress.length > 1 ? "s" : ""} — chaque nom = un
              client, un site, un bâtiment. Les autres restent en cours.
            </p>
          </div>
          <Button className="w-full shrink-0 sm:w-auto" onClick={() => setDossierOpen(true)}>
            <FolderPlus />
            {independant ? "Nouveau client" : "Nouveau dossier"}
          </Button>
        </div>

        {sessionUserId ? <ClasseursHome /> : null}

        {inProgress.length > 4 ? (
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={independant ? "Rechercher un client, un site…" : "Rechercher une visite…"}
            aria-label="Filtrer les dossiers"
          />
        ) : null}
        {inProgress.length === 0 ? (
          <p className="rounded-xl bg-surface px-4 py-5 text-sm text-muted shadow-[var(--shadow-border)]">
            Aucun dossier ouvert. Créez-en un ici — pas besoin d'attendre un constat.
          </p>
        ) : filtered.length === 0 ? (
          <p className="rounded-xl bg-surface px-4 py-5 text-sm text-muted shadow-[var(--shadow-border)]">
            Aucun dossier ne correspond à « {query} ».
          </p>
        ) : (
          <ul className="grid min-w-0 gap-3 sm:grid-cols-2">
            {visible.map((v) => (
              <li
                key={v.id}
                className="flex min-w-0 overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-border)]"
              >
                <Link
                  to="/visite/$id"
                  params={{ id: v.id }}
                  className="flex min-w-0 flex-1 overflow-hidden"
                >
                  <Photo
                    dataUrl={v.coverPhoto}
                    assetId={v.coverPhotoAssetId}
                    className="hidden h-28 w-28 shrink-0 object-cover sm:block"
                  />
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3 overflow-hidden p-4">
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <p className="text-xs font-medium tracking-wide text-accent">En cours</p>
                      <h3 className="mt-1 truncate font-display font-semibold">{visitLabel(v)}</h3>
                      <p className="truncate text-sm text-muted">
                        {v.company !== visitLabel(v) ? `${v.company} · ` : ""}
                        {v.site || "Adresse à préciser"} · {formatShortDate(v.date)}
                      </p>
                    </div>
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-dim text-accent">
                      <ArrowRight className="size-4" />
                    </span>
                  </div>
                </Link>
                <DeleteIconButton
                  label={independant ? "Supprimer le client" : "Supprimer le dossier"}
                  title={independant ? "Supprimer ce client / dossier ?" : "Supprimer ce dossier ?"}
                  description="Les constats de ce dossier sont retirés. Notices FDS et analyses RPS restent en bibliothèque, détachées."
                  confirmLabel="Supprimer"
                  onConfirm={() => {
                    removeVisit(v.id);
                    toast.message("Dossier supprimé.");
                  }}
                />
              </li>
            ))}
          </ul>
        )}
        {!query.trim() && !showAll && filtered.length > 12 ? (
          <Button variant="outline" className="w-full" onClick={() => setShowAll(true)}>
            Voir les {filtered.length} dossiers
          </Button>
        ) : null}
      </section>

      <DossierDialog open={dossierOpen} onOpenChange={setDossierOpen} />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Anomalies ouvertes" value={open.length} icon={ShieldAlert} />
        <Stat label="Priorité haute" value={extreme.length} icon={ClipboardCheck} warn />
        <Stat label="Actions dues" value={overdue.length} icon={Timer} warn={overdue.length > 0} />
        <Stat label="Visites" value={visits.length} icon={Camera} />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Quick to="/signalement" icon={Camera} title="Signalement" hint="Photo + dictée" />
        <Quick to="/rps" icon={Users} title="Analyse RPS" hint="Collectif, jamais nominatif" />
        <Quick to="/pgp" icon={ClipboardCheck} title="Plan PGP / PAA" hint="Thèmes du Code" />
        <Quick to="/fds" icon={ScanLine} title="Scanner FDS" hint="Notice + questions poste" />
      </section>

      {openConflicts.length > 0 ? (
        <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display font-semibold">Conflits de synchro</p>
            <p className="text-sm text-muted">
              {openConflicts.length} fiche{openConflicts.length > 1 ? "s" : ""} terrain / bureau à
              trancher (preuve CBE conservée).
            </p>
          </div>
          <Button asChild>
            <Link to="/conflits">
              <GitMerge />
              Trancher
            </Link>
          </Button>
        </Card>
      ) : null}

      {profile.level === 1 ? (
        <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display font-semibold">Tableau de bord CPPT</p>
            <p className="text-sm text-muted">
              Répartition Kinney, thématiques et préparation Inspection du bien-être (CBE).
            </p>
          </div>
          <Button asChild>
            <Link to="/tableau">Ouvrir</Link>
          </Button>
        </Card>
      ) : null}

      {profile.level === 2 && overdue.length > 0 ? (
        <Card>
          <p className="font-display font-semibold">Actions correctives en retard</p>
          <ul className="mt-3 space-y-2">
            {overdue.slice(0, 4).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                <Link to="/anomalie/$id" params={{ id: a.id }} className="min-w-0 truncate hover:text-accent">
                  {a.title}
                </Link>
                <RiskBadge level={a.kinney.level} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {profile.level === 3 ? (
        <p className="rounded-xl bg-accent-dim px-4 py-3 text-sm text-accent">
          Niveau terrain : plus de rapport à taper le soir. Chaque constat validé alimente déjà le PGP.
        </p>
      ) : null}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Derniers constats</h2>
          <Link to="/terrain" className="text-sm text-accent">
            Terrain
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {anomalies.slice(0, 4).map((a) => (
            <AnomalyCard key={a.id} anomaly={a} />
          ))}
        </div>
      </section>
    </div>
  );
}

type WsRow = {
  id: string;
  name: string;
  status: "active" | "invited" | "pending";
  isOwner: boolean;
};

/** Groupes de l'utilisateur, sur l'Accueil — repère visuel + accès direct à la
 *  gestion. Les invitations en attente se répondent dans /partages. */
function MyGroups() {
  const [rows, setRows] = useState<WsRow[]>([]);
  useEffect(() => {
    let alive = true;
    const tick = () => {
      apiListWorkspaces()
        .then((r) => {
          if (alive && r.ok) setRows(r.workspaces as WsRow[]);
        })
        .catch(() => {});
    };
    tick();
    const t = window.setInterval(tick, 30_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  const active = rows.filter((w) => w.status === "active");
  const waiting = rows.filter((w) => w.status !== "active").length;
  if (active.length === 0 && waiting === 0) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Users className="size-4 text-accent" />
          Mes groupes
        </h2>
        <Link to="/compte" className="text-sm text-accent">
          Gérer
        </Link>
      </div>
      {active.length > 0 ? (
        <>
          <ul className="flex flex-wrap gap-2">
            {active.map((w) => (
              <li key={w.id}>
                <Link
                  to="/compte"
                  className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-sm shadow-[var(--shadow-border)] transition-[box-shadow] hover:shadow-[var(--shadow-border-hover)]"
                >
                  {w.name}
                  {w.isOwner ? (
                    <span className="text-xs text-subtle">propriétaire</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-sm">
            <Link to="/classeurs-partages" className="text-accent">
              Voir les classeurs partagés dans mes groupes
            </Link>
          </p>
        </>
      ) : null}
      {waiting > 0 ? (
        <p className="text-sm text-muted">
          {waiting} invitation{waiting > 1 ? "s" : ""} en attente —{" "}
          <Link to="/partages" className="text-accent">
            répondre
          </Link>
        </p>
      ) : null}
    </section>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  warn,
}: {
  label: string;
  value: number;
  icon: typeof ShieldAlert;
  warn?: boolean;
}) {
  return (
    <Card className="p-3">
      <Icon className={cn("size-4", warn ? "text-danger" : "text-muted")} />
      <p className="mt-2 font-display text-2xl font-semibold tabular">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </Card>
  );
}

function Quick({
  to,
  icon: Icon,
  title,
  hint,
}: {
  to: string;
  icon: typeof Camera;
  title: string;
  hint: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)] transition-[box-shadow] duration-150 hover:shadow-[var(--shadow-border-hover)]"
    >
      <span className="flex size-11 items-center justify-center rounded-lg bg-accent-dim text-accent">
        <Icon className="size-5" />
      </span>
      <span>
        <span className="block font-medium">{title}</span>
        <span className="text-xs text-muted">{hint}</span>
      </span>
    </Link>
  );
}
