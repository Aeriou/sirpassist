import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { RPS_ATTENTION_META, RPS_STATUS_LABEL } from "@/lib/rps";
import type { RpsSituation } from "@/lib/types";

export function RpsCard({ situation, visitName }: { situation: RpsSituation; visitName?: string }) {
  const meta = RPS_ATTENTION_META[situation.attention];
  return (
    <Link
      to="/rps/$id"
      params={{ id: situation.id }}
      className="block space-y-3 rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)]"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={meta.tone === "crit" ? "crit" : meta.tone === "high" ? "high" : meta.tone === "mid" ? "mid" : "low"}>
          {meta.label}
        </Badge>
        <Badge tone="neutral">{RPS_STATUS_LABEL[situation.status]}</Badge>
      </div>
      <h3 className="font-display font-semibold">{situation.title}</h3>
      <p className="truncate text-sm text-muted">{situation.unit}</p>
      {visitName ? <Badge tone="accent">{visitName}</Badge> : null}
    </Link>
  );
}
