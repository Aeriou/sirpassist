import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth/client";
import {
  apiCancelJoinRequest,
  apiCreateWorkspace,
  apiDecideJoin,
  apiListJoinRequests,
  apiListMembers,
  apiListWorkspaces,
  apiRemoveMember,
  apiRequestJoin,
} from "@/lib/workspace-api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, NativeSelect } from "@/components/ui/input";

type Group = {
  id: string;
  name: string;
  kind: string;
  code: string;
  role: "owner" | "member";
  status: "active" | "pending";
  isOwner: boolean;
};

type JoinRequest = { user_id: string; email: string; name: string; requested_at: string };
type Member = {
  userId: string;
  email: string;
  name: string;
  role: "owner" | "member";
  isSelf: boolean;
};

/**
 * Groupes validés (modèle serveur). Rejoindre = demande ; le propriétaire
 * valide avant tout accès. Isolé de l'ancienne carte « Espaces ».
 */
export function GroupSection() {
  const { data: session, isPending } = authClient.useSession();
  const signedIn = Boolean(session?.user);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!signedIn) {
      setGroups(null);
      return;
    }
    try {
      const res = await apiListWorkspaces();
      if (res.ok) setGroups(res.workspaces);
    } catch {
      /* réseau — on réessaiera au prochain rendu */
    }
  }, [signedIn]);

  useEffect(() => {
    void reload();
  }, [reload]);

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
        <h2 className="font-display font-semibold">Groupe validé</h2>
        <p className="text-sm text-muted">
          Créez un groupe, partagez un code, et <strong>validez chaque personne</strong> avant
          qu'elle n'y accède. Ce système utilise la connexion sécurisée.
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
          <h2 className="font-display font-semibold">Groupe validé</h2>
          <p className="text-sm text-muted">
            Partagez le code du groupe. La personne envoie une demande, vous la validez, puis
            elle rejoint le groupe. Un mauvais code ne donne accès à rien.
          </p>
        </div>
        <CreateGroupForm busy={busy} setBusy={setBusy} onDone={reload} />
        <JoinGroupForm busy={busy} setBusy={setBusy} onDone={reload} />
      </Card>

      {pending.map((g) => (
        <PendingCard key={g.id} group={g} onChange={reload} />
      ))}
      {active.map((g) => (
        <GroupCard key={g.id} group={g} onChange={reload} />
      ))}
      {groups && groups.length === 0 ? (
        <p className="text-sm text-muted">Aucun groupe pour l'instant.</p>
      ) : null}
    </div>
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
        toast.success(`Groupe « ${res.workspace.name} » créé. Code : ${res.workspace.code}`);
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

function JoinGroupForm({
  busy,
  setBusy,
  onDone,
}: {
  busy: boolean;
  setBusy: (b: boolean) => void;
  onDone: () => Promise<void>;
}) {
  const [code, setCode] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiRequestJoin({ data: { code } });
      if (res.ok === false) {
        toast.error(res.reason === "unknown" ? "Code inconnu." : "Code invalide (6 caractères).");
      } else if (res.status === "active") {
        toast.success(`Vous êtes déjà membre de « ${res.workspaceName} ».`);
      } else {
        toast.success(`Demande envoyée à « ${res.workspaceName} » — en attente de validation.`);
      }
      setCode("");
      await onDone();
    } catch {
      toast.error("Demande impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-2 border-t border-border pt-3" onSubmit={(e) => void submit(e)}>
      <p className="text-xs font-medium tracking-wide text-accent">Rejoindre un groupe</p>
      <Field label="Code du groupe">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={6}
          className="font-mono tracking-widest"
          placeholder="ABC234"
          required
        />
      </Field>
      <Button type="submit" size="sm" variant="secondary" disabled={busy}>
        Envoyer la demande
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
  const [members, setMembers] = useState<Member[]>([]);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const timer = useRef<number | null>(null);

  const loadGroupData = useCallback(async () => {
    try {
      // Tout membre actif voit la liste des membres ; seules les demandes en
      // attente sont réservées au propriétaire.
      const tasks: [Promise<unknown>, Promise<unknown>] = [
        apiListMembers({ data: { workspaceId: group.id } }),
        group.isOwner
          ? apiListJoinRequests({ data: { workspaceId: group.id } })
          : Promise.resolve({ ok: false } as const),
      ];
      const [mb, rq] = (await Promise.all(tasks)) as [
        Awaited<ReturnType<typeof apiListMembers>>,
        Awaited<ReturnType<typeof apiListJoinRequests>>,
      ];
      if (mb.ok) setMembers(mb.members);
      if (rq.ok) setRequests(rq.requests);
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

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-display font-semibold">{group.name}</p>
        <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-muted">
          {group.isOwner ? "Propriétaire" : "Membre"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm tracking-widest">{group.code}</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(group.code);
            toast.success("Code copié.");
          }}
        >
          <Copy />
          Copier le code
        </Button>
      </div>

      {group.isOwner ? (
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium tracking-wide text-accent">
              Demandes en attente ({requests.length})
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
          {requests.length === 0 ? (
            <p className="text-sm text-muted">Aucune demande.</p>
          ) : (
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
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() => void decide(r.user_id, true)}
                    >
                      Valider
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void decide(r.user_id, false)}
                    >
                      Refuser
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
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
