import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Building2, Copy, UserRound } from "lucide-react";
import { toast } from "sonner";
import { CloudCard } from "@/components/cloud-card";
import { GroupSection } from "@/components/group-section";
import { PlanBanner } from "@/components/plan-banner";
import { PlanPicker } from "@/components/plan-picker";
import { WorkspaceSwipeRow } from "@/components/workspace-swipe";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { confirmCheckout } from "@/lib/billing-api";
import { openStripePortal, subscribeWithStripe } from "@/lib/billing-client";
import {
  accountLogin,
  accountSalt,
  accountSetBilling,
  accountUpsert,
  pullSnapshot,
  pushSnapshot,
  buildSnapshot,
} from "@/lib/cloud-sync";
import { hashPassword } from "@/lib/password";
import { isAdminEmail, planHeadline, planView } from "@/lib/plan";
import { matchesBootstrapPassword, passwordMatchesUser } from "@/lib/admin-account";
import {
  consumeBackupCode,
  hashBackupCode,
  randomBackupCodes,
  randomTotpSecret,
  totpUri,
  verifyTotp,
} from "@/lib/totp";
import { selectWorkspace, useSipr } from "@/lib/store";
import { uid } from "@/lib/utils";
import { DEMO_WORKSPACE_ID } from "@/lib/workspace";
import type { AccountKind, AdvisorLevel, SiprUser } from "@/lib/types";
import { cn } from "@/lib/utils";

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
  const addUser = useSipr((s) => s.addUser);
  const signInUser = useSipr((s) => s.signInUser);
  const signOutUser = useSipr((s) => s.signOutUser);
  const workspace = useSipr(selectWorkspace);
  const createWorkspace = useSipr((s) => s.createWorkspace);
  const joinWorkspace = useSipr((s) => s.joinWorkspace);
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
        data: { sessionId: search.session_id!, email: session.email },
      });
      if (cancelled) return;
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      activatePlan(res.plan, { stripeCustomerId: res.customerId, stripeSubscriptionId: res.subscriptionId });
      await accountSetBilling({
        email: session.email,
        plan: res.plan,
        customerId: res.customerId,
        subscriptionId: res.subscriptionId,
      });
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
            <Button variant="outline" onClick={() => void openStripePortal(session.stripeCustomerId!)}>
              Gérer la facturation
            </Button>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => {
                signOutUser();
                toast.message("Déconnecté. Les dossiers restent sur l'appareil.");
              }}
            >
              Se déconnecter
            </Button>
          </div>
        </Card>
      ) : null}
      {session ? <SecurityCard session={session} workspaceCode={workspace && workspace.id !== DEMO_WORKSPACE_ID ? workspace.code : undefined} /> : null}
      {!session ? (
        <div id="compte-gate" className="scroll-mt-20 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={cn(
                "min-h-11 rounded-lg text-sm font-medium",
                gate === "login" ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted",
              )}
              onClick={() => setGate("login")}
            >
              Se connecter
            </button>
            <button
              type="button"
              className={cn(
                "min-h-11 rounded-lg text-sm font-medium",
                gate === "create" ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted",
              )}
              onClick={() => setGate("create")}
            >
              Créer un compte
            </button>
          </div>
          {gate === "login" ? (
            <LoginForm users={users} onLogin={signInUser} onNeedCreate={() => setGate("create")} />
          ) : (
            <CreateForm
              existingEmails={users.map((u) => u.email)}
              onCreate={async (data) => {
                if (users.some((u) => u.email === data.email.toLowerCase())) {
                  toast.error("Cet e-mail existe déjà.");
                  return;
                }
                const applyCloud = useSipr.getState().applyCloudSnapshot;
                let workspaceId = workspace?.id ?? DEMO_WORKSPACE_ID;
                if (data.kind === "independant") {
                  const ws = createWorkspace({
                    kind: "independant",
                    name: data.organisation.trim() || `Cabinet ${data.name}`,
                  });
                  workspaceId = ws.id;
                } else if (data.joinCode.trim()) {
                  const ws = joinWorkspace(data.joinCode);
                  if (ws) {
                    workspaceId = ws.id;
                  } else {
                    const remote = await pullSnapshot(data.joinCode);
                    if (!remote.ok) {
                      toast.error("Code groupe introuvable (local et cloud).");
                      return;
                    }
                    applyCloud(remote.snapshot);
                    workspaceId = remote.snapshot.workspace.id;
                  }
                } else {
                  const ws = createWorkspace({
                    kind: "entreprise",
                    name: data.organisation.trim() || "Groupe SIPP",
                  });
                  workspaceId = ws.id;
                }
                const { salt, passwordHash } = await hashPassword(data.password);
                const userId = uid("user");
                addUser({
                  id: userId,
                  name: data.name,
                  email: data.email.toLowerCase(),
                  title: data.title,
                  level: data.level,
                  organisation: data.organisation,
                  kind: data.kind,
                  workspaceId,
                  salt,
                  passwordHash,
                  createdAt: new Date().toISOString(),
                });
                const s = useSipr.getState();
                const ws = s.workspaces.find((w) => w.id === workspaceId);
                const created = s.users.find((u) => u.id === userId);
                if (ws && created && ws.id !== DEMO_WORKSPACE_ID) {
                  const snap = buildSnapshot({
                    workspace: ws,
                    visits: s.visits,
                    anomalies: s.anomalies,
                    fds: s.fds,
                    rps: s.rps,
                    pgp: s.pgp,
                    users: s.users,
                    deleted: s.deleted,
                  });
                  const pushed = await pushSnapshot(ws.code, ws.id, snap);
                  const acc = await accountUpsert(created, ws.code);
                  if (pushed.ok && acc.ok) {
                    toast.success("Compte créé — 1er mois offert. Cloud prêt : même e-mail sur un autre appareil.");
                  } else if ((!acc.ok && acc.reason === "setup") || (!pushed.ok && pushed.reason === "setup")) {
                    toast.success("Compte créé. Mettez à jour le script SQL (Copie cloud) pour le multi-appareils.");
                  } else {
                    toast.success("Compte créé — 1er mois offert, session ouverte.");
                  }
                } else {
                  toast.success("Compte créé — 1er mois offert, dossiers liés à cet espace. Session ouverte.");
                }
              }}
            />
          )}
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

      <CloudCard />

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

      <JoinForm
        onJoin={async (code) => {
          const applyCloud = useSipr.getState().applyCloudSnapshot;
          const local = joinWorkspace(code);
          const remote = await pullSnapshot(code);
          if (local) {
            if (remote.ok) applyCloud(remote.snapshot);
            toast.success(`Rejoint « ${local.name} » — PGP commun au groupe.`);
            return;
          }
          if (remote.ok) {
            applyCloud(remote.snapshot);
            toast.success(`Espace « ${remote.snapshot.workspace.name} » chargé depuis le cloud.`);
            return;
          }
          if (remote.reason === "setup") {
            toast.error("Copie cloud pas encore initialisée — exécutez le SQL une fois.");
            return;
          }
          toast.error("Code inconnu. Vérifiez le code groupe, ou synchronisez d'abord l'espace d'origine.");
        }}
      />
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

