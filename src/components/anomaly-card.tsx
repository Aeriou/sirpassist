import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import type { Anomaly } from "@/lib/types";
import { Photo } from "./photo";
import { RiskBadge, StatusBadge, ThemeChip } from "./risk-badge";

export function AnomalyCard({ anomaly }: { anomaly: Anomaly }) {
  return (
    <Link
      to="/anomalie/$id"
      params={{ id: anomaly.id }}
      className="block overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-border)] transition-[box-shadow] duration-150 hover:shadow-[var(--shadow-border-hover)]"
    >
      <Photo
        dataUrl={anomaly.photo}
        assetId={anomaly.photoAssetId}
        className="h-36 w-full object-cover"
      />
      <div className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <RiskBadge level={anomaly.kinney.level} score={anomaly.kinney.score} />
          <StatusBadge status={anomaly.status} />
          <ThemeChip id={anomaly.theme} />
        </div>
        <h3 className="font-display text-base font-semibold leading-snug">{anomaly.title}</h3>
        <p className="flex min-w-0 items-center gap-1 text-xs text-muted">
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate">{anomaly.location}</span>
        </p>
        {anomaly.author ? (
          <p className="text-xs text-subtle">
            CP · {anomaly.author.name} · N{anomaly.author.level}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
