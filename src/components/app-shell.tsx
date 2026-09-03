import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Camera,
  ClipboardList,
  GitMerge,
  House,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  ScanLine,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Logo } from "./logo";
import { Button } from "./ui/button";
import { Dialog, DialogContent } from "./ui/dialog";
import { Field, Input } from "./ui/input";
import { useOnline } from "@/lib/online";
import { doSignOut } from "@/lib/auth/sign-out";
import { apiShareInboxCount } from "@/lib/share-api";
import { apiListMyInvites } from "@/lib/workspace-api";
import { apiListPendingAccounts } from "@/lib/account-api";
import { apiListSupportTickets } from "@/lib/support-api";
import { TwoFactorCard } from "./two-factor-card";
import { DeleteAccountButton } from "./delete-account";
import { toast } from "sonner";
import { buildReminders } from "@/lib/reminders";
import { selectWorkspace, useSipr, useWorkspaceAnomalies } from "@/lib/store";
import { DEMO_WORKSPACE_ID } from "@/lib/workspace";
import { initials } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { AdvisorLevel } from "@/lib/types";
import { readPgpVue, type PgpVue } from "@/components/pgp-tabs";

const NAV = [
  { to: "/", label: "Accueil", icon: House, primary: false },
  { to: "/terrain", label: "Mes visites", icon: ClipboardList, primary: false },
  { to: "/signalement", label: "Signaler", icon: Camera, primary: true },
  { to: "/pgp", label: "PGP", icon: ShieldCheck, primary: false },
  { to: "/fds", label: "FDS", icon: ScanLine, primary: false },
] as const;

