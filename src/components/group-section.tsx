import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth/client";
import {
  apiCancelJoinRequest,
  apiCreateWorkspace,
  apiDecideJoin,
  apiInviteMember,
  apiListJoinRequests,
  apiListMembers,
  apiListMyInvites,
  apiListSentInvites,
  apiListWorkspaces,
  apiRemoveMember,
  apiRespondInvite,
  apiRevokeInvite,
} from "@/lib/workspace-api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, NativeSelect } from "@/components/ui/input";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Group = {
  id: string;
  name: string;
  kind: string;
  code: string;
  role: "owner" | "member";
  status: "active" | "pending" | "invited";
  isOwner: boolean;
};

type Invite = { id: string; name: string; kind: string; owner_name: string };
type SentInvite = { user_id: string; email: string; name: string };
type JoinRequest = { user_id: string; email: string; name: string; requested_at: string };
type Member = {
  userId: string;
  email: string;
  name: string;
  role: "owner" | "member";
  isSelf: boolean;
};

/**
 * Groupes (modèle serveur). Le propriétaire crée un groupe et invite ses
 * collègues PAR E-MAIL ; chacun accepte l'invitation pour devenir membre.
 * Plus de code à recopier. Les anciennes demandes par code (statut `pending`)
 * restent gérables tant qu'il en existe.
 */
export function GroupSection() {
  const { data: session, isPending } = authClient.useSession();
  const signedIn = Boolean(session?.user);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!signedIn) {
      setGroups(null);
      setInvites([]);
      return;
    }
    try {
      const [ws, inv] = await Promise.all([apiListWorkspaces(), apiListMyInvites()]);
      if (ws.ok) setGroups(ws.workspaces);
      if (inv.ok) setInvites(inv.invites);
    } catch {
      /* réseau — on réessaiera au prochain rendu */
    }
  }, [signedIn]);

  useEffect(() => {
    void reload();
    if (!signedIn) return;
    const t = window.setInterval(() => void reload(), 30_000);
    return () => window.clearInterval(t);
  }, [reload, signedIn]);

  if (isPending) {
    return (
      <Card>
        <p className="text-sm text-muted">Vérification de la session…</p>
      </Card>
    );
  }

  if (!signedIn) {
    return (
      <Card className="space-y-2">
        <h2 className="font-display font-semibold">Groupe</h2>
        <p className="text-sm text-muted">
          Créez un groupe et <strong>invitez vos collègues par e-mail</strong>. Chacun accepte
          l'invitation pour rejoindre le groupe. Nécessite la connexion sécurisée.
        </p>
        <Button asChild variant="secondary">
          <Link to="/connexion">Se connecter</Link>
        </Button>
      </Card>
    );
  }

  const active = groups?.filter((g) => g.status === "active") ?? [];
  const pending = groups?.filter((g) => g.status === "pending") ?? [];

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div>
          <h2 className="font-display font-semibold">Groupe</h2>
          <p className="text-sm text-muted">
            Créez un groupe, puis invitez vos collègues <strong>par leur adresse e-mail</strong>.
            Ils reçoivent l'invitation ici et l'acceptent. Pas de code à recopier.
          </p>
        </div>
        <CreateGroupForm busy={busy} setBusy={setBusy} onDone={reload} />
      </Card>

      {invites.length > 0 ? <InvitesInbox invites={invites} onChange={reload} /> : null}

      {pending.map((g) => (
        <PendingCard key={g.id} group={g} onChange={reload} />
      ))}
      {active.map((g) => (
        <GroupCard key={g.id} group={g} onChange={reload} />
      ))}
      {groups && groups.length === 0 && invites.length === 0 ? (
        <p className="text-sm text-muted">Aucun groupe pour l'instant.</p>
      ) : null}
    </div>
  );
}

