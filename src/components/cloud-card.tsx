import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Cloud, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  accountUpsert,
  buildSnapshot,
  probeCloud,
  pullSnapshot,
  pushSnapshot,
  shouldSyncWorkspace,
  type CloudStatus,
} from "@/lib/cloud-sync";
import { SUPABASE_ACCOUNTS_SQL, SUPABASE_SCHEMA_SQL } from "@/lib/supabase-schema";
import { supabaseConfigured, supabaseSqlEditorUrl } from "@/lib/supabase";
import { selectWorkspace, useSipr } from "@/lib/store";
import { DEMO_WORKSPACE_ID } from "@/lib/workspace";

type UiStatus = CloudStatus | "checking";

export function CloudCard() {
  const workspace = useSipr(selectWorkspace);
  const [status, setStatus] = useState<UiStatus>(supabaseConfigured ? "checking" : "off");
  const [accounts, setAccounts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sqlOpen, setSqlOpen] = useState(false);
  const wasSetup = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const script = accounts ? SUPABASE_SCHEMA_SQL : SUPABASE_ACCOUNTS_SQL;

  async function refreshStatus() {
    const probe = await probeCloud();
    setStatus(probe.status);
    setAccounts(probe.accounts);
    return probe.status;
  }

  useEffect(() => {
    void refreshStatus();
  }, []);

  useEffect(() => {
    function onNeedSql() {
      setSqlOpen(true);
      void copySql();
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    window.addEventListener("sipr-need-sql", onNeedSql);
    return () => window.removeEventListener("sipr-need-sql", onNeedSql);
  }, [accounts]);

  useEffect(() => {
    if (status === "setup") wasSetup.current = true;
    if (status !== "setup") return;
    const id = window.setInterval(() => {
      void (async () => {
        const next = await refreshStatus();
        if (next === "ok" && wasSetup.current) {
          toast.success("Connexion cloud prête — même e-mail sur PC et smartphone.");
        }
      })();
    }, 4000);
    return () => window.clearInterval(id);
  }, [status]);

  async function copySql() {
    await navigator.clipboard.writeText(script);
    toast.success("Script copié. Collez-le dans l'éditeur SQL, puis Run.");
  }

  async function openEditor() {
    await copySql();
    window.open(supabaseSqlEditorUrl, "_blank", "noopener,noreferrer");
  }

  async function syncNow() {
    if (!shouldSyncWorkspace(workspace) || !workspace) {
      toast.message("Créez un espace (hors démo) pour activer la copie cloud.");
      return;
    }
    setBusy(true);
    try {
      const st = await refreshStatus();
      if (st === "setup") {
        toast.message("Il reste à coller le script SQL une fois (bouton ci-dessous).");
        setSqlOpen(true);
        return;
      }
      if (st !== "ok") {
        toast.error("Copie cloud indisponible pour le moment.");
        return;
      }
      const pulled = await pullSnapshot(workspace.code);
      if (pulled.ok) useSipr.getState().applyCloudSnapshot(pulled.snapshot);
      const s = useSipr.getState();
      const snap = buildSnapshot({
        workspace,
        visits: s.visits,
        anomalies: s.anomalies,
        fds: s.fds,
        rps: s.rps,
        pgp: s.pgp,
        users: s.users,
        deleted: s.deleted,
      });
      const pushed = await pushSnapshot(workspace.code, workspace.id, snap);
      if (!pushed.ok) {
        toast.error(pushed.error || "Envoi cloud impossible.");
        return;
      }
      const session = s.users.find((u) => u.id === s.sessionUserId);
      if (session) await accountUpsert(session, workspace.code);
      toast.success("Copie cloud à jour — ce compte ouvre les mêmes dossiers sur un autre appareil.");
    } finally {
      setBusy(false);
    }
  }

  if (!supabaseConfigured) return null;

  const ready = status === "ok";
  const demo = workspace?.id === DEMO_WORKSPACE_ID;

  return (
    <Card ref={cardRef} id="copie-cloud" className="space-y-3 scroll-mt-20">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-dim text-accent">
          {ready ? <CheckCircle2 className="size-5" /> : <Cloud className="size-5" />}
        </span>
        <div className="min-w-0">
          <h2 className="font-display font-semibold">Copie cloud</h2>
          <p className="text-sm text-muted">
            {status === "checking"
              ? "Vérification du projet Supabase…"
              : status === "error"
                ? "Le projet répond, mais la copie n'est pas joignable pour le moment."
                : status === "setup"
                  ? "La copie des dossiers existe déjà. Il reste à activer la connexion par e-mail (PC et smartphone) : coller le script une fois, puis Run."
                  : demo
                    ? "L'espace démo reste local. Un compte entreprise ou indépendant active la copie."
                    : "Visites, constats, FDS et PGP de cet espace sont copiés dès qu'il y a du réseau."}
          </p>
        </div>
      </div>

      {status === "setup" ? (
        <>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
            <li>Le bouton copie le script et ouvre l'éditeur SQL.</li>
            <li>Collez (Ctrl+V / coller), puis Run.</li>
            <li>Revenez ici : la connexion e-mail s'active toute seule.</li>
          </ol>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" className="min-h-11 flex-1" onClick={() => void openEditor()}>
              <ExternalLink />
              Copier le SQL et ouvrir l'éditeur
            </Button>
            <Button type="button" variant="secondary" className="min-h-11 flex-1" disabled={busy} onClick={() => void refreshStatus()}>
              J'ai exécuté le SQL
            </Button>
          </div>
          <button
            type="button"
            className="text-left text-sm text-accent"
            onClick={() => {
              setSqlOpen((v) => !v);
              if (!sqlOpen) void copySql();
            }}
          >
            {sqlOpen ? "Masquer le script" : "Afficher / recopier le script"}
          </button>
          {sqlOpen ? (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-surface-2 p-3 font-mono text-xs text-muted">
              {script}
            </pre>
          ) : null}
        </>
      ) : status === "checking" ? (
        <p className="text-sm text-subtle">Connexion au projet en cours.</p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void syncNow()}>
            {busy ? "Synchronisation…" : "Synchroniser maintenant"}
          </Button>
          {ready && !demo ? (
            <p className="self-center text-sm text-ok">Copie active</p>
          ) : null}
        </div>
      )}
      {status === "ok" ? (
        <button
          type="button"
          className="text-left text-sm text-accent"
          onClick={() => {
            setSqlOpen((v) => !v);
            if (!sqlOpen) void copySql();
          }}
        >
          {sqlOpen ? "Masquer le script SQL" : "Mettre à jour le script (connexion e-mail)"}
        </button>
      ) : null}
      {status === "ok" && sqlOpen ? (
        <>
          <p className="text-sm text-muted">
            Collez ce script une fois dans l'éditeur SQL, puis Run — même si la copie est déjà active.
          </p>
          <Button type="button" className="w-full" onClick={() => void openEditor()}>
            <ExternalLink />
            Copier et ouvrir l'éditeur
          </Button>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-surface-2 p-3 font-mono text-xs text-muted">
            {script}
          </pre>
        </>
      ) : null}
    </Card>
  );
}