function JoinForm({ onJoin }: { onJoin: (code: string) => void | Promise<void> }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <h2 className="mb-1 font-display font-semibold">Rejoindre / retrouver un espace</h2>
      <p className="mb-3 text-sm text-muted">
        Code groupe ou code de synchro : charge les dossiers déjà créés (même appareil ou copie
        cloud).
      </p>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!code.trim()) return;
          setBusy(true);
          void Promise.resolve(onJoin(code)).finally(() => {
            setBusy(false);
            setCode("");
          });
        }}
      >
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Code à 6 caractères"
          className="font-mono tracking-widest sm:flex-1"
          maxLength={8}
        />
        <Button type="submit" disabled={busy}>
          {busy ? "Recherche…" : "Rejoindre"}
        </Button>
      </form>
    </Card>
  );
}

function LoginForm({
  users,
  onLogin,
  onNeedCreate,
}: {
  users: SiprUser[];
  onLogin: (id: string) => void;
  onNeedCreate?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function completeLogin(id: string) {
    const state = useSipr.getState();
    const user = state.users.find((u) => u.id === id);
    onLogin(id);
    const ws = state.workspaces.find((w) => w.id === (user?.homeWorkspaceId ?? user?.workspaceId));
    if (ws && ws.id !== DEMO_WORKSPACE_ID) {
      const remote = await Promise.race([
        pullSnapshot(ws.code),
        new Promise<{ ok: false }>((resolve) => window.setTimeout(() => resolve({ ok: false }), 8000)),
      ]);
      if (remote.ok) useSipr.getState().applyCloudSnapshot(remote.snapshot);
    }
    toast.success("Session ouverte.");
  }

  async function afterPassword(user: SiprUser) {
    useSipr.getState().addUser(user, { session: false });
    const live = useSipr.getState().users.find((u) => u.id === user.id || u.email === user.email) ?? user;
    if (live.totpEnabled && live.totpSecret) {
      setPendingId(live.id);
      toast.message("Entrez le code de l'application d'authentification.");
      return;
    }
    await completeLogin(live.id);
  }

  async function submitOtp(e: FormEvent) {
    e.preventDefault();
    if (!pendingId) return;
    setBusy(true);
    try {
      const user = useSipr.getState().users.find((u) => u.id === pendingId);
      if (!user?.totpSecret) {
        toast.error("Double authentification indisponible. Reconnectez-vous.");
        setPendingId(null);
        return;
      }
      const totpOk = await verifyTotp(user.totpSecret, otp);
      if (!totpOk) {
        const backup = await consumeBackupCode(otp, user.totpBackupHashes ?? []);
        if (!backup.ok) {
          toast.error("Code incorrect.");
          return;
        }
        useSipr.getState().addUser({ ...user, totpBackupHashes: backup.remaining }, { session: false });
      }
      setPendingId(null);
      setOtp("");
      await completeLogin(user.id);
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const mail = email.trim().toLowerCase();
    setBusy(true);
    try {
      const local = users.find((x) => x.email === mail);
      if (local && (await passwordMatchesUser(password, local))) {
        await afterPassword(local);
        return;
      }
      if (isAdminEmail(mail) && (await matchesBootstrapPassword(password)) && !local) {
        const state = useSipr.getState();
        const ws = state.createWorkspace({ kind: "independant", name: "Espace personnel" });
        const hashed = await hashPassword(password);
        await afterPassword({
          id: uid("user"),
          name: "Conseiller",
          email: mail,
          title: "Conseiller en prévention",
          level: 3,
          organisation: "",
          kind: "independant",
          workspaceId: ws.id,
          homeWorkspaceId: ws.id,
          salt: hashed.salt,
          passwordHash: hashed.passwordHash,
          createdAt: new Date().toISOString(),
          plan: "pro",
        });
        return;
      }

      const saltRes = await Promise.race([
        accountSalt(mail),
        new Promise<{ ok: false; reason: "error" }>((resolve) =>
          window.setTimeout(() => resolve({ ok: false, reason: "error" }), 8000),
        ),
      ]);
      if (!saltRes.ok) {
        if ("reason" in saltRes && saltRes.reason === "setup") {
          window.dispatchEvent(new Event("sipr-need-sql"));
          toast.message("Collez le script SQL une fois (carte Copie cloud plus bas), puis reconnectez-vous.");
          return;
        }
        toast.error("E-mail inconnu sur cet appareil. Créez un compte, ou saisissez le code d'espace plus bas.");
        onNeedCreate?.();
        return;
      }
      const { passwordHash } = await hashPassword(password, saltRes.salt);
      const login = await Promise.race([
        accountLogin(mail, passwordHash),
        new Promise<{ ok: false; reason: "error" }>((resolve) =>
          window.setTimeout(() => resolve({ ok: false, reason: "error" }), 8000),
        ),
      ]);
      if (!login.ok) {
        if (login.reason === "setup") {
          window.dispatchEvent(new Event("sipr-need-sql"));
          toast.message("Collez le script SQL une fois (carte Copie cloud plus bas), puis reconnectez-vous.");
          return;
        }
        toast.error("E-mail ou mot de passe incorrect.");
        return;
      }
      if (login.snapshot) useSipr.getState().applyCloudSnapshot(login.snapshot);
      else if (login.joinCode) {
        const remote = await pullSnapshot(login.joinCode);
        if (remote.ok) useSipr.getState().applyCloudSnapshot(remote.snapshot);
      }
      await afterPassword(login.user);
    } catch {
      toast.error("Connexion interrompue. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  if (pendingId) {
    return (
      <Card>
        <h2 className="mb-1 font-display font-semibold">Double authentification</h2>
        <p className="mb-3 text-sm text-muted">Code à 6 chiffres de l'application, ou un code de secours.</p>
        <form className="space-y-3" onSubmit={(e) => void submitOtp(e)}>
          <Field label="Code">
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
            />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Vérification…" : "Valider"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => {
              setPendingId(null);
              setOtp("");
            }}
          >
            Retour
          </Button>
        </form>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="mb-1 font-display font-semibold">Se connecter</h2>
      <p className="mb-3 text-sm text-muted">
        Même e-mail et mot de passe sur PC et smartphone. Les dossiers de l'espace entreprise ou
        indépendant sont chargés depuis le cloud.
      </p>
      <form className="space-y-3" onSubmit={(e) => void submit(e)}>
        <Field label="E-mail">
          <Input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Mot de passe">
          <Input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Connexion…" : "Connexion"}
        </Button>
      </form>
    </Card>
  );
}

function CreateForm({
  existingEmails,
  onCreate,
}: {
  existingEmails: string[];
  onCreate: (d: {
    name: string;
    email: string;
    password: string;
    title: string;
    level: AdvisorLevel;
    organisation: string;
    kind: AccountKind;
    joinCode: string;
  }) => Promise<void>;
}) {
  const profile = useSipr((s) => s.profile);
  const demoIdentity = profile.name === "Camille Dubois";
  const [kind, setKind] = useState<AccountKind>("entreprise");
  const [mode, setMode] = useState<"create" | "join">("create");
  const [form, setForm] = useState({
    name: demoIdentity ? "" : profile.name,
    email: "",
    password: "",
    title: demoIdentity ? "Conseiller en prévention" : profile.title,
    level: profile.level,
    organisation: demoIdentity ? "" : profile.organisation,
    joinCode: "",
  });
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (form.password.length < 6) {
      toast.error("Mot de passe : 6 caractères minimum.");
      return;
    }
    if (existingEmails.includes(form.email.trim().toLowerCase())) {
      toast.error("Cet e-mail existe déjà.");
      return;
    }
    if (kind === "entreprise" && mode === "create" && !form.organisation.trim()) {
      toast.error("Indiquez le nom de l'entreprise ou du groupe.");
      return;
    }
    if (kind === "entreprise" && mode === "join" && !form.joinCode.trim()) {
      toast.error("Saisissez le code groupe.");
      return;
    }
    setBusy(true);
    try {
      await onCreate({ ...form, kind, joinCode: mode === "join" ? form.joinCode : "" });
      setForm({ ...form, password: "", email: "", joinCode: "" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-1 font-display font-semibold">Créer un conseiller</h2>
      <p className="mb-3 text-sm text-muted">
        Illimité dès le compte : 1er mois offert, puis 15 € / mois. Sans compte : 5 signalements ou
        analyses.
      </p>
      <form className="space-y-3" onSubmit={(e) => void submit(e)}>
        <fieldset>
          <legend className="mb-2 text-xs font-medium tracking-wide text-muted">Statut</legend>
          <div className="grid grid-cols-2 gap-2">
            <KindButton
              active={kind === "entreprise"}
              icon={Building2}
              title="Entreprise / groupe"
              hint="PGP commun"
              onClick={() => setKind("entreprise")}
            />
            <KindButton
              active={kind === "independant"}
              icon={UserRound}
              title="Indépendant"
              hint="PGP personnel"
              onClick={() => {
                setKind("independant");
                setMode("create");
              }}
            />
          </div>
        </fieldset>

        {kind === "entreprise" ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode("create")}
              className={cn(
                "min-h-11 rounded-lg text-sm",
                mode === "create" ? "bg-accent-dim text-accent" : "bg-surface-2 text-muted",
              )}
            >
              Créer l'espace
            </button>
            <button
              type="button"
              onClick={() => setMode("join")}
              className={cn(
                "min-h-11 rounded-lg text-sm",
                mode === "join" ? "bg-accent-dim text-accent" : "bg-surface-2 text-muted",
              )}
            >
              Rejoindre
            </button>
          </div>
        ) : null}

        <Field label="Nom">
          <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="E-mail">
          <Input
            type="email"
            required
            autoComplete="username"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field label="Mot de passe">
          <Input
            type="password"
            required
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
        <Field label="Fonction">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        {kind === "entreprise" && mode === "join" ? (
          <Field label="Code groupe">
            <Input
              required
              value={form.joinCode}
              onChange={(e) => setForm({ ...form, joinCode: e.target.value.toUpperCase() })}
              className="font-mono tracking-widest"
              placeholder="ABC12D"
              maxLength={8}
            />
          </Field>
        ) : (
          <Field label={kind === "independant" ? "Cabinet / dénomination" : "Nom de l'entreprise ou du groupe"}>
            <Input
              required={kind === "entreprise"}
              value={form.organisation}
              onChange={(e) => setForm({ ...form, organisation: e.target.value })}
              placeholder={kind === "independant" ? "Cabinet Dubois Prévention" : "Ateliers…"}
            />
          </Field>
        )}
        <Field label="Niveau">
          <NativeSelect
            value={form.level}
            onChange={(e) => setForm({ ...form, level: Number(e.target.value) as AdvisorLevel })}
          >
            <option value={3}>N3 — Terrain</option>
            <option value={2}>N2 — Gestion des risques</option>
            <option value={1}>N1 — Chef de service SIPP</option>
          </NativeSelect>
        </Field>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Création…" : "Créer le compte et ouvrir la session"}
        </Button>
      </form>
    </Card>
  );
}

function SecurityCard({ session, workspaceCode }: { session: SiprUser; workspaceCode?: string }) {
  const patchSessionUser = useSipr((s) => s.patchSessionUser);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [backupShown, setBackupShown] = useState<string[] | null>(null);

  async function persist(patch: Partial<SiprUser>) {
    patchSessionUser(patch);
    if (!workspaceCode) return;
    const live = useSipr.getState().users.find((u) => u.id === session.id);
    if (live) void accountUpsert(live, workspaceCode);
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (next.length < 6) {
      toast.error("Nouveau mot de passe : 6 caractères minimum.");
      return;
    }
    if (next !== confirm) {
      toast.error("La confirmation ne correspond pas.");
      return;
    }
    setBusy(true);
    try {
      if (!(await passwordMatchesUser(current, session))) {
        toast.error("Mot de passe actuel incorrect.");
        return;
      }
      const hashed = await hashPassword(next);
      await persist({ salt: hashed.salt, passwordHash: hashed.passwordHash });
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Mot de passe mis à jour.");
    } finally {
      setBusy(false);
    }
  }

  async function startTotp() {
    setSetupSecret(randomTotpSecret());
    setSetupCode("");
    setBackupShown(null);
  }

  async function confirmTotp(e: FormEvent) {
    e.preventDefault();
    if (!setupSecret) return;
    setBusy(true);
    try {
      if (!(await verifyTotp(setupSecret, setupCode))) {
        toast.error("Code incorrect. Vérifiez l'heure du téléphone.");
        return;
      }
      const codes = randomBackupCodes();
      const hashes = await Promise.all(codes.map(hashBackupCode));
      await persist({
        totpSecret: setupSecret,
        totpEnabled: true,
        totpBackupHashes: hashes,
      });
      setBackupShown(codes);
      setSetupSecret(null);
      setSetupCode("");
      toast.success("Double authentification activée.");
    } finally {
      setBusy(false);
    }
  }

  async function disableTotp() {
    if (!window.confirm("Désactiver la double authentification ?")) return;
    await persist({ totpSecret: "", totpEnabled: false, totpBackupHashes: [] });
    setBackupShown(null);
    toast.message("2FA désactivée.");
  }

  const uri = setupSecret ? totpUri(session.email, setupSecret) : "";

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-display font-semibold">Sécurité</h2>
        <p className="text-sm text-muted">Mot de passe et double authentification (application TOTP).</p>
      </div>
      <form className="space-y-3" onSubmit={(e) => void changePassword(e)}>
        <p className="text-xs font-medium tracking-wide text-accent">Mot de passe</p>
        <Field label="Actuel">
          <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </Field>
        <Field label="Nouveau">
          <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
        </Field>
        <Field label="Confirmation">
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? "Enregistrement…" : "Enregistrer le mot de passe"}
        </Button>
      </form>
      <div className="space-y-3 border-t border-border pt-4">
        <p className="text-xs font-medium tracking-wide text-accent">Double authentification</p>
        {session.totpEnabled ? (
          <>
            <p className="text-sm text-ok">2FA active. Un code est demandé à chaque connexion.</p>
            <Button type="button" variant="outline" onClick={() => void disableTotp()}>
              Désactiver
            </Button>
          </>
        ) : setupSecret ? (
          <form className="space-y-3" onSubmit={(e) => void confirmTotp(e)}>
            <p className="text-sm text-muted">Ajoutez cette clé dans Authenticator, Authy ou Google Authenticator.</p>
            <p className="break-all font-mono text-sm tracking-widest">{setupSecret}</p>
            <a className="text-sm text-accent underline" href={uri}>
              Ouvrir l'application d'authentification
            </a>
            <Field label="Code à 6 chiffres">
              <Input inputMode="numeric" autoComplete="one-time-code" value={setupCode} onChange={(e) => setSetupCode(e.target.value)} required />
            </Field>
            <Button type="submit" disabled={busy}>
              Activer
            </Button>
          </form>
        ) : (
          <Button type="button" variant="secondary" onClick={() => void startTotp()}>
            Activer la 2FA
          </Button>
        )}
        {backupShown ? (
          <div className="space-y-2 rounded-lg bg-surface-2 p-3">
            <p className="text-sm">Codes de secours — à conserver hors de l'appareil :</p>
            <ul className="font-mono text-sm">
              {backupShown.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function KindButton({
  active,
  icon: Icon,
  title,
  hint,
  onClick,
}: {
  active: boolean;
  icon: typeof Building2;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-20 flex-col items-start justify-center gap-1 rounded-xl px-3 text-left",
        active ? "bg-accent text-accent-fg" : "bg-surface-2 text-fg shadow-[var(--shadow-border)]",
      )}
    >
      <Icon className="size-4" />
      <span className="text-sm font-medium">{title}</span>
      <span className={cn("text-xs", active ? "text-accent-fg/80" : "text-muted")}>{hint}</span>
    </button>
  );
}
