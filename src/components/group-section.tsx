import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth/client";
import {
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
 * Groupes validés (nouveau modèle serveur). Rejoindre = demande ; le
 * propriétaire valide avant tout accès. Isolé de l'ancienne carte « Espaces ».
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

      {groups?.map((g) => (
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

function GroupCard({ group, onChange }: { group: Group; onChange: () => Promise<void> }) {
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [busy, setBusy] = useState(false);

  const loadOwnerData = useCallback(async () => {
    if (!group.isOwner) return;
    try {
      const [rq, mb] = await Promise.all([
        apiListJoinRequests({ data: { workspaceId: group.id } }),
        apiListMembers({ data: { workspaceId: group.id } }),
      ]);
      if (rq.ok) setRequests(rq.requests);
      if (mb.ok) setMembers(mb.members);
    } catch {
      /* ignore */
    }
  }, [group.id, group.isOwner]);

  useEffect(() => {
    void loadOwnerData();
  }, [loadOwnerData]);

  async function decide(userId: string, approve: boolean) {
    setBusy(true);
    try {
      const res = await apiDecideJoin({
        data: { workspaceId: group.id, targetUserId: userId, approve },
      });
      if (res.ok) {
        toast.success(approve ? "Membre validé." : "Demande refusée.");
        await loadOwnerData();
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
        await loadOwnerData();
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
        <>
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-medium tracking-wide text-accent">
              Demandes en attente ({requests.length})
            </p>
            {requests.length === 0 ? (
              <p className="text-sm text-muted">Aucune demande.</p>
            ) : (
              <ul className="space-y-2">
                {requests.map((r) => (
                  <li
                    key={r.user_id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 p-2"
                  >
                    <span className="text-sm">
                      <span className="font-medium">{r.name || "—"}</span>
                      <span className="text-muted"> · {r.email}</span>
                    </span>
                    <span className="flex gap-2">
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

          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-medium tracking-wide text-accent">
              Membres ({members.length})
            </p>
            <ul className="space-y-1.5">
              {members.map((m) => (
                <li
                  key={m.userId}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <span className="text-sm">
                    <span className="font-medium">{m.name || "—"}</span>
                    <span className="text-muted">
                      {" · "}
                      {m.email}
                      {m.role === "owner" ? " · propriétaire" : ""}
                    </span>
                  </span>
                  {m.role !== "owner" && !m.isSelf ? (
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
        </>
      ) : (
        <p className="border-t border-border pt-3 text-sm text-muted">
          Vous êtes membre de ce groupe.
        </p>
      )}

      <p className="text-xs text-subtle">
        Partage des dossiers du groupe entre membres validés : prochaine mise à jour.
      </p>
    </Card>
  );
}