const LEVELS: { value: AdvisorLevel; tag: string; label: string }[] = [
  { value: 3, tag: "N3", label: "Terrain / PME" },
  { value: 2, tag: "N2", label: "Gestion des risques" },
  { value: 1, tag: "N1", label: "Chef de service SIPP" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const urlSearch = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const [pgpVue, setPgpVue] = useState<PgpVue>("recap");
  const profile = useSipr((s) => s.profile);
  const sessionUserId = useSipr((s) => s.sessionUserId);
  const resetDemo = useSipr((s) => s.resetDemo);
  const pgp = useSipr((s) => s.pgp);
  const anomalies = useWorkspaceAnomalies();
  const activeWorkspaceId = useSipr((s) => s.activeWorkspaceId);
  const acked = useSipr((s) => s.ackedReminders);
  const conflicts = useSipr((s) => s.conflicts);
  const online = useOnline();
  const [open, setOpen] = useState(false);
  // Anti-clignotement (React #418) : tant que le store persistant n'est pas
  // réhydraté, le serveur et le premier rendu client montrent le MÊME squelette
  // — pas de contenu « démo » remplacé ensuite.
  const [booted, setBooted] = useState(() => useSipr.persist.hasHydrated());
  const reminderCount = useMemo(
    () => buildReminders(pgp, anomalies).filter((r) => !acked.includes(r.id)).length,
    [pgp, anomalies, acked],
  );
  const conflictCount =
    activeWorkspaceId === DEMO_WORKSPACE_ID
      ? conflicts.filter((c) => c.status === "ouvert").length
      : 0;

  // La réhydratation du store est pilotée par <SessionBridge> (clé localStorage
  // par compte). Ne pas réhydrater ici : cela chargerait la clé par défaut
  // avant que le compte soit connu.

  useEffect(() => {
    setPgpVue(readPgpVue());
    setOpen(false);
    document.body.style.removeProperty("pointer-events");
    document.body.style.removeProperty("overflow");
    if (pathname && !pathname.startsWith("/support")) {
      try {
        sessionStorage.setItem("sipr-last-page", pathname);
      } catch {
        /* private mode */
      }
    }
  }, [pathname]);

  useEffect(() => {
    if (open) return;
    document.body.style.removeProperty("pointer-events");
    document.body.style.removeProperty("overflow");
  }, [open]);

  useEffect(() => {
    if (booted) return;
    if (useSipr.persist.hasHydrated()) {
      setBooted(true);
      return;
    }
    const unsub = useSipr.persist.onFinishHydration(() => setBooted(true));
    // Filet de sécurité : ne jamais rester bloqué sur le squelette.
    const t = window.setTimeout(() => setBooted(true), 2500);
    return () => {
      unsub();
      window.clearTimeout(t);
    };
  }, [booted]);

  const pgpTab: PgpVue =
    pathname.startsWith("/pgp") && urlSearch.vue === "actions" ? "actions" : pathname.startsWith("/pgp") ? "recap" : pgpVue;

  const title = pageTitle(pathname, urlSearch);

  if (!booted) return <AppBootSkeleton />;

  return (
    <div className="stripe min-h-dvh bg-bg text-fg">
      <aside className="fixed top-0 left-0 hidden h-dvh w-60 flex-col border-r border-border bg-surface md:flex">
        <div className="px-4 py-5">
          <Logo />
          <p className="mt-1 text-xs text-subtle">Assistant SIPP de terrain</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map((n) => (
            <SideLink
              key={n.to}
              to={n.to}
              active={isActive(pathname, n.to)}
              icon={n.icon}
              pgpVue={n.to === "/pgp" ? pgpTab : undefined}
            >
              {n.label}
            </SideLink>
          ))}
          <SideLink to="/rps" active={isActive(pathname, "/rps")} icon={Users}>
            RPS
          </SideLink>
          <SideLink
            to="/tableau"
            active={pathname.startsWith("/tableau")}
            icon={LayoutDashboard}
          >
            Tableau CPPT
          </SideLink>
          <SideLink to="/rappels" active={pathname.startsWith("/rappels")} icon={Bell}>
            Rappels
          </SideLink>
          <SideLink to="/conflits" active={pathname.startsWith("/conflits")} icon={GitMerge}>
            Conflits
          </SideLink>
          {sessionUserId ? <PartagesSideLink active={pathname.startsWith("/partages")} /> : null}
          {sessionUserId ? (
            <SideLink
              to="/groupe"
              active={
                pathname.startsWith("/groupe") || pathname.startsWith("/classeurs-partages")
              }
              icon={Users}
            >
              Groupe
            </SideLink>
          ) : null}
          <SideLink to="/support" active={pathname.startsWith("/support")} icon={LifeBuoy}>
            Support
          </SideLink>
          {sessionUserId ? (
            <button
              type="button"
              onClick={doSignOut}
              className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
            >
              <LogOut className="size-4" />
              Se déconnecter
            </button>
          ) : null}
        </nav>
        <div className="p-3">
          <button type="button" className="w-full text-left" onClick={() => setOpen(true)}>
            <ProfileButton />
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-bg/90 px-4 py-3 backdrop-blur-sm md:hidden">
        <Logo />
        <div className="flex items-center gap-1">
          <IconLink to="/conflits" count={conflictCount} label="Conflits de données" icon={GitMerge} tone="warn" />
          <RemindersLink count={reminderCount} />
          {sessionUserId ? <SharesLink /> : null}
          {sessionUserId ? <PendingAccountsLink /> : null}
          <SupportLink />
          <button
            type="button"
            className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold"
            aria-label="Profil"
            onClick={() => setOpen(true)}
          >
            {initials(profile.name)}
          </button>
        </div>
      </header>

      <Dialog open={open} onOpenChange={setOpen}>
        <ProfileDialog
          onReset={() => {
            resetDemo();
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      </Dialog>

      <main className="md:ml-60">
        <div className="hidden items-center justify-between px-8 pt-6 md:flex">
          <h1 className="font-display text-xl font-semibold">{title}</h1>
          <div className="flex items-center gap-2">
            <IconLink to="/conflits" count={conflictCount} label="Conflits de données" icon={GitMerge} tone="warn" />
            <RemindersLink count={reminderCount} />
            {sessionUserId ? <SharesLink /> : null}
            {sessionUserId ? <PendingAccountsLink /> : null}
            <SupportLink />
            <button type="button" className="text-left" onClick={() => setOpen(true)}>
              <ProfileButton />
            </button>
          </div>
        </div>
        {online && conflictCount > 0 ? (
          <div className="mx-auto w-full max-w-5xl px-4 pt-3 md:px-8">
            <Link
              to="/conflits"
              className="block rounded-xl bg-warn/15 px-3 py-2 text-sm text-warn"
            >
              {conflictCount} conflit{conflictCount > 1 ? "s" : ""} terrain / bureau — à trancher
              avant le CPPT.
            </Link>
          </div>
        ) : null}
        {!online ? (
          <div className="mx-auto w-full max-w-5xl px-4 pt-3 md:px-8">
            <p className="rounded-xl bg-warn/15 px-3 py-2 text-sm text-warn">
              Hors-ligne — photos, dictées et constats restent sur l'appareil. Synchro automatique au
              retour du réseau.
            </p>
          </div>
        ) : null}
        <div className="mx-auto w-full min-w-0 max-w-5xl px-4 pb-28 pt-4 md:px-8 md:pb-12 md:pt-4">
          {children}
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-sm md:hidden">
        <ul className="grid grid-cols-5">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = isActive(pathname, n.to);
            return (
              <li key={n.to} className="flex justify-center">
                <Link
                  to={n.to}
                  search={n.to === "/pgp" ? { vue: pgpTab } : undefined}
                  className={cn(
                    "flex min-h-12 w-full flex-col items-center justify-center gap-0.5 text-xs font-medium",
                    n.primary && !active && "text-accent",
                    active ? "text-accent" : "text-muted",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-lg",
                      n.primary && "bg-accent text-accent-fg",
                      active && !n.primary && "bg-accent-dim",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  {n.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

/** Écran d'attente pendant la réhydratation du store. Markup 100 % statique :
 *  identique côté serveur et au premier rendu client (pas de mismatch #418). */
function AppBootSkeleton() {
  return (
    <div className="stripe min-h-dvh bg-bg text-fg">
      <aside className="fixed top-0 left-0 hidden h-dvh w-60 flex-col border-r border-border bg-surface md:flex">
        <div className="px-4 py-5">
          <Logo />
          <p className="mt-1 text-xs text-subtle">Assistant SIPP de terrain</p>
        </div>
        <div className="flex flex-1 flex-col gap-2 px-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-surface-2" />
          ))}
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-bg/90 px-4 py-3 md:hidden">
        <Logo />
      </header>

      <main className="md:ml-60">
        <div className="mx-auto w-full max-w-5xl space-y-4 px-4 pt-8 md:px-8">
          <div className="h-7 w-1/2 animate-pulse rounded-lg bg-surface-2" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-surface-2" />
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface-2" />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function RemindersLink({ count }: { count: number }) {
  return <IconLink to="/rappels" count={count} label="Rappels d'actions" icon={Bell} />;
}

/** Partages ciblés en attente + invitations de groupe — un seul compteur,
 *  partagé par la pastille d'en-tête et le lien latéral. */
function useInboxCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const tick = () => {
      Promise.all([
        apiShareInboxCount().catch(() => null),
        apiListMyInvites().catch(() => null),
      ])
        .then(([shares, invites]) => {
          if (!alive) return;
          const s = shares && shares.ok ? shares.count : 0;
          const i = invites && invites.ok ? invites.invites.length : 0;
          setCount(s + i);
        })
        .catch(() => {
          /* réseau : on retentera */
        });
    };
    tick();
    const t = window.setInterval(tick, 20_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);
  return count;
}

function SharesLink() {
  const count = useInboxCount();
  return (
    <IconLink to="/partages" count={count} label="Partages et invitations" icon={Inbox} tone="warn" />
  );
}

function PendingAccountsLink() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const tick = () => {
      apiListPendingAccounts()
        .then((r) => {
          if (alive) setCount(r.ok ? r.pending.length : 0);
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
  if (count === 0) return null;
  return (
    <IconLink to="/compte" count={count} label="Comptes à valider" icon={UserCheck} tone="warn" />
  );
}

/** Lien Support (toujours visible) + pastille du nombre de demandes à traiter
 *  (propriétaire uniquement — 0 pour les autres). */
function SupportLink() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const tick = () => {
      apiListSupportTickets()
        .then((r) => {
          if (alive) setCount(r.ok ? r.unreviewed : 0);
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
  return (
    <IconLink to="/support" count={count} label="Support" icon={LifeBuoy} tone="warn" />
  );
}

function IconLink({
  to,
  count,
  label,
  icon: Icon,
  tone = "danger",
}: {
  to: "/rappels" | "/conflits" | "/partages" | "/compte" | "/support";
  count: number;
  label: string;
  icon: typeof Bell;
  tone?: "danger" | "warn";
}) {
  return (
    <Link
      to={to}
      className="relative flex size-11 items-center justify-center rounded-full bg-surface-2 text-fg"
      aria-label={label}
    >
      <Icon className="size-4" />
      {count > 0 ? (
        <span
          className={cn(
            "absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full px-1 text-xs font-semibold",
            tone === "warn" ? "bg-warn text-warn-fg" : "bg-danger text-danger-fg",
          )}
        >
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </Link>
  );
}

function pageTitle(path: string, search?: Record<string, unknown>) {
  if (path === "/") return "Accueil";
  if (path.startsWith("/terrain")) return "Mes visites";
  if (path.startsWith("/signalement")) return "Signaler";
  if (path.startsWith("/pgp")) return search?.vue === "actions" ? "Actions PAA" : "Récap PAA";
  if (path.startsWith("/paa")) return "PAA";
  if (path.startsWith("/fds/") && path !== "/fds") return "Notice FDS";
  if (path.startsWith("/fds")) return "FDS";
  if (path.startsWith("/rps/") && path !== "/rps") return "Analyse RPS";
  if (path.startsWith("/rps")) return "RPS collectif";
  if (path.startsWith("/tableau")) return "Tableau de bord";
  if (path.startsWith("/rapport")) return "Rapport";
  if (path.startsWith("/visite")) return "Visite";
  if (path.startsWith("/anomalie")) return "Constat";
  if (path.startsWith("/rappels")) return "Rappels";
  if (path.startsWith("/partages")) return "Partages";
  if (path.startsWith("/classeurs-partages")) return "Classeurs de groupe";
  if (path.startsWith("/classeur")) return "Classeur";
  if (path.startsWith("/groupe")) return "Groupe";
  if (path.startsWith("/compte")) return "Comptes";
  if (path.startsWith("/support")) return "Support";
  return "SiprAssist";
}

function isActive(path: string, to: string) {
  if (to === "/") return path === "/";
  if (to === "/pgp" && path.startsWith("/paa")) return true;
  return path === to || path.startsWith(`${to}/`);
}

function SideLink({
  to,
  active,
  icon: Icon,
  children,
  pgpVue,
  count = 0,
}: {
  to:
    | (typeof NAV)[number]["to"]
    | "/tableau"
    | "/rappels"
    | "/conflits"
    | "/partages"
    | "/groupe"
    | "/support"
    | "/rps";
  active: boolean;
  icon: typeof House;
  children: string;
  pgpVue?: PgpVue;
  count?: number;
}) {
  return (
    <Link
      to={to}
      search={to === "/pgp" ? { vue: pgpVue ?? "recap" } : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150",
        active ? "bg-accent-dim text-accent" : "text-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      <Icon className="size-4" />
      <span className="flex-1">{children}</span>
      {count > 0 ? (
        <span className="flex min-w-5 items-center justify-center rounded-full bg-warn px-1.5 text-xs font-semibold text-warn-fg">
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </Link>
  );
}

function PartagesSideLink({ active }: { active: boolean }) {
  const count = useInboxCount();
  return (
    <SideLink to="/partages" active={active} icon={Inbox} count={count}>
      Partages
    </SideLink>
  );
}

function ProfileButton() {
  const profile = useSipr((s) => s.profile);
  const workspace = useSipr(selectWorkspace);
  return (
    <span className="flex w-full items-center gap-3 rounded-xl bg-surface-2 p-2.5 shadow-[var(--shadow-border)]">
      <span className="flex size-9 items-center justify-center rounded-full bg-accent-dim text-xs font-semibold text-accent">
        {initials(profile.name)}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-medium">{profile.name}</span>
        <span className="block truncate text-xs text-muted">
          N{profile.level} · {workspace?.name ?? profile.title}
        </span>
      </span>
    </span>
  );
}

function ProfileDialog({ onReset, onClose }: { onReset: () => void; onClose: () => void }) {
  const profile = useSipr((s) => s.profile);
  const setProfile = useSipr((s) => s.setProfile);
  const patchSessionUser = useSipr((s) => s.patchSessionUser);
  const sessionUserId = useSipr((s) => s.sessionUserId);
  const users = useSipr((s) => s.users);
  const workspace = useSipr(selectWorkspace);
  const session = users.find((u) => u.id === sessionUserId);

  // Éditer l'identité locale ET, si connecté, le compte — sinon la modif est
  // écrasée à la prochaine connexion.
  function updateIdentity(patch: { name?: string; title?: string; level?: AdvisorLevel }) {
    setProfile(patch);
    if (session) patchSessionUser(patch);
  }

  return (
    <DialogContent
      title="Conseiller"
      description="Identité et espace PGP — entreprise (partagé) ou indépendant (personnel)."
    >
      <div className="space-y-4">
        {workspace ? (
          <p className="rounded-lg bg-accent-dim px-3 py-2 text-sm text-accent">
            PGP {workspace.kind === "independant" ? "personnel" : "de groupe"} · {workspace.name}
            {workspace.kind === "entreprise" ? ` · code ${workspace.code}` : ""}
          </p>
        ) : null}

        <div className="space-y-3">
          <p className="text-xs font-medium tracking-wide text-accent">Mes informations</p>
          <Field label="Nom">
            <Input
              value={profile.name}
              onChange={(e) => updateIdentity({ name: e.target.value })}
            />
          </Field>
          <Field label="Fonction">
            <Input
              value={profile.title}
              onChange={(e) => updateIdentity({ title: e.target.value })}
            />
          </Field>
          <fieldset>
            <legend className="mb-2 text-xs font-medium tracking-wide text-muted">Niveau</legend>
            <div className="grid gap-1.5">
              {LEVELS.map((l) => (
                <button
                  key={l.value}
                  type="button"
                  onClick={() => updateIdentity({ level: l.value })}
                  className={cn(
                    "flex min-h-11 items-center justify-between rounded-lg px-3 text-left text-sm",
                    profile.level === l.value
                      ? "bg-accent text-accent-fg"
                      : "bg-surface-2 text-fg shadow-[var(--shadow-border)]",
                  )}
                >
                  <span>{l.label}</span>
                  <span className="font-mono text-xs">{l.tag}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              toast.success("Informations enregistrées.");
              onClose();
            }}
          >
            Enregistrer
          </Button>
          <p className="text-center text-xs text-muted">
            Vos changements sont gardés dès la saisie — ce bouton ferme simplement la fenêtre.
          </p>
        </div>

        <TwoFactorCard />

        {session ? (
          <>
            <p className="rounded-lg bg-accent-dim px-3 py-2 text-sm text-accent">
              Session {session.name} · {session.email}
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                onClose();
                doSignOut();
              }}
            >
              Se déconnecter
            </Button>
            <DeleteAccountButton />
          </>
        ) : (
          <p className="text-xs text-muted">
            Mode appareil (5 signalements / analyses). Un compte retrouve vos dossiers sur un autre
            appareil (code + e-mail) et ouvre l'illimité : 1er mois offert, puis 15 € / mois.
          </p>
        )}

        <div className="grid gap-2">
          <Button variant="outline" className="w-full" asChild>
            <Link to="/" onClick={onClose}>
              Accueil
            </Link>
          </Button>
          <Button variant="outline" className="w-full" asChild>
            <Link to="/support" onClick={onClose}>
              Support · bug ou amélioration
            </Link>
          </Button>
          <Button className="w-full" asChild>
            <Link to="/compte" onClick={onClose}>
              {session ? "Comptes · entreprise ou indépendant" : "Se connecter / créer un compte"}
            </Link>
          </Button>
        </div>

        <Button variant="outline" className="w-full" onClick={onReset}>
          Réinitialiser la démo
        </Button>
      </div>
    </DialogContent>
  );
}
