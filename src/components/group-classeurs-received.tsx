import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { FolderOpen, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Photo } from "@/components/photo";
import { RiskBadge } from "@/components/risk-badge";
import { apiListWorkspaces } from "@/lib/workspace-api";
import { apiListGroupClasseurs, type SharedClasseurView } from "@/lib/group-classeur-api";
import { isGroupClasseurPayload } from "@/lib/group-classeur-payload";
import { formatShortDate, formatStamp } from "@/lib/format";
import { visitLabel } from "@/lib/workspace";
import type { Anomaly } from "@/lib/types";

type Group = { id: string; name: string };

function stamp(iso: string): string {
  try {
    return formatStamp(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Section « Classeurs reçus du groupe » — lecture seule. Se recharge seule
 * (30 s). Utilisée sur /partages, /groupe et /classeurs-partages.
 */
export function GroupClasseursReceived() {
  const [rows, setRows] = useState<{ group: Group; items: SharedClasseurView[] }[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const ws = await apiListWorkspaces();
      if (!ws.ok) return;
      const groups = ws.workspaces
        .filter((w) => w.status === "active")
        .map((w) => ({ id: w.id, name: w.name }));
      const out = await Promise.all(
        groups.map(async (g) => {
          const r = await apiListGroupClasseurs({ data: { workspaceId: g.id } });
          return { group: g, items: r.ok ? r.classeurs : [] };
        }),
      );
      setRows(out.filter((x) => x.items.length > 0));
    } catch {
      /* réseau : on retentera */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(t);
  }, [refresh]);

  const total = rows.reduce((n, r) => n + r.items.length, 0);

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <Layers className="size-4 text-accent" />
        Classeurs reçus du groupe{total > 0 ? ` (${total})` : ""}
      </h2>
      {loading ? (
        <p className="text-sm text-muted">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted shadow-[var(--shadow-border)]">
          Aucun classeur mis en commun dans vos groupes. Un membre en partage un depuis la fiche
          du classeur (ou la page{" "}
          <Link to="/groupe" className="text-accent">
            Groupe
          </Link>
          ).
        </p>
      ) : (
        rows.map(({ group, items }) => (
          <div key={group.id} className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-subtle">{group.name}</p>
            {items.map((it) => (
              <SharedClasseurCard key={`${group.id}:${it.classeurId}`} row={it} />
            ))}
          </div>
        ))
      )}
    </section>
  );
}

function ConstatRow({ a }: { a: Anomaly }) {
  return (
    <li className="flex items-start gap-2 rounded-lg bg-surface-2 px-2 py-1.5 text-sm">
      {a.photo ? (
        <Photo dataUrl={a.photo} className="size-12 shrink-0 rounded-md object-cover" />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{a.title}</span>
        {a.description ? (
          <span className="line-clamp-2 text-xs text-muted">{a.description}</span>
        ) : null}
      </span>
      {a.kinney?.level ? <RiskBadge level={a.kinney.level} /> : null}
    </li>
  );
}

function SharedClasseurCard({ row }: { row: SharedClasseurView }) {
  const [open, setOpen] = useState(false);
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(row.payloadJson);
  } catch {
    parsed = null;
  }
  const payload = isGroupClasseurPayload(parsed) ? parsed : null;

  return (
    <Card className="space-y-2 p-3">
      <button
        type="button"
        className="flex w-full items-center gap-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-dim text-accent">
          <FolderOpen className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display font-semibold">{row.name || "Classeur"}</span>
          <span className="block text-xs text-subtle">
            Partagé par {row.sharedByMe ? "vous" : row.sharedByName || "un membre"} · maj{" "}
            {stamp(row.updatedAt)}
          </span>
        </span>
        <Badge tone="neutral">
          {payload ? `${payload.visits.length} visite${payload.visits.length > 1 ? "s" : ""}` : "—"}
        </Badge>
      </button>

      {open && payload ? (
        <div className="space-y-3 border-t border-border pt-3">
          {payload.note ? <p className="text-sm text-muted">{payload.note}</p> : null}
          {payload.visits.map((v) => {
            const constats = payload.anomalies.filter((a) => a.visitId === v.id);
            return (
              <div key={v.id} className="space-y-1">
                <div className="flex items-center gap-2">
                  {v.coverPhoto ? (
                    <Photo
                      dataUrl={v.coverPhoto}
                      className="size-10 shrink-0 rounded-lg object-cover"
                    />
                  ) : null}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{visitLabel(v)}</p>
                    <p className="truncate text-xs text-subtle">
                      {v.site || "Adresse non précisée"} · {formatShortDate(v.date)}
                    </p>
                  </div>
                </div>
                {constats.length > 0 ? (
                  <ul className="mt-1 space-y-1">
                    {constats.map((a) => (
                      <ConstatRow key={a.id} a={a} />
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
          {(() => {
            const loose = payload.anomalies.filter(
              (a) => !payload.visits.some((v) => v.id === a.visitId),
            );
            if (loose.length === 0) return null;
            return (
              <div className="space-y-1">
                <p className="text-sm font-medium">Constats isolés</p>
                <ul className="space-y-1">
                  {loose.map((a) => (
                    <ConstatRow key={a.id} a={a} />
                  ))}
                </ul>
              </div>
            );
          })()}
        </div>
      ) : null}
    </Card>
  );
}