/** Invitations reçues — le compte accepte ou refuse. */
function InvitesInbox({
  invites,
  onChange,
}: {
  invites: Invite[];
  onChange: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function respond(workspaceId: string, accept: boolean) {
    setBusy(workspaceId);
    try {
      const res = await apiRespondInvite({ data: { workspaceId, accept } });
      if (!res.ok) toast.error("Invitation introuvable.");
      else toast.success(accept ? "Vous avez rejoint le groupe." : "Invitation refusée.");
      await onChange();
    } catch {
      toast.error("Action impossible (réseau).");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="space-y-2">
      <p className="text-xs font-medium tracking-wide text-accent">
        Invitations reçues ({invites.length})
      </p>
      <ul className="space-y-2">
        {invites.map((inv) => (
          <li
            key={inv.id}
            className="flex flex-col gap-2 rounded-lg bg-surface-2 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="min-w-0 text-sm">
              <span className="font-medium">« {inv.name} »</span>
              {inv.owner_name ? (
                <span className="text-muted"> · invité par {inv.owner_name}</span>
              ) : null}
            </span>
            <span className="flex shrink-0 gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busy === inv.id}
                onClick={() => void respond(inv.id, true)}
              >
                Rejoindre
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy === inv.id}
                onClick={() => void respond(inv.id, false)}
              >
                Refuser
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CreateGroupForm({
  busy,
  setBusy,
  onDone,
}: {
  busy: boolean;
  setBusy: (b: boolean) => void;
  onDone: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"entreprise" | "independant">("entreprise");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Nom du groupe requis.");
      return;
    }
    setBusy(true);
    try {
      const res = await apiCreateWorkspace({ data: { name: name.trim(), kind } });
      if (res.ok) {
        toast.success(`Groupe « ${res.workspace.name} » créé.`);
        setName("");
        await onDone();
      }
    } catch {
      toast.error("Création impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-2 border-t border-border pt-3" onSubmit={(e) => void submit(e)}>
      <p className="text-xs font-medium tracking-wide text-accent">Créer un groupe</p>
      <Field label="Nom du groupe">
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label="Type">
        <NativeSelect
          value={kind}
          onChange={(e) => setKind(e.target.value === "independant" ? "independant" : "entreprise")}
        >
          <option value="entreprise">Entreprise / groupe</option>
          <option value="independant">Indépendant</option>
        </NativeSelect>
      </Field>
      <Button type="submit" size="sm" disabled={busy}>
        Créer
      </Button>
    </form>
  );
}
/** Vue côté demandeur tant que le propriétaire n'a pas validé. */
function PendingCard({ group, onChange }: { group: Group; onChange: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);

  async function cancel() {
    setBusy(true);
    try {
      const res = await apiCancelJoinRequest({ data: { workspaceId: group.id } });
      if (res.ok) {
        toast.message("Demande annulée.");
        await onChange();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-2">
      <p className="text-xs font-medium tracking-wide text-warn">Demande en attente</p>
      <p className="text-sm">
        Demande envoyée à <span className="font-medium">« {group.name} »</span>. Vous y aurez accès
        dès que le responsable du groupe l'aura validée.
      </p>
      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void cancel()}>
        Annuler la demande
      </Button>
    </Card>
  );
}

function GroupCard({ group, onChange }: { group: Group; onChange: () => Promise<void> }) {
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [sent, setSent] = useState<SentInvite[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const timer = useRef<number | null>(null);

  const loadGroupData = useCallback(async () => {
    try {
      const [mb, rq, si] = await Promise.all([
        apiListMembers({ data: { workspaceId: group.id } }),
        group.isOwner
          ? apiListJoinRequests({ data: { workspaceId: group.id } })
          : Promise.resolve({ ok: false } as const),
        group.isOwner
          ? apiListSentInvites({ data: { workspaceId: group.id } })
          : Promise.resolve({ ok: false } as const),
      ]);
      if (mb.ok) setMembers(mb.members);
      if (rq.ok) setRequests(rq.requests);
      if (si.ok) setSent(si.invites);
    } catch {
      /* ignore */
    }
  }, [group.id, group.isOwner]);

  useEffect(() => {
    void loadGroupData();
    if (!group.isOwner) return;
    // Rafraîchit les demandes en attente toutes les 20 s pendant que la page est ouverte.
    timer.current = window.setInterval(() => void loadGroupData(), 20_000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [loadGroupData, group.isOwner]);

  async function manualRefresh() {
    setRefreshing(true);
    try {
      await loadGroupData();
    } finally {
      setRefreshing(false);
    }
  }

  async function decide(userId: string, approve: boolean) {
    setBusy(true);
    try {
      const res = await apiDecideJoin({
        data: { workspaceId: group.id, targetUserId: userId, approve },
      });
      if (res.ok) {
        toast.success(approve ? "Membre validé." : "Demande refusée.");
        await loadGroupData();
        await onChange();
      } else {
        toast.error("Action impossible.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(userId: string) {
    if (!window.confirm("Retirer ce membre du groupe ?")) return;
    setBusy(true);
    try {
      const res = await apiRemoveMember({ data: { workspaceId: group.id, targetUserId: userId } });
      if (res.ok) {
        toast.message("Membre retiré.");
        await loadGroupData();
      } else {
        toast.error(
          res.reason === "owner"
            ? "Impossible de retirer le propriétaire."
            : "Action impossible.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function revoke(userId: string) {
    setBusy(true);
    try {
      const res = await apiRevokeInvite({ data: { workspaceId: group.id, targetUserId: userId } });
      if (res.ok) {
        toast.message("Invitation annulée.");
        await loadGroupData();
      } else {
        toast.error("Action impossible.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-display font-semibold">{group.name}</p>
        <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-muted">
          {group.isOwner ? "Propriétaire" : "Membre"}
        </span>
      </div>

      {group.isOwner ? (
        <div className="space-y-3 border-t border-border pt-3">
          <InviteForm workspaceId={group.id} onDone={loadGroupData} />

          {sent.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium tracking-wide text-accent">
                  Invitations en attente ({sent.length})
                </p>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg"
                  onClick={() => void manualRefresh()}
                  disabled={refreshing}
                >
                  <RefreshCw className={refreshing ? "size-3.5 animate-spin" : "size-3.5"} />
                  Rafraîchir
                </button>
              </div>
              <ul className="space-y-2">
                {sent.map((s) => (
                  <li
                    key={s.user_id}
                    className="flex flex-col gap-2 rounded-lg bg-surface-2 p-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="min-w-0 text-sm">
                      <span className="font-medium">{s.name || "—"}</span>
                      <span className="break-all text-muted"> · {s.email}</span>
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void revoke(s.user_id)}
                    >
                      Annuler
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {requests.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium tracking-wide text-accent">
                Demandes reçues ({requests.length})
              </p>
              <ul className="space-y-2">
                {requests.map((r) => (
                  <li
                    key={r.user_id}
                    className="flex flex-col gap-2 rounded-lg bg-surface-2 p-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="min-w-0 text-sm">
                      <span className="font-medium">{r.name || "—"}</span>
                      <span className="break-all text-muted"> · {r.email}</span>
                    </span>
                    <span className="flex shrink-0 gap-2">
                      <Button type="button" size="sm" disabled={busy} onClick={() => void decide(r.user_id, true)}>
                        Valider
                      </Button>
                      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void decide(r.user_id, false)}>
                        Refuser
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-xs font-medium tracking-wide text-accent">
          Membres ({members.length})
        </p>
        <ul className="space-y-1.5">
          {members.map((m) => (
            <li
              key={m.userId}
              className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="min-w-0 text-sm">
                <span className="font-medium">{m.name || "—"}</span>
                {m.isSelf ? <span className="text-muted"> (vous)</span> : null}
                <span className="break-all text-muted">
                  {" · "}
                  {m.email}
                  {m.role === "owner" ? " · propriétaire" : ""}
                </span>
              </span>
              {group.isOwner && m.role !== "owner" && !m.isSelf ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void removeMember(m.userId)}
                >
                  Retirer
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-subtle">
        Partage des dossiers du groupe entre membres validés : prochaine mise à jour.
      </p>
    </Card>
  );
}

/** Champ « inviter un collègue par e-mail » (propriétaire). */
function InviteForm({
  workspaceId,
  onDone,
}: {
  workspaceId: string;
  onDone: () => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const to = email.trim().toLowerCase();
    if (!EMAIL_RE.test(to)) {
      toast.error("Adresse e-mail invalide.");
      return;
    }
    setBusy(true);
    try {
      const res = await apiInviteMember({ data: { workspaceId, email: to } });
      if (res.ok) {
        toast.success(`Invitation envoyée à ${res.name || res.email}.`);
        setEmail("");
        await onDone();
      } else {
        toast.error(
          res.reason === "unknown_user"
            ? "Aucun compte SiprAssist avec cette adresse."
            : res.reason === "already"
              ? "Cette personne est déjà membre ou déjà invitée."
              : res.reason === "self"
                ? "C'est votre propre adresse."
                : "Invitation impossible.",
        );
      }
    } catch {
      toast.error("Invitation impossible (réseau).");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-2" onSubmit={(e) => void submit(e)}>
      <p className="text-xs font-medium tracking-wide text-accent">Inviter un collègue</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="prenom.nom@exemple.be"
          className="sm:flex-1"
        />
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Envoi…" : "Inviter"}
        </Button>
      </div>
    </form>
  );
}
