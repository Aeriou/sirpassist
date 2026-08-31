import { useEffect, useRef, useState } from "react";
import {
  accountUpsert,
  buildSnapshot,
  probeCloud,
  pullSnapshot,
  pushSnapshot,
  shouldSyncWorkspace,
} from "@/lib/cloud-sync";
import { useOnline } from "@/lib/online";
import { selectWorkspace, useSipr } from "@/lib/store";

export function CloudSyncHost() {
  const online = useOnline();
  const workspace = useSipr(selectWorkspace);
  const [hydrated, setHydrated] = useState(() => useSipr.persist.hasHydrated());
  const timer = useRef<number>(0);
  const lastPush = useRef("");

  useEffect(() => {
    const unsub = useSipr.persist.onFinishHydration(() => setHydrated(true));
    if (useSipr.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);

  useEffect(() => {
    if (!hydrated || !online || !shouldSyncWorkspace(workspace)) return;
    let cancelled = false;
    void (async () => {
      const probe = await probeCloud();
      if (cancelled || probe.status !== "ok" || !workspace) return;
      const pulled = await pullSnapshot(workspace.code);
      if (cancelled || !pulled.ok) return;
      useSipr.getState().applyCloudSnapshot(pulled.snapshot);
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, online, workspace?.id, workspace?.code]);

  useEffect(() => {
    if (!hydrated || !online) return;
    const unsub = useSipr.subscribe((state) => {
      const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
      if (!shouldSyncWorkspace(ws)) return;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        const s = useSipr.getState();
        const active = s.workspaces.find((w) => w.id === s.activeWorkspaceId);
        if (!shouldSyncWorkspace(active) || !active) return;
        const snap = buildSnapshot({
          workspace: active,
          visits: s.visits,
          anomalies: s.anomalies,
          fds: s.fds,
          rps: s.rps,
          pgp: s.pgp,
          users: s.users,
          deleted: s.deleted,
        });
        const key = `${active.id}:${snap.visits.length}:${snap.anomalies.length}:${snap.fds.length}:${snap.rps.length}:${snap.pgp.lines.length}:${snap.deleted?.visits.length ?? 0}:${snap.deleted?.anomalies.length ?? 0}:${snap.deleted?.fds.length ?? 0}:${snap.deleted?.rps.length ?? 0}`;
        if (key === lastPush.current) return;
        lastPush.current = key;
        void pushSnapshot(active.code, active.id, snap).then(() => {
          const session = s.users.find((u) => u.id === s.sessionUserId);
          if (session && !session.email.includes("@demo")) {
            void accountUpsert(session, active.code);
          }
        });
      }, 2800);
    });
    return () => {
      unsub();
      window.clearTimeout(timer.current);
    };
  }, [hydrated, online]);

  return null;
}
